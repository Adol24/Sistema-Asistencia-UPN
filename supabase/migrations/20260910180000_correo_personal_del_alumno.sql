-- =============================================================================
-- El alumno puede usar su correo personal
--
-- El problema no era la regla, era el dato
-- ----------------------------------------
-- `configuracion_evento.dominio_institucional` funciona como se documentó
-- desde el principio: con valor exige que el correo termine en ese dominio, y
-- en NULL acepta cualquiera. Lo que quedó puesto fue el valor de ejemplo con el
-- que se sembró la base —`alumnos.universidad.mx`—, un dominio que no existe.
--
-- Con eso, cualquier alumno que escribiera su correo real recibía «usa tu
-- correo institucional, el que termina en @alumnos.universidad.mx» y no podía
-- pre-registrarse. Y aquí no todos tienen cuenta institucional, que es
-- exactamente el caso que el diseño previó y que este dato de ejemplo estaba
-- tapando.
--
-- Se limpia. La regla sigue existiendo y se vuelve a activar cuando haga falta
-- escribiendo el dominio en Administración → Configuración; el propio campo
-- explica que vacío acepta cualquier correo.
-- =============================================================================

update configuracion_evento set dominio_institucional = null where id = 1;

-- ---------------------------------------------------------------------------
-- Y que un valor en blanco no vuelva a cerrar la puerta
--
-- La comprobación miraba `is not null`. Una cadena vacía no es NULL, así que
-- `dominio_institucional = ''` habría exigido que el correo terminara en «@» a
-- secas: ningún correo del mundo pasa, y el mensaje de error habría dicho «usa
-- tu correo institucional, el que termina en @», sin nombrar dominio alguno.
--
-- La aplicación convierte el campo vacío a NULL antes de guardar, así que hoy
-- no ocurre. Pero la función es la puerta de verdad, y no debe depender de que
-- quien la llame se haya acordado de normalizar. Ahora un valor en blanco vale
-- lo mismo que ausente: sin restricción.
-- ---------------------------------------------------------------------------
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
  v_dominio text;
begin
  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en el padrón' using errcode = 'no_data_found';
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- Sin dominio configurado —NULL o en blanco— se acepta cualquier correo,
  -- porque hay universidades que no dan cuenta institucional a todos y
  -- rechazar a quien no la tiene lo dejaría fuera del evento.
  v_dominio := nullif(trim(coalesce(v_cfg.dominio_institucional, '')), '');
  if v_dominio is not null
     and lower(trim(p_correo)) not like '%@' || lower(v_dominio) then
    raise exception 'Usa tu correo institucional, el que termina en @%', v_dominio
      using errcode = 'check_violation';
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

-- Desde `20260908160000` las funciones no nacen ejecutables por PUBLIC, y
-- `create or replace` no conserva los permisos de la anterior si cambia la
-- firma. Aquí no cambia, pero se reafirma por si esta migración se aplica
-- sobre una base donde se recreó de otra forma.
revoke all on function fn_preregistrar_alumno(text, text, text, uuid) from public;
grant execute on function fn_preregistrar_alumno(text, text, text, uuid) to anon, authenticated;

comment on column configuracion_evento.dominio_institucional is
  'NULL o en blanco acepta cualquier correo. Con valor, exige que termine en '
  '@dominio. Se sembró con un dominio de ejemplo que impedía pre-registrarse '
  'a todo el mundo; ver 20260910180000_correo_personal_del_alumno.sql.';
