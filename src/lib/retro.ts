/**
 * Vibración y sonido del semáforo del escáner.
 *
 * En un salón con 700 personas el capturista no siempre alcanza a mirar la
 * pantalla: el tono le dice si puede seguir o tiene que detener a la persona.
 * Los tres patrones son deliberadamente distintos entre sí.
 *
 * El audio se sintetiza con la Web Audio API en lugar de cargar un archivo:
 * no agrega dependencias, no agrega peticiones y suena igual sin conexión.
 */

import type { Color } from "@/lib/escaneo";

interface Patron {
  /** Milisegundos de vibración; los pares son pausas. */
  vibracion: number[];
  /** Tonos: frecuencia en Hz y duración en segundos. */
  tonos: { hz: number; seg: number }[];
}

const PATRONES: Record<Color, Patron> = {
  // Un pulso corto y agudo: «listo, sigue».
  verde: { vibracion: [60], tonos: [{ hz: 880, seg: 0.09 }] },
  // Dos pulsos medios: «detente y lee».
  amarillo: {
    vibracion: [90, 70, 90],
    tonos: [
      { hz: 620, seg: 0.11 },
      { hz: 620, seg: 0.11 },
    ],
  },
  // Un zumbido largo y grave: «no pasa».
  rojo: {
    vibracion: [240, 90, 240],
    tonos: [
      { hz: 200, seg: 0.22 },
      { hz: 160, seg: 0.28 },
    ],
  },
};

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  contexto ??= new Ctor();
  return contexto;
}

/** Emite el sonido y la vibración que corresponden al color del resultado. */
export function retroalimentar(color: Color) {
  if (typeof window === "undefined") return;
  const patron = PATRONES[color];

  // La API de vibración solo existe en móviles; en escritorio no pasa nada.
  navigator.vibrate?.(patron.vibracion);

  const ctx = obtenerContexto();
  if (!ctx) return;
  // Los navegadores suspenden el audio hasta que el usuario interactúa; como el
  // escaneo siempre nace de un toque, aquí ya se puede reanudar.
  if (ctx.state === "suspended") void ctx.resume();

  let inicio = ctx.currentTime;
  for (const { hz, seg } of patron.tonos) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = color === "rojo" ? "square" : "sine";
    osc.frequency.value = hz;
    // Rampa corta de entrada y salida para que no chasquee.
    vol.gain.setValueAtTime(0.0001, inicio);
    vol.gain.exponentialRampToValueAtTime(0.22, inicio + 0.012);
    vol.gain.exponentialRampToValueAtTime(0.0001, inicio + seg);
    osc.connect(vol).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + seg + 0.02);
    inicio += seg + 0.05;
  }
}
