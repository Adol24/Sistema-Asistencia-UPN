-- =============================================================================
-- Los módulos de LEIP van TODOS corridos, no solo el último
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924160000_los_modulos_de_leip_van_todos_corridos`.
--
-- Lo que se supo al aplicar
-- -------------------------
-- `20260924120000` tradujo los módulos del calendario oficial a los números del
-- padrón, y acertó en uno solo. Decía que el XIV se guarda como 13 —porque esa
-- generación todavía no pasa de módulo— pero dio por hecho que los otros tres
-- iban por su número: II como 2, VI como 6, X como 10. Su propia cabecera lo
-- marcaba como lo único sin comprobar contra el padrón.
--
-- No iban. Las listas corren **todos** los módulos una posición, no solo el
-- último:
--
--   calendario   II    VI    X    XIV
--   padrón        1     5    9     13
--
-- Las ventanas de registro ya se corrigieron a mano al aplicarlas. `cita_cohortes`
-- no, y ahí es donde muerde: las tres cohortes bajas de LEIP pueden registrarse
-- —tienen ventana— y al terminar su comprobante NO les dice qué día ir a pagar,
-- porque su cita está declarada con el número equivocado. Solo el módulo 13
-- queda bien, que es justo el que sí se había comprobado.
--
--   con ventana y sin cita:   LEIP avance 1, 5 y 9   ← nadie les dice cuándo pagar
--   con cita y sin ventana:   LEIP avance 2, 6 y 10  ← filas muertas
--
-- Lo que ya estaba bien, y se reescribe igual
-- -------------------------------------------
-- `ventana_cohortes` y las dos etiquetas se corrigieron a mano al aplicar. Esta
-- migración las vuelve a dejar exactamente como están, y no es por gusto: un
-- entorno nuevo aplica los archivos en orden y sin esto acabaría con lo que
-- `20260924120000` escribió —módulos 2, 6 y 10, y etiquetas con romanos— en vez
-- de con lo que hay en producción. Repetir lo correcto cuesta nada; que el
-- repositorio y la base cuenten cosas distintas cuesta la siguiente sesión.
--
-- Las etiquetas se quedan con los números del padrón, no con los romanos del
-- calendario, y está bien pensado: esa frase se le enseña a quien llega fuera
-- de plazo, y el número que esa persona reconoce es el de su lista.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0 · Las etiquetas, tal como quedaron al aplicar
--
-- Al pegar `20260924120000` se corrigieron a mano, y con buen criterio: decían
-- «los módulos X y XIV», que es como los nombra el calendario oficial, y quien
-- lee ese aviso reconoce el número de SU lista, que es 9. Aquí se fijan por
-- `abre` —no por la etiqueta anterior, que ya no existe— para que un entorno
-- nuevo acabe con el mismo texto que producción en vez de con el del archivo.
-- ---------------------------------------------------------------------------
update ventanas_preregistro
   set etiqueta = 'El registro de séptimo semestre y de los módulos 9 y 13'
 where abre = '2026-09-25 00:00:00-06'::timestamptz;

update ventanas_preregistro
   set etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 4 y 5'
 where abre = '2026-09-27 00:00:00-06'::timestamptz;

-- ---------------------------------------------------------------------------
-- 1 · Las cuatro cohortes de LEIP, con los números del padrón
--
-- Se borran las de LEIP y se vuelven a poner, en las dos tablas. Borrar solo lo
-- de LEIP y no todo es deliberado: las demás cohortes están bien comprobadas y
-- no hay por qué moverlas.
-- ---------------------------------------------------------------------------
delete from ventana_cohortes c
 using programas p
 where p.id = c.programa_id
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica';

delete from cita_cohortes c
 using programas p
 where p.id = c.programa_id
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica';

-- Módulos 9 y 13 (X y XIV en el calendario): se registran el 25 y 26.
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id, p.id, e.avance
  from ventanas_preregistro v
  cross join (values (9::smallint), (13::smallint)) as e(avance)
  cross join programas p
 where v.abre = '2026-09-25 00:00:00-06'::timestamptz
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
on conflict (ventana_id, programa_id, avance) do nothing;

-- Módulos 1 y 5 (II y VI): se registran el 27 y 28.
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id, p.id, e.avance
  from ventanas_preregistro v
  cross join (values (1::smallint), (5::smallint)) as e(avance)
  cross join programas p
 where v.abre = '2026-09-27 00:00:00-06'::timestamptz
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
on conflict (ventana_id, programa_id, avance) do nothing;

/*
 * Y las cuatro a la misma cita de pago, que es la que no tiene fecha.
 *
 * Las ventanas se localizan por `abre` y no por su etiqueta: la etiqueta se
 * corrigió a mano al aplicar `20260924120000` y no coincide con la que aquel
 * archivo escribió, así que buscarla por texto no encontraría nada. La fecha de
 * apertura sí es la misma en el archivo y en producción.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values (1::smallint), (5::smallint), (9::smallint), (13::smallint)) as e(avance)
  cross join programas p
 where c.cuando = 'el día de tu reinscripción'
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
on conflict (cita_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Que las dos tablas digan lo mismo
--
-- Es la comprobación que importa y no las cuentas: una cohorte que puede
-- registrarse y no sabe cuándo pagar llega al final del formulario y se queda
-- sin la mitad de la respuesta. Y una cita que nadie alcanza es una fila que
-- miente al que lea la tabla.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_mal integer := 0;
begin
  for r in
    select p.nombre as programa, c.avance, 'con ventana y SIN cita' as que
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from cita_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     union all
    select p.nombre, c.avance, 'con cita y SIN ventana'
      from cita_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from ventana_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     order by 1, 2
  loop
    v_mal := v_mal + 1;
    raise warning '% · avance % · %', r.programa, r.avance, r.que;
  end loop;

  if v_mal > 0 then
    raise exception
      '% cohortes descuadradas entre registro e inscripción. Cada una es alguien '
      'que se registra sin saber cuándo pagar, o una cita que nadie alcanza.', v_mal;
  end if;

  raise notice 'Registro e inscripción cuadran: toda cohorte que puede registrarse';
  raise notice 'sabe qué día le toca pagar, y ninguna cita se queda sin dueño.';
  raise notice '';

  for r in
    select coalesce(p.etiqueta_avance, n.etiqueta_avance) as etiqueta,
           c.avance,
           (select v.etiqueta from ventanas_preregistro v where v.id = c.ventana_id) as ventana,
           (select i.cuando
              from cita_cohortes cc
              join citas_inscripcion i on i.id = cc.cita_id
             where cc.programa_id = c.programa_id and cc.avance = c.avance
             limit 1) as cita
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
      join niveles_academicos n on n.id = p.nivel_id
     where p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
     order by c.avance
  loop
    raise notice 'LEIP % % · registro: % · pago: %', r.etiqueta, r.avance, r.ventana, r.cita;
  end loop;
end;
$$;
