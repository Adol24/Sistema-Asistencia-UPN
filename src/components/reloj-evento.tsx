import { Clock } from "lucide-react";
import { useEstadoEvento } from "@/lib/estado-evento";
import { comoHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Dia } from "@/mocks/tipos";

/**
 * Reloj simulado del evento.
 *
 * El prototipo no corre el día del Encuentro, así que el dashboard y el
 * monitoreo necesitan poder situarse. Sin esto el ritmo sale en 0.3 por minuto y
 * la pantalla no transmite lo que se verá con 700 personas entrando en una hora.
 */
export function RelojEventoControl({ className }: { className?: string }) {
  const { reloj, setReloj, configuracion } = useEstadoEvento();
  const info = configuracion.dias.find((d) => d.dia === reloj.dia);

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-2",
        className,
      )}
    >
      <span className="flex items-center gap-1 self-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Clock className="size-3.5" aria-hidden /> Reloj simulado
      </span>
      <div className="flex gap-1" role="group" aria-label="Día simulado">
        {([1, 2, 3] as Dia[]).map((d) => (
          <button
            key={d}
            onClick={() => setReloj({ dia: d })}
            aria-pressed={reloj.dia === d}
            className={cn(
              "flex h-9 w-12 items-center justify-center rounded-md border text-xs font-bold",
              reloj.dia === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            D{d}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <span className="sr-only">Hora simulada</span>
        <input
          type="range"
          min={7 * 60}
          max={15 * 60}
          step={5}
          value={reloj.minutos}
          onChange={(e) => setReloj({ minutos: Number(e.target.value) })}
          className="h-9 w-40 accent-[var(--color-primary)]"
          aria-label="Hora simulada del evento"
        />
        <span className="w-14 font-mono text-sm font-bold">{comoHora(reloj.minutos)}</span>
      </label>
      <span className="self-center text-xs text-muted-foreground">{info?.sede}</span>
    </div>
  );
}
