-- =============================================================================
-- El aviso de privacidad no se le enseñaba a nadie
--
-- Qué pasaba
-- ----------
-- `configuracion_evento.aviso_privacidad` existe desde la primera migración, es
-- `not null`, y se edita desde `/admin/configuracion`. Dice lo que tiene que
-- decir: que los datos se usan solo para el registro, la asistencia y la
-- constancia, que no se comparten con terceros, y a quién escribir para
-- corregirlos o darse de baja.
--
-- Y no salía en ninguna pantalla pública. Se pedían correo y celular a cientos
-- de personas sin decirles para qué, con el texto que se lo explicaba guardado
-- en la misma base.
--
-- Qué cambia aquí
-- ---------------
-- El aviso se acepta al capturar los datos —que es antes de recogerlos, no
-- después— y queda constancia de cuándo. Una casilla que solo bloquea un botón
-- no es una constancia: se borra al recargar y no queda nada que enseñar si
-- alguien pregunta.
--
-- La columna es NULA para quien se pre-registró antes de hoy, y así se queda.
-- Ponerle `now()` a esas filas las marcaría como si hubieran aceptado algo que
-- nunca vieron, que es exactamente el dato que no quieres tener el día que te
-- lo reclamen.
--
-- La trampa de MIGRACIONES.md, que aquí aplica entera
-- ---------------------------------------------------
-- Las dos altas ganan un parámetro, así que para PostgreSQL son funciones
-- NUEVAS: `create or replace` no reemplaza nada, crea una sobrecarga al lado.
-- Eso dejaría lo viejo vivo y todavía concedido a `anon` —o sea, un alta que se
-- salta el consentimiento— y lo nuevo con las concesiones por defecto. Por eso
-- lo de abajo: primero se tiran las firmas viejas por nombre recorriendo
-- `pg_proc`, y después se conceden las nuevas a mano.
-- =============================================================================

alter table participantes
  add column if not exists acepto_aviso_en timestamptz;

comment on column participantes.acepto_aviso_en is
  'Cuándo aceptó el aviso de privacidad. NULO en quien se pre-registró antes de '
  'que el aviso se enseñara: es un dato que no tenemos, no un cero.';

-- ---------------------------------------------------------------------------
-- Fuera las firmas viejas, las dos.
--
-- Por nombre y recorriendo `pg_proc` en vez de escribir los tipos a mano:
-- repetirlos es justo donde se cuela el error, y una letra de más deja la
-- función vieja en pie, abierta a `anon` y sin pedir el consentimiento.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo')
  loop
    execute format('drop function %s', r.firma);
    raise notice 'Retirada la firma vieja: %', r.firma;
  end loop;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- El alumno
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_alumno(
  p_matricula text,
  p_correo text,
  p_celular text,
  -- Sin valor por defecto a propósito. Con `default false` una llamada vieja
  -- seguiría compilando y crearía el registro sin consentimiento, en silencio.
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_a record;
  v_cfg record;
  v_dia smallint;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_dominio text;
  v_ya record;
begin
  -- Se comprueba aquí y no solo en la pantalla. La casilla gobierna un botón;
  -- esto gobierna la fila. Sin las dos, la constancia no prueba nada.
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en nuestros registros'
      using errcode = 'no_data_found';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    -- `coalesce` y no `now()`: vale la PRIMERA aceptación. Volver atrás para
    -- cambiar de taller no vuelve a otorgar nada. Y si venía nula —porque se
    -- registró antes de que el aviso existiera— esta es la primera de verdad.
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- Sin dominio configurado —NULL o en blanco— se acepta cualquier correo,
  -- porque hay universidades que no dan cuenta institucional a todos.
  v_dominio := nullif(trim(coalesce(v_cfg.dominio_institucional, '')), '');
  if v_dominio is not null
     and lower(trim(p_correo)) not like '%@' || lower(v_dominio) then
    raise exception 'Usa tu correo institucional, el que termina en @%', v_dominio
      using errcode = 'check_violation';
  end if;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
  end if;

  if v_a.dia is not null then
    v_dia := v_a.dia;
    if p_taller is not null
       and not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_dia) then
      raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_dia
        using errcode = 'check_violation';
    end if;
  elsif p_taller is not null then
    -- Sin día repartido y con taller elegido: el día más vacío DE ESE TALLER.
    select td.dia into v_dia
      from taller_dias td
      left join padron_alumnos a on a.dia = td.dia
     where td.taller_id = p_taller
     group by td.dia
     order by count(a.matricula), td.dia
     limit 1;
    if v_dia is null then
      raise exception 'Ese taller no tiene días asignados' using errcode = 'no_data_found';
    end if;
    update padron_alumnos set dia = v_dia where matricula = v_a.matricula;
  else
    v_dia := fn_dia_de(v_a.matricula);
  end if;

  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller,
    acepto_aviso_en
  )
  values (
    'alumno', v_a.matricula, v_a.nombre, lower(trim(p_correo)), p_celular,
    'Universidad Autónoma',
    v_a.nivel_id, v_a.programa_id, v_a.avance, v_a.grupo, v_a.plantel_id,
    v_dia, p_taller, v_cfg.cuota_evento, v_costo,
    now()
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Pre-registró a un alumno',
          format('%s · %s · día %s', v_folio, v_a.matricula, v_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', v_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- El docente y el externo
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
  v_correo text;
  v_ya record;
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;
  v_correo := lower(trim(p_correo));

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_institucion), '') = '' then
    raise exception 'Falta la institución' using errcode = 'check_violation';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  -- `order by creado_en` importa: un fallo anterior ya pudo dejar duplicados, y
  -- ante varios se elige el PRIMERO, que es el folio que esa persona llegó a ver.
  select id, folio, dia into v_ya
    from participantes
   where correo = v_correo and perfil = v_perfil
   order by creado_en
   limit 1;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
    if not exists (select 1 from taller_dias where taller_id = p_taller and dia = p_dia) then
      raise exception 'Ese taller no se imparte el día %', p_dia
        using errcode = 'check_violation';
    end if;
  end if;

  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller,
    acepto_aviso_en
  )
  values (
    v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
    trim(p_institucion),
    null, null, null, null, null,
    p_dia, p_taller, v_cfg.cuota_evento, v_costo,
    now()
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona)',
                 v_folio, upper(trim(p_nombre)), p_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Concesiones: a mano, y revocando de `public` Y de `anon`.
--
-- Nacieron hace un momento, así que traen las de por defecto y no las de sus
-- antecesoras. Y `revoke ... from public` no le quita nada a `anon`, que en
-- Supabase es un rol con nombre propio y concesión propia.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
    raise notice 'Concedida solo a anon y authenticated: %', r.firma;
  end loop;
end;
$bloque$;

-- Debe quedar exactamente una de cada. Si salen más, quedó viva una sobrecarga
-- vieja y el pre-registro se podría hacer sin aceptar nada.
do $bloque$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo');
  if v_n <> 2 then
    raise exception 'Se esperaban 2 funciones de alta y hay %. Quedó una firma vieja viva.', v_n;
  end if;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- Que se pueda ver, porque si no la constancia no sirve de nada
--
-- Guardar la fecha y no enseñarla en ninguna parte deja el mismo problema que
-- había con el texto del aviso: el dato existe, en la misma base, y nadie
-- puede llegar a él. Se añade al final de `v_participantes` —al final y no en
-- medio, que es lo único que `create or replace view` acepta sin tirar la
-- vista— y de ahí sale al reporte de participantes.
--
-- `security_invoker` se repite a propósito. Lo puso `20260910100000`, y
-- reemplazar una vista sin declararlo puede devolverla a ejecutarse con los
-- permisos de quien la creó, que es justo lo que aquella migración vino a
-- corregir.
-- ---------------------------------------------------------------------------
create or replace view v_participantes
with (security_invoker = true) as
select
  p.id,
  p.folio,
  p.perfil,
  p.matricula,
  p.nombre,
  p.nombre_en_revision,
  p.correo,
  p.celular,
  p.institucion,
  n.nivel,
  pr.nombre as programa,
  p.avance,
  n.etiqueta_avance,
  p.grupo,
  pl.nombre as plantel,
  p.dia,
  d.fecha as fecha_dia,
  -- La sede sale del día, no de una copia guardada en el participante.
  d.sede,
  p.taller_id,
  t.clave as taller_clave,
  t.nombre as taller_nombre,
  p.monto_esperado_evento,
  p.monto_esperado_taller,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'evento')
    as estado_pago_evento,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'taller')
    as estado_pago_taller,
  p.creado_en,
  p.acepto_aviso_en
from participantes p
join dias_evento d on d.dia = p.dia
left join niveles_academicos n on n.id = p.nivel_id
left join programas pr on pr.id = p.programa_id
left join planteles pl on pl.id = p.plantel_id
left join talleres t on t.id = p.taller_id;

alter view v_participantes set (security_invoker = true);
