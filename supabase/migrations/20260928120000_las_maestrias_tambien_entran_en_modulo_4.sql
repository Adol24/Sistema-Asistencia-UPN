-- =============================================================================
-- Las maestrías también entran en módulo 4
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260928120000_las_maestrias_tambien_entran_en_modulo_4`.
--
-- Qué cambia
-- ----------
-- Las tres maestrías ganan el módulo 4 en las tres tablas que gobiernan su
-- calendario, y **conservan el 3**:
--
--   · `ventana_cohortes`      · quién puede pre-registrarse y cuándo
--   · `cita_cohortes`         · el respaldo de la cita de pago
--   · `dia_entrega_voucher`   · el día único para dejar el voucher
--
-- Quedan en 1, 3 y 4.
--
-- Por qué se AÑADE y no se sustituye
-- ----------------------------------
-- La organización dijo el 2026-09-28 que los módulos correctos son el 1 y el 4.
-- `20260925140000` había puesto 1 y 3 tres días antes, anotando que eso mismo lo
-- dijo la organización el 2026-09-25. Las dos cosas están escritas y se
-- contradicen, y lo que no hay es forma de comprobar desde aquí cuál número trae
-- el alumno en su lista: `padron_alumnos` no se lee sin sesión de personal.
--
-- Sustituir el 3 por el 4 apuesta a una de las dos versiones con una consecuencia
-- que no se puede deshacer a tiempo: si el padrón guarda el módulo IV como 3
-- —que es lo que afirma `20260925140000`—, esa generación de las tres maestrías
-- lee «Todavía no se anuncia la fecha de registro para tu grupo» y su ventana
-- cierra mañana. Añadir no tiene ese riesgo: entran los dos números, y quien
-- exista entra sea cual sea el que traiga.
--
-- Lo que cuesta es una cohorte declarada que quizá no tenga a nadie. Eso no
-- rechaza a ningún alumno ni le enseña nada a nadie: `ventana_cohortes` solo
-- ABRE puertas, y una puerta que nadie cruza no molesta. Es el lado barato del
-- error, y por eso se elige a sabiendas.
--
-- Cuando se pueda mirar el padrón con permisos, la consulta que lo resuelve está
-- al final de esta migración. Si el 4 resulta estar vacío, se retira como se
-- retiró Administración 1º y 3º en `20260925160000`: comprobado primero.
--
-- Las tres tablas a la vez, y no solo la ventana
-- ----------------------------------------------
-- Tocar solo `ventana_cohortes` es el agujero que ya se abrió dos veces —con
-- LEIP en `20260924120000` y con las maestrías en `20260925140000`—: la
-- generación se registra y después no sabe qué día ir a pagar. Y hay una
-- comprobación cruzada, heredada de `20260924230000`, que exige que ninguna
-- cohorte tenga ventana sin cita ni cita sin ventana; añadir el 4 a una sola la
-- rompería.
--
-- Por qué se ancla en las filas del módulo 1 y no en la etiqueta
-- -------------------------------------------------------------
-- Cada `insert` copia las filas que ya existen para el módulo 1 de ese mismo
-- programa. No se nombra la ventana por su etiqueta a propósito: las ventanas se
-- editan desde `/admin/configuracion`, y de hecho **ya se editaron** —sus fechas
-- vivas no son las que sembró `20260924120000`—. Una etiqueta escrita aquí es
-- una cadena que cualquiera puede cambiar desde el panel sin saber que esta
-- migración la cita, y entonces el `insert` no empata nada y se calla.
--
-- El módulo 1 es el ancla porque es el que las tres maestrías tienen en las tres
-- tablas y el único que ninguna de las dos versiones discute. La ventana, la
-- cita, la sede y el día salen de ahí, así que el 4 hereda exactamente el
-- calendario del 1 sin que nadie tenga que volver a escribirlo.
--
-- Se filtra por NIVEL y no por nombre, por la razón que dejó escrita
-- `20260925140000`: son las tres maestrías del catálogo, lo que las define es su
-- nivel, y una lista de nombres a mano es lo que se queda atrás en silencio el
-- día que se dé de alta una cuarta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La ventana: quién puede pre-registrarse
-- ---------------------------------------------------------------------------
insert into ventana_cohortes (ventana_id, programa_id, avance)
select c.ventana_id, c.programa_id, 4::smallint
  from ventana_cohortes c
  join programas p on p.id = c.programa_id
  join niveles_academicos n on n.id = p.nivel_id
 where n.nivel = 'Maestría'
   and c.avance = 1
on conflict (ventana_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · La cita: el respaldo de `fn_cita_de_pago`
--
-- Es el rango ancho que se enseña cuando una cohorte no tiene día exacto. Se
-- añade aunque el paso 3 le ponga día exacto al 4, porque la comprobación
-- cruzada del final exige la pareja completa y porque un día exacto que
-- desaparezca deja el respaldo en pie en vez de un hueco.
-- ---------------------------------------------------------------------------
insert into cita_cohortes (cita_id, programa_id, avance)
select c.cita_id, c.programa_id, 4::smallint
  from cita_cohortes c
  join programas p on p.id = c.programa_id
  join niveles_academicos n on n.id = p.nivel_id
 where n.nivel = 'Maestría'
   and c.avance = 1
on conflict (cita_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · El día único para dejar el voucher
--
-- Copia sede por sede y grupo por grupo lo que tiene el módulo 1, que en los
-- posgrados es el comodín `*` en todos los planteles con fecha 2026-10-03. El
-- `do update` la hace repetible: si el 4 ya estuviera puesto con otra fecha,
-- queda con la del 1, que es la que manda para todo el posgrado.
-- ---------------------------------------------------------------------------
insert into dia_entrega_voucher (programa_id, plantel_id, avance, grupo, fecha)
select d.programa_id, d.plantel_id, 4::smallint, d.grupo, d.fecha
  from dia_entrega_voucher d
  join programas p on p.id = d.programa_id
  join niveles_academicos n on n.id = p.nivel_id
 where n.nivel = 'Maestría'
   and d.avance = 1
on conflict (programa_id, plantel_id, avance, grupo) do update
  set fecha = excluded.fecha;

-- ---------------------------------------------------------------------------
-- 4 · Que lo de arriba sea verdad
--
-- Cinco comprobaciones, y las cinco detienen la migración si fallan. Ninguna
-- afirma nada que no haya leído de las tablas.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_maestrias integer;
  v_mal integer := 0;
  v_dias integer;
  v_pares integer;
  v_en_padron integer;
begin
  select count(*) into v_maestrias
    from programas p
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Maestría';

  if v_maestrias = 0 then
    raise exception 'El catálogo no tiene ninguna maestría. No se añadió nada.';
  end if;

  -- 1 · cada maestría con los tres módulos en la ventana, y los tres en la MISMA
  --
  -- `ventanas` se cuenta solo sobre las filas de 1, 3 y 4. Contar todas las del
  -- programa daría un falso positivo el día que a una maestría se le abra otra
  -- ventana para otro módulo, que es exactamente lo que ya le pasa a LEIP: está
  -- en la del 24 con 9 y 13 y en la del 27 con 1 y 5, y eso es correcto.
  for r in
    select p.nombre,
           count(*) filter (where c.avance in (1, 3, 4)) as puestos,
           count(distinct c.ventana_id) filter (where c.avance in (1, 3, 4)) as ventanas
      from programas p
      join niveles_academicos n on n.id = p.nivel_id
      left join ventana_cohortes c on c.programa_id = p.id
     where n.nivel = 'Maestría'
     group by p.nombre
  loop
    if r.puestos <> 3 then
      v_mal := v_mal + 1;
      raise warning '% tiene % de los módulos 1, 3 y 4 en su ventana', r.nombre, r.puestos;
    elsif r.ventanas <> 1 then
      v_mal := v_mal + 1;
      raise warning '% quedó repartida en % ventanas distintas', r.nombre, r.ventanas;
    end if;
  end loop;

  -- 2 · y los tres módulos en la cita
  for r in
    select p.nombre, count(*) filter (where c.avance in (1, 3, 4)) as puestos
      from programas p
      join niveles_academicos n on n.id = p.nivel_id
      left join cita_cohortes c on c.programa_id = p.id
     where n.nivel = 'Maestría'
     group by p.nombre
  loop
    if r.puestos <> 3 then
      v_mal := v_mal + 1;
      raise warning '% tiene % de los módulos 1, 3 y 4 en su cita de pago', r.nombre, r.puestos;
    end if;
  end loop;

  if v_mal > 0 then
    raise exception
      '% cohortes de maestría no quedaron declaradas. Se detiene: una ventana a '
      'medias deja a una generación sin poder registrarse.', v_mal;
  end if;

  -- 3 · el día del voucher del módulo 4 coincide con el del 1, sede por sede
  select count(*) into v_dias
    from dia_entrega_voucher uno
    join programas p on p.id = uno.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Maestría'
     and uno.avance = 1
     and not exists (
       select 1
         from dia_entrega_voucher cuatro
        where cuatro.programa_id = uno.programa_id
          and cuatro.plantel_id = uno.plantel_id
          and cuatro.grupo      = uno.grupo
          and cuatro.avance     = 4
          and cuatro.fecha      = uno.fecha
     );

  if v_dias > 0 then
    raise exception
      '% filas del módulo 1 de maestría no tienen su gemela en el módulo 4. El '
      '4 se registraría sin saber qué día ir a pagar.', v_dias;
  end if;

  -- 4 · la comprobación cruzada de `20260924230000`, que este cambio puede
  --     romper: nadie con ventana y sin cita, ni con cita y sin ventana
  v_pares := 0;
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
  loop
    v_pares := v_pares + 1;
    raise warning '% · avance % · %', r.programa, r.avance, r.que;
  end loop;

  if v_pares > 0 then
    raise exception
      '% cohortes quedaron descompensadas entre ventana y cita. Se detiene.', v_pares;
  end if;

  -- 5 · qué quedó, leído de las tablas
  raise notice 'Las maestrías ya entran en los módulos 1, 3 y 4.';
  raise notice '';
  for r in
    select p.nombre,
           (select string_agg(c.avance::text, ', ' order by c.avance)
              from ventana_cohortes c where c.programa_id = p.id) as ventana,
           (select string_agg(distinct c.avance::text, ', ')
              from cita_cohortes c where c.programa_id = p.id) as cita,
           (select count(*) from dia_entrega_voucher d where d.programa_id = p.id) as dias
      from programas p
      join niveles_academicos n on n.id = p.nivel_id
     where n.nivel = 'Maestría'
     order by p.nombre
  loop
    raise notice '  %', r.nombre;
    raise notice '     ventana: módulos %  ·  cita: módulos %  ·  % filas de día de voucher',
      r.ventana, r.cita, r.dias;
  end loop;

  /*
   * Y el dato que decide si el 4 se queda o se retira.
   *
   * CERO no es un fallo aquí, y tampoco es prueba de que el 4 no exista: puede
   * ser que el padrón de las maestrías todavía no esté cargado. Lo que se
   * imprime es lo que hay, para poder volver sobre esto con un número en la mano
   * en vez de con dos versiones contradictorias.
   */
  select count(*) into v_en_padron
    from padron_alumnos a
    join programas p on p.id = a.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Maestría'
     and a.avance = 4;

  raise notice '';
  raise notice 'Alumnos de maestría con avance 4 en el padrón ahora mismo: %', v_en_padron;
  raise notice '  Para repartirlos por módulo y decidir si el 3 o el 4 sobra:';
  raise notice '    select p.nombre, a.avance, count(*)';
  raise notice '      from padron_alumnos a';
  raise notice '      join programas p on p.id = a.programa_id';
  raise notice '      join niveles_academicos n on n.id = p.nivel_id';
  raise notice '     where n.nivel = ''Maestría'' group by 1, 2 order by 1, 2;';
end;
$$;
