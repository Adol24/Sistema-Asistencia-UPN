-- =============================================================================
-- 1300 · Una evaluación por conferencia
--
-- `encuesta_respuestas` nació sin ninguna restricción de unicidad: la única
-- barrera contra repetir una conferencia era el `Set` de React en
-- `src/routes/encuesta.tsx` —"evaluadas"—, que solo dura lo que dura la
-- visita. Recargar la página, cerrar el navegador o contestar desde otro
-- dispositivo deja la puerta abierta para evaluar la misma conferencia
-- cuantas veces se quiera.
--
-- La identidad de quien contesta es matrícula (alumno) o correo (docente y
-- externo) —nunca las dos, ver `chk_encuesta_alumno_completo`—, así que dos
-- índices únicos parciales bastan: uno por matrícula, otro por correo, cada
-- uno cruzado con la conferencia.
-- =============================================================================

create unique index uq_encuesta_conferencia_matricula
  on encuesta_respuestas (conferencia, matricula)
  where matricula is not null;

create unique index uq_encuesta_conferencia_correo
  on encuesta_respuestas (conferencia, correo)
  where correo is not null;

-- La función ya validaba todo lo demás; ahora además atrapa el choque de
-- unicidad y lo convierte en un mensaje que sí dice algo en pantalla. Sin
-- esto, `mensajeDeError` lo resolvía con el genérico "Ese registro ya
-- existe.", que no dice ni de cuál conferencia habla.
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
exception
  when unique_violation then
    raise exception 'Ya evaluaste esta conferencia.';
end;
$$;

comment on function fn_evaluar_conferencia is
  'Evalúa una conferencia preliminar. Anónima: no cruza contra el padrón, solo guarda lo declarado. Una sola evaluación por conferencia, por matrícula o correo.';
