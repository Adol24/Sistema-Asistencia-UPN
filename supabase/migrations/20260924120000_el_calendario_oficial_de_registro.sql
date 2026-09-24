-- =============================================================================
-- El calendario oficial de registro
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924120000_el_calendario_oficial_de_registro`.
--
-- De dónde salen estas fechas
-- ---------------------------
-- Del «Calendario_registro-inscripción_XIV Encuentro Internacional», firmado
-- por Jefatura Administrativa y generado el 23/09/2026. Es el documento
-- oficial, y **ninguna de las tres ventanas cargadas hasta hoy coincidía con
-- él**: lo que había venía de conversaciones previas al documento.
--
-- El documento separa dos procesos que hasta ahora eran uno solo:
--
--   REGISTRO     el formulario en línea. Es lo que hace este sistema, y es lo
--                que estas ventanas gobiernan.
--   INSCRIPCIÓN  el pago presencial en ventanilla. NO lo gobierna esta
--                migración; su calendario se le enseña al alumno al terminar,
--                para que sepa qué día le toca ir a pagar.
--
-- Lo que cambia, renglón por renglón
-- ----------------------------------
--   séptimo semestre       del 21 al 27 de septiembre  →  25 y 26
--   séptimo, quiénes       cinco licenciaturas         →  cuatro: Educación
--                                                         Indígena no tiene
--                                                         séptimo
--   primer semestre        27-28, solo avance 1        →  27-28, avances 1, 3 y 5
--   LEIP                   entraba por avance 1 y 13   →  módulos II, VI, X y XIV
--   las tres maestrías     entraban por avance 13      →  módulos I y IV
--   docentes y externos    29 y 30 de septiembre       →  solo el 29
--
-- El módulo XIV se guarda como 13, y no es una errata
-- ---------------------------------------------------
-- LEIP llega al módulo XIV en el calendario porque esa generación va a pasar a
-- un módulo nuevo. En las listas de las que sale el padrón **todavía se trata
-- como módulo 13**, que es el número que trae el alumno y el que compara
-- `ventana_cohortes`. Por eso XIV entra aquí como 13, y por eso el
-- `total_avance` de LEIP —13— sigue siendo correcto.
--
-- Los otros tres módulos de LEIP sí van por su número: II es 2, VI es 6 y X es
-- 10. **Esto es lo único de esta migración que no está comprobado contra el
-- padrón**: si las listas también corrieran esos, la cohorte quedaría fuera y
-- leería «Todavía no se anuncia la fecha de registro para tu grupo». El bloque
-- del final enumera qué cohortes quedan sin ventana justamente para que eso se
-- vea al aplicar, en vez de descubrirlo el día 25 por un alumno que llama.
--
-- Por qué se ACTUALIZA en vez de borrar y volver a insertar
-- ---------------------------------------------------------
-- `fn_motivo_fuera_de_ventana` tiene un interruptor: con CERO ventanas, el
-- registro está abierto para todos. Borrar las tres y volver a insertarlas abre
-- esa puerta durante el borrado. Dentro de una transacción no se vería, pero no
-- todas las formas de aplicar una migración garantizan una. Se actualizan en su
-- sitio, y así no hay instante sin ventanas.
--
-- Las horas con `-06` explícito
-- -----------------------------
-- En México no hay horario de verano desde 2022, así que el desfase es fijo.
-- Sin zona se interpretarían en la del servidor —UTC— y la ventana abriría seis
-- horas antes, la tarde del día anterior, para quien estuviera mirando.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Las tres ventanas, con sus fechas del documento
--
-- Se localizan por la etiqueta que tienen HOY y se les pone la nueva. Si alguna
-- no apareciera, el bloque de comprobación del final lo dice: una ventana que
-- no se actualizó es una cohorte registrándose el día equivocado.
-- ---------------------------------------------------------------------------
update ventanas_preregistro
   set etiqueta = 'El registro de séptimo semestre y de los módulos X y XIV',
       abre     = '2026-09-25 00:00:00-06'::timestamptz,
       cierra   = '2026-09-26 23:59:59-06'::timestamptz
 where etiqueta = 'El registro previo para semestre 7 y módulo 13';

update ventanas_preregistro
   set etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos I, II, IV y VI',
       abre     = '2026-09-27 00:00:00-06'::timestamptz,
       cierra   = '2026-09-28 23:59:59-06'::timestamptz
 where etiqueta = 'El registro de primer semestre';

-- Docentes y externos conservan su etiqueta: es la que ya se le enseña a quien
-- llega antes de tiempo y la que comprueba `probar-sistema`. Lo único que
-- cambia es que cierra el 29 y no el 30.
update ventanas_preregistro
   set abre   = '2026-09-29 00:00:00-06'::timestamptz,
       cierra = '2026-09-29 23:59:59-06'::timestamptz
 where etiqueta = 'El registro previo para docentes y participantes externos';

-- ---------------------------------------------------------------------------
-- 2 · Las cohortes se vuelven a declarar desde cero
--
-- Borrar y reinsertar las FILAS de cohortes no abre ninguna puerta: una cohorte
-- sin ventana queda bloqueada, que es el lado seguro. El interruptor de «todo
-- abierto» mira `ventanas_preregistro`, y esas no se tocan aquí.
-- ---------------------------------------------------------------------------
delete from ventana_cohortes c
 using ventanas_preregistro v
 where v.id = c.ventana_id
   and v.etiqueta in (
     'El registro de séptimo semestre y de los módulos X y XIV',
     'El registro de primero, tercero y quinto semestre y de los módulos I, II, IV y VI'
   );

/*
 * 25 y 26 de septiembre.
 *
 * Los programas se nombran uno a uno y NO se filtran por nivel, porque el
 * calendario tampoco los agrupa: Educación Indígena es licenciatura y no tiene
 * séptimo, y LEIP es licenciatura y va por módulos. Filtrar por nivel metería a
 * las dos donde no van.
 *
 * El precio de nombrarlos es que un cambio de nombre en el catálogo rompe la
 * correspondencia en silencio. Por eso el bloque 4 comprueba que cada pareja
 * esperada acabó existiendo, y revienta la migración si falta alguna.
 */
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id, p.id, e.avance
  from ventanas_preregistro v
  cross join (values
    ('Licenciatura en Pedagogía',                          7::smallint),
    ('Licenciatura en Intervención Educativa',             7::smallint),
    ('Licenciatura en Psicología Educativa',               7::smallint),
    ('Licenciatura en Administración Educativa',           7::smallint),
    -- Módulo X.
    ('Licenciatura en Educación e Innovación Pedagógica',  10::smallint),
    -- Módulo XIV, que en las listas es 13. Ver la cabecera.
    ('Licenciatura en Educación e Innovación Pedagógica',  13::smallint)
  ) as e(programa, avance)
  join programas p on p.nombre = e.programa
 where v.etiqueta = 'El registro de séptimo semestre y de los módulos X y XIV'
on conflict (ventana_id, programa_id, avance) do nothing;

/*
 * 27 y 28 de septiembre.
 *
 * Las cinco licenciaturas de semestres —ahora sí con Educación Indígena, que
 * tiene primero, tercero y quinto aunque no tenga séptimo—, LEIP con sus dos
 * módulos bajos, y las tres maestrías con I y IV.
 *
 * Que la Maestría en Didácticas de Lenguas aparezca sin módulo impreso en el
 * documento no significa que no participe: va con I y IV como las otras dos.
 */
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id, p.id, e.avance
  from ventanas_preregistro v
  cross join (values
    ('Licenciatura en Pedagogía',                          1::smallint),
    ('Licenciatura en Pedagogía',                          3::smallint),
    ('Licenciatura en Pedagogía',                          5::smallint),
    ('Licenciatura en Intervención Educativa',             1::smallint),
    ('Licenciatura en Intervención Educativa',             3::smallint),
    ('Licenciatura en Intervención Educativa',             5::smallint),
    ('Licenciatura en Psicología Educativa',               1::smallint),
    ('Licenciatura en Psicología Educativa',               3::smallint),
    ('Licenciatura en Psicología Educativa',               5::smallint),
    ('Licenciatura en Administración Educativa',           1::smallint),
    ('Licenciatura en Administración Educativa',           3::smallint),
    ('Licenciatura en Administración Educativa',           5::smallint),
    ('Licenciatura en Educación Indígena',                 1::smallint),
    ('Licenciatura en Educación Indígena',                 3::smallint),
    ('Licenciatura en Educación Indígena',                 5::smallint),
    -- Módulos II y VI.
    ('Licenciatura en Educación e Innovación Pedagógica',  2::smallint),
    ('Licenciatura en Educación e Innovación Pedagógica',  6::smallint),
    -- Las tres maestrías, módulos I y IV.
    ('Maestría en Educación Básica',                       1::smallint),
    ('Maestría en Educación Básica',                       4::smallint),
    ('Maestría en Educación Media Superior',               1::smallint),
    ('Maestría en Educación Media Superior',               4::smallint),
    ('Maestría en Didácticas de Lenguas y Culturas Indoamericanas', 1::smallint),
    ('Maestría en Didácticas de Lenguas y Culturas Indoamericanas', 4::smallint)
  ) as e(programa, avance)
  join programas p on p.nombre = e.programa
 where v.etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos I, II, IV y VI'
on conflict (ventana_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · Los perfiles no cambian de ventana, solo de fecha
--
-- Docentes y externos siguen los dos en la misma, que es lo que evita el
-- bloqueo sin salida: en cuanto `ventana_perfiles` tiene una fila, el perfil
-- que no aparezca en ninguna lee «Todavía no se anuncia la fecha», sin fecha y
-- sin salida. Se reafirman aquí por si la utilidad que las cargó no se hubiera
-- corrido en algún entorno.
-- ---------------------------------------------------------------------------
insert into ventana_perfiles (ventana_id, perfil)
select v.id, e.perfil
  from ventanas_preregistro v
  cross join (values ('docente'), ('externo')) as e(perfil)
 where v.etiqueta = 'El registro previo para docentes y participantes externos'
on conflict (ventana_id, perfil) do nothing;

-- ---------------------------------------------------------------------------
-- 4 · Que lo de arriba sea verdad, y no solo intención
--
-- Cada pareja programa + avance del calendario se vuelve a buscar en la base.
-- Si el catálogo cambió un nombre, el `join` de arriba no encontró el programa
-- y la cohorte se quedó fuera EN SILENCIO. Aquí revienta.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_faltan integer := 0;
  v_siete integer;
  v_resto integer;
  v_total integer;
  v_cerradas integer := 0;
begin
  /*
   * Primero los NOMBRES, que es por donde esto se rompe.
   *
   * Los `insert` de arriba unen por `p.nombre = e.programa`. Un programa
   * renombrado en el catálogo no casa, la cohorte no se inserta y el `insert`
   * no se queja: devuelve menos filas y ya. Así que se comprueba aquí, y con el
   * nombre delante, que es lo que hay que ir a corregir.
   */
  for r in
    select n.nombre
      from (values
        ('Licenciatura en Pedagogía'),
        ('Licenciatura en Intervención Educativa'),
        ('Licenciatura en Psicología Educativa'),
        ('Licenciatura en Administración Educativa'),
        ('Licenciatura en Educación Indígena'),
        ('Licenciatura en Educación e Innovación Pedagógica'),
        ('Maestría en Educación Básica'),
        ('Maestría en Educación Media Superior'),
        ('Maestría en Didácticas de Lenguas y Culturas Indoamericanas')
      ) as n(nombre)
     where not exists (select 1 from programas p where p.nombre = n.nombre)
  loop
    v_faltan := v_faltan + 1;
    raise warning 'El catálogo no tiene ningún programa llamado «%»', r.nombre;
  end loop;

  if v_faltan > 0 then
    raise exception
      '% de los nueve programas del calendario no existen con ese nombre en '
      '`programas`. Sus cohortes NO se cargaron.', v_faltan;
  end if;

  -- Y luego las cuentas, que es lo que demuestra que entraron todas.
  select count(*) into v_siete
    from ventana_cohortes c
    join ventanas_preregistro v on v.id = c.ventana_id
   where v.etiqueta = 'El registro de séptimo semestre y de los módulos X y XIV';

  select count(*) into v_resto
    from ventana_cohortes c
    join ventanas_preregistro v on v.id = c.ventana_id
   where v.etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos I, II, IV y VI';

  -- Seis: cuatro séptimos más los módulos X y XIV.
  if v_siete <> 6 then
    raise exception
      'La ventana del 25-26 quedó con % cohortes y tiene que tener 6. '
      '¿Se actualizó la etiqueta de la ventana vieja?', v_siete;
  end if;

  -- Veintitrés: cinco licenciaturas por tres semestres, más II y VI de LEIP,
  -- más las tres maestrías por sus dos módulos.
  if v_resto <> 23 then
    raise exception
      'La ventana del 27-28 quedó con % cohortes y tiene que tener 23. '
      '¿Se actualizó la etiqueta de la ventana vieja?', v_resto;
  end if;

  select count(*) into v_total from ventana_cohortes;
  raise notice 'Calendario oficial aplicado. % cohortes declaradas en total.', v_total;
  raise notice '';

  for r in
    select v.etiqueta,
           to_char(v.abre   at time zone 'America/Mexico_City', 'DD/MM') as desde,
           to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM') as hasta,
           (select count(*) from ventana_cohortes c where c.ventana_id = v.id) as cohortes,
           (select count(*) from ventana_perfiles f where f.ventana_id = v.id) as perfiles
      from ventanas_preregistro v
     order by v.abre
  loop
    raise notice '  % · del % al % · % cohortes · % perfiles',
      r.etiqueta, r.desde, r.hasta, r.cohortes, r.perfiles;
  end loop;

  /*
   * Y lo que de verdad hay que mirar: quién sigue fuera.
   *
   * Una cohorte sin ventana lee «Todavía no se anuncia la fecha de registro
   * para tu grupo», que es correcto si de verdad no está invitada y es un
   * portazo silencioso si lo está. Aquí aparecería, por ejemplo, LEIP en un
   * módulo que las listas numeren distinto de como lo hace el calendario.
   */
  raise notice '';
  raise notice 'Cohortes SIN ventana (hoy no pueden registrarse):';
  for r in
    select p.nombre as programa,
           coalesce(p.etiqueta_avance, n.etiqueta_avance) as etiqueta,
           a.avance
      from programas p
      join niveles_academicos n on n.id = p.nivel_id
      cross join lateral generate_series(1, coalesce(p.total_avance, n.total_avance)) as a(avance)
     where p.activo
       and not exists (
         select 1 from ventana_cohortes c
          where c.programa_id = p.id and c.avance = a.avance
       )
     order by p.nombre, a.avance
  loop
    v_cerradas := v_cerradas + 1;
    raise notice '  % · % %', r.programa, r.etiqueta, r.avance;
  end loop;

  raise notice '';
  raise notice '% cohortes cerradas. Si alguna SÍ está invitada, le falta su ventana.', v_cerradas;
end;
$$;
