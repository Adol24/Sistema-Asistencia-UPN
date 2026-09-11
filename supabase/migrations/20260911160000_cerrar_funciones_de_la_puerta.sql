-- =============================================================================
-- Las funciones nuevas de la puerta quedaron abiertas al público
--
-- Qué pasaba
-- ----------
-- `20260911120000_puerta_como_torniquete` creó `fn_esta_dentro` y volvió a crear
-- `fn_evaluar_escaneo` con otra firma, y las cerró así:
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- Eso no alcanza en Supabase. `anon` es un rol con nombre propio y con su propia
-- concesión: quitarle el permiso a PUBLIC no le quita el suyo. Y como
-- `fn_evaluar_escaneo` cambió de firma, para PostgreSQL es una función nueva que
-- nace con las concesiones por defecto, no la vieja que ya estaba cerrada.
--
-- Resultado: cualquiera con la clave publicable podía preguntarle a la base si
-- un folio existe, si está pagado y si esa persona está dentro del recinto. Es
-- exactamente el agujero que cerró `20260908160000_revocar_ejecucion_publica`,
-- reabierto por una migración posterior que copió mal el remedio.
--
-- Cómo se detectó
-- ---------------
-- Con `bun run verificar-conexion`, que pregunta a la base en vez de leer los
-- archivos. Una migración se da por aplicada cuando la base contesta lo que
-- debe, no cuando el archivo existe.
--
-- Cómo se evita la próxima vez
-- ----------------------------
-- Se recorre el catálogo en lugar de escribir las firmas a mano, igual que la
-- migración de seguridad original: repetir los tipos de los argumentos exactos
-- es justo donde se cuela el error, y una letra de más deja la función abierta
-- sin que nadie lo note.
-- =============================================================================

do $$
declare
  f record;
  internas text[] := array[
    -- Nuevas o recreadas por la migración de la puerta.
    'fn_evaluar_escaneo',
    'fn_esta_dentro',
    -- `create or replace` conserva las concesiones, así que esta ya debería
    -- estar bien. Se incluye porque comprobarlo cuesta menos que confiarlo.
    'fn_cierre_automatico'
  ];
begin
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
