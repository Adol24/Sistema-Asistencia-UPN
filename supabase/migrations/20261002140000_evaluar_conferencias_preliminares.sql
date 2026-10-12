-- =============================================================================
-- 1400 · Evaluar las conferencias preliminares
--
-- El XIV Encuentro tiene tres conferencias preliminares, virtuales, cada una
-- con su propio ponente y horario. Hasta hoy `/encuesta` era una vista de
-- demostración que no guardaba nada; ahora la coordinación necesita saber
-- cuántas respuestas tiene CADA conferencia, así que la respuesta se guarda y
-- va etiquetada con cuál de las tres evalúa.
--
-- Es independiente del pre-registro a propósito: quien contesta no tiene que
-- existir en `participantes` ni en el padrón —cualquiera que haya visto la
-- transmisión puede evaluar—, así que es una tabla propia y no una columna más
-- en una tabla que sí exige ese cruce.
-- =============================================================================

create table encuesta_respuestas (
  id uuid primary key default gen_random_uuid(),

  -- Las tres conferencias, fijas para este programa. El mismo slug vive en
  -- `src/lib/conferencias.ts`; si un día se agrega o cambia una conferencia,
  -- los dos lados se editan juntos.
  conferencia text not null check (
    conferencia in ('arlety-pacheco', 'juan-hernandez', 'fidel-gonzales')
  ),

  perfil text not null check (perfil in ('alumno', 'docente', 'externo')),
  nombre text not null check (length(trim(nombre)) > 0),

  -- Del alumno. Mismo formato que el resto del sistema —ver `esMatricula` en
  -- `src/lib/campos.ts`— pero sin cruzarla contra el padrón: no todos los
  -- alumnos que ven la conferencia están cargados ahí.
  matricula text check (matricula is null or matricula ~ '^[0-9]{8,11}$'),
  programa text,

  -- Del docente y del externo. Mismo patrón que `participantes.correo`.
  correo text check (correo is null or correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- Las diez respuestas visibles del instrumento, por número de pregunta.
  -- No se fija la cantidad de llaves a propósito: `PREGUNTAS_VISIBLES` ya
  -- cambió una vez —de doce a diez— y repetir el conteo aquí sería un cuarto
  -- sitio que mantener sincronizado además de los tres que ya existen en el
  -- cliente.
  respuestas jsonb not null check (jsonb_typeof(respuestas) = 'object' and respuestas <> '{}'::jsonb),

  creado_en timestamptz not null default now(),

  -- El alumno trae matrícula y programa; docente y externo traen correo. Se
  -- repite aquí, como `chk_entregada_con_archivo` en evidencias, porque un
  -- insert directo contra esta tabla —sin pasar por `fn_evaluar_conferencia`—
  -- no tiene otro sitio donde pararse.
  constraint chk_encuesta_alumno_completo check (
    perfil <> 'alumno' or (matricula is not null and programa is not null)
  ),
  constraint chk_encuesta_no_alumno_completo check (
    perfil = 'alumno' or correo is not null
  )
);

-- Para el reporte de la coordinación: cuántas respuestas tiene cada conferencia.
create index on encuesta_respuestas (conferencia);

comment on table encuesta_respuestas is
  'Evaluaciones de las conferencias preliminares. Anónimas: no cruzan contra participantes ni padrón.';

-- ---------------------------------------------------------------------------
-- Como el resto del público, sin sesión de `auth`: la única puerta es la
-- función `security definer` de abajo. RLS sin ninguna política bloquea el
-- acceso directo a la tabla para `anon` y `authenticated` por igual.
-- ---------------------------------------------------------------------------
alter table encuesta_respuestas enable row level security;

create or replace function fn_evaluar_conferencia(
  p_conferencia text,
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
  insert into encuesta_respuestas (conferencia, perfil, nombre, matricula, correo, programa, respuestas)
  values (
    trim(p_conferencia),
    trim(p_perfil),
    trim(p_nombre),
    nullif(trim(coalesce(p_matricula, '')), ''),
    nullif(lower(trim(coalesce(p_correo, ''))), ''),
    nullif(trim(coalesce(p_programa, '')), ''),
    p_respuestas
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

comment on function fn_evaluar_conferencia is
  'Evalúa una conferencia preliminar. Anónima: no cruza contra el padrón, solo guarda lo declarado.';

-- Las funciones nuevas no nacen ejecutables por PUBLIC desde la migración
-- `20260908160000_revocar_ejecucion_publica.sql`: hay que conceder el permiso
-- a mano, igual que las demás puertas del público.
grant execute on function fn_evaluar_conferencia to anon, authenticated;
