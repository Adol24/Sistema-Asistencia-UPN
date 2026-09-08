-- =============================================================================
-- 1300 · El portal público
--
-- El participante no es un usuario de `auth`: entra con folio y matrícula, sin
-- contraseña. Eso significa que **no puede tener acceso directo a las tablas**:
-- con RLS por sesión no hay sesión que filtrar.
--
-- La salida es que todo lo público pase por funciones SECURITY DEFINER que
-- reciben la credencial, la comprueban y devuelven solo lo de esa persona. Sin
-- esto, o el portal no funciona o el anónimo puede leer el padrón entero.
-- =============================================================================

-- Comprueba la credencial del portal: folio más matrícula, o folio más correo.
-- Devuelve el id solo si coinciden.
create or replace function fn_autenticar_portal(p_folio text, p_credencial text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from participantes
   where folio = upper(trim(p_folio))
     and (
       matricula = trim(p_credencial)
       or lower(correo) = lower(trim(p_credencial))
     );
$$;

comment on function fn_autenticar_portal is
  'Folio más matrícula o correo. Es la única puerta del participante a sus datos.';

-- Todo lo que el portal muestra, en una sola llamada. Devolver un JSON y no una
-- tabla evita que la interfaz tenga que encadenar consultas contra tablas a las
-- que no puede llegar.
create or replace function fn_portal_estado(p_folio text, p_credencial text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_resultado jsonb;
begin
  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos'
      using errcode = 'invalid_password';
  end if;

  select jsonb_build_object(
    'participante', to_jsonb(vp) - 'correo' - 'celular',
    'contacto', jsonb_build_object('correo', vp.correo, 'celular', vp.celular),
    'elegibilidad', to_jsonb(ve),
    'asistencias', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'dia', a.dia, 'tipo', a.tipo, 'hora', a.registrada_en)
              order by a.registrada_en)
         from asistencias a
        where a.participante_id = v_id and a.anulada_en is null), '[]'::jsonb),
    'evidencias', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'dia', e.dia, 'estado', e.estado, 'subida_en', e.subida_en,
                'motivo_rechazo', (
                  select r.motivo_rechazo from revisiones r
                   where r.evidencia_id = e.id
                   order by r.revisado_en desc limit 1))
              order by e.dia)
         from evidencias e
        where e.participante_id = v_id), '[]'::jsonb),
    'avisos', coalesce(
      (select jsonb_agg(jsonb_build_object('id', av.id, 'texto', av.texto)
              order by av.creado_en)
         from avisos_participante av
        where av.participante_id = v_id and av.visto_en is null), '[]'::jsonb)
  )
  into v_resultado
  from v_participantes vp
  join v_elegibles ve on ve.participante_id = vp.id
  where vp.id = v_id;

  return v_resultado;
end;
$$;

-- Busca a alguien en el padrón para el pre-registro. Devuelve solo lo que la
-- pantalla necesita mostrar: nunca el padrón completo, y nunca por nombre —si se
-- pudiera buscar por nombre, cualquiera podría recorrer la lista de alumnos.
create or replace function fn_buscar_en_padron(p_matricula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
           'matricula', a.matricula,
           'nombre', a.nombre,
           'nivel', n.nivel,
           'programa', pr.nombre,
           'avance', a.avance,
           'etiqueta_avance', n.etiqueta_avance,
           'grupo', a.grupo,
           'plantel', pl.nombre,
           'ya_registrado', exists (
             select 1 from participantes p where p.matricula = a.matricula
           )
         )
    into v
    from padron_alumnos a
    join niveles_academicos n on n.id = a.nivel_id
    join programas pr on pr.id = a.programa_id
    join planteles pl on pl.id = a.plantel_id
   where a.matricula = trim(p_matricula);

  return v;
end;
$$;

comment on function fn_buscar_en_padron is
  'Solo por matrícula exacta. Buscar por nombre permitiría recorrer el padrón entero.';

-- Cierra el pre-registro de un alumno: toma del padrón lo académico, le asigna
-- día si no lo tenía y crea su participante. En una sola transacción, para que
-- no queden registros a medias si algo falla.
create or replace function fn_preregistrar_alumno(
  p_matricula text,
  p_correo text,
  p_celular text,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
  v_cfg record;
  v_dia smallint;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
begin
  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en el padrón' using errcode = 'no_data_found';
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- El dominio institucional es configuración: vacío acepta cualquier correo,
  -- porque hay universidades que no dan cuenta a todos.
  if v_cfg.dominio_institucional is not null
     and lower(trim(p_correo)) not like '%@' || lower(v_cfg.dominio_institucional) then
    raise exception 'Usa tu correo institucional, el que termina en @%',
      v_cfg.dominio_institucional using errcode = 'check_violation';
  end if;

  v_dia := fn_dia_de(v_a.matricula);

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
  end if;

  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller
  )
  values (
    'alumno', v_a.matricula, v_a.nombre, lower(trim(p_correo)), p_celular,
    'Universidad Autónoma',
    v_a.nivel_id, v_a.programa_id, v_a.avance, v_a.grupo, v_a.plantel_id,
    v_dia, p_taller, v_cfg.cuota_evento, v_costo
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Pre-registró a un alumno',
          format('%s · %s · día %s', v_folio, v_a.matricula, v_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', v_dia);
end;
$$;
