-- =============================================================================
-- 1200 · Solo el día real registra asistencia
--
-- Nada, en ningún lado, comprobaba que el «día 1/2/3» de una asistencia
-- correspondiera a la fecha real de ese día. `/captura` dejaba elegir
-- cualquiera de los tres sin condición, y `fn_evaluar_escaneo` solo compara
-- el día del participante o del taller contra el día QUE DICE LA SESIÓN del
-- capturista —nunca contra el calendario—. El 13 de octubre, con el día 1
-- fijado para el 15, el sistema dejaba registrar una entrada real de «día 1»
-- de todos modos.
--
-- El daño no es cosmético: ese registro queda en la base como el ÚLTIMO
-- movimiento de esa persona ese día. Cuando de verdad llegue el 15 y vuelva a
-- entrar, el torniquete —que decide entrada o salida mirando el último
-- movimiento— lo va a recibir como una SALIDA, invirtiendo su estado desde el
-- primer escaneo real del evento.
--
-- Se cierra donde de verdad se escribe la fila: `guardarAsistencia` en
-- `lib/datos.ts` hace un `insert` directo contra `asistencias`, sin pasar por
-- ninguna función que pudiera validar esto. Un disparador es lo único que
-- cierra TODOS los caminos a la vez —el escaneo en línea, la cola sin
-- conexión al sincronizar, cualquier alta futura— sin tener que acordarse de
-- repetir la comprobación en cada uno.
--
-- Sin excepción para el personal, a propósito: a diferencia de la ventana de
-- pre-registro —donde exentar a soporte tiene sentido porque atiende un caso
-- ya abierto—, aquí exentar a alguien es exactamente el hueco que se quiere
-- cerrar. No hay «caso abierto» que justifique una entrada con fecha
-- equivocada.
-- =============================================================================

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

drop trigger if exists trg_exigir_dia_real on asistencias;
create trigger trg_exigir_dia_real
  before insert on asistencias
  for each row execute function fn_exigir_dia_real();

comment on function fn_exigir_dia_real is
  'Rechaza una asistencia cuyo día no coincide con la fecha real de hoy, sin excepción de rol.';
