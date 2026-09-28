-- =============================================================================
-- La matrícula va de ocho a once dígitos
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260927120000_la_matricula_va_de_ocho_a_once_digitos`.
--
-- Qué cambia
-- ----------
-- Dos sitios, que son los dos que la base tiene:
--
--   1. `padron_alumnos_matricula_check` pasa de «ocho u once exactos» al rango
--      de ocho a once, así que nueve y diez dígitos entran.
--   2. `fn_padron_alta_asistida` —el alta en mesa— deja de rechazarlos, y su
--      mensaje deja de prometer dos largos.
--
-- Por qué
-- -------
-- `20260921220000` abrió la regla de once a «ocho u once» y dedicó una sección
-- entera a argumentar por qué NO debía ser un rango: que nueve y diez «no son
-- matrículas de nadie», y que admitirlas dejaría entrar los errores de captura
-- de un dígito.
--
-- La primera mitad de ese argumento era falsa. Hay matrículas vigentes de nueve
-- y de diez dígitos en el padrón de la unidad, y la regla las estaba rechazando.
--
-- Y el efecto de rechazarlas es el mismo que aquella migración describió para
-- las de ocho, palabra por palabra: esta columna es la llave primaria del padrón
-- y de ella cuelga `participantes.matricula`, así que la regla no rechazaba un
-- formato, rechazaba a la persona. Sin fila en el padrón no hay pre-registro, ni
-- pago, ni constancia. El alumno existe en la universidad y no existe aquí.
--
-- La segunda mitad del argumento sigue siendo cierta, y se acepta el costo
-- -----------------------------------------------------------------------
-- Es verdad que un rango deja de detectar el error de captura: un dígito de más
-- al teclear una de ocho ahora entra como una matrícula de nueve, en vez de
-- rebotar. Se asume a sabiendas, porque los dos platillos no pesan igual.
--
-- Dejar fuera a un alumno que existe es un daño que él no puede reparar desde
-- ninguna pantalla: no se puede pre-registrar y nadie se entera hasta que
-- reclama. Un dígito mal tecleado es un dato que la mesa corrige con el
-- documento del alumno delante, y que queda marcado —`autodeclarado`— para
-- contrastarlo cuando llegue el padrón real.
--
-- Quien captura no queda sin red: la forma sigue siendo solo dígitos y el largo
-- sigue teniendo tope, así que una letra o doce cifras siguen rebotando.
--
-- Relajar no rompe nada
-- ---------------------
-- Toda matrícula ya cargada cumple la regla vieja, y la vieja está contenida en
-- la nueva, así que ninguna fila existente queda en falta. La restricción se
-- valida contra lo que ya hay en la tabla y por eso no necesita respaldo ni
-- ventana.
--
-- El nombre `padron_alumnos_matricula_check` es el que PostgreSQL le puso al
-- declararla en la columna, y `20260921220000` lo conservó al reemplazarla. Se
-- borra sin `if exists` a propósito: si el nombre no fuera ese, esta migración
-- debe fallar en voz alta y no dejar la regla vieja en pie junto a la nueva.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La regla de la tabla
-- ---------------------------------------------------------------------------
alter table padron_alumnos
  drop constraint padron_alumnos_matricula_check,
  add constraint padron_alumnos_matricula_check
    check (matricula ~ '^[0-9]{8,11}$');

comment on column padron_alumnos.matricula is
  'Matrícula de la universidad: de ocho a once dígitos, sin letras. Los cuatro largos son reales — once es la numeración actual, ocho la anterior, y en el padrón de la unidad hay vigentes de nueve y de diez.';

-- ---------------------------------------------------------------------------
-- 2 · El alta en mesa
--
-- Se rehace entera porque en PL/pgSQL no hay forma de cambiar una línea: la
-- función se reemplaza o no se toca. El cuerpo es el de
-- `20260923200000_dar_de_alta_a_un_alumno_en_mesa` con una sola diferencia, el
-- largo que exige, y sus comentarios se conservan por eso mismo.
-- ---------------------------------------------------------------------------
create or replace function fn_padron_alta_asistida(
  p_matricula text,
  p_nombre text,
  p_programa uuid,
  p_plantel uuid,
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
   *
   * Va en la base y no solo en el formulario porque esta función es también la
   * que reusaría una vía pública, y dos normalizaciones distintas para el mismo
   * dato es como se acaba con dos ortografías del mismo alumno.
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
    /*
     * La marca va CONCATENADA al nombre, no como un tercer argumento.
     *
     * Aquí ponía `a nombre de %%` con tres argumentos, y no compilaba: en
     * `raise`, `%%` es un porcentaje LITERAL, no dos marcadores. Así que el
     * formato declaraba dos y recibía tres —«too many parameters specified for
     * RAISE»— y la función entera se quedaba sin crear.
     *
     * Y no se arregla escribiendo `% %`: eso mete un espacio que sobra cuando
     * la marca está vacía, y queda un « .» al final. Concatenar deja UN
     * marcador para un dato que de todas formas se lee como una sola cosa:
     * «JUAN PÉREZ (declarada en mesa)».
     */
    raise exception
      'La matrícula % ya está en el padrón, a nombre de %. Corrígela ahí si los '
      'datos no cuadran.',
      v_matricula,
      v_ya.nombre ||
        case when v_ya.autodeclarado then ' (declarada en mesa)' else '' end
      using errcode = 'unique_violation';
  end if;

  /*
   * El programa tiene que ser de licenciatura, y esta puerta es solo para nuevo
   * ingreso.
   *
   * El nivel NO se recibe: se deriva del programa por la llave compuesta
   * `(programa_id, nivel_id)`. Pedirlo aparte permitiría mandar una combinación
   * que la llave rechazaría después, con un error sobre una restricción.
   */
  select p.nombre, n.id, n.nivel
    into v_programa, v_nivel_id, v_nivel
    from programas p
    join niveles_academicos n on n.id = p.nivel_id
   where p.id = p_programa;

  if v_programa is null then
    raise exception 'Esa licenciatura no está en el catálogo' using errcode = 'no_data_found';
  end if;
  if v_nivel <> 'Licenciatura' then
    raise exception
      'Esta alta es para alumnos de licenciatura de nuevo ingreso, y «%» es de %',
      v_programa, v_nivel
      using errcode = 'check_violation';
  end if;

  select pl.nombre into v_plantel from planteles pl where pl.id = p_plantel;
  if v_plantel is null then
    raise exception 'Esa sede no está en el catálogo' using errcode = 'no_data_found';
  end if;

  /*
   * `avance` va fijo en 1, y no se recibe.
   *
   * Es el único dato que se sabe con certeza de esta población: son de nuevo
   * ingreso. Preguntarlo abriría la puerta a equivocarse en lo único seguro. Y
   * de paso evita el nombre equivocado: la licenciatura modular se cuenta por
   * MÓDULOS, así que a quien la estudia no se le puede preguntar por su
   * «semestre» —el número es el mismo y la etiqueta la resuelve
   * `etiqueta_avance`—.
   *
   * `dia` se queda en NULL a propósito: el reparto lo hace la organización, y
   * `fn_dia_de` se lo asigna al pre-registrarse. Ponerle un día aquí sería
   * decidir por ella desde una mesa.
   */
  insert into padron_alumnos (
    matricula, nombre, nivel_id, programa_id, avance, grupo, plantel_id,
    dia, autodeclarado, importado_por
  )
  values (
    v_matricula, v_nombre, v_nivel_id, p_programa, 1,
    nullif(trim(coalesce(p_grupo, '')), ''), p_plantel,
    null, true, auth.uid()
  );

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    'Dio de alta a un alumno en mesa',
    format('%s · %s · %s · %s · declarado en mesa',
           v_matricula, v_nombre, v_programa, v_plantel)
  );

  return jsonb_build_object(
    'matricula', v_matricula,
    'nombre', v_nombre,
    'nivel', v_nivel,
    'programa', v_programa,
    'plantel', v_plantel,
    'avance', 1,
    'autodeclarado', true
  );
end;
$fn$;

-- `create or replace` conserva los permisos de la función anterior, pero se
-- repiten por si esta migración corre en una base donde la función nace aquí:
-- desde `20260908160000` las funciones nuevas no nacen ejecutables.
revoke all on function fn_padron_alta_asistida(text, text, uuid, uuid, text)
  from public, anon;
grant execute on function fn_padron_alta_asistida(text, text, uuid, uuid, text)
  to authenticated;

comment on function fn_padron_alta_asistida is
  'Crea la fila del padrón de un alumno de nuevo ingreso con lo que declara en '
  'la mesa de registro. Marca `autodeclarado` para poder contrastarla cuando '
  'llegue el padrón real. `avance` va fijo en 1 y el nivel se deriva del '
  'programa: ninguno de los dos se recibe.';

-- ---------------------------------------------------------------------------
-- 3 · Qué quedó puesto
--
-- Comprueba su propio efecto en vez de anunciarlo: lee la regla y el cuerpo que
-- quedaron vivos, y se detiene si alguno sigue exigiendo los largos viejos.
-- ---------------------------------------------------------------------------
do $$
declare
  v_regla text;
  v_cuerpo text;
  v_intermedias integer;
begin
  select pg_get_constraintdef(c.oid) into v_regla
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'padron_alumnos'
     and c.conname = 'padron_alumnos_matricula_check';

  if v_regla is null then
    raise exception 'La restricción `padron_alumnos_matricula_check` no quedó puesta.';
  end if;
  if v_regla not like '%{8,11}%' then
    raise exception 'La regla del padrón no quedó en el rango. Dice: %', v_regla;
  end if;

  select pg_get_functiondef(p.oid) into v_cuerpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_padron_alta_asistida';

  if v_cuerpo is null then
    raise exception 'El alta en mesa no quedó puesta.';
  end if;
  if v_cuerpo not like '%{8,11}%' then
    raise exception 'El alta en mesa sigue exigiendo los largos viejos.';
  end if;

  -- Cuántas hay hoy con los largos que hasta ahora no podían entrar. Lo normal
  -- es CERO, y ese cero no es un fallo: es la prueba de que la regla vieja las
  -- estaba dejando fuera. Las que existan aparecerán al importar el padrón o al
  -- darlas de alta en mesa, ya sin rebotar.
  select count(*) into v_intermedias
    from padron_alumnos
   where length(matricula) in (9, 10);

  raise notice 'La matrícula ya va de ocho a once dígitos.';
  raise notice '  Regla viva del padrón: %', v_regla;
  raise notice '  Matrículas de nueve o diez dígitos en el padrón: %', v_intermedias;
  raise notice '';
  raise notice 'Para ver cómo quedó repartido el padrón por largo:';
  raise notice '  select length(matricula) as digitos, count(*) from padron_alumnos group by 1 order by 1;';
end;
$$;
