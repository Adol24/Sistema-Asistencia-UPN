-- =============================================================================
-- ¿Qué migraciones están puestas?
--
-- Nada lleva la cuenta: se aplican a mano en el editor SQL. Esto lo averigua
-- mirando la HUELLA de cada una —una columna, un índice, una llave que ya no
-- está, una frase dentro del cuerpo de una función— en vez de un registro que
-- nadie mantiene.
--
-- Están las últimas, y además las que el documento daba por aplicadas sin que
-- nadie pudiera comprobarlo. Esa prosa ya se equivocó una vez: el encabezado de
-- `un_alumno_no_es_externo` decía «sin aplicar» y sus reglas llevaban días
-- vivas. Una afirmación comprobable que nadie comprueba acaba siendo falsa sin
-- que se note, así que las que se puedan mirar, se miran aquí.
--
-- **Al escribir una migración nueva, añadirle aquí su huella.**
--
-- **Hay que correrlo con una sesión con permisos**, en el editor SQL del panel.
-- Desde el rol anónimo no sirve: una función revocada y una que no existe
-- contestan las dos 404, así que desde fuera no se distinguen.
--
-- Solo LECTURA. No escribe nada.
--
-- `true` = aplicada. `false` = falta.
--
-- Se etiqueta por MARCA DE TIEMPO + SLUG, no por ordinal, y no es manía.
-- En este repo el ordinal significa dos cosas distintas que ya no coinciden:
-- la posición en la carpeta (`ls supabase/migrations/*.sql | nl`) y el número
-- que cada archivo declara en su encabezado. Divergen desde
-- `20260921180000_publicar_lo_que_faltaba`, que no declara ninguno y comparte
-- marca de tiempo con el archivo anterior: de ahí en adelante, posición =
-- encabezado + 1.
--
-- O sea que «la 60» nombra dos migraciones distintas según quién lo diga. La
-- marca de tiempo es lo único único de verdad, es lo que ordena a Postgres y es
-- lo que usa `supabase db push`, así que es por donde se aplica y por donde se
-- comprueba. Ver «Los dos números» en MIGRACIONES.md.
-- =============================================================================

select
  /*
   * La 40 no se busca en su propia migración, sino en la función.
   *
   * Sus dos reglas viven dentro de `fn_preregistrar_externo`, y la 61 volvió a
   * crear esa función llevándoselas dentro. Así que lo que importa no es si el
   * archivo de la 40 llegó a correr, sino si las reglas están HOY en el cuerpo
   * que la base tiene puesto — que es lo único que protege a alguien.
   */
  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_preregistrar_externo'
       and pg_get_functiondef(p.oid) like '%ya está registrado como alumno%'
  ) as "20260917160000_un_alumno_no_es_externo",

  exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_evidencia_preparar'
       and pg_get_functiondef(p.oid) like '%perfil_participante%'
  ) as "20260923100000_solo_los_alumnos_entregan_evidencia",

  /*
   * Las dos que el documento daba por aplicadas y nadie podía comprobar.
   *
   * `verificar-conexion` corre con la clave anónima y las dos le quedan fuera:
   * `pg_indexes` no se expone y `pg_publication_tables` tampoco. Hasta ahora la
   * única garantía de que estaban puestas era una línea de prosa en
   * MIGRACIONES.md, y ya se vio lo que vale eso — el encabezado de
   * `un_alumno_no_es_externo` afirmó lo contrario de lo que había.
   */
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'uq_participante_sin_matricula'
  ) as "20260917140000_un_solo_preregistro_por_persona",

  not exists (
    select t.tabla
      from unnest(array[
             'casos_soporte', 'usuarios_internos', 'configuracion_evento',
             'dias_evento', 'bitacora', 'niveles_academicos',
             'programas', 'planteles'
           ]) as t(tabla)
     where not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t.tabla
     )
  ) as "20260921180000_publicar_lo_que_faltaba",

  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'v_talleres'
       and column_name = 'ocupados_previos'
  ) as "20260923120000_el_cupo_del_taller",

  not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'participantes'::regclass
       and c.confrelid = 'taller_dias'::regclass
       and c.contype = 'f'
  ) as "20260923140000_el_taller_no_depende_del_dia",

  not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_cierre_automatico'
  ) as "20260923160000_la_salida_que_nadie_dio";
