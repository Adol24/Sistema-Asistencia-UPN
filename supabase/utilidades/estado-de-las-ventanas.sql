-- =============================================================================
-- El estado de verdad de las ventanas de pre-registro
--
-- Pégalo en el editor SQL. Solo LEE: no cambia nada.
--
-- Por qué hace falta
-- ------------------
-- `estado-de-migraciones.sql` comprueba ESTRUCTURA —que una función exista, que
-- una columna esté, que una llave foránea ya no—. Las ventanas no son
-- estructura: son datos con fechas, y se editan desde `/admin/configuracion`.
-- Una migración puede estar perfectamente aplicada y la ventana que creó tener
-- otras fechas media hora después, sin que nada lo señale.
--
-- Y las ventanas no se ven desde fuera. `revoke all on all tables in schema
-- public from anon` sigue en pie y nadie concedió `ventanas_preregistro` al
-- anónimo, así que ni `verificar-conexion` ni `probar-sistema` pueden mirarlas.
-- Lo único observable desde la clave pública es `fn_motivo_fuera_de_ventana`,
-- que contesta por cohorte y de una en una: dice si alguien puede pasar, no por
-- qué ni con qué fechas.
--
-- Esto lo descubrió una discrepancia real, el 23 de septiembre por la noche:
-- `fn_motivo_fuera_de_ventana` dejaba pasar a semestre 7 y a módulo 13 cuando su
-- ventana estaba sembrada para abrir el 25. O sea que alguien movió las fechas,
-- y desde fuera no había forma de saber a qué.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Las ventanas, con sus fechas reales y su estado ahora mismo
-- ---------------------------------------------------------------------------
select
  v.etiqueta,
  to_char(v.abre   at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as abre,
  to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as cierra,
  case
    when now() < v.abre   then 'pendiente'
    when now() > v.cierra then 'cerrada'
    else 'ABIERTA AHORA'
  end as estado,
  (select count(*) from ventana_cohortes c where c.ventana_id = v.id) as cohortes,
  -- La hora de la base, en la misma zona, para poder comparar sin calcular.
  to_char(now() at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as ahora
from ventanas_preregistro v
order by v.abre;

-- ---------------------------------------------------------------------------
-- 2 · Qué generación entra en cada ventana
--
-- Una ventana sin cohortes está cargada y cerrada a la vez: existe, se ve en la
-- consulta de arriba, y no deja pasar a nadie. Es el estado más difícil de
-- notar, porque todo parece puesto.
-- ---------------------------------------------------------------------------
select
  v.etiqueta,
  p.nombre as programa,
  coalesce(p.etiqueta_avance, n.etiqueta_avance) as cuenta,
  c.avance
from ventana_cohortes c
join ventanas_preregistro v on v.id = c.ventana_id
join programas p on p.id = c.programa_id
join niveles_academicos n on n.id = p.nivel_id
order by v.abre, p.nombre, c.avance;

-- ---------------------------------------------------------------------------
-- 3 · Quién NO puede pre-registrarse hoy, y es la que hay que mirar
--
-- Existiendo al menos una ventana, toda cohorte que no esté declarada en alguna
-- queda bloqueada con «Todavía no se anuncia la fecha de registro para tu
-- grupo». Eso es correcto si esa generación no está invitada, y es un portazo
-- silencioso si lo está: nadie se entera salvo la persona que lo intenta.
-- ---------------------------------------------------------------------------
select
  p.nombre as programa,
  coalesce(p.etiqueta_avance, n.etiqueta_avance) as cuenta,
  a.avance
from programas p
join niveles_academicos n on n.id = p.nivel_id
cross join lateral generate_series(1, coalesce(p.total_avance, n.total_avance)) as a(avance)
where not exists (
  select 1 from ventana_cohortes c
   where c.programa_id = p.id and c.avance = a.avance
)
order by p.nombre, a.avance;

-- ---------------------------------------------------------------------------
-- 4 · Las ventanas por perfil, que son otra tabla
--
-- Docente y externo no tienen programa ni avance —`chk_alumno_completo` se lo
-- prohíbe— así que no pueden entrar por `ventana_cohortes`. Su plazo vive en
-- `ventana_perfiles`. Se listan aquí para tener las dos mitades en una sola
-- pasada: buscar una en un sitio y la otra en otro es cómo se cree que el
-- pre-registro está abierto cuando media audiencia lo tiene cerrado.
-- ---------------------------------------------------------------------------
select
  v.etiqueta,
  vp.perfil,
  to_char(v.abre   at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as abre,
  to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as cierra,
  case
    when now() < v.abre   then 'pendiente'
    when now() > v.cierra then 'cerrada'
    else 'ABIERTA AHORA'
  end as estado
from ventana_perfiles vp
join ventanas_preregistro v on v.id = vp.ventana_id
order by v.abre, vp.perfil;
