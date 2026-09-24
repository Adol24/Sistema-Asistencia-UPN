/**
 * La hoja de instrucciones para el canje del voucher.
 *
 * Es la que entrega Servicios Financieros, tal cual, y vive en `public/` porque
 * es un archivo del evento y no un dato de nadie: la misma para las setecientas
 * personas, sin nombres ni montos dentro.
 *
 * Aquí había dos marcadores de `placehold.co` —«VOUCHER LEGIBLE» y «VOUCHER
 * BORROSO»— que la especificación pidió mientras no existiera la imagen real.
 * El segundo se quitó el 2026-09-24 y el primero lo sustituye esta. De paso
 * desaparece la única imagen del recorrido público que venía de fuera: el
 * recuadro ya no se rompe sin internet, y el trabajador de servicio la guarda
 * en cuanto se ve una vez, que es lo que hace falta para poder enseñarla en la
 * fila de la ventanilla.
 *
 * Al cambiarla hay que cambiar también la transcripción que la acompaña en
 * `/pago`: la imagen no se puede leer en un teléfono a tamaño de tarjeta, y esa
 * lista es lo que de verdad se sigue.
 */
export const IMAGEN_INSTRUCCIONES_VOUCHER = "/instrucciones-canje-de-voucher.png";
