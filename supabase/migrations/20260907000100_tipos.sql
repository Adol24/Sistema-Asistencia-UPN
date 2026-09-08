-- =============================================================================
-- 0100 · Tipos del dominio
--
-- Los estados del sistema son cerrados: un pago está en uno de seis estados y no
-- hay un séptimo. Declararlos como ENUM y no como texto libre hace que la base
-- rechace un valor inventado, en vez de aceptarlo y que aparezca meses después
-- en un reporte que nadie sabe leer.
-- =============================================================================

create type perfil_participante as enum ('alumno', 'docente', 'externo');

create type estado_pago as enum (
  'pre_registrado',
  'comprobante_recibido',
  'pagado',
  'discrepancia',
  'expirado',
  'cancelado'
);

create type concepto_pago as enum ('evento', 'taller');

-- El resultado lo decide el sistema comparando lo depositado contra lo esperado,
-- no lo elige quien captura.
create type resultado_pago as enum ('pagado', 'discrepancia');

create type origen_pago as enum ('ventanilla', 'carga_masiva');

create type tipo_asistencia as enum ('entrada', 'salida', 'taller');

create type estado_evidencia as enum (
  'pendiente',
  'aprobada',
  'rechazada',
  'no_entregada'
);

create type decision_revision as enum ('aprobada', 'rechazada');

create type rol_interno as enum (
  'admin',
  'financieros',
  'capturista',
  'revisor',
  'soporte'
);

create type estado_caso as enum ('abierto', 'en_proceso', 'resuelto');

create type canal_caso as enum ('whatsapp', 'correo', 'ventanilla', 'portal');

-- El color que ve el capturista en la puerta. Verde deja pasar, amarillo deja
-- pasar avisando, rojo detiene.
create type semaforo as enum ('verde', 'amarillo', 'rojo');
