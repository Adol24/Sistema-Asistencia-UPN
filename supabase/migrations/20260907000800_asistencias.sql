-- =============================================================================
-- 0800 · Asistencias
--
-- Entradas y salidas en la puerta, y pase de lista en los talleres. Se capturan
-- desde el teléfono, a veces sin señal, así que la tabla acepta que el registro
-- llegue tarde: `registrada_en` es cuándo ocurrió y `sincronizada_en` cuándo
-- alcanzó la base.
-- =============================================================================

create table asistencias (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes (id) on delete restrict,
  dia smallint not null references dias_evento (dia) on delete restrict,
  tipo tipo_asistencia not null,

  taller_id uuid references talleres (id) on delete restrict,

  -- Cuándo pasó de verdad. El teléfono lo sella al escanear, no al sincronizar.
  registrada_en timestamptz not null default now(),
  sincronizada_en timestamptz not null default now(),

  punto text not null default 'Puerta A',
  capturista_id uuid references usuarios_internos (id) on delete set null,

  -- Excepción autorizada por un supervisor: alguien que llegó el día que no era
  -- y aun así se le dejó pasar. Sin el motivo y sin quién autorizó, la excepción
  -- es indistinguible de un error de captura.
  autorizada_por uuid references usuarios_internos (id) on delete set null,
  autorizacion_motivo text,

  -- Anular no borra. El registro sale de los cálculos pero queda la constancia
  -- de que existió, de quién lo anuló y por qué.
  anulada_en timestamptz,
  anulada_por uuid references usuarios_internos (id) on delete set null,
  anulacion_motivo text,

  constraint chk_taller_solo_en_taller check (
    (tipo = 'taller' and taller_id is not null)
    or (tipo <> 'taller' and taller_id is null)
  ),

  constraint chk_autorizacion_con_motivo check (
    autorizada_por is null
    or (autorizacion_motivo is not null and length(trim(autorizacion_motivo)) >= 10)
  ),

  constraint chk_anulacion_con_motivo check (
    anulada_en is null
    or (anulacion_motivo is not null and length(trim(anulacion_motivo)) >= 10)
  )
);

create index on asistencias (participante_id, dia) where anulada_en is null;
create index on asistencias (dia, registrada_en);
create index on asistencias (taller_id) where tipo = 'taller';

comment on column asistencias.anulada_en is
  'Anular saca el registro de los cálculos sin borrarlo: la bitácora conserva el porqué.';

-- Una entrada y una salida por día. El reingreso dentro de la ventana de
-- cortesía no genera un registro nuevo, así que este índice no estorba a la
-- operación real y sí impide el duplicado por doble escaneo.
create unique index uq_asistencia_por_dia
  on asistencias (participante_id, dia, tipo)
  where tipo in ('entrada', 'salida') and anulada_en is null;

-- Un pase de lista por taller y participante.
create unique index uq_asistencia_taller
  on asistencias (participante_id, taller_id)
  where tipo = 'taller' and anulada_en is null;
