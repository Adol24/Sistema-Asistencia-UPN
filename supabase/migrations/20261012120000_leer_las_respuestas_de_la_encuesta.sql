-- =============================================================================
-- 1200 · Leer las respuestas de la encuesta
--
-- `encuesta_respuestas` nació en la migración `20261002140000` con RLS
-- activado y SIN ninguna política: bloqueada para anon y para authenticated
-- por igual, a propósito, porque la única puerta de escritura es la función
-- `security definer` `fn_evaluar_conferencia`. Pero eso también le bloqueaba
-- la lectura al personal, y la coordinación pidió ver quién ha respondido
-- cada conferencia, no escribir ahí. Sin esto, `/admin` no puede traer ni
-- una fila: la tabla existe, tiene datos, y PostgREST contesta vacío sin
-- error, que es la peor señal posible para "no hay política todavía".
-- =============================================================================

create policy encuesta_respuestas_lectura on encuesta_respuestas
  for select to authenticated using (tiene_rol(array['admin']::rol_interno[]));

grant select on encuesta_respuestas to authenticated;
