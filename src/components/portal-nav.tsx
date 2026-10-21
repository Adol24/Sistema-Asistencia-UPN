import { Link } from "@tanstack/react-router";
import { Award, ImageUp, LogOut, QrCode, Route as RouteIcon } from "lucide-react";

import { ENLACE_NAV } from "@/lib/estilos";
import { usePortal } from "@/lib/portal";
import type { RutaConstruida } from "@/lib/mapa-pantallas";

const items: { to: RutaConstruida; label: string; icono: typeof QrCode }[] = [
  { to: "/portal/estado", label: "Estado", icono: RouteIcon },
  { to: "/portal/qr", label: "Mis códigos", icono: QrCode },
  { to: "/portal/evidencias", label: "Evidencias", icono: ImageUp },
  { to: "/portal/constancia", label: "Constancia", icono: Award },
];

/*
 * Esta pestaña se había quitado el 2026-09-23 (`109fbc6`) porque mostraba el
 * veredicto con una palomita o una tacha por requisito, y dos de los tres
 * —entrada su día, evidencias de los otros— solo se podían cumplir durante el
 * evento o después. En las semanas previas, cualquiera que la abriera leía
 * «Todavía no cumples los requisitos» con tachas rojas sobre cosas que no
 * estaban en su mano: un rechazo que no se puede accionar no informa, alarma.
 *
 * El evento ya ocurrió (15-17 de octubre), así que esa ventana de falso
 * rechazo ya pasó, y `/routes/portal.constancia.tsx` vuelve con un tercer
 * estado explícito —"se confirma cuando toque", ni palomita ni tacha— para que
 * no vuelva a ocurrir en la próxima edición. El veredicto del evento sigue
 * siendo el de `v_elegibles` (única regla desde la migración 53) y el del
 * taller el de `elegibilidadTaller`: esta pestaña no vuelve a escribir una
 * regla propia.
 */

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
  const { cerrar } = usePortal();
  return (
    <div className="mb-5 grid gap-2">
      <nav
        aria-label="Secciones del portal"
        className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-card p-1"
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
