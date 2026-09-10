/**
 * Vibración y sonido del escáner de la puerta.
 *
 * En un salón con 700 personas el capturista mira a quien tiene delante, no al
 * teléfono. El semáforo de la pantalla llega tarde a un vistazo que ya se fue;
 * el sonido no. Por eso cada situación suena distinto: quien lleva media hora
 * en la puerta la reconoce antes de leerla, y ahí está el tiempo que se gana.
 *
 * **Antes había tres patrones, uno por color, y eso agrupaba demasiado.** Día
 * equivocado, sin pagar y folio inválido son los tres rojos, y las tres piden
 * reacciones distintas: a uno se le manda a la sede que le toca, a otro a
 * Servicios Financieros y al tercero a la mesa de incidencias. Un mismo zumbido
 * para los tres obliga a leer la pantalla justo cuando no hay tiempo.
 *
 * El audio se sintetiza con la Web Audio API en lugar de cargar archivos: no
 * agrega dependencias ni peticiones, y suena igual sin conexión —que importa,
 * porque esta pantalla guarda escaneos en cola precisamente para eso—.
 *
 * La gravedad se oye. Los rojos usan onda de sierra o cuadrada y notas graves
 * que caen, que es lo que el oído lee como negativo; el verde son dos notas
 * limpias que suben; los ámbar quedan en medio, sin la aspereza del rojo.
 */

import type { Color } from "@/lib/escaneo";

/** Qué suena. Se decide por el título del resultado, no solo por el color. */
export type Aviso =
  | "correcto"
  | "folio_invalido"
  | "dia_equivocado"
  | "denegado"
  | "ya_registrado"
  | "reingreso"
  | "advertencia";

interface Nota {
  /** Frecuencia en hercios. */
  hz: number;
  /** Cuándo empieza, en segundos desde el inicio del aviso. */
  en: number;
  /** Cuánto dura, en segundos. */
  dura: number;
  tipo?: OscillatorType;
  /** Volumen relativo de esta nota, de 0 a 1. */
  vol?: number;
}

interface Patron {
  /** Milisegundos de vibración; los índices impares son pausas. */
  vibracion: number[];
  notas: Nota[];
}

/*
 * Las frecuencias son notas reales y no números redondos: un intervalo afinado
 * suena intencionado, y uno arbitrario suena a avería del equipo — que es justo
 * lo que no queremos que parezca cuando alguien pasa bien.
 */
const PATRONES: Record<Aviso, Patron> = {
  // Quinta ascendente (LA5 → MI6): breve, brillante, inconfundible. «Sigue.»
  correcto: {
    vibracion: [60],
    notas: [
      { hz: 880, en: 0, dura: 0.09 },
      { hz: 1318.51, en: 0.08, dura: 0.16 },
    ],
  },

  // Zumbido áspero que cae. Es el «no» más rotundo del juego: el código no
  // corresponde a nadie, así que no hay nada que autorizar ni que verificar.
  folio_invalido: {
    vibracion: [300, 100, 300],
    notas: [
      { hz: 220, en: 0, dura: 0.22, tipo: "sawtooth" },
      { hz: 155, en: 0.2, dura: 0.36, tipo: "sawtooth" },
    ],
  },

  // Sirena de dos tonos, tres veces. Distinta de todo lo demás a propósito:
  // esta persona pagó y se presentó, pero en el día que no le toca. Confundirlo
  // con un «ya registrado» manda a alguien a la sede equivocada.
  dia_equivocado: {
    vibracion: [140, 80, 140, 80, 140, 80, 240],
    notas: [
      { hz: 740, en: 0.0, dura: 0.13, tipo: "square", vol: 0.95 },
      { hz: 554, en: 0.13, dura: 0.13, tipo: "square", vol: 0.95 },
      { hz: 740, en: 0.26, dura: 0.13, tipo: "square", vol: 0.95 },
      { hz: 554, en: 0.39, dura: 0.13, tipo: "square", vol: 0.95 },
      { hz: 740, en: 0.52, dura: 0.13, tipo: "square", vol: 0.95 },
      { hz: 554, en: 0.65, dura: 0.22, tipo: "square", vol: 0.95 },
    ],
  },

  // Tres notas graves cayendo: sin pagar, sin taller, taller sin pagar. Se
  // detiene el paso, pero el problema tiene arreglo en la mesa de incidencias.
  denegado: {
    vibracion: [240, 90, 240],
    notas: [
      { hz: 392, en: 0, dura: 0.13, tipo: "sawtooth" },
      { hz: 311, en: 0.13, dura: 0.13, tipo: "sawtooth" },
      { hz: 233, en: 0.26, dura: 0.3, tipo: "sawtooth" },
    ],
  },

  // Dos notas iguales y planas: «esto ya estaba hecho». Ni felicita ni alarma.
  // Es el caso de quien vuelve pasados los 15 minutos de la ventana.
  ya_registrado: {
    vibracion: [90, 70, 90],
    notas: [
      { hz: 587.33, en: 0, dura: 0.1, tipo: "triangle" },
      { hz: 587.33, en: 0.16, dura: 0.2, tipo: "triangle" },
    ],
  },

  // Una nota corta y suave: volvió dentro de la ventana de 15 minutos y no se
  // registra otra vez. Es lo más inocuo que puede pasar en la puerta.
  reingreso: {
    vibracion: [50],
    notas: [{ hz: 659.25, en: 0, dura: 0.13, tipo: "triangle", vol: 0.75 }],
  },

  // Sube y se queda arriba: pasa, pero hay algo que atender después.
  advertencia: {
    vibracion: [90, 70, 90],
    notas: [
      { hz: 622.25, en: 0, dura: 0.1, tipo: "square", vol: 0.85 },
      { hz: 830.61, en: 0.14, dura: 0.24, tipo: "square", vol: 0.85 },
    ],
  },
};

/**
 * Del resultado del escaneo al aviso que suena.
 *
 * Se mapea por título y se cae al color solo para lo que no tiene aviso propio,
 * de modo que un caso nuevo suene siempre a algo en vez de quedarse mudo.
 */
export function avisoDe(titulo: string, color: Color): Aviso {
  if (titulo === "FOLIO INVÁLIDO") return "folio_invalido";
  if (titulo === "DÍA EQUIVOCADO") return "dia_equivocado";
  if (titulo === "YA REGISTRADO") return "ya_registrado";
  if (titulo === "REINGRESO") return "reingreso";
  if (color === "rojo") return "denegado";
  if (color === "amarillo") return "advertencia";
  return "correcto";
}

const CLAVE_SILENCIO = "captura.silencio";

export const estaSilenciado = (): boolean => {
  try {
    return window.localStorage.getItem(CLAVE_SILENCIO) === "1";
  } catch {
    return false;
  }
};

export const silenciar = (valor: boolean): void => {
  try {
    if (valor) window.localStorage.setItem(CLAVE_SILENCIO, "1");
    else window.localStorage.removeItem(CLAVE_SILENCIO);
  } catch {
    /* Sin almacenamiento, el ajuste dura lo que la pestaña. */
  }
};

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    contexto ??= new Ctor();
    return contexto;
  } catch {
    // Sin audio no se cae nada: el semáforo de la pantalla sigue estando.
    return null;
  }
}

/**
 * Emite el sonido y la vibración que corresponden al resultado del escaneo.
 *
 * **Suena fuerte de verdad.** La puerta de un evento tiene gente hablando, y el
 * volumen anterior —0.22— se perdía entre el ruido. Ahora va a 0.9 y pasa por
 * un compresor, que es lo que permite subirlo sin que las notas se recorten: un
 * aviso distorsionado se oye como una avería del equipo, no como una alerta.
 *
 * La vibración se mantiene y también distingue los siete casos, porque en una
 * puerta ruidosa el teléfono en la mano a veces llega antes que el altavoz.
 */
export function retroalimentar(r: { color: Color; titulo: string }): void {
  if (typeof window === "undefined") return;
  const patron = PATRONES[avisoDe(r.titulo, r.color)];

  // La API de vibración solo existe en móviles; en escritorio no pasa nada.
  navigator.vibrate?.(patron.vibracion);

  if (estaSilenciado()) return;
  const ctx = obtenerContexto();
  if (!ctx) return;
  // Los navegadores suspenden el audio hasta que el usuario interactúa; como el
  // escaneo siempre nace de un toque, aquí ya se puede reanudar.
  if (ctx.state === "suspended") void ctx.resume();

  const maestro = ctx.createGain();
  maestro.gain.value = 0.9;

  const compresor = ctx.createDynamicsCompressor();
  compresor.threshold.value = -12;
  compresor.ratio.value = 12;
  compresor.attack.value = 0.002;
  compresor.release.value = 0.15;

  maestro.connect(compresor);
  compresor.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.01;

  for (const n of patron.notas) {
    const osc = ctx.createOscillator();
    osc.type = n.tipo ?? "sine";
    osc.frequency.value = n.hz;

    const vol = ctx.createGain();
    const pico = n.vol ?? 1;
    const inicio = t0 + n.en;
    const fin = inicio + n.dura;
    // Rampas cortas a los dos lados: sin ellas, el corte seco del oscilador
    // chasquea, y el chasquido se oye más que la nota.
    vol.gain.setValueAtTime(0.0001, inicio);
    vol.gain.exponentialRampToValueAtTime(pico, inicio + 0.012);
    vol.gain.setValueAtTime(pico, Math.max(inicio + 0.013, fin - 0.05));
    vol.gain.exponentialRampToValueAtTime(0.0001, fin);

    osc.connect(vol).connect(maestro);
    osc.start(inicio);
    osc.stop(fin + 0.02);
  }
}

/**
 * Un resultado de mentira que `avisoDe` mapea a cada aviso.
 *
 * Lleva el color además del título porque dos de ellos —`denegado` y
 * `advertencia`— no tienen título propio y se resuelven justamente por el
 * color. Con el color fijo, la prueba de esos dos sonaría a «correcto» y no
 * probaría nada.
 */
const EJEMPLO: Record<Aviso, { color: Color; titulo: string }> = {
  correcto: { color: "verde", titulo: "ENTRADA REGISTRADA" },
  folio_invalido: { color: "rojo", titulo: "FOLIO INVÁLIDO" },
  dia_equivocado: { color: "rojo", titulo: "DÍA EQUIVOCADO" },
  ya_registrado: { color: "amarillo", titulo: "YA REGISTRADO" },
  reingreso: { color: "amarillo", titulo: "REINGRESO" },
  denegado: { color: "rojo", titulo: "SIN PAGAR" },
  advertencia: { color: "amarillo", titulo: "DISCREPANCIA DE PAGO" },
};

/**
 * Suena un aviso suelto, para la prueba de sonido.
 *
 * Existe porque el volumen de la puerta hay que ajustarlo ANTES de que llegue
 * la fila, no descubriendo a media jornada que el teléfono estaba en silencio.
 */
export function probar(aviso: Aviso): void {
  retroalimentar(EJEMPLO[aviso]);
}
