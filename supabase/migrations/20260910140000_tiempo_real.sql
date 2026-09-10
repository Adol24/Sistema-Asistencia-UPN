-- =============================================================================
-- Tiempo real: publicar los cambios que las pantallas tienen que ver llegar
--
-- Hasta ahora cada pantalla trabajaba con una foto: se cargaba todo al iniciar
-- sesión y no se volvía a pedir. Eso producía errores que parecían de otra cosa
-- —escanear el código de alguien recién pre-registrado respondía «ese folio no
-- existe»— y, peor, dos ventanillas podían cobrarle a la misma persona sin que
-- ninguna viera el cobro de la otra.
--
-- Supabase entrega los cambios por WebSocket, pero solo de las tablas que estén
-- en la publicación `supabase_realtime`. Esto las añade.
--
-- La seguridad no cambia
-- ----------------------
-- Realtime evalúa las políticas de fila de quien escucha, con su propia
-- credencial, antes de entregarle nada. Publicar una tabla no la abre: a un
-- capturista le seguirán sin llegar los pagos, porque `pagos_lectura` es de
-- administración, financieros y soporte. Y el anónimo no escucha nada, porque
-- `revoke all on all tables ... from anon` sigue en pie: el portal del
-- participante se mantiene al día preguntando por su propia función, que es su
-- único camino.
--
-- Por qué `replica identity full` solo en algunas
-- ----------------------------------------------
-- Sin ella, el borrado y la actualización viajan solo con la llave primaria, y
-- Realtime no puede evaluar las políticas de fila sobre lo que no recibe: el
-- evento se descarta y el cambio no llega. Se pone donde el borrado o la
-- actualización importan de verdad y donde la política mira columnas que no son
-- la llave. Cuesta más WAL, así que no se pone por costumbre.
-- =============================================================================

do $$
declare
  t text;
  publicadas text[] := array[
    'participantes',
    'pagos',
    'asistencias',
    'evidencias',
    'revisiones',
    'avisos_participante',
    'padron_alumnos',
    'talleres',
    'taller_dias',
    'configuracion_evento',
    'dias_evento',
    'usuarios_internos',
    'casos_soporte'
  ];
begin
  foreach t in array publicadas loop
    -- Se comprueba antes de añadir: `alter publication ... add table` falla si
    -- la tabla ya está, y esta migración tiene que poder volver a ejecutarse.
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

-- Aquí el borrado y la actualización sí tienen que llegar completos: quitar a
-- alguien de un taller, anular una asistencia o dar de baja a un usuario son
-- cambios que las pantallas abiertas deben ver, y sus políticas miran columnas
-- distintas de la llave primaria.
alter table asistencias replica identity full;
alter table participantes replica identity full;
alter table taller_dias replica identity full;
alter table usuarios_internos replica identity full;

comment on publication supabase_realtime is
  'Las tablas cuyos cambios las pantallas abiertas deben ver llegar. Realtime '
  'aplica las políticas de fila de quien escucha, así que publicar no abre nada.';
