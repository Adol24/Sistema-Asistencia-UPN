-- =============================================================================
-- El día que te toca ir a pagar
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924140000_el_dia_que_te_toca_pagar`.
--
-- Lo que falta contar
-- -------------------
-- El calendario oficial tiene dos tablas, y hasta ahora el sistema solo conocía
-- una. `20260924120000` cargó la del REGISTRO —el formulario en línea, que es
-- lo que hace este sistema—. Esta carga la de la INSCRIPCIÓN, que es el pago
-- presencial en ventanilla y NO ocurre aquí dentro.
--
-- Es información, no una puerta. No cierra nada, no valida nada y no impide
-- ningún alta: lo único que hace es poder contestar «¿qué día me toca ir a
-- pagar?» al terminar el registro, que es justo cuando la persona lo pregunta y
-- justo cuando hoy no se le dice.
--
-- Por qué una tabla y no un `case` en el código
-- ---------------------------------------------
-- Porque el calendario lo firma Jefatura Administrativa y puede cambiar sin que
-- cambie el sistema. Una fecha metida en un `if` de TypeScript obliga a
-- desplegar para mover un día; en una tabla se corrige con un `update`, igual
-- que las ventanas de registro.
--
-- La cita es TEXTO y no dos fechas, a propósito
-- ---------------------------------------------
-- Tres de las cuatro citas son rangos partidos o días sueltos —«29 y 30 de
-- septiembre, y 1 y 2 de octubre»— y la cuarta ni siquiera es una fecha: LEIP
-- se inscribe «el día de su reinscripción», que el documento no fija. Guardar
-- esto como `abre`/`cierra` obligaría a inventar una fecha para LEIP o a
-- dejarla nula, y ninguna de las dos dice lo que el papel dice.
--
-- Nada de esto se compara con `now()`, así que un texto no pierde nada. El día
-- que haya que cerrar algo por esta fecha, hará falta otra columna — y hará
-- falta saber antes qué se cierra.
--
-- Quién NO tiene cita
-- -------------------
-- Docentes y participantes externos no aparecen en la tabla de inscripción del
-- documento. Aquí eso se respeta: no se les inventa una fecha. El comprobante
-- les enseña lo de siempre —la ventanilla y su horario— sin día concreto.
-- =============================================================================

create table if not exists citas_inscripcion (
  id uuid primary key default gen_random_uuid(),
  -- Se le lee tal cual a la persona: «28 y 29 de septiembre». Tiene que
  -- entenderlo alguien que no ha visto el calendario.
  cuando text not null check (length(trim(cuando)) > 0),
  -- Para listarlas en el panel en el orden del papel, que no es el alfabético.
  orden smallint not null default 0
);

comment on table citas_inscripcion is
  'Qué día le toca a cada generación ir a pagar en ventanilla. Es información '
  'para el comprobante: no cierra ninguna puerta ni se compara con la fecha de hoy.';

create table if not exists cita_cohortes (
  cita_id uuid not null references citas_inscripcion (id) on delete cascade,
  programa_id uuid not null references programas (id) on delete cascade,
  avance smallint not null check (avance >= 1),
  primary key (cita_id, programa_id, avance)
);

comment on table cita_cohortes is
  'Qué generación de qué programa va en cada cita. Misma forma que '
  '`ventana_cohortes`, y por la misma razón: se declara una por una.';

create index if not exists ix_cita_cohortes_busqueda
  on cita_cohortes (programa_id, avance);

alter table citas_inscripcion enable row level security;
alter table cita_cohortes enable row level security;

-- Es un calendario impreso y repartido: no hay nada que esconder, y el
-- comprobante lo lee sin sesión. Lectura para todos, escritura para nadie desde
-- fuera —el personal lo cambia con las funciones de siempre—.
drop policy if exists citas_lectura on citas_inscripcion;
create policy citas_lectura on citas_inscripcion for select to anon, authenticated using (true);

drop policy if exists cita_cohortes_lectura on cita_cohortes;
create policy cita_cohortes_lectura on cita_cohortes for select to anon, authenticated using (true);

grant select on citas_inscripcion, cita_cohortes to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Los cuatro renglones del documento
--
-- Se insertan por `cuando`, que es único de hecho, y con `not exists` para que
-- volver a aplicar la migración no duplique. No hay `unique` declarado porque
-- dos citas con el mismo texto son legítimas si algún día un programa comparte
-- día con otro pero se quiere listar aparte.
-- ---------------------------------------------------------------------------
insert into citas_inscripcion (cuando, orden)
select c.cuando, c.orden
  from (values
    ('28 y 29 de septiembre',                             1::smallint),
    ('29 y 30 de septiembre, y 1 y 2 de octubre',         2::smallint),
    ('3 de octubre',                                      3::smallint),
    -- LEIP no tiene fecha en el documento: dice «fecha de reinscripción».
    ('el día de tu reinscripción',                        4::smallint)
  ) as c(cuando, orden)
 where not exists (
   select 1 from citas_inscripcion x where x.cuando = c.cuando
 );

-- Las cohortes se vuelven a declarar enteras, para que reaplicar la migración
-- corrija en vez de acumular.
delete from cita_cohortes;

/*
 * 28 y 29 de septiembre · séptimo semestre.
 *
 * Las mismas cuatro licenciaturas que se registran el 25 y 26, y por la misma
 * razón que allí: Educación Indígena no tiene séptimo.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values
    ('Licenciatura en Pedagogía',                7::smallint),
    ('Licenciatura en Intervención Educativa',   7::smallint),
    ('Licenciatura en Psicología Educativa',     7::smallint),
    ('Licenciatura en Administración Educativa', 7::smallint)
  ) as e(programa, avance)
  join programas p on p.nombre = e.programa
 where c.cuando = '28 y 29 de septiembre'
on conflict (cita_id, programa_id, avance) do nothing;

/*
 * 29 y 30 de septiembre, y 1 y 2 de octubre · primero, tercero y quinto.
 *
 * Cuatro días para este grupo y dos para los demás, que es lo que cabe esperar:
 * son cinco licenciaturas por tres semestres.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values
    ('Licenciatura en Pedagogía',                1::smallint),
    ('Licenciatura en Pedagogía',                3::smallint),
    ('Licenciatura en Pedagogía',                5::smallint),
    ('Licenciatura en Intervención Educativa',   1::smallint),
    ('Licenciatura en Intervención Educativa',   3::smallint),
    ('Licenciatura en Intervención Educativa',   5::smallint),
    ('Licenciatura en Psicología Educativa',     1::smallint),
    ('Licenciatura en Psicología Educativa',     3::smallint),
    ('Licenciatura en Psicología Educativa',     5::smallint),
    ('Licenciatura en Administración Educativa', 1::smallint),
    ('Licenciatura en Administración Educativa', 3::smallint),
    ('Licenciatura en Administración Educativa', 5::smallint),
    ('Licenciatura en Educación Indígena',       1::smallint),
    ('Licenciatura en Educación Indígena',       3::smallint),
    ('Licenciatura en Educación Indígena',       5::smallint)
  ) as e(programa, avance)
  join programas p on p.nombre = e.programa
 where c.cuando = '29 y 30 de septiembre, y 1 y 2 de octubre'
on conflict (cita_id, programa_id, avance) do nothing;

/*
 * 3 de octubre · las tres maestrías, módulos I y IV.
 *
 * El 3 de octubre de 2026 cae en SÁBADO, y `configuracion_evento.ventanilla_horario`
 * dice hoy «Lunes a viernes de 9:00 a 17:00 hrs». El comprobante enseña las dos
 * cosas juntas, así que a una maestría le diría «el 3 de octubre, de lunes a
 * viernes». Se deja el dato del documento tal cual —es el oficial— y se anota
 * aquí para que el horario se corrija donde se corrige, que es la configuración.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values
    ('Maestría en Educación Básica',                               1::smallint),
    ('Maestría en Educación Básica',                               4::smallint),
    ('Maestría en Educación Media Superior',                       1::smallint),
    ('Maestría en Educación Media Superior',                       4::smallint),
    ('Maestría en Didácticas de Lenguas y Culturas Indoamericanas', 1::smallint),
    ('Maestría en Didácticas de Lenguas y Culturas Indoamericanas', 4::smallint)
  ) as e(programa, avance)
  join programas p on p.nombre = e.programa
 where c.cuando = '3 de octubre'
on conflict (cita_id, programa_id, avance) do nothing;

/*
 * LEIP · el día de su reinscripción.
 *
 * Los cuatro módulos del calendario: II, VI, X y —la que en las listas es 13—
 * XIV. Ver la cabecera de `20260924120000` para por qué el XIV se guarda como
 * 13 y por qué ese es el único número que no se ha comprobado contra el padrón.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values
    (2::smallint), (6::smallint), (10::smallint), (13::smallint)
  ) as e(avance)
  join programas p on p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
 where c.cuando = 'el día de tu reinscripción'
on conflict (cita_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- Preguntar por matrícula, que es lo único que el comprobante tiene a mano
--
-- Se hace igual que `fn_ventana_de_matricula` y por la misma razón: la pantalla
-- conoce la matrícula de quien acaba de registrarse, no el uuid de su programa.
--
-- No enseña nada de nadie: recibe una matrícula y devuelve una frase del
-- calendario impreso. Si la matrícula no está en el padrón, devuelve NULL, que
-- es lo mismo que devuelve para una cohorte sin cita.
-- ---------------------------------------------------------------------------
create or replace function fn_cita_de_inscripcion(p_matricula text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cuando text;
begin
  select c.cuando
    into v_cuando
    from padron_alumnos a
    join cita_cohortes cc
      on cc.programa_id = a.programa_id
     and cc.avance = a.avance
    join citas_inscripcion c on c.id = cc.cita_id
   where a.matricula = trim(p_matricula)
   order by c.orden
   limit 1;

  return v_cuando;
end;
$$;

revoke all on function fn_cita_de_inscripcion(text) from public, anon, authenticated;
grant execute on function fn_cita_de_inscripcion(text) to anon, authenticated;

comment on function fn_cita_de_inscripcion is
  'El día que le toca ir a pagar a quien tiene esa matrícula, ya redactado. '
  'NULL si no está en el padrón o si su generación no tiene cita.';

-- ---------------------------------------------------------------------------
-- Que lo de arriba sea verdad
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_faltan integer := 0;
  v_total integer;
  v_sin_cita integer := 0;
begin
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
      '% de los nueve programas del calendario no existen con ese nombre. Sus '
      'citas de inscripción NO se cargaron.', v_faltan;
  end if;

  select count(*) into v_total from cita_cohortes;

  -- Veintinueve, las mismas que el registro: 4 séptimos + 15 de primero,
  -- tercero y quinto + 6 de maestría + 4 módulos de LEIP.
  if v_total <> 29 then
    raise exception
      'Las citas de inscripción quedaron con % cohortes y tienen que ser 29.', v_total;
  end if;

  raise notice 'Calendario de inscripción cargado. % cohortes con cita.', v_total;
  raise notice '';

  for r in
    select c.cuando,
           (select count(*) from cita_cohortes x where x.cita_id = c.id) as cohortes
      from citas_inscripcion c
     order by c.orden
  loop
    raise notice '  % · % cohortes', r.cuando, r.cohortes;
  end loop;

  /*
   * Quién se va a registrar y no va a saber cuándo pagar.
   *
   * No es un fallo por sí solo —docentes y externos no tienen cita en el
   * documento, y está bien— pero una cohorte de alumnos aquí sí lo es: se
   * registra, llega al comprobante y no se le dice nada.
   */
  raise notice '';
  raise notice 'Cohortes CON ventana de registro y SIN cita de pago:';
  for r in
    select p.nombre as programa, c.avance
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from cita_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     order by p.nombre, c.avance
  loop
    v_sin_cita := v_sin_cita + 1;
    raise notice '  % · avance %', r.programa, r.avance;
  end loop;

  if v_sin_cita = 0 then
    raise notice '  ninguna: toda cohorte que puede registrarse sabe cuándo pagar.';
  end if;
end;
$$;
