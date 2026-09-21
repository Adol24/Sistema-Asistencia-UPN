-- =============================================================================
-- Tiempo real: las cuatro tablas que se quedaron fuera
--
-- `20260910140000_tiempo_real.sql` publicó trece tablas y resolvió lo urgente:
-- que dos ventanillas no cobren a la misma persona, que un folio recién creado
-- se pueda escanear. Pero la lista se armó con las pantallas que había
-- entonces, y cuatro tablas que el panel sí lee se quedaron fuera. Sus cambios
-- no llegan a ninguna pestaña abierta, y nada lo delata: la pantalla no dice
-- «esto está viejo», simplemente enseña lo de antes.
--
-- bitacora
--   La única pantalla que existe para consultarla acaba de empezar a leerla de
--   la base. Sin publicarla, una anotación de OTRA persona —el cobro de la
--   ventanilla de al lado, la baja de un usuario— no aparece hasta recargar, y
--   un registro de auditoría que llega tarde se consulta tarde.
--
-- niveles_academicos, programas
--   El catálogo académico contra el que se valida el padrón. Quien da de alta
--   un programa nuevo en `/admin/configuracion` lo ve al instante; quien está
--   importando el padrón en otra máquina sigue con el catálogo viejo y su
--   archivo se rechaza entero con «programa desconocido» por un programa que
--   ya existe. Ese error no se parece en nada a su causa.
--
-- planteles
--   Las sedes, que el padrón también valida. Mismo caso y mismo mensaje
--   engañoso: «sede desconocida» de una sede dada de alta hace un minuto.
--
-- Lo que NO se publica
-- --------------------
-- `ventanas_preregistro` y `ventana_cohortes` existen pero ningún cliente las
-- lee: la regla la aplica un disparador y se consulta con
-- `fn_ventana_de_matricula`. Publicar una tabla que nadie escucha solo cuesta
-- WAL. Cuando alguna pantalla las lea, se añaden aquí.
--
-- La seguridad no cambia
-- ----------------------
-- Realtime evalúa las políticas de fila de quien escucha antes de entregarle
-- nada. `bitacora_lectura` sigue siendo de administración y soporte, así que a
-- un capturista no le llega una anotación aunque la tabla esté publicada. Las
-- otras tres son catálogo público —el cartel del evento— y ya se leen sin
-- sesión.
--
-- Sobre `replica identity`
-- ------------------------
-- Ninguna la necesita. `bitacora` no tiene política de UPDATE ni de DELETE —es
-- inmutable a propósito— así que solo emite INSERT, que viaja completo. Y las
-- políticas de los tres catálogos no miran columnas: son `using (true)`, de
-- modo que Realtime puede evaluarlas con la llave primaria sola.
-- =============================================================================

do $$
declare
  t text;
  publicadas text[] := array[
    'bitacora',
    'niveles_academicos',
    'programas',
    'planteles'
  ];
begin
  foreach t in array publicadas loop
    -- Se comprueba antes de añadir, igual que en la migración original:
    -- `alter publication ... add table` falla si la tabla ya está, y esta
    -- migración tiene que poder volver a ejecutarse.
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
