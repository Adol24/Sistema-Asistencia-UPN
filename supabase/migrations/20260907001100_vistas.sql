-- =============================================================================
-- 1100 · Vistas derivadas
--
-- Lo que se calcula no se guarda. El estado de pago sale de los pagos, el cupo
-- de un taller sale de sus inscritos y la elegibilidad sale de las tres
-- condiciones. Guardarlos duplicaría la verdad, y dos verdades que se
-- contradicen no sirven para decidir nada.
-- =============================================================================

-- ---------------------------------------------------- estado de los pagos ---
-- Un participante tiene un estado por concepto. El orden de los CASE importa:
-- una discrepancia pesa más que un pago completo del mismo concepto, porque es
-- lo que hay que resolver.
create view v_estado_pago as
select
  p.id as participante_id,
  c.concepto,
  case
    when bool_or(g.resultado = 'discrepancia') then 'discrepancia'::estado_pago
    when bool_or(g.resultado = 'pagado') then 'pagado'::estado_pago
    when count(g.id) > 0 then 'comprobante_recibido'::estado_pago
    when now() > e.fecha_limite then 'expirado'::estado_pago
    else 'pre_registrado'::estado_pago
  end as estado
from participantes p
cross join (values ('evento'::concepto_pago), ('taller'::concepto_pago)) as c (concepto)
cross join configuracion_evento e
left join pagos g on g.participante_id = p.id and g.concepto = c.concepto
where c.concepto = 'evento' or p.taller_id is not null
group by p.id, c.concepto, e.fecha_limite;

comment on view v_estado_pago is
  'El estado de pago no se guarda: se deriva. Un estado guardado y un pago registrado acaban contradiciéndose.';

-- ------------------------------------------------------------ el listado ---
create view v_participantes as
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
  p.creado_en
from participantes p
join dias_evento d on d.dia = p.dia
left join niveles_academicos n on n.id = p.nivel_id
left join programas pr on pr.id = p.programa_id
left join planteles pl on pl.id = p.plantel_id
left join talleres t on t.id = p.taller_id;

-- ---------------------------------------------------------------- cupos ---
create view v_talleres as
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
group by t.id;

comment on view v_talleres is
  'El cupo ocupado se cuenta, no se guarda: un contador guardado se desincroniza al primer error.';

-- ---------------------------------------------------------- elegibilidad ---
-- Las tres condiciones, contadas por separado para que la pantalla pueda decir
-- exactamente cuál falta en vez de un «no cumple» sin explicación.
create view v_elegibles as
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
  coalesce(asi.tiene_salida, false) as tiene_salida,
  coalesce(ev.aprobadas, 0) as evidencias_aprobadas,
  ep.estado as estado_pago_evento,
  p.nombre_en_revision,
  (
    ep.estado = 'pagado'
    and coalesce(asi.tiene_entrada, false)
    and coalesce(asi.tiene_salida, false)
    and coalesce(ev.aprobadas, 0) >= 2
  ) as elegible
from participantes p
join v_estado_pago ep on ep.participante_id = p.id and ep.concepto = 'evento'
left join asistencia asi on asi.participante_id = p.id
left join evidencia ev on ev.participante_id = p.id;

comment on view v_elegibles is
  'Pagó, entró y salió su día, y tiene dos evidencias aprobadas de los otros dos.';

-- ----------------------------------------------------- reparto por días ---
create view v_reparto_dias as
select
  d.dia,
  d.sede,
  count(a.matricula) as alumnos
from dias_evento d
left join padron_alumnos a on a.dia = d.dia
group by d.dia, d.sede
union all
select
  null,
  'Sin día asignado',
  count(*)
from padron_alumnos
where dia is null;

-- --------------------------------------------------------- duplicados ---
-- Dos alumnos que suben la misma foto es el intento más común. La vista los pone
-- uno junto al otro para que el revisor decida en segundos.
create view v_evidencias_duplicadas as
select
  e.hash_archivo,
  count(*) as veces,
  array_agg(e.id order by e.subida_en) as evidencias,
  array_agg(p.folio order by e.subida_en) as folios,
  array_agg(p.nombre order by e.subida_en) as nombres
from evidencias e
join participantes p on p.id = e.participante_id
where e.hash_archivo is not null
group by e.hash_archivo
having count(*) > 1;
