/**
 * Clases que dicen algo del estado, no de la forma.
 *
 * Lo de aquí NO es «utilidades de estilo». Es lo contrario de lo que hace
 * Tailwind bien: una decisión de diseño que tiene que verse igual en todas
 * partes y que, escrita a mano en cada sitio, se desvía sin que nadie lo note.
 * La forma —el alto, el redondeo, la rejilla— sigue viviendo en cada pantalla,
 * porque ahí sí cambia a propósito.
 */

/**
 * Un botón que se puede elegir: día, punto de captura, filtro, perfil.
 *
 * Estaba escrito a mano en nueve sitios, siempre las mismas dos cadenas. Eso no
 * es repetición inocente: el día que el primario cambie de tono habrá que
 * encontrar los nueve, y el que se quede atrás no se va a ver hasta que alguien
 * abra esa pantalla concreta con algo seleccionado.
 *
 * Solo el color y el borde. El alto y el redondeo los pone cada sitio: no es lo
 * mismo la casilla de 80 píxeles con la que se elige el día en un teléfono, con
 * guantes, que la pastilla de un filtro en el panel.
 */
export const opcion = (activa: boolean) =>
  activa
    ? "border-primary bg-primary text-primary-foreground"
    : "border-border bg-card hover:bg-muted";
