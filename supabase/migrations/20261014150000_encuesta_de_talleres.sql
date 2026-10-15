-- =============================================================================
-- 1500 · Encuesta de talleres
--
-- Mismo patrón que `encuesta_respuestas` —ver `20261002140000` y las dos
-- migraciones que la siguieron—, pero para los talleres en vez de las tres
-- conferencias preliminares. La diferencia de fondo es que un taller no es un
-- slug fijo en código: ya existe en `talleres`, con su propio ciclo de alta,
-- renombrado y baja desde `/admin/talleres`. Por eso aquí no hay una columna
-- `check (taller in (...))` como la de `conferencia`: se guarda el uuid real,
-- con una llave foránea, y el nombre se resuelve al leer por un `join` contra
-- `talleres`. Si la organización renombra un taller después de recibir
-- evaluaciones, el panel sigue mostrando el nombre vigente.
--
-- Es independiente del pre-registro, igual que la de conferencias: quien
-- contesta no tiene que haber quedado inscrito en ESE taller —ni en ninguno—,
-- así que no hay cruce contra `participantes`.
-- =============================================================================

create table encuesta_talleres_respuestas (
  id uuid primary key default gen_random_uuid(),

  -- `restrict` y no `cascade`: un taller no se borra —se da de baja con
  -- `activo = false`—, así que esto nunca debería disparar en la práctica. Es
  -- la misma cautela de `taller_dias`.
  taller_id uuid not null references talleres (id) on delete restrict,

  perfil text not null check (perfil in ('alumno', 'docente', 'externo')),
  nombre text not null check (length(trim(nombre)) > 0),

  -- Del alumno. Mismo formato que el resto del sistema —ver `esMatricula` en
  -- `src/lib/campos.ts`— pero sin cruzarla contra el padrón.
  matricula text check (matricula is null or matricula ~ '^[0-9]{8,11}$'),
  programa text,

  -- Del docente y del externo. Mismo patrón que `participantes.correo`.
  correo text check (correo is null or correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- Las diez respuestas del instrumento de talleres, por número de pregunta.
  -- Ver `PREGUNTAS_TALLER` en `src/lib/encuesta-talleres.ts`.
  respuestas jsonb not null check (jsonb_typeof(respuestas) = 'object' and respuestas <> '{}'::jsonb),

  creado_en timestamptz not null default now(),

  -- El alumno trae matrícula y programa; docente y externo traen correo.
  -- Mismas dos restricciones que `encuesta_respuestas`.
  constraint chk_encuesta_taller_alumno_completo check (
    perfil <> 'alumno' or (matricula is not null and programa is not null)
  ),
  constraint chk_encuesta_taller_no_alumno_completo check (
    perfil = 'alumno' or correo is not null
  )
);

create index on encuesta_talleres_respuestas (taller_id);

-- Una sola evaluación por taller, por matrícula o por correo —mismo par de
-- índices parciales que `uq_encuesta_conferencia_matricula/correo`—.
create unique index uq_encuesta_taller_matricula
  on encuesta_talleres_respuestas (taller_id, matricula)
  where matricula is not null;

create unique index uq_encuesta_taller_correo
  on encuesta_talleres_respuestas (taller_id, correo)
  where correo is not null;

comment on table encuesta_talleres_respuestas is
  'Evaluaciones de los talleres del Encuentro. Anónimas: no cruzan contra participantes ni padrón.';

-- ---------------------------------------------------------------------------
-- Como `encuesta_respuestas`: RLS sin política bloquea el acceso directo para
-- `anon` y `authenticated`. La única puerta de escritura es la función
-- `security definer` de abajo; la de lectura es la política que sigue.
-- ---------------------------------------------------------------------------
alter table encuesta_talleres_respuestas enable row level security;

create policy encuesta_talleres_respuestas_lectura on encuesta_talleres_respuestas
  for select to authenticated using (tiene_rol(array['admin']::rol_interno[]));

grant select on encuesta_talleres_respuestas to authenticated;

create or replace function fn_evaluar_taller(
  p_taller uuid,
  p_perfil text,
  p_nombre text,
  p_respuestas jsonb,
  p_matricula text default null,
  p_correo text default null,
  p_programa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from talleres where id = p_taller) then
    raise exception 'Ese taller ya no está disponible.';
  end if;

  insert into encuesta_talleres_respuestas (taller_id, perfil, nombre, matricula, correo, programa, respuestas)
  values (
    p_taller,
    trim(p_perfil),
    trim(p_nombre),
    nullif(trim(coalesce(p_matricula, '')), ''),
    nullif(lower(trim(coalesce(p_correo, ''))), ''),
    nullif(trim(coalesce(p_programa, '')), ''),
    p_respuestas
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    raise exception 'Ya evaluaste este taller.';
end;
$$;

comment on function fn_evaluar_taller is
  'Evalúa un taller del Encuentro. Anónima: no cruza contra el padrón, solo guarda lo declarado. Una sola evaluación por taller, por matrícula o correo.';

-- Las funciones nuevas no nacen ejecutables por PUBLIC desde la migración
-- `20260908160000_revocar_ejecucion_publica.sql`.
grant execute on function fn_evaluar_taller to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eliminar una respuesta. Mismo patrón que `fn_eliminar_respuesta_encuesta`:
-- SOLO administración, y la bitácora se anota en la misma transacción. Aquí
-- el nombre del taller sale de `talleres` —vía `using`— porque esta tabla no
-- lo guarda como texto, solo el uuid.
-- ---------------------------------------------------------------------------
create or replace function fn_eliminar_respuesta_encuesta_taller(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_taller_clave text;
begin
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede eliminar una respuesta de la encuesta de talleres'
      using errcode = 'insufficient_privilege';
  end if;

  delete from encuesta_talleres_respuestas e
  using talleres t
  where e.id = p_id
    and e.taller_id = t.id
  returning e.nombre, t.clave into v_nombre, v_taller_clave;

  if v_nombre is null then
    raise exception 'No hay ninguna respuesta con ese identificador'
      using errcode = 'no_data_found';
  end if;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    'Eliminó una respuesta de la encuesta de talleres',
    format('%s · %s', v_nombre, v_taller_clave)
  );

  return jsonb_build_object('nombre', v_nombre, 'taller', v_taller_clave);
end;
$$;

comment on function fn_eliminar_respuesta_encuesta_taller is
  'Elimina una respuesta de la encuesta de talleres. SOLO administración. No se deshace.';

revoke all on function fn_eliminar_respuesta_encuesta_taller(uuid) from public, anon;
grant execute on function fn_eliminar_respuesta_encuesta_taller(uuid) to authenticated;
