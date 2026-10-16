-- Asignar un taller a quien ya depositó, cuando el voucher SÍ lo incluye
--
-- El caso que lo pide
-- -------------------
-- Alguien pagó 600 —evento y taller— en un solo depósito, pero quien lo
-- registró solo capturó los 500 del evento porque en ese momento la persona
-- no tenía ningún taller asignado al que atribuir el resto. Para cuando
-- administración quiere ponerle el taller que ya pagó, `fn_asignar_taller`
-- lo cierra sin remedio: «ya tiene un depósito registrado», el mismo
-- mensaje que recibe quien de verdad NO pagó el taller. La base no puede
-- distinguir los dos casos —el dato está en el voucher, en papel—, así que
-- hasta hoy la única respuesta era «no se puede», sin ninguna salida.
--
-- El hueco frente a QUITAR
-- -------------------------
-- Quitar un taller con depósito ya hecho SÍ tiene una salida desde
-- `20260929140000`, cuando el taller no tiene cobro propio: administración
-- confirma que miró el voucher y procede bajo su responsabilidad. Poner un
-- taller nunca tuvo la salida simétrica. Esta migración se la agrega, con la
-- misma disciplina: no se automatiza, lo decide una persona con el voucher
-- delante, y queda en la bitácora.
--
-- Qué NO cambia
-- -------------
-- Solo se abre la salida para ASIGNAR POR PRIMERA VEZ (`v_antes is null`).
-- Cambiar un taller que YA tiene su propio cobro registrado sigue cerrado
-- sin excepción: ahí el dinero ya está atado a un taller específico, y
-- reasignarlo es una decisión distinta —y más arriesgada— que no se pidió
-- aquí. El cupo del taller (`fn_exigir_lugar_en_taller`) tampoco se salta
-- nunca: confirmar el voucher no le abre un lugar a nadie que no lo tenga.

-- ---------------------------------------------------------------------------
-- 1 · fn_cambiar_taller gana un tercer parámetro, con default false
--
-- `create or replace` no permite cambiar la lista de parámetros de una
-- función existente sin crear un sobrecargo nuevo; hay que tirar la vieja
-- primero. El default deja a las altas públicas del pre-registro —que la
-- llaman con dos argumentos— exactamente como estaban: nunca piden forzar.
-- ---------------------------------------------------------------------------
drop function if exists fn_cambiar_taller(uuid, uuid);

create or replace function fn_cambiar_taller(
  p_participante uuid,
  p_taller uuid,
  -- Solo lo manda `fn_asignar_taller`, y solo cuando administración ya
  -- confirmó el voucher. Nadie más tiene motivo para mandar `true`.
  p_forzar_con_deposito boolean default false
)
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

  if v_p.taller_id is not distinct from p_taller then
    return;
  end if;

  -- Único cambio frente a la versión anterior: `and not p_forzar_con_deposito`.
  if exists (select 1 from pagos where participante_id = p_participante)
     and not p_forzar_con_deposito then
    raise exception
      'Ya tienes un depósito registrado, y el taller va en ese mismo depósito. '
      'Para cambiarlo acude a Servicios Financieros'
      using errcode = 'check_violation';
  end if;

  if p_taller is null then
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = p_participante;
    return;
  end if;

  select costo into v_costo from talleres where id = p_taller and activo;
  if v_costo is null then
    raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
  end if;

  -- El cupo NUNCA se fuerza: confirmar el voucher no abre un lugar de más.
  perform fn_exigir_lugar_en_taller(p_taller, v_p.perfil);

  update participantes
     set taller_id = p_taller,
         monto_esperado_taller = case
           when v_p.perfil = 'docente' then 0
           when not v_p.quiere_constancia then 0
           else v_costo
         end
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller y reescribe su monto. Al docente le pone cero desde el '
  '2026-09-30. Cualquier depósito registrado lo cierra, salvo que '
  '`p_forzar_con_deposito` venga en true -solo lo manda fn_asignar_taller, '
  'con el voucher ya confirmado por administración-.';

revoke all on function fn_cambiar_taller(uuid, uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · fn_asignar_taller gana `p_confirmado`, y lo usa solo para PONER por
--     primera vez
-- ---------------------------------------------------------------------------
drop function if exists fn_asignar_taller(text, text);

create or replace function fn_asignar_taller(
  p_folio text,
  p_clave text,
  -- Administración ya miró el voucher y confirma que SÍ incluye el taller.
  -- Falso por omisión: sin este argumento, el comportamiento es idéntico al
  -- de ayer.
  p_confirmado boolean default false
)
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

  select exists (select 1 from pagos where participante_id = v_id),
         exists (select 1 from pagos where participante_id = v_id and concepto = 'taller')
    into v_hay_deposito, v_pago_del_taller;

  /*
   * Poner o cambiar, con depósito de por medio.
   *
   * La salida solo existe para PONER POR PRIMERA VEZ (`v_antes is null`).
   * Cambiar un taller que ya tiene su propio cobro (`v_antes is not null`)
   * sigue sin ninguna excepción: ahí el dinero ya está atado a un taller
   * concreto, y es una decisión distinta a la que se resolvió aquí.
   */
  if v_taller is not null and v_hay_deposito and (v_antes is not null or not p_confirmado) then
    raise exception
      'El folio % ya tiene un depósito registrado. El taller va en ese mismo '
      'depósito y su concepto ya está escrito en el voucher que entregó, así que '
      'a partir de aquí lo resuelve Servicios Financieros.', v_folio
      using errcode = 'check_violation';
  end if;

  if v_taller is null and v_pago_del_taller then
    raise exception
      'El taller del folio % tiene un cobro registrado a su nombre. Quitárselo es '
      'decidir qué pasa con ese dinero, y eso lo resuelve Servicios Financieros.',
      v_folio
      using errcode = 'check_violation';
  end if;

  select clave into v_antes_clave from talleres where id = v_antes;

  if v_taller is null and v_antes is not null and v_hay_deposito then
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = v_id;
  else
    -- `p_confirmado` solo tiene efecto cuando `v_antes is null`: para los
    -- demás caminos (sin depósito, o quitar) da igual lo que valga.
    perform fn_cambiar_taller(v_id, v_taller, p_confirmado);
  end if;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    case when v_taller is null then 'Quitó el taller de un participante'
         else 'Asignó un taller a un participante' end,
    format('%s · %s · %s → %s%s',
           v_folio, v_nombre,
           coalesce(v_antes_clave, 'sin taller'),
           coalesce(nullif(v_clave, ''), 'sin taller'),
           case
             when v_taller is null and v_hay_deposito
               then ' · con depósito ya registrado, sin cobro del taller'
             when v_taller is not null and v_hay_deposito and p_confirmado
               then ' · con depósito ya registrado, voucher confirmado con taller'
             else ''
           end)
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
  'soporte. PONER por primera vez con depósito ya hecho necesita '
  '`p_confirmado = true` -administración ya miró el voucher-; CAMBIAR un '
  'taller que ya tiene su propio cobro sigue sin excepción. QUITAR solo lo '
  'cierra un cobro registrado del propio taller.';

revoke all on function fn_asignar_taller(text, text, boolean) from public, anon;
grant execute on function fn_asignar_taller(text, text, boolean) to authenticated;
