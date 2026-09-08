import { useEffect } from "react";

/**
 * Publica cuánto tapa el teclado, en `--teclado`.
 *
 * `interactive-widget=resizes-content` resuelve esto en Chrome y Android, pero
 * Safari en iOS lo ignora: ahí el teclado encoge el área **visible** sin tocar
 * la maqueta. La página sigue midiendo la pantalla entera, así que no hay nada
 * que desplazar y el botón que quedó debajo del teclado es inalcanzable —el
 * navegador tampoco puede acercarlo, porque no hay recorrido—.
 *
 * `visualViewport` sí sabe la diferencia. Con ella se añade abajo exactamente el
 * hueco que el teclado ocupa, lo que devuelve recorrido a la página y deja que
 * el navegador acerque el campo enfocado.
 *
 * Se expone como variable CSS y no como estado de React a propósito: el teclado
 * se abre y se cierra constantemente mientras alguien escribe, y volver a
 * dibujar el árbol en cada cambio provocaría tirones justo cuando se está
 * capturando.
 */
export function useAltoTeclado(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const actualizar = () => {
      // Lo que el teclado tapa por abajo: la ventana completa menos lo visible,
      // descontando lo que ya se desplazó hacia arriba.
      const tapado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Por debajo de 80 px casi siempre es la barra del navegador
      // apareciendo o desapareciendo, no un teclado.
      document.documentElement.style.setProperty("--teclado", tapado > 80 ? `${tapado}px` : "0px");
    };

    actualizar();
    vv.addEventListener("resize", actualizar);
    vv.addEventListener("scroll", actualizar);
    return () => {
      vv.removeEventListener("resize", actualizar);
      vv.removeEventListener("scroll", actualizar);
      document.documentElement.style.removeProperty("--teclado");
    };
  }, []);
}
