-- =============================================================================
-- La referencia bancaria deja de ser obligatoria
--
-- Ventanilla ya no la captura. Quien cobra tiene el voucher en la mano y lo
-- verifica ahí mismo, así que pedirla por pantalla alargaba cada cobro sin
-- añadir una comprobación que la persona no estuviera haciendo ya.
--
-- Lo que esto cuesta, dicho sin adornos
-- -------------------------------------
-- `uq_referencia` era el control que impedía registrar dos veces el mismo
-- depósito. Para los pagos de ventanilla ese control pasa a ser humano: si la
-- misma persona se forma dos veces, o dos ventanillas cobran a la vez, la base
-- ya no lo detiene. Es una decisión de operación, no un descuido, y queda
-- escrita aquí para que quien la lea dentro de un año sepa que fue deliberada.
--
-- Lo que NO cuesta
-- ----------------
-- La carga masiva del banco sigue mandando referencia, y ahí el control queda
-- entero: en PostgreSQL dos nulos no chocan entre sí dentro de un índice único,
-- así que `uq_referencia` sigue rechazando el archivo que trae dos veces el
-- mismo depósito, y sigue rechazando el que trae uno ya registrado.
--
-- El CHECK de formato tampoco estorba: una restricción que se evalúa a NULL se
-- da por cumplida, así que solo sigue aplicándose a las referencias que existen.
-- =============================================================================

alter table pagos alter column referencia drop not null;

comment on column pagos.referencia is
  'Opcional. Ventanilla no la captura: quien cobra verifica el voucher en mano. '
  'La carga masiva del banco sí la trae, y para esas filas uq_referencia sigue '
  'siendo el control que impide registrar dos veces el mismo depósito.';

comment on constraint uq_referencia on pagos is
  'Impide registrar dos veces el mismo depósito, pero solo alcanza a los pagos '
  'que traen referencia: los de ventanilla la dejan nula y dos nulos no chocan.';
