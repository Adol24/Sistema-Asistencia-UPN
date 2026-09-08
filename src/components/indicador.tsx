import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de indicador de los paneles.
 *
 * Estaba definida tres veces con nombres distintos —`Indicador` en el dashboard,
 * `Metrica` en monitoreo y `Tarjeta` en conciliación— y el mismo marcado. Si el
 * mismo dato se pinta distinto en dos pantallas, quien opera aprende dos
 * vocabularios para lo mismo.
 */
export function Indicador({
  icono,
  etiqueta,
  valor,
  detalle,
  tono,
  destacada,
  className,
}: {
  icono?: ReactNode;
  etiqueta: string;
  valor: string;
  detalle?: string;
  /** Ámbar para lo que requiere atención, rojo para lo que ya es un problema. */
  tono?: "alerta" | "critico";
  destacada?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border p-4",
        destacada ? "border-primary/40 bg-secondary" : "bg-card",
        !destacada && tono === "alerta" && "border-estado-discrepancia/40",
        !destacada && tono === "critico" && "border-estado-cancelado/40",
        !destacada && !tono && "border-border",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icono}
        {etiqueta}
      </p>
      {/*
       * `tabular-nums` no es cosmético: en una rejilla de indicadores que se
       * refresca, las cifras proporcionales cambian de ancho al pasar de 1 a 2
       * y las columnas bailan. Con cifras de ancho fijo el ojo puede comparar
       * dos tarjetas sin volver a buscarlas.
       */}
      <p
        className={cn(
          "mt-2 text-3xl font-extrabold tabular-nums tracking-tight",
          tono === "alerta" && "text-estado-discrepancia",
          tono === "critico" && "text-estado-cancelado",
        )}
      >
        {valor}
      </p>
      {detalle ? <p className="mt-1.5 text-xs text-muted-foreground">{detalle}</p> : null}
    </article>
  );
}
