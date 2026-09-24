-- =============================================================================
-- Docentes y participantes externos: del 29 al 30 de septiembre de 2026
--
-- Qué hace
-- --------
-- Crea UNA ventana de pre-registro y le cuelga los dos perfiles sin padrón.
-- A partir de que esto corra, un docente o un externo que llegue antes del 29
-- lee «El registro previo para docentes y participantes externos abre el
-- 29/09/2026. Vuelve ese día para completar tu registro», y el disparador de
-- `participantes` no deja escribir su fila.
--
-- No es una migración: es un DATO. Por eso vive en `utilidades/` y no en
-- `migrations/`. Lo mismo se puede hacer desde /admin/configuracion.
--
-- Por qué los DOS perfiles en la misma ventana, y no solo docentes
-- ----------------------------------------------------------------
-- Hoy `ventana_perfiles` está vacía, y mientras lo esté
-- `fn_motivo_fuera_de_ventana_perfil` devuelve `null` para todos: docentes y
-- externos entran cuando quieran. Pero en cuanto exista UNA SOLA fila, el
-- perfil que no aparezca en ninguna ventana cae en el `if not found` y recibe
--
--   «Todavía no se anuncia la fecha de registro para participantes externos.
--    Escríbenos y te avisamos en cuanto se abra.»
--
-- que es un bloqueo SIN FECHA y sin salida. O sea que abrirle la puerta a los
-- docentes se la cierra a los externos, aunque nadie lo pidiera. Van juntos
-- porque cargar solo uno no es «hacer la mitad»: es cerrarle a la otra mitad.
--
-- Los alumnos no se tocan. Su ventana va por `ventana_cohortes` —los invita por
-- generación, programa más avance— y el interruptor de la 49 mide cada
-- audiencia con las ventanas que hablan de ella. La suya sigue como estaba:
-- del 21 al 27 de septiembre.
--
-- Las horas
-- ---------
-- Se escriben en hora del centro de México y Postgres las guarda en UTC, igual
-- que la ventana de alumnos que ya está cargada. Abre a las 00:00 del 29 y
-- cierra a las 23:59:59 del 30, así que el día 30 cuenta entero.
--
-- Correrlo dos veces no duplica nada: comprueba antes de insertar.
-- =============================================================================

do $$
declare
  v_id uuid;
  v_etiqueta constant text :=
    'El registro previo para docentes y participantes externos';
  v_abre constant timestamptz :=
    '2026-09-29 00:00:00'::timestamp at time zone 'America/Mexico_City';
  v_cierra constant timestamptz :=
    '2026-09-30 23:59:59'::timestamp at time zone 'America/Mexico_City';
begin
  select id into v_id from ventanas_preregistro where etiqueta = v_etiqueta;

  if v_id is null then
    insert into ventanas_preregistro (etiqueta, abre, cierra)
         values (v_etiqueta, v_abre, v_cierra)
      returning id into v_id;
    raise notice 'Ventana creada: % (%)', v_etiqueta, v_id;
  else
    update ventanas_preregistro
       set abre = v_abre, cierra = v_cierra
     where id = v_id;
    raise notice 'Ventana ya existía: fechas actualizadas (%)', v_id;
  end if;

  -- Los dos perfiles, sin duplicar si ya estaban.
  insert into ventana_perfiles (ventana_id, perfil)
       values (v_id, 'docente'), (v_id, 'externo')
  on conflict do nothing;

  raise notice 'Docentes y externos abren el 29/09/2026 y cierran el 30/09/2026.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Comprobación. Debe devolver una fila por perfil, las dos con la misma
-- ventana, y `estado` en «pendiente» si se corre antes del 29.
-- ---------------------------------------------------------------------------
select
  vp.perfil,
  v.etiqueta,
  to_char(v.abre   at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as abre,
  to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') as cierra,
  case
    when now() < v.abre   then 'pendiente'
    when now() > v.cierra then 'cerrada'
    else 'abierta'
  end as estado
  from ventana_perfiles vp
  join ventanas_preregistro v on v.id = vp.ventana_id
 order by vp.perfil;
