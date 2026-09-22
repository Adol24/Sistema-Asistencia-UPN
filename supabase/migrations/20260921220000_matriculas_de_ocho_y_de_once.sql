-- =============================================================================
-- 48 · Matrículas de ocho y de once dígitos
--
-- Qué cambia
-- ----------
-- `padron_alumnos.matricula` deja de exigir once dígitos exactos. Pasa a
-- aceptar ocho u once, y nada más.
--
-- Por qué
-- -------
-- La 0400 escribió la regla creyendo que la matrícula tenía un solo largo:
--
--   check (matricula ~ '^[0-9]{11}$')
--
-- No lo tiene. Las de once dígitos son las que emite Servicios Escolares hoy;
-- las de ocho vienen de la numeración anterior y siguen siendo la matrícula
-- vigente de quien la tiene. Las dos aparecen en el mismo padrón.
--
-- El error no era cosmético. Esta columna es la llave primaria del padrón y de
-- ella cuelga `participantes.matricula`, así que la regla no rechazaba un
-- formato: rechazaba a la persona. Un alumno con matrícula de ocho dígitos no
-- podía entrar al padrón por importación, y sin estar en el padrón no podía
-- pre-registrarse ni pagar ni recibir constancia. Existía en la universidad y
-- no existía aquí.
--
-- Por qué ocho u once, y no «de ocho a once»
-- ------------------------------------------
-- Porque nueve y diez no son matrículas de nadie. Un rango las aceptaría, y con
-- ellas aceptaría los errores de captura que la regla existe para detener: un
-- dígito de más al teclear una de ocho, o uno de menos al teclear una de once,
-- entrarían como alumnos nuevos y quedarían en el padrón como personas que no
-- son. Dos largos exactos dejan pasar a todos los que existen y solo a ellos.
--
-- Relajar no rompe nada
-- ---------------------
-- Toda matrícula que ya está cargada cumple la regla vieja, y la vieja está
-- contenida en la nueva, así que ninguna fila existente queda en falta. La
-- restricción se valida contra lo que ya hay en la tabla y por eso no necesita
-- respaldo ni ventana.
--
-- El nombre `padron_alumnos_matricula_check` es el que PostgreSQL le puso al
-- declararla en la columna. Se borra sin `if exists` a propósito: si el nombre
-- no fuera ese, esta migración debe fallar en voz alta y no dejar la regla vieja
-- en pie junto a la nueva.
-- =============================================================================

alter table padron_alumnos
  drop constraint padron_alumnos_matricula_check,
  add constraint padron_alumnos_matricula_check
    check (matricula ~ '^([0-9]{8}|[0-9]{11})$');

comment on column padron_alumnos.matricula is
  'Matrícula de la universidad: ocho u once dígitos, sin letras. Los dos largos son reales — once es la numeración actual y ocho la anterior, todavía vigente.';
