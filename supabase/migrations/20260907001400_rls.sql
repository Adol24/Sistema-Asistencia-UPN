-- =============================================================================
-- 1400 · Seguridad a nivel de fila
--
-- Regla de la casa: **toda tabla con RLS activo y sin política es inaccesible**.
-- Se empieza cerrando todo y se abre solo lo que cada rol necesita.
--
-- El participante no aparece en ninguna política porque no tiene sesión: entra
-- por las funciones SECURITY DEFINER de la migración anterior, que comprueban su
-- folio y su matrícula. Darle acceso directo a las tablas exigiría una sesión
-- que no existe.
-- =============================================================================

alter table configuracion_evento enable row level security;
alter table dias_evento enable row level security;
alter table niveles_academicos enable row level security;
alter table programas enable row level security;
alter table planteles enable row level security;
alter table usuarios_internos enable row level security;
alter table padron_alumnos enable row level security;
alter table talleres enable row level security;
alter table taller_dias enable row level security;
alter table participantes enable row level security;
alter table avisos_participante enable row level security;
alter table pagos enable row level security;
alter table asistencias enable row level security;
alter table evidencias enable row level security;
alter table revisiones enable row level security;
alter table casos_soporte enable row level security;
alter table bitacora enable row level security;

-- ------------------------------------------------- catálogos: leer todos ---
-- Lo que las pantallas públicas necesitan para dibujarse. Son datos del evento,
-- no de nadie: la cuota y las fechas están en el cartel.
create policy cfg_lectura on configuracion_evento for select using (true);
create policy dias_lectura on dias_evento for select using (true);
create policy niveles_lectura on niveles_academicos for select using (true);
create policy programas_lectura on programas for select using (true);
create policy planteles_lectura on planteles for select using (true);

-- El catálogo de talleres es público, pero solo el que se ofrece.
create policy talleres_lectura on talleres for select using (activo or es_interno_activo());
create policy taller_dias_lectura on taller_dias for select using (true);

-- Solo administración cambia la configuración y los catálogos.
create policy cfg_admin on configuracion_evento for update
  using (tiene_rol(array['admin']::rol_interno[]));
create policy dias_admin on dias_evento for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
create policy niveles_admin on niveles_academicos for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
create policy programas_admin on programas for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
create policy planteles_admin on planteles for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
create policy talleres_admin on talleres for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
create policy taller_dias_admin on taller_dias for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));

-- --------------------------------------------------------- personal ---
-- Cada quien ve su propia ficha; administración ve y edita todas.
create policy usuarios_propio on usuarios_internos for select
  using (id = auth.uid());
create policy usuarios_admin on usuarios_internos for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));

-- ------------------------------------------------------------- padrón ---
-- Nadie de fuera lo lee: es la lista completa de alumnos de la universidad. El
-- pre-registro llega a él por `fn_buscar_en_padron`, que solo acepta matrícula
-- exacta y devuelve una fila.
create policy padron_lectura on padron_alumnos for select
  using (es_interno_activo());
create policy padron_escritura on padron_alumnos for all
  using (tiene_rol(array['admin', 'soporte']::rol_interno[]))
  with check (tiene_rol(array['admin', 'soporte']::rol_interno[]));

-- ------------------------------------------------------ participantes ---
create policy participantes_lectura on participantes for select
  using (es_interno_activo());
create policy participantes_escritura on participantes for all
  using (tiene_rol(array['admin', 'soporte']::rol_interno[]))
  with check (tiene_rol(array['admin', 'soporte']::rol_interno[]));

create policy avisos_lectura on avisos_participante for select
  using (es_interno_activo());
create policy avisos_escritura on avisos_participante for all
  using (tiene_rol(array['admin', 'soporte']::rol_interno[]))
  with check (tiene_rol(array['admin', 'soporte']::rol_interno[]));

-- -------------------------------------------------------------- pagos ---
-- Los registra ventanilla. Nadie los borra: un pago mal capturado se corrige con
-- otro registro y su nota, no haciéndolo desaparecer.
create policy pagos_lectura on pagos for select
  using (tiene_rol(array['admin', 'financieros', 'soporte']::rol_interno[]));
create policy pagos_alta on pagos for insert
  with check (tiene_rol(array['admin', 'financieros']::rol_interno[]));
create policy pagos_correccion on pagos for update
  using (tiene_rol(array['admin', 'financieros']::rol_interno[]))
  with check (tiene_rol(array['admin', 'financieros']::rol_interno[]));

-- -------------------------------------------------------- asistencias ---
create policy asistencias_lectura on asistencias for select
  using (es_interno_activo());
create policy asistencias_alta on asistencias for insert
  with check (tiene_rol(array['admin', 'capturista']::rol_interno[]));
-- Anular es la única modificación, y la hace administración con motivo.
create policy asistencias_anulacion on asistencias for update
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));

-- --------------------------------------------------------- evidencias ---
create policy evidencias_lectura on evidencias for select
  using (tiene_rol(array['admin', 'revisor', 'soporte']::rol_interno[]));
create policy evidencias_escritura on evidencias for all
  using (tiene_rol(array['admin', 'revisor']::rol_interno[]))
  with check (tiene_rol(array['admin', 'revisor']::rol_interno[]));

-- Una revisión no se edita ni se borra: se agrega otra. El historial es lo que
-- permite explicar por qué cambió una decisión.
create policy revisiones_lectura on revisiones for select
  using (tiene_rol(array['admin', 'revisor', 'soporte']::rol_interno[]));
create policy revisiones_alta on revisiones for insert
  with check (
    tiene_rol(array['admin', 'revisor']::rol_interno[])
    and revisor_id = auth.uid()
  );

comment on policy revisiones_alta on revisiones is
  'El revisor solo puede firmar con su propio id: nadie aprueba a nombre de otro.';

-- ------------------------------------------------------------ soporte ---
create policy casos_lectura on casos_soporte for select
  using (es_interno_activo());
create policy casos_escritura on casos_soporte for all
  using (tiene_rol(array['admin', 'soporte']::rol_interno[]))
  with check (tiene_rol(array['admin', 'soporte']::rol_interno[]));

-- ----------------------------------------------------------- bitácora ---
-- Se lee y se escribe, pero **no se modifica ni se borra**: sin políticas de
-- UPDATE ni DELETE, la base las rechaza. Una bitácora editable no sirve para
-- aclarar una inconformidad.
create policy bitacora_lectura on bitacora for select
  using (tiene_rol(array['admin', 'soporte']::rol_interno[]));
create policy bitacora_alta on bitacora for insert
  with check (es_interno_activo());

comment on table bitacora is
  'Solo INSERT y SELECT: sin política de UPDATE ni DELETE, es inmutable.';
