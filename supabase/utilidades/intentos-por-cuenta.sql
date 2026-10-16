-- =============================================================================
-- Cuánto aprieta el límite de `acceso`, por cuenta
--
-- Pégalo en el editor SQL. Solo LEE: no cambia nada.
--
-- Por qué hace falta
-- ------------------
-- Desde `20261015190000`, `fn_perfil_interno` (la puerta del personal) ya no
-- cuenta por IP: cuenta por CUENTA, en `privado.intentos_por_cuenta`. El
-- motivo fue un evento real con seis puntos de captura detrás del mismo
-- enlace —Starlink—, donde las seis cuentas se repartían el mismo cupo de
-- diez cada quince minutos y se bloqueaban entre ellas sin que ninguna
-- aporreara nada.
--
-- Esta consulta es la hermana de `intentos-por-ip.sql` pero para esa tabla:
-- dice qué CUENTA está pegada al tope en este momento, no qué red.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Qué hay guardado, y de cuándo
-- ---------------------------------------------------------------------------
select
  count(*)                                                        as intentos_guardados,
  count(distinct sujeto)                                          as cuentas_distintas,
  to_char(min(ocurrido_en) at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as mas_viejo,
  to_char(max(ocurrido_en) at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as mas_reciente,
  to_char(now()            at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as ahora
from privado.intentos_por_cuenta;

-- ---------------------------------------------------------------------------
-- 2 · Quién está pegando en el techo, ahora mismo
--
-- Cuenta lo que contaría `privado.limitar_por_cuenta` si esa cuenta llamara en
-- este instante. `alcanzado` es el 429 que esa persona ya está recibiendo.
-- El tope de `acceso` (10 / 15 min) va escrito a mano por la misma razón que
-- en `intentos-por-ip.sql`: vive en el cuerpo de la función, no en una tabla.
-- ---------------------------------------------------------------------------
select
  u.nombre,
  u.correo,
  u.rol,
  10                                           as tope,
  count(*)                                     as en_su_ventana,
  count(*) >= 10                               as alcanzado,
  round(100.0 * count(*) / 10)                 as por_ciento_del_tope,
  to_char(max(i.ocurrido_en) at time zone 'America/Mexico_City', 'HH24:MI:SS') as ultimo
from privado.intentos_por_cuenta i
join usuarios_internos u on u.id = i.sujeto
where i.accion = 'acceso'
  and i.ocurrido_en > now() - interval '15 minutes'
group by u.nombre, u.correo, u.rol
order by por_ciento_del_tope desc, en_su_ventana desc;
