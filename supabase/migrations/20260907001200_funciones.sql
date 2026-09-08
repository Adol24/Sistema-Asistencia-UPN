-- =============================================================================
-- 1200 · Reglas de negocio
--
-- Las que no pueden vivir solo en el navegador: dos ventanillas capturando a la
-- vez, un escáner sin señal que sincroniza tarde, un reparto que tiene que
-- quedar parejo. Todo eso se decide aquí, donde hay una sola verdad.
-- =============================================================================

-- ---------------------------------------------------- reparto de los días ---

-- El día que va más vacío. Con tres sedes de aforo parecido, lo que importa es
-- que ninguna se llene mientras otra queda a medias.
create or replace function fn_dia_mas_vacio()
returns smallint
language sql
stable
as $$
  select d.dia
    from dias_evento d
    left join padron_alumnos a on a.dia = d.dia
   group by d.dia
   order by count(a.matricula), d.dia
   limit 1;
$$;

-- Mueve a alguien de día con todo lo que eso arrastra: su sede cambia sola
-- porque no está guardada, y su inscripción al taller se libera si ese taller no
-- se imparte el día nuevo. Mantenerla rompería la llave foránea compuesta y lo
-- dejaría con un pago sin a qué corresponder.
create or replace function fn_reasignar_dia(p_matricula text, p_dia smallint)
returns table (taller_liberado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participante uuid;
  v_taller_actual uuid;
  v_clave text;
  v_se_imparte boolean;
begin
  update padron_alumnos set dia = p_dia where matricula = p_matricula;

  select id, taller_id into v_participante, v_taller_actual
    from participantes where matricula = p_matricula;

  if v_participante is null then
    return;
  end if;

  if v_taller_actual is not null then
    select exists (
      select 1 from taller_dias
       where taller_id = v_taller_actual and dia = p_dia
    ) into v_se_imparte;
  end if;

  if v_taller_actual is not null and not v_se_imparte then
    select clave into v_clave from talleres where id = v_taller_actual;

    update participantes
       set dia = p_dia,
           taller_id = null,
           monto_esperado_taller = null
     where id = v_participante;

    insert into avisos_participante (participante_id, texto)
    values (
      v_participante,
      format(
        'Cambiaste al día %s y el taller «%s» no se imparte ese día, así que tu inscripción se liberó. Puedes elegir otro taller; si ya lo habías pagado, acude a Servicios Financieros.',
        p_dia, v_clave
      )
    );

    taller_liberado := v_clave;
    return next;
  else
    update participantes set dia = p_dia where id = v_participante;
  end if;
end;
$$;

-- Reparte día a quien no lo tiene, uno por uno y siempre al más vacío.
create or replace function fn_repartir_dias_pendientes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matricula text;
  v_dia smallint;
  v_total integer := 0;
begin
  for v_matricula in
    select matricula from padron_alumnos where dia is null order by matricula
  loop
    v_dia := fn_dia_mas_vacio();
    perform fn_reasignar_dia(v_matricula, v_dia);
    v_total := v_total + 1;
  end loop;

  if v_total > 0 then
    insert into bitacora (usuario_id, accion, detalle)
    values (
      auth.uid(),
      'Repartió los días del padrón',
      format('%s alumnos sin día quedaron repartidos', v_total)
    );
  end if;

  return v_total;
end;
$$;

-- El día de alguien. Si la organización todavía no lo repartió, se le asigna en
-- ese momento: nadie debería quedarse sin pre-registrarse porque una tarea
-- interna esté pendiente.
create or replace function fn_dia_de(p_matricula text)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia smallint;
begin
  select dia into v_dia from padron_alumnos where matricula = p_matricula;
  if v_dia is not null then
    return v_dia;
  end if;

  v_dia := fn_dia_mas_vacio();
  update padron_alumnos set dia = v_dia where matricula = p_matricula;
  return v_dia;
end;
$$;

-- ------------------------------------------------------------ el escáner ---

-- Qué color ve el capturista. Se decide aquí y no en el teléfono porque el
-- teléfono puede tener datos viejos, y dejar pasar a quien no pagó por una
-- caché desactualizada es el error caro.
create or replace function fn_evaluar_escaneo(
  p_entrada text,
  p_dia smallint,
  p_tipo tipo_asistencia
)
returns table (
  color semaforo,
  titulo text,
  detalle text,
  participante_id uuid,
  autorizable boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p record;
  v_estado estado_pago;
  v_ultima timestamptz;
begin
  select * into v_p
    from participantes
   where folio = upper(trim(p_entrada)) or matricula = trim(p_entrada);

  if v_p is null then
    return query select 'rojo'::semaforo, 'NO ENCONTRADO',
      'Ese folio o matrícula no existe. Pasar a mesa de incidencias.',
      null::uuid, false;
    return;
  end if;

  if v_p.dia <> p_dia then
    return query select 'rojo'::semaforo, 'DÍA EQUIVOCADO',
      format('Le toca el día %s. Pasar a mesa de incidencias.', v_p.dia),
      v_p.id, true;
    return;
  end if;

  select estado into v_estado
    from v_estado_pago
   where participante_id = v_p.id and concepto = 'evento';

  if v_estado <> 'pagado' and v_estado <> 'discrepancia' then
    return query select 'rojo'::semaforo, 'SIN PAGO REGISTRADO',
      'Pasar a mesa de incidencias.', v_p.id, true;
    return;
  end if;

  -- Reingreso dentro de la ventana de cortesía: no genera registro nuevo. Sin
  -- esta regla, quien sale al baño acaba con cuatro entradas y el cálculo de
  -- permanencia deja de servir.
  select max(registrada_en) into v_ultima
    from asistencias
   where participante_id = v_p.id and dia = p_dia and tipo = p_tipo
     and anulada_en is null;

  if v_ultima is not null and now() - v_ultima < interval '15 minutes' then
    return query select 'amarillo'::semaforo, 'REINGRESO',
      'Ya se registró hace menos de 15 minutos. No se duplica.', v_p.id, false;
    return;
  end if;

  if v_estado = 'discrepancia' then
    return query select 'amarillo'::semaforo, 'PASA CON DISCREPANCIA',
      'Su pago no cuadra. Puede entrar; avísale que pase a ventanilla.',
      v_p.id, false;
    return;
  end if;

  return query select 'verde'::semaforo,
    case when p_tipo = 'entrada' then 'ENTRADA REGISTRADA' else 'SALIDA REGISTRADA' end,
    v_p.nombre, v_p.id, false;
end;
$$;

-- Cierra el día: a quien tiene entrada y no salida se le pone una salida al
-- final del horario. Sin esto se quedan sin constancia por un trámite que nadie
-- hizo, no por no haber asistido.
create or replace function fn_cierre_automatico(p_dia smallint, p_hora timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  with pendientes as (
    select p.id
      from participantes p
     where p.dia = p_dia
       and exists (
         select 1 from asistencias a
          where a.participante_id = p.id and a.dia = p_dia
            and a.tipo = 'entrada' and a.anulada_en is null
       )
       and not exists (
         select 1 from asistencias a
          where a.participante_id = p.id and a.dia = p_dia
            and a.tipo = 'salida' and a.anulada_en is null
       )
  )
  insert into asistencias (participante_id, dia, tipo, registrada_en, punto, capturista_id)
  select id, p_dia, 'salida', p_hora, 'Cierre automático', null
    from pendientes;

  get diagnostics v_total = row_count;

  if v_total > 0 then
    insert into bitacora (usuario_id, usuario_texto, accion, detalle)
    values (
      auth.uid(), 'Cierre automático', 'Cerró el día',
      format('Día %s: %s salidas generadas', p_dia, v_total)
    );
  end if;

  return v_total;
end;
$$;

-- ------------------------------------------------------- caso de nombre ---
-- Abre el caso con la corrección que dio el propio alumno. Antes, marcar «mi
-- nombre aparece incorrecto» solo dejaba una marca y nada llegaba a soporte.
create or replace function fn_abrir_caso_nombre(
  p_participante uuid,
  p_nombre_correcto text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_clave text;
begin
  select nombre into v_nombre from participantes where id = p_participante;
  if v_nombre is null then
    raise exception 'No existe ese participante' using errcode = 'no_data_found';
  end if;

  insert into casos_soporte (participante_id, asunto, detalle, canal)
  values (
    p_participante,
    'Nombre incorrecto en el registro',
    format('Dice "%s" y debe decir "%s". Lo reportó el alumno al confirmar su nombre.',
           v_nombre, p_nombre_correcto),
    'portal'
  )
  returning clave into v_clave;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Abrió un caso de nombre',
          format('%s · %s → %s', v_clave, v_nombre, p_nombre_correcto));

  return v_clave;
end;
$$;
