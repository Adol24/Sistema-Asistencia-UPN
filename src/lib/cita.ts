/**
 * Qué fecha de pago se le enseña a cada quien, y cuándo no se le enseña ninguna.
 *
 * ---------------------------------------------------------------------------
 * La regla que faltaba: a quien ya pagó no se le habla de pagar
 * ---------------------------------------------------------------------------
 * El bloque de la fecha se pintaba con una sola condición —que existiera la
 * cita— y no miraba el pago. Así que alguien que ya depositó y lo tenía validado
 * seguía leyendo «Tu inscripción: jueves 1 de octubre» en lo más alto de su
 * portal, semanas después, como si le faltara algo.
 *
 * Lo llamativo es que esa pantalla ya sabía la respuesta: calculaba
 * `pagoConfirmado` dos líneas antes y la usaba para el bloque del depósito, pero
 * no para éste. El dato estaba; la pregunta no se hacía.
 *
 * ---------------------------------------------------------------------------
 * Tres formas de fecha, y no son intercambiables
 * ---------------------------------------------------------------------------
 * - **Cita**: un día concreto, asignado al alumno por cohorte y sede. Ir antes
 *   o después no sirve, porque su sede abre para él ese día.
 * - **Reposición**: la cita de quien se le pasó la suya. No se puede llamar «tu
 *   inscripción» sin mentir, porque no lo fue.
 * - **Tope**: el último día del docente y del externo. Puede ir cualquier día
 *   antes, así que «no puedes ir antes» sería falso para él.
 *
 * Darles el mismo rótulo es como empezó esto: «antes del 9 de octubre» se leyó
 * durante días como la cita de cada quien, y mandaba a la gente una semana tarde
 * con su lugar ya liberado.
 *
 * Vive suelto y sin React porque lo usan dos pantallas —`/comprobante` y
 * `/portal/estado`— y porque es justo el tipo de regla que no se puede probar a
 * ojo: son seis estados de pago por tres perfiles, y el caso que importa —el de
 * quien ya pagó— es el que nadie va a mirar, porque esa persona ya no escribe a
 * soporte.
 */

import type { EstadoPago, Perfil } from "@/dominio/tipos";
import type { CitaDePago } from "@/lib/datos";
import { fechaLarga, hoyIso } from "@/lib/formato";

/** De qué tipo es la fecha que se está enseñando. */
export type ClaseDeCita = "cita" | "reposicion" | "tope" | "rango";

export interface CitaEnPantalla {
  /** Ya redactada: «jueves 8 de octubre», o «28 y 29 de septiembre». */
  cuando: string;
  clase: ClaseDeCita;
}

/**
 * Los estados en los que NO se le enseña ninguna fecha de pago.
 *
 * El criterio es uno: **esta persona ya hizo lo que tenía que hacer, o no tenía
 * nada que hacer.** Recordarle una fecha de pago no la ayuda, y la asusta.
 *
 * - `pagado` · su depósito está validado. Es la regla que pidió la organización.
 * - `exento` · el maestro que eligió asistir sin constancia. No debe un peso.
 * - `comprobante_recibido` · entregó su voucher y espera la validación. Decirle
 *   «entrega antes del 8» a quien ya entregó es pedirle algo dos veces.
 * - `cancelado` · su registro no sigue en pie. No hay pago que programar.
 *
 * Los que SÍ la ven, y por qué:
 *
 * - `pre_registrado` · es a quien va dirigida.
 * - `discrepancia` · depositó un monto que no cuadra, así que todavía debe. La
 *   pantalla ya le dice además a dónde ir, que es Servicios Financieros.
 * - `expirado` · no hace falta excluirlo aquí. Para el alumno,
 *   `fn_cita_de_pago` ya devuelve nulo cuando hasta la reposición pasó; para el
 *   docente, la comparación de abajo hace lo mismo. Los dos caminos acaban en
 *   «ninguna fecha» sin que haya que repetir la regla.
 */
const SIN_FECHA_DE_PAGO: readonly EstadoPago[] = [
  "pagado",
  "exento",
  "comprobante_recibido",
  "cancelado",
];

/**
 * La fecha que le toca ver a esta persona, o `null` si no le toca ninguna.
 *
 * `remota` es lo que contestó `fn_cita_de_pago`, que solo sabe de alumnos: su
 * consulta busca la matrícula en el padrón. Para el docente y el externo la
 * fecha no viene de ahí sino de la configuración, porque es una sola para todos.
 */
export function citaEnPantalla(datos: {
  perfil: Perfil;
  /** El estado del depósito ya reducido, el mismo que decide la insignia. */
  estado: EstadoPago;
  /** Lo que devolvió `fn_cita_de_pago`. Nulo para quien no está en el padrón. */
  remota: CitaDePago | null;
  /** `configuracion_evento.fecha_pago_docentes_externos`, en crudo. */
  fechaTope: string;
}): CitaEnPantalla | null {
  if (SIN_FECHA_DE_PAGO.includes(datos.estado)) return null;

  if (datos.perfil === "docente" || datos.perfil === "externo") {
    const iso = datos.fechaTope.trim();
    /*
     * Un tope que ya pasó no se enseña, y la comparación es `<` y no `<=`:
     * el día del tope todavía cuenta.
     *
     * Es al revés que con la cita del alumno, y la diferencia tiene motivo. Al
     * alumno se le mueve la cita cuando cae HOY porque entre registrarse y
     * entregar hay una ida al banco que no cabe en el mismo día. El tope no es
     * una sorpresa: esta persona lo tiene desde que se registró, así que su
     * último día es suyo entero.
     *
     * Las cadenas `AAAA-MM-DD` se comparan bien tal cual, y `hoyIso` da el día
     * en la zona del equipo. Pasarlas por `new Date` sería el defecto de
     * siempre: una fecha sin hora se lee como medianoche UTC y en México pinta
     * el día anterior.
     */
    if (!iso || iso < hoyIso()) return null;
    const cuando = fechaLarga(iso);
    // Sin fecha legible no se inventa nada: `fechaLarga` devuelve vacío cuando
    // no reconoce la entrada, y media frase es peor que ninguna.
    return cuando ? { cuando, clase: "tope" } : null;
  }

  if (!datos.remota) return null;
  return {
    cuando: datos.remota.cuando,
    clase: datos.remota.repuesta ? "reposicion" : datos.remota.estricto ? "cita" : "rango",
  };
}

/**
 * Cómo se nombra cada clase de fecha en pantalla.
 *
 * El aviso del tope no dice «no puedes ir antes», que es lo que se le dice al
 * alumno: para el docente ir antes es exactamente lo que se espera de él. Y el
 * de la reposición no repite «ni antes ni después» porque para esa persona
 * «antes» ya pasó; lo único que importa es que después no hay nada.
 */
export function rotulosDeLaCita(cita: CitaEnPantalla): {
  titulo: string;
  aviso: string | null;
} {
  switch (cita.clase) {
    case "tope":
      return {
        titulo: `Tu último día para pagar: ${cita.cuando}`,
        aviso: "Puedes ir cualquier día antes, pero no después.",
      };
    case "reposicion":
      return {
        titulo: `Tu nueva fecha: ${cita.cuando}`,
        aviso: "El día que te tocaba ya pasó. Este es el día de reposición, y es el último.",
      };
    case "cita":
      return {
        titulo: `Tu inscripción: ${cita.cuando}`,
        aviso: "Es ese día y solo ese: no puedes ir antes ni después.",
      };
    case "rango":
      return { titulo: `Tu inscripción: ${cita.cuando}`, aviso: null };
  }
}
