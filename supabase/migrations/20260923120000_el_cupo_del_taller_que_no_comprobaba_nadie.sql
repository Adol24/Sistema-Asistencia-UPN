-- =============================================================================
-- 59 · El cupo del taller, que no lo comprobaba nadie
--
-- El agujero
-- ----------
-- `dias_evento.cupo` se defiende solo: recuento bajo candado dentro de las dos
-- funciones de alta, y `v_cupo_dia` concedida al anónimo para que la pantalla lo
-- adelante. `talleres.cupo_total` no tenía NADA de eso:
--
--   fn_preregistrar_alumno    compara contra cupo_total?  no
--   fn_preregistrar_externo   compara contra cupo_total?  no
--   fn_cambiar_taller         compara contra cupo_total?  no
--   disparadores que lo cuenten:                          ninguno
--
-- Y la única barrera que parecía haber tampoco existía: el catálogo público lee
-- la TABLA `talleres`, y como al anónimo le está cerrada `participantes`, el
-- cupo ocupado que calculaba el navegador se quedaba en `ocupados_previos`. O
-- sea que el botón «Seleccionar» nunca llegaba a desactivarse.
--
-- Resultado: un taller de treinta plazas admite doscientas personas, y no lo ve
-- venir ni el aspirante, ni el panel, ni el reporte de ocupación. Se descubre el
-- día del evento, con doscientas personas en un salón de treinta.
--
-- Una sola función, y no el mismo bloque copiado tres veces
-- ---------------------------------------------------------
-- Las tres puertas necesitan la misma comprobación, y copiarla en las tres es
-- justo cómo se separan las reglas: la elegibilidad llegó a tener tres versiones
-- que se contradecían, y el limitador de `fn_padron_confirmar` se perdió al
-- recopiar un cuerpo. Aquí la regla vive en UN sitio y las tres la invocan.
--
-- El candado es por TALLER, no global: dos personas inscribiéndose a talleres
-- distintos no tienen por qué esperarse. Y es `xact`, así que se suelta solo al
-- terminar la transacción, entre la comprobación y el `insert` que la usa.
--
-- El conteo es el mismo que publica `v_talleres` —`ocupados_previos` más los
-- participantes— para que la pantalla y la puerta no puedan discrepar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- La regla, en un solo sitio
--
-- `security definer` porque se la llama desde funciones que atienden al
-- anónimo, y el anónimo no puede leer `participantes`. Una función `invoker`
-- correría con SUS permisos y contaría siempre cero, que es peor que no
-- comprobar: diría que hay sitio siempre.
--
-- No se concede a nadie: es un ayudante interno, y la migración 55 ya tuvo que
-- ir a cerrar siete que se habían concedido «por si acaso».
-- ---------------------------------------------------------------------------
create or replace function fn_exigir_lugar_en_taller(p_taller uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clave text;
  v_cupo integer;
  v_ocupados integer;
begin
  -- Sin taller elegido no hay nada que comprobar, y eso es lo normal: el taller
  -- es opcional.
  if p_taller is null then
    return;
  end if;

  perform pg_advisory_xact_lock(20260923, hashtext(p_taller::text));

  select t.clave, t.cupo_total, t.ocupados_previos + count(p.id)
    into v_clave, v_cupo, v_ocupados
    from talleres t
    left join participantes p on p.taller_id = t.id
   where t.id = p_taller
   group by t.clave, t.cupo_total, t.ocupados_previos;

  if v_clave is null then
    raise exception 'Ese taller no existe' using errcode = 'no_data_found';
  end if;

  if v_ocupados >= v_cupo then
    raise exception
      'El taller % ya no tiene lugares disponibles. Elige otro.', v_clave
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function fn_exigir_lugar_en_taller(uuid) from public, anon, authenticated;

comment on function fn_exigir_lugar_en_taller is
  'Rechaza si el taller ya no tiene lugares. Ayudante interno de las tres '
  'puertas que inscriben; el conteo es el mismo que publica v_talleres.';

-- ---------------------------------------------------------------------------
-- Y las tres puertas, que ahora la llaman
--
-- Los cuerpos se copiaron de sus archivos de forma MECÁNICA; lo único que se
-- añade son tres líneas en cada una. Retranscribir a mano ciento y pico de
-- líneas para colar tres es como se perdió el limitador de
-- `fn_padron_confirmar`.
-- ---------------------------------------------------------------------------

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

  -- El cupo del taller, que hasta ahora no lo comprobaba nadie. Ver
  -- `fn_exigir_lugar_en_taller`: si no hay taller elegido, no hace nada.
  perform fn_exigir_lugar_en_taller(p_taller);

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

  -- El cupo del taller, que hasta ahora no lo comprobaba nadie. Ver
  -- `fn_exigir_lugar_en_taller`: si no hay taller elegido, no hace nada.
  perform fn_exigir_lugar_en_taller(p_taller);

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

create or replace function fn_cambiar_taller(p_participante uuid, p_taller uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_costo numeric(10, 2);
begin
  select * into v_p from participantes where id = p_participante;
  if v_p is null then
    raise exception 'Ese participante no existe' using errcode = 'no_data_found';
  end if;

  -- Sin cambio no hay nada que hacer, y decirlo aquí evita comprobar el resto.
  if v_p.taller_id is not distinct from p_taller then
    return;
  end if;

  if exists (
    select 1 from pagos
     where participante_id = p_participante and concepto = 'taller'
  ) then
    raise exception 'Ya tienes un pago registrado del taller. Acude a Servicios Financieros para cambiarlo'
      using errcode = 'check_violation';
  end if;

  if p_taller is null then
    -- `chk_monto_taller` exige que el taller y su monto vayan juntos: o los dos
    -- puestos, o los dos nulos.
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = p_participante;
    return;
  end if;

  select costo into v_costo from talleres where id = p_taller and activo;
  if v_costo is null then
    raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_p.dia) then
    raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_p.dia
      using errcode = 'check_violation';
  end if;


  -- El cupo del taller, que hasta ahora no lo comprobaba nadie. Ver
  -- `fn_exigir_lugar_en_taller`: si no hay taller elegido, no hace nada.
  perform fn_exigir_lugar_en_taller(p_taller);

  update participantes
     set taller_id = p_taller, monto_esperado_taller = v_costo
   where id = p_participante;
end;
$$;

-- ---------------------------------------------------------------------------
-- La vista publica también los inscritos previos
--
-- Los tenía y no los enseñaba: `v_talleres` suma `ocupados_previos + count(p)`
-- y solo publica el total. El panel necesita los dos números por separado para
-- decir «N pre-registrados · M inscritos previos», y hasta ahora los deducía
-- restando lo que contaba el navegador — que es justo el cálculo paralelo que
-- se quiere quitar.
--
-- Publicándolo, la vista pasa a ser la única fuente del cupo y el cliente deja
-- de contar nada.
-- ---------------------------------------------------------------------------
create or replace view v_talleres
with (security_invoker = false) as
select
  t.id,
  t.clave,
  t.nombre,
  t.ponente,
  t.descripcion,
  t.horario,
  t.lugar,
  t.costo,
  t.activo,
  t.cupo_total,
  t.ocupados_previos + count(p.id) as cupo_ocupado,
  t.cupo_total - (t.ocupados_previos + count(p.id)) as lugares_libres,
  array(select dia from taller_dias td where td.taller_id = t.id order by dia) as dias,
  -- La columna nueva va AL FINAL, y no es estilo: `create or replace view` solo
  -- admite columnas añadidas al final. Meterla en medio lo rechaza PostgreSQL.
  t.ocupados_previos
from talleres t
left join participantes p on p.taller_id = t.id
-- El filtro que `talleres_lectura` aplica y esta vista se saltaría. NO se toca:
-- es lo que impide que el catálogo público enseñe talleres dados de baja, y la
-- migración 20260910100000 lo puso justo por eso.
where t.activo or es_interno_activo()
group by t.id;

comment on view v_talleres is
  'El cupo ocupado se cuenta, no se guarda. Publica también `ocupados_previos` '
  'para que el panel no tenga que deducirlo contando por su cuenta. '
  'Deliberadamente SIN security_invoker: cuenta inscritos, que el público no '
  'puede leer.';

-- El catálogo público pasa a leer esta vista en vez de la tabla `talleres`, así
-- que el permiso deja de ser teórico: sin él, el aspirante no vería ni un
-- taller. La 20260910100000 ya lo repuso —lo había deshecho un `revoke all on
-- all tables`— y se repite aquí porque ahora sí se usa.
grant select on v_talleres to anon, authenticated;
