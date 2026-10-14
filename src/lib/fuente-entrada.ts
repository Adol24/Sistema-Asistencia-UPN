/**
 * Qué aparato lee el código, compartido entre `/captura/escaneo` y
 * `/captura/taller`.
 *
 * Vive en `localStorage` y no en el estado de la sesión: es una preferencia
 * del EQUIPO —la laptop de esa puerta trae un lector USB enchufado, o no—,
 * no de la sesión de captura, que cambia de capturista varias veces en el
 * día sin que el cable se mueva de sitio. Y es la MISMA preferencia en las
 * dos pantallas: quien trae un lector conectado lo trae para las dos, no
 * solo para la puerta.
 */

export type FuenteEntrada = "camara" | "lector";

const CLAVE_FUENTE = "captura.fuenteEntrada";

export const fuenteGuardada = (): FuenteEntrada => {
  try {
    return window.localStorage.getItem(CLAVE_FUENTE) === "lector" ? "lector" : "camara";
  } catch {
    return "camara";
  }
};

export const guardarFuente = (valor: FuenteEntrada): void => {
  try {
    window.localStorage.setItem(CLAVE_FUENTE, valor);
  } catch {
    /* Sin almacenamiento, el ajuste dura lo que la pestaña. */
  }
};

/*
 * El lector físico manda el código de tecla de EE.UU., y en un teclado
 * configurado en español esa tecla ya no es «-»: es «'». El folio llega como
 * PRE'00801 en vez de PRE-00801, y no es un dato distinto, es el mismo guion
 * mal traducido por la distribución del teclado del equipo. Aplica en
 * cualquier campo que un lector pueda llenar, no solo en el de la puerta.
 */
export const corrigeApostrofeDeEscaner = (valor: string) => valor.replace(/['’]/g, "-");
