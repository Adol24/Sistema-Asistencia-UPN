-- =============================================================================
-- 1500 · Datos iniciales
--
-- Lo mínimo para que el sistema arranque: la configuración del evento, los tres
-- días y el catálogo académico. No incluye alumnos: el padrón se importa.
--
-- Todo va con ON CONFLICT para que volver a ejecutar la migración no rompa nada.
-- =============================================================================

insert into configuracion_evento (
  id, nombre, subtitulo, fechas, cuota_evento, fecha_limite, horas_validacion,
  dominio_institucional, registro_entrada, registro_salida,
  whatsapp_soporte, correo_soporte, horario_soporte,
  banco_nombre, banco_cuenta, banco_clabe, banco_beneficiario,
  ventanilla_lugar, ventanilla_horario, aviso_privacidad, terminos
)
values (
  1,
  'XIV Encuentro Internacional de Educación',
  'Conocimiento, innovación y comunidad',
  '14, 15 y 16 de octubre de 2026',
  650.00,
  '2026-10-09 18:00:00-06',
  5,
  'alumnos.universidad.mx',
  '8:00 a 9:00 hrs',
  '13:00 a 14:00 hrs',
  '5211234567890',
  'soporte.encuentro@universidad.mx',
  'Lunes a viernes de 9:00 a 18:00 hrs',
  'BBVA México',
  '0123456789',
  '012320001234567897',
  'UNIVERSIDAD AUTONOMA - ENCUENTRO INTERNACIONAL',
  'Servicios Financieros, Edificio A, planta baja',
  'Lunes a viernes de 9:00 a 17:00 hrs',
  'Los datos que proporciones se usan únicamente para tu registro, control de asistencia y emisión de constancia del XIV Encuentro Internacional de Educación. No se comparten con terceros. Puedes solicitar su corrección o baja escribiendo al correo de soporte.',
  'El cupo de talleres se asigna por orden de entrega del comprobante y se libera si no se entrega antes de la fecha límite. La cuota no es reembolsable una vez validado el pago. La constancia se emite a nombre del participante tal como aparece en su registro; las correcciones deben solicitarse a soporte antes del cierre del evento.'
)
on conflict (id) do nothing;

-- Miércoles, jueves y viernes de esa semana de octubre de 2026.
insert into dias_evento (dia, etiqueta, fecha, sede) values
  (1, 'DÍA 1', '2026-10-14', 'Salón SUTERM'),
  (2, 'DÍA 2', '2026-10-15', 'Salón SUTERM'),
  (3, 'DÍA 3', '2026-10-16', 'Teatro Victoria')
on conflict (dia) do nothing;

insert into niveles_academicos (nivel, etiqueta_avance, total_avance, orden) values
  ('Licenciatura', 'Semestre', 10, 1),
  ('Maestría', 'Módulo', 6, 2)
on conflict (nivel) do nothing;

insert into programas (nivel_id, nombre)
select n.id, p.nombre
from niveles_academicos n
join (values
  ('Licenciatura', 'Ingeniería en Sistemas Computacionales'),
  ('Licenciatura', 'Ingeniería Industrial'),
  ('Licenciatura', 'Licenciatura en Administración'),
  ('Licenciatura', 'Licenciatura en Ciencias de la Educación'),
  ('Licenciatura', 'Licenciatura en Derecho'),
  ('Licenciatura', 'Licenciatura en Nutrición'),
  ('Licenciatura', 'Licenciatura en Psicología'),
  ('Maestría', 'Maestría en Administración'),
  ('Maestría', 'Maestría en Ciencias Computacionales'),
  ('Maestría', 'Maestría en Docencia'),
  ('Maestría', 'Maestría en Educación'),
  ('Maestría', 'Maestría en Innovación Educativa')
) as p (nivel, nombre) on p.nivel = n.nivel
on conflict (nivel_id, nombre) do nothing;

insert into planteles (nombre) values
  ('Campus Central'),
  ('Campus Norte'),
  ('Campus Sur'),
  ('Unidad Poniente')
on conflict (nombre) do nothing;
