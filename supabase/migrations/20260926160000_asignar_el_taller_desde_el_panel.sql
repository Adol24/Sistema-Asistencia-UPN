-- =============================================================================
-- Asignar el taller desde el panel, y el depósito que lo cierra
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260926160000_asignar_el_taller_desde_el_panel`.
--
-- Qué cambia
-- ----------
-- 1. `fn_cambiar_taller` deja de mirar solo el pago DEL TALLER y mira si hay
--    algún depósito registrado.
-- 2. Nace `fn_asignar_taller(clave_o_null, folio)`, para administración y
--    soporte: la primera y única forma de darle un taller a alguien que ya cerró
--    su pre-registro sin elegir ninguno.
--
-- Por qué hacía falta
-- -------------------
-- Hasta hoy, quien pulsaba «Continuar sin taller» se quedaba sin taller para
-- siempre: `/talleres` se cierra en cuanto hay folio, `/confirmar-nombre` no
-- ofrece volver, y no existía NINGUNA pantalla interna que lo cambiara.
-- `fn_cambiar_taller` está revocada a `public`, `anon` y `authenticated`, y solo
-- la llamaban las dos altas del pre-registro. La única respuesta que el sistema
-- podía sostener era «pregunta por WhatsApp», y al otro lado del WhatsApp no
-- había tampoco nada que pulsar.
--
-- El hueco que se cierra
-- ----------------------
-- La guardia de pago de `fn_cambiar_taller` decía:
--
--     if exists (select 1 from pagos where participante_id = ... and concepto = 'taller')
--
-- y eso no protegía el caso que importa. Quien ya depositó sus 500 del evento
-- tiene una fila con `concepto = 'evento'`, no con `'taller'`, así que la función
-- le añadía el taller con toda naturalidad y lo dejaba debiendo el costo del
-- taller sin que nadie hubiera planeado cobrarlo.
--
-- Y no es una deuda cualquiera: desde el 2026-09-25 el depósito es UNO SOLO, y
-- el concepto que la persona escribe a mano en su hoja depende de si lleva taller
-- —«Cuota de recuperación Curso de Formación Continua (XIV EIE)» contra el mismo
-- texto «y Taller de Formación Continua»—. Añadirle un taller a quien ya
-- depositó no le cambia una cifra: le invalida el papel que ya entregó.
--
-- Así que el depósito cierra el taller, con cualquier concepto. Quien ya depositó
-- va a Servicios Financieros, que es donde está el dinero y la persona que puede
-- decidir sobre él.
--
-- Por qué la nueva función comprueba el pago por su cuenta
-- -------------------------------------------------------
-- `fn_cambiar_taller` vuelve a comprobarlo, así que la de arriba es redundante
-- en el sentido estricto. No en el que importa: el mensaje. El de
-- `fn_cambiar_taller` está escrito para el alumno que lo va a leer en el
-- pre-registro —«ya tienes un depósito»— y el de `fn_asignar_taller` para quien
-- está delante del panel, que necesita saber el folio y qué hacer con él. Una
-- excepción que habla en segunda persona a quien no es esa persona manda a
-- soporte a interpretar.
--
-- Qué NO comprueba, y es una decisión
-- -----------------------------------
-- La fecha límite. Pasado el 9 de octubre a las 18:00 el pre-registro sin pago
-- queda `expirado`, y asignarle un taller a alguien así no sirve de nada —pero
-- tampoco rompe nada, y quien opera el panel sabe cosas que la base no—. El
-- guardia que de verdad protege el dinero es el del depósito, y ese sí está.
--
-- Lo que sí conserva de `fn_cambiar_taller`
-- -----------------------------------------
-- Todo, porque la llama en vez de reescribirla: el cupo con su
-- `pg_advisory_xact_lock` (`fn_exigir_lugar_en_taller`), el rechazo del taller
-- inactivo, el `monto_esperado_taller` que sale del catálogo y la salida
-- temprana cuando no hay cambio. Retranscribir esa lógica para colar una
-- comprobación es como se perdió el limitador de `fn_padron_confirmar`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · El depósito cierra el taller, con cualquier concepto
--
-- Lo único que cambia de la versión de la migración 60 es la guardia de pago y
-- su mensaje. El resto se conserva palabra por palabra.
-- ---------------------------------------------------------------------------
create or replace function fn_cambiar_taller(p_participante uuid, p_taller uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_costo numeric(10, 2);
begin
  select * into v_p from participantes where id = p_participante;
  if v_p is null then
    raise exception 'Ese participante no existe' using errcode = 'no_data_found';
  end if;

  -- Sin cambio no hay nada que hacer, y decirlo aquí evita comprobar el resto.
  -- Va ANTES de la guardia del depósito a propósito: el alta del pre-registro es
  -- reentrante y vuelve a pasar por aquí con el mismo taller que la persona ya
  -- tiene. Comprobar el pago primero convertiría ese «no cambia nada» en un
  -- error para todo el que ya hubiera depositado.
  if v_p.taller_id is not distinct from p_taller then
    return;
  end if;

  /*
   * Cualquier depósito cierra el taller, no solo el del taller.
   *
   * Antes esto decía `and concepto = 'taller'`, y por ahí se colaba el caso que
   * importa: quien ya depositó los 500 del evento tiene una fila con
   * `concepto = 'evento'`, así que la comprobación no lo veía y se le podía
   * añadir un taller que nadie iba a cobrarle.
   *
   * Y el depósito es uno solo desde el 2026-09-25: el concepto que escribió a
   * mano en su hoja dice si lleva taller o no. Cambiárselo después no le
   * modifica una cifra, le invalida el papel que ya entregó en ventanilla.
   */
  if exists (select 1 from pagos where participante_id = p_participante) then
    raise exception
      'Ya tienes un depósito registrado, y el taller va en ese mismo depósito. '
      'Para cambiarlo acude a Servicios Financieros'
      using errcode = 'check_violation';
  end if;

  if p_taller is null then
    -- `chk_monto_taller` exige que el taller y su monto vayan juntos: o los dos
    -- puestos, o los dos nulos.
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = p_participante;
    return;
  end if;

  select costo into v_costo from talleres where id = p_taller and activo;
  if v_costo is null then
    raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
  end if;

  -- El cupo del taller. Ver `fn_exigir_lugar_en_taller`.
  perform fn_exigir_lugar_en_taller(p_taller);

  update participantes
     set taller_id = p_taller, monto_esperado_taller = v_costo
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller de un participante. Desde la migración 60 no comprueba que '
  'se imparta su día. Desde esta, CUALQUIER depósito registrado lo cierra: el '
  'taller va en el mismo depósito, así que después de pagar lo resuelve '
  'Servicios Financieros.';

-- Sigue cerrada a todo el mundo: la llaman las dos altas del pre-registro y,
-- desde aquí, `fn_asignar_taller`. Las tres son `security definer` y corren como
-- el dueño, así que no necesitan concesión.
revoke all on function fn_cambiar_taller(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Asignar un taller desde el panel
--
-- Se identifica por FOLIO y por CLAVE, no por uuid, y no es un detalle de
-- comodidad: los dos son lo que una persona puede dictar por teléfono, son lo
-- que sale en la bitácora y son lo que soporte tiene delante cuando alguien
-- escribe «me quedé sin taller». Un uuid en la bitácora obliga a una consulta
-- más para saber qué pasó.
--
-- `p_clave` nula QUITA el taller. Es el mismo gesto que asignarlo, con el mismo
-- guardia del depósito, y hace falta para el caso contrario: quien eligió taller
-- y ya no quiere venir esa tarde.
-- ---------------------------------------------------------------------------
create or replace function fn_asignar_taller(p_folio text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_clave text := upper(trim(coalesce(p_clave, '')));
  v_id uuid;
  v_nombre text;
  v_antes uuid;
  v_antes_clave text;
  v_taller uuid;
begin
  -- Administración y soporte. Capturistas, revisores y Servicios Financieros no:
  -- el primero mueve asistencias, el segundo evidencias y el tercero dinero, y
  -- ninguno de los tres tiene por qué mover inscripciones a talleres.
  if not tiene_rol(array['admin', 'soporte']::rol_interno[]) then
    raise exception 'Solo administración y soporte pueden asignar un taller'
      using errcode = 'insufficient_privilege';
  end if;

  if v_folio = '' then
    raise exception 'Falta el folio' using errcode = 'check_violation';
  end if;

  select p.id, p.nombre, p.taller_id
    into v_id, v_nombre, v_antes
    from participantes p
   where p.folio = v_folio;

  if v_id is null then
    raise exception 'No hay ningún participante con el folio %', v_folio
      using errcode = 'no_data_found';
  end if;

  /*
   * El depósito, antes que nada, y con su propio mensaje.
   *
   * `fn_cambiar_taller` vuelve a comprobarlo y levantaría su excepción igual,
   * pero está escrita para el alumno que la lee en el pre-registro. Quien está
   * en el panel necesita otra cosa: el folio, y a dónde mandar a esa persona.
   */
  if exists (select 1 from pagos where participante_id = v_id) then
    raise exception
      'El folio % ya tiene un depósito registrado. El taller va en ese mismo '
      'depósito y su concepto ya está escrito en el voucher que entregó, así que '
      'a partir de aquí lo resuelve Servicios Financieros.', v_folio
      using errcode = 'check_violation';
  end if;

  if v_clave <> '' then
    select id into v_taller from talleres where clave = v_clave;
    if v_taller is null then
      raise exception 'No hay ningún taller con la clave %', v_clave
        using errcode = 'no_data_found';
    end if;
  end if;

  -- Se lee ANTES de cambiarlo: después ya no se puede saber de dónde venía, y la
  -- bitácora sin el origen no sirve para revisar una inconformidad.
  select clave into v_antes_clave from talleres where id = v_antes;

  -- El cupo, el taller inactivo, el monto y la salida temprana los sigue
  -- llevando ella. Ver la nota de la cabecera.
  perform fn_cambiar_taller(v_id, v_taller);

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    case when v_taller is null then 'Quitó el taller de un participante'
         else 'Asignó un taller a un participante' end,
    -- `nullif` y no `coalesce` a secas: `v_clave` se declara con `coalesce(...,
    -- '')`, así que cuando se quita el taller vale cadena vacía y no nulo. Con
    -- `coalesce(v_clave, 'sin taller')` la bitácora habría escrito
    -- «T04 → » y el renglón que dice qué pasó se habría quedado a medias.
    format('%s · %s · %s → %s',
           v_folio, v_nombre,
           coalesce(v_antes_clave, 'sin taller'),
           coalesce(nullif(v_clave, ''), 'sin taller'))
  );

  return jsonb_build_object(
    'folio', v_folio,
    'antes', v_antes_clave,
    'ahora', nullif(v_clave, '')
  );
end;
$$;

comment on function fn_asignar_taller is
  'Asigna o quita el taller de un participante ya pre-registrado. Solo admin y '
  'soporte. Cualquier depósito registrado lo cierra: después de pagar lo '
  'resuelve Servicios Financieros. Identifica por folio y por clave (T01), que '
  'es lo que una persona puede dictar y lo que queda legible en la bitácora.';

revoke all on function fn_asignar_taller(text, text) from public, anon;
grant execute on function fn_asignar_taller(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · A cuánta gente le sirve esto hoy
--
-- Se dice al aplicar para no tener que adivinarlo después: son los que cerraron
-- su pre-registro sin taller y todavía no han depositado, o sea exactamente el
-- conjunto al que la pantalla nueva puede ayudar.
-- ---------------------------------------------------------------------------
do $fn$
declare
  v_sin_taller integer;
  v_alcanzables integer;
  v_tarde integer;
begin
  select count(*) into v_sin_taller from participantes where taller_id is null;

  select count(*) into v_alcanzables
    from participantes p
   where p.taller_id is null
     and not exists (select 1 from pagos g where g.participante_id = p.id);

  v_tarde := v_sin_taller - v_alcanzables;

  raise notice 'Participantes sin taller: %.', v_sin_taller;
  raise notice '  Se les puede asignar desde el panel: %.', v_alcanzables;
  raise notice '  Ya depositaron, van a Servicios Financieros: %.', v_tarde;
end $fn$;
