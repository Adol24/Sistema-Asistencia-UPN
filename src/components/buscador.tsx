import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * El campo de buscar, con su lupa dentro.
 *
 * Cinco pantallas repetían las mismas nueve líneas: el contenedor relativo, la
 * lupa posicionada a mano con `top-1/2 -translate-y-1/2`, y el `pl-9` del
 * campo para que el texto no se escriba encima de ella. Esas tres medidas
 * tienen que cuadrar entre sí, y copiadas cinco veces no hay nada que las
 * mantenga cuadradas.
 *
 * @param etiqueta Para quien usa lector de pantalla. Es obligatoria a
 *   propósito: la lupa no la lee nadie, y sin esto el campo se anuncia como
 *   «cuadro de texto» a secas. «Buscar participante» y «Filtrar la tabla de
 *   conciliación» dicen cosas distintas, así que no se puede poner una sola por
 *   defecto.
 * @param alto `h-12` donde se toca con el pulgar de pie —la lista del taller—,
 *   `h-11` en el resto del panel.
 */
export function Buscador({
  valor,
  alCambiar,
  marcador,
  etiqueta,
  className,
  alto = "h-11",
}: {
  valor: string;
  alCambiar: (v: string) => void;
  marcador: string;
  etiqueta: string;
  className?: string;
  alto?: "h-11" | "h-12";
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={marcador}
        className={cn("pl-9", alto)}
        aria-label={etiqueta}
      />
    </div>
  );
}
