import { Link } from "@tanstack/react-router";
import { ImageUp, LogOut, QrCode, Route as RouteIcon } from "lucide-react";

import { ENLACE_NAV } from "@/lib/estilos";
import { usePortal } from "@/lib/portal";
import type { RutaConstruida } from "@/lib/mapa-pantallas";

const items: { to: RutaConstruida; label: string; icono: typeof QrCode }[] = [
  { to: "/portal/estado", label: "Estado", icono: RouteIcon },
  { to: "/portal/qr", label: "Mis códigos", icono: QrCode },
  { to: "/portal/evidencias", label: "Evidencias", icono: ImageUp },
];

/*
 * Aquí había una cuarta pestaña, «Constancia», y se quitó a propósito.
 *
 * Enseñaba el veredicto de `v_elegibles` —pagó, entró su día y, si es alumno,
 * dos evidencias aprobadas— con una palomita o una tacha por requisito. Dos de
 * los tres SOLO se pueden cumplir durante el evento o después, así que durante
 * las semanas previas cualquiera que la abriera leía «Todavía no cumples los
 * requisitos» con tachas rojas sobre cosas que no estaban en su mano. No había
 * nada mal en su registro: el evento no había ocurrido.
 *
 * Un rechazo que no se puede accionar no informa, alarma, y genera justo las
 * preguntas que la pantalla venía a evitar.
 *
 * Lo que el alumno necesita saber sigue estando, repartido donde sí es
 * accionable: las condiciones generales en `/comprobante` —«El pre-registro no
 * da derecho a la constancia»—, el estado de su pago en `/portal/estado` y el
 * de cada evidencia, una por una, en `/portal/evidencias`.
 *
 * Y no se pierde el caso que importa. Quien asistió pero pasó sin que le
 * escanearan desaparece del listado de elegibles; eso lo sigue encontrando
 * `/admin/elegibles`, que lista a los no elegibles con el motivo textual. Lo
 * que ya no ocurre es que el alumno lo descubra por su cuenta.
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
