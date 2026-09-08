import { Link } from "@tanstack/react-router";
import { CloudOff, LayoutGrid, RefreshCw, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { useEstadoEvento } from "@/lib/estado-evento";
import type { Modo } from "@/lib/escaneo";
import { cn } from "@/lib/utils";

const RUTAS = [
  { to: "/captura", label: "Sesión" },
  { to: "/captura/escaneo", label: "Escaneo" },
  { to: "/captura/taller", label: "Taller" },
  { to: "/captura/historial", label: "Historial" },
] as const;

/**
 * Indicador de conexión. Va en la barra superior de todas las pantallas de
 * captura porque es la información que decide si el capturista puede seguir o
 * tiene que avisar: un corte de red con 300 personas formadas no puede
 * descubrirse al final del día.
 */
export function BarraConexion() {
  const { enLinea, pendientes, alternarConexion } = useEstadoEvento();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold",
        enLinea ? "bg-estado-pagado text-white" : "bg-estado-discrepancia text-white",
      )}
    >
      <span className="flex items-center gap-2">
        {enLinea ? (
          <Wifi className="size-4" aria-hidden />
        ) : (
          <CloudOff className="size-4" aria-hidden />
        )}
        {enLinea
          ? "EN LÍNEA"
          : `SIN CONEXIÓN — ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`}
      </span>
      <button
        onClick={alternarConexion}
        title="Control de desarrollo: alterna la conexión para poder evaluar el modo sin red"
        className="flex h-8 items-center gap-1 rounded-md bg-black/20 px-2 text-xs font-medium hover:bg-black/30"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {enLinea ? "Simular caída" : "Reconectar"}
      </button>
    </div>
  );
}

/** Control de modo, siempre visible: en la puerta el personal se redistribuye. */
export function SelectorModo({ compacto = false }: { compacto?: boolean }) {
  const { sesion, setSesion } = useEstadoEvento();
  const modos: { valor: Modo; etiqueta: string }[] = [
    { valor: "entrada", etiqueta: "ENTRADA" },
    { valor: "salida", etiqueta: "SALIDA" },
    { valor: "taller", etiqueta: "TALLER" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1" role="group" aria-label="Modo de captura">
      {modos.map((m) => (
        <button
          key={m.valor}
          onClick={() => setSesion({ modo: m.valor })}
          aria-pressed={sesion.modo === m.valor}
          className={cn(
            "rounded-md border font-bold tracking-wide transition-colors",
            compacto ? "min-h-11 text-xs" : "min-h-14 text-sm",
            sesion.modo === m.valor
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          {m.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Marco de las pantallas de captura: pensado para un teléfono en una mano. */
export function PantallaCaptura({
  titulo,
  children,
  sinNav = false,
}: {
  titulo: string;
  children: ReactNode;
  sinNav?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BarraConexion />
      <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
        <p className="truncate text-sm font-bold">{titulo}</p>
        <Link
          to="/"
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Ir al índice del prototipo"
        >
          <LayoutGrid className="size-4" />
        </Link>
      </header>
      {!sinNav ? (
        <nav className="flex gap-1 border-b border-border bg-card px-2 py-1">
          {RUTAS.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              className="flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              {r.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
