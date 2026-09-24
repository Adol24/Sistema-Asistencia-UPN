-- =============================================================================
-- 62 · La salida que nadie dio
--
-- Qué hacía el cierre automático
-- ------------------------------
-- `fn_cierre_automatico(dia, hora)` buscaba a todo participante de ese día que
-- siguiera DENTRO y le insertaba una fila de `salida` a la hora del cierre, con
-- `punto = 'Cierre automático'` y `capturista_id = null`.
--
-- Nació con la 25, cuando la puerta pasó a ser torniquete, y en ese momento era
-- necesario: `v_elegibles` exigía entrada Y salida para la constancia, así que
-- sin esa fila nadie que no hubiera escaneado al irse recibía su documento. El
-- cierre no era un registro, era un parche para un requisito.
--
-- Por qué ya no hace falta
-- ------------------------
-- La 53 quitó la salida de la regla de elegibilidad: hoy `v_elegibles` pide
-- pago, entrada y —en alumnos— dos evidencias, y `tiene_salida` se conserva
-- solo como columna que se mira, no como condición. O sea que la única razón
-- por la que existía este cierre desapareció hace ocho migraciones, y lo que
-- quedó es una función que inventa movimientos.
--
-- Y con el torniquete, la asistencia ya se sostiene sola: la presencia la prueba
-- la ENTRADA. Quien entró y nunca volvió a escanear estuvo; quien entró, salió a
-- la calle y no regresó también estuvo. Ninguno de los dos necesita que nadie le
-- escriba una salida al final del día.
--
-- Por qué inventarla es peor que no tenerla
-- -----------------------------------------
-- 1. `asistencias` es el registro de lo que pasó en la puerta. Una fila de
--    salida a las 15:00 a nombre de alguien que nunca pasó por ahí a esa hora es
--    un dato falso dentro del único sitio donde se guarda la verdad de quién
--    entró y quién salió. Que lleve `punto = 'Cierre automático'` lo hace
--    rastreable, no cierto.
--
-- 2. Deja a todo el mundo con una `salida` como último movimiento. Y el primer
--    bloque de `fn_evaluar_escaneo` —el del torniquete— resuelve «último igual a
--    salida» como REGRESÓ, en verde, ANTES de mirar el día y el pago, porque los
--    controles son de admisión y esa persona ya fue admitida. Resultado: después
--    del cierre, un escaneo cualquiera reabre la jornada y escribe una entrada
--    nueva sin que nadie coteje una credencial. El cierre no cerraba la puerta:
--    la dejaba en el estado que el motor lee como «puede volver a entrar».
--
-- 3. Borra la diferencia que la 25 quería conservar. El comentario de
--    `fn_esta_dentro` dice que quien salió y no volvió cuenta como fuera, y eso
--    es información. Pero después del cierre TODOS están fuera, y quien se fue a
--    media mañana vuelve a ser indistinguible de quien aguantó la jornada: lo
--    mismo que la 25 arregló, por la otra puerta.
--
-- Qué se conserva
-- ---------------
-- Las filas ya escritas, si alguna base las tiene. Dropear la función no borra
-- datos, y `punto = 'Cierre automático'` sigue siendo legible en el reporte, que
-- es donde hace falta para explicar una salida rara de un día viejo.
--
-- También se conserva `tiene_salida` en `v_elegibles`: la 53 ya la dejó como
-- columna de lectura y esto no la toca.
-- =============================================================================

drop function if exists fn_cierre_automatico(smallint, timestamptz);

-- El comentario de `fn_esta_dentro` prometía algo que el cierre deshacía cada
-- tarde. Ahora que nadie lo deshace, se deja dicho hasta dónde llega.
comment on function fn_esta_dentro(uuid, smallint) is
  'Manda el último movimiento: quien nunca pasó por la puerta está fuera, y quien '
  'salió y no volvió también. Al terminar la jornada nadie cierra el día, así que '
  'quien entró y no escaneó al irse se queda DENTRO: eso es lo que ocurrió, y la '
  'presencia la prueba la entrada, no el balance. Ver la 62.';
