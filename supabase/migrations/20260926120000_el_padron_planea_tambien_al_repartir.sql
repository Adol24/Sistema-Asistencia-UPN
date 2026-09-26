-- =============================================================================
-- El padrón planea también al repartir
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260926120000_el_padron_planea_tambien_al_repartir`.
--
-- Qué cambia
-- ----------
-- `fn_dia_mas_vacio` pierde el techo. Devuelve siempre el día proporcionalmente
-- más vacío del PLAN, incluso si los tres ya pasaron de su aforo, y nunca más
-- devuelve NULL mientras existan los tres días.
--
-- `fn_dia_de` deja de elegir por el plan y elige por la REALIDAD: al alumno del
-- padrón que todavía no tiene día se le da uno donde de verdad quede asiento,
-- contando `participantes`. Si los tres están genuinamente llenos levanta su
-- error, que a partir de aquí significa lo que dice.
--
-- Por qué
-- -------
-- `20260921200000_el_padron_planea_y_el_preregistro_reserva` ya estableció la
-- regla y le quitó el tope a `fn_asignar_dia_a_varios`: el padrón PLANEA sobre
-- gente que todavía no se ha inscrito y que en buena parte no lo hará, y el
-- pre-registro RESERVA. El tope se quedó en estas dos, y contando lo que no
-- debía.
--
-- En `fn_dia_mas_vacio` el efecto es el que reportó la organización: un padrón
-- de 2500 alumnos no se podía repartir más allá de 2000 —700 + 700 + 600—
-- aunque ninguno de esos 2000 lugares estuviera ocupado todavía. El aforo de la
-- sede se estaba usando para limitar una previsión.
--
-- En `fn_dia_de` es peor, y empeoraría al quitar el otro tope. Cuenta
-- `padron_alumnos`, o sea el plan, y la llama `fn_preregistrar_alumno`: con el
-- plan lleno devolvía NULL y una persona real leía «Ya no quedan lugares en
-- ninguno de los tres días» mientras la sede tenía asientos vacíos. Por eso las
-- dos van en la misma migración: quitar el techo del reparto sin arreglar esta
-- habría convertido un padrón grande en pre-registros rechazados, que es un
-- fallo peor que el que se venía a corregir.
--
-- Lo que NO cambia
-- ----------------
-- El tope firme sigue donde estaba y contando lo que debe.
-- `fn_preregistrar_alumno` y `fn_preregistrar_externo` cuentan `participantes`
-- bajo `pg_advisory_xact_lock` y rechazan el alta que no cabe; esta migración no
-- las toca. Siguen habiendo 700, 700 y 600 lugares, y los sigue ocupando quien
-- se pre-registra.
--
-- Tampoco cambian las concesiones: las dos son `create or replace` con la misma
-- firma, así que conservan su ACL. `fn_dia_mas_vacio` y `fn_dia_de` siguen
-- revocadas de `authenticated` desde
-- `20260923040000_el_rol_que_el_comentario_daba_por_comprobado`, y se llaman
-- solo desde dentro.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- El reparto del plan, sin techo
-- ---------------------------------------------------------------------------
/*
 * El día al que toca repartir al siguiente alumno sin día.
 *
 * Se mira la PROPORCIÓN de ocupación y no la cuenta a secas, y eso no cambia:
 * con 700, 700 y 600, repartir al día que tenga menos gente mandaría a todo el
 * mundo al día 3 hasta empatar con los otros dos, y el más pequeño se llenaría
 * primero.
 *
 * Lo que se va es el `having count < cupo`. Pasado el aforo la proporción sigue
 * ordenando —1.20 va antes que 1.35— así que el sobrecupo se reparte igual de
 * parejo que los lugares, y no se amontona en el día que se pasó primero.
 */
create or replace function fn_dia_mas_vacio()
returns smallint
language sql
stable
as $$
  select d.dia
    from dias_evento d
    left join padron_alumnos a on a.dia = d.dia
   group by d.dia, d.cupo
   order by count(a.matricula)::numeric / d.cupo, d.dia
   limit 1;
$$;

comment on function fn_dia_mas_vacio is
  'El día proporcionalmente más vacío del PLAN. Sin techo: el padrón puede '
  'planear por encima del aforo a propósito, porque de una lista no se inscriben '
  'todos. El tope real lo pone el pre-registro contando participantes.';

-- ---------------------------------------------------------------------------
-- El día de quien se pre-registra sin tenerlo
-- ---------------------------------------------------------------------------
create or replace function fn_dia_de(p_matricula text)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia smallint;
begin
  select dia into v_dia from padron_alumnos where matricula = p_matricula;
  if v_dia is not null then
    return v_dia;
  end if;

  /*
   * Sin día repartido se elige por asientos REALES, no por el plan.
   *
   * Aquí ya no se está planeando: hay una persona pre-registrándose —un nuevo
   * ingreso dado de alta en la mesa, o alguien a quien el reparto no alcanzó— y
   * la pregunta es dónde queda sitio de verdad. Contando `padron_alumnos` se la
   * mandaba al día menos sobrevendido del PLAN, que puede estar lleno mientras
   * otro tiene asientos libres; y con el plan entero por encima del aforo, a
   * ninguno.
   *
   * No hace falta candado: `fn_preregistrar_alumno` vuelve a contar bajo
   * `pg_advisory_xact_lock` justo antes de insertar, y esa es la comprobación
   * que decide. Esta solo elige bien.
   */
  select d.dia into v_dia
    from dias_evento d
    left join participantes p on p.dia = d.dia
   group by d.dia, d.cupo
  having count(p.id) < d.cupo
   order by count(p.id)::numeric / d.cupo, d.dia
   limit 1;

  -- Ahora sí quiere decir que el evento está lleno: se contaron asientos
  -- ocupados, no previsiones. Antes salía con la sede medio vacía.
  if v_dia is null then
    raise exception
      'Ya no quedan lugares en ninguno de los tres días. Escríbenos y te ayudamos.'
      using errcode = 'check_violation';
  end if;

  update padron_alumnos set dia = v_dia where matricula = p_matricula;
  return v_dia;
end;
$$;

comment on function fn_dia_de is
  'El día de un alumno. Si la organización no se lo repartió, se le da el día '
  'con asientos REALES libres —cuenta participantes, no el padrón— y se guarda. '
  'Falla solo si los tres días están de verdad llenos.';

-- ---------------------------------------------------------------------------
-- Lo que quedó
-- ---------------------------------------------------------------------------
do $$
declare
  v_dia smallint;
  v_llenos integer;
  r record;
begin
  -- El plan, día por día, contra su aforo. Un día por encima no es un fallo:
  -- es una previsión deliberada, y aquí queda a la vista de quien aplica.
  for r in
    select d.dia, d.cupo, count(a.matricula) as planeados
      from dias_evento d
      left join padron_alumnos a on a.dia = d.dia
     group by d.dia, d.cupo
     order by d.dia
  loop
    raise notice
      'Día % · planeados %/% %',
      r.dia, r.planeados, r.cupo,
      case when r.planeados > r.cupo then '(por encima del aforo, permitido)' else '' end;
  end loop;

  -- El reparto ya no puede quedarse sin día que ofrecer.
  v_dia := fn_dia_mas_vacio();
  if v_dia is null then
    raise exception
      'fn_dia_mas_vacio devolvió NULL: o no hay filas en dias_evento, o el techo '
      'sigue puesto.';
  end if;
  raise notice 'fn_dia_mas_vacio ofrece el día % (sin techo).', v_dia;

  -- Y el pre-registro sigue teniendo el suyo, contando gente de verdad.
  select count(*) into v_llenos from dias_evento d
   where (select count(*) from participantes p where p.dia = d.dia) >= d.cupo;
  raise notice
    'Días con el aforo REAL agotado: % de 3. El pre-registro los sigue cerrando.',
    v_llenos;
end $$;
