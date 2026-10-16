-- `uq_asistencia_taller` no distinguía el día, y tres talleres sí lo
-- necesitan: T03, T05 y T06 se imparten los días 1 y 2, con el MISMO grupo
-- volviendo la segunda tarde. `evaluarEscaneo` (escaneo.ts) ya sabe que ese
-- regreso es legítimo -su regla de "ya registrado" compara contra
-- `sesion.dia`, no contra el historial completo-, pero el candado de la base
-- no sabía lo mismo: una segunda fila para el mismo taller, aunque fuera de
-- otro día, chocaba contra la llave única.
--
-- Por qué esto se notaba en verde, no en rojo
-- --------------------------------------------
-- Chocar contra una llave única se trata como «ya estaba», no como «falló»
-- -es lo que hace segura la cola cuando una respuesta se pierde a mitad de
-- camino-. Eso significa que el pase de lista del día 2, al chocar contra la
-- fila del día 1, se veía como un ÉXITO: pantalla en verde, casilla marcada,
-- y NINGUNA fila nueva en la base. Quien pasó lista ayer en uno de estos tres
-- talleres aparecería hoy sin su asistencia de hoy, con el capturista
-- convencido de que sí se guardó.
--
-- El arreglo es el índice, no la lógica de arriba
-- -------------------------------------------------
-- Se agrega `dia` a la llave. Es más permisivo, no menos: todo lo que ya
-- cumplía el candado viejo sigue cumpliendo este, así que no hay fila
-- existente que lo rompa. Lo que cambia es que ahora SÍ se puede tener una
-- fila por taller y por día, que es justo lo que un taller de dos tardes
-- necesita.

drop index if exists uq_asistencia_taller;

create unique index uq_asistencia_taller
  on asistencias (participante_id, taller_id, dia)
  where tipo = 'taller' and anulada_en is null;

comment on index uq_asistencia_taller is
  'Un pase de lista por taller, PERSONA Y DÍA. Antes era solo por taller y persona, y bloqueaba el segundo día de los talleres de dos tardes (T03, T05, T06).';
