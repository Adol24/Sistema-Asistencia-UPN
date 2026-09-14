import type { ReactNode } from "react";

import { opcion } from "@/lib/estilos";
import { cn } from "@/lib/utils";

/**
 * Una fila de botones donde solo uno está elegido: el filtro de una lista.
 *
 * Estaba copiado en tres pantallas, y en una de ellas —la conciliación— le
 * faltaban `type="button"` y `aria-pressed`. Lo primero hace que el botón envíe
 * el formulario que lo rodea; lo segundo es lo único que le dice a un lector de
 * pantalla cuál de los cuatro está puesto. Ninguna de las dos ausencias se ve
 * mirando la pantalla, que es exactamente por lo que conviene que el marcado
 * esté escrito una sola vez.
 *
 * @param opciones Pares de valor y etiqueta. La etiqueta admite marcado porque
 *   los filtros llevan su cuenta dentro —«11 con error»—, que es la razón de
 *   pulsarlos.
 * @param claseBoton Se suma a la de cada botón, para el alto y la separación.
 */
export function GrupoFiltro<T extends string>({
  valor,
  alElegir,
  opciones,
  className,
  claseBoton,
}: {
  valor: T;
  alElegir: (v: T) => void;
  opciones: readonly (readonly [T, ReactNode])[];
  className?: string;
  claseBoton?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {opciones.map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          onClick={() => alElegir(v)}
          aria-pressed={valor === v}
          className={cn(
            "flex h-10 items-center rounded-md border px-3 text-sm font-medium",
            opcion(valor === v),
            claseBoton,
          )}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
