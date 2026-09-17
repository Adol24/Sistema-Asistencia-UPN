/**
 * Los cuatro pasos del pre-registro, y qué rutas caen en cada uno.
 *
 * Se agrupan de a varios a propósito: las ocho pantallas del flujo son ocho
 * casillas, y una barra de ocho casillas no informa, abruma. Cuatro se cuentan
 * de un vistazo, que es lo único que se le pide a esto.
 *
 * Vive aquí y no en `layouts.tsx` porque lo leen dos sitios —el riel de
 * escritorio y la tira de la portada— y un archivo de componentes que además
 * exporta constantes rompe el refresco en caliente durante el desarrollo.
 */
export const PASOS_DEL_FLUJO: { titulo: string; rutas: string[] }[] = [
  { titulo: "Identifícate", rutas: ["/alumno", "/registro", "/confirmar-nombre"] },
  { titulo: "Tus datos de contacto", rutas: ["/completar-datos"] },
  { titulo: "Tu día y tu taller", rutas: ["/mi-dia", "/talleres"] },
  { titulo: "Tu pago", rutas: ["/pago", "/comprobante"] },
];
