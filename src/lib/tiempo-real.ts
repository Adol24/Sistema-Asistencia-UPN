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
 * Es la misma lista que publican `20260910140000_tiempo_real.sql` y
 * `20260921180000_publicar_lo_que_faltaba.sql`.
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
  // La bitácora: una anotación de OTRA persona —el cobro de la ventanilla de
  // al lado— no aparecía hasta recargar, y un registro de auditoría que llega
  // tarde se consulta tarde.
  "bitacora",
  // El catálogo contra el que se valida el padrón. Sin esto, quien importa en
  // otra máquina sigue con el catálogo viejo y su archivo se rechaza entero
  // con «programa desconocido» por un programa dado de alta hace un minuto.
  "niveles_academicos",
  "programas",
  "planteles",
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

/**
 * Lo mínimo que pasa entre dos recargas, por muchos cambios que lleguen.
 *
 * `AGRUPAR_MS` agrupa RÁFAGAS —una importación de padrón son cientos de eventos
 * en un segundo— pero el día del evento los cambios no llegan en ráfaga: llegan
 * separados por segundos, uno por escaneo. Cada uno pasaba el agrupador y
 * lanzaba su propia recarga del conjunto entero.
 *
 * Con setecientas personas entrando, eso es una recarga cada pocos segundos, en
 * cada pestaña abierta, de todas las tablas. Este suelo las junta sin que nadie
 * lo note: lo que la persona que está capturando ve al instante es la respuesta
 * de SU escaneo, que no pasa por aquí. Esto es enterarse de lo que hacen los
 * demás, y cinco segundos de retraso en eso no cambia ninguna decisión.
 */
const SUELO_MS = 5_000;

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
  let ultima = 0;
  /** Hubo cambios mientras nadie miraba; se atienden al volver. */
  let pendiente = false;

  const disparar = () => {
    ultima = Date.now();
    pendiente = false;
    alCambiar();
  };

  /*
   * Dos frenos, y cada uno tapa un agujero distinto.
   *
   * El primero: **con la pestaña oculta no se recarga**. Una ventanilla suele
   * tener tres o cuatro pestañas del sistema abiertas, y todas escuchaban y
   * todas recargaban las diez tablas con cada cambio, incluidas las que nadie
   * estaba mirando. Ahora se apunta que hay algo pendiente y se atiende al
   * volver. Nadie ve datos viejos: al reaparecer la pestaña se recarga, y
   * además `estado-evento` ya recarga por su cuenta al volver al frente.
   *
   * El segundo: **un suelo entre recargas**. Ver `SUELO_MS`.
   */
  const agrupado = () => {
    if (cerrado) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      pendiente = true;
      return;
    }
    if (temporizador) clearTimeout(temporizador);
    const espera = Math.max(AGRUPAR_MS, SUELO_MS - (Date.now() - ultima));
    temporizador = setTimeout(() => {
      temporizador = null;
      disparar();
    }, espera);
  };

  const alVolverAlFrente = () => {
    if (cerrado || document.visibilityState !== "visible" || !pendiente) return;
    agrupado();
  };
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", alVolverAlFrente);

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
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", alVolverAlFrente);
      alEstado?.(false);
      void supabase.removeChannel(canal);
    },
  };
}
