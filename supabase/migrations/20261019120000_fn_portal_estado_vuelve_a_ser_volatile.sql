-- =============================================================================
-- fn_portal_estado vuelve a ser volatile
--
-- La migración 51 (`20260922200000_la_puerta_del_portal_tambien_tiene_tope`)
-- dejó dicho, letra por letra, que `fn_portal_estado` solo debía cambiar de
-- volatilidad —`alter function ... volatile`— y NUNCA reescribirse con
-- `create or replace` copiando el cuerpo viejo, porque eso revierte la
-- volatilidad a `stable` sin que nadie lo note: así se perdió el limitador de
-- `fn_padron_confirmar` una vez, y advertía exactamente de esto.
--
-- La migración de evidencia de taller (20261019100000) hizo justo eso: copió
-- el cuerpo original de `fn_portal_estado` para agregarle 'tipo' al jsonb de
-- evidencias, y al declararla `stable` otra vez rompió el limitador por IP que
-- vive dentro de `fn_autenticar_portal`. Toda llamada al portal truena con
-- [25006] cannot execute DELETE in a read-only transaction: NINGÚN alumno
-- podía entrar ni refrescar su portal desde que se aplicó esa migración.
--
-- El cuerpo con 'tipo' ya quedó bien —no hay que tocarlo de nuevo—; lo único
-- que falta es esto.
-- =============================================================================

alter function fn_portal_estado(text, text) volatile;

comment on function fn_portal_estado is
  'Todo lo que el portal muestra, en una llamada. El tope por IP lo pone '
  'fn_autenticar_portal, a la que llama para revalidar la credencial.';
