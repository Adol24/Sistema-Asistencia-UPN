-- =============================================================================
-- 0500 · Talleres
--
-- Un taller se imparte en uno o varios días. Esa relación va en su propia tabla
-- y no en un arreglo, para que la base pueda impedir que alguien quede inscrito
-- en un taller que no se imparte su día.
-- =============================================================================

create table talleres (
  id uuid primary key default gen_random_uuid(),
  -- La clave corta que se usa en pantalla y en los reportes: T01, T02…
  clave text not null unique check (clave ~ '^T[0-9]{2}$'),
  nombre text not null,
  ponente text not null,
  descripcion text not null default '',
  horario text not null,
  lugar text not null,

  cupo_total integer not null check (cupo_total > 0),
  -- Inscritos que no pasan por este sistema (invitados, cortesías). Se suman al
  -- cupo ocupado pero no son participantes.
  ocupados_previos integer not null default 0 check (ocupados_previos >= 0),

  costo numeric(10, 2) not null check (costo >= 0),
  -- Un taller inactivo deja de ofrecerse en el catálogo público, pero conserva a
  -- sus inscritos: desactivar no es cancelar.
  activo boolean not null default true,

  creado_en timestamptz not null default now()
);

create table taller_dias (
  taller_id uuid not null references talleres (id) on delete cascade,
  dia smallint not null references dias_evento (dia) on delete restrict,
  -- La llave primaria ya sirve como destino de la llave foránea compuesta que
  -- usa `participantes` para exigir que el día del inscrito sea un día del
  -- taller. No hace falta un índice único aparte.
  primary key (taller_id, dia)
);

comment on table taller_dias is
  'Los días en que se imparte cada taller. De aquí sale la regla de que nadie quede inscrito fuera de su día.';

create index on taller_dias (dia);
