-- =============================================================================
-- El alumno no podía elegir taller
--
-- Qué pasaba
-- ----------
-- El catálogo le enseñaba todos los talleres activos, pero su día lo decidía la
-- base al insertar, dentro de `fn_preregistrar_alumno`. Si el taller que había
-- elegido no se impartía ese día, la inserción chocaba con la llave foránea
-- compuesta `(taller_id, dia) -> taller_dias` y el pre-registro moría con un
-- mensaje de PostgreSQL sobre una restricción, ya al final del recorrido y con
-- la persona decidida.
--
-- La causa de fondo es que la pantalla nunca supo el día. `fn_padron_confirmar`
-- —lo único que el pre-registro consulta del padrón— devolvía nivel, programa,
-- avance, grupo y plantel, pero no el día. Sin ese dato no hay forma de acotar
-- el catálogo, así que se ofrecía lo que la base iba a rechazar.
--
-- Se arregla por los dos lados
-- ----------------------------
-- 1. La consulta devuelve el día, para que el catálogo se acote antes de
--    elegir. Sigue siendo `stable`: solo lee.
-- 2. El alta deja de poder contradecirse. Si el alumno ya tenía día asignado,
--    manda ese y el taller se valida contra él con un mensaje que se entiende.
--    Si no tenía, el día se elige ENTRE LOS DÍAS DE SU TALLER, y el más vacío
--    de ellos: a quien no le habían repartido día, colocarlo donde está el
--    taller que quiere no le quita nada a nadie y evita el callejón sin salida.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. El expediente incluye el día
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
set search_path = public, extensions
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
           -- El día que le repartió Servicios Escolares. Puede ser NULL si
           -- todavía no se ha repartido, y la pantalla lo distingue: con día
           -- acota el catálogo de talleres, sin día lo enseña entero y avisa.
           'dia', a.dia,
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

-- ---------------------------------------------------------------------------
-- 2. El alta no puede contradecirse con el taller elegido
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
begin
  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en el padrón' using errcode = 'no_data_found';
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
    -- Ya tenía día: manda el suyo, y el taller se comprueba contra él. Antes
    -- esto lo detenía la llave foránea, con un mensaje sobre una restricción
    -- que no le dice nada a quien está eligiendo un taller.
    v_dia := v_a.dia;
    if p_taller is not null
       and not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_dia) then
      raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_dia
        using errcode = 'check_violation';
    end if;
  elsif p_taller is not null then
    -- Sin día repartido y con taller elegido: se le da el día MÁS VACÍO DE ESE
    -- TALLER. A quien no le habían asignado día, colocarlo donde se imparte lo
    -- que quiere tomar no le quita el lugar a nadie, y es la única salida que
    -- no lo deja en un callejón sin salida.
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
    -- Sin día y sin taller: el reparto normal, el día que va más vacío.
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

-- Desde `20260908160000` las funciones no nacen ejecutables por PUBLIC, y hay
-- que reafirmar los permisos por si la recreación los perdió.
revoke all on function fn_padron_confirmar(text, text, text) from public;
grant execute on function fn_padron_confirmar(text, text, text) to anon, authenticated;
revoke all on function fn_preregistrar_alumno(text, text, text, uuid) from public;
grant execute on function fn_preregistrar_alumno(text, text, text, uuid) to anon, authenticated;

comment on function fn_preregistrar_alumno is
  'Alta del alumno. Con día repartido, el taller se valida contra ese día con '
  'un mensaje legible. Sin día repartido y con taller, se le asigna el día más '
  'vacío de ese taller: la llave foránea (taller_id, dia) hacía imposible el '
  'alta y el error hablaba de restricciones, no de talleres.';
