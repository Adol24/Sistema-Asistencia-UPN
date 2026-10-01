-- =============================================================================
-- El pago del maestro y del externo cierra el 8 de octubre
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20261001120000_el_pago_del_maestro_cierra_el_ocho`.
--
-- Qué cambia
-- ----------
-- Docentes y externos no tenían NINGUNA fecha, y no por descuido del
-- calendario: `fn_cita_de_pago` resuelve por matrícula contra `padron_alumnos`,
-- y ellos no están ahí. Devolvía nulo y la pantalla no dibujaba el bloque. Se
-- registraban y nadie les decía nunca hasta cuándo podían pagar.
--
-- La organización fijó el **8 de octubre** como su último día. Esta migración
-- solo guarda ese dato; quien lo enseña es el navegador.
--
-- Por qué una columna y no una fila por persona
-- ---------------------------------------------
-- Lo del alumno es una CITA: un día concreto, asignado por cohorte y sede, y
-- vive en `dia_entrega_voucher` porque son 122 combinaciones distintas. Lo del
-- maestro es un TOPE: una sola fecha para todos, y puede ir cualquier día antes.
-- Son dos cosas distintas y se guardan distinto; meter el tope en la tabla de
-- citas habría obligado a inventarle una fila por sede a gente que no tiene
-- sede asignada.
--
-- Lo que esta migración NO hace, y hay que saberlo
-- ------------------------------------------------
-- **No lo obliga.** `v_estado_pago` sigue derivando `expirado` con el
-- `fecha_limite` común, que está el 12 de octubre: un docente que llegue el 10
-- no figura como expirado y el sistema le aceptará el depósito. El 8 es lo que
-- se le DICE, y quien lo hace cumplir es la ventanilla.
--
-- Hacerlo cumplir por dentro pide un vencimiento por perfil —otra columna y
-- `v_estado_pago` reescrita— y eso no se decidió. Queda dicho aquí para que
-- nadie lo descubra el día 10 creyendo que estaba resuelto.
-- =============================================================================

alter table configuracion_evento
  add column if not exists fecha_pago_docentes_externos date;

update configuracion_evento
   set fecha_pago_docentes_externos =
         coalesce(fecha_pago_docentes_externos, date '2026-10-08')
 where id = 1;

comment on column configuracion_evento.fecha_pago_docentes_externos is
  'El último día en que un docente o un externo puede entregar su voucher. Es un '
  'TOPE, no una cita: puede ir cualquier día antes. Nulo significa que no se le '
  'enseña ninguna fecha, que es preferible a enseñar una vencida. No lo obliga '
  'nadie por dentro: `fecha_limite` sigue siendo común. Organización, 2026-10-01.';

do $$
declare
  v_cfg record;
begin
  select fecha_pago_docentes_externos, fecha_recuperacion_voucher, fecha_limite
    into v_cfg
    from configuracion_evento where id = 1;

  raise notice 'Tope de docentes y externos: %', v_cfg.fecha_pago_docentes_externos;
  raise notice 'Reposición de alumnos: %  ·  vencimiento interno: %',
    v_cfg.fecha_recuperacion_voucher, v_cfg.fecha_limite;

  -- Un tope posterior al vencimiento interno dejaría a esa gente expirada antes
  -- de su propio último día: la misma trampa que el 2026-09-30, al revés.
  if v_cfg.fecha_pago_docentes_externos is not null
     and v_cfg.fecha_pago_docentes_externos > (v_cfg.fecha_limite at time zone 'America/Mexico_City')::date
  then
    raise warning 'El tope (%) cae DESPUÉS del vencimiento interno (%). Esa gente '
      'figuraría como expirada antes de su último día. Mueve el vencimiento.',
      v_cfg.fecha_pago_docentes_externos,
      (v_cfg.fecha_limite at time zone 'America/Mexico_City')::date;
  end if;
end;
$$;
