/**
 * El interruptor de mantenimiento.
 *
 * Una sola constante enciende una pantalla que tapa TODO lo público: portada,
 * pre-registro, pago, portal, comprobante y talleres. Las zonas internas
 * —`/admin`, `/financieros`, `/captura`, `/revision`— quedan fuera a propósito,
 * porque es donde el personal se identifica: si la pantalla las tapara también,
 * nadie podría entrar a trabajar mientras dura, ni comprobar que lo que se está
 * arreglando quedó arreglado.
 *
 * No hay bandera en la base ni control en el panel, y es una decisión: cuando se
 * apaga el sistema suele ser porque algo de la base no responde, y un
 * interruptor que vive justo en lo que está caído no se puede accionar. Esto se
 * despliega con el código y no depende de nada.
 *
 * El precio es que encenderlo exige desplegar. Apagarlo no: se apaga solo al
 * llegar la hora, sin que nadie tenga que acordarse.
 */

/**
 * Hasta cuándo dura, o `null` para que no haya mantenimiento ninguno.
 *
 * Es un instante absoluto y lleva el desfase escrito —`-06:00`, que es el de
 * México y ya no cambia con el horario de verano—. Sin el desfase, `Date.parse`
 * lo leería como UTC y la pantalla se apagaría seis horas antes de tiempo.
 *
 * Al pasar esa hora la pantalla desaparece sola, sin desplegar otra vez. Si el
 * trabajo se alarga, mover esta línea y volver a publicar; si termina antes,
 * ponerla en `null`.
 */
export const MANTENIMIENTO_HASTA: string | null = "2026-09-25T22:00:00-06:00";

/**
 * La misma hora en milisegundos, o `null` si no hay mantenimiento o si la fecha
 * está mal escrita.
 *
 * Una fecha ilegible apaga la pantalla en vez de dejarla encendida para
 * siempre: equivocarse escribiendo el instante no debe tumbar el sitio.
 */
const FIN = (() => {
  if (!MANTENIMIENTO_HASTA) return null;
  const t = Date.parse(MANTENIMIENTO_HASTA);
  return Number.isNaN(t) ? null : t;
})();

/** Si sigue siendo la hora del mantenimiento. Falso en cuanto pasa. */
export const sigueEnMantenimiento = (ahora: number = Date.now()) => FIN !== null && ahora < FIN;

/**
 * Las cuatro zonas del personal, por dirección.
 *
 * Se compara la ruta y no el rol porque el formulario de acceso VIVE dentro de
 * estas pantallas —lo pone `Protegido`, en `components/acceso.tsx`—: mirar solo
 * si hay sesión dejaría fuera precisamente a quien todavía no ha entrado, que es
 * todo el personal al abrir el navegador.
 *
 * Quien no tenga el rol se topa igual con la puerta de siempre. Esto no abre
 * nada: solo decide qué pantalla se dibuja primero.
 */
const ZONAS_DEL_PERSONAL = ["/admin", "/financieros", "/captura", "/revision"];

export const esRutaDelPersonal = (ruta: string) =>
  ZONAS_DEL_PERSONAL.some((zona) => ruta === zona || ruta.startsWith(`${zona}/`));

/**
 * La zona horaria del evento, fija.
 *
 * El aspirante puede abrir el enlace con el teléfono en otro huso —pasa con
 * quien viaja, y con quien nunca corrigió la configuración del aparato— y la
 * hora de regreso tiene que ser la de aquí, no la suya. Fijarla aquí también
 * hace que el servidor, que corre en UTC, escriba lo mismo que el navegador.
 */
const ZONA = "America/Mexico_City";

/** El día natural en la zona del evento, como AAAA-MM-DD. Solo para comparar. */
const diaEnZona = (t: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);

const horaEnZona = (t: number) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(t);

const fechaEnZona = (t: number) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, day: "numeric", month: "long" }).format(t);

/**
 * Cuándo volvemos, en palabras: «hoy a las 10:00 p.m.».
 *
 * Dice «hoy» solo cuando de verdad es hoy. Un mantenimiento que cruza la
 * medianoche —y cinco horas empezadas a las nueve de la noche lo cruzan— pasa a
 * nombrar la fecha, porque «hoy a las 2:00 a.m.» es justo el tipo de frase que
 * hace volver a la gente con un día de retraso.
 */
export function regresoEnPalabras(ahora: number = Date.now()): string {
  if (FIN === null) return "";
  const hora = horaEnZona(FIN);
  return diaEnZona(FIN) === diaEnZona(ahora)
    ? `hoy a las ${hora}`
    : `el ${fechaEnZona(FIN)} a las ${hora}`;
}

/**
 * Cuánto falta, como duración y sin verbo: «4 h 12 min».
 *
 * Sin verbo a propósito. «Falta/faltan» obliga a concordar con un sujeto que
 * cambia de número cada minuto —una hora, dos horas, un minuto— y la frase
 * acababa mal escrita justo en la pantalla que más gente ve. La etiqueta que la
 * acompaña pone el resto.
 *
 * Redondea hacia arriba: prometer menos de lo que falta es lo que hace que
 * alguien vuelva antes de tiempo y se encuentre la misma pantalla.
 */
export function faltaParaVolver(ahora: number = Date.now()): string {
  if (FIN === null) return "";
  const ms = FIN - ahora;
  if (ms <= 0) return "un momento";
  const minutos = Math.ceil(ms / 60_000);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${String(resto).padStart(2, "0")} min`;
}
