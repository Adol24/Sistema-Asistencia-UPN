-- =============================================================================
-- El alta en mesa deja de ser solo licenciatura, semestre 1
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
--
-- Qué cambiaba hasta aquí
-- -----------------------
-- `fn_padron_alta_asistida` (20260923200000, ajustada en 20260927120000) nació
-- para UN cuello de botella concreto: alumnos de licenciatura de NUEVO INGRESO
-- sin padrón todavía, el 27 y el 28 de septiembre. Por eso rechazaba cualquier
-- nivel que no fuera «Licenciatura», y `avance` ni siquiera era un parámetro:
-- iba fijo en 1 dentro del `insert`, «el único dato seguro de esa población».
--
-- La pantalla de administración —`/admin/padron`, el botón «Dar de alta»— se
-- volvió el camino normal para capturar a CUALQUIER alumno que falte del
-- padrón, no solo a los de nuevo ingreso: de maestría, o de licenciatura en un
-- semestre o módulo que no es el primero. La base seguía rechazándolos con el
-- mensaje «Esta alta es para alumnos de licenciatura de nuevo ingreso», y el
-- formulario ni siquiera ofrecía las maestrías en la lista.
--
-- Qué cambia
-- ----------
-- `p_avance smallint` se vuelve un parámetro: ya no fijo, y SIN valor por
-- defecto, porque adivinarlo —¿1? ¿el tope de su nivel?— sería inventar un
-- dato académico sobre alguien que la organización no conoce todavía. Se
-- valida que no sea nulo ni menor que 1 aquí, con el mismo criterio que la
-- matrícula y el nombre: un mensaje que diga qué se esperaba, no el genérico
-- de un CHECK de columna.
--
-- La comprobación `v_nivel <> 'Licenciatura'` se quita entera. El programa
-- sigue viniendo del catálogo —`programas` join `niveles_academicos`—, así que
-- solo se puede elegir un nivel que la universidad de verdad imparte; lo que
-- se quita es la restricción ARTIFICIAL a uno solo de esos niveles.
--
-- Qué NO cambia
-- -------------
-- El tope de `avance` contra su nivel o programa lo sigue validando
-- `trg_padron_avance`/`fn_validar_avance` (migración 43, «el avance lo manda
-- el programa»), que ya corre en cualquier INSERT de `padron_alumnos` y ya
-- sabe que la licenciatura modular (LEIP) cuenta distinto. No hay que
-- repetir esa regla aquí: si `p_avance` se pasa de rango, el INSERT de abajo
-- rebota con el mensaje de ese disparador, no con uno de esta función.
--
-- `dia` se sigue dejando en NULL: el reparto lo hace la organización al
-- pre-registrarse (`fn_dia_de`), no esta mesa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Se rehace entera porque en PL/pgSQL no hay forma de cambiar una línea, y
-- cambia la firma: se añade `p_avance`. Eso no lo deja vivo un `create or
-- replace` sobre la firma vieja —cambiar los parámetros crea una función
-- NUEVA y deja la vieja de cinco argumentos colgada y viva—, así que la vieja
-- se tira a mano. Mismo criterio que `fn_evidencia_preparar` en
-- 20261019100000.
-- ---------------------------------------------------------------------------
drop function if exists fn_padron_alta_asistida(text, text, uuid, uuid, text);

create function fn_padron_alta_asistida(
  p_matricula text,
  p_nombre text,
  p_programa uuid,
  p_plantel uuid,
  p_avance smallint default null,
  p_grupo text default null
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $fn$
declare
  v_matricula text;
  v_nombre text;
  v_nivel_id uuid;
  v_nivel text;
  v_programa text;
  v_plantel text;
  v_ya record;
begin
  if not tiene_rol(array['admin', 'soporte']::rol_interno[]) then
    raise exception 'Solo administración y soporte pueden dar de alta a un alumno'
      using errcode = 'insufficient_privilege';
  end if;

  -- El mismo rango que el `check` de la tabla. Se comprueba aquí además de allí
  -- para que el mensaje diga qué se esperaba, y no «violates check constraint».
  v_matricula := trim(coalesce(p_matricula, ''));
  if v_matricula !~ '^[0-9]{8,11}$' then
    raise exception 'La matrícula lleva entre 8 y 11 dígitos, sin letras ni espacios'
      using errcode = 'check_violation';
  end if;

  /*
   * El nombre, normalizado aquí y no en la pantalla.
   *
   * En MAYÚSCULAS porque el CHECK de la tabla lo exige, y SIN ACENTOS porque es
   * como se imprime —ver `nombreConstancia`—. La Ñ se conserva: `unaccent` la
   * convertiría en N y «MUÑOZ» no es «MUNOZ». Por eso se traduce letra por
   * letra en vez de usar la extensión.
   */
  v_nombre := upper(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'));
  v_nombre := translate(
    v_nombre,
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  );

  if array_length(regexp_split_to_array(v_nombre, ' '), 1) < 2 then
    raise exception 'Falta el nombre completo: al menos nombre y un apellido'
      using errcode = 'check_violation';
  end if;

  -- Ya no va fijo en 1: se pide, y se comprueba aquí por la misma razón que la
  -- matrícula y el nombre. El tope por programa/nivel lo exige el disparador
  -- más abajo, en el INSERT; aquí solo se descarta lo que ningún programa
  -- aceptaría nunca.
  if p_avance is null or p_avance < 1 then
    raise exception 'Falta el semestre o módulo: debe ser 1 o más' using errcode = 'check_violation';
  end if;

  -- ¿Ya existe? Los dos casos se distinguen, porque llevan a cosas distintas:
  -- una fila del padrón se corrige, y un pre-registro hecho no se toca desde
  -- aquí.
  select a.matricula,
         a.nombre,
         a.autodeclarado,
         exists (select 1 from participantes p where p.matricula = a.matricula) as registrado
    into v_ya
    from padron_alumnos a
   where a.matricula = v_matricula;

  if v_ya.matricula is not null then
    if v_ya.registrado then
      raise exception
        'La matrícula % ya está registrada, a nombre de %. Búscala en el padrón '
        'en vez de darla de alta otra vez.', v_matricula, v_ya.nombre
        using errcode = 'unique_violation';
    end if;
    raise exception
      'La matrícula % ya está en el padrón, a nombre de %. Corrígela ahí si los '
      'datos no cuadran.',
      v_matricula,
      v_ya.nombre ||
        case when v_ya.autodeclarado then ' (declarada en mesa)' else '' end
      using errcode = 'unique_violation';
  end if;

  -- El nivel ya NO se restringe a «Licenciatura»: esta mesa sirve para dar de
  -- alta a cualquier alumno que falte del padrón, de cualquier nivel que el
  -- catálogo tenga dado de alta. Se sigue derivando del programa y no
  -- recibiéndose aparte, por la misma razón de siempre: pedirlo aparte
  -- permitiría una combinación que la llave compuesta rechazaría después, con
  -- un error sobre una restricción que no le dice nada a quien captura.
  select p.nombre, n.id, n.nivel
    into v_programa, v_nivel_id, v_nivel
    from programas p
    join niveles_academicos n on n.id = p.nivel_id
   where p.id = p_programa;

  if v_programa is null then
    raise exception 'Ese programa no está en el catálogo' using errcode = 'no_data_found';
  end if;

  select pl.nombre into v_plantel from planteles pl where pl.id = p_plantel;
  if v_plantel is null then
    raise exception 'Esa sede no está en el catálogo' using errcode = 'no_data_found';
  end if;

  -- `dia` se queda en NULL a propósito: el reparto lo hace la organización, y
  -- `fn_dia_de` se lo asigna al pre-registrarse. Ponerle un día aquí sería
  -- decidir por ella desde una mesa.
  --
  -- El tope de `p_avance` contra el programa o su nivel lo exige
  -- `trg_padron_avance` en este mismo INSERT (migración 43): si se pasa de
  -- rango, rebota con el mensaje de ese disparador.
  insert into padron_alumnos (
    matricula, nombre, nivel_id, programa_id, avance, grupo, plantel_id,
    dia, autodeclarado, importado_por
  )
  values (
    v_matricula, v_nombre, v_nivel_id, p_programa, p_avance,
    nullif(trim(coalesce(p_grupo, '')), ''), p_plantel,
    null, true, auth.uid()
  );

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    'Dio de alta a un alumno en mesa',
    format('%s · %s · %s (%s) · %s · declarado en mesa',
           v_matricula, v_nombre, v_programa, v_nivel, v_plantel)
  );

  return jsonb_build_object(
    'matricula', v_matricula,
    'nombre', v_nombre,
    'nivel', v_nivel,
    'programa', v_programa,
    'plantel', v_plantel,
    'avance', p_avance,
    'autodeclarado', true
  );
end;
$fn$;

-- Las funciones nuevas no nacen ejecutables desde `20260908160000`, y al ser
-- firma nueva esto SÍ es una función nueva para Postgres.
revoke all on function fn_padron_alta_asistida(text, text, uuid, uuid, smallint, text)
  from public, anon;
grant execute on function fn_padron_alta_asistida(text, text, uuid, uuid, smallint, text)
  to authenticated;

comment on function fn_padron_alta_asistida is
  'Crea la fila del padrón de un alumno que falta, con lo que declara en la '
  'mesa de registro. Marca `autodeclarado` para poder contrastarla cuando '
  'llegue el padrón real. Ya no es solo para licenciatura de nuevo ingreso: '
  '`p_avance` se recibe y se valida contra el tope de su programa/nivel '
  '(`trg_padron_avance`); el nivel se deriva del programa y no se recibe.';

-- ---------------------------------------------------------------------------
-- Qué quedó puesto
-- ---------------------------------------------------------------------------
do $$
declare
  v_cuerpo text;
begin
  select pg_get_functiondef(p.oid) into v_cuerpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_padron_alta_asistida'
     and pg_get_function_identity_arguments(p.oid) = 'text, text, uuid, uuid, smallint, text';

  if v_cuerpo is null then
    raise exception 'fn_padron_alta_asistida(text,text,uuid,uuid,smallint,text) no quedó puesta.';
  end if;
  if v_cuerpo like '%nuevo ingreso%' or v_cuerpo like '%v_nivel <> ''Licenciatura''%' then
    raise exception 'El alta en mesa sigue rechazando niveles distintos de Licenciatura.';
  end if;
  if v_cuerpo not like '%p_avance%' then
    raise exception 'El alta en mesa no quedó recibiendo p_avance.';
  end if;

  if exists (
    select 1 from pg_proc p
     where p.proname = 'fn_padron_alta_asistida'
       and pg_get_function_identity_arguments(p.oid) = 'text, text, uuid, uuid, text'
  ) then
    raise exception 'La firma vieja de cinco argumentos sigue viva junto a la nueva.';
  end if;

  raise notice 'El alta en mesa acepta cualquier nivel del catálogo y pide el avance.';
end;
$$;
