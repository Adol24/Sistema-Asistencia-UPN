-- =============================================================================
-- Volver atrás para cambiar de taller rompía el pre-registro
--
-- Qué pasaba
-- ----------
-- El alta se ejecuta al pulsar «continuar» en la pantalla de talleres, y era
-- siempre un INSERT. Quien elegía un taller, retrocedía para cambiarlo y volvía
-- a continuar, lo ejecutaba dos veces:
--
--   duplicate key value violates unique constraint "participantes_matricula_key"
--
-- Retroceder en un formulario es de lo más normal que hace la gente, y aquí no
-- solo no funcionaba: dejaba el recorrido sin salida, porque volver a intentarlo
-- daba el mismo error una y otra vez.
--
-- Para el docente y el externo era peor, y en silencio
-- ---------------------------------------------------
-- Su `matricula` es NULL, y en PostgreSQL dos nulos no chocan dentro de un
-- índice único. Así que no había error: cada vuelta atrás creaba OTRO
-- participante, con otro folio. El anterior quedaba huérfano, contando en los
-- cupos y en los reportes como alguien que no existe. Un error se ve; esto no.
--
-- La corrección
-- -------------
-- Las dos altas pasan a ser reentrantes: si esa persona ya se pre-registró, se
-- actualiza su taller y se devuelve SU folio, en vez de crear otro. Ejecutarlas
-- dos veces con los mismos datos deja el mismo resultado que ejecutarlas una.
--
-- Lo que no se toca es el taller ya pagado. Cambiarlo dejaría un pago
-- apuntando a algo que esa persona ya no cursa, así que ahí se detiene y se le
-- dice que pase por Servicios Financieros, que es quien puede resolverlo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ayudante: cambiar el taller de alguien que ya está pre-registrado.
--
-- Lo comparten las dos altas porque las reglas son las mismas para los tres
-- perfiles; lo único distinto entre ellas es cómo se reconoce a la persona.
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
  if not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_p.dia) then
    raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_p.dia
      using errcode = 'check_violation';
  end if;

  update participantes
     set taller_id = p_taller, monto_esperado_taller = v_costo
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller de quien ya está pre-registrado. Se detiene si ya pagó ese '
  'concepto: el pago quedaría apuntando a algo que esa persona no cursa.';

-- ---------------------------------------------------------------------------
-- El alumno: se reconoce por su matrícula, que es única.
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_alumno(
  p_matricula text,
  p_correo text,
  p_celular text,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a record;
  v_cfg record;
  v_dia smallint;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_dominio text;
  v_ya record;
begin
  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en el padrón' using errcode = 'no_data_found';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
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
    -- Sin día repartido y con taller elegido: el día más vacío DE ESE TALLER.
    select td.dia into v_dia
      from taller_dias td
      left join padron_alumnos a on a.dia = td.dia
     where td.taller_id = p_taller
     group by td.dia
     order by count(a.matricula), td.dia
     limit 1;
    if v_dia is null then
      raise exception 'Ese taller no tiene días asignados' using errcode = 'no_data_found';
    end if;
    update padron_alumnos set dia = v_dia where matricula = v_a.matricula;
  else
    v_dia := fn_dia_de(v_a.matricula);
  end if;

  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller
  )
  values (
    'alumno', v_a.matricula, v_a.nombre, lower(trim(p_correo)), p_celular,
    'Universidad Autónoma',
    v_a.nivel_id, v_a.programa_id, v_a.avance, v_a.grupo, v_a.plantel_id,
    v_dia, p_taller, v_cfg.cuota_evento, v_costo
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Pre-registró a un alumno',
          format('%s · %s · día %s', v_folio, v_a.matricula, v_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', v_dia);
end;
$$;

-- ---------------------------------------------------------------------------
-- El docente y el externo: se reconocen por su correo.
--
-- No tienen matrícula, así que no hay restricción que los proteja de
-- duplicarse; el correo es lo único que identifica a la misma persona entre dos
-- intentos del mismo formulario. Se compara solo dentro de su propio perfil:
-- que un alumno y un docente compartan correo es raro pero posible, y no son la
-- misma inscripción.
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
  v_correo text;
  v_ya record;
begin
  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;
  v_correo := lower(trim(p_correo));

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
  -- `order by creado_en` importa: este fallo ya pudo dejar duplicados, y ante
  -- varios se elige el PRIMERO, que es el folio que esa persona llegó a ver.
  select id, folio, dia into v_ya
    from participantes
   where correo = v_correo and perfil = v_perfil
   order by creado_en
   limit 1;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
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

  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller
  )
  values (
    v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
    trim(p_institucion),
    null, null, null, null, null,
    p_dia, p_taller, v_cfg.cuota_evento, v_costo
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona)', v_folio, upper(trim(p_nombre)), p_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$$;

-- Desde `20260908160000` las funciones no nacen ejecutables por PUBLIC.
-- `fn_cambiar_taller` NO se concede a nadie: solo la llaman las dos altas, que
-- ya comprobaron quién es la persona. Concederla suelta dejaría cambiarle el
-- taller a cualquiera sabiendo su uuid.
revoke all on function fn_cambiar_taller(uuid, uuid) from public, anon, authenticated;

revoke all on function fn_preregistrar_alumno(text, text, text, uuid) from public;
grant execute on function fn_preregistrar_alumno(text, text, text, uuid) to anon, authenticated;
revoke all on function fn_preregistrar_externo(text, text, text, text, text, smallint, uuid)
  from public;
grant execute on function fn_preregistrar_externo(text, text, text, text, text, smallint, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El caso de nombre también tiene que aguantar una vuelta atrás
--
-- Se abre al cerrar el pre-registro, o sea en la misma pulsación que se acaba
-- de volver reentrante. Insertaba siempre, así que ir y volver dejaba a soporte
-- DOS casos idénticos de la misma persona, y resolver uno no quitaba la marca
-- porque el otro seguía abierto.
--
-- Ahora, si ya tiene uno sin resolver, se actualiza con la corrección más
-- reciente en vez de abrir otro: quien vuelve atrás puede haber escrito su
-- nombre de otra forma, y lo que soporte necesita es la última, no las dos.
-- ---------------------------------------------------------------------------
create or replace function fn_abrir_caso_nombre(
  p_participante uuid,
  p_nombre_correcto text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_clave text;
  v_detalle text;
begin
  select nombre into v_nombre from participantes where id = p_participante;
  if v_nombre is null then
    raise exception 'No existe ese participante' using errcode = 'no_data_found';
  end if;

  v_detalle := format(
    'Dice "%s" y debe decir "%s". Lo reportó el alumno al confirmar su nombre.',
    v_nombre, p_nombre_correcto
  );

  update casos_soporte
     set detalle = v_detalle
   where participante_id = p_participante
     and asunto = 'Nombre incorrecto en el registro'
     and estado <> 'resuelto'
  returning clave into v_clave;

  if v_clave is not null then
    return v_clave;
  end if;

  insert into casos_soporte (participante_id, asunto, detalle, canal)
  values (p_participante, 'Nombre incorrecto en el registro', v_detalle, 'portal')
  returning clave into v_clave;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Abrió un caso de nombre',
          format('%s · %s → %s', v_clave, v_nombre, p_nombre_correcto));

  return v_clave;
end;
$$;

revoke all on function fn_abrir_caso_nombre(uuid, text) from public;
grant execute on function fn_abrir_caso_nombre(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Los duplicados que este fallo ya pudo crear NO se borran aquí.
--
-- Solo afecta a docentes y externos, y solo a quienes retrocedieron. Borrar
-- filas de participantes desde una migración es irreversible y sin supervisión:
-- alguno puede tener ya un pago o una asistencia colgando, y `participantes`
-- tiene llaves foráneas con `on delete restrict` precisamente para que nadie
-- los borre a la ligera.
--
-- Se localizan así, y se resuelven desde Administración:
--
--   select correo, perfil, count(*), array_agg(folio order by creado_en)
--     from participantes
--    where matricula is null
--    group by correo, perfil
--   having count(*) > 1;
-- ---------------------------------------------------------------------------
