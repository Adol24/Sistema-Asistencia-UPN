import { Link } from "@tanstack/react-router";
import { ImageUp, LogOut, QrCode, Route as RouteIcon } from "lucide-react";

import { ENLACE_NAV } from "@/lib/estilos";
import { usePortal } from "@/lib/portal";
import { AvisoCurp } from "@/components/aviso-curp";
import type { RutaConstruida } from "@/lib/mapa-pantallas";

const items: { to: RutaConstruida; label: string; icono: typeof QrCode }[] = [
  { to: "/portal/estado", label: "Estado", icono: RouteIcon },
  { to: "/portal/qr", label: "Mis códigos", icono: QrCode },
  { to: "/portal/evidencias", label: "Evidencias", icono: ImageUp },
];

/*
 * La pestaña «Constancia» está oculta por ahora, a petición de Adol
 * (2026-10-21) — no por el motivo de la vez anterior.
 *
 * Esta vez NO es por el falso rechazo de 2026-09-23 (`109fbc6`): ese
 * problema ya no existe —el evento pasó y `/routes/portal.constancia.tsx`
 * usa un tercer estado neutral—. La pantalla sigue viva y completa en
 * `/portal/constancia`; solo se quitó el enlace de este menú. Para volver a
 * enseñarla, regresa `{ to: "/portal/constancia", label: "Constancia", icono:
 * Award }` a `items` (import `Award` de `lucide-react`) y el `grid-cols-3`
 * de abajo a `grid-cols-4`.
 */

/**
 * Navegación del portal del participante.
 *
 * Va con icono sobre etiqueta y no en una sola línea de texto porque estas
 * secciones se tocan desde un teléfono, muchas veces formado en la entrada:
 * con texto a una sola línea no caben lado a lado en una pantalla de 320 px,
 * y encogerlas hasta que quepan deja botones que se fallan al primer
 * intento. Apilado, cada destino conserva su área táctil completa y el
 * icono lo hace reconocible de un vistazo.
 */
export function PortalNav() {
  const { cerrar } = usePortal();
  return (
    <div className="mb-5 grid gap-2">
      <AvisoCurp />
      <nav
        aria-label="Secciones del portal"
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1"
      >
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            {...ENLACE_NAV}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold leading-none transition-colors sm:flex-row sm:gap-2 sm:text-sm"
          >
            <i.icono className="size-4 shrink-0" aria-hidden />
            {i.label}
          </Link>
        ))}
      </nav>
      {/*
       * La salida, que no existía.
       *
       * `cerrar()` estaba definido y exportado en el contexto desde siempre y no
       * lo llamaba ninguna pantalla: no había forma de salir. Y lo guardado no
       * es un permiso caducable, son las credenciales en claro —folio y
       * matrícula— en `sessionStorage`.
       *
       * Cerrar la pestaña las borra, pero eso es justo lo que no hace quien
       * consulta su QR desde la computadora de la sala de cómputo o el teléfono
       * de un compañero: navega a otra página y devuelve el aparato. El
       * siguiente que abre esa pestaña entra directo a sus datos.
       */}
      <button
        onClick={cerrar}
        className="mx-auto flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-3.5 shrink-0" aria-hidden />
        Salir del portal
      </button>
    </div>
  );
}
