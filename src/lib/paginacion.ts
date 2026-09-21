import { useMemo, useState } from "react";

/*
 * Paginar una lista larga.
 *
 * Vive aparte de `Tabla` porque un archivo que exporta componentes y además un
 * hook rompe el refresco en caliente de Vite: al editarlo se recarga la página
 * entera en vez de la pieza, y con el padrón cargado eso significa volver a
 * soltar el archivo.
 */

/**
 * Un tramo de una lista larga: qué filas tocan ahora y cómo moverse.
 *
 * Se devuelve entero para que la pantalla no tenga que recalcular nada al
 * pintar el pie: los números del «mostrando 11–20 de 5 000» y los botones
 * salen de la misma cuenta que recortó las filas, así que no pueden
 * contradecirse.
 */
export interface Tramo<T> {
  /** Solo las filas de esta página. */
  visibles: T[];
  /** En cuál se está, ya acotada al total que hay ahora mismo. */
  pagina: number;
  totalPaginas: number;
  /** Índice de la primera fila visible, contando desde cero. */
  desde: number;
  /** Índice de la última visible, contando desde uno: el de «11–20». */
  hasta: number;
  /** Cuántas hay en la lista entera, no en la página. */
  total: number;
  irA: (pagina: number) => void;
}

/**
 * Parte una lista en páginas.
 *
 * La página se acota al vuelo con `Math.min` en vez de corregirse después: si
 * la lista encoge —alguien filtra estando en la página 40— la 40 deja de
 * existir y se enseña la última que sí, sin un parpadeo con la tabla vacía en
 * medio.
 *
 * @param clave Qué significa «otra lista» y obliga a volver a la página 1.
 *   Va explícita y no se deduce de la identidad del arreglo a propósito: los
 *   filtros sí deben devolver al principio, pero editar un dato de la fila que
 *   se está mirando —reasignarle el día a un alumno— también genera un arreglo
 *   nuevo, y ahí saltar a la página 1 sería perder el sitio a media tarea.
 */
export function usePaginacion<T>(lista: T[], porPagina: number, clave = ""): Tramo<T> {
  const [pagina, setPagina] = useState(1);
  const [claveVista, setClaveVista] = useState(clave);
  // Ajustar el estado durante el render es lo que React recomienda para esto:
  // descarta este render y rehace el siguiente antes de tocar el DOM, así que
  // nadie llega a ver la página vieja aplicada a la lista nueva.
  if (clave !== claveVista) {
    setClaveVista(clave);
    setPagina(1);
  }

  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, totalPaginas);
  const desde = (actual - 1) * porPagina;
  const visibles = useMemo(() => lista.slice(desde, desde + porPagina), [lista, desde, porPagina]);

  return {
    visibles,
    pagina: actual,
    totalPaginas,
    desde,
    hasta: Math.min(desde + porPagina, total),
    total,
    irA: setPagina,
  };
}
