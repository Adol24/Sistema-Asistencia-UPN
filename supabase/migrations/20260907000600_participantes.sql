-- =============================================================================
-- 0600 · Participantes
--
-- Quien se pre-registró. El alumno hereda del padrón lo académico; el docente y
-- el externo llenan su formulario. El estado de pago **no se guarda aquí**: se
-- deriva de la tabla de pagos, porque un estado guardado y un pago registrado se
-- contradicen tarde o temprano, y entonces ninguno de los dos es confiable.
-- =============================================================================

create sequence seq_folio start 801;

create table participantes (
  id uuid primary key default gen_random_uuid(),

  -- PRE-00801, PRE-00802… Lo genera la base, no la aplicación: dos pestañas
  -- abiertas no pueden producir el mismo folio.
  folio text not null unique default 'PRE-' || lpad(nextval('seq_folio')::text, 5, '0'),

  perfil perfil_participante not null,

  -- Solo el alumno tiene matrícula, y es la del padrón.
  matricula text unique references padron_alumnos (matricula) on delete restrict,

  nombre text not null check (length(trim(nombre)) > 0 and nombre = upper(nombre)),
  -- Marcado cuando el alumno reporta que su nombre está mal escrito. No lo
  -- detiene: señala su caso para que su documento no se elabore con el error.
  nombre_en_revision boolean not null default false,

  correo text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  celular text not null check (celular ~ '^[0-9]{10}$'),
  institucion text not null,

  -- Datos académicos: vienen del padrón para el alumno, y son NULL para docente
  -- y externo. El CHECK de abajo impide la mezcla.
  nivel_id uuid,
  programa_id uuid,
  avance smallint check (avance is null or avance >= 1),
  grupo text,
  plantel_id uuid references planteles (id) on delete restrict,

  -- Dónde le toca asistir. La sede no se guarda: sale de `dias_evento`, y
  -- guardarla haría que cambiar la sede de un día dejara atrás a los ya
  -- registrados.
  dia smallint not null references dias_evento (dia) on delete restrict,

  taller_id uuid references talleres (id) on delete set null,

  monto_esperado_evento numeric(10, 2) not null check (monto_esperado_evento >= 0),
  monto_esperado_taller numeric(10, 2) check (monto_esperado_taller >= 0),

  creado_en timestamptz not null default now(),

  -- Un alumno sin matrícula no existe, y un externo con datos académicos del
  -- padrón tampoco: sería un dato inventado viajando hasta los reportes.
  constraint chk_alumno_completo check (
    (perfil = 'alumno' and matricula is not null
      and nivel_id is not null and programa_id is not null
      and avance is not null and plantel_id is not null)
    or
    (perfil <> 'alumno' and matricula is null
      and nivel_id is null and programa_id is null
      and avance is null and plantel_id is null)
  ),

  -- Inscrito en un taller ⇒ hay monto de taller que cobrarle.
  constraint chk_monto_taller check (
    (taller_id is null and monto_esperado_taller is null)
    or (taller_id is not null and monto_esperado_taller is not null)
  ),

  foreign key (programa_id, nivel_id) references programas (id, nivel_id) on delete restrict,

  -- La regla que más veces se rompió en el prototipo: nadie puede quedar
  -- inscrito en un taller que no se imparte su día. Aquí la base la sostiene.
  foreign key (taller_id, dia) references taller_dias (taller_id, dia) on delete restrict
);

create index on participantes (dia);
create index on participantes (taller_id);
create index on participantes (perfil);
create index on participantes (lower(correo));
create index on participantes using gin (to_tsvector('simple', nombre));

comment on constraint chk_alumno_completo on participantes is
  'Un alumno trae matrícula y datos académicos; docente y externo, ninguno de los dos.';

-- --------------------------------------------------------------- avisos ---
-- Cosas que le pasaron a su registro y tiene que saber, sin que nadie se las
-- envíe: se las encuentra en su portal. Nace de la inscripción que se libera al
-- cambiar de día, donde el participante se quedaba sin taller y sin explicación.
create table avisos_participante (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references participantes (id) on delete cascade,
  texto text not null,
  creado_en timestamptz not null default now(),
  visto_en timestamptz
);

create index on avisos_participante (participante_id) where visto_en is null;
