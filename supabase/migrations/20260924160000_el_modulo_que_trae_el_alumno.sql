-- =============================================================================
-- El módulo que trae el alumno
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924160000_el_modulo_que_trae_el_alumno`.
--
-- Lo que lee hoy una alumna de LEIP
-- --------------------------------
-- «El registro de séptimo semestre y de los módulos X y XIV abre el
-- 25/09/2026.» Los dos números están mal, y de dos maneras distintas.
--
-- El primero es el **dato**: la ventana admite el módulo 10 y el 13, y las
-- cohortes que van el 25 son la **9 y la 13**. Dicho por la organización el
-- 2026-09-24. Quien va en 9 leería mañana «Todavía no se anuncia la fecha de
-- registro para tu grupo» el día que sí le toca, y quien va en 10 entraría un
-- día que no es el suyo.
--
-- La `20260924120000` ya había visto la mitad de esto. Guardó el módulo XIV del
-- calendario como 13 —«es el número que trae el alumno y el que compara
-- `ventana_cohortes`»— y dejó escrito que el X guardado como 10 era «lo único
-- de esta migración que no está comprobado contra el padrón». Era eso: el mismo
-- desfase de uno. XIV es 13 y X es 9.
--
-- El segundo es el **rótulo**. Ese texto sale tal cual en la pantalla de «no te
-- toca todavía», y el alumno lo compara contra el número que él tiene: el de su
-- lista, 9 o 13. Un romano del documento administrativo no le dice si habla de
-- él. Pasa a decir los mismos números que compara la base.
--
-- Lo que esta migración NO toca, y hay que decidir
-- -----------------------------------------------
-- La segunda ventana —27 y 28— lleva a LEIP con los módulos II y VI, guardados
-- como 2 y 6. Si el desfase de uno vale para todo LEIP, esos serían 1 y 5, y
-- entonces los módulos 2 y 6 se quedarían fuera del registro sin que nadie se
-- entere hasta el día 27. **No se cambia aquí porque nadie lo ha confirmado**:
-- de la organización vino la corrección del 9 y el 13, no la de estos dos. Se
-- deja enunciado para que sea una pregunta abierta y no un descuido enterrado.
-- =============================================================================

update ventanas_preregistro
   set etiqueta = 'El registro de séptimo semestre y de los módulos 9 y 13'
 where etiqueta = 'El registro de séptimo semestre y de los módulos X y XIV';

/*
 * El 10 pasa a 9, y solo el de LEIP en esta ventana.
 *
 * Se acota por programa y por ventana en vez de por avance a secas: un `where
 * avance = 10` sin más tocaría cualquier otra cohorte que algún día llegue a
 * diez, y aquí lo que se corrige es una sola fila con nombre y apellido.
 */
update ventana_cohortes c
   set avance = 9
  from ventanas_preregistro v,
       programas p
 where v.id = c.ventana_id
   and p.id = c.programa_id
   and v.etiqueta = 'El registro de séptimo semestre y de los módulos 9 y 13'
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
   and c.avance = 10;

/*
 * Que la ventana del 25 quedó con las seis cohortes que debe, y no con otras.
 *
 * Un `update` que no encuentra nada no falla: afecta cero filas y Postgres lo
 * da por bueno. Si la etiqueta vieja no estaba —porque otra sesión la cambió
 * antes—, arriba no pasó nada y abajo tiene que notarse, porque el 25 es
 * mañana.
 */
do $$
declare
  v_ventana uuid;
  v_leip text := 'Licenciatura en Educación e Innovación Pedagógica';
  v_modulos smallint[];
  r record;
begin
  select id into v_ventana
    from ventanas_preregistro
   where etiqueta = 'El registro de séptimo semestre y de los módulos 9 y 13';

  if not found then
    raise exception
      'No hay ninguna ventana llamada «El registro de séptimo semestre y de los '
      'módulos 9 y 13»: el rótulo no se actualizó y el alumno sigue leyendo los romanos.';
  end if;

  select array_agg(c.avance order by c.avance) into v_modulos
    from ventana_cohortes c
    join programas p on p.id = c.programa_id
   where c.ventana_id = v_ventana
     and p.nombre = v_leip;

  if v_modulos is distinct from array[9, 13]::smallint[] then
    raise exception 'LEIP entra el 25 con los módulos %, y deben ser el 9 y el 13.',
      coalesce(v_modulos::text, 'ninguno');
  end if;

  raise notice 'Ventana del 25 y 26 de septiembre:';
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
