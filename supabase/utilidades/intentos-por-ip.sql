-- =============================================================================
-- Cuánto aprietan los topes por IP
--
-- Pégalo en el editor SQL. Solo LEE: no cambia nada.
--
-- Por qué hace falta
-- ------------------
-- `privado.limitar` —`20260908140000`— cuenta intentos por IP y lanza un 429 al
-- pasarse. Los topes vigentes son, cada uno en su ventana de diez minutos:
--
--   padron_existe       30     el reto de «¿estás en el padrón?»
--   padron_confirmar    10     la confirmación de identidad del alumno
--   ventana_matricula   30     cuándo le toca registrarse
--   abrir_caso_nombre   10     reportar el nombre mal escrito
--   evidencia           20     subir su comprobante
--   portal              40     consultar su estado
--   acceso              10     la puerta del personal (ventana de 15 minutos)
--
-- Esos números se pusieron pensando en un atacante enumerando el padrón. El día
-- del registro el que los agota es otro: **la fila**. La IP la toma
-- `privado.ip_solicitante()` de `cf-connecting-ip`, o sea la del alumno de
-- verdad, y todos los que entren por el WiFi de la universidad salen con la
-- misma IP pública. Con `padron_confirmar` en 10, el alumno número once de esa
-- red lee «demasiados intentos» sin haber hecho nada raro.
--
-- Esto no se ve desde fuera: el esquema `privado` no está expuesto en PostgREST
-- —solo `public` y `graphql_public`— así que ni `verificar-conexion` ni la clave
-- anónima pueden mirarlo. Hace falta el editor SQL.
--
-- Qué hacer con el resultado
-- --------------------------
-- La consulta 2 es la que decide. Si hay IPs que llegan al tope o lo rozan, los
-- topes hay que cambiarlos ANTES de abrir el registro a una cohorte grande. Si
-- todas las IPs están muy por debajo, el riesgo sigue siendo real pero todavía
-- no se ha materializado: significa que hasta ahora se ha registrado poca gente
-- a la vez, no que el techo aguante.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Qué hay guardado, y de cuándo
--
-- La tabla se purga sola: cada llamada borra lo anterior a la ventana más larga,
-- con un suelo de una hora. Así que «el más viejo» dice cuánta historia hay, y
-- casi nunca será de ayer.
-- ---------------------------------------------------------------------------
select
  count(*)                                                        as intentos_guardados,
  count(distinct ip)                                              as ips_distintas,
  to_char(min(ocurrido_en) at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as mas_viejo,
  to_char(max(ocurrido_en) at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as mas_reciente,
  to_char(now()            at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as ahora
from privado.intentos;

-- ---------------------------------------------------------------------------
-- 2 · Quién está pegando en el techo, ahora mismo
--
-- Cuenta lo que contaría `privado.limitar` si esa IP llamara en este instante:
-- su misma ventana y su mismo criterio. `alcanzado` es el 429 que esa persona ya
-- está recibiendo.
--
-- Se compara contra el tope de cada acción, escrito aquí a mano porque los topes
-- viven dentro del cuerpo de cada función y no en una tabla. Si se cambian, este
-- `values` hay que cambiarlo también — y esa duplicación es justamente lo que
-- habría que quitar si el limitador se rehace.
-- ---------------------------------------------------------------------------
with topes(accion, maximo, ventana) as (
  values
    ('padron_existe',     30, interval '10 minutes'),
    ('padron_confirmar',  10, interval '10 minutes'),
    ('ventana_matricula', 30, interval '10 minutes'),
    ('abrir_caso_nombre', 10, interval '10 minutes'),
    ('evidencia',         20, interval '10 minutes'),
    ('portal',            40, interval '10 minutes'),
    ('acceso',            10, interval '15 minutes')
)
select
  i.accion,
  -- La IP se enmascara: para decidir un tope basta saber que es UNA red, y el
  -- registro de intentos no tiene por qué salir de la base en claro.
  host(network(set_masklen(i.ip::cidr, case when family(i.ip) = 4 then 24 else 48 end))) as red,
  t.maximo                                    as tope,
  count(*)                                    as en_su_ventana,
  count(*) >= t.maximo                        as alcanzado,
  round(100.0 * count(*) / t.maximo)          as por_ciento_del_tope,
  count(distinct i.ip)                        as ips_en_esa_red,
  to_char(max(i.ocurrido_en) at time zone 'America/Mexico_City', 'HH24:MI:SS') as ultimo
from privado.intentos i
join topes t on t.accion = i.accion
where i.ocurrido_en > now() - t.ventana
group by i.accion, 2, t.maximo
order by por_ciento_del_tope desc, en_su_ventana desc;

-- ---------------------------------------------------------------------------
-- 3 · Cuántas IPs distintas por acción, con lo que queda guardado
--
-- Sirve para lo contrario que la 2: si una acción tiene MUCHAS IPs con pocos
-- intentos cada una, la gente está entrando con datos móviles y el tope estorba
-- poco. Si tiene POCAS IPs con muchos intentos, están saliendo todos por la
-- misma red y el tope es un muro.
-- ---------------------------------------------------------------------------
-- Se agrega en dos pasos y no con una subconsulta correlacionada: aquella
-- recorría la tabla entera una vez por fila, y esta la recorre una vez.
with por_ip as (
  select accion, ip, count(*) as n
    from privado.intentos
   group by accion, ip
)
select
  accion,
  sum(n)            as intentos,
  count(*)          as ips,
  round(avg(n), 1)  as intentos_por_ip,
  max(n)            as peor_ip
from por_ip
group by accion
order by intentos desc;

-- ---------------------------------------------------------------------------
-- 4 · El histograma de los últimos diez minutos, minuto a minuto
--
-- Para ver la FORMA de la carga: 60 intentos repartidos en diez minutos no
-- agotan nada, y los mismos 60 en un minuto sí. Cuando abra el registro de una
-- cohorte grande, esta consulta dice si llegó en ráfaga.
-- ---------------------------------------------------------------------------
select
  to_char(date_trunc('minute', ocurrido_en) at time zone 'America/Mexico_City', 'HH24:MI') as minuto,
  accion,
  count(*)           as intentos,
  count(distinct ip) as ips
from privado.intentos
where ocurrido_en > now() - interval '10 minutes'
group by 1, 2
order by 1 desc, intentos desc;

-- ---------------------------------------------------------------------------
-- 5 · Cuántos se pre-registraron de verdad, para comparar
--
-- Sin esto los números de arriba no se pueden interpretar: cinco intentos de
-- `padron_confirmar` con cinco participantes nuevos es el trámite funcionando;
-- cinco intentos sin ningún participante nuevo es gente que no llegó al final.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where creado_en > now() - interval '10 minutes') as ultimos_10_min,
  count(*) filter (where creado_en > now() - interval '1 hour')     as ultima_hora,
  count(*) filter (where creado_en::date = current_date)            as hoy,
  count(*)                                                         as en_total
from participantes;
