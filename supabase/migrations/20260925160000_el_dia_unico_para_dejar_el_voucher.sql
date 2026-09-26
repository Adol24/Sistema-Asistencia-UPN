-- =============================================================================
-- El día único para dejar el voucher
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260925160000_el_dia_unico_para_dejar_el_voucher`.
--
-- Qué cambia
-- ----------
-- Hasta hoy, al terminar el pre-registro el alumno leía un RANGO: «29 y 30 de
-- septiembre, y 1 y 2 de octubre». Cuatro días para escoger, y ninguno suyo.
-- Desde aquí lee UN día, el que le toca.
--
-- El rango no era un texto provisional: era lo único que se podía decir con lo
-- que había en la base. `cita_cohortes` identifica una cita por
-- `(programa, avance)`, y con eso la fecha es irresoluble, porque en el
-- calendario oficial la fecha depende del PLANTEL. Pedagogía 1º tiene once
-- citas en tres días y cinco sedes; las cuatro fechas del texto son la unión de
-- todas ellas. A un alumno de Pedagogía 1º de Huehuetla se le decían cuatro
-- días para que fuera uno: el 2 de octubre.
--
-- De dónde sale la fecha
-- ----------------------
-- Del PDF «Calendario inscripción_XIV Encuentro Internacional_horarios-1-2»,
-- que entregó la organización el 25 de septiembre: 73 citas con fecha, grupo,
-- hora y sede. No se transcribió a mano —se reconstruyó la rejilla del
-- documento y se derivó el agrupamiento, para no heredar los errores que comete
-- la extracción de texto plana sobre celdas combinadas—.
--
-- Por qué el grupo sigue en la llave si casi nunca importa
-- -------------------------------------------------------
-- Porque una vez importa. En 22 de las 23 cohortes-plantel de licenciatura
-- todos los grupos van el mismo día, y basta `(programa, avance, plantel)`.
-- La excepción es **Intervención Educativa 5º en Teziutlán**: el grupo A va el
-- 29 de septiembre y los grupos B y C el 30. Si el grupo saliera de la llave,
-- esa cohorte quedaría sin poder expresarse, y son dos días distintos para
-- alumnos de la misma sede y el mismo semestre.
--
-- El comodín `*`
-- --------------
-- Enumerar los grupos uno por uno tiene un modo de fallar caro: si el padrón
-- trae un grupo que el calendario no lista —una F que se abrió después, o un
-- `grupo` nulo, que la columna permite—, ese alumno se queda sin día y vuelve
-- al rango. Así que la fila se declara con `grupo = '*'`, que significa
-- «cualquier grupo de esta cohorte en esta sede», y solo se baja a grupo
-- concreto donde el día de verdad cambia.
--
-- La búsqueda prueba primero el grupo exacto y luego el comodín. Eso deja la
-- excepción y la regla conviviendo en una sola tabla, y en el orden correcto:
-- lo específico gana.
--
-- Por qué la tabla se renombra
-- ----------------------------
-- `dia_reinscripcion` nació el 25 de septiembre para LEIP, y el nombre era
-- exacto ahí: el pago de LEIP cae el día de su reinscripción. Para Pedagogía no
-- lo es —el 1 de octubre no es la reinscripción de nadie, es el día que la sede
-- recibe vouchers—. Se renombra a `dia_entrega_voucher`, que es lo que la tabla
-- dice en los nueve programas. Nada fuera de su propia migración la
-- referenciaba, así que el renombre no arrastra a nadie.
--
-- Administración Educativa 1º y 3º se retiran
-- -------------------------------------------
-- No aparecen en el calendario oficial —de Administración solo hay 7º el 28 y
-- 5º el 29— y la organización confirmó que esas generaciones no existen: no hay
-- alumnos de Administración 1º ni 3º en el padrón. Estaban declaradas en
-- `ventana_cohortes` y `cita_cohortes` por simetría con las otras
-- licenciaturas, no porque alguien las hubiera comprobado.
--
-- Se retiran de las dos a la vez, porque la comprobación cruzada del final
-- exige que ninguna cohorte tenga ventana sin cita ni cita sin ventana.
--
-- Lo que esta migración NO hace
-- -----------------------------
-- **No enseña la hora.** El calendario la trae por grupo (08:30, 11:00), y se
-- decidió no pintarla: compromete a la ventanilla con un minuto exacto que el
-- documento fija para la inscripción, no para recibir un voucher. La hora se
-- queda en el PDF; si algún día se quiere, hace falta una columna.
--
-- **No le da día a los docentes.** El calendario sí les pone uno —30 de
-- septiembre, 15:00, en su propia sede— y hoy el sistema no se lo dice. No se
-- arregla aquí porque no se puede: `fn_cita_de_pago` recibe una matrícula y
-- resuelve por `padron_alumnos`, y un docente no está en el padrón. Hace falta
-- otra vía de consulta, por perfil, y eso es otro cambio.
--
-- **No corrige los textos de `citas_inscripcion`.** Siguen siendo los rangos
-- anchos, y siguen siendo el respaldo de la función. Con esta carga quedan
-- inalcanzables para toda cohorte declarada, así que se dejan como red: el día
-- que alguien quede fuera de la tabla, leerá algo cierto aunque impreciso, en
-- vez de no leer nada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- La tabla pasa a llamarse por lo que guarda
--
-- Con guarda, para que reaplicar la migración no falle: si ya se renombró, no
-- hay nada que hacer.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
        select 1 from pg_tables
         where schemaname = 'public' and tablename = 'dia_reinscripcion'
      )
     and not exists (
        select 1 from pg_tables
         where schemaname = 'public' and tablename = 'dia_entrega_voucher'
      )
  then
    alter table dia_reinscripcion rename to dia_entrega_voucher;
  end if;
end $$;

comment on table dia_entrega_voucher is
  'El día único en que cada grupo pasa a dejar su voucher. Sale del calendario '
  'oficial de inscripción, donde la fecha depende del plantel y no solo de la '
  'generación. `grupo = ''*''` vale para cualquier grupo de esa cohorte en esa sede.';

comment on column dia_entrega_voucher.grupo is
  'La letra tal como la guarda el padrón, o `*` para «cualquier grupo de esta '
  'cohorte en esta sede». El comodín es la regla y la letra la excepción: solo '
  'se baja a letra donde el día de verdad cambia entre grupos de la misma sede.';

-- La política y los permisos se rehacen con el nombre nuevo. Sigue siendo
-- lectura solo para personal interno: la tabla entera es un calendario de
-- planeación, y quien la necesita de fuera la recibe filtrada por
-- `fn_cita_de_pago`, que es `security definer`.
drop policy if exists dia_reinscripcion_lectura on dia_entrega_voucher;
drop policy if exists dia_entrega_voucher_lectura on dia_entrega_voucher;
create policy dia_entrega_voucher_lectura on dia_entrega_voucher
  for select to authenticated using (es_interno_activo());

revoke all on dia_entrega_voucher from anon;
grant select on dia_entrega_voucher to authenticated;

-- ---------------------------------------------------------------------------
-- Administración Educativa 1º y 3º: fuera de ventana y fuera de cita
--
-- Primero la cita y después la ventana, aunque el orden no importe para la
-- integridad: no hay clave ajena entre ellas. Importa para leerlo.
-- ---------------------------------------------------------------------------
delete from cita_cohortes c
 using programas p
 where p.id = c.programa_id
   and p.nombre = 'Licenciatura en Administración Educativa'
   and c.avance in (1, 3);

delete from ventana_cohortes c
 using programas p
 where p.id = c.programa_id
   and p.nombre = 'Licenciatura en Administración Educativa'
   and c.avance in (1, 3);

-- ---------------------------------------------------------------------------
-- Las licenciaturas, cohorte por cohorte y sede por sede
--
-- Se borra antes de insertar solo lo que esta migración gobierna —las ocho
-- licenciaturas y las maestrías—, y NO las filas de LEIP, que las cargó
-- `20260925120000` con su propio calendario de reinscripciones y siguen siendo
-- válidas. Por eso el `delete` excluye LEIP en vez de vaciar la tabla.
-- ---------------------------------------------------------------------------
delete from dia_entrega_voucher d
 using programas p
 where p.id = d.programa_id
   and p.nombre <> 'Licenciatura en Educación e Innovación Pedagógica';

/*
 * Las 22 cohortes-plantel donde todos los grupos van el mismo día.
 *
 * El comentario de cada fila dice qué grupos trae el calendario para esa
 * cohorte: es lo que respalda que el comodín no esté tapando una diferencia.
 */
insert into dia_entrega_voucher (programa_id, plantel_id, avance, grupo, fecha)
select p.id, pl.id, e.avance, e.grupo, e.fecha
  from (values
    -- 28 de septiembre · séptimo, las dos licenciaturas que abren
    ('Licenciatura en Administración Educativa',  7::smallint, 'Teziutlán',                 '*', '2026-09-28'::date), -- A
    ('Licenciatura en Intervención Educativa',    7::smallint, 'Teziutlán',                 '*', '2026-09-28'::date), -- A, B, C

    -- 29 de septiembre
    ('Licenciatura en Psicología Educativa',      7::smallint, 'Teziutlán',                 '*', '2026-09-29'::date), -- A
    ('Licenciatura en Pedagogía',                 7::smallint, 'Teziutlán',                 '*', '2026-09-29'::date), -- A, B, C, D, E
    ('Licenciatura en Administración Educativa',  5::smallint, 'Teziutlán',                 '*', '2026-09-29'::date), -- A
    ('Licenciatura en Intervención Educativa',    1::smallint, 'Teziutlán',                 '*', '2026-09-29'::date), -- A, B, C
    ('Licenciatura en Intervención Educativa',    3::smallint, 'Teziutlán',                 '*', '2026-09-29'::date), -- A, B, C

    -- 30 de septiembre
    ('Licenciatura en Psicología Educativa',      1::smallint, 'Teziutlán',                 '*', '2026-09-30'::date), -- A
    ('Licenciatura en Psicología Educativa',      3::smallint, 'Teziutlán',                 '*', '2026-09-30'::date), -- A
    ('Licenciatura en Psicología Educativa',      5::smallint, 'Teziutlán',                 '*', '2026-09-30'::date), -- A
    ('Licenciatura en Pedagogía',                 1::smallint, 'Teziutlán',                 '*', '2026-09-30'::date), -- A, B, C, D, E
    ('Licenciatura en Pedagogía',                 3::smallint, 'Teziutlán',                 '*', '2026-09-30'::date), -- A, B, C, D

    -- 1 de octubre · Pedagogía se reparte entre Teziutlán y Hueyapan
    ('Licenciatura en Pedagogía',                 5::smallint, 'Teziutlán',                 '*', '2026-10-01'::date), -- A, B, C
    ('Licenciatura en Pedagogía',                 1::smallint, 'Hueyapan',                  '*', '2026-10-01'::date), -- A, B, C
    ('Licenciatura en Pedagogía',                 3::smallint, 'Hueyapan',                  '*', '2026-10-01'::date), -- A, B, C
    ('Licenciatura en Pedagogía',                 5::smallint, 'Hueyapan',                  '*', '2026-10-01'::date), -- A, B, C, D

    -- 2 de octubre · las subsedes de Pedagogía y toda Educación Indígena
    ('Licenciatura en Pedagogía',                 1::smallint, 'Hueytamalco',               '*', '2026-10-02'::date), -- A
    ('Licenciatura en Pedagogía',                 1::smallint, 'San Miguel Tenextatiloyan', '*', '2026-10-02'::date), -- A, B
    ('Licenciatura en Pedagogía',                 1::smallint, 'Huehuetla',                 '*', '2026-10-02'::date), -- A
    ('Licenciatura en Educación Indígena',        1::smallint, 'Hueyapan',                  '*', '2026-10-02'::date), -- A, B, C
    ('Licenciatura en Educación Indígena',        3::smallint, 'Hueyapan',                  '*', '2026-10-02'::date), -- A, B
    ('Licenciatura en Educación Indígena',        5::smallint, 'Hueyapan',                  '*', '2026-10-02'::date)  -- A, B
  ) as e(programa, avance, sede, grupo, fecha)
  join programas p on p.nombre = e.programa
  join planteles pl on pl.nombre = e.sede
on conflict (programa_id, plantel_id, avance, grupo) do update
  set fecha = excluded.fecha;

/*
 * La única cohorte donde el grupo decide el día.
 *
 * Intervención Educativa 5º de Teziutlán: el grupo A cierra el 29 a las 11:30 y
 * los grupos B y C abren el 30 a las 08:00 y 08:30. No se declara comodín para
 * esta cohorte a propósito: si mañana aparece un grupo D en el padrón, es mejor
 * que caiga al rango —ancho pero cierto— que heredar en silencio el día de sus
 * compañeros, que sería una fecha inventada con apariencia de dato.
 */
insert into dia_entrega_voucher (programa_id, plantel_id, avance, grupo, fecha)
select p.id, pl.id, 5::smallint, e.grupo, e.fecha
  from (values
    ('A', '2026-09-29'::date),
    ('B', '2026-09-30'::date),
    ('C', '2026-09-30'::date)
  ) as e(grupo, fecha)
  cross join programas p
  join planteles pl on pl.nombre = 'Teziutlán'
 where p.nombre = 'Licenciatura en Intervención Educativa'
on conflict (programa_id, plantel_id, avance, grupo) do update
  set fecha = excluded.fecha;

/*
 * Los posgrados · 3 de octubre, los tres programas y los dos módulos.
 *
 * Aquí la fecha NO depende del plantel ni del grupo: la organización lo fijó
 * como una sola fecha para todo el posgrado. Por eso se cruza contra TODOS los
 * planteles en vez de contra los cuatro que nombra el documento —Teziutlán,
 * Hueyapan, Guadalupe Victoria y Ayotoxco—: la regla es por programa, así que
 * una maestría en cualquier otra sede tiene la misma fecha, y enumerar solo las
 * cuatro dejaría sin día a quien no esté en ellas.
 *
 * Los módulos van como 1 y 3 y no como 1 y 4: el calendario los escribe I y IV,
 * y `20260925140000` ya fijó que el IV de las maestrías es el módulo 3. El
 * grupo es comodín porque el documento lista las especialidades del módulo IV
 * —«Ambiente A», «Lengua B», «Gestión A», «Naturaleza A»— donde el padrón
 * guarda una letra, y ninguna de ellas cambia el día.
 */
insert into dia_entrega_voucher (programa_id, plantel_id, avance, grupo, fecha)
select p.id, pl.id, e.avance, '*', '2026-10-03'::date
  from (values (1::smallint), (3::smallint)) as e(avance)
  cross join planteles pl
  join programas p
    on p.nombre in (
      'Maestría en Educación Básica',
      'Maestría en Educación Media Superior',
      'Maestría en Didácticas de Lenguas y Culturas Indoamericanas'
    )
on conflict (programa_id, plantel_id, avance, grupo) do update
  set fecha = excluded.fecha;

-- ---------------------------------------------------------------------------
-- La consulta, ahora con comodín
--
-- Se reescribe entera y no se parchea: el cambio está en el `select` del día,
-- que pasa de una igualdad a «exacto, y si no, comodín», y leerlo completo es
-- más corto que leer un diff mental.
--
-- `order by` con el grupo exacto primero es lo que implementa la precedencia.
-- No se resuelve con dos consultas porque una sola con `limit 1` dice la regla
-- en el mismo sitio donde se aplica.
-- ---------------------------------------------------------------------------
create or replace function fn_cita_de_pago(p_matricula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a record;
  v_fecha date;
  v_cuando text;
  v_grupo text;
  /*
   * Los nombres en español se arman a mano y no con `to_char`: el formato con
   * nombres depende de la configuración regional del servidor, que aquí no
   * controlamos, y «Friday 2 de October» sería peor que no decir el día.
   */
  v_dias constant text[] := array[
    'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  v_meses constant text[] := array[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
begin
  select programa_id, plantel_id, avance, grupo
    into v_a
    from padron_alumnos
   where matricula = trim(p_matricula);

  -- Quien no está en el padrón no tiene cita, y no se le dice más: contestar
  -- distinto a una matrícula que existe y a otra que no es un enumerador.
  if not found then
    return null;
  end if;

  -- El padrón permite `grupo` nulo, y la tabla de días no: se normaliza a
  -- cadena vacía, que no empata con ninguna letra y por eso cae al comodín.
  v_grupo := upper(trim(coalesce(v_a.grupo, '')));

  select d.fecha
    into v_fecha
    from dia_entrega_voucher d
   where d.programa_id = v_a.programa_id
     and d.plantel_id = v_a.plantel_id
     and d.avance = v_a.avance
     and d.grupo in (v_grupo, '*')
   order by case when d.grupo = v_grupo then 0 else 1 end
   limit 1;

  if v_fecha is not null then
    return jsonb_build_object(
      'cuando', format('%s %s de %s',
        v_dias[extract(dow from v_fecha)::int + 1],
        extract(day from v_fecha)::int,
        v_meses[extract(month from v_fecha)::int]),
      'estricto', true
    );
  end if;

  -- El respaldo: la cita general de su cohorte. Con el calendario cargado esto
  -- solo se alcanza si alguien queda fuera de la tabla —un programa nuevo, una
  -- sede que nadie declaró—, y entonces un rango ancho es mejor que un hueco.
  select c.cuando
    into v_cuando
    from cita_cohortes cc
    join citas_inscripcion c on c.id = cc.cita_id
   where cc.programa_id = v_a.programa_id
     and cc.avance = v_a.avance
   order by c.orden
   limit 1;

  if v_cuando is null then
    return null;
  end if;

  return jsonb_build_object('cuando', v_cuando, 'estricto', false);
end;
$$;

revoke all on function fn_cita_de_pago(text) from public, anon, authenticated;
grant execute on function fn_cita_de_pago(text) to anon, authenticated;

comment on function fn_cita_de_pago is
  'Qué día le toca ir a dejar su voucher a quien tiene esa matrícula. Con el '
  'calendario oficial cargado, `estricto` es cierto para toda cohorte declarada: '
  'es un día único y no un rango. NULL si no está en el padrón o no tiene cita.';

-- ---------------------------------------------------------------------------
-- Que lo de arriba sea verdad
--
-- Cuatro cosas se comprueban, y las cuatro revientan la migración si fallan:
--
-- 1. Que cada fila declarada arriba exista de verdad. Los `insert` empatan el
--    programa y el plantel POR NOMBRE, así que una tilde de menos en «Teziutlán»
--    o un plantel que no esté dado de alta no da error: descarta la fila en
--    silencio y esa sede se queda leyendo el rango. Contar es lo único que lo
--    detecta, y por eso los tres conteos son exactos y no «mayor que cero».
-- 2. Que ninguna cohorte con ventana se quede sin día. Es la promesa de este
--    cambio —«un día, no un rango»— y se puede verificar sin padrón cargado,
--    porque las cohortes sí están declaradas.
-- 3. Que Administración 1º y 3º hayan desaparecido de las dos tablas.
-- 4. Que siga sin haber cohorte con ventana y sin cita, ni con cita y sin
--    ventana. Se repite de `20260924230000` a propósito: esta migración borra
--    filas de las dos, y es justo el tipo de cambio que la puede romper.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_mal integer := 0;
  v_filas integer;
  v_admin integer;
  v_comodin integer;
  v_interv integer;
  v_posgrado integer;
  v_planteles integer;
  v_leip integer;
begin
  -- 1 · que las filas declaradas existan, una por una

  select count(*) into v_comodin
    from dia_entrega_voucher d
    join programas p on p.id = d.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel <> 'Maestría'
     and p.nombre <> 'Licenciatura en Educación e Innovación Pedagógica'
     and d.grupo = '*';

  if v_comodin <> 22 then
    raise exception
      'Se esperaban 22 filas comodín de licenciatura y hay %. ¿Algún nombre de programa o de plantel no empata?',
      v_comodin;
  end if;

  select count(*) into v_interv
    from dia_entrega_voucher d
    join programas p on p.id = d.programa_id
    join planteles pl on pl.id = d.plantel_id
   where p.nombre = 'Licenciatura en Intervención Educativa'
     and pl.nombre = 'Teziutlán'
     and d.avance = 5
     and d.grupo in ('A', 'B', 'C');

  if v_interv <> 3 then
    raise exception
      'Intervención 5º de Teziutlán debía quedar con 3 filas por grupo y tiene %.', v_interv;
  end if;

  select count(*) into v_planteles from planteles;

  select count(*) into v_posgrado
    from dia_entrega_voucher d
    join programas p on p.id = d.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Maestría'
     and d.fecha = '2026-10-03'::date;

  if v_posgrado <> 6 * v_planteles then
    raise exception
      'Los posgrados debían quedar con % filas (3 programas × 2 módulos × % planteles) y tienen %.',
      6 * v_planteles, v_planteles, v_posgrado;
  end if;

  -- LEIP no lo toca esta migración: si se quedó en cero, el `delete` se pasó de
  -- largo y se llevó un calendario que no era suyo.
  select count(*) into v_leip
    from dia_entrega_voucher d
    join programas p on p.id = d.programa_id
   where p.nombre = 'Licenciatura en Educación e Innovación Pedagógica';

  if v_leip = 0 then
    raise exception
      'LEIP se quedó sin ninguna fila: el `delete` borró más de lo que le tocaba.';
  end if;

  -- 2 · ninguna cohorte declarada sin día
  for r in
    select p.nombre as programa, vc.avance
      from ventana_cohortes vc
      join programas p on p.id = vc.programa_id
     where not exists (
       select 1 from dia_entrega_voucher d
        where d.programa_id = vc.programa_id
          and d.avance = vc.avance
     )
     order by 1, 2
  loop
    v_mal := v_mal + 1;
    raise warning '% · avance % · tiene ventana y NINGÚN día de entrega', r.programa, r.avance;
  end loop;

  if v_mal > 0 then
    raise exception
      '% cohortes se quedarían leyendo el rango en vez de su día.', v_mal;
  end if;

  -- 3 · Administración 1º y 3º, fuera
  select count(*) into v_admin
    from (
      select 1 from ventana_cohortes c
        join programas p on p.id = c.programa_id
       where p.nombre = 'Licenciatura en Administración Educativa'
         and c.avance in (1, 3)
      union all
      select 1 from cita_cohortes c
        join programas p on p.id = c.programa_id
       where p.nombre = 'Licenciatura en Administración Educativa'
         and c.avance in (1, 3)
    ) as x;

  if v_admin > 0 then
    raise exception
      'Quedan % declaraciones de Administración Educativa 1º o 3º. El `delete` no las alcanzó.',
      v_admin;
  end if;

  -- 4 · ventana y cita, en paralelo
  v_mal := 0;
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
      '% cohortes quedaron descuadradas entre ventana y cita.', v_mal;
  end if;

  select count(*) into v_filas from dia_entrega_voucher;
  raise notice 'dia_entrega_voucher: % filas (licenciaturas, posgrados y LEIP).', v_filas;

  -- El reparto por día, para leerlo de un golpe al aplicar.
  for r in
    select d.fecha, count(*) as cuantas
      from dia_entrega_voucher d
     group by d.fecha
     order by d.fecha
  loop
    raise notice '  % · % filas', r.fecha, r.cuantas;
  end loop;
end $$;
