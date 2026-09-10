import { Link } from "@tanstack/react-router";
import { Award, ImageUp, QrCode, Route as RouteIcon } from "lucide-react";

import type { RutaConstruida } from "@/lib/mapa-pantallas";

const items: { to: RutaConstruida; label: string; icono: typeof QrCode }[] = [
  { to: "/portal/estado", label: "Estado", icono: RouteIcon },
  { to: "/portal/qr", label: "Mi QR", icono: QrCode },
  { to: "/portal/evidencias", label: "Evidencias", icono: ImageUp },
  { to: "/portal/constancia", label: "Constancia", icono: Award },
];

/**
 * Navegación del portal del participante.
 *
 * Va con icono sobre etiqueta y no en una sola línea de texto porque estas
 * cuatro secciones se tocan desde un teléfono, muchas veces formado en la
 * entrada: «Evidencias» y «Constancia» no caben lado a lado con texto legible en
 * una pantalla de 320 px, y encogerlas hasta que quepan deja botones que se
 * fallan al primer intento. Apilado, cada destino conserva su área táctil
 * completa y el icono lo hace reconocible de un vistazo.
 */
export function PortalNav() {
  return (
    <nav
      aria-label="Secciones del portal"
      className="mb-5 grid grid-cols-4 gap-1 rounded-lg border border-border bg-card p-1"
    >
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          // Aquí el hover ya estaba bien separado; se le añade al activo el
          // suyo para que no parezca que dejó de responder al tocarlo.
          activeProps={{
            className: "bg-primary text-primary-foreground hover:bg-primary/90",
          }}
          inactiveProps={{
            className: "text-muted-foreground hover:bg-muted hover:text-foreground",
          }}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold leading-none transition-colors sm:flex-row sm:gap-2 sm:text-sm"
        >
          <i.icono className="size-4 shrink-0" aria-hidden />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
