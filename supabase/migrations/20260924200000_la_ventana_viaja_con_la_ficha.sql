-- =============================================================================
-- La ventana viaja con la ficha, y no en una segunda llamada
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924200000_la_ventana_viaja_con_la_ficha`.
--
-- Lo que costaba
-- --------------
-- `/confirmar-nombre` hacía dos viajes seguidos: `fn_padron_confirmar` para el
-- reto de identidad y, con su respuesta en la mano, `fn_ventana_de_matricula`
-- para saber si a esa cohorte ya le toca. Unos 160 ms de más, y en la única
-- pantalla donde el alumno está parado mirando la rueda de carga.
--
-- Las dos preguntan por la misma matrícula y las dos acaban en la misma fila
-- del padrón. La segunda no aporta un viaje: aporta un campo.
--
-- Por qué es SEGURO desplegarlo en cualquier orden
-- -------------------------------------------------
-- La clave `ventana` se AÑADE; no se quita ni se renombra nada. Un cliente
-- viejo la ignora y sigue llamando a `fn_ventana_de_matricula`, que se queda
-- donde está y no se toca.
--
-- Y al revés: el cliente nuevo distingue los tres casos.
--
--   la clave no viene   → esta migración no está aplicada, así que pregunta
--                         como siempre, en su segunda llamada
--   viene como null     → le toca; adelante
--   viene con texto     → no le toca todavía; esa frase es lo que se le enseña
--
-- Esa distinción entre «no viene» y «viene vacía» es la que permite subir el
-- código antes que el SQL sin que nadie se cuele por una ventana cerrada.
--
-- El tope por IP: uno menos, y era el que sobraba
-- ------------------------------------------------
-- `fn_ventana_de_matricula` gasta el tope `ventana_matricula` —30 cada diez
-- minutos—. Llamando por dentro a `fn_motivo_fuera_de_ventana`, que no tiene
-- tope propio, el alumno gasta UN cupo menos por intento. El que de verdad
-- aprieta sigue siendo `padron_confirmar`, que son 10 cada diez minutos y no se
-- toca aquí: es lo que impide recorrer el padrón.
--
-- El cuerpo se copió MECÁNICAMENTE de `20260922180000`, que es su última
-- definición. Lo único añadido son tres líneas dentro del `jsonb_build_object`:
-- retranscribir a mano setenta líneas para colar tres es como se perdió el
-- limitador de `fn_padron_confirmar` una vez.
-- =============================================================================

create or replace function fn_padron_confirmar(
  p_matricula text,
  p_nombres text,
  p_programa text
)
returns jsonb
language plpgsql
volatile
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
  perform privado.limitar('padron_confirmar', 10, interval '10 minutes');

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
           ),
           -- La clave nueva. `null` significa que puede pasar; con texto, es la
           -- frase ya redactada que hay que enseñarle. Ver la cabecera.
           'ventana', fn_motivo_fuera_de_ventana(a.programa_id, a.avance)
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

-- `create or replace function` conserva las concesiones, así que el anónimo la
-- sigue pudiendo llamar. Se reafirma igual: la puerta del pre-registro dejando
-- de responder al público sería el fallo más caro posible, y cuesta una línea
-- descartarlo.
revoke all on function fn_padron_confirmar(text, text, text) from public;
grant execute on function fn_padron_confirmar(text, text, text) to anon, authenticated;

comment on function fn_padron_confirmar is
  'El reto de identidad del pre-registro. Devuelve la ficha del padrón, si ya '
  'está registrado y —desde 20260924200000— la frase de su ventana: null si le '
  'toca. Matrícula inexistente y reto fallido devuelven lo mismo a propósito.';

-- ---------------------------------------------------------------------------
-- Que la clave llegue de verdad
-- ---------------------------------------------------------------------------
do $$
declare
  v_matricula text;
  v jsonb;
begin
  select a.matricula into v_matricula from padron_alumnos a limit 1;

  if v_matricula is null then
    raise notice 'El padrón está vacío: no se pudo probar la clave `ventana`.';
    raise notice 'Compruébalo tras importarlo, confirmando una matrícula real.';
    return;
  end if;

  -- Con un nombre que no es el suyo: devuelve null, que es lo correcto, y de
  -- paso demuestra que el reto sigue cerrado. No enseña ninguna ficha.
  v := fn_padron_confirmar(v_matricula, 'ESTO NO ES SU NOMBRE', 'NI ESTE SU PROGRAMA');
  if v is not null then
    raise exception
      'El reto de identidad aceptó un nombre que no es el de esa matrícula. '
      'El cuerpo se copió mal.';
  end if;

  raise notice 'La ficha ya puede traer su ventana. El reto sigue rechazando lo que no cuadra.';
  raise notice 'Para verla llena, confirma una matrícula con su nombre real desde la pantalla.';
end;
$$;
