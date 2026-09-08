-- Cierra la consulta del padrón para el público.
--
-- El problema
-- -----------
-- `fn_buscar_en_padron` es `security definer`, está concedida a `anon` y
-- devolvía nombre, nivel, programa, avance, grupo y plantel a cambio de una sola
-- matrícula. La clave publicable viaja en el paquete JavaScript —así tiene que
-- ser—, de modo que cualquiera podía llamarla directamente:
--
--   POST /rest/v1/rpc/fn_buscar_en_padron   {"p_matricula": "..."}
--
-- El comentario original decía que ninguna función permite recorrer el padrón
-- porque solo acepta matrícula exacta y devuelve una fila. Eso protege contra la
-- búsqueda por nombre, pero no contra la enumeración: las matrículas siguen un
-- patrón —año más consecutivo—, así que recorrerlas es un bucle. Una fila por
-- llamada no es una defensa cuando el espacio de claves es adivinable.
--
-- La interfaz ya pedía nombres de pila y programa antes de mostrar el nombre,
-- pero esa comprobación vivía en el navegador y la API seguía abierta al lado.
-- Una comprobación que el cliente puede saltarse no es una comprobación.
--
-- El arreglo
-- ----------
-- Se parte en dos, según lo que cada paso necesita saber de verdad:
--
--   fn_padron_existe(matricula)      -> ¿hay que seguir? Sin datos personales.
--   fn_padron_confirmar(m, n, prog)  -> el expediente, solo si el que pregunta
--                                       ya sabía quién es.
--
-- `fn_buscar_en_padron` se mantiene por compatibilidad pero se le retira el
-- permiso a `anon`: el personal autenticado la sigue necesitando.

-- `unaccent` compara nombres sin depender de los acentos. Va primero porque las
-- funciones de abajo la usan.
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- Paso 1: ¿existe? Responde sí o no, y si ya se registró. Nada más.
-- ---------------------------------------------------------------------------
create or replace function fn_padron_existe(p_matricula text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'existe', exists (
             select 1 from padron_alumnos a where a.matricula = trim(p_matricula)
           ),
           'ya_registrado', exists (
             select 1 from participantes p where p.matricula = trim(p_matricula)
           )
         );
$$;

comment on function fn_padron_existe is
  'Solo dice si la matrícula está en el padrón. Nunca datos personales: es lo '
  'único que el pre-registro necesita antes de comprobar la identidad.';

-- ---------------------------------------------------------------------------
-- Paso 2: el expediente, a cambio de demostrar que ya se sabe de quién es.
--
-- El reto no pretende ser un secreto fuerte. Su valor está en que hay que
-- APORTAR el dato para obtener la respuesta, así que deja de servir para
-- extraer lo que no se sabe. Se comparan los nombres de pila por prefijo de
-- palabras completas —el padrón guarda el nombre en una sola columna, sin
-- separar apellidos— y el programa exacto.
-- ---------------------------------------------------------------------------
create or replace function fn_padron_confirmar(
  p_matricula text,
  p_nombres text,
  p_programa text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_programa text;
  v_partes text[];
  v_reales text[];
  v jsonb;
begin
  select a.nombre, pr.nombre
    into v_nombre, v_programa
    from padron_alumnos a
    join programas pr on pr.id = a.programa_id
   where a.matricula = trim(p_matricula);

  -- Matrícula inexistente y reto fallido devuelven lo mismo a propósito: si se
  -- distinguieran, la diferencia ya sería un buscador de matrículas válidas.
  if v_nombre is null then
    return null;
  end if;

  v_partes := regexp_split_to_array(
    trim(regexp_replace(upper(unaccent(coalesce(p_nombres, ''))), '\s+', ' ', 'g')), ' '
  );
  v_reales := regexp_split_to_array(
    trim(regexp_replace(upper(unaccent(v_nombre)), '\s+', ' ', 'g')), ' '
  );

  if coalesce(array_length(v_partes, 1), 0) = 0
     or array_length(v_partes, 1) > array_length(v_reales, 1)
     or v_partes <> v_reales[1:array_length(v_partes, 1)]
     or upper(unaccent(trim(coalesce(p_programa, '')))) <> upper(unaccent(v_programa)) then
    return null;
  end if;

  select jsonb_build_object(
           'matricula', a.matricula,
           'nombre', a.nombre,
           'nivel', n.nivel,
           'programa', pr.nombre,
           'avance', a.avance,
           'etiqueta_avance', n.etiqueta_avance,
           'grupo', a.grupo,
           'plantel', pl.nombre,
           'ya_registrado', exists (
             select 1 from participantes p where p.matricula = a.matricula
           )
         )
    into v
    from padron_alumnos a
    join niveles_academicos n on n.id = a.nivel_id
    join programas pr on pr.id = a.programa_id
    join planteles pl on pl.id = a.plantel_id
   where a.matricula = trim(p_matricula);

  return v;
end;
$$;

comment on function fn_padron_confirmar is
  'Devuelve el expediente solo si quien pregunta ya sabe los nombres de pila y '
  'el programa. Un reto fallido y una matrícula inexistente responden igual.';

-- ---------------------------------------------------------------------------
-- Permisos: el público pierde el acceso directo al expediente.
-- ---------------------------------------------------------------------------
revoke execute on function fn_buscar_en_padron(text) from anon;

grant execute on function fn_padron_existe(text) to anon, authenticated;
grant execute on function fn_padron_confirmar(text, text, text) to anon, authenticated;
