import { useEstadoEvento } from "@/lib/estado-evento";
import { cn } from "@/lib/utils";

/**
 * Si la escucha en vivo está puesta de verdad, o no.
 *
 * **Decir «en vivo» cuando nadie lo comprobó es peor que no decir nada**, porque
 * quien vigila una pantalla deja de actualizarla creyendo que no hace falta. Por
 * eso `enVivo` solo se enciende cuando el canal contestó `SUBSCRIBED`, y por eso
 * el sello dice las dos cosas y no solo la buena.
 *
 * Estaba escrito a mano en la lista de Servicios Financieros y, en otra forma,
 * en el armazón de captura. Iba a ser la tercera copia en monitoreo —la
 * pantalla que literalmente se llama «en vivo» y era la única que no lo decía—,
 * y tres versiones del mismo aviso es la manera de que una se quede diciendo
 * que todo va bien cuando ya no.
 */
export function SelloEnVivo({ className }: { className?: string }) {
  const { enVivo } = useEstadoEvento();
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
        enVivo
          ? "border-estado-pagado/40 text-estado-pagado"
          : "border-border text-muted-foreground",
        className,
      )}
      title={
        enVivo
          ? "Los cambios de otras pantallas llegan solos, sin recargar."
          : "Sin escucha en vivo: lo que se ve puede estar viejo. Pulsa Actualizar."
      }
    >
      <span
        className={cn(
          "size-2 rounded-full",
          enVivo ? "animate-pulse bg-estado-pagado" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      {enVivo ? "En vivo" : "Sin conexión en vivo"}
    </span>
  );
}
