-- =============================================================================
-- Administración corrige asistencia
--
-- `/admin/asistencias` ya buscaba por folio/matrícula y enseñaba el historial
-- de entrada/salida/reintegro por día, con un botón para anular. Le faltaban
-- dos cosas que Adol pidió: corregir la HORA de un movimiento ya escrito
-- (entrada, salida, o la asistencia a un taller), y AGREGAR uno que falta
-- cuando el escaneo nunca llegó a la base.
--
-- Corregir una hora ya escrita no necesita nada nuevo aquí
-- ----------------------------------------------------------
-- `UPDATE` sobre `asistencias` no dispara ningún trigger —los dos que existen
-- son `BEFORE INSERT`— y la política `asistencias_anulacion`
-- (20260907001400) ya deja a `admin` actualizar cualquier columna de
-- cualquier fila, no solo las de anulación pese a su comentario («Anular es
-- la única modificación»). El cliente hace el `update` directo contra
-- `registrada_en`, igual que `anularAsistenciaRemota` ya lo hace contra las
-- columnas de anulación.
--
-- Agregar una fila que falta sí choca con fn_exigir_dia_real
-- ------------------------------------------------------------
-- Esa función (20261014120000) se escribió «sin excepción, a propósito»:
-- ningún insert de un día que no es HOY debía colarse jamás, ni para el
-- personal. Adol confirmó explícitamente que quiere poder saltarse esa regla
-- desde este panel —para reponer un escaneo que de verdad ocurrió un día que
-- ya pasó—, así que se agrega el único carril de excepción que ya existía
-- para «alguien que llegó el día que no era»: una bandera de sesión LOCAL A
-- LA TRANSACCIÓN (`set_config(clave, valor, true)`, que Postgres revierte
-- solo al terminar), que `fn_exigir_dia_real` consulta antes de rechazar.
--
-- Se reutilizan `autorizada_por`/`autorizacion_motivo` —ya existían para
-- «excepción autorizada por un supervisor», que es exactamente lo que esto
-- es— en vez de añadir columnas nuevas.
--
-- `fn_exigir_alternancia_de_puerta` (20261015180000) SÍ sigue aplicando sin
-- excepción: dos entradas o dos salidas seguidas son un dato roto incluso si
-- las escribe un administrador a mano, y Adol lo confirmó explícitamente. No
-- se toca esa función.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- fn_exigir_dia_real: el cuerpo es el mismo, letra por letra, con un carril
-- de excepción al principio.
-- ---------------------------------------------------------------------------
create or replace function fn_exigir_dia_real()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_hoy date;
begin
  -- Lo activa fn_admin_registrar_asistencia, y SOLO dentro de su propia
  -- transacción: el tercer argumento `true` de `set_config` la hace local a
  -- la transacción en curso, así que se apaga sola al terminar y no hay forma
  -- de que quede «encendida» para ningún otro insert, de nadie más.
  if coalesce(current_setting('app.admin_bypass_dia_real', true), '') = 'on' then
    return new;
  end if;

  select fecha into v_fecha from dias_evento where dia = new.dia;

  if v_fecha is null then
    raise exception 'El día % no tiene fecha configurada en dias_evento.', new.dia
      using errcode = 'check_violation';
  end if;

  -- Fecha LOCAL, no la del servidor: ver `20261001180000_dos_fechas_de_reposicion.sql`
  -- para el mismo error ya corregido una vez con `current_date` crudo.
  v_hoy := (now() at time zone 'America/Mexico_City')::date;

  if v_hoy <> v_fecha then
    raise exception 'Hoy (%) no es el día % del evento (%). No se puede registrar asistencia de un día que no es hoy.',
      to_char(v_hoy, 'DD/MM/YYYY'), new.dia, to_char(v_fecha, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function fn_exigir_dia_real() from public, anon, authenticated;

comment on function fn_exigir_dia_real is
  'Rechaza una asistencia cuyo día no coincide con la fecha real de hoy, salvo que fn_admin_registrar_asistencia haya activado el bypass para SU transacción.';

-- ---------------------------------------------------------------------------
-- La corrección administrativa: agrega la fila que falta.
--
-- `p_hora` es la hora real del movimiento que se repone, no «ahora»: por eso
-- no se apoya en `fn_registrar_asistencia`, que siempre usa el `default now()`
-- de la columna.
-- ---------------------------------------------------------------------------
create or replace function fn_admin_registrar_asistencia(
  p_participante_id uuid,
  p_dia smallint,
  p_tipo tipo_asistencia,
  p_hora timestamptz,
  p_motivo text,
  p_taller_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Corregir asistencia es de administración, y punto — igual que anularla.
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede registrar asistencia a mano'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_motivo), '') = '' or length(trim(p_motivo)) < 10 then
    raise exception 'El motivo de la corrección debe explicarse con al menos 10 caracteres'
      using errcode = 'check_violation';
  end if;

  if (p_tipo = 'taller') <> (p_taller_id is not null) then
    raise exception 'Un pase de taller necesita su taller; los demás tipos no lo llevan'
      using errcode = 'check_violation';
  end if;

  -- Local a ESTA transacción: fn_exigir_dia_real la consulta y se apaga sola.
  perform set_config('app.admin_bypass_dia_real', 'on', true);

  insert into asistencias (
    participante_id, dia, tipo, taller_id, registrada_en, punto,
    capturista_id, autorizada_por, autorizacion_motivo
  ) values (
    p_participante_id, p_dia, p_tipo, p_taller_id, p_hora, 'Corrección administrativa',
    auth.uid(), auth.uid(), p_motivo
  )
  returning id into v_id;

  -- fn_exigir_alternancia_de_puerta sigue corriendo sobre este insert sin
  -- ninguna excepción: si rompe la alternancia, esta función también falla,
  -- y eso es justo lo que tiene que pasar.

  return v_id;
end;
$$;

revoke all on function fn_admin_registrar_asistencia(uuid, smallint, tipo_asistencia, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function fn_admin_registrar_asistencia(uuid, smallint, tipo_asistencia, timestamptz, text, uuid)
  to authenticated;

comment on function fn_admin_registrar_asistencia is
  'Agrega a mano una entrada, salida o pase de taller que nunca llegó a la base. Salta fn_exigir_dia_real (con motivo obligatorio, queda en autorizada_por/autorizacion_motivo); fn_exigir_alternancia_de_puerta sigue aplicando sin excepción.';
