-- El límite de `acceso` (fn_perfil_interno) deja de contar por IP y pasa a
-- contar por CUENTA.
--
-- Qué pasó
-- --------
-- Seis puntos de captura, un único enlace de Starlink para todo el recinto:
-- las seis máquinas salen con la MISMA IP pública. `fn_perfil_interno` exige
-- diez llamadas o menos por IP en quince minutos (`20260908140000`). Ese cupo
-- se reparte entre las seis, no por cada una, así que un rato con mucho
-- tráfico —o varios teléfonos recargando la pestaña al volver de segundo
-- plano, que es lo normal en captura— lo agota entre todas. A partir de ahí
-- NINGUNA de las seis puede volver a pedir su perfil aunque su contraseña sea
-- la correcta: así se vio como «se cerró la sesión y ya no dejaba entrar».
--
-- Por qué por cuenta y no por IP
-- -------------------------------
-- `fn_perfil_interno` ya exige `auth.uid()` no nulo ANTES de llamar al
-- limitador: para ese momento Supabase Auth ya validó la contraseña, con su
-- propio límite por IP, que sigue intacto y es la primera barrera contra
-- quien adivina contraseñas. Lo que este límite defiende es otra cosa: que
-- una cuenta ya autenticada no aporree pidiendo un perfil que no tiene —por
-- ejemplo, alguien dado de baja insistiendo—. Esa pregunta es sobre UNA
-- cuenta, así que el cupo debe ser de esa cuenta, no de la red por la que
-- entró. Contando por IP, seis cuentas compartiendo un mismo Starlink se
-- turnaban para gastarse el cupo ajeno sin haber hecho nada mal.
--
-- `fn_padron_existe` y `fn_padron_confirmar` SÍ se quedan por IP: ahí no hay
-- cuenta que repartir el cupo —quien llama es anónimo— y la IP es la única
-- pista que existe. Por eso este cambio no toca `privado.limitar` ni
-- `privado.intentos`: crea una tabla y una función paralelas, solo para lo
-- que se autentica primero.

create table if not exists privado.intentos_por_cuenta (
  sujeto uuid not null,
  accion text not null,
  ocurrido_en timestamptz not null default now()
);

create index if not exists intentos_por_cuenta_busqueda
  on privado.intentos_por_cuenta (sujeto, accion, ocurrido_en desc);

-- La purga filtra solo por antigüedad, que el índice de arriba no cubre.
create index if not exists intentos_por_cuenta_antiguedad
  on privado.intentos_por_cuenta (ocurrido_en);

comment on table privado.intentos_por_cuenta is
  'Como privado.intentos, pero por cuenta ya autenticada, no por IP. Ver 20261015190000.';

-- ---------------------------------------------------------------------------
-- Mismo contrato que privado.limitar: registra y falla con un 429 si la
-- CUENTA que llama ya se pasó. Sin IP de por medio, así que sin el escape de
-- «sin cabecera no se limita» — aquí siempre hay un `auth.uid()`, porque
-- quien llama ya lo comprobó antes de invocar esto.
-- ---------------------------------------------------------------------------
create or replace function privado.limitar_por_cuenta(
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
  v_sujeto uuid := auth.uid();
  v_cuenta integer;
begin
  if v_sujeto is null then
    return;
  end if;

  delete from privado.intentos_por_cuenta
   where ocurrido_en < now() - greatest(p_ventana, interval '1 hour');

  select count(*)
    into v_cuenta
    from privado.intentos_por_cuenta
   where sujeto = v_sujeto
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

  insert into privado.intentos_por_cuenta (sujeto, accion) values (v_sujeto, p_accion);
end;
$$;

-- ---------------------------------------------------------------------------
-- fn_perfil_interno, idéntica salvo la línea del límite.
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

  perform privado.limitar_por_cuenta('acceso', 10, interval '15 minutes');

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
  'El perfil interno de quien llama, con límite por CUENTA (no por IP desde 20261015190000). Nunca el de otra persona.';
