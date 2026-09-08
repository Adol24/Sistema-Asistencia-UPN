import { useEffect, useState } from "react";
import { FlaskConical, Moon, Sun, X } from "lucide-react";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { Button } from "@/components/ui/button";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Interruptor de tema. Los tokens de color existen completos en los dos modos,
 * pero sin esto solo se llegaba al oscuro poniendo la clase `.dark` a mano.
 *
 * No se guarda en localStorage a propósito: ahí solo vive la cola de escaneos
 * sin conexión. El tema vuelve al claro al recargar, como todo lo demás del
 * prototipo.
 */
function useTema() {
  const [oscuro, setOscuro] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
  }, [oscuro]);
  return [oscuro, setOscuro] as const;
}

export function SelectorPrueba() {
  const [abierto, setAbierto] = useState(false);
  const [oscuro, setOscuro] = useTema();
  const { participante, setFolio } = usePrototipo();
  const { participantes, estadoDe, conectado, cargandoDatos } = useEstadoEvento();

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {abierto ? (
        <div className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Participante de prueba</p>
            <button
              onClick={() => setAbierto(false)}
              aria-label="Cerrar selector de prueba"
              className="flex size-11 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          {/* De dónde salen los datos. Sin esto, quien revisa no puede saber si
              está viendo la base real o los datos simulados, y las dos cosas se
              ven exactamente igual. */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                cargandoDatos
                  ? "animate-pulse bg-estado-discrepancia"
                  : conectado
                    ? "bg-estado-pagado"
                    : "bg-muted-foreground",
              )}
              aria-hidden
            />
            <span className="text-muted-foreground">
              {cargandoDatos
                ? "Cargando de la base…"
                : conectado
                  ? "Datos reales, desde Supabase"
                  : "Datos simulados, en memoria"}
            </span>
          </div>
          <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs">
            <p className="font-semibold">{participante.nombre}</p>
            <p className="text-muted-foreground">{participante.folio}</p>
          </div>
          <ScrollArea className="h-72">
            <ul className="divide-y divide-border">
              {participantes.map((p) => (
                <li key={p.folio}>
                  <button
                    onClick={() => setFolio(p.folio)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted",
                      p.folio === participante.folio && "bg-secondary",
                    )}
                  >
                    <span className="text-xs font-semibold">{p.nombre}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <PerfilBadge perfil={p.perfil} />
                      <EstadoPagoBadge estado={estadoDe(p).evento} />
                      <span className="text-[11px] text-muted-foreground">
                        {p.folio} · Día {p.dia}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">Tema</span>
            <button
              type="button"
              onClick={() => setOscuro(!oscuro)}
              aria-pressed={oscuro}
              className="flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold hover:bg-muted"
            >
              {oscuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {oscuro ? "Cambiar a claro" : "Cambiar a oscuro"}
            </button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setAbierto(true)}
          className="h-12 gap-2 rounded-full shadow-lg"
          aria-label="Abrir selector de participante de prueba"
        >
          <FlaskConical className="size-4" />
          Prototipo
        </Button>
      )}
    </div>
  );
}
