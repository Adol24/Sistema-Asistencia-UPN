-- =============================================================================
-- Quitar el taller que nadie pagó
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260929140000_quitar_el_taller_que_nadie_pago`.
--
-- Qué cambia
-- ----------
-- `fn_asignar_taller` deja de rechazar UN caso: quitarle el taller a quien ya
-- depositó pero cuyo taller no tiene ninguna fila de pago. Asignar y cambiar de
-- taller siguen cerrados por cualquier depósito, exactamente igual que hoy.
--
-- El caso que lo pide
-- -------------------
-- Alguien se pre-registró con evento y taller —500 y 100—, luego decidió venir
-- solo al evento, y depositó 500. Servicios Financieros confirmó ese depósito:
-- una fila de `pagos` con `concepto = 'evento'`. Ninguna con `'taller'`, porque
-- del taller no llegó un peso.
--
-- A partir de ahí el sistema se quedó describiendo algo que no pasó:
--
--   · `participantes` sigue con su `taller_id` y sus 100 de
--     `monto_esperado_taller`, así que su lugar en el taller sigue ocupado y
--     nadie más puede tomarlo;
--   · `v_estado_pago` deriva `pre_registrado` para el concepto del taller, y
--     `estadoDelDeposito` enseña lo menos avanzado de los dos, así que la
--     persona que ya pagó ve su depósito como si no lo hubiera hecho;
--   · y el panel contestaba «ya tiene un depósito registrado, ve a Servicios
--     Financieros», que es mandar a la ventanilla del dinero un asunto donde no
--     hay dinero que mover.
--
-- Por qué quitar no es lo mismo que poner
-- ---------------------------------------
-- La guardia de la migración `20260926160000` está escrita para la dirección
-- contraria, y ahí sigue haciendo falta: añadirle un taller a quien ya depositó
-- le invalida el concepto que escribió a mano en su hoja y deja 100 sin cobrar.
--
-- Quitarlo cuando el taller no tiene fila de pago no hace ninguna de las dos
-- cosas. El voucher que entregó dice el importe del evento y nada más; quitar el
-- taller no lo contradice, lo confirma. No hay cobro que perder, porque ese cobro
-- no existió. Lo único que cambia es que el registro deja de afirmar una
-- inscripción que la persona no compró, y que su lugar vuelve al cupo.
--
-- Y si el taller SÍ tiene fila de pago, sigue cerrado, ahora con su propio
-- mensaje: ahí sí entró dinero por ese concepto y quitarlo es decidir qué se
-- hace con él. Eso es de Servicios Financieros y de nadie más.
--
-- Lo que la base no puede saber, y por eso lo dice la pantalla
-- ------------------------------------------------------------
-- Que no haya fila de pago del taller significa que nadie lo REGISTRÓ, no que
-- nadie lo depositara. Entre que la persona deposita 600 y que quien cobra
-- confirma los dos conceptos hay una ventana en la que la base ve exactamente lo
-- mismo que en el caso de arriba. Ninguna consulta distingue esos dos estados:
-- el dato que falta está en el voucher, en papel.
--
-- Así que esto no se automatiza ni se ofrece de pasada. Lo ejecuta administración
-- o soporte, a mano, con el motivo delante, y queda en la bitácora con el folio y
-- el taller del que se le bajó. La pantalla dice en voz alta lo que hay que mirar
-- antes de pulsar.
--
-- Por qué NO delega la baja en `fn_cambiar_taller`
-- ------------------------------------------------
-- Porque esa función la llaman también las dos altas del pre-registro, que son
-- públicas y reentrantes: `fn_preregistrar_alumno` vuelve a pasar por ella con
-- el taller que traiga el formulario, NULL incluido. Relajarle la guardia ahí
-- significaría que alguien que ya pagó su taller lo pierde en silencio por volver
-- a entrar su matrícula y pulsar «Continuar sin taller». La baja con depósito es
-- un acto de administración, y solo la función de administración la hace.
--
-- Lo que se retranscribe es un `update` de dos columnas, no lógica: el cupo, el
-- catálogo, el monto y la salida temprana siguen viviendo enteros en
-- `fn_cambiar_taller`, que es quien sigue atendiendo TODOS los demás caminos de
-- esta función. `chk_monto_taller` es quien exige que esas dos columnas viajen
-- juntas, y sigue exigiéndolo desde la tabla.
-- =============================================================================

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
  v_hay_deposito boolean;
  v_pago_del_taller boolean;
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

  if v_clave <> '' then
    select id into v_taller from talleres where clave = v_clave;
    if v_taller is null then
      raise exception 'No hay ningún taller con la clave %', v_clave
        using errcode = 'no_data_found';
    end if;
  end if;

  /*
   * El depósito, antes de tocar nada, y con sus dos mensajes.
   *
   * Las dos preguntas son distintas y hay que hacerlas las dos: «¿entró dinero
   * de esta persona?» decide si se le puede PONER un taller, y «¿entró dinero
   * de ESTE concepto?» decide si se le puede QUITAR.
   */
  select exists (select 1 from pagos where participante_id = v_id),
         exists (select 1 from pagos where participante_id = v_id and concepto = 'taller')
    into v_hay_deposito, v_pago_del_taller;

  if v_taller is not null and v_hay_deposito then
    -- Poner o cambiar. Cualquier depósito lo cierra: el concepto que escribió a
    -- mano en su hoja depende de si lleva taller, y cambiárselo después no le
    -- modifica una cifra, le invalida el papel que ya entregó.
    raise exception
      'El folio % ya tiene un depósito registrado. El taller va en ese mismo '
      'depósito y su concepto ya está escrito en el voucher que entregó, así que '
      'a partir de aquí lo resuelve Servicios Financieros.', v_folio
      using errcode = 'check_violation';
  end if;

  if v_taller is null and v_pago_del_taller then
    -- Quitar, pero el taller tiene su propio cobro registrado. Ahí sí hay dinero
    -- de ese concepto, y qué se hace con él no se decide desde este panel.
    raise exception
      'El taller del folio % tiene un cobro registrado a su nombre. Quitárselo es '
      'decidir qué pasa con ese dinero, y eso lo resuelve Servicios Financieros.',
      v_folio
      using errcode = 'check_violation';
  end if;

  -- Se lee ANTES de cambiarlo: después ya no se puede saber de dónde venía, y la
  -- bitácora sin el origen no sirve para revisar una inconformidad.
  select clave into v_antes_clave from talleres where id = v_antes;

  if v_taller is null and v_antes is not null and v_hay_deposito then
    /*
     * La baja con depósito, y solo ella, se hace aquí.
     *
     * `v_antes is not null` porque quitarle el taller a quien no tiene ninguno
     * no es una baja, es nada: sin esa condición se colaría por aquí un `update`
     * que no cambia una columna. Ese caso cae al `else`, y `fn_cambiar_taller`
     * lo resuelve con su salida temprana —que va antes que su guardia del
     * depósito— tal como lo resuelve hoy para quien no ha depositado.
     *
     * `fn_cambiar_taller` la rechazaría, y tiene que seguir rechazándola: la
     * llaman las altas públicas del pre-registro, que son reentrantes y le pasan
     * NULL en cuanto alguien vuelve a entrar su matrícula y pulsa «Continuar sin
     * taller». Ver la cabecera.
     *
     * Las dos columnas van juntas porque `chk_monto_taller` lo exige: o las dos
     * puestas, o las dos nulas.
     */
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = v_id;
  else
    -- Todo lo demás lo sigue llevando ella: el cupo con su cerrojo, el taller
    -- inactivo, el monto que sale del catálogo y la salida temprana cuando no
    -- hay cambio.
    perform fn_cambiar_taller(v_id, v_taller);
  end if;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    case when v_taller is null then 'Quitó el taller de un participante'
         else 'Asignó un taller a un participante' end,
    -- `nullif` y no `coalesce` a secas: `v_clave` se declara con `coalesce(...,
    -- '')`, así que cuando se quita el taller vale cadena vacía y no nulo. Con
    -- `coalesce(v_clave, 'sin taller')` la bitácora habría escrito
    -- «T04 → » y el renglón que dice qué pasó se habría quedado a medias.
    --
    -- Y cuando la baja va sobre un depósito ya hecho se dice en el mismo
    -- renglón: es el dato por el que alguien va a volver a leer esta línea.
    format('%s · %s · %s → %s%s',
           v_folio, v_nombre,
           coalesce(v_antes_clave, 'sin taller'),
           coalesce(nullif(v_clave, ''), 'sin taller'),
           case when v_taller is null and v_hay_deposito
                then ' · con depósito ya registrado, sin cobro del taller'
                else '' end)
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
  'soporte. PONER un taller lo cierra cualquier depósito: el taller va en el '
  'mismo depósito y el concepto ya está escrito en el voucher. QUITARLO solo lo '
  'cierra un cobro registrado del propio taller; sin él no hay dinero que mover '
  'y la baja libera el lugar. Identifica por folio y por clave (T01), que es lo '
  'que una persona puede dictar y lo que queda legible en la bitácora.';

revoke all on function fn_asignar_taller(text, text) from public, anon;
grant execute on function fn_asignar_taller(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A cuánta gente le sirve esto hoy
--
-- Se dice al aplicar para no tener que adivinarlo después: son exactamente los
-- que esta migración desatasca, los que ya podía atender el panel, y los que
-- siguen siendo de Servicios Financieros.
-- ---------------------------------------------------------------------------
do $fn$
declare
  v_desatascados integer;
  v_ya_podian integer;
  v_con_cobro integer;
begin
  select count(*) into v_desatascados
    from participantes p
   where p.taller_id is not null
     and exists (select 1 from pagos g where g.participante_id = p.id)
     and not exists (
           select 1 from pagos g
            where g.participante_id = p.id and g.concepto = 'taller');

  select count(*) into v_ya_podian
    from participantes p
   where not exists (select 1 from pagos g where g.participante_id = p.id);

  select count(*) into v_con_cobro
    from participantes p
   where p.taller_id is not null
     and exists (
           select 1 from pagos g
            where g.participante_id = p.id and g.concepto = 'taller');

  raise notice 'Con taller, ya depositaron y el taller no tiene cobro: %.', v_desatascados;
  raise notice '  A esos el panel ya puede quitárselo. Antes de hoy, a ninguno.';
  raise notice 'Sin ningún depósito, el panel los movía y los sigue moviendo: %.', v_ya_podian;
  raise notice 'Con cobro registrado del taller, van a Servicios Financieros: %.', v_con_cobro;
end $fn$;
