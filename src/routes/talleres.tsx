import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarRange, Clock, Info, MapPin, User } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { EstadoVacio } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/talleres")({
  head: () =>
    meta(
      "Catálogo de talleres — XIV Encuentro Internacional de Educación",
      "Consulta los 11 talleres del XIV Encuentro Internacional de Educación, su cupo disponible, horario y costo adicional. Puedes elegir máximo uno.",
    ),
  component: CatalogoTalleres,
});

function CatalogoTalleres() {
  const navigate = useNavigate();
  const { setBorrador } = usePrototipo();
  const { talleres: catalogo, configuracion } = useEstadoEvento();
  // Un taller inactivo deja de ofrecerse en el catálogo público.
  const talleres = catalogo.filter((t) => t.activo);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  return (
    <PantallaPublica
      volverA="/mi-dia"
      ancho="lg"
      titulo="Elige un taller (opcional)"
      descripcion="Puedes elegir máximo un taller. Cada taller tiene costo adicional y se paga por separado."
    >
      {seleccion ? (
        <Alert className="mb-5">
          <Info className="size-4" />
          <AlertTitle>Tu lugar queda apartado hasta el {configuracion.fechaLimite}</AlertTitle>
          <AlertDescription>Si no entregas tu comprobante antes, se libera.</AlertDescription>
        </Alert>
      ) : null}

      {talleres.length === 0 ? (
        <EstadoVacio
          icono={<Info className="size-8" aria-hidden />}
          titulo="Por ahora no hay talleres disponibles"
        >
          Puedes continuar sin taller; tu registro al evento no depende de esto.
        </EstadoVacio>
      ) : null}

      <ul className="grid gap-3">
        {talleres.map((t) => {
          const libres = t.cupoTotal - t.cupoOcupado;
          const lleno = libres <= 0;
          const pocos = libres > 0 && libres < 5;
          const elegido = seleccion === t.id;
          const atenuado = !!seleccion && !elegido;

          return (
            <li key={t.id}>
              <article
                className={cn(
                  "rounded-lg border bg-card p-4 transition-all",
                  lleno && "border-border bg-muted opacity-70",
                  elegido && "border-primary ring-2 ring-primary/25",
                  atenuado && !lleno && "opacity-50",
                  !lleno && !elegido && "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug">{t.nombre}</h2>
                  <span className="rounded-md border border-border px-2 py-1 text-[11px] font-bold tracking-wide">
                    {t.dias.length === 1 ? "1 DÍA" : "2 DÍAS"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.descripcion}</p>

                <dl className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <User className="size-4" aria-hidden /> {t.ponente}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarRange className="size-4" aria-hidden /> Día {t.dias.join(" y ")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="size-4" aria-hidden /> {t.horario}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden /> {t.lugar}
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-semibold">{moneda(t.costo)}</p>
                    {lleno ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Cupo lleno
                      </p>
                    ) : (
                      <p
                        className={cn(
                          "text-xs",
                          pocos
                            ? "font-semibold text-estado-discrepancia"
                            : "text-muted-foreground",
                        )}
                      >
                        {libres} {libres === 1 ? "lugar disponible" : "lugares disponibles"}
                        {pocos ? " — ¡últimos lugares!" : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={elegido ? "secondary" : "default"}
                    disabled={lleno}
                    className="h-11"
                    onClick={() => setSeleccion(elegido ? null : t.id)}
                  >
                    {lleno ? "Sin cupo" : elegido ? "Cambiar taller" : "Seleccionar"}
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 mt-6 grid gap-2 border-t border-border bg-background/95 py-4 backdrop-blur sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-12 text-base"
          onClick={() => {
            setBorrador({ tallerId: undefined });
            navigate({ to: "/pago" });
          }}
        >
          Continuar sin taller
        </Button>
        <Button
          className="h-12 text-base"
          disabled={!seleccion}
          onClick={() => {
            setBorrador({ tallerId: seleccion ?? undefined });
            navigate({ to: "/pago" });
          }}
        >
          Continuar con el taller elegido
        </Button>
      </div>
    </PantallaPublica>
  );
}
