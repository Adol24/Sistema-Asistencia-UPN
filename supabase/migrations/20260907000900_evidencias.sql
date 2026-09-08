-- =============================================================================
-- 0900 · Evidencias y su revisión
--
-- El participante asiste presencialmente un día y entrega evidencia de los otros
-- dos. Con dos mil quinientos alumnos son unas cinco mil imágenes, así que la
-- detección de duplicados y el reparto de la cola son parte del modelo, no un
-- añadido de la interfaz.
-- =============================================================================

create table evidencias (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes (id) on delete restrict,
  dia smallint not null references dias_evento (dia) on delete restrict,

  archivo_url text,
  -- Huella del archivo. Es lo que permite detectar que dos alumnos subieron la
  -- misma imagen sin comparar cinco mil fotos a mano.
  hash_archivo text check (hash_archivo is null or hash_archivo ~ '^[a-f0-9]{64}$'),

  estado estado_evidencia not null default 'no_entregada',
  subida_en timestamptz,

  -- Una evidencia por participante y día: si vuelve a subir, se reemplaza.
  unique (participante_id, dia),

  -- Entregada ⇒ hay archivo. Sin esto, una fila puede decir «pendiente de
  -- revisión» y no tener nada que revisar.
  constraint chk_entregada_con_archivo check (
    estado = 'no_entregada'
    or (archivo_url is not null and hash_archivo is not null and subida_en is not null)
  )
);

create index on evidencias (estado, dia);
-- El índice que sostiene la detección de duplicados.
create index on evidencias (hash_archivo) where hash_archivo is not null;

comment on column evidencias.hash_archivo is
  'SHA-256 del archivo. Dos filas con el mismo hash son el mismo archivo subido dos veces.';

-- --------------------------------------------------------------- revisión ---
create table revisiones (
  id uuid primary key default gen_random_uuid(),
  evidencia_id uuid not null references evidencias (id) on delete cascade,
  revisor_id uuid not null references usuarios_internos (id) on delete restrict,

  decision decision_revision not null,
  -- Todo rechazo lleva motivo, y el motivo le llega al alumno para que sepa qué
  -- corregir. Un rechazo sin explicación se convierte en un reclamo, y con dos
  -- mil quinientos alumnos eso no escala.
  motivo_rechazo text,

  revisado_en timestamptz not null default now(),

  constraint chk_rechazo_con_motivo check (
    decision <> 'rechazada'
    or (motivo_rechazo is not null and length(trim(motivo_rechazo)) > 0)
  )
);

create index on revisiones (evidencia_id, revisado_en desc);
create index on revisiones (revisor_id, revisado_en desc);

comment on table revisiones is
  'Historial de decisiones. La última manda; las anteriores explican por qué cambió.';

-- El estado de la evidencia lo escribe la revisión, no quien llama: así no puede
-- quedar una evidencia «aprobada» sin una decisión que lo respalde.
create or replace function fn_aplicar_revision()
returns trigger
language plpgsql
as $$
begin
  update evidencias
     set estado = new.decision::text::estado_evidencia
   where id = new.evidencia_id;
  return new;
end;
$$;

create trigger trg_revision_aplica
  after insert on revisiones
  for each row execute function fn_aplicar_revision();
