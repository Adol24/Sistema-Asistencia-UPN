-- =============================================================================
-- 46 · Los dos grupos de decolonialidad son de 70 cada uno
--
-- La 36 partió el taller de decolonialidad en dos claves y le puso **35** a cada
-- grupo. La organización corrige: son **70 y 70**. Alguien ya había subido T12 a
-- 70 desde el panel; T04 se quedó en 35, y volvió a nacer así cuando la 45 lo
-- restituyó, porque la 45 copió el valor de la 36.
--
-- Por qué este taller sí lleva dos claves y los otros de dos días no
-- ------------------------------------------------------------------
-- Es la distinción que costó entender, y conviene que quede escrita.
--
-- `talleres.cupo_total` es **un número por taller**, y `v_talleres` cuenta todos
-- sus inscritos sin mirar el día. Para un taller de dos días eso significa que
-- el cupo se comparte entre los dos, y eso es CORRECTO cuando las dos sesiones
-- son del mismo grupo:
--
--   T03, T05 y T06 se imparten el día 1 y el día 2, y van **las mismas 30
--   personas** a las dos sesiones. Treinta lugares en total, no sesenta.
--
-- La decolonialidad es el único caso distinto: **dos grupos diferentes de 70**,
-- uno el día 1 y otro el día 2. Con un solo renglón, los 70 del jueves y los 70
-- del viernes competirían por el mismo cupo. De ahí las dos claves.
--
-- Así que la duplicación en el catálogo no es un defecto: son dos grupos de
-- verdad, con dos listas de asistentes distintas. Y el alumno no la ve nunca
-- —`/talleres` solo le ofrece los de SU día, así que el del día 1 ve T04 y el
-- del día 2 ve T12—. Solo aparecen juntos en el panel, que es donde tiene
-- sentido verlos.
-- =============================================================================

update talleres
   set cupo_total = 70,
       descripcion = 'Grupo del día 1. El mismo taller se imparte el día 2 con otro grupo de 70.'
 where clave = 'T04';

update talleres
   set cupo_total = 70,
       descripcion = 'Grupo del día 2. El mismo taller se imparte el día 1 con otro grupo de 70.'
 where clave = 'T12';

do $$
declare
  v_dia1 integer;
  v_dia2 integer;
begin
  select coalesce(sum(t.cupo_total), 0) into v_dia1
    from talleres t join taller_dias d on d.taller_id = t.id
   where d.dia = 1 and t.activo;
  select coalesce(sum(t.cupo_total), 0) into v_dia2
    from talleres t join taller_dias d on d.taller_id = t.id
   where d.dia = 2 and t.activo;

  raise notice 'Lugares de taller del día 1: % (se esperan 220).', v_dia1;
  raise notice 'Lugares de taller del día 2: % (se esperan 310).', v_dia2;
end;
$$;
