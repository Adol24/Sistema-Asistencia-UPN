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

/**
 * El enlace de una barra de navegación, según sea o no la sección actual.
 *
 * **El color del hover va aquí y no en la clase base del enlace, y esa es toda
 * la razón de que esto exista.** Estaba en la base, así que también se le
 * aplicaba al enlace activo; y en Tailwind las variantes `hover:` se generan
 * DESPUÉS de las utilidades sin variante, de modo que `hover:bg-muted` le
 * ganaba a `bg-primary`: pasar el ratón por encima de la sección en la que ya
 * estabas la volvía gris, y su texto blanco quedaba casi ilegible sobre el gris
 * claro. Separados no compiten: el activo solo se aclara un poco, que es la
 * única respuesta que tiene sentido para algo donde ya estás.
 *
 * Estaba escrito en las dos barras que hay —la del panel y la del portal—, y
 * una tercera lo habría vuelto a equivocar. Se reparte con `{...ENLACE_NAV}`;
 * la forma —el alto, la rejilla, el icono— la sigue poniendo cada barra.
 */
export const ENLACE_NAV = {
  activeProps: { className: "bg-primary text-primary-foreground hover:bg-primary/90" },
  inactiveProps: { className: "text-muted-foreground hover:bg-muted hover:text-foreground" },
} as const;
