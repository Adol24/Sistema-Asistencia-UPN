-- =============================================================================
-- 56 · Dar de alta a alguien del personal
--
-- El botón que no daba de alta a nadie
-- ------------------------------------
-- `guardarUsuarioRemoto` es un `update ... eq("id", u.id)` y nada más: no hay
-- `insert` en ninguna parte. Y la pantalla, al pulsar «Nuevo usuario», inventa
-- un identificador local del estilo `U01` sobre una columna `uuid`.
--
-- O sea que el alta hacía una de dos cosas, las dos inútiles: si el id era `U01`
-- PostgreSQL contestaba `22P02` —sintaxis inválida para uuid— y el error moría
-- en la consola porque esa llamada no pasaba `alFallar`; y aunque el id hubiera
-- sido un uuid válido, un `update` que no encuentra fila devuelve ÉXITO sin
-- tocar nada.
--
-- Lo que se veía: administración da de alta a un revisor dos días antes del
-- evento, lee «Usuario SOFÍA RAMÍREZ guardado», la bitácora anota «Dio de alta
-- un usuario interno», y la persona aparece en la tabla. Al recargar ha
-- desaparecido y nunca pudo entrar.
--
-- Por qué no se puede arreglar «insertando»
-- -----------------------------------------
-- `usuarios_internos.id` es `references auth.users (id)`, así que una fila del
-- personal no existe sin su cuenta de acceso. Y crear una cuenta de Auth exige
-- la clave de SERVICIO: no es algo que un navegador pueda hacer, ni deba.
--
-- Cualquier alta hecha desde el panel que no tuviera eso en cuenta sería otra
-- versión del mismo engaño con distinta forma.
--
-- Lo que sí puede hacer el panel
-- ------------------------------
-- Separar las dos cosas que estaban confundidas en un solo botón:
--
--   1. La CUENTA la crea quien administra el proyecto, invitando por correo
--      desde Supabase Auth. Eso no pasa por aquí y está bien que no pase.
--   2. El ROL se lo da esta función, buscando a esa persona por su correo entre
--      las cuentas que ya existen.
--
-- Si el correo no tiene cuenta, lo dice con esas palabras y explica el paso que
-- falta, en vez de fingir que guardó algo.
-- =============================================================================

create or replace function fn_alta_usuario_interno(
  p_correo text,
  p_nombre text,
  p_rol rol_interno
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_correo text := lower(trim(p_correo));
  v_id uuid;
begin
  -- Dar roles es de administración, y punto. Sin esto la función sería una vía
  -- para que cualquiera del personal se ascendiera.
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede dar de alta al personal'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;

  /*
   * `auth.users` solo es legible desde una función `security definer`, y aquí
   * se usa para UNA cosa: traducir el correo a su identificador. No se devuelve
   * nada más de esa tabla.
   */
  select id into v_id from auth.users where lower(email) = v_correo;

  if v_id is null then
    raise exception
      'No hay ninguna cuenta con el correo %. Invítala primero desde Supabase '
      'Auth: la cuenta de acceso se crea ahí, y aquí se le da su rol.', v_correo
      using errcode = 'no_data_found';
  end if;

  -- Reactivar a quien se dio de baja es el mismo acto que dar de alta: la fila
  -- no se borra nunca, para que la bitácora que firmó conserve su autor.
  insert into usuarios_internos (id, nombre, correo, rol, activo)
  values (v_id, trim(p_nombre), v_correo, p_rol, true)
  on conflict (id) do update
    set nombre = excluded.nombre,
        correo = excluded.correo,
        rol = excluded.rol,
        activo = true;

  return v_id;
end;
$$;

revoke all on function fn_alta_usuario_interno(text, text, rol_interno)
  from public, anon, authenticated;
grant execute on function fn_alta_usuario_interno(text, text, rol_interno) to authenticated;

comment on function fn_alta_usuario_interno is
  'Le da rol a una cuenta de Auth que YA existe. La cuenta se crea invitando '
  'desde Supabase Auth: usuarios_internos.id referencia auth.users, y crear una '
  'cuenta exige la clave de servicio.';
