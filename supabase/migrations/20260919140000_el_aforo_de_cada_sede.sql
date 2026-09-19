-- =============================================================================
-- El aforo de cada sede, y el pre-registro que lo respeta.
--
-- Los lugares del evento no son infinitos y hasta hoy el sistema se comportaba
-- como si lo fueran: cualquiera podía pre-registrarse a cualquier día, y el
-- reparto del padrón repartía sin techo. Los aforos reales son:
--
--   Día 1 · Salón SUTERM    · 700 personas
--   Día 2 · Salón SUTERM    · 700 personas
--   Día 3 · Teatro Victoria · 600 personas
--
-- El día 3 NO es un día más pequeño por casualidad: es otro edificio. Por eso el
-- cupo vive en `dias_evento` junto a la sede y no en `configuracion_evento` como
-- un número suelto: cambia con el lugar, y quien cambie el lugar tiene que ver
-- el aforo en la misma fila.
--
-- ---------------------------------------------------------------------------
-- Qué ocupa un lugar
-- ---------------------------------------------------------------------------
-- Una fila en `participantes` de ese día. O sea: haberse pre-registrado. No se
-- exige haber pagado, porque entonces el aforo solo se sabría después de la
-- fecha límite, cuando ya no sirve para nada.
--
-- Un pre-registro `expirado` —sin pago y pasada la fecha límite— sigue ocupando
-- su lugar. Se podría liberar, y es tentador, pero `expirado` es un estado
-- derivado del reloj: los lugares se devolverían solos a las 18:00 del 9 de
-- octubre, sin que nadie lo decidiera, y para entonces el pre-registro ya está
-- cerrado y no hay a quién dárselos. Liberar un lugar es una decisión de la
-- organización, no del reloj.
--
-- ---------------------------------------------------------------------------
-- El techo va en dos sitios, y hacen falta los dos
-- ---------------------------------------------------------------------------
--   1. El pre-registro (`participantes`) — el aforo literal.
--   2. El reparto de días del padrón (`padron_alumnos.dia`) — la promesa.
--
-- Con solo el primero, Servicios Escolares podría repartir 900 alumnos al día 3
-- y el sistema los dejaría hacerlo: los primeros 600 se pre-registrarían bien y
-- los otros 300 rebotarían de uno en uno, ya con la fecha encima, sin que nadie
-- hubiera avisado. El reparto promete un día; el techo hace que la promesa sea
-- cumplible.
-- =============================================================================

-- ------------------------------------------------------------- la columna ---
-- Sin DEFAULT a propósito. Un `default 0` habría dejado los tres días llenos
-- hasta el UPDATE de abajo, y un `default 9999` habría hecho que un día mal
-- configurado pareciera correcto. Se añade vacía, se llena, y solo entonces se
-- exige NOT NULL: así no existe ni un instante con un aforo inventado.
alter table dias_evento add column if not exists cupo integer;

-- `where cupo is null` y no a secas: estas migraciones se aplican pegándolas en
-- el editor SQL, así que volver a correr una entera es un caso real. Sin esa
-- condición, una segunda pasada devolvería los tres aforos a 700/700/600 y
-- borraría en silencio el que la organización hubiera ajustado desde el panel.
update dias_evento set cupo = 700 where dia in (1, 2) and cupo is null;
update dias_evento set cupo = 600 where dia = 3 and cupo is null;

alter table dias_evento alter column cupo set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cupo_positivo') then
    alter table dias_evento add constraint chk_cupo_positivo check (cupo > 0);
  end if;
end;
$$;

comment on column dias_evento.cupo is
  'Cuánta gente cabe en la sede de ese día. Ocupa lugar quien se pre-registró, '
  'haya pagado o no.';

-- ------------------------------------------------------------- las vistas ---
/*
 * Cuántos lugares quedan, para quien todavía no se ha registrado.
 *
 * Deliberadamente SIN `security_invoker`, por la misma razón que `v_talleres`:
 * cuenta filas de `participantes`, que el público no puede leer. Como invoker,
 * la pantalla de «elige tu día» enseñaría los tres días con 700, 700 y 600
 * lugares libres para siempre.
 *
 * Lo que sale de aquí son tres números agregados por día. No hay nombres, ni
 * correos, ni folios: saber que el día 2 va por 431 no dice nada de nadie.
 */
create or replace view v_cupo_dia as
select
  d.dia,
  d.sede,
  d.cupo,
  count(p.id) as ocupados,
  greatest(d.cupo - count(p.id), 0) as disponibles,
  count(p.id) >= d.cupo as lleno
from dias_evento d
left join participantes p on p.dia = d.dia
group by d.dia, d.sede, d.cupo;

comment on view v_cupo_dia is
  'Lugares libres por día. Deliberadamente SIN security_invoker: cuenta '
  'pre-registrados, que el público no puede leer, y el público necesita saber '
  'si su día ya se llenó ANTES de elegirlo. Solo expone agregados.';

-- El reparto que mira la organización ahora dice también contra qué techo va.
create or replace view v_reparto_dias as
select
  d.dia,
  d.sede,
  count(a.matricula) as alumnos,
  d.cupo,
  greatest(d.cupo - count(a.matricula), 0) as libres
from dias_evento d
left join padron_alumnos a on a.dia = d.dia
group by d.dia, d.sede, d.cupo
union all
select
  null,
  'Sin día asignado',
  count(*),
  null,
  null
from padron_alumnos
where dia is null;

alter view v_reparto_dias set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- El reparto del padrón, con techo
-- ---------------------------------------------------------------------------
/*
 * El día al que toca repartir al siguiente alumno sin día.
 *
 * Dos cambios. El primero es el techo: un día cuyo reparto ya llegó a su aforo
 * deja de ofrecerse, y si los tres llegaron devuelve NULL, que es la respuesta
 * honesta a «¿a qué día lo mando?» cuando no cabe en ninguno.
 *
 * El segundo es cómo se elige entre los que sí tienen sitio. Antes era «el que
 * tenga menos gente», y con tres aforos iguales eso estaba bien. Con 700, 700 y
 * 600 deja de estarlo: el día 3 recibiría a todo el mundo hasta empatar con los
 * otros dos, y se llenaría primero. Ahora se mira la PROPORCIÓN —qué tan lleno
 * va cada uno respecto de lo que le cabe— y los tres se llenan a la vez.
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
  having count(a.matricula) < d.cupo
   order by count(a.matricula)::numeric / d.cupo, d.dia
   limit 1;
$$;

comment on function fn_dia_mas_vacio is
  'El día proporcionalmente más vacío que todavía tenga sitio. NULL si los tres '
  'llegaron a su aforo.';

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

  v_dia := fn_dia_mas_vacio();
  -- Antes esto no podía fallar y por eso no se comprobaba. Ahora puede: si los
  -- tres días llegaron a su aforo no hay ninguno que asignar, y devolver NULL
  -- habría reventado más abajo contra el NOT NULL de `participantes.dia` con un
  -- error que no le dice nada a nadie.
  if v_dia is null then
    raise exception
      'Ya no quedan lugares en ninguno de los tres días. Escríbenos y te ayudamos.'
      using errcode = 'check_violation';
  end if;

  update padron_alumnos set dia = v_dia where matricula = p_matricula;
  return v_dia;
end;
$$;

-- ---------------------------------------------------------------------------
-- El pre-registro del alumno
-- ---------------------------------------------------------------------------
/*
 * Cambia en un solo punto: antes de insertar se comprueba que el día todavía
 * tenga lugar.
 *
 * **Al alumno con día ya repartido se le rechaza, no se le mueve.** Es una
 * decisión de la organización y conviene dejarla escrita, porque la alternativa
 * es tentadora: reubicarlo solo al día que tenga sitio lo dejaría dentro sin
 * que nadie hiciera nada. Pero el día de un alumno no se reparte al azar —va
 * por plantel, programa y grupo, para que los compañeros coincidan— y moverlo
 * en silencio deshace ese reparto sin que Servicios Escolares se entere. Que
 * rebote y hable con la organización es más lento y es correcto.
 *
 * El `pg_advisory_xact_lock` es lo que hace que la comprobación sirva de algo.
 * Sin él, dos personas que pulsan «confirmar» en el mismo instante leen las dos
 * «queda 1» y entran las dos. El candado es por día: registrarse al día 1 no
 * hace cola con el día 2, y no toca `dias_evento`, así que no estorba a la
 * puerta ni a nadie que esté leyendo la configuración.
 */
create or replace function fn_preregistrar_alumno(
  p_matricula text,
  p_correo text,
  p_celular text,
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_a record;
  v_cfg record;
  v_dia smallint;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_dominio text;
  v_ya record;
  v_cupo integer;
  v_ocupados integer;
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en nuestros registros'
      using errcode = 'no_data_found';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  -- Sale ANTES de mirar el aforo, y tiene que ser así: su lugar ya está tomado
  -- por él mismo. Comprobarlo aquí dejaría sin su propio comprobante a quien
  -- vuelve a cambiar de taller el día en que el evento se llena.
  select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    -- `coalesce` y no `now()`: vale la PRIMERA aceptación. Volver atrás para
    -- cambiar de taller no vuelve a otorgar nada.
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- Sin dominio configurado —NULL o en blanco— se acepta cualquier correo,
  -- porque hay universidades que no dan cuenta institucional a todos.
  v_dominio := nullif(trim(coalesce(v_cfg.dominio_institucional, '')), '');
  if v_dominio is not null
     and lower(trim(p_correo)) not like '%@' || lower(v_dominio) then
    raise exception 'Usa tu correo institucional, el que termina en @%', v_dominio
      using errcode = 'check_violation';
  end if;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
  end if;

  if v_a.dia is not null then
    v_dia := v_a.dia;
    if p_taller is not null
       and not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_dia) then
      raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_dia
        using errcode = 'check_violation';
    end if;
  elsif p_taller is not null then
    -- Sin día repartido y con taller elegido: el día de ese taller que vaya
    -- proporcionalmente más vacío y TODAVÍA TENGA SITIO.
    --
    -- El «no tiene días» se pregunta aparte a propósito. Antes un NULL aquí
    -- solo podía significar eso; ahora puede significar también «todos llenos»,
    -- y son dos cosas distintas: una es un taller mal configurado que tiene que
    -- ver la organización, la otra es un evento que se llenó.
    if not exists (select 1 from taller_dias where taller_id = p_taller) then
      raise exception 'Ese taller no tiene días asignados' using errcode = 'no_data_found';
    end if;

    select td.dia into v_dia
      from taller_dias td
      join dias_evento d on d.dia = td.dia
      left join padron_alumnos a on a.dia = td.dia
     where td.taller_id = p_taller
     group by td.dia, d.cupo
    having count(a.matricula) < d.cupo
     order by count(a.matricula)::numeric / d.cupo, td.dia
     limit 1;

    if v_dia is null then
      raise exception
        'Ya no quedan lugares en los días en que se imparte ese taller. Elige otro taller o '
        'escríbenos y te ayudamos.'
        using errcode = 'check_violation';
    end if;
    update padron_alumnos set dia = v_dia where matricula = v_a.matricula;
  else
    v_dia := fn_dia_de(v_a.matricula);
  end if;

  -- ------------------------------------------------------------- el aforo ---
  perform pg_advisory_xact_lock(20260919, v_dia::integer);

  select d.cupo, count(p.id)
    into v_cupo, v_ocupados
    from dias_evento d
    left join participantes p on p.dia = d.dia
   where d.dia = v_dia
   group by d.cupo;

  if v_ocupados >= v_cupo then
    raise exception
      'El día % ya no tiene lugares disponibles, y es el día que te toca. Escríbenos y la '
      'organización te reubica.', v_dia
      using errcode = 'check_violation';
  end if;

  /*
   * El alta, y qué hacer si otra petición se nos adelantó entre la búsqueda de
   * arriba y este insert.
   *
   * La ventana es real: dos pestañas, o el doble clic de quien no ve respuesta.
   * Antes la segunda petición reventaba con la violación de unicidad de
   * `matricula` y la persona veía «Ese registro ya existe» al final de todo su
   * recorrido, sin folio. Ahora se relee la fila que ganó y se devuelve la
   * misma respuesta que habría dado la búsqueda: el alta es idempotente de
   * verdad, no solo cuando nadie corre a la vez.
   */
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en
    )
    values (
      'alumno', v_a.matricula, v_a.nombre, lower(trim(p_correo)), p_celular,
      'Universidad Autónoma',
      v_a.nivel_id, v_a.programa_id, v_a.avance, v_a.grupo, v_a.plantel_id,
      v_dia, p_taller, v_cfg.cuota_evento, v_costo,
      now()
    )
    returning id, folio into v_id, v_folio;
  exception
    when unique_violation then
      select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
      -- Si no aparece, la unicidad que se violó era otra y hay que dejarla subir:
      -- tragarse un error que no se entiende es peor que enseñarlo.
      if v_ya.id is null then
        raise;
      end if;
      perform fn_cambiar_taller(v_ya.id, p_taller);
      update participantes
         set acepto_aviso_en = coalesce(acepto_aviso_en, now())
       where id = v_ya.id;
      return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Pre-registró a un alumno',
          format('%s · %s · día %s (quedan %s lugares)',
                 v_folio, v_a.matricula, v_dia, v_cupo - v_ocupados - 1));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', v_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- El pre-registro del docente y del externo
-- ---------------------------------------------------------------------------
/*
 * Aquí el aforo pesa más, porque esta persona SÍ elige su día. La pantalla ya
 * no le ofrece los días llenos, pero la pantalla puede tener datos de hace diez
 * minutos y esta función no: la comprobación de verdad vive aquí.
 *
 * Va junto al `insert`, después de la búsqueda reentrante, por la misma razón
 * que en el alumno: quien ya tiene folio de ese día no vuelve a pedir lugar.
 */
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
  v_correo text;
  v_dominio text;
  v_ya record;
  v_cupo integer;
  v_ocupados integer;
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;
  v_correo := lower(trim(p_correo));

  /*
   * Las dos puertas que le cierran este formulario a un alumno.
   *
   * Van antes de la búsqueda reentrante a propósito: no se trata de si esta
   * persona ya pasó por aquí, sino de que no debería estar aquí. Y van antes de
   * cualquier escritura, así que un intento no deja rastro.
   */
  if exists (select 1 from participantes where correo = v_correo and perfil = 'alumno') then
    raise exception
      'Ese correo ya está registrado como alumno. Entra por «Soy alumno de la universidad» '
      'con tu matrícula; si crees que es un error, escríbenos.'
      using errcode = 'check_violation';
  end if;

  -- Escalar y no `v_cfg`, porque la configuración completa se lee más abajo y
  -- solo en el camino que de verdad inserta.
  v_dominio := nullif(
    trim(coalesce((select dominio_institucional from configuracion_evento where id = 1), '')),
    ''
  );
  if v_dominio is not null and v_correo like '%@' || lower(v_dominio) then
    raise exception
      'Ese correo es una cuenta de alumno. Entra por «Soy alumno de la universidad» con tu '
      'matrícula.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_institucion), '') = '' then
    raise exception 'Falta la institución' using errcode = 'check_violation';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  -- `order by creado_en` importa: un fallo anterior ya pudo dejar duplicados, y
  -- ante varios se elige el PRIMERO, que es el folio que esa persona llegó a ver.
  select id, folio, dia into v_ya
    from participantes
   where correo = v_correo and perfil = v_perfil
   order by creado_en
   limit 1;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
    if not exists (select 1 from taller_dias where taller_id = p_taller and dia = p_dia) then
      raise exception 'Ese taller no se imparte el día %', p_dia
        using errcode = 'check_violation';
    end if;
  end if;

  -- ------------------------------------------------------------- el aforo ---
  -- A esta persona sí se le puede decir «elige otro día», porque el día lo
  -- eligió ella. No hay reparto que respetar.
  perform pg_advisory_xact_lock(20260919, p_dia::integer);

  select d.cupo, count(p.id)
    into v_cupo, v_ocupados
    from dias_evento d
    left join participantes p on p.dia = d.dia
   where d.dia = p_dia
   group by d.cupo;

  if v_ocupados >= v_cupo then
    raise exception 'El día % ya no tiene lugares disponibles. Elige otro día.', p_dia
      using errcode = 'check_violation';
  end if;

  -- El cierre de la carrera que puso la 39: si otra petición se adelantó entre
  -- la búsqueda de arriba y este insert, se relee su fila y se devuelve su folio.
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en
    )
    values (
      v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
      trim(p_institucion),
      null, null, null, null, null,
      p_dia, p_taller, v_cfg.cuota_evento, v_costo,
      now()
    )
    returning id, folio into v_id, v_folio;
  exception
    when unique_violation then
      select id, folio, dia into v_ya
        from participantes
       where correo = v_correo and perfil = v_perfil
       order by creado_en
       limit 1;
      if v_ya.id is null then
        raise;
      end if;
      perform fn_cambiar_taller(v_ya.id, p_taller);
      update participantes
         set acepto_aviso_en = coalesce(acepto_aviso_en, now())
       where id = v_ya.id;
      return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona, quedan %s lugares)',
                 v_folio, upper(trim(p_nombre)), p_dia, v_cupo - v_ocupados - 1));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- El reparto que hace la organización a mano
-- ---------------------------------------------------------------------------
/*
 * `fn_asignar_dia_a_varios` es la que mueve de día a un conjunto entero desde
 * /admin/padron: «todos los de Psicología al día 2». Ahora tiene techo.
 *
 * Falla entera o no hace nada, y eso es deliberado. Repartir 80 alumnos a un
 * día donde solo caben 30 y meter a los 30 primeros dejaría a la organización
 * creyendo que movió a los 80, con los otros 50 en un limbo que nadie mira. El
 * mensaje dice cuántos caben, que es lo único accionable.
 *
 * Los que YA estaban en ese día no cuentan contra el techo: mover a un conjunto
 * que en parte ya estaba ahí no ocupa lugares nuevos.
 */
create or replace function fn_asignar_dia_a_varios(
  p_matriculas text[],
  p_dia smallint
)
returns table (matricula text, taller_liberado text)
language plpgsql
-- SIN `security definer`, a diferencia de las funciones del portal, y es
-- deliberado. Aquí no hace falta saltarse nada: quien llama ya tiene sesión, y
-- corriendo con SUS permisos las políticas de `padron_alumnos`, `participantes`
-- y `avisos_participante` —las tres de administración y soporte— son
-- exactamente la comprobación que hace falta. Con `security definer` correría
-- como el dueño de las tablas, que no está sujeto a ninguna, y cualquier
-- usuario autenticado podría mover a la gente de día.
set search_path = public
as $$
declare
  v_cupo integer;
  v_ya integer;
  v_entran integer;
begin
  if p_dia is not null then
    select d.cupo,
           (select count(*) from padron_alumnos a where a.dia = p_dia)
      into v_cupo, v_ya
      from dias_evento d
     where d.dia = p_dia;

    -- Los del conjunto que ya estaban en ese día no ocupan lugar nuevo.
    select count(*) into v_entran
      from padron_alumnos a
     where a.matricula = any (p_matriculas)
       and (a.dia is distinct from p_dia);

    if v_ya + v_entran > v_cupo then
      raise exception
        'En el día % caben % y ya hay %. Estás moviendo % que no estaban ahí: caben %.',
        p_dia, v_cupo, v_ya, v_entran, greatest(v_cupo - v_ya, 0)
        using errcode = 'check_violation';
    end if;
  end if;

  update padron_alumnos a set dia = p_dia where a.matricula = any (p_matriculas);

  -- Quitarle el día a alguien solo tiene sentido en el padrón: un participante
  -- ya registrado tiene que asistir algún día, y `participantes.dia` es NOT NULL.
  if p_dia is null then
    return;
  end if;

  return query
  with afectados as (
    -- Los que pierden su taller porque no se imparte el día nuevo. Se
    -- identifican ANTES de tocar nada, para poder avisarles y devolverlos.
    select p.id, p.matricula, t.clave
      from participantes p
      join talleres t on t.id = p.taller_id
     where p.matricula = any (p_matriculas)
       and not exists (
         select 1 from taller_dias td
          where td.taller_id = p.taller_id and td.dia = p_dia
       )
  ),
  liberados as (
    -- El día y el taller se cambian en la MISMA sentencia. Moverlos por
    -- separado dejaría un instante con el día nuevo y el taller viejo, que es
    -- justo lo que la llave foránea `(taller_id, dia)` prohíbe.
    update participantes p
       set dia = p_dia,
           taller_id = null,
           monto_esperado_taller = null
      from afectados a
     where p.id = a.id
    returning p.id
  ),
  avisados as (
    -- Enterarse de que se perdió la inscripción al llegar sería peor que
    -- enterarse ahora, así que el aviso le espera en su portal.
    insert into avisos_participante (participante_id, texto)
    select a.id,
           format(
             'Cambiaste al día %s y el taller «%s» no se imparte ese día, así que tu '
             'inscripción se liberó. Puedes elegir otro taller; si ya lo habías pagado, '
             'acude a Servicios Financieros.',
             p_dia, a.clave
           )
      from afectados a
    returning 1
  ),
  resto as (
    -- Los demás solo cambian de día. `is distinct from` evita reescribir a
    -- quien ya estaba ahí: sería trabajo inútil y ruido en el tiempo real.
    update participantes p
       set dia = p_dia
     where p.matricula = any (p_matriculas)
       and p.dia is distinct from p_dia
       and p.id not in (select a.id from afectados a)
    returning p.id
  )
  select a.matricula, a.clave from afectados a;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- La vista es nueva, y `20260907001600_permisos.sql` revoca todo sobre TODAS
-- las tablas para `anon`. Una vista nueva no hereda nada: sin este grant, la
-- pantalla de «elige tu día» no podría leer cuántos lugares quedan.
grant select on v_cupo_dia to anon, authenticated;

-- Las firmas no cambiaron, así que `create or replace` conservó las
-- concesiones. Se vuelven a cerrar igual, recorriendo `pg_proc`.
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
  end loop;

  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_asignar_dia_a_varios', 'fn_dia_de', 'fn_dia_mas_vacio')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to authenticated', r.firma);
  end loop;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- Qué queda después de aplicar esto
-- ---------------------------------------------------------------------------
-- No es decoración. El aforo puede quedar YA rebasado por datos que existían
-- antes de esta migración: nada impedía repartir 900 alumnos al día 3 ni
-- pre-registrar a 800 en el día 1. Esta migración no echa a nadie —borrar
-- pre-registros que la gente ya vio confirmados sería peor que el sobrecupo—,
-- así que lo que hace es decirlo en voz alta para que la organización decida.
do $bloque$
declare
  r record;
  v_padron integer;
  v_cupo_total integer;
  v_problema boolean := false;
begin
  raise notice '--- Aforo por día ---';
  for r in
    select c.dia, c.sede, c.cupo, c.ocupados, c.disponibles,
           (select count(*) from padron_alumnos a where a.dia = c.dia) as repartidos
      from v_cupo_dia c
     order by c.dia
  loop
    raise notice 'Día % · % · caben % · pre-registrados % · libres % · repartidos en el padrón %',
      r.dia, r.sede, r.cupo, r.ocupados, r.disponibles, r.repartidos;

    if r.ocupados > r.cupo then
      v_problema := true;
      raise warning 'El día % ya tiene % pre-registrados y solo caben %. Sobran %.',
        r.dia, r.ocupados, r.cupo, r.ocupados - r.cupo;
    end if;

    if r.repartidos > r.cupo then
      v_problema := true;
      raise warning
        'El día % tiene % alumnos repartidos y solo caben %. Sobran %, y van a rebotar uno '
        'a uno al pre-registrarse. Mueve a % desde /admin/padron ANTES de que lo intenten.',
        r.dia, r.repartidos, r.cupo, r.repartidos - r.cupo, r.repartidos - r.cupo;
    end if;
  end loop;

  select count(*) into v_padron from padron_alumnos;
  select sum(cupo) into v_cupo_total from dias_evento;

  raise notice '--- Total ---';
  raise notice 'Aforo de los tres días: %. Alumnos en el padrón: %.', v_cupo_total, v_padron;

  -- El aforo total es el techo del evento entero, e incluye a docentes y
  -- externos, que no están en el padrón. Si el padrón solo ya lo roza, no queda
  -- sitio para nadie de fuera.
  if v_padron > v_cupo_total then
    v_problema := true;
    raise warning
      'El padrón tiene % alumnos y en los tres días caben %. Hay % alumnos que no pueden '
      'asistir a ningún día, y todavía no se ha contado a un solo docente ni externo.',
      v_padron, v_cupo_total, v_padron - v_cupo_total;
  end if;

  if not v_problema then
    raise notice 'Sin sobrecupo. El aforo queda activo en el pre-registro y en el reparto.';
  end if;
end;
$bloque$;
