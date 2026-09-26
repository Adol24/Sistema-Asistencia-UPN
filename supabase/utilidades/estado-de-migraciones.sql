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
  ) as "20260923160000_la_salida_que_nadie_dio",

  /*
   * La ventana de primer semestre.
   *
   * Se comprueba que existan cohortes en avance 1, no que exista la fila de la
   * ventana: una ventana sin cohortes no deja pasar a nadie, así que estaría
   * «aplicada» y cerrada al mismo tiempo. Lo que hace falta saber es si esas
   * personas pueden registrarse, y eso lo dicen las cohortes.
   */
  exists (
    select 1
      from ventana_cohortes c
      join ventanas_preregistro v on v.id = c.ventana_id
     where v.etiqueta = 'El registro de primer semestre'
       and c.avance = 1
  ) as "20260923180000_la_ventana_de_primer_semestre",

  /*
   * El alta en mesa.
   *
   * Se piden las DOS mitades porque cada una sirve para algo distinto y una sin
   * la otra deja el trabajo a medias: la función es la puerta —sin ella no se
   * puede dar de alta a nadie— y la columna `autodeclarado` es lo que permite
   * encontrar esas filas cuando llegue el padrón real. Con la función y sin la
   * columna se crearían alumnos imposibles de contrastar.
   */
  (
    exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'fn_padron_alta_asistida'
    )
    and exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'padron_alumnos'
         and column_name = 'autodeclarado'
    )
  ) as "20260923200000_dar_de_alta_a_un_alumno_en_mesa",

  /*
   * El aforo deja de limitar el plan.
   *
   * Las DOS mitades, y aquí importa más que en ninguna: son la misma regla
   * repartida en dos funciones, y una sola aplicada es peor que ninguna.
   *
   *   1. `fn_dia_mas_vacio` pierde su `having count < cupo`. Lo que se busca es
   *      la AUSENCIA del techo, así que se pregunta por `having`: la función es
   *      de cinco líneas y no tiene ningún otro motivo para llevar uno.
   *   2. `fn_dia_de` pasa a contar `participantes` y no `padron_alumnos`. Se
   *      busca el join, que es la regla, y no la prosa del comentario, que
   *      alguien puede reescribir sin cambiar nada.
   *
   * Con la 1 sin la 2, un padrón que planea por encima del aforo hace que
   * `fn_preregistrar_alumno` le diga «ya no quedan lugares» a una persona real
   * con la sede medio vacía. Por eso el `and`: si sale `false`, mirar cuál de
   * las dos falta antes de tocar nada más.
   */
  (
    exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'fn_dia_mas_vacio'
         and pg_get_functiondef(p.oid) not like '%having%'
    )
    and exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'fn_dia_de'
         and pg_get_functiondef(p.oid) like '%left join participantes p on p.dia = d.dia%'
    )
  ) as "20260926120000_el_padron_planea_tambien_al_repartir";
