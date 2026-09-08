-- =============================================================================
-- 1000 · Soporte y bitácora
-- =============================================================================

create sequence seq_caso start 1;

create table casos_soporte (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique default 'CS-' || lpad(nextval('seq_caso')::text, 3, '0'),

  participante_id uuid not null references participantes (id) on delete restrict,
  asunto text not null,
  detalle text not null,
  estado estado_caso not null default 'abierto',
  canal canal_caso not null,

  atiende_id uuid references usuarios_internos (id) on delete set null,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,

  constraint chk_resuelto_con_fecha check (
    (estado = 'resuelto' and resuelto_en is not null)
    or (estado <> 'resuelto' and resuelto_en is null)
  )
);

create index on casos_soporte (estado, creado_en desc);
create index on casos_soporte (participante_id);

comment on table casos_soporte is
  'Un caso de nombre abierto es lo que señala al participante en el listado de elegibles; cerrarlo quita la marca.';

-- La marca del participante y su caso de nombre son la misma cosa vista desde
-- dos lados. Mantenerlos a mano garantiza que un día se contradigan.
create or replace function fn_sincronizar_marca_nombre()
returns trigger
language plpgsql
as $$
declare
  v_participante uuid := coalesce(new.participante_id, old.participante_id);
begin
  update participantes p
     set nombre_en_revision = exists (
           select 1 from casos_soporte c
            where c.participante_id = v_participante
              and c.asunto = 'Nombre incorrecto en el registro'
              and c.estado <> 'resuelto'
         )
   where p.id = v_participante;
  return null;
end;
$$;

create trigger trg_caso_marca_nombre
  after insert or update of estado or delete on casos_soporte
  for each row execute function fn_sincronizar_marca_nombre();

-- -------------------------------------------------------------- bitácora ---
-- Quién hizo qué y cuándo. Cada pago, cada evidencia revisada, cada escaneo,
-- cada cambio de configuración. Es donde se comprueba una inconformidad.
create table bitacora (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios_internos (id) on delete set null,
  -- Para lo que no hace un usuario interno: el pre-registro en línea, un proceso
  -- automático. Sin esto, esas entradas quedarían sin autor y parecerían un
  -- hueco en el registro.
  usuario_texto text,
  accion text not null,
  detalle text not null,
  ocurrido_en timestamptz not null default now()
);

create index on bitacora (ocurrido_en desc);
create index on bitacora (usuario_id, ocurrido_en desc);

comment on column bitacora.usuario_texto is
  'Autor cuando no es un usuario interno: «Pre-registro en línea», «Cierre automático».';
