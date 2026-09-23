import { useEffect } from "react";

/**
 * Qué versión del código está sirviendo esta web, dicho en voz alta una vez.
 *
 * Existe por una pregunta que se repitió tres veces seguidas y no se podía
 * contestar: «¿esto que estoy viendo ya trae el arreglo?». Un commit no es un
 * despliegue, y desde fuera —o desde el otro lado de una conversación— no hay
 * forma de distinguir «el arreglo está mal» de «el arreglo todavía no ha
 * llegado». Se diagnostica dos veces el mismo defecto ya corregido.
 *
 * Lo que de verdad contesta la pregunta no es el VALOR del sello: es que la
 * línea APAREZCA. Si sale, lo que se está sirviendo trae este archivo, y este
 * archivo llegó con los arreglos. Si no sale, el paquete es anterior y no hay
 * nada que depurar todavía.
 *
 * `VITE_SELLO` permite ponerle un nombre desde el despliegue —una etiqueta, un
 * commit— y sin ella queda el literal de abajo, que se cambia a mano cuando
 * hace falta distinguir dos despliegues seguidos.
 *
 * No toca nada: escribe UNA línea en la consola y se acabó. No hay interfaz que
 * mantener ni estado que se pueda desincronizar, y si algún día estorba se
 * borra sin consecuencias.
 */
const SELLO = import.meta.env["VITE_SELLO"] ?? "2026-09-23 · cupo de talleres";

export function useSelloDeVersion(): void {
  useEffect(() => {
    // `info` y no `log`: no es ruido de depuración, es la etiqueta del paquete.
    console.info(
      `%cEncuentro UPN%c versión ${SELLO}`,
      "background:#1e40af;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold",
      "color:inherit",
    );
  }, []);
}
