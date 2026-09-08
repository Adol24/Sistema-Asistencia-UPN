-- Cierra las funciones internas al público.
--
-- El problema
-- -----------
-- `20260907001600_permisos.sql` reparte los permisos con cuidado: unas funciones
-- para `anon`, otras solo para `authenticated`. Esa separación nunca estuvo en
-- vigor.
--
-- En PostgreSQL, `create function` concede `EXECUTE` a `PUBLIC` por defecto. Un
-- `grant execute ... to authenticated` no restringe nada: añade un permiso que
-- ya tenía todo el mundo. Nadie revocó el de origen, así que las funciones
-- «del personal» respondían a cualquiera con la clave publicable —que viaja en
-- el paquete JavaScript, como debe—.
--
-- Comprobado contra el proyecto real antes de escribir esto: una llamada anónima
-- a `fn_evaluar_escaneo`, documentada como solo para personal, devolvía 200 con
-- su resultado.
--
-- Trece funciones son `security definer`, o sea que se saltan las políticas de
-- fila. Entre ellas hay dos que ESCRIBEN —`fn_cierre_automatico` y
-- `fn_repartir_dias_pendientes`—, así que la exposición no era solo de lectura.
--
-- Lo que no se toca
-- -----------------
-- - Las funciones de disparador (`fn_validar_avance`, `fn_resultado_pago`,
--   `fn_aplicar_revision`, `fn_sincronizar_marca_nombre`). PostgreSQL comprueba
--   `EXECUTE` sobre ellas contra quien hace la escritura; revocarlas rompería
--   las altas legítimas.
-- - `tiene_rol` y `es_interno_activo`. Se invocan dentro de las políticas RLS
--   —43 veces entre ambas— y se evalúan como el rol que consulta.

-- ---------------------------------------------------------------------------
-- Del personal: fuera del alcance público.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  internas text[] := array[
    'fn_evaluar_escaneo',
    'fn_cierre_automatico',
    'fn_reasignar_dia',
    'fn_repartir_dias_pendientes',
    'fn_dia_de',
    'fn_buscar_en_padron'
  ];
begin
  -- Se recorre el catálogo en vez de escribir cada firma a mano: los tipos de
  -- los argumentos tendrían que repetirse exactos y una letra de más deja la
  -- función abierta sin que nadie lo note.
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (internas)
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Del participante: siguen abiertas, porque son su único camino. Cada una pide
-- una credencial o una matrícula, y las del padrón llevan límite por IP.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  publicas text[] := array[
    'fn_autenticar_portal',
    'fn_portal_estado',
    'fn_preregistrar_alumno',
    'fn_abrir_caso_nombre',
    'fn_padron_existe',
    'fn_padron_confirmar'
  ];
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (publicas)
  loop
    execute format('revoke all on function %s from public', f.firma);
    execute format('grant execute on function %s to anon, authenticated', f.firma);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Y que no vuelva a pasar: las funciones que se creen a partir de ahora no
-- nacen abiertas. Sin esto, la próxima función del personal repetiría el fallo
-- y el `grant` explícito seguiría dando una falsa sensación de haberlo cerrado.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;

comment on schema public is
  'Las funciones nuevas NO nacen ejecutables por PUBLIC: hay que conceder el '
  'permiso a mano. Ver 20260908160000_revocar_ejecucion_publica.sql.';
