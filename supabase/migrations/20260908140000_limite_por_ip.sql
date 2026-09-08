-- Límite de intentos por IP para las dos puertas que se pueden aporrear:
-- la consulta del padrón y la obtención del perfil interno al entrar.
--
-- Por qué en la base y no en el navegador
-- ---------------------------------------
-- Lo que había era un contador en React, que se reinicia recargando la página.
-- Servía para avisar a quien se equivoca, no para detener a quien insiste. El
-- límite tiene que vivir donde no lo controle quien llama, y estas funciones son
-- la única puerta a esos datos.
--
-- Cómo se obtiene la IP
-- ---------------------
-- Supabase corre detrás de Cloudflare, así que `cf-connecting-ip` es la fuente
-- autorizada y `x-forwarded-for` el respaldo. Si no hay ninguna —desarrollo
-- local, por ejemplo— no se limita: inventar una IP agruparía a todo el mundo
-- bajo la misma cuenta y bastaría un usuario para dejar fuera a los demás.

create schema if not exists privado;

-- El esquema no se expone en la API: PostgREST solo publica los que tiene
-- configurados, y este no está entre ellos. La bitácora de intentos no es
-- consultable desde fuera.
revoke all on schema privado from anon, authenticated;

create table if not exists privado.intentos (
  ip inet not null,
  accion text not null,
  ocurrido_en timestamptz not null default now()
);

create index if not exists intentos_busqueda
  on privado.intentos (ip, accion, ocurrido_en desc);

-- La purga filtra solo por antigüedad, que el índice de arriba no cubre. Sin
-- este, cada llamada haría un recorrido completo de la tabla.
create index if not exists intentos_antiguedad
  on privado.intentos (ocurrido_en);

comment on table privado.intentos is
  'Un renglón por intento. Se purga sola: cada llamada borra lo que ya no cuenta.';

-- ---------------------------------------------------------------------------
create or replace function privado.ip_solicitante()
returns inet
language plpgsql
stable
as $$
declare
  cabeceras json := current_setting('request.headers', true)::json;
  crudo text;
begin
  -- Cloudflare va delante, así que su cabecera es la de fiar. `x-forwarded-for`
  -- puede traer una cadena de proxies: la primera entrada es el cliente.
  crudo := coalesce(
    cabeceras->>'cf-connecting-ip',
    split_part(coalesce(cabeceras->>'x-forwarded-for', ''), ',', 1)
  );
  if crudo is null or btrim(crudo) = '' then
    return null;
  end if;
  return btrim(crudo)::inet;
exception
  when others then
    -- Una cabecera con basura no debe tumbar la operación; simplemente no se
    -- puede atribuir el intento.
    return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registra el intento y falla si esa IP ya se pasó de la cuenta.
--
-- Devuelve un 429 con el formato que PostgREST entiende, para que el cliente
-- reciba un error legible en vez de un fallo genérico de base de datos.
create or replace function privado.limitar(
  p_accion text,
  p_maximo integer,
  p_ventana interval
)
returns void
language plpgsql
volatile
security definer
set search_path = privado, public
as $$
declare
  v_ip inet := privado.ip_solicitante();
  v_cuenta integer;
begin
  if v_ip is null then
    return;
  end if;

  -- Purga oportunista: evita depender de una tarea programada y mantiene la
  -- tabla del tamaño de la ventana, no del historial. Tras la primera pasada
  -- casi siempre borra cero filas, y con el índice de antigüedad eso es barato.
  delete from privado.intentos
   where ocurrido_en < now() - greatest(p_ventana, interval '1 hour');

  select count(*)
    into v_cuenta
    from privado.intentos
   where ip = v_ip
     and accion = p_accion
     and ocurrido_en > now() - p_ventana;

  if v_cuenta >= p_maximo then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'message', 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
      )::text,
      detail = json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  insert into privado.intentos (ip, accion) values (v_ip, p_accion);
end;
$$;

-- ---------------------------------------------------------------------------
-- Padrón: las dos funciones pasan a `volatile`.
--
-- No es un detalle de forma. Una función `stable` corre en transacción de solo
-- lectura, así que no podría registrar el intento: el límite quedaría sin
-- contador y sin efecto.
--
-- Los topes son distintos a propósito. Comprobar si una matrícula existe es algo
-- que alguien legítimo hace una o dos veces; confirmar identidad, tres a lo
-- sumo. Lo que se corta es el bucle, no al que se equivoca.
-- ---------------------------------------------------------------------------
create or replace function fn_padron_existe(p_matricula text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform privado.limitar('padron_existe', 30, interval '10 minutes');

  return jsonb_build_object(
    'existe', exists (
      select 1 from padron_alumnos a where a.matricula = trim(p_matricula)
    ),
    'ya_registrado', exists (
      select 1 from participantes p where p.matricula = trim(p_matricula)
    )
  );
end;
$$;

create or replace function fn_padron_confirmar(
  p_matricula text,
  p_nombres text,
  p_programa text
)
returns jsonb
language plpgsql
volatile
security definer
-- `extensions` va en la ruta porque ahí vive `unaccent` en Supabase. Sin esto
-- la función se crea sin quejarse y falla en la primera llamada: plpgsql no
-- valida el cuerpo hasta que se ejecuta.
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
-- Acceso del personal.
--
-- El inicio de sesión lo atiende Supabase Auth, que tiene su propio límite por
-- IP y no se puede interceptar desde aquí. Pero entrar al sistema necesita DOS
-- cosas: la sesión de Auth y una fila activa en `usuarios_internos`. Esta
-- segunda sí pasa por Postgres, así que es donde se pone el límite: una IP que
-- aporrea el acceso deja de obtener perfil aunque acierte la contraseña.
--
-- La función devuelve solo el perfil de quien llama —`auth.uid()`—, nunca el de
-- otro, así que también quita a la aplicación el permiso de leer la tabla
-- entera para comprobar una sesión.
-- ---------------------------------------------------------------------------
create or replace function fn_perfil_interno()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  perform privado.limitar('acceso', 10, interval '15 minutes');

  select jsonb_build_object(
           'id', u.id,
           'nombre', u.nombre,
           'correo', u.correo,
           'rol', u.rol
         )
    into v
    from usuarios_internos u
   where u.id = auth.uid()
     and u.activo;

  return v;
end;
$$;

comment on function fn_perfil_interno is
  'El perfil interno de quien llama, con límite por IP. Nunca el de otra persona.';

grant execute on function fn_perfil_interno() to authenticated;
