-- =============================================================================
-- Las fechas reales del evento, según el programa oficial.
--
-- La siembra inicial puso los días 1, 2 y 3 en el 14, 15 y 16 de octubre. El
-- programa que entregó la universidad —encabezado «Universidad Pedagógica
-- Nacional U-212»— los sitúa un día después:
--
--   Día 1 · jueves 15 de octubre de 2026
--   Día 2 · viernes 16 de octubre de 2026
--   Día 3 · sábado 17 de octubre de 2026
--
-- El programa cuadra consigo mismo y la siembra no: en 2026 el 15 de octubre
-- cae en jueves, el 16 en viernes y el 17 en sábado, tal como los nombra el
-- documento. El 14 habría sido miércoles, y ningún día del programa se llama
-- así. Por eso manda el documento.
--
-- No es un detalle cosmético. `dias_evento.fecha` es lo que la puerta compara
-- para decidir si alguien viene el día que le toca, y el texto de `fechas` es lo
-- que el alumno lee antes de depositar. Con un día de desfase, el jueves 15 el
-- escáner habría marcado en rojo a todo el que tuviera asignado el día 1.
--
-- Las sedes NO se tocan aquí: el programa también las contradice, pero además
-- revela que cada día tiene dos lugares —ponencias por la mañana, talleres por
-- la tarde— y `dias_evento.sede` es un solo campo. Eso necesita una decisión de
-- diseño, no una corrección de dato, y va por separado.
-- =============================================================================

update dias_evento set fecha = '2026-10-15' where dia = 1;
update dias_evento set fecha = '2026-10-16' where dia = 2;
update dias_evento set fecha = '2026-10-17' where dia = 3;

-- El texto que se lee en el portal, el comprobante y las instrucciones de pago.
update configuracion_evento
   set fechas = '15, 16 y 17 de octubre de 2026'
 where id = 1;

-- ---------------------------------------------------------------------------
-- Aviso, no corrección: la fecha límite de pre-registro sigue donde estaba
-- (viernes 9 de octubre, 18:00). Se fijó cuando el evento empezaba el día 14,
-- así que daba cinco días de margen y ahora da seis. Nada se rompe —sigue
-- siendo anterior al evento— pero si la universidad la movió también, se cambia
-- desde /admin/configuracion sin tocar la base.
-- ---------------------------------------------------------------------------
do $$
declare
  v_limite timestamptz;
  v_dia1 date;
begin
  select fecha_limite into v_limite from configuracion_evento where id = 1;
  select fecha into v_dia1 from dias_evento where dia = 1;

  raise notice 'Días del evento: 15, 16 y 17 de octubre de 2026.';
  raise notice 'Fecha límite de pre-registro: % (% días antes del día 1).',
    v_limite::date, v_dia1 - v_limite::date;

  if v_limite::date >= v_dia1 then
    raise warning 'La fecha límite ya no es anterior al evento. Corrígela en /admin/configuracion.';
  end if;
end;
$$;
