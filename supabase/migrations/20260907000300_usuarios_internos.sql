-- =============================================================================
-- 0300 · Usuarios internos
--
-- Financieros, capturistas, revisores, soporte y administración. Son los únicos
-- que se autentican de verdad: el participante entra con folio y matrícula, sin
-- contraseña, por un camino aparte.
--
-- La fila cuelga de `auth.users` para no duplicar credenciales, pero el rol vive
-- aquí: quién puede registrar un pago es una decisión del negocio, no de la capa
-- de autenticación.
-- =============================================================================

create table usuarios_internos (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  correo text not null unique,
  rol rol_interno not null,
  -- Dar de baja desactiva, no borra: si se borrara, cada entrada de bitácora que
  -- esa persona firmó se quedaría sin autor.
  activo boolean not null default true,
  ultimo_acceso timestamptz,
  creado_en timestamptz not null default now()
);

create index on usuarios_internos (rol) where activo;

comment on column usuarios_internos.activo is
  'La baja desactiva; nunca se borra la fila, o la bitácora pierde a su autor.';

-- ------------------------------------------------------------- ayudantes ---
-- Se usan dentro de las políticas RLS de todas las demás tablas. Son STABLE y
-- SECURITY DEFINER porque tienen que poder leer `usuarios_internos` aunque la
-- política que las llama esté evaluándose para alguien que no puede leerla.

create or replace function es_interno_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios_internos
    where id = auth.uid() and activo
  );
$$;

create or replace function tiene_rol(roles rol_interno[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios_internos
    where id = auth.uid() and activo and rol = any (roles)
  );
$$;

comment on function tiene_rol is
  'Cierto si quien llama es un usuario interno activo con alguno de esos roles.';
