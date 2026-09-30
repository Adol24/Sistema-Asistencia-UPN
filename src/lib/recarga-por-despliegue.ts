/**
 * Recuperarse de un paquete de la aplicación que ya no está donde se pedía.
 *
 * La aplicación se sirve troceada: cada pantalla es un archivo aparte con un
 * hash del contenido en el nombre, y se descarga la primera vez que alguien
 * entra en ella. Al desplegar una versión nueva cambian esos nombres, así que
 * una pestaña que lleva abierta desde antes pide un archivo que ya no existe —o
 * uno que existe pero todavía no ha llegado a la red de reparto—, y lo que ve
 * quien la tiene abierta es la pantalla de error con un mensaje en inglés sobre
 * módulos dinámicos.
 *
 * Pasó de verdad el 2026-09-30 con `/financieros` a media tarde: el archivo
 * estaba bien y el despliegue estaba bien; simplemente la pestaña pidió el
 * paquete durante los segundos en que se estaba publicando. No es un defecto
 * del código de la pantalla y no se arregla dentro de ella: se arregla volviendo
 * a pedir el índice, que es quien sabe los nombres nuevos.
 *
 * Lo que NO hace: reintentar en bucle. Una recarga por minuto como mucho, y
 * solo si queda constancia de que se intentó; si la segunda vez vuelve a
 * fallar, el problema no era el despliegue —no hay red, o el archivo de verdad
 * falta— y entonces se le dice a la persona en su idioma y se le deja el botón.
 */

import { guardarJSON, leerJSON } from "@/lib/almacen-sesion";

/*
 * Cada navegador lo cuenta con sus palabras y ninguno pone un código: Chrome
 * dice «Failed to fetch dynamically imported module», Firefox «error loading
 * dynamically imported module» y Safari «Importing a module script failed». La
 * cuarta es de Vite, que avisa aparte cuando lo que no llegó es la hoja de
 * estilos de la pantalla.
 */
const SEÑALES =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

/** ¿Este error es el de un paquete que no llegó? */
export const esPaqueteQueNoLlego = (error: unknown): boolean =>
  error instanceof Error && SEÑALES.test(error.message);

const CLAVE = "recarga-por-despliegue";

/** Cuánto tiene que pasar para volver a permitir una recarga automática. */
const ESPERA_MS = 60_000;

/**
 * Apunta que se va a recargar, y dice si toca hacerlo.
 *
 * La marca se vuelve a LEER después de escribirla, y no es paranoia: en
 * navegación privada `guardarJSON` se traga el error y no guarda nada, y sin
 * esa comprobación la marca nunca existiría, cada error volvería a parecer el
 * primero y la pestaña se quedaría recargándose sola para siempre. Si no se
 * puede dejar constancia, no se recarga.
 */
export function tocaRecargar(ahora = Date.now()): boolean {
  const previo = leerJSON<number>(CLAVE);
  if (typeof previo === "number" && ahora - previo < ESPERA_MS) return false;
  guardarJSON(CLAVE, ahora);
  return leerJSON<number>(CLAVE) === ahora;
}
