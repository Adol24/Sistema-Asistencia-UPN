-- =============================================================================
-- 0700 · Pagos
--
-- La cuota del evento y la del taller se depositan por separado, así que hay una
-- fila por concepto. El control que sostiene todo el módulo es la unicidad de la
-- referencia bancaria: es lo que impide que dos personas presenten copias del
-- mismo voucher.
-- =============================================================================

create table pagos (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes (id) on delete restrict,
  concepto concepto_pago not null,

  monto numeric(10, 2) not null check (monto > 0),
  -- Lo que el sistema esperaba en el momento de registrar. Se guarda porque la
  -- cuota puede cambiar después, y entonces la discrepancia de ayer dejaría de
  -- entenderse.
  monto_esperado numeric(10, 2) not null check (monto_esperado >= 0),

  -- **El control anti-fraude.** Vive como restricción de la base y no como
  -- comprobación de la aplicación: dos ventanillas capturando a la vez pueden
  -- pasar las dos por la validación y solo una puede pasar por aquí.
  referencia text not null check (referencia ~ '^[A-Za-z0-9]{6,20}$'),

  fecha_deposito date not null,
  resultado resultado_pago not null,
  origen origen_pago not null default 'ventanilla',

  -- Obligatoria cuando el monto no cuadra: una discrepancia sin explicación es
  -- un problema que nadie puede resolver tres semanas después.
  nota text,

  voucher_url text,

  registrado_por uuid references usuarios_internos (id) on delete set null,
  registrado_en timestamptz not null default now(),

  constraint uq_referencia unique (referencia),

  constraint chk_discrepancia_con_nota check (
    resultado <> 'discrepancia' or (nota is not null and length(trim(nota)) > 0)
  )
);

create index on pagos (participante_id, concepto);
create index on pagos (fecha_deposito);
create index on pagos (registrado_en desc);

comment on constraint uq_referencia on pagos is
  'El control anti-fraude: una referencia bancaria no puede registrarse dos veces.';

-- El resultado no lo elige quien captura: lo decide el sistema comparando lo
-- depositado contra lo esperado. Dejarlo a criterio de ventanilla convierte una
-- discrepancia en un pago completo con solo elegir mal en un desplegable.
create or replace function fn_resultado_pago()
returns trigger
language plpgsql
as $$
begin
  new.resultado := case
    when new.monto = new.monto_esperado then 'pagado'::resultado_pago
    else 'discrepancia'::resultado_pago
  end;
  return new;
end;
$$;

create trigger trg_pagos_resultado
  before insert or update of monto, monto_esperado on pagos
  for each row execute function fn_resultado_pago();
