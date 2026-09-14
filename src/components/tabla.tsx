import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * La tabla del panel interno.
 *
 * Estaba escrita a mano en nueve pantallas, y de las nueve salieron dos tablas
 * distintas: seis con el encabezado en negritas sobre `bg-muted/50` y filas
 * separadas por abajo, y tres con el encabezado en versalitas grises sobre
 * `bg-muted/60` y filas separadas por arriba. Ninguna de las dos fue una
 * decisión de diseño; fue la copia yéndose de las manos, igual que había
 * pasado con `EstadoVacio`. Aquí queda una sola, la de las seis.
 *
 * El ancho mínimo va en un estilo y no en una clase porque `min-w-[52rem]` es
 * un valor arbitrario de Tailwind: se genera leyendo el código fuente, así que
 * una clase armada con una variable no existiría en la hoja de estilos.
 *
 * @param columnas Los encabezados, en orden. Una cadena vacía deja la columna
 *   sin rótulo, que es lo que quiere la de los botones de acción.
 * @param anchoMinimo A partir de dónde deja de encogerse y aparece el
 *   desplazamiento horizontal. En móvil todas las tablas de aquí se desplazan.
 * @param vacio Qué enseñar cuando no hay ni una fila. Ocupa el ancho entero;
 *   la pantalla solo dice qué va dentro.
 * @param claseColumnas Se suma a la de cada encabezado. Lo usa la pantalla de
 *   reportes, donde los rótulos no son palabras sino nombres de columna de un
 *   archivo —`monto_esperado_taller`— y se leen mejor monoespaciados.
 */
export function Tabla({
  columnas,
  anchoMinimo,
  vacio,
  claseColumnas,
  className,
  children,
}: {
  columnas: string[];
  anchoMinimo: string;
  vacio?: ReactNode;
  claseColumnas?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full text-sm" style={{ minWidth: anchoMinimo }}>
        <thead className="border-b border-border bg-muted/50 text-left">
          <tr>
            {columnas.map((c, i) => (
              <th key={c || `col-${i}`} className={cn("px-3 py-2 font-semibold", claseColumnas)}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {vacio ? (
            <tr>
              <td colSpan={columnas.length} className="px-3 py-10 text-center">
                {vacio}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Una fila. Separa por abajo menos la última, que ya tiene el borde de la caja.
 *
 * Pasa el resto de atributos al `<tr>` porque hay filas que se pulsan —la de
 * conciliación abre la ficha— y necesitan su `onClick`, su `tabIndex` y su
 * `onKeyDown` para que el teclado llegue igual que el ratón.
 */
export function Fila({ className, children, ...resto }: ComponentProps<"tr">) {
  return (
    <tr {...resto} className={cn("border-b border-border last:border-0", className)}>
      {children}
    </tr>
  );
}
