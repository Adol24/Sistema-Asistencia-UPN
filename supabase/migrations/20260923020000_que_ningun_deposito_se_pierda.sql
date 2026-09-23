-- =============================================================================
-- 54 · Que ningún depósito se pierda
--
-- Dos defectos en la frontera del dinero, y los dos silenciosos.
--
-- 1. La referencia con guion: la pantalla la acepta y la base la rechaza
-- -----------------------------------------------------------------------
-- `referenciaValida` en el cliente admite `^[A-Za-z0-9-]{6,20}$` y el CHECK de
-- la columna admite `^[A-Za-z0-9]{6,20}$`. Divergen en un solo carácter, y es
-- uno que los bancos usan mucho: `REF-900123`.
--
-- Lo que produce: el archivo del corte trae ciento veinte filas con guion, la
-- vista previa las pinta VERDES —«listo para aplicar»—, el resumen las cuenta
-- entre las aplicables, y al escribir la base las rechaza todas por formato.
-- Nadie revisa un archivo que salió entero en verde.
--
-- **Se amplía la base, no se estrecha el cliente.** El guion aparece en
-- referencias bancarias reales, así que rechazarlo no evita un error: pierde un
-- depósito que existe. La regla del cliente se escribió mirando archivos de
-- verdad; la de la columna, no.
--
-- `uq_referencia` sigue intacto, que es el control que de verdad importa aquí:
-- ampliar los caracteres admitidos no permite registrar dos veces la misma.
--
-- 2. El resultado se puede cambiar a mano, y el disparador no se entera
-- ---------------------------------------------------------------------
-- El comentario de la migración 7 promete que «el resultado no lo elige quien
-- captura: lo decide el sistema comparando lo depositado contra lo esperado.
-- Dejarlo a criterio de ventanilla convierte una discrepancia en un pago
-- completo con solo elegir mal en un desplegable».
--
-- Y es verdad al INSERTAR. Pero el disparador se declaró
-- `before insert or update OF monto, monto_esperado`, así que un UPDATE que
-- toque ÚNICAMENTE `resultado` no lo dispara — y la política `pagos_correccion`
-- deja a Servicios Financieros actualizar cualquier columna.
--
-- O sea que con una sesión de ese rol, un `PATCH` de `{"resultado":"pagado"}`
-- sobre una fila de 450 contra 500 esperados la deja marcada como pagada. La
-- puerta lo deja pasar en verde, la conciliación deja de contarlo como
-- discrepancia, y `chk_discrepancia_con_nota` no estorba porque solo mira el
-- caso contrario.
--
-- Quitar la lista de columnas hace que el disparador corra en CUALQUIER update y
-- vuelva a calcular el resultado a partir de los montos. Escribirlo a mano deja
-- de tener efecto, que es lo que el comentario prometía desde el principio.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- El guion, que los bancos sí usan
-- ---------------------------------------------------------------------------
alter table pagos drop constraint if exists pagos_referencia_check;
alter table pagos
  add constraint pagos_referencia_check
  check (referencia is null or referencia ~ '^[A-Za-z0-9-]{6,20}$');

comment on column pagos.referencia is
  'La referencia del banco. Admite guiones, que aparecen en los cortes reales. '
  'Nula en ventanilla, donde quien cobra verifica el voucher en mano; para las '
  'que existen, uq_referencia sigue impidiendo registrarlas dos veces.';

-- ---------------------------------------------------------------------------
-- Y el resultado, que vuelve a ser inatacable
--
-- Mismo cuerpo, mismo nombre: lo único que cambia es CUÁNDO se dispara. Sin la
-- lista de columnas, cualquier update recalcula, así que escribir `resultado` a
-- mano deja de tener efecto en vez de tenerlo en silencio.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_pagos_resultado on pagos;
create trigger trg_pagos_resultado
  before insert or update on pagos
  for each row execute function fn_resultado_pago();

comment on function fn_resultado_pago is
  'Calcula `resultado` desde los montos, en cada insert y en CADA update: con la '
  'lista de columnas que tenía antes, un update de solo `resultado` lo esquivaba.';
