-- =============================================================================
-- 0200 · Configuración del evento y catálogos
--
-- Todo lo que en el prototipo se editaba desde /admin/configuracion vive aquí.
-- No son constantes de código: la cuota cambia, la fecha límite se recorre y la
-- universidad abre programas nuevos.
-- =============================================================================

-- ---------------------------------------------------------------- evento ---
-- Una sola fila. El CHECK sobre la llave primaria es lo que lo garantiza: sin
-- él, un INSERT descuidado deja dos configuraciones y ninguna pantalla sabe
-- cuál es la buena.
create table configuracion_evento (
  id smallint primary key default 1 check (id = 1),

  nombre text not null,
  subtitulo text not null default '',
  fechas text not null,

  cuota_evento numeric(10, 2) not null check (cuota_evento >= 0),

  -- Fecha real, no texto: de ella depende que un pre-registro expire.
  fecha_limite timestamptz not null,

  -- Lo que tarda Servicios Financieros en validar un voucher. Es el plazo que se
  -- le promete al alumno antes de que su QR aparezca en el portal.
  horas_validacion smallint not null default 5 check (horas_validacion between 0 and 168),

  -- Dominio exigido a los correos de alumno. NULL significa que se acepta
  -- cualquiera: hay universidades que no dan cuenta institucional a todos, y
  -- rechazar a quien no la tiene lo dejaría fuera del evento.
  dominio_institucional text,

  registro_entrada text not null,
  registro_salida text not null,

  whatsapp_soporte text not null,
  correo_soporte text not null,
  horario_soporte text not null,

  banco_nombre text not null,
  banco_cuenta text not null,
  banco_clabe text not null check (banco_clabe ~ '^[0-9]{18}$'),
  banco_beneficiario text not null,

  ventanilla_lugar text not null,
  ventanilla_horario text not null,

  aviso_privacidad text not null,
  terminos text not null,

  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

comment on column configuracion_evento.dominio_institucional is
  'NULL acepta cualquier correo. Con valor, exige que termine en @dominio.';

-- ------------------------------------------------------------------ días ---
-- El día trae su sede: el lugar del evento al que le toca asistir a quien caiga
-- en ese día. No confundir con el plantel del alumno, que es dónde estudia.
create table dias_evento (
  dia smallint primary key check (dia between 1 and 3),
  etiqueta text not null,
  fecha date not null,
  sede text not null
);

comment on table dias_evento is
  'Los tres días del evento. `sede` es dónde se asiste, no dónde se estudia.';

-- -------------------------------------------------------------- academia ---
create table niveles_academicos (
  id uuid primary key default gen_random_uuid(),
  nivel text not null unique,
  -- Cómo se llama el avance en este nivel: semestre, módulo, cuatrimestre.
  etiqueta_avance text not null,
  total_avance smallint not null check (total_avance between 1 and 20),
  orden smallint not null default 0
);

create table programas (
  id uuid primary key default gen_random_uuid(),
  nivel_id uuid not null references niveles_academicos (id) on delete restrict,
  nombre text not null,
  activo boolean not null default true,
  unique (nivel_id, nombre),
  -- Permite la llave foránea compuesta desde el padrón: sin esto, la base no
  -- puede impedir que una fila diga «Licenciatura» y apunte a un programa de
  -- maestría.
  unique (id, nivel_id)
);

create table planteles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

comment on table planteles is
  'Dónde estudia el alumno. Lo entrega Servicios Escolares en el padrón.';
