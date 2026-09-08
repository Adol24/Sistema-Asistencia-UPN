import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useEstadoEvento } from "@/lib/estado-evento";
import { estadoDeRuta, type RutaConstruida } from "@/lib/mapa-pantallas";
import { cn } from "@/lib/utils";

export function BarraSuperior({ titulo, volverA }: { titulo?: string; volverA?: string }) {
  // El nombre del evento se edita en administración: la barra que lo lleva en
  // todas las pantallas tiene que leerlo del contexto, no del mock.
  const { configuracion: evento } = useEstadoEvento();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        {volverA ? (
          <Link
            to={volverA}
            className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo ?? evento.nombre}</p>
          {titulo ? (
            <p className="truncate text-xs text-muted-foreground">{evento.nombre}</p>
          ) : null}
        </div>
        <Link
          to="/"
          className="flex h-11 items-center gap-2 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <LayoutGrid className="size-4" />
          Índice
        </Link>
      </div>
    </header>
  );
}

export function PantallaPublica({
  titulo,
  volverA,
  children,
  ancho = "md",
}: {
  titulo?: string;
  volverA?: string;
  children: ReactNode;
  ancho?: "md" | "lg";
}) {
  return (
    <div className="min-h-screen bg-background">
      <BarraSuperior titulo={titulo} volverA={volverA} />
      <main
        className={cn(
          "mx-auto w-full px-4 py-6 sm:py-10",
          ancho === "md" ? "max-w-xl" : "max-w-3xl",
        )}
      >
        {children}
      </main>
    </div>
  );
}

export function PantallaPanel({
  titulo,
  descripcion,
  acciones,
  nav,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <BarraSuperior titulo={titulo} />
      {nav ? (
        <div className="border-b border-border bg-card print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2">{nav}</div>
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
            {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
          </div>
          {acciones}
        </div>
        {children}
      </main>
    </div>
  );
}

/**
 * Barra de navegación de un panel. Las entradas cuya pantalla todavía no se
 * construye se dibujan atenuadas y sin comportamiento de clic, en lugar de
 * enlazar a una ruta inexistente. El estado se consulta en `mapa-pantallas`,
 * que es la misma fuente de verdad que alimenta el índice.
 */
export function NavPanel({ items }: { items: { to: RutaConstruida; label: string }[] }) {
  return (
    <>
      {items.map((i) =>
        estadoDeRuta(i.to) === "listo" ? (
          <Link
            key={i.to}
            to={i.to}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            className="flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            {i.label}
          </Link>
        ) : (
          <span
            key={i.to}
            aria-disabled="true"
            title="Esta pantalla aún no se construye"
            className="flex h-10 cursor-not-allowed items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground opacity-50"
          >
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {i.label}
          </span>
        ),
      )}
    </>
  );
}
