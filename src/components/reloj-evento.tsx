import { Clock, RotateCcw } from "lucide-react";
import { useEstadoEvento } from "@/lib/estado-evento";
import { Rotulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { comoHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { Dia } from "@/dominio/tipos";

/**
 * El reloj con el que el monitoreo mide el ritmo de entrada.
 *
 * **Normalmente sigue la hora real, y eso es lo que hace falta el día del
 * evento.** El ritmo se calcula contra esta hora —personas entre el primer
 * escaneo y ahora—, así que una hora congelada da un ritmo falso, y más falso
 * cuanto más avanza la jornada: si nadie ha pasado en veinte minutos, el ritmo
 * tiene que caer, y con el reloj detenido se queda mintiendo.
 *
 * Antes SIEMPRE estaba detenido. Arrancaba a las 8:30 y no se movía salvo que
 * alguien arrastrara el deslizador, así que el día del evento el operador iba a
 * ver un ritmo calculado contra una hora inventada sin que nada se lo dijera.
 *
 * Se puede detener a propósito, y para eso está el control: sin el evento en
 * marcha hay tres escaneos de prueba y el ritmo sale en «0.3 por minuto», que no
 * enseña nada de lo que se verá con setecientas personas entrando en una hora.
 * Moverlo apaga el seguimiento y lo dice en pantalla.
 */
export function RelojEventoControl({ className }: { className?: string }) {
  const { reloj, setReloj, configuracion } = useEstadoEvento();
  const info = configuracion.dias.find((d) => d.dia === reloj.dia);

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2 rounded-lg border p-2",
        // El modo se ve antes de leer nada: en automático es una caja normal;
        // detenido, la franja ámbar de «esto no es lo que está pasando».
        reloj.automatico
          ? "border-border bg-card"
          : "border-estado-discrepancia/50 bg-estado-discrepancia-bg",
        className,
      )}
    >
      <Rotulo como="span" className="flex items-center gap-1 self-center">
        <Clock className="size-3.5" aria-hidden />
        {reloj.automatico ? "Hora real" : "Reloj detenido"}
      </Rotulo>

      <div className="flex gap-1" role="group" aria-label="Día del evento">
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
        <span className="sr-only">Hora del evento</span>
        <input
          type="range"
          min={7 * 60}
          max={15 * 60}
          step={5}
          value={reloj.minutos}
          onChange={(e) => setReloj({ minutos: Number(e.target.value) })}
          className="h-9 w-40 accent-[var(--color-primary)]"
          aria-label="Mover la hora del evento para ensayar"
        />
        <span className="w-14 font-mono text-sm font-bold">{comoHora(reloj.minutos)}</span>
      </label>

      {/*
        El camino de vuelta tiene que estar a la vista. Sin él, quien movió el
        deslizador para probar algo no tiene forma de saber que dejó el
        monitoreo midiendo contra una hora que ya no es.
      */}
      {reloj.automatico ? (
        <span className="self-center text-xs text-muted-foreground">{info?.lugar}</span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-9 self-center"
          onClick={() => setReloj({ automatico: true })}
        >
          <RotateCcw className="size-4" aria-hidden /> Volver a la hora real
        </Button>
      )}
    </div>
  );
}
