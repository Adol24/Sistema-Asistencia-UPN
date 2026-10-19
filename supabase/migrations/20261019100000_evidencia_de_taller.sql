-- =============================================================================
-- Evidencia de taller
--
-- Hasta ahora `evidencias` solo contemplaba los días de conferencia que el
-- alumno NO asiste en persona (`e.dia <> p.dia`, migración 52). Quien tiene
-- taller asignado pide ahora poder subir también una evidencia de ese taller:
-- es un requisito aparte para la constancia de TALLER (`elegibilidadTaller`
-- en `elegibilidad.ts`), no para la del evento.
--
-- El taller puede caer justo el día que le toca asistir presencialmente al
-- evento —son dos ejes distintos—, así que la regla "evidencia solo de un día
-- que no es el tuyo" sigue aplicando a la evidencia de EVENTO, y no a la de
-- taller: ahí la comprobación es que el día esté entre los de `taller_dias`
-- de su propio taller.
--
-- Es UNA sola evidencia por todo el taller, no una por día, aunque dure dos
-- (T03/T05/T06): se guarda contra el primer día del taller. El cliente nunca
-- itera sus otros días para esto.
-- =============================================================================

create type tipo_evidencia as enum ('evento', 'taller');

alter table evidencias
  add column tipo tipo_evidencia not null default 'evento';

comment on column evidencias.tipo is
  'evento: conferencia de un día que no le tocó presencial. taller: el taller en el que está inscrito.';

-- La unicidad era (participante_id, dia): sin el eje de tipo, un alumno cuyo
-- taller cae el mismo día que una de sus conferencias no podría tener las dos
-- filas a la vez. Se busca el nombre real en vez de asumir el que Postgres le
-- puso solo, para no fallar en silencio si alguna vez se renombró a mano.
do $$
declare
  v_nombre text;
begin
  select tc.constraint_name into v_nombre
    from information_schema.table_constraints tc
   where tc.table_name = 'evidencias'
     and tc.constraint_type = 'UNIQUE'
     and (
       select string_agg(kcu.column_name, ',' order by kcu.ordinal_position)
         from information_schema.key_column_usage kcu
        where kcu.constraint_name = tc.constraint_name
          and kcu.table_name = 'evidencias'
     ) = 'participante_id,dia';

  if v_nombre is not null then
    execute format('alter table evidencias drop constraint %I', v_nombre);
  end if;
end;
$$;

alter table evidencias
  add constraint evidencias_participante_id_dia_tipo_key
  unique (participante_id, dia, tipo);

-- ---------------------------------------------------------------------------
-- Paso 1: pedir sitio donde subir, ahora con tipo
--
-- El cuerpo sigue siendo el de la migración 58 (`solo_los_alumnos_entregan_
-- evidencia`); lo nuevo es el parámetro y el `if/else` que separa las dos
-- reglas de día según el tipo.
-- ---------------------------------------------------------------------------
create or replace function fn_evidencia_preparar(
  p_folio text,
  p_credencial text,
  p_dia smallint,
  p_tipo tipo_evidencia default 'evento'
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_perfil perfil_participante;
  v_su_dia smallint;
  v_taller_id uuid;
  v_intentos smallint;
  v_estado estado_evidencia;
  v_ruta text;
begin
  perform privado.limitar('evidencia', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  select perfil, dia, taller_id into v_perfil, v_su_dia, v_taller_id
    from participantes where id = v_id;

  -- Solo los alumnos entregan evidencia, de evento o de taller. Ver la 58.
  if v_perfil <> 'alumno' then
    raise exception 'Las evidencias son solo para alumnos: tu perfil no necesita entregar ninguna'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if p_tipo = 'taller' then
    if v_taller_id is null then
      raise exception 'No tienes taller asignado: no hay evidencia de taller que entregar'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from taller_dias where taller_id = v_taller_id and dia = p_dia) then
      raise exception 'El día % no corresponde a tu taller', p_dia
        using errcode = 'check_violation';
    end if;
  else
    -- La evidencia de EVENTO es de los días que NO le tocó asistir.
    if p_dia = v_su_dia then
      raise exception 'El día % es el que te toca asistir en persona: su evidencia no se entrega', p_dia
        using errcode = 'check_violation';
    end if;
  end if;

  select intentos, estado into v_intentos, v_estado
    from evidencias
   where participante_id = v_id and dia = p_dia and tipo = p_tipo;

  if v_estado = 'aprobada' then
    raise exception 'Tu evidencia del día % ya está aprobada', p_dia
      using errcode = 'check_violation';
  end if;

  if coalesce(v_intentos, 0) >= 3 then
    raise exception 'Ya usaste tus 3 intentos del día %. Escríbenos y lo revisamos', p_dia
      using errcode = 'check_violation';
  end if;

  -- El tipo entra en la ruta para que una evidencia de evento y una de taller
  -- del mismo día nunca puedan apuntar al mismo objeto en el bucket.
  v_ruta := format('%s/%s-dia-%s-%s', v_id, p_tipo, p_dia, gen_random_uuid());

  insert into evidencias (participante_id, dia, tipo, archivo_url, estado)
  values (v_id, p_dia, p_tipo, v_ruta, 'no_entregada')
  on conflict (participante_id, dia, tipo) do update
    set archivo_url = excluded.archivo_url,
        estado = 'no_entregada',
        hash_archivo = null,
        subida_en = null;

  return v_ruta;
end;
$$;

-- La firma vieja de 3 argumentos no la deja viva `create or replace` —cambiar
-- la firma crea una función nueva—, así que se tira a mano para que nadie la
-- siga llamando sin el tipo.
drop function if exists fn_evidencia_preparar(text, text, smallint);

revoke all on function fn_evidencia_preparar(text, text, smallint, tipo_evidencia)
  from public, anon, authenticated;
grant execute on function fn_evidencia_preparar(text, text, smallint, tipo_evidencia)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paso 3: confirmar que el archivo está arriba, ahora con tipo
-- ---------------------------------------------------------------------------
create or replace function fn_evidencia_confirmar(
  p_folio text,
  p_credencial text,
  p_dia smallint,
  p_ruta text,
  p_hash text,
  p_tipo tipo_evidencia default 'evento'
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prometida text;
begin
  perform privado.limitar('evidencia', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  if p_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'La huella del archivo no tiene la forma esperada'
      using errcode = 'check_violation';
  end if;

  select archivo_url into v_prometida
    from evidencias
   where participante_id = v_id and dia = p_dia and tipo = p_tipo;

  if v_prometida is null or v_prometida is distinct from p_ruta then
    raise exception 'Esa ruta no corresponde a tu entrega. Vuelve a empezar la subida'
      using errcode = 'check_violation';
  end if;

  update evidencias
     set hash_archivo = p_hash,
         subida_en = now(),
         estado = 'pendiente',
         intentos = intentos + 1
   where participante_id = v_id and dia = p_dia and tipo = p_tipo;
end;
$$;

drop function if exists fn_evidencia_confirmar(text, text, smallint, text, text);

revoke all on function fn_evidencia_confirmar(text, text, smallint, text, text, tipo_evidencia)
  from public, anon, authenticated;
grant execute on function fn_evidencia_confirmar(text, text, smallint, text, text, tipo_evidencia)
  to anon, authenticated;

comment on function fn_evidencia_preparar is
  'Paso 1 de la entrega: valida credencial, perfil, día/taller y tope, y devuelve la ruta a la que subir.';
comment on function fn_evidencia_confirmar is
  'Paso 3 de la entrega: valida que la ruta sea la emitida y pasa la evidencia a pendiente.';

-- ---------------------------------------------------------------------------
-- fn_portal_estado: el alumno necesita ver también el tipo de cada evidencia
--
-- Sin esto, el portal no podría distinguir «ya tengo mi evidencia de taller»
-- de «ya tengo la de ese mismo día de conferencia»: hasta ahora `dia` bastaba
-- porque solo había un tipo.
-- ---------------------------------------------------------------------------
create or replace function fn_portal_estado(p_folio text, p_credencial text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_resultado jsonb;
begin
  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos'
      using errcode = 'invalid_password';
  end if;

  select jsonb_build_object(
    'participante', to_jsonb(vp) - 'correo' - 'celular',
    'contacto', jsonb_build_object('correo', vp.correo, 'celular', vp.celular),
    'elegibilidad', to_jsonb(ve),
    'asistencias', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'dia', a.dia, 'tipo', a.tipo, 'hora', a.registrada_en)
              order by a.registrada_en)
         from asistencias a
        where a.participante_id = v_id and a.anulada_en is null), '[]'::jsonb),
    'evidencias', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'dia', e.dia, 'tipo', e.tipo, 'estado', e.estado, 'subida_en', e.subida_en,
                'motivo_rechazo', (
                  select r.motivo_rechazo from revisiones r
                   where r.evidencia_id = e.id
                   order by r.revisado_en desc limit 1))
              order by e.dia)
         from evidencias e
        where e.participante_id = v_id), '[]'::jsonb),
    'avisos', coalesce(
      (select jsonb_agg(jsonb_build_object('id', av.id, 'texto', av.texto)
              order by av.creado_en)
         from avisos_participante av
        where av.participante_id = v_id and av.visto_en is null), '[]'::jsonb)
  )
  into v_resultado
  from v_participantes vp
  join v_elegibles ve on ve.participante_id = vp.id
  where vp.id = v_id;

  return v_resultado;
end;
$$;
