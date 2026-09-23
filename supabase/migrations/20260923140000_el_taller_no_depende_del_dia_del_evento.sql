-- =============================================================================
-- 60 · El taller no depende del día del evento
--
-- La regla, dicha por la organización
-- -----------------------------------
-- En el pre-registro se ofrecen TODOS los talleres, sin importar el día que le
-- toque a la persona. A quien le toca el día 3 puede tomar un taller del día 1:
-- sigue asistiendo el 3 al Teatro Victoria y además va la tarde del 1 a la UPN.
--
-- Y tiene toda la lógica: los talleres se imparten en «Instalaciones UPN U-212,
-- Teziutlán», que NO es la sede del Encuentro —Salón SUTERM los días 1 y 2,
-- Teatro Victoria el 3—. Son dos eventos en dos lugares. El día que reparte
-- Servicios Escolares dice a qué sede del Encuentro va esa persona; no tiene
-- por qué decidir a qué taller entra en otro edificio.
--
-- Qué lo impedía, y no era el catálogo
-- ------------------------------------
-- `participantes.dia` cargaba DOS significados en una sola columna:
--
--   · el día al que asisto al Encuentro — lo lee el torniquete, los cierres,
--     los reportes y el aforo de `dias_evento.cupo`;
--   · el día en que tomo mi taller — lo imponía esta llave foránea, puesta en
--     `20260907000600_participantes.sql`:
--
--         foreign key (taller_id, dia) references taller_dias (taller_id, dia)
--
-- Con las dos fundidas, «cualquier taller sin importar mi día» era
-- irrepresentable: la fila no se podía insertar. Quitar el filtro del catálogo
-- —`src/routes/talleres.tsx`— sin tocar esto revivía el fallo que arregló la
-- `20260910200000`, y peor: la persona elegía, llegaba al final del recorrido y
-- el alta moría con un mensaje que la culpaba de su día.
--
-- La columna se queda con UN significado: el día al que asiste. El día del
-- taller no se guarda por persona porque no hace falta —es una propiedad del
-- taller, y vive en `taller_dias`—. Eso además resuelve solo el caso de T03,
-- T05 y T06, que son un mismo grupo de 30 asistiendo las DOS tardes: no hay que
-- elegir cuál de sus dos días es «el suyo», van a los dos.
--
-- Lo que se cae con la llave
-- --------------------------
-- Toda la maquinaria de «se te liberó el taller porque cambiaste de día» existía
-- para no violar esa llave foránea. Sin llave no tiene motivo, y peor: ahora
-- haría justo lo contrario de la regla nueva. Mover a alguien del día 1 al 3
-- desde Administración le arrancaba su taller; a partir de aquí lo conserva.
--
-- Se vacían por dentro, no se borran: `fn_reasignar_dia`,
-- `fn_asignar_dia_a_varios` y `fn_guardar_taller` conservan su firma —y
-- `p_liberar` se acepta y se ignora— para que un cliente ya desplegado no se
-- rompa a mitad del cambio. Devuelven cero liberaciones porque ya no hay
-- ninguna que hacer.
--
-- Lo que NO se toca
-- -----------------
-- · El torniquete. La `20260915180000` ya dejó a `fn_evaluar_escaneo`
--   preguntando por `taller_dias` en el modo taller, no por el día de la
--   persona. En el modo puerta sigue rechazando DÍA EQUIVOCADO, que es correcto:
--   ahí sí se está pidiendo entrar a la sede que no le toca.
-- · El aforo de cada día (`dias_evento.cupo`). Cuenta a los asistentes del
--   Encuentro por su día, y eso no cambia: el taller ocurre en otra sede y no
--   consume butacas del Encuentro.
-- · El cupo del taller (`fn_exigir_lugar_en_taller`, migración 59). Cuenta por
--   `taller_id` sin mirar días, que es exactamente lo que este modelo necesita.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La llave que fundía los dos significados
--
-- Se busca por su definición y no por nombre: nació sin `constraint <nombre>`
-- en la 0600, así que se llama como PostgreSQL decidió llamarla. Darla por
-- `participantes_taller_id_dia_fkey` y equivocarse dejaría la migración
-- «aplicada» con la llave intacta y todo lo de abajo contradiciéndose con ella.
-- ---------------------------------------------------------------------------
do $$
declare
  v_nombre text;
begin
  select c.conname into v_nombre
    from pg_constraint c
   where c.conrelid = 'participantes'::regclass
     and c.confrelid = 'taller_dias'::regclass
     and c.contype = 'f';

  if v_nombre is null then
    raise notice 'La llave (taller_id, dia) -> taller_dias ya no estaba. Nada que quitar.';
  else
    execute format('alter table participantes drop constraint %I', v_nombre);
    raise notice 'Quitada la llave foránea %: el taller deja de depender del día.', v_nombre;
  end if;
end;
$$;

comment on column participantes.dia is
  'El día al que asiste al Encuentro, y SOLO eso. El día de su taller no se '
  'guarda aquí: es del taller y vive en `taller_dias`. Ver la migración 60.';

-- ---------------------------------------------------------------------------
-- 2 · El alta del alumno
--
-- Se le quitan las dos piezas que ataban el taller al día:
--
--   · el `raise` de «ese taller no se imparte el día %, que es el que te toca»;
--   · la rama que, al alumno sin día repartido, le asignaba EL DÍA MÁS VACÍO DE
--     SU TALLER y se lo escribía en el padrón. Existía para no chocar con la
--     llave foránea, y era el taller mandando sobre el reparto de Servicios
--     Escolares —en silencio, y solo para unos pocos—. Ahora el día lo reparte
--     `fn_dia_de` como a todo el mundo, y el taller no opina.
--
-- El resto del cuerpo es el de la 59, sin cambios.
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
  perform fn_exigir_lugar_en_taller(p_taller);

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
-- 3 · El alta del docente y del externo
--
-- Se le quita el `raise` de «ese taller no se imparte el día %». Su día lo
-- elige la persona, y ahora el taller que elija no lo condiciona: puede venir
-- el día 3 y tomar un taller del día 1.
--
-- Esta redefinición además cierra un descuido de la 59: ese archivo define
-- `fn_preregistrar_externo` DOS VECES, y a la primera copia le falta el
-- `perform fn_exigir_lugar_en_taller(p_taller)` que la migración iba a añadir.
-- Gana la segunda porque `create or replace` corre en orden, así que lo
-- desplegado es correcto, pero el archivo arrastraba una copia con el agujero
-- del cupo. Aquí queda UNA sola definición, con la comprobación puesta.
-- ---------------------------------------------------------------------------
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
-- 4 · Cambiar de taller
--
-- Le sobraba la misma comprobación, y era la que más se notaba: quien volvía
-- atrás desde /pago para cambiar su taller se topaba con «ese taller no se
-- imparte el día %, que es el que te toca» aunque el taller estuviera ahí, a la
-- vista, en el catálogo.
--
-- El pago del taller sigue cerrando el cambio, y el cupo se sigue exigiendo.
-- ---------------------------------------------------------------------------
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

  -- El cupo del taller. Ver `fn_exigir_lugar_en_taller`.
  perform fn_exigir_lugar_en_taller(p_taller);

  update participantes
     set taller_id = p_taller, monto_esperado_taller = v_costo
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller de un participante. Ya NO comprueba que se imparta su día: '
  'desde la migración 60 el taller y el día del evento son independientes.';

-- ---------------------------------------------------------------------------
-- Los permisos, reafirmados
--
-- `create or replace function` conserva los privilegios, así que esto no
-- debería hacer falta. Se repite igual —es lo que hacen la 38 y la 40— porque
-- una recreación que los perdiera dejaría el pre-registro público sin poder
-- ejecutar su propia función, y el fallo no aparecería hasta que alguien
-- intentara registrarse.
--
-- Se recorre `pg_proc` por NOMBRE y no se escribe la firma a mano: las dos
-- altas ya cambiaron de firma una vez —al añadir `p_acepto_aviso`— y un
-- `grant` sobre la firma vieja se aplica en silencio a una función que no es.
-- ---------------------------------------------------------------------------
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
    raise notice 'Concedida solo a anon y authenticated: %', r.firma;
  end loop;
end;
$bloque$;

-- Debe quedar exactamente una de cada. Si salen más, quedó viva una sobrecarga
-- vieja y el pre-registro se podría hacer por la puerta antigua.
do $bloque$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo');
  if v_n <> 2 then
    raise exception 'Se esperaban 2 funciones de alta y hay %. Quedó una firma vieja viva.', v_n;
  end if;
end;
$bloque$;

-- `fn_cambiar_taller` sigue cerrada a todo el mundo, igual que la dejó la 39.
-- No la llama el cliente: la llaman las dos altas desde dentro, que son
-- `security definer`. Concederla sería dejar que cualquiera le cambiara el
-- taller a cualquiera con solo su uuid.
revoke all on function fn_cambiar_taller(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Mover de día ya no le quita el taller a nadie
--
-- Las tres funciones que liberaban inscripciones. La firma se conserva —el
-- cliente desplegado sigue pidiendo estas mismas— y lo que desaparece es la
-- liberación: `fn_reasignar_dia` y `fn_asignar_dia_a_varios` devuelven cero
-- filas, y `fn_guardar_taller` devuelve 0 liberados.
--
-- El aviso en el portal también se va. Decirle a alguien «tu inscripción se
-- liberó porque cambiaste de día» ahora sería mentira: no se liberó.
-- ---------------------------------------------------------------------------
create or replace function fn_reasignar_dia(p_matricula text, p_dia smallint)
returns table (taller_liberado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participante uuid;
begin
  update padron_alumnos set dia = p_dia where matricula = p_matricula;

  select id into v_participante from participantes where matricula = p_matricula;
  if v_participante is null then
    return;
  end if;

  -- Solo el día. El taller se queda donde está, se imparta ese día o no: la
  -- persona irá a su taller la tarde en que se imparta, que puede ser otra.
  update participantes set dia = p_dia where id = v_participante;
  return;
end;
$$;

comment on function fn_reasignar_dia is
  'Ayudante interno. NO se concede a `authenticated`: escribe el día de '
  'cualquiera y es security definer. Ver la migración 55. Desde la 60 ya no '
  'libera talleres: devuelve siempre cero filas.';

create or replace function fn_asignar_dia_a_varios(
  p_matriculas text[],
  p_dia smallint
)
returns table (matricula text, taller_liberado text)
language plpgsql
-- SIN `security definer`, a diferencia de las funciones del portal, y es
-- deliberado. Aquí no hace falta saltarse nada: quien llama ya tiene sesión, y
-- corriendo con SUS permisos las políticas de `padron_alumnos` y
-- `participantes` son exactamente la comprobación que hace falta. Con
-- `security definer` correría como el dueño de las tablas, que no está sujeto a
-- ninguna, y cualquier usuario autenticado podría mover a la gente de día.
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

  -- Solo el día, y `is distinct from` evita reescribir a quien ya estaba ahí:
  -- sería trabajo inútil y ruido en el tiempo real.
  update participantes p
     set dia = p_dia
   where p.matricula = any (p_matriculas)
     and p.dia is distinct from p_dia;

  -- Ninguna inscripción que liberar, así que ninguna fila que devolver.
  return;
end;
$$;

comment on function fn_asignar_dia_a_varios is
  'Mueve de día a un conjunto: el padrón Y el participante, que es el que lee '
  'el escáner de la puerta. Desde la migración 60 NO toca el taller: el taller '
  'y el día del evento son independientes, así que devuelve cero filas.';

revoke all on function fn_asignar_dia_a_varios(text[], smallint) from public, anon;
grant execute on function fn_asignar_dia_a_varios(text[], smallint) to authenticated;
revoke execute on function fn_reasignar_dia(text, smallint) from authenticated;

-- ---------------------------------------------------------------------------
-- 6 · Guardar un taller ya no tiene que liberar a nadie primero
--
-- El orden que la 58 documentó —liberar ANTES de tocar `taller_dias`— existía
-- por la llave foránea: mientras alguien siguiera inscrito en `(taller, día)`,
-- la base no dejaba borrar esa fila de `taller_dias`. Sin llave, ese bloqueo no
-- existe y los días se pueden reescribir directamente.
--
-- `p_liberar` se acepta y se ignora. Quitarlo de la firma rompería al cliente
-- que ya está desplegado en mitad del despliegue; se retira cuando la pantalla
-- deje de mandarlo, que es en este mismo commit.
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
                          horario, lugar, activo)
    values (p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
            p_horario, p_lugar, p_activo)
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
  text, text, text, text, numeric, integer, text, text, boolean, smallint[], boolean, boolean
) from public, anon, authenticated;
grant execute on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, boolean, smallint[], boolean, boolean
) to authenticated;

comment on function fn_guardar_taller is
  'Guarda un taller y sus días como UNA operación. Desde la migración 60 no '
  'libera inscripciones —el taller no depende del día del evento— y `p_liberar` '
  'se acepta y se ignora. Devuelve siempre 0.';

-- ---------------------------------------------------------------------------
-- 7 · Qué quedó, y qué se puede elegir ahora
-- ---------------------------------------------------------------------------
do $$
declare
  v_llave integer;
  v_activos integer;
  v_huerfanos integer;
  r record;
begin
  select count(*) into v_llave
    from pg_constraint
   where conrelid = 'participantes'::regclass
     and confrelid = 'taller_dias'::regclass
     and contype = 'f';

  if v_llave > 0 then
    raise exception 'La llave (taller_id, dia) sigue puesta: el desacople no se aplicó.';
  end if;

  select count(*) into v_activos from talleres where activo;

  -- Los que ya estaban inscritos en un taller que no se imparte su día. Antes
  -- eran imposibles; ahora son legítimos y no hay nada que corregirles.
  select count(*) into v_huerfanos
    from participantes p
   where p.taller_id is not null
     and not exists (
       select 1 from taller_dias td
        where td.taller_id = p.taller_id and td.dia = p.dia
     );

  raise notice 'El taller ya no depende del día del evento.';
  raise notice '  Talleres activos que ahora ve todo el mundo: %', v_activos;
  raise notice '  Inscritos cuyo taller cae en otro día que el suyo: % (legítimo)', v_huerfanos;

  for r in
    select d.dia,
           (select count(*) from taller_dias td where td.dia = d.dia) as talleres
      from dias_evento d
     order by d.dia
  loop
    raise notice '  Día %: % talleres se imparten ese día (elegibles por cualquiera): %',
      r.dia, r.talleres, v_activos;
  end loop;
end;
$$;
