-- =============================================================================
-- Anular el segundo par (reintegro + su salida) de quien volvió a entrar
-- antes de las 9:30 am de hoy, día 2 (2026-10-16)
--
-- Pégalo en el editor SQL de Supabase. Corre PRIMERO la consulta 1, mira la
-- lista con calma, y solo si se ve bien corre la consulta 2. La 2 no borra
-- nada —"anular" en este sistema marca `anulada_en`/`anulacion_motivo`, nunca
-- borra la fila— así que si algo sale mal, se puede revertir a mano
-- reponiendo esas dos columnas a NULL en las filas que afectó.
--
-- Qué cuenta como "segundo par"
-- ------------------------------
-- Para cada persona, se ordenan sus entradas y salidas del día 2 por hora. La
-- tercera (orden 3) es su REINTEGRO —entró, salió, y volvió a entrar— y la
-- cuarta (orden 4) es la salida de ese reintegro, si ya la tiene. Se anulan
-- las DOS juntas, nunca solo una: dejar una salida sin su entrada (o al
-- revés) confunde al torniquete, que decide la dirección mirando el último
-- movimiento. La primera entrada y su primera salida (orden 1 y 2) NUNCA se
-- tocan aquí.
--
-- El filtro de las 9:30 se aplica sobre LA HORA DEL REINTEGRO (orden 3), no
-- sobre su salida: lo que se está corrigiendo es que esa persona no debió
-- haber vuelto a entrar tan temprano, y eso se decide por cuándo volvió a
-- entrar, no por cuándo volvió a salir.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · QUÉ SE VA A ANULAR — solo lee, no cambia nada
-- ---------------------------------------------------------------------------
with ordenados as (
  select
    a.id,
    a.participante_id,
    a.tipo,
    a.registrada_en,
    a.punto,
    row_number() over (
      partition by a.participante_id, a.dia
      order by a.registrada_en
    ) as orden
  from asistencias a
  where a.dia = 2
    and a.tipo in ('entrada', 'salida')
    and a.anulada_en is null
),
candidatos as (
  select participante_id
    from ordenados
   where orden = 3
     and (registrada_en at time zone 'America/Mexico_City')::time < time '09:30:00'
)
select
  p.folio,
  p.nombre,
  o.orden,
  o.tipo,
  o.punto,
  to_char(o.registrada_en at time zone 'America/Mexico_City', 'HH24:MI:SS') as hora_local
from ordenados o
join candidatos c on c.participante_id = o.participante_id
join participantes p on p.id = o.participante_id
where o.orden in (3, 4)
order by p.folio, o.orden;

-- ---------------------------------------------------------------------------
-- 2 · ANULAR — solo corre esto si la lista de arriba se ve bien
--
-- `anulada_por` queda en NULL porque el editor SQL no lleva tu sesión de
-- Auth —`auth.uid()` aquí no es nadie—. Si quieres que quede a tu nombre,
-- cambia el NULL por tu uuid de `usuarios_internos` antes de correrlo.
-- ---------------------------------------------------------------------------
with ordenados as (
  select
    a.id,
    a.participante_id,
    row_number() over (
      partition by a.participante_id, a.dia
      order by a.registrada_en
    ) as orden
  from asistencias a
  where a.dia = 2
    and a.tipo in ('entrada', 'salida')
    and a.anulada_en is null
),
candidatos as (
  select participante_id
    from ordenados
   where orden = 3
     and (registrada_en at time zone 'America/Mexico_City')::time < time '09:30:00'
)
update asistencias a
   set anulada_en = now(),
       anulada_por = null,
       anulacion_motivo =
         'Reintegro antes de las 9:30 am del día 2 (2026-10-16), anulado por administración '
         'tras revisión manual — corrección de datos, no un error de captura individual.'
  from ordenados o
 where o.id = a.id
   and o.participante_id in (select participante_id from candidatos)
   and o.orden in (3, 4);
