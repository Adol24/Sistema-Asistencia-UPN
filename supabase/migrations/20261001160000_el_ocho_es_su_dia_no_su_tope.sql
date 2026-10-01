-- =============================================================================
-- El 8 de octubre es su día, no su tope
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20261001160000_el_ocho_es_su_dia_no_su_tope`.
--
-- Qué cambia
-- ----------
-- **Nada de los datos.** La columna, su valor y las funciones se quedan
-- exactamente como están. Lo único que cambia es el COMENTARIO de la columna, y
-- esta migración existe porque ese comentario pasó a ser falso en el mismo día
-- en que se escribió.
--
-- `20261001120000` lo dejó diciendo:
--
--     «Es un TOPE, no una cita: puede ir cualquier día antes.»
--
-- Esa misma tarde la organización aclaró lo contrario: el 8 de octubre es el día
-- en que docentes y externos pasan a pagar, uno solo, y no pueden ir antes ni
-- después. El cliente ya lo dice así —«Tu día para pagar», con el mismo aviso
-- que recibe el alumno—, y la base se quedó describiendo la regla anterior.
--
-- Por qué merece una migración propia
-- -----------------------------------
-- Porque el comentario de una columna es lo que lee quien llega a esta tabla sin
-- el contexto de la conversación, y aquí dice justo lo que no es. Un dato con la
-- documentación invertida es peor que un dato sin documentar: el primero se cree.
--
-- Es la misma lección de `97cd480`, cuando la ayuda de `/admin/configuracion`
-- llevaba dos días prometiendo que al alumno se le anunciaba la fecha límite. La
-- prosa que acompaña a un dato envejece sin avisar, y nada falla cuando miente.
-- =============================================================================

comment on column configuracion_evento.fecha_pago_docentes_externos is
  'El día en que un docente o un externo pasa a pagar. Es UN día y no se mueve: '
  'no puede ir antes ni después, igual que la cita del alumno. Lo que lo '
  'distingue de `dia_entrega_voucher` es de dónde sale —una sola fecha para '
  'todos ellos, no 122 por cohorte y sede— y que pasado ese día NO heredan la '
  'reposición del alumno: `fecha_recuperacion_voucher` la fijó la organización '
  'para las cohortes del calendario. Nulo significa que no se les enseña '
  'ninguna fecha. No lo obliga nadie por dentro: `fecha_limite` sigue siendo '
  'común a los tres perfiles. Organización, 2026-10-01.';

do $$
declare
  v_dia date;
begin
  select fecha_pago_docentes_externos into v_dia
    from configuracion_evento where id = 1;
  raise notice 'Día de pago de docentes y externos: % (sin cambios; solo se corrigió su comentario)',
    v_dia;
end;
$$;
