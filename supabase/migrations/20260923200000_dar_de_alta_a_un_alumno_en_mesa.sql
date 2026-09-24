-- =============================================================================
-- 64 · Dar de alta a un alumno en mesa
--
-- El ordinal de esta cabecera NO la identifica. Esta migración es
-- `20260923200000_dar_de_alta_a_un_alumno_en_mesa`.
--
-- El problema
-- -----------
-- Los alumnos de nuevo ingreso se pre-registran el 27 y el 28 de septiembre, y
-- la unidad todavía no tiene su padrón. Sin fila en `padron_alumnos` no hay alta
-- posible: `participantes.matricula` apunta ahí con una llave foránea, y
-- `chk_alumno_completo` exige nivel, programa, avance y plantel. Esa cadena es
-- deliberada —un alumno inventado que viaja hasta los reportes es peor que un
-- alumno que no se pudo registrar— y no se toca.
--
-- Lo que hace falta es una puerta para que alguien CON SESIÓN cree esa fila con
-- lo que el alumno declara delante, en la mesa de registro.
--
-- Por qué en mesa y no un formulario público
-- ------------------------------------------
-- La alternativa era abrirle el formulario al propio alumno. Tiene un techo que
-- ninguna implementación arregla: **no se puede autenticar a alguien de quien el
-- sistema no tiene ningún dato previo.** Cualquiera puede teclear un número de
-- ocho u once dígitos, y si acierta con la matrícula real de un alumno de
-- primero, ese alumno queda fuera y nada en la base puede distinguir quién es
-- quién.
--
-- En mesa ese techo no desaparece, pero cambia de manos: lo que se declara lo
-- teclea alguien con nombre, queda en la bitácora, y no se puede intentar desde
-- fuera. Además no hace falta ventana pública, ni límite por IP, ni el teatro de
-- confirmar una identidad que nadie puede verificar.
--
-- Si más adelante se decide abrir la vía pública, se reusa esta misma función
-- añadiéndole la comprobación de ventana y el limitador por IP. No es trabajo
-- tirado.
--
-- La marca, que es la mitad del valor
-- -----------------------------------
-- `autodeclarado` distingue estas filas de las que entregó Servicios Escolares.
-- Sin ella, cuando llegue el padrón de verdad nadie podría saber qué revisar:
-- una fila declarada en mesa y una importada se verían iguales, y el nombre o la
-- licenciatura podrían no coincidir sin que nada lo señale.
--
-- Lo que NO hace esta migración
-- -----------------------------
-- No reconcilia nada. Cuando llegue la lista real, `guardarPadronRemoto` va a
-- encontrarse estas matrículas ya ocupadas; qué hacer con las que no coincidan
-- —confirmar, corregir o dar de baja— es una decisión de Servicios Escolares, y
-- lo único que esta migración garantiza es que se puedan encontrar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La marca
-- ---------------------------------------------------------------------------
alter table padron_alumnos
  add column if not exists autodeclarado boolean not null default false;

comment on column padron_alumnos.autodeclarado is
  'La fila la declaró la persona en la mesa de registro, no la entregó Servicios '
  'Escolares. Hay que contrastarla cuando llegue el padrón real. Ver la '
  'migración 20260923200000.';

-- Se indexa parcial: lo que se consulta es «enséñame las que hay que revisar»,
-- que son pocas entre miles. Un índice sobre toda la columna gastaría espacio
-- para responder a una pregunta que nadie hace («las que NO son declaradas»).
create index if not exists ix_padron_autodeclarado
  on padron_alumnos (matricula) where autodeclarado;

-- ---------------------------------------------------------------------------
-- 2 · El alta
--
-- SIN `security definer`, y es deliberado: la política `padron_escritura` ya
-- dice quién puede escribir aquí —`admin` y `soporte`— y corriendo con los
-- permisos de quien llama, esa política ES la comprobación. Con `security
-- definer` correría como el dueño de la tabla, que no está sujeto a ninguna, y
-- cualquier usuario autenticado podría inventar alumnos.
--
-- El `tiene_rol` de arriba no es la puerta, es el MENSAJE: sin él, un capturista
-- recibiría el «new row violates row-level security policy» de la política, que
-- es cierto y no le dice a nadie qué hacer.
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

  v_matricula := trim(coalesce(p_matricula, ''));
  if v_matricula !~ '^([0-9]{8}|[0-9]{11})$' then
    raise exception 'La matrícula lleva 8 u 11 dígitos, sin letras ni espacios'
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

-- Se concede a `authenticated` porque el anónimo no tiene nada que hacer aquí y
-- porque desde `20260908160000` las funciones nuevas no nacen ejecutables. Que
-- pueda EJECUTARLA no significa que pueda escribir: al correr con los permisos
-- de quien llama, a un capturista la política `padron_escritura` le cierra la
-- tabla y la función no crea nada.
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
-- ---------------------------------------------------------------------------
do $$
declare
  v_declarados integer;
  v_licenciaturas integer;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'padron_alumnos'
       and column_name = 'autodeclarado'
  ) then
    raise exception 'La columna `autodeclarado` no quedó puesta.';
  end if;

  select count(*) into v_declarados from padron_alumnos where autodeclarado;
  select count(*) into v_licenciaturas
    from programas p
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Licenciatura';

  raise notice 'El alta en mesa está puesta.';
  raise notice '  Licenciaturas que ofrece el catálogo: %', v_licenciaturas;
  raise notice '  Filas declaradas en mesa hasta ahora: %', v_declarados;
  raise notice '';
  raise notice 'Cuando llegue el padrón real, estas son las que hay que contrastar:';
  raise notice '  select matricula, nombre, grupo from padron_alumnos where autodeclarado;';
end;
$$;
