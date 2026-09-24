-- =============================================================================
-- ¿Cuáles de las últimas migraciones están puestas?
--
-- Nada lleva la cuenta: se aplican a mano en el editor SQL. Esto lo averigua
-- mirando la HUELLA de cada una —una columna, una llave que ya no está, una
-- función que ya no existe— en vez de un registro que nadie mantiene.
--
-- **Hay que correrlo con una sesión con permisos**, en el editor SQL del panel.
-- Desde el rol anónimo no sirve: una función revocada y una que no existe
-- contestan las dos 404, así que desde fuera no se distinguen.
--
-- Solo LECTURA. No escribe nada.
--
-- `true` = aplicada. `false` = falta.
-- =============================================================================

select
  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_evidencia_preparar'
       and pg_get_functiondef(p.oid) like '%perfil_participante%'
  ) as "59_solo_alumnos_entregan_evidencia",

  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'v_talleres'
       and column_name = 'ocupados_previos'
  ) as "60_cupo_del_taller",

  not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'participantes'::regclass
       and c.confrelid = 'taller_dias'::regclass
       and c.contype = 'f'
  ) as "61_taller_no_depende_del_dia",

  not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_cierre_automatico'
  ) as "62_la_salida_que_nadie_dio";
