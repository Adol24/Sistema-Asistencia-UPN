-- =============================================================================
-- Los tres lugares definitivos, dichos por la organización.
--
-- La 33 (`20260915140000_programa_oficial_talleres_y_sedes.sql`) leyó las sedes
-- del programa oficial en Word y dejó esto:
--
--   Día 1 · Salón SUTERM
--   Día 2 · Centro de convenciones Teziutlán
--   Día 3 · Centro de convenciones Teziutlán
--
-- La organización lo corrige. Los lugares definitivos son:
--
--   Día 1 · jueves 15 de octubre · Salón SUTERM
--   Día 2 · viernes 16 de octubre · Salón SUTERM
--   Día 3 · sábado 17 de octubre · Teatro Victoria
--
-- Manda esto y no el documento. El programa que se entregó es el de las
-- ponencias y se redactó antes de cerrar la logística; quien dice dónde se monta
-- el evento es quien lo monta. Queda escrito aquí para que dentro de un mes
-- nadie «arregle» las sedes volviendo a abrir el Word.
--
-- Las fechas NO se tocan: la 32 ya las dejó en 15, 16 y 17, y el documento y la
-- organización coinciden en ellas.
-- =============================================================================

update dias_evento set sede = 'Salón SUTERM'   where dia in (1, 2);
update dias_evento set sede = 'Teatro Victoria' where dia = 3;

-- ---------------------------------------------------------------------------
-- Los puntos de captura del día 2 vuelven.
--
-- La 33 los borró —`set puntos = '{}'`— y tenía razón para hacerlo: creía que
-- el día 2 dejaba de ser SUTERM, y un punto llamado «Puerta 1 SUTERM» en una
-- sede que no es SUTERM es una asistencia registrada en un lugar que no existe.
-- Como el día 2 sí es SUTERM, esos nombres vuelven a ser los correctos.
--
-- El día 3 se queda vacío, igual que antes: el Teatro Victoria es otra sede y
-- todavía no sabemos cómo se llaman sus accesos. Vacío significa «sin
-- configurar» y la aplicación cae a su lista genérica, así que ese día se puede
-- operar mientras alguien va y mira las puertas.
-- ---------------------------------------------------------------------------
update dias_evento
   set puntos = array['Puerta 1 SUTERM', 'Mesa de incidencias', 'Registro Taller']
 where dia = 2;

do $$
declare
  r record;
begin
  raise notice 'Sedes definitivas:';
  for r in select dia, fecha, sede, coalesce(array_length(puntos, 1), 0) as n_puntos
             from dias_evento order by dia
  loop
    raise notice '  Día % · % · % (% puntos de captura)', r.dia, r.fecha, r.sede, r.n_puntos;
  end loop;
end;
$$;
