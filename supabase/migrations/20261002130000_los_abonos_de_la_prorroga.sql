-- =============================================================================
-- Los abonos de la prórroga: la suma manda, y solo para quien la tiene
--
-- Esta migración es `20261002130000_los_abonos_de_la_prorroga`.
--
-- ⚠ Va DESPUÉS de `20261002120000_la_prorroga_del_alumno`, en otra corrida: usa
-- ⚠ los dos valores de enum que aquella añade, y Postgres no deja usar un valor
-- ⚠ nuevo en la misma transacción que lo crea.
--
-- Lo que cambia, y para quién
-- ---------------------------
-- Hasta hoy el estado de un concepto se deriva fila a fila: cada depósito vale
-- lo que vale comparado con lo esperado, y basta UNA discrepancia para que el
-- concepto quede en discrepancia para siempre —`bool_or`—. Con eso, dos abonos
-- de 250 contra 500 esperados dejan a esa persona en discrepancia aunque haya
-- pagado completo: sin constancia, fuera de la lista de cobros y sin forma de
-- desatascarla salvo reescribiendo una fila, que es falsificar el libro.
--
-- A partir de aquí, **para quien tiene una prórroga autorizada manda la SUMA de
-- sus abonos**. Para todos los demás no cambia absolutamente nada: la rama de
-- abajo es la misma expresión que había, carácter por carácter.
--
-- Esa separación no es timidez, es la forma de que esto se pueda aplicar a
-- catorce días del evento. Si la suma mandara para todo el mundo, dos filas de
-- 500 registradas por error —hoy «pagado»— pasarían a sumar 1 000 y a leerse
-- como discrepancia, y la puerta se le cerraría el día del evento a alguien que
-- sí pagó. Nadie sin prórroga puede cambiar de estado por esta migración.
--
-- Qué NO se toca, y es a propósito
-- --------------------------------
--   · `fn_evaluar_escaneo` admite `pagado`, `discrepancia` y `exento`, y
--     `parcial` no está en esa lista: la puerta lo rechaza sin tocar una línea.
--     Es justo la regla que pidió la organización.
--   · `v_elegibles` sigue exigiendo `pagado`, así que quien debe la mitad no
--     entra al listado de constancias hasta que complete.
--   · El código que el alumno ya tiene para pagar sigue dibujándose: nunca fue
--     el pase, y lo necesita para ir a dejar el resto.
--
-- Las dos comprobaciones del final verifican que esas dos reglas siguen donde
-- estaban.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0 · Que la anterior se haya aplicado
--
-- Sin los dos valores de enum, todo lo de abajo falla a media corrida y deja la
-- base con el disparador cambiado y la vista sin cambiar. Mejor no empezar.
-- ---------------------------------------------------------------------------
do $guardia$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'estado_pago' and e.enumlabel = 'parcial'
  ) then
    raise exception
      'Falta el valor «parcial» en el tipo estado_pago. Aplica primero, y en una corrida aparte, 20261002120000_la_prorroga_del_alumno.';
  end if;

  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'resultado_pago' and e.enumlabel = 'parcial'
  ) then
    raise exception
      'Falta el valor «parcial» en el tipo resultado_pago. Aplica primero, y en una corrida aparte, 20261002120000_la_prorroga_del_alumno.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_name = 'participantes' and column_name = 'prorroga_hasta'
  ) then
    raise exception
      'Falta la columna participantes.prorroga_hasta. Aplica primero 20261002120000_la_prorroga_del_alumno.';
  end if;
end;
$guardia$;

-- ---------------------------------------------------------------------------
-- 1 · Qué es cada depósito
--
-- El resultado sigue sin elegirlo quien captura: lo decide esta función
-- comparando importes. Lo único que se añade es una tercera respuesta.
--
--   · Cuadra con lo esperado          → `pagado`, como siempre.
--   · Falta, y hay prórroga           → `parcial`. Es un abono, no un error.
--   · Cualquier otra cosa             → `discrepancia`, como siempre. Ahí entra
--     también quien deposita de MÁS teniendo prórroga: pasarse no es abonar.
--
-- No se comprueba que la prórroga siga vigente, y es deliberado: si alguien
-- completa su depósito dos días tarde, ese dinero es un abono igual. Lo que
-- vence el día de la prórroga es el permiso para entrar, no la deuda, y de eso
-- se encarga la organización, no un disparador.
--
-- `security definer` para que la lectura del participante no dependa de qué rol
-- esté escribiendo el pago: si la fila no se pudiera leer, un abono legítimo se
-- marcaría como discrepancia y la persona volvería al atasco que esto arregla.
-- Solo lee una columna.
-- ---------------------------------------------------------------------------
create or replace function fn_resultado_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prorroga timestamptz;
begin
  if new.monto = new.monto_esperado then
    new.resultado := 'pagado'::resultado_pago;
    return new;
  end if;

  select pa.prorroga_hasta into v_prorroga
    from participantes pa
   where pa.id = new.participante_id;

  if v_prorroga is not null and new.monto < new.monto_esperado then
    new.resultado := 'parcial'::resultado_pago;
  else
    new.resultado := 'discrepancia'::resultado_pago;
  end if;

  return new;
end;
$$;

comment on function fn_resultado_pago is
  'Calcula `resultado` desde los montos, en cada insert y en CADA update. Desde '
  'el 2026-10-02 un depósito incompleto de quien tiene prórroga autorizada es '
  '«parcial» —un abono— en vez de «discrepancia» —un error—. Sin prórroga, la '
  'regla es la de siempre.';

-- ---------------------------------------------------------------------------
-- 2 · El estado del concepto
--
-- Tres ramas, y las dos primeras son las de antes:
--
--   · Sin una sola fila de pago, lo mismo que decidía: exento si no debe nada,
--     expirado si se pasó la fecha, y si no, pre-registrado. Lo único nuevo es
--     que la fecha que vence es la de SU prórroga cuando la tiene.
--   · Con filas y sin prórroga, la expresión de siempre, intacta.
--   · Con filas y con prórroga, manda la suma.
--
-- El orden de las ramas importa: «sin filas» va primero porque con cero abonos
-- y cero esperado la suma también daría cero, y un exento saldría «pagado».
-- ---------------------------------------------------------------------------
create or replace view v_estado_pago as
select
  p.id as participante_id,
  c.concepto,
  case
    when count(g.id) = 0 then
      case
        when x.esperado = 0 then 'exento'::estado_pago
        when now() > coalesce(p.prorroga_hasta, e.fecha_limite) then 'expirado'::estado_pago
        else 'pre_registrado'::estado_pago
      end
    when p.prorroga_hasta is null then
      case
        when bool_or(g.resultado = 'discrepancia') then 'discrepancia'::estado_pago
        when bool_or(g.resultado = 'pagado') then 'pagado'::estado_pago
        else 'comprobante_recibido'::estado_pago
      end
    when sum(g.monto) > x.esperado then 'discrepancia'::estado_pago
    when sum(g.monto) = x.esperado then 'pagado'::estado_pago
    else 'parcial'::estado_pago
  end as estado
from participantes p
cross join (values ('evento'::concepto_pago), ('taller'::concepto_pago)) as c (concepto)
cross join configuracion_evento e
cross join lateral (
  select case c.concepto
           when 'evento' then p.monto_esperado_evento
           else p.monto_esperado_taller
         end as esperado
) x
left join pagos g on g.participante_id = p.id and g.concepto = c.concepto
where c.concepto = 'evento' or p.taller_id is not null
group by p.id, c.concepto, e.fecha_limite, x.esperado;

comment on view v_estado_pago is
  'El estado de pago no se guarda: se deriva. Deliberadamente SIN '
  'security_invoker: es la única forma de que el capturista sepa quién pagó sin '
  'poder leer importes ni referencias; cambiarlo deja la puerta en rojo para '
  'todos. Devuelve «exento» cuando no debe nada y no ha depositado, y desde el '
  '2026-10-02 «parcial» cuando hay una prórroga autorizada y los abonos todavía '
  'no suman lo esperado. Para quien no tiene prórroga la regla es la de '
  'siempre, fila a fila.';

-- ---------------------------------------------------------------------------
-- 2b · Que el alumno pueda ver su propia fecha
--
-- `v_participantes` es por donde el portal lee su expediente, y sin esta
-- columna la pantalla no tendría con qué decirle «te falta la mitad, antes
-- del 13». Eso no es un adorno: con esta política, quien no complete se queda
-- FUERA en la puerta, y el único momento barato de evitar ese disgusto es
-- ahora, en su pantalla.
--
-- La columna va al FINAL de la lista a propósito: `create or replace view`
-- solo admite añadir columnas por el final, y mover una de sitio obligaría a
-- tirar la vista con todo lo que cuelga de ella.
-- ---------------------------------------------------------------------------
create or replace view v_participantes
with (security_invoker = true) as
select
  p.id,
  p.folio,
  p.perfil,
  p.matricula,
  p.nombre,
  p.nombre_en_revision,
  p.correo,
  p.celular,
  p.institucion,
  n.nivel,
  pr.nombre as programa,
  p.avance,
  n.etiqueta_avance,
  p.grupo,
  pl.nombre as plantel,
  p.dia,
  d.fecha as fecha_dia,
  -- La sede sale del día, no de una copia guardada en el participante.
  d.sede,
  p.taller_id,
  t.clave as taller_clave,
  t.nombre as taller_nombre,
  p.monto_esperado_evento,
  p.monto_esperado_taller,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'evento')
    as estado_pago_evento,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'taller')
    as estado_pago_taller,
  p.creado_en,
  p.acepto_aviso_en,
  p.prorroga_hasta
from participantes p
join dias_evento d on d.dia = p.dia
left join niveles_academicos n on n.id = p.nivel_id
left join programas pr on pr.id = p.programa_id
left join planteles pl on pl.id = p.plantel_id
left join talleres t on t.id = p.taller_id;

alter view v_participantes set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 3 · Autorizar la prórroga
--
-- La da Servicios Financieros al recibir el primer abono, o administración. El
-- capturista no: él mueve asistencias. El revisor tampoco: él mueve evidencias.
--
-- Por folio, que es lo que una persona puede dictar en la ventanilla y lo que
-- queda legible en la bitácora.
-- ---------------------------------------------------------------------------
create or replace function fn_autorizar_prorroga(p_folio text, p_hasta timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_id uuid;
  v_nombre text;
  v_perfil participantes.perfil%type;
  v_antes timestamptz;
begin
  if not tiene_rol(array['admin', 'financieros']::rol_interno[]) then
    raise exception 'Solo administración y Servicios Financieros pueden autorizar una prórroga'
      using errcode = 'insufficient_privilege';
  end if;

  if v_folio = '' then
    raise exception 'Falta el folio' using errcode = 'check_violation';
  end if;

  if p_hasta is null then
    raise exception 'Falta la fecha hasta la que se le da plazo'
      using errcode = 'check_violation';
  end if;

  -- Una prórroga que ya venció no es una prórroga: es un registro que nace
  -- caducado y que nadie puede cumplir.
  if p_hasta <= now() then
    raise exception 'Esa fecha ya pasó: la prórroga tiene que vencer después de hoy'
      using errcode = 'check_violation';
  end if;

  select pa.id, pa.nombre, pa.perfil, pa.prorroga_hasta
    into v_id, v_nombre, v_perfil, v_antes
    from participantes pa
   where pa.folio = v_folio;

  if v_id is null then
    raise exception 'No hay ningún participante con el folio %', v_folio
      using errcode = 'no_data_found';
  end if;

  if v_perfil <> 'alumno' then
    raise exception 'La prórroga es solo para alumnos, y % no lo es', v_folio
      using errcode = 'check_violation';
  end if;

  update participantes
     set prorroga_hasta = p_hasta,
         prorroga_autoriza = auth.uid(),
         prorroga_en = now()
   where id = v_id;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    case when v_antes is null then 'Autorizó una prórroga de pago'
         else 'Cambió la fecha de una prórroga' end,
    format('%s · %s · hasta %s', v_folio, v_nombre, to_char(p_hasta, 'YYYY-MM-DD HH24:MI'))
  );

  return jsonb_build_object('folio', v_folio, 'hasta', p_hasta);
end;
$$;

comment on function fn_autorizar_prorroga is
  'Le da plazo a un alumno para completar su depósito. Mientras no complete, su '
  'concepto queda en «parcial»: no se le genera el código de entrada y la '
  'puerta lo rechaza, pero sigue en la lista de cobros pendientes. Solo admin y '
  'Servicios Financieros, y solo alumnos.';

revoke all on function fn_autorizar_prorroga(text, timestamptz) from public, anon;
grant execute on function fn_autorizar_prorroga(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Quitarla
--
-- Solo mientras no haya un peso suyo registrado. Con abonos ya escritos,
-- quitarle el permiso dejaría esas filas marcadas como abonos de una prórroga
-- que no existe, y el concepto entero volvería a leerse por la regla vieja: dos
-- abonos de 250 pasarían a «comprobante recibido» y el dinero dejaría de
-- contarse. Si de verdad hay que deshacerlo, primero se resuelven los pagos.
-- ---------------------------------------------------------------------------
create or replace function fn_quitar_prorroga(p_folio text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_id uuid;
  v_nombre text;
  v_pagos integer;
begin
  if not tiene_rol(array['admin', 'financieros']::rol_interno[]) then
    raise exception 'Solo administración y Servicios Financieros pueden quitar una prórroga'
      using errcode = 'insufficient_privilege';
  end if;

  select pa.id, pa.nombre into v_id, v_nombre
    from participantes pa
   where pa.folio = v_folio;

  if v_id is null then
    raise exception 'No hay ningún participante con el folio %', v_folio
      using errcode = 'no_data_found';
  end if;

  select count(*) into v_pagos from pagos g where g.participante_id = v_id;

  if v_pagos > 0 then
    raise exception 'No se puede quitar la prórroga de %: ya tiene % pago(s) registrados', v_folio, v_pagos
      using errcode = 'check_violation';
  end if;

  update participantes
     set prorroga_hasta = null, prorroga_autoriza = null, prorroga_en = null
   where id = v_id;

  insert into bitacora (usuario_id, accion, detalle)
  values (auth.uid(), 'Quitó una prórroga de pago', format('%s · %s', v_folio, v_nombre));

  return jsonb_build_object('folio', v_folio);
end;
$$;

comment on function fn_quitar_prorroga is
  'Retira el plazo de un alumno que todavía no ha depositado nada. Con abonos '
  'registrados se niega: quitarla dejaría ese dinero sin forma de leerse.';

revoke all on function fn_quitar_prorroga(text) from public, anon;
grant execute on function fn_quitar_prorroga(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Que la puerta y las constancias sigan donde estaban
--
-- Las dos reglas que esta migración promete NO tocar, comprobadas leyendo la
-- base y no el comentario de arriba.
-- ---------------------------------------------------------------------------
do $comprobar$
declare
  v_con_prorroga integer;
begin
  if (select pg_get_viewdef('v_estado_pago'::regclass)) not like '%parcial%' then
    raise exception 'v_estado_pago no quedó con la rama de parcial';
  end if;

  if (select pg_get_functiondef('fn_evaluar_escaneo'::regproc))
     not like '%not in (''pagado'', ''discrepancia'', ''exento'')%' then
    raise exception
      'fn_evaluar_escaneo ya no rechaza lo que no sea pagado, discrepancia o exento. Con parcial fuera de esa lista era como la puerta negaba la entrada a quien debe la mitad.';
  end if;

  if (select pg_get_viewdef('v_elegibles'::regclass)) not like '%= ''pagado''%' then
    raise exception
      'v_elegibles dejó de exigir pagado. Es lo que impide que quien debe la mitad entre al listado de constancias.';
  end if;

  select count(*) into v_con_prorroga
    from participantes where prorroga_hasta is not null;

  raise notice 'Prórrogas vigentes ahora mismo: %', v_con_prorroga;
end;
$comprobar$;
