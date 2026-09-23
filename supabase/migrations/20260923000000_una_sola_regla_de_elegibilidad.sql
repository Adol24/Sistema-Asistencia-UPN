-- =============================================================================
-- 53 · Una sola regla de elegibilidad
--
-- Había TRES, y se contradecían en tres ejes distintos
-- ----------------------------------------------------
--   `v_elegibles`              pago + entrada + SALIDA + 2 evidencias, a TODOS
--   `elegibilidad.ts`          pago + entrada + 2 evidencias, solo a alumnos
--   `portal/constancia.tsx`    pago + entrada + UNA evidencia + nombre sin
--                              observaciones, solo a alumnos
--
-- Lo que eso produce, y no es hipotético: un alumno con una evidencia aprobada
-- entra a su portal y lee «Cumples los requisitos de constancia». El panel de
-- administración, que exige dos, no lo incluye en el listado que se entrega a
-- quien elabora los documentos. Llega a recogerla y no existe.
--
-- Y al revés con un docente: `elegibilidad.ts` no le pide evidencias —su perfil
-- ni siquiera las sube— así que el reporte lo marca elegible, mientras
-- `v_elegibles`, que es lo que contesta su propio portal, le exige dos y le dice
-- que no.
--
-- Cuál de las tres manda
-- ----------------------
-- No es una decisión que se tome aquí: está tomada y escrita dos veces.
--
-- La migración 25, al convertir la puerta en torniquete, dejó dicho: «La
-- constancia. Sigue dependiendo del pago, de la entrada y —en alumnos— de las
-- evidencias, según decidió la organización. Registrar no es condicionar.»
--
-- Y `elegibilidad.ts` explica por qué se quitó la salida: el cierre automático
-- se la regalaba a todo el que hubiera entrado, así que el requisito era de
-- adorno; sostenerlo de verdad exigía formar a setecientas personas en la puerta
-- al terminar el día, y la organización decidió no condicionar nada a eso.
--
-- O sea que la vista es la que se quedó atrás, en los dos ejes: sigue exigiendo
-- la salida, y sigue exigiéndoles evidencias a perfiles que no las entregan.
--
-- Qué NO cambia
-- -------------
-- `tiene_salida` se queda como COLUMNA. Es justo lo que la 25 quería conservar
-- —saber quién se fue a media jornada— y quitarla borraría el dato. Lo que deja
-- de hacer es decidir quién recibe su documento.
--
-- Y la evidencia sigue contándose solo de los días DISTINTOS al suyo
-- (`e.dia <> p.dia`), que es la regla correcta y la única de las tres que el
-- cliente no tenía: se entrega evidencia de los días en que no se asistió.
-- =============================================================================

create or replace view v_elegibles
with (security_invoker = true) as
with asistencia as (
  select
    p.id as participante_id,
    bool_or(a.tipo = 'entrada') as tiene_entrada,
    bool_or(a.tipo = 'salida') as tiene_salida
  from participantes p
  left join asistencias a
    on a.participante_id = p.id and a.dia = p.dia and a.anulada_en is null
  group by p.id
),
evidencia as (
  select
    p.id as participante_id,
    count(*) filter (where e.estado = 'aprobada') as aprobadas
  from participantes p
  left join evidencias e on e.participante_id = p.id and e.dia <> p.dia
  group by p.id
)
select
  p.id as participante_id,
  p.folio,
  p.nombre,
  p.perfil,
  p.dia,
  coalesce(asi.tiene_entrada, false) as tiene_entrada,
  -- Se conserva para poder verlo, no para condicionar nada. Ver la 25.
  coalesce(asi.tiene_salida, false) as tiene_salida,
  coalesce(ev.aprobadas, 0) as evidencias_aprobadas,
  ep.estado as estado_pago_evento,
  p.nombre_en_revision,
  (
    ep.estado = 'pagado'
    and coalesce(asi.tiene_entrada, false)
    -- Las evidencias solo se le piden a quien las entrega. Al docente y al
    -- externo su propio portal les ofrece subirlas en ninguna pantalla, así que
    -- exigírselas era condenarlos a no ser elegibles nunca.
    and (p.perfil <> 'alumno' or coalesce(ev.aprobadas, 0) >= 2)
  ) as elegible
from participantes p
join v_estado_pago ep on ep.participante_id = p.id and ep.concepto = 'evento'
left join asistencia asi on asi.participante_id = p.id
left join evidencia ev on ev.participante_id = p.id;

comment on view v_elegibles is
  'Pagó y entró su día; y si es alumno, dos evidencias aprobadas de los otros dos. '
  'La salida se registra pero NO condiciona: ver la migración 25.';
