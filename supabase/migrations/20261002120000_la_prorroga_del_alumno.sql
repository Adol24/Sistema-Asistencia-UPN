-- =============================================================================
-- La prórroga del alumno: los dos valores nuevos y dónde se guarda el permiso
--
-- Esta migración es `20261002120000_la_prorroga_del_alumno`.
--
-- ⚠ VA SOLA. La siguiente —`20261002130000_los_abonos_de_la_prorroga`— se pega
-- ⚠ en una CORRIDA APARTE, cuando esta haya terminado.
--
-- Por qué está partida en dos archivos
-- ------------------------------------
-- Postgres permite `alter type ... add value` dentro de una transacción pero
-- **prohíbe usar el valor nuevo en esa misma transacción**. El editor SQL de
-- Supabase manda todo el texto pegado como una sola orden, así que la vista y
-- el disparador que devuelven `'parcial'` tienen que ir después. Es la misma
-- lección que dejó escrita `20260929120000` al añadir `exento`.
--
-- Qué es una prórroga
-- -------------------
-- La universidad le da a un alumno la oportunidad de depositar la mitad ahora y
-- la otra mitad antes de una fecha. Hasta que no complete:
--
--   · **no se le genera el código de entrada y no pasa la puerta.** Es la
--     regla que puso la organización el 2026-10-02, y es la que hace que todo
--     esto sea sencillo: el estado nuevo cae del lado de «todavía no» en las
--     fronteras que ya existen, y ni el torniquete ni las constancias se tocan.
--   · sigue apareciendo en la lista de cobros pendientes de ventanilla, con lo
--     que le falta. Hoy un depósito incompleto DESAPARECE de esa lista, y ese
--     es el defecto que esto corrige.
--
-- El código que ya tiene para pagar no se toca: nunca fue el pase —está
-- rotulado solo para que en Aportaciones lo lean con la cámara— y lo necesita
-- justamente para ir a dejar el resto. Ver `components/pase.tsx`.
--
-- La prórroga es un permiso EXPLÍCITO, no una deducción
-- ----------------------------------------------------
-- Se guarda en el participante, con quién la autorizó y cuándo. Deducirla de
-- que alguien depositó de menos sería mezclarla con el error de ventanilla:
-- hoy «le dieron plazo» y «el cajero se equivocó» caerían en el mismo cajón
-- (`discrepancia`) y dentro de dos semanas nadie podría distinguirlos.
--
-- Por eso un depósito incompleto SIN prórroga autorizada sigue siendo lo que
-- era: una discrepancia que alguien tiene que resolver.
--
-- Solo el alumno
-- --------------
-- La organización la ofreció a los alumnos. El docente con constancia paga una
-- cuota propia y el externo paga la general, y abrirles la puerta a los tres
-- sin que nadie lo haya pedido es inventar una política. La restricción lo
-- impide en la base, no en la pantalla.
--
-- La fecha es un instante y no un día
-- -----------------------------------
-- `timestamptz`, igual que `configuracion_evento.fecha_limite`, y por el mismo
-- motivo: un `date` comparado contra `now()` vence a las 00:00 de la zona del
-- servidor, que aquí son las 18:00 del día anterior. Quien la autoriza elige el
-- final de ese día en su propia zona y lo que se guarda es ese instante.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Los dos valores nuevos
--
-- Son dos enums distintos y significan dos cosas distintas, aunque se llamen
-- igual:
--
--   · `resultado_pago.parcial` es de UNA FILA: «este depósito es un abono de
--     una prórroga autorizada», en vez de «este depósito no cuadra».
--   · `estado_pago.parcial` es del CONCEPTO entero: «hay dinero suyo, pero no
--     está completo». Lo deriva la vista sumando los abonos.
--
-- El orden importa poco —ninguna consulta ordena por el enum— pero se colocan
-- donde se leen: el estado entre «comprobante recibido» y «pagado», que es el
-- tramo que describe; el resultado junto a los otros dos.
-- ---------------------------------------------------------------------------
alter type estado_pago add value if not exists 'parcial' after 'comprobante_recibido';

alter type resultado_pago add value if not exists 'parcial' after 'pagado';

-- ---------------------------------------------------------------------------
-- 2 · Dónde vive el permiso
--
-- Las tres columnas van juntas o no van: una fecha sin autor no se puede
-- auditar, y un autor sin fecha no concede nada. La restricción de abajo lo
-- exige, además de reservarla al alumno.
--
-- `on delete set null` en el autor: si algún día se da de baja a quien la
-- autorizó, la prórroga sigue en pie —el alumno no tiene la culpa— y lo que se
-- pierde es solo el nombre, que para entonces ya está en la bitácora.
-- ---------------------------------------------------------------------------
alter table participantes
  add column if not exists prorroga_hasta timestamptz,
  add column if not exists prorroga_autoriza uuid references usuarios_internos (id) on delete set null,
  add column if not exists prorroga_en timestamptz;

comment on column participantes.prorroga_hasta is
  'Hasta cuándo puede completar el depósito, como instante. Nulo es lo normal: '
  'sin prórroga manda la fecha límite general del evento. Mientras no complete '
  'no se le genera el código de entrada y la puerta lo rechaza.';

comment on column participantes.prorroga_autoriza is
  'Quién la autorizó. La prórroga es un permiso explícito, no algo que se '
  'deduzca de un depósito incompleto: sin autor no se distingue de un error de '
  'ventanilla.';

comment on column participantes.prorroga_en is 'Cuándo se autorizó.';

alter table participantes drop constraint if exists chk_prorroga_solo_alumno;
alter table participantes
  add constraint chk_prorroga_solo_alumno
  check (
    (prorroga_hasta is null and prorroga_en is null)
    or (prorroga_hasta is not null and prorroga_en is not null and perfil = 'alumno')
  );

comment on constraint chk_prorroga_solo_alumno on participantes is
  'La prórroga es de los alumnos, y va completa: fecha y momento de la '
  'autorización. El docente paga su cuota propia y el externo la general; '
  'dársela a los tres sin que nadie lo haya pedido sería inventar una política.';

create index if not exists idx_participantes_prorroga
  on participantes (prorroga_hasta)
  where prorroga_hasta is not null;
