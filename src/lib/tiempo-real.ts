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
 * demás, y el retraso en eso no cambia ninguna decisión.
 *
 * ---------------------------------------------------------------------------
 * Eran 5 segundos, y con varios puntos de captura a la vez eso no bastaba.
 * ---------------------------------------------------------------------------
 * El costo de CADA recarga no es una consulta: son diez, en paralelo
 * —`cargarTodo`—, y una de ellas (`v_estado_pago`) es una vista sin
 * materializar que recalcula de cero un `CROSS JOIN` + `GROUP BY` sobre TODOS
 * los participantes y TODOS los pagos. Con seis estaciones escaneando sin
 * parar, siempre hay un cambio nuevo cada pocos segundos, así que ese suelo de
 * cinco se tocaba constantemente: cada pestaña abierta —las seis de captura
 * MÁS cualquier panel de admin, financieros o monitoreo— repetía esa recarga
 * completa cada cinco segundos, durante todo el evento, con `asistencias`
 * creciendo hora tras hora. Eso es carga real contra el mismo proyecto que
 * tiene que atender, a la vez, las escrituras de los propios escaneos.
 *
 * Subirlo no cambia la garantía que ya documentaba el párrafo de arriba —el
 * capturista sigue viendo SU escaneo al instante, sin pasar por aquí—; solo
 * espacia cuánto tarda en enterarse de lo que hizo otra estación.
 */
const SUELO_MS = 20_000;

export interface Escucha {
  /** Corta la suscripción. Hay que llamarlo al desmontar o al cerrar sesión. */
  cerrar: () => void;
}

/**
 * Escucha los cambios y llama a `alCambiar` cuando algo se movió.
 *
 * @param alCambiar Se invoca ya agrupado, no una vez por fila. Recibe QUÉ
 *   tablas cambiaron en esta ráfaga, para que quien escucha pueda pedir solo
 *   lo que de verdad cambió en vez de las diez consultas completas. Durante
 *   el escaneo normal eso es casi siempre `{asistencias, bitacora}` —cada
 *   escaneo toca las dos y ninguna otra tabla—, así que distinguirlo importa:
 *   es la diferencia entre recargar dos listas pequeñas o recalcular de cero
 *   `v_estado_pago`, que no está materializada, sobre participantes y pagos
 *   completos.
 * @param alEstado Informa si el canal está escuchando de verdad. La pantalla lo
 *   usa para poder decirlo: «en vivo» cuando nadie lo comprobó es peor que no
 *   decir nada, porque quien atiende deja de actualizar creyendo que no hace
 *   falta.
 */
export async function escucharCambios(
  alCambiar: (tablas: ReadonlySet<string>) => void,
  alEstado?: (enVivo: boolean) => void,
): Promise<Escucha> {
  const { supabase } = await import("@/lib/supabase");
  if (!supabase) return { cerrar: () => {} };

  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let cerrado = false;
  let ultima = 0;
  /** Hubo cambios mientras nadie miraba; se atienden al volver. */
  let pendiente = false;
  /**
   * Qué tablas tocó la ráfaga que se está agrupando, o la que quedó pendiente
   * mientras la pestaña estaba oculta. Se vacía en cada disparo: lo que
   * importa es lo que cambió DESDE la última vez que se avisó, no el
   * historial completo de la sesión.
   */
  let tablasTocadas = new Set<string>();

  const disparar = () => {
    ultima = Date.now();
    pendiente = false;
    const tablas = tablasTocadas;
    tablasTocadas = new Set();
    alCambiar(tablas);
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
  /** @param tabla Ausente cuando es solo el reintento al volver al frente. */
  const agrupado = (tabla?: string) => {
    if (cerrado) return;
    // Se anota ANTES de mirar si la pestaña está oculta: lo que cambió
    // mientras nadie miraba hay que recordarlo igual, para saberlo al volver.
    if (tabla) tablasTocadas.add(tabla);
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
    canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, () =>
      agrupado(tabla),
    );
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
