/**
 * La escucha de cambios en vivo.
 *
 * Antes cada pantalla trabajaba con una foto del instante en que se inició
 * sesión. Eso producía errores que parecían de otra cosa —escanear el código de
 * alguien recién pre-registrado respondía «ese folio no existe»— y, peor, dos
 * ventanillas podían cobrarle a la misma persona sin que ninguna viera el cobro
 * de la otra.
 *
 * **Se avisa del cambio; no se aplica el cambio.** El evento que llega dice qué
 * tabla se tocó, y con eso se vuelve a pedir el conjunto. Aplicar cada fila a
 * mano obligaría a reimplementar en el navegador lo que ya hacen las consultas
 * —los enlaces con talleres y programas, el estado derivado de los pagos, el
 * orden— y a mantener las dos versiones sincronizadas para siempre. Con los
 * volúmenes de este evento, volver a pedirlo cuesta menos que ese riesgo.
 *
 * La seguridad no cambia: Realtime evalúa las políticas de fila de quien
 * escucha antes de entregarle nada, así que a un capturista no le llegan los
 * pagos aunque la tabla esté publicada.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Las tablas que se escuchan.
 *
 * Es la misma lista que publica la migración `20260910140000_tiempo_real.sql`.
 * Si aquí sobra una que allá no está, esta pantalla nunca se entera de sus
 * cambios y nada lo delata, así que las dos listas se mantienen juntas a
 * propósito.
 */
const TABLAS = [
  "participantes",
  "pagos",
  "asistencias",
  "evidencias",
  "revisiones",
  "avisos_participante",
  "padron_alumnos",
  "talleres",
  "taller_dias",
  "configuracion_evento",
  "dias_evento",
  "usuarios_internos",
  "casos_soporte",
] as const;

/**
 * Cuánto se espera antes de recargar tras el primer cambio.
 *
 * Importar un padrón de cientos de filas produce cientos de eventos en un
 * segundo. Sin esta espera, cada uno dispararía su propia recarga y la pantalla
 * pasaría el rato pidiendo lo mismo. Medio segundo es imperceptible en la
 * puerta y convierte una ráfaga en una sola petición.
 */
const AGRUPAR_MS = 500;

export interface Escucha {
  /** Corta la suscripción. Hay que llamarlo al desmontar o al cerrar sesión. */
  cerrar: () => void;
}

/**
 * Escucha los cambios y llama a `alCambiar` cuando algo se movió.
 *
 * @param alCambiar Se invoca ya agrupado, no una vez por fila.
 * @param alEstado Informa si el canal está escuchando de verdad. La pantalla lo
 *   usa para poder decirlo: «en vivo» cuando nadie lo comprobó es peor que no
 *   decir nada, porque quien atiende deja de actualizar creyendo que no hace
 *   falta.
 */
export async function escucharCambios(
  alCambiar: () => void,
  alEstado?: (enVivo: boolean) => void,
): Promise<Escucha> {
  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return { cerrar: () => {} };

  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let cerrado = false;

  const agrupado = () => {
    if (cerrado) return;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      alCambiar();
    }, AGRUPAR_MS);
  };

  /*
   * Un solo canal para todas las tablas.
   *
   * Cada canal es una suscripción que el servidor mantiene abierta, y el plan
   * gratuito de Supabase cuenta conexiones concurrentes. Trece canales por
   * pestaña, multiplicados por las ventanillas y los puntos de captura, agotan
   * la cuota el día del evento. Uno solo con trece escuchas cuesta una.
   */
  const canal: RealtimeChannel = supabase.channel("cambios-del-evento");

  for (const tabla of TABLAS) {
    canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, agrupado);
  }

  canal.subscribe((estado) => {
    // `SUBSCRIBED` es lo único que garantiza que los cambios van a llegar. Los
    // demás estados —error de canal, expiración, cierre— significan que esta
    // pantalla volvió a ser una foto, y hay que poder decirlo.
    alEstado?.(estado === "SUBSCRIBED");
  });

  return {
    cerrar: () => {
      cerrado = true;
      if (temporizador) clearTimeout(temporizador);
      alEstado?.(false);
      void supabase.removeChannel(canal);
    },
  };
}
