-- =============================================================================
-- Las vistas no heredaban las políticas de sus tablas
--
-- `20260907001600_permisos.sql` afirma que «las vistas heredan las políticas de
-- sus tablas, así que conceder SELECT no abre nada que las tablas no
-- permitieran ya». No es cierto, y esa frase es la razón de que nadie lo
-- revisara.
--
-- En PostgreSQL una vista se ejecuta con los permisos de QUIEN LA CREÓ, no de
-- quien la consulta, salvo que se declare `security_invoker = true`. Estas seis
-- las creó `postgres`, que es dueño de las tablas, y el dueño no está sujeto a
-- las políticas de fila de sus propias tablas. O sea: las seis se saltan RLS.
--
-- No es una fuga al público: las seis están concedidas solo a `authenticated`,
-- que aquí significa personal con fila activa en `usuarios_internos`. Lo que se
-- pierde es la separación de roles DENTRO del personal.
--
--   v_elegibles y v_evidencias_duplicadas leen `evidencias`, cuya política es
--   de administración, revisor y soporte. A través de la vista las ve también
--   un capturista o un financiero.
--
-- Se arregla donde el salto es un descuido, y se deja —documentado— donde es
-- deliberado. Marcar las seis por igual rompería dos cosas que sí funcionan.
-- =============================================================================

-- --------------------------------------------------- las que se corrigen ---
-- Estas dos leen tablas cuya política es `es_interno_activo()`, el mismo
-- público al que están concedidas. Marcarlas no cambia lo que ve nadie: deja
-- de ser verdad por accidente y pasa a serlo por escrito.
alter view v_participantes set (security_invoker = true);
alter view v_reparto_dias  set (security_invoker = true);

-- Estas dos sí estrechan: leen `evidencias`, que no es de todo el personal.
alter view v_elegibles            set (security_invoker = true);
alter view v_evidencias_duplicadas set (security_invoker = true);

-- ------------------------------------------ las que se dejan, y por qué ---
-- `v_estado_pago` NO se marca. Es intencional y hay que decirlo, porque leído
-- sin contexto parece el mismo descuido que las otras.
--
-- `pagos_lectura` es de administración, financieros y soporte: el capturista de
-- la puerta no puede leer la tabla, y hace bien, porque ahí están los importes
-- y las referencias bancarias. Pero SÍ necesita saber si alguien pagó, o el
-- semáforo no puede ponerse en verde. Esta vista da exactamente eso —folio,
-- concepto, estado— y nada más. Marcarla como invoker dejaría al capturista sin
-- ver nada y la puerta rechazaría a todo el mundo.
comment on view v_estado_pago is
  'Deliberadamente SIN security_invoker: es la única forma de que el capturista '
  'sepa quién pagó sin poder leer importes ni referencias. No es un descuido; '
  'cambiarlo deja la puerta en rojo para todos.';

-- `v_talleres` tampoco. Cuenta el cupo ocupado uniendo con `participantes`, que
-- el público no puede leer; como invoker, el cartel mostraría todos los
-- talleres con cero inscritos. Lo que sí hay que reponer es el filtro que la
-- política de la tabla aplicaba y la vista se saltaba: un taller dado de baja
-- no debe salir en el cartel.
create or replace view v_talleres as
select
  t.id,
  t.clave,
  t.nombre,
  t.ponente,
  t.descripcion,
  t.horario,
  t.lugar,
  t.costo,
  t.activo,
  t.cupo_total,
  t.ocupados_previos + count(p.id) as cupo_ocupado,
  t.cupo_total - (t.ocupados_previos + count(p.id)) as lugares_libres,
  array(select dia from taller_dias td where td.taller_id = t.id order by dia) as dias
from talleres t
left join participantes p on p.taller_id = t.id
-- El filtro que `talleres_lectura` aplicaba y esta vista se saltaba.
where t.activo or es_interno_activo()
group by t.id;

comment on view v_talleres is
  'Deliberadamente SIN security_invoker: cuenta inscritos, que el público no '
  'puede leer. El filtro de talleres dados de baja va escrito aquí, porque la '
  'política de la tabla no le llega.';

-- ------------------------------------------------- el permiso que faltaba ---
-- Comprobado contra el proyecto real: un anónimo recibe «permission denied for
-- view v_talleres» pese a que `20260907001600_permisos.sql` se la concede en su
-- línea 46.
--
-- La causa es el orden. Cinco líneas más abajo, `revoke all on all tables in
-- schema public from anon` deshace esa concesión, porque en PostgreSQL «ALL
-- TABLES» incluye las vistas. El `grant` que viene después solo repone tablas,
-- no la vista. El catálogo público llevaba cerrado desde entonces.
--
-- Hoy no rompe nada porque la aplicación lee la tabla `talleres`, no la vista.
-- Se repone para que lo que el archivo dice y lo que la base hace vuelvan a
-- coincidir; con el filtro de arriba ya no abre de más.
grant select on v_talleres to anon;
