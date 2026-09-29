-- =============================================================================
-- Los cinco lugares del docente
--
-- Esta migración es `20260929180000_los_cinco_lugares_del_docente`.
--
-- EXIGE que `20260929120000` y `20260929130000` ya estén aplicadas, en ese
-- orden y en corridas separadas: aquí se vuelven a emitir
-- `fn_preregistrar_externo` y `fn_cambiar_taller`, y sus cuerpos hablan de
-- `quiere_constancia`. La sentencia 0 lo comprueba y se detiene si falta.
--
-- La regla, tal como la dio la organización el 2026-09-29
-- -------------------------------------------------------
-- A cada aula se le suman **5 lugares más, solo para docentes**. Los 30 de
-- siempre siguen siendo **definitivos de los alumnos**: ni un maestro puede
-- reducirlos, ni un alumno puede pasarlos.
--
-- El ejemplo con el que se explicó, y es el que hay que poder contestar:
--
--   Un taller de 30 con 27 inscritos. Llega un maestro. NO ocupa el lugar 28,
--   porque el 28 es de un alumno. Entra «arriba», en el 31. Después llegan tres
--   alumnos y los tres pueden registrarse: siguen teniendo sus 3 lugares. Pero
--   un cuarto alumno ya no entra, porque su tope son 30, y no puede ser el 31,
--   32, 33, 34 ni el 35 aunque estén vacíos.
--
-- **El desplazamiento no se programa, y eso es lo que hace que esto sea
-- pequeño.** No hay asientos numerados en ninguna parte: `talleres` guarda un
-- tope y los inscritos se cuentan. Con dos contadores independientes el maestro
-- ya está siempre por encima de los 30 por construcción, así que no hay nada que
-- reacomodar ni carrera que perder.
--
-- El externo cuenta como alumno
-- -----------------------------
-- Decisión de la organización, el mismo día: los 5 son **solo del perfil
-- `docente`**, que además es el profesor de la UPN U-212. El `externo` —incluido
-- el profesor de otra institución— cuenta dentro del tope del alumno y no gana
-- ninguno de los lugares nuevos.
--
-- Es la primera vez que `docente` y `externo` significan cosas distintas. Hasta
-- hoy eran dos etiquetas para lo mismo: misma cuota, misma ventana, misma
-- elegibilidad, ninguno sube evidencias.
--
-- Qué le toca a cada taller
-- -------------------------
--   Las nueve aulas    total 35, tope de no docentes 30 → reserva de 5.
--                      T01, T02, T03, T05, T06, T07, T08, T09, T11.
--   T10, Centro de     total 30, tope de no docentes 30 → reserva de **0**.
--   cómputo            No hay cinco máquinas de sobra, así que no hay cinco
--                      lugares: ahí no entra ningún maestro. Sale gratis del
--                      mismo modelo, sin un concepto nuevo.
--   T04 y T12, Sala    `cupo_no_docentes` NULO: un solo número de 70 compartido,
--   de usos múltiples  exactamente como hoy. No cambian de comportamiento.
--
-- Una sola columna, y la reserva se RESTA
-- ---------------------------------------
-- Se guarda el tope de los no docentes y no la reserva del docente, y la razón
-- es cuál de los dos números no se puede mover: los 30 del alumno. Si alguien
-- sube `cupo_total` a 40 desde el panel, con el 30 guardado los alumnos siguen en
-- 30 y crece el margen del docente; con el 5 guardado, el tope del alumno subiría
-- a 35 en silencio. Se protege el que la organización llamó definitivo.
--
-- Y con tres números guardados (35, 30 y 5) se pueden dejar sin cuadrar desde el
-- panel, y entonces el aula admite 36.
--
-- Por qué la columna es NULABLE
-- -----------------------------
-- NULO significa «sin partir: un solo número para todos», que es el
-- comportamiento de hoy. Es lo que deja a T04 y T12 intactos **sin dejar fuera
-- de tope a nadie**: poner `reserva = 0` por omisión habría puesto al docente que
-- ya está en T04 y al de T12 por encima de un tope de cero.
--
-- Qué NO cambia
-- -------------
-- El aforo del día (`dias_evento.cupo`, `v_cupo_dia`) es otro tope y no se toca.
-- `ocupados_previos` sigue siendo un número sin perfil —invitados y cortesías—:
-- cuenta contra el total del aula pero NO contra el tope del alumno, porque una
-- cortesía no es un alumno. Está en 0 en los doce, comprobado en vivo el
-- 2026-09-29, así que hoy no decide nada; el día que alguien cargue ahí gente que
-- sí es alumno, habrá que partir también esa columna.
--
-- Lo que esta regla cuesta, y se aceptó sabiéndolo
-- -----------------------------------------------
-- Van a quedar sillas vacías que nadie puede ocupar, en las dos direcciones:
--
--   · Aula con 30 alumnos y 0 docentes: cinco sillas libres y un alumno al que
--     se le dice no. Es lo que va a pasar en los diez talleres llenos en cuanto
--     esto se aplique, y alguien va a preguntar por qué.
--   · Aula con 20 alumnos y 5 docentes: diez sillas libres y un sexto docente al
--     que se le dice no.
--
-- Con los datos del 2026-09-29 solo existe la primera: los diez talleres llenos
-- están a 30 alumnos exactos y cero maestros, así que 30 + 5 = 35 encaja justo y
-- no se desperdicia nada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0 · Que las dos anteriores estén puestas
--
-- Aquí se reemiten `fn_preregistrar_externo` y `fn_cambiar_taller` con el cuerpo
-- que trae la exención del docente. Aplicar esto antes que ellas dejaría dos
-- funciones hablando de una columna y de un valor de enum que no existen.
-- ---------------------------------------------------------------------------
do $bloque$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'estado_pago' and e.enumlabel = 'exento'
  ) then
    raise exception
      'Falta el valor «exento» en estado_pago. Aplica primero, y en corridas '
      'APARTE, 20260929120000 y después 20260929130000.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'participantes'
       and column_name = 'quiere_constancia'
  ) then
    raise exception
      'Falta participantes.quiere_constancia. Aplica primero '
      '20260929130000_el_docente_no_paga_salvo_que_quiera_constancia.sql';
  end if;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- 1 · La columna, y la invariante que la ata al total
-- ---------------------------------------------------------------------------
alter table talleres add column if not exists cupo_no_docentes integer;

comment on column talleres.cupo_no_docentes is
  'El tope de alumnos y externos JUNTOS. La reserva del docente no se guarda: es '
  'cupo_total menos esto. NULO significa «sin partir»: un solo número para todos, '
  'como antes del 2026-09-29. Se llama «no_docentes» y no «alumnos» porque el '
  'externo cuenta aquí dentro, y un nombre que dijera «alumnos» mentiría.';

-- No se llama `cupo_alumnos` por eso mismo, y el nombre es la mitad del contrato.
alter table talleres drop constraint if exists chk_cupo_no_docentes;
alter table talleres add constraint chk_cupo_no_docentes
  check (cupo_no_docentes is null
         or (cupo_no_docentes >= 0 and cupo_no_docentes <= cupo_total));

comment on constraint chk_cupo_no_docentes on talleres is
  'El tope del alumno no puede pasar del aula. Si pasara, la reserva del docente '
  'saldría negativa y el guardia admitiría a cualquiera.';

-- ---------------------------------------------------------------------------
-- 2 · El reparto del 2026-09-29
--
-- Por CLAVE, nunca por posición: los dos últimos renglones del documento oficial
-- van al revés que las claves de la base. Ver `20260924220000`.
-- ---------------------------------------------------------------------------

-- Las nueve aulas: 30 + 5.
update talleres
   set cupo_total = 35,
       cupo_no_docentes = 30
 where clave in ('T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T11');

-- El Centro de cómputo: los 30 siguen siendo 30, y se declaran de los alumnos.
-- `35 - 35` no: `30 - 30`, o sea reserva CERO. Ahí no entra ningún maestro
-- porque no hay cinco máquinas para ellos.
update talleres
   set cupo_no_docentes = 30
 where clave = 'T10';

-- T04 y T12 no se tocan: `cupo_no_docentes` se queda NULO y siguen con sus 70
-- compartidos. Se dice con un `update` vacío en vez de con un comentario para que
-- la intención quede en el SQL y no solo en la prosa.
update talleres
   set cupo_no_docentes = null
 where clave in ('T04', 'T12');

-- ---------------------------------------------------------------------------
-- 3 · El guardia, que ahora cuenta dos veces
--
-- La firma gana el perfil, y **hay que tirar la de un argumento**: dejarla viva
-- sería dejar viva la versión que cuenta un solo cupo, y cualquier llamador que
-- no se actualizara admitiría alumnos en los lugares del docente sin que nada se
-- queje. Es el mismo error que documentó `20260917140000`.
--
-- Sus tres llamadores conocen el perfil y se reemiten más abajo:
--   `fn_preregistrar_alumno`   → literal 'alumno'
--   `fn_preregistrar_externo`  → su `v_perfil`
--   `fn_cambiar_taller`        → `v_p.perfil`, y por ahí lo hereda
--                                `fn_asignar_taller`, el del panel
--
-- El orden de las comprobaciones importa. Primero el aula para todos, porque
-- `ocupados_previos` no tiene perfil y ocupa silla: sin ese primer corte, 30
-- alumnos + 5 docentes + 3 cortesías metería 38 personas en un aula de 35.
-- ---------------------------------------------------------------------------
drop function if exists fn_exigir_lugar_en_taller(uuid);

create or replace function fn_exigir_lugar_en_taller(
  p_taller uuid,
  p_perfil perfil_participante
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clave text;
  v_cupo integer;
  v_tope integer;
  v_previos integer;
  v_inscritos integer;
  v_no_docentes integer;
  v_docentes integer;
  v_reserva integer;
begin
  -- Sin taller elegido no hay nada que comprobar, y eso es lo normal: el taller
  -- es opcional.
  if p_taller is null then
    return;
  end if;

  perform pg_advisory_xact_lock(20260923, hashtext(p_taller::text));

  select t.clave, t.cupo_total, t.cupo_no_docentes, t.ocupados_previos,
         count(p.id),
         count(p.id) filter (where p.perfil <> 'docente'),
         count(p.id) filter (where p.perfil = 'docente')
    into v_clave, v_cupo, v_tope, v_previos,
         v_inscritos, v_no_docentes, v_docentes
    from talleres t
    left join participantes p on p.taller_id = t.id
   where t.id = p_taller
   group by t.clave, t.cupo_total, t.cupo_no_docentes, t.ocupados_previos;

  if v_clave is null then
    raise exception 'Ese taller no existe' using errcode = 'no_data_found';
  end if;

  -- El aula, para todo el mundo. Las cortesías van aquí y solo aquí: no tienen
  -- perfil, así que no se pueden contar contra el tope de nadie, pero ocupan
  -- silla y el salón no estira.
  if v_previos + v_inscritos >= v_cupo then
    raise exception
      'El taller % ya no tiene lugares disponibles. Elige otro.', v_clave
      using errcode = 'check_violation';
  end if;

  -- Sin partición declarada el cupo es uno solo, y ya quedó comprobado arriba.
  -- Es el caso de T04 y T12, y el de cualquier taller nuevo hasta que alguien
  -- decida partirlo.
  if v_tope is null then
    return;
  end if;

  v_reserva := v_cupo - v_tope;

  if p_perfil = 'docente' then
    /*
     * Reserva cero es una regla, no un taller lleno, y el mensaje tiene que
     * decirlo. Es el caso de T10: «ya no tiene lugares» mandaría a ese docente a
     * volver a intentarlo mañana, y ahí no va a haber lugar nunca.
     */
    if v_reserva = 0 then
      raise exception
        'El taller % es solo para alumnos: no tiene lugares para docentes. Elige otro.',
        v_clave
        using errcode = 'check_violation';
    end if;

    if v_docentes >= v_reserva then
      raise exception
        'El taller % ya no tiene lugares para docentes: son % y están ocupados. Elige otro.',
        v_clave, v_reserva
        using errcode = 'check_violation';
    end if;

    return;
  end if;

  /*
   * Alumno y externo comparten tope, y aquí es donde los 30 se vuelven
   * definitivos: aunque el aula tenga sillas libres —las del docente— este corte
   * no las mira. Un alumno no puede ser el 31.
   */
  if v_no_docentes >= v_tope then
    raise exception
      'El taller % ya no tiene lugares disponibles. Elige otro.', v_clave
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function fn_exigir_lugar_en_taller is
  'El cupo del taller, contado por perfil desde el 2026-09-29: el docente tiene '
  'su reserva (cupo_total menos cupo_no_docentes) y el alumno con el externo '
  'tienen la suya, y ninguno puede tomar del otro. Con cupo_no_docentes nulo '
  'vuelve a ser un solo número. Siempre comprueba además el total del aula, '
  'porque ocupados_previos no tiene perfil.';

-- Cerrada a todo el mundo: la llaman las dos altas y `fn_cambiar_taller`, que
-- son `security definer` y corren como el dueño.
revoke all on function fn_exigir_lugar_en_taller(uuid, perfil_participante)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Los tres llamadores
--
-- Se conservan palabra por palabra salvo la línea de la llamada:
--   `fn_preregistrar_alumno`  de `20260923140000`
--   `fn_preregistrar_externo` de `20260929130000`
--   `fn_cambiar_taller`       de `20260929130000`
--
-- `create or replace` conserva los privilegios, así que ninguna necesita que se
-- le vuelvan a conceder: las tres firmas se quedan como estaban.
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

  /*
   * El día es el que le repartió Servicios Escolares, y el taller elegido ya no
   * influye en él.
   *
   * `if` explícito y NO `coalesce(v_a.dia, fn_dia_de(...))`: `fn_dia_de`
   * escribe —le reparte el día más vacío y lo guarda en el padrón—, y dejar esa
   * escritura colgando del cortocircuito de `coalesce` es apoyarse en un
   * detalle de evaluación para que no ocurra un efecto. Se dice en una rama,
   * donde se ve. Si los tres días están llenos, `fn_dia_de` levanta su propio
   * mensaje.
   */
  if v_a.dia is not null then
    v_dia := v_a.dia;
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

  -- El cupo del taller. Ver `fn_exigir_lugar_en_taller`: cuenta por taller sin
  -- mirar días, y si no hay taller elegido no hace nada.
  -- El perfil va como argumento desde el 2026-09-29: el guardia ya no cuenta un
  -- solo cupo, cuenta el de alumnos y el del docente por separado. Aquí es
  -- siempre alumno, y por eso va literal.
  perform fn_exigir_lugar_en_taller(p_taller, 'alumno');

  /*
   * El alta, y qué hacer si otra petición se nos adelantó entre la búsqueda de
   * arriba y este insert.
   *
   * La ventana es real: dos pestañas, o el doble clic de quien no ve respuesta.
   * Antes la segunda petición reventaba con la violación de unicidad de
   * `matricula` y la persona veía «Ese registro ya existe» al final de todo su
   * recorrido, sin folio. Ahora se relee la fila que ganó y se devuelve la
   * misma respuesta que habría dado la búsqueda.
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
-- El alta del docente y del externo
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_acepto_aviso boolean,
  p_taller uuid default null,
  /*
   * La respuesta a «¿quieres constancia?», que solo se le pregunta al docente.
   *
   * Trae `true` por omisión, y el valor por omisión es el que COBRA: si un
   * llamador viejo no manda nada, esa persona queda con su cuota de siempre.
   * Al revés —exento por omisión— un cliente sin actualizar dejaría entrar
   * gratis a todo el mundo, y eso no se nota hasta el torniquete.
   */
  p_quiere_constancia boolean default true
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
  v_quiere boolean := coalesce(p_quiere_constancia, true);
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

  /*
   * La exención es SOLO del docente.
   *
   * La regla del 2026-09-29 habla de los maestros, y el externo paga igual que
   * antes. `chk_exento_solo_docente` lo vuelve a decir en la tabla y ese es el
   * que manda; esto existe para que el mensaje diga qué pasó en vez de un
   * «violación de restricción».
   */
  if not v_quiere and v_perfil <> 'docente' then
    raise exception 'Solo los docentes pueden registrarse sin pagar la cuota'
      using errcode = 'check_violation';
  end if;
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
    perform fn_sincronizar_exencion(v_ya.id, v_quiere);
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- El taller ya no se comprueba contra `p_dia`: puede ser de otro día. Lo
  -- único que se le exige es existir y estar activo.
  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
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
  -- El perfil va como argumento desde el 2026-09-29. `v_perfil` ya está validado
  -- arriba: solo puede ser `docente` o `externo`, y el externo cuenta dentro del
  -- tope del alumno.
  perform fn_exigir_lugar_en_taller(p_taller, v_perfil);

  -- El cierre de la carrera que puso la 39: si otra petición se adelantó entre
  -- la búsqueda de arriba y este insert, se relee su fila y se devuelve su folio.
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en, quiere_constancia
    )
    values (
      v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
      trim(p_institucion),
      null, null, null, null, null,
      p_dia, p_taller,
      -- Los dos importes a la vez: el evento y el taller le salen gratis juntos,
      -- porque la organización los eximió juntos. `chk_monto_taller` exige que
      -- el taller y su monto vayan de la mano, así que sin taller sigue nulo.
      case when v_quiere then v_cfg.cuota_evento else 0 end,
      case when v_costo is null then null when v_quiere then v_costo else 0 end,
      now(), v_quiere
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
      perform fn_sincronizar_exencion(v_ya.id, v_quiere);
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
  -- Va ANTES de la guardia del depósito a propósito: el alta del pre-registro es
  -- reentrante y vuelve a pasar por aquí con el mismo taller que la persona ya
  -- tiene. Comprobar el pago primero convertiría ese «no cambia nada» en un
  -- error para todo el que ya hubiera depositado.
  if v_p.taller_id is not distinct from p_taller then
    return;
  end if;

  /*
   * Cualquier depósito cierra el taller, no solo el del taller.
   *
   * Antes esto decía `and concepto = 'taller'`, y por ahí se colaba el caso que
   * importa: quien ya depositó los 500 del evento tiene una fila con
   * `concepto = 'evento'`, así que la comprobación no lo veía y se le podía
   * añadir un taller que nadie iba a cobrarle.
   *
   * Y el depósito es uno solo desde el 2026-09-25: el concepto que escribió a
   * mano en su hoja dice si lleva taller o no. Cambiárselo después no le
   * modifica una cifra, le invalida el papel que ya entregó en ventanilla.
   */
  if exists (select 1 from pagos where participante_id = p_participante) then
    raise exception
      'Ya tienes un depósito registrado, y el taller va en ese mismo depósito. '
      'Para cambiarlo acude a Servicios Financieros'
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

  -- El cupo del taller. Ver `fn_exigir_lugar_en_taller`.
  -- El perfil va como argumento desde el 2026-09-29, y aquí sale de la ficha:
  -- este es el camino del panel —`fn_asignar_taller` delega aquí— y también el de
  -- las dos altas cuando alguien retrocede y cambia de taller.
  perform fn_exigir_lugar_en_taller(p_taller, v_p.perfil);

  /*
   * El monto del taller respeta la exención del docente.
   *
   * Esta línea decía `monto_esperado_taller = v_costo` y era la vía por la que
   * un maestro exento volvía a deber dinero sin tocar nada: le basta cambiar de
   * taller —o que el alta reentrante pase por aquí— para que el catálogo le
   * ponga los 100 encima. La organización eximió el evento Y el taller juntos.
   *
   * Cero y no nulo: `chk_monto_taller` exige que el taller y su monto vayan de
   * la mano, y el nulo significa «no lleva taller», no «no lo paga».
   */
  update participantes
     set taller_id = p_taller,
         monto_esperado_taller = case when v_p.quiere_constancia then v_costo else 0 end
   where id = p_participante;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · La vista publica los dos contadores
--
-- Hasta hoy publicaba UNO —`lugares_libres`— y la pantalla lo enseñaba a todos.
-- Con la reserva del docente eso deja de poder ser cierto para los dos a la vez:
-- en el mismo taller y en el mismo instante, un alumno tiene que leer «Cupo
-- lleno» y un docente «5 lugares disponibles».
--
-- `lugares_libres` se queda tal cual: es el del AULA, y es lo que el panel usa
-- para enseñar `ocupado/total`. Los dos nuevos van al final, que es lo único que
-- `create or replace view` admite.
--
-- `security_invoker = false` se repite a propósito: lo puso `20260923120000` para
-- que el catálogo público pueda contar los inscritos sin poder leerlos, y
-- reemplazar la vista sin declararlo la devolvería a los permisos de quien la
-- crea. Ver esa migración.
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
  t.ocupados_previos,
  t.salon,
  /*
   * Las tres columnas del reparto por perfil, y van AL FINAL porque
   * `create or replace view` solo admite añadir al final.
   *
   * `cupo_no_docentes` nulo significa «sin partir»: un solo número para todos, y
   * entonces los dos contadores de abajo devuelven el mismo `lugares_libres` que
   * la vista ya publicaba. Así la pantalla puede preguntar siempre por el
   * contador de su audiencia sin distinguir los dos casos.
   *
   * La regla se deriva AQUÍ y no en el navegador, por lo de siempre: la misma
   * cuenta la hace `fn_exigir_lugar_en_taller` al admitir, y si vive en dos
   * sitios acaban discrepando —el catálogo ofrece un lugar que el alta rechaza—.
   */
  t.cupo_no_docentes,
  case
    when t.cupo_no_docentes is null
      then t.cupo_total - (t.ocupados_previos + count(p.id))
    else least(
      t.cupo_no_docentes - count(p.id) filter (where p.perfil <> 'docente'),
      t.cupo_total - (t.ocupados_previos + count(p.id))
    )
  end as libres_no_docentes,
  case
    when t.cupo_no_docentes is null
      then t.cupo_total - (t.ocupados_previos + count(p.id))
    else least(
      (t.cupo_total - t.cupo_no_docentes) - count(p.id) filter (where p.perfil = 'docente'),
      t.cupo_total - (t.ocupados_previos + count(p.id))
    )
  end as libres_docentes
from talleres t
left join participantes p on p.taller_id = t.id
-- El filtro que `talleres_lectura` aplica y esta vista se saltaría. NO se toca:
-- es lo que impide que el catálogo público enseñe talleres dados de baja.
where t.activo or es_interno_activo()
group by t.id;


comment on view v_talleres is
  'El cupo ocupado se cuenta, no se guarda. Publica también `ocupados_previos` y '
  '`salon`. Desde el 2026-09-29 publica los DOS contadores de lugares libres: '
  '`libres_no_docentes` para el alumno y el externo, `libres_docentes` para el '
  'maestro. Con `cupo_no_docentes` nulo los dos valen lo mismo que `lugares_libres`.';

-- ---------------------------------------------------------------------------
-- 6 · El panel puede editar el número
--
-- Misma técnica que usó `20260924220000` al añadir `p_salon`, y por la misma
-- razón: **no se tira la firma anterior, se convierte en envoltura**. Un cliente
-- que todavía no conoce el parámetro nuevo seguiría editando cupo y días, y si la
-- firma vieja hiciera `set cupo_no_docentes = null` le borraría la reserva al
-- taller sin que nadie lo pidiera. La envoltura le pasa el valor que ya tiene.
--
-- NULO para un taller nuevo, que es el valor seguro: sin partir, como hoy.
--
-- Las dos firmas no se confunden: PostgREST resuelve por el conjunto de nombres
-- que recibe, y `p_cupo_no_docentes` no tiene valor por omisión.
-- ---------------------------------------------------------------------------
create or replace function fn_guardar_taller(
  p_clave text,
  p_nombre text,
  p_descripcion text,
  p_ponente text,
  p_costo numeric,
  p_cupo_total integer,
  p_horario text,
  p_lugar text,
  p_salon text,
  /*
   * El tope de alumnos y externos juntos. **Nulo significa «sin partir»**: un
   * solo número para todos, que es como funcionaron los doce talleres hasta el
   * 2026-09-29 y como siguen funcionando T04 y T12.
   *
   * No se guarda la reserva del docente: se resta (`cupo_total - esto`). Con los
   * tres números guardados, alguien los deja sin cuadrar desde esta misma
   * pantalla y el aula admite 36.
   */
  p_cupo_no_docentes integer,
  p_activo boolean,
  p_dias smallint[],
  p_crear boolean,
  p_liberar boolean
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- El mensaje legible. Sin esto, quien no sea administración recibiría el
  -- «new row violates row-level security policy» de la política, que es cierto
  -- y no le dice a nadie qué hacer.
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede editar los talleres'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(array_length(p_dias, 1), 0) = 0 then
    raise exception 'Un taller sin días no se imparte ningún día: nadie podría inscribirse'
      using errcode = 'check_violation';
  end if;

  if p_crear then
    -- `insert` y no `upsert`: si la clave ya existe tiene que rebotar, no
    -- machacar el taller que la tenía.
    insert into talleres (clave, nombre, descripcion, ponente, costo, cupo_total,
                          horario, lugar, salon, cupo_no_docentes, activo)
    values (p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
            p_horario, p_lugar, coalesce(p_salon, ''), p_cupo_no_docentes, p_activo)
    returning id into v_id;
  else
    update talleres
       set nombre = p_nombre,
           descripcion = p_descripcion,
           ponente = p_ponente,
           costo = p_costo,
           cupo_total = p_cupo_total,
           horario = p_horario,
           lugar = p_lugar,
           salon = coalesce(p_salon, ''),
           cupo_no_docentes = p_cupo_no_docentes,
           activo = p_activo
     where clave = p_clave
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe ningún taller con la clave %', p_clave
        using errcode = 'no_data_found';
    end if;
  end if;

  -- Los días, tal cual. Ya no hay inscripción que estorbe al borrado.
  delete from taller_dias where taller_id = v_id and not (dia = any (p_dias));

  insert into taller_dias (taller_id, dia)
  select v_id, d from unnest(p_dias) as d
  on conflict (taller_id, dia) do nothing;

  -- Cero liberados, siempre. El valor se conserva para no cambiarle el tipo de
  -- retorno a un cliente desplegado.
  return 0;
end;
$$;

revoke all on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, integer,
  boolean, smallint[], boolean, boolean
) from public, anon, authenticated;

grant execute on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, integer,
  boolean, smallint[], boolean, boolean
) to authenticated;

comment on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, integer,
  boolean, smallint[], boolean, boolean
) is
  'Guarda un taller, su salón, su tope de no docentes y sus días como UNA '
  'operación. `p_cupo_no_docentes` nulo deja el cupo sin partir. No libera '
  'inscripciones y `p_liberar` se acepta y se ignora. Devuelve siempre 0.';

-- La firma de trece parámetros pasa a ser envoltura: conserva el tope guardado.
create or replace function fn_guardar_taller(
  p_clave text,
  p_nombre text,
  p_descripcion text,
  p_ponente text,
  p_costo numeric,
  p_cupo_total integer,
  p_horario text,
  p_lugar text,
  p_salon text,
  p_activo boolean,
  p_dias smallint[],
  p_crear boolean,
  p_liberar boolean
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
begin
  return fn_guardar_taller(
    p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
    p_horario, p_lugar, p_salon,
    -- El tope que ya tiene. En un alta no hay fila todavía y sale NULO, que es lo
    -- correcto: un cliente que no sabe pedirlo tampoco puede darlo, y sin partir
    -- es el comportamiento de siempre.
    (select cupo_no_docentes from talleres where clave = p_clave),
    p_activo, p_dias, p_crear, p_liberar
  );
end;
$$;

comment on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text,
  boolean, smallint[], boolean, boolean
) is
  'Firma anterior, conservada para el cliente que todavía no conoce '
  '`p_cupo_no_docentes`. Delega conservando el tope guardado, para que editar un '
  'taller desde un cliente viejo no le borre la reserva del docente.';

-- ---------------------------------------------------------------------------
-- 7 · Lo que esta migración comprueba de sí misma
--
-- Ninguna consulta inventa datos: se mira el catálogo y los talleres que ya hay.
-- Los guardias se detienen si algo no quedó, así que un verde aquí significa que
-- el reparto está puesto, no que se haya probado inscribiendo a nadie.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  r record;
  v_n integer;
begin
  -- Las nueve aulas, con su reserva de cinco.
  select count(*) into v_n
    from talleres
   where clave in ('T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T11')
     and cupo_total = 35 and cupo_no_docentes = 30;
  if v_n <> 9 then
    raise exception 'Se esperaban 9 aulas en 35/30 y quedaron %.', v_n;
  end if;

  -- T10: reserva cero, que es la regla «solo alumnos».
  if not exists (
    select 1 from talleres
     where clave = 'T10' and cupo_total = 30 and cupo_no_docentes = 30
  ) then
    raise exception 'T10 no quedó en 30/30: su reserva de docentes debe ser cero.';
  end if;

  -- T04 y T12: sin partir.
  select count(*) into v_n
    from talleres where clave in ('T04', 'T12') and cupo_no_docentes is null;
  if v_n <> 2 then
    raise exception
      'T04 y T12 deben quedar con cupo_no_docentes NULO —70 compartidos— y hay % así.',
      v_n;
  end if;

  -- El guardia viejo no puede seguir vivo: contaba un solo cupo.
  if exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'fn_exigir_lugar_en_taller'
       and pronargs = 1
  ) then
    raise exception
      'Sigue viva fn_exigir_lugar_en_taller(uuid), la que cuenta un solo cupo. '
      'Con ella, un alumno puede ocupar los lugares del docente.';
  end if;

  -- Y los tres llamadores tienen que estar pasándole el perfil.
  for r in
    select proname, prosrc
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo',
                       'fn_cambiar_taller')
  loop
    if r.prosrc like '%fn_exigir_lugar_en_taller(p_taller)%' then
      raise exception
        '% todavía llama al guardia sin perfil.', r.proname;
    end if;
  end loop;

  -- Cuántos lugares nuevos quedaron, para volver sobre esto con un número.
  select coalesce(sum(t.cupo_total - t.cupo_no_docentes), 0) into v_n
    from talleres t where t.cupo_no_docentes is not null and t.activo;
  raise notice 'Lugares reservados para docentes en todo el evento: %.', v_n;

  for r in
    select clave, salon, cupo_total, cupo_no_docentes,
           cupo_total - cupo_no_docentes as reserva
      from talleres where activo order by clave
  loop
    raise notice '% · % · aula % · alumnos % · docentes %',
      r.clave, r.salon, r.cupo_total,
      coalesce(r.cupo_no_docentes::text, 'compartido'),
      coalesce(r.reserva::text, 'compartido');
  end loop;
end;
$bloque$;
