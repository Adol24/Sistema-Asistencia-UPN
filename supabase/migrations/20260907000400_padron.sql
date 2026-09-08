-- =============================================================================
-- 0400 · Padrón de alumnos
--
-- Lo que entrega Servicios Escolares: matrícula, nombre completo en una sola
-- columna y los datos académicos. No trae el correo —lo declara el alumno y se
-- verifica con un código— ni el día del evento, que reparte la organización.
-- =============================================================================

create table padron_alumnos (
  -- La matrícula de la universidad: 11 dígitos, sin letras. La restricción vive
  -- en la base y no solo en el formulario, porque el padrón también entra por
  -- importación de archivo.
  matricula text primary key check (matricula ~ '^[0-9]{11}$'),

  -- Nombre completo en una columna. No se parte en nombres y apellidos: con dos
  -- nombres de pila, apellidos compuestos y listas que llegan con los apellidos
  -- primero, cualquier regla que lo parta rechaza alumnos reales.
  nombre text not null check (
    length(trim(nombre)) > 0
    and nombre = upper(nombre)
    and array_length(regexp_split_to_array(trim(nombre), '\s+'), 1) >= 2
  ),

  nivel_id uuid not null,
  programa_id uuid not null,
  -- Semestre en licenciatura, módulo en maestría. El nivel dice cómo llamarlo y
  -- hasta dónde llega; el tope lo valida un disparador, porque es entre tablas.
  avance smallint not null check (avance >= 1),
  -- No todos los programas manejan grupo.
  grupo text,
  plantel_id uuid not null references planteles (id) on delete restrict,

  -- El día del evento. NULL es un estado real: el alta que todavía espera a que
  -- la organización reparta los días.
  dia smallint references dias_evento (dia) on delete set null,

  importado_en timestamptz not null default now(),
  importado_por uuid references usuarios_internos (id) on delete set null,

  -- Que el programa pertenezca al nivel declarado no se comprueba en la
  -- aplicación: se comprueba aquí, contra la llave compuesta de `programas`.
  foreign key (programa_id, nivel_id) references programas (id, nivel_id) on delete restrict
);

create index on padron_alumnos (dia);
create index on padron_alumnos (programa_id);
create index on padron_alumnos (plantel_id);
-- Búsqueda por nombre desde ventanilla y soporte.
create index on padron_alumnos using gin (to_tsvector('simple', nombre));

comment on column padron_alumnos.dia is
  'NULL = esperando reparto. Lo asigna la organización, no la universidad.';

-- El avance no puede pasarse del tope de su nivel. Es una regla entre tablas, y
-- un CHECK no puede consultarlas: sin este disparador, un archivo con «semestre
-- 14» de una licenciatura de diez entra sin que nada lo detenga.
create or replace function fn_validar_avance()
returns trigger
language plpgsql
as $$
declare
  v_tope smallint;
  v_etiqueta text;
begin
  select total_avance, etiqueta_avance
    into v_tope, v_etiqueta
    from niveles_academicos
   where id = new.nivel_id;

  if new.avance > v_tope then
    raise exception '% % está fuera de rango: ese nivel llega a %',
      v_etiqueta, new.avance, v_tope
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_padron_avance
  before insert or update of avance, nivel_id on padron_alumnos
  for each row execute function fn_validar_avance();
