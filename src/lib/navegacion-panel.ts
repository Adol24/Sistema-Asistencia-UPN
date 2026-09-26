/**
 * Qué lleva la barra lateral de cada zona interna, y en qué orden.
 *
 * Las barras vivían una en `nav-admin.tsx` y otra en `nav-financieros.tsx`, y
 * cada pantalla tenía que acordarse de pasar la suya por `nav={navAdmin}`. Eran
 * quince sitios donde equivocarse: una pantalla nueva que olvidara el atributo
 * se quedaba sin barra, y no hay nada en la pantalla que lo delate salvo
 * abrirla. La zona ya viaja en `area` —la misma que decide quién puede entrar—,
 * así que la barra se deduce de ahí y deja de poder faltar.
 *
 * Lo que cambia frente a las barras de antes es el agrupado. Administración
 * tiene diez destinos; en una hilera son diez palabras sueltas que hay que leer
 * enteras para encontrar una, y en una columna sin cortes son diez renglones
 * iguales. Agrupados se busca por zona —«esto es de participantes»— y solo se
 * leen los tres de ese grupo.
 */

import {
  BookOpenCheck,
  CalendarCog,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Receipt,
  ScrollText,
  Upload,
  UserCheck,
  UserSearch,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { RutaConstruida } from "@/lib/mapa-pantallas";
import type { Area } from "@/lib/roles";

export interface EnlacePanel {
  to: RutaConstruida;
  /** Corto a propósito: es una columna de 16rem, no una frase. */
  label: string;
  icono: LucideIcon;
}

export interface GrupoPanel {
  /**
   * El rótulo del grupo, o vacío para el primer bloque.
   *
   * El primero no lleva rótulo porque va pegado al encabezado de la zona, que
   * ya dice dónde está uno. Rotularlo «General» sería una palabra que no
   * distingue nada de nada.
   */
  titulo: string;
  enlaces: EnlacePanel[];
}

export const NAVEGACION_PANEL: Partial<Record<Area, GrupoPanel[]>> = {
  admin: [
    {
      titulo: "",
      enlaces: [
        { to: "/admin", label: "Dashboard", icono: LayoutDashboard },
        { to: "/admin/monitoreo", label: "Monitoreo", icono: ListChecks },
      ],
    },
    {
      titulo: "Participantes",
      enlaces: [
        { to: "/admin/padron", label: "Padrón", icono: Upload },
        { to: "/admin/preinscritos", label: "Preinscritos", icono: UserCheck },
        { to: "/admin/elegibles", label: "Elegibles", icono: UserSearch },
        { to: "/admin/soporte", label: "Soporte", icono: LifeBuoy },
      ],
    },
    {
      titulo: "Evento",
      enlaces: [
        { to: "/admin/talleres", label: "Talleres", icono: GraduationCap },
        { to: "/admin/configuracion", label: "Configuración", icono: CalendarCog },
      ],
    },
    {
      titulo: "Sistema",
      enlaces: [
        { to: "/admin/usuarios", label: "Usuarios y roles", icono: Users },
        { to: "/admin/reportes", label: "Reportes", icono: FileSpreadsheet },
        { to: "/admin/bitacora", label: "Bitácora", icono: ScrollText },
      ],
    },
  ],
  financieros: [
    {
      titulo: "",
      enlaces: [
        { to: "/financieros", label: "Lista y búsqueda", icono: ClipboardList },
        { to: "/financieros/ficha", label: "Ficha y pago", icono: Wallet },
      ],
    },
    {
      titulo: "Lotes",
      enlaces: [
        { to: "/financieros/carga-masiva", label: "Carga masiva", icono: Receipt },
        { to: "/financieros/conciliacion", label: "Conciliación", icono: BookOpenCheck },
      ],
    },
  ],
};
