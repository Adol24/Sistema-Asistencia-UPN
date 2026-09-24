-- =============================================================================
-- Los módulos bajos de LEIP
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924180000_los_modulos_bajos_de_leip`.
--
-- La pregunta que dejó abierta la anterior
-- ----------------------------------------
-- La `20260924160000` corrigió la ventana del 25: los módulos de LEIP que
-- entran son el 9 y el 13, no el 10 y el 13, porque los romanos del calendario
-- administrativo van uno por delante del número que el alumno trae en su lista.
-- Y dejó enunciado que la ventana del 27 y 28 llevaba a LEIP con los módulos II
-- y VI guardados como 2 y 6, sin cambiarlos porque nadie lo había confirmado.
--
-- Confirmado el 2026-09-24: **son el 1 y el 5.** El desfase vale para todo
-- LEIP. Sin esto, los módulos 1 y 5 llegan el 27 y leen «Todavía no se anuncia
-- la fecha de registro para tu grupo» el día que sí les toca, y los módulos 2 y
-- 6 se registran un día que no es el suyo.
--
-- Las maestrías NO se tocan
-- -------------------------
-- Sus módulos I y IV siguen guardados como 1 y 4. El desfase es de LEIP —esa
-- generación va a pasar a un módulo nuevo y el calendario ya la nombra por el
-- siguiente—, y nadie ha dicho que las maestrías estén en el mismo caso.
-- Aplicarles el mismo «menos uno» dejaría a la de módulo I en cero, que no es
-- un módulo que exista.
--
-- El rótulo, otra vez en los números del alumno
-- ---------------------------------------------
-- Decía «de los módulos I, II, IV y VI». Los cuatro números que de verdad
-- entran son el 1 y el 4 de las maestrías y el 1 y el 5 de LEIP, así que la
-- lista que el alumno puede comparar contra el suyo es **1, 4 y 5**. Ese texto
-- sale literal en la pantalla de «todavía no te toca».
-- =============================================================================

update ventanas_preregistro
   set etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 4 y 5'
 where etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos I, II, IV y VI';

/*
 * El 2 pasa a 1 y el 6 a 5, solo los de LEIP y solo en esta ventana.
 *
 * Se acota por programa y por ventana: un `where avance = 2` a secas se
 * llevaría por delante a tercero de las cinco licenciaturas de semestres, que
 * están en esta misma ventana y son correctos.
 *
 * No hay choque con `uq`/`on conflict`: en esta ventana LEIP solo tiene esas
 * dos filas, y el bloque del final lo comprueba.
 */
update ventana_cohortes c
   set avance = case c.avance when 2 then 1 when 6 then 5 end
  from ventanas_preregistro v,
       programas p
 where v.id = c.ventana_id
   and p.id = c.programa_id
   and v.etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 4 y 5'
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
   and c.avance in (2, 6);

/*
 * Que la ventana del 27 quedó con las cohortes que debe.
 *
 * Se comprueban las tres cosas que pueden haber salido mal: que el rótulo se
 * cambió, que LEIP quedó con 1 y 5, y que las maestrías siguen con 1 y 4 —o
 * sea, que el `update` de arriba no se llevó por delante lo que no era suyo—.
 */
do $$
declare
  v_ventana uuid;
  v_leip text := 'Licenciatura en Educación e Innovación Pedagógica';
  v_modulos smallint[];
  v_maestrias smallint[];
  r record;
begin
  select id into v_ventana
    from ventanas_preregistro
   where etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 4 y 5';

  if not found then
    raise exception
      'No hay ninguna ventana con el rótulo nuevo del 27 y 28: no se actualizó, '
      'y el alumno sigue leyendo los romanos.';
  end if;

  select array_agg(c.avance order by c.avance) into v_modulos
    from ventana_cohortes c
    join programas p on p.id = c.programa_id
   where c.ventana_id = v_ventana
     and p.nombre = v_leip;

  if v_modulos is distinct from array[1, 5]::smallint[] then
    raise exception 'LEIP entra el 27 con los módulos %, y deben ser el 1 y el 5.',
      coalesce(v_modulos::text, 'ninguno');
  end if;

  select array_agg(distinct c.avance order by c.avance) into v_maestrias
    from ventana_cohortes c
    join programas p on p.id = c.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where c.ventana_id = v_ventana
     and n.nivel = 'Maestría';

  if v_maestrias is distinct from array[1, 4]::smallint[] then
    raise exception 'Las maestrías entran el 27 con los módulos %, y deben seguir con el 1 y el 4.',
      coalesce(v_maestrias::text, 'ninguno');
  end if;

  raise notice 'Ventana del 27 y 28 de septiembre:';
  for r in
    select p.nombre, c.avance
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where c.ventana_id = v_ventana
     order by p.nombre, c.avance
  loop
    raise notice '  · % — avance %', r.nombre, r.avance;
  end loop;
end
$$;
