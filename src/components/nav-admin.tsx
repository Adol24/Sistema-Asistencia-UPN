import { NavPanel } from "@/components/layouts";
import { modulos, type RutaConstruida } from "@/lib/mapa-pantallas";

/**
 * Barra del panel de administración, derivada de `mapa-pantallas.ts`.
 *
 * En la tanda 2 se retiró la versión escrita a mano porque duplicaba esa lista
 * y las dos se habrían desincronizado. Ahora las entradas salen del mismo mapa
 * que alimenta el índice, y `NavPanel` atenúa solo lo que siga pendiente: al
 * construir una pantalla basta con cambiar su estado en el mapa.
 *
 * Las etiquetas se acortan porque en una barra no cabe «Emisión de constancias».
 */
const ABREVIATURAS: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/monitoreo": "Monitoreo",
  "/admin/talleres": "Talleres",
  "/admin/configuracion": "Configuración",
  "/admin/padron": "Padrón",
  "/admin/usuarios": "Usuarios",
  "/admin/soporte": "Soporte",
  "/admin/bitacora": "Bitácora",
  "/admin/reportes": "Reportes",
  "/admin/elegibles": "Elegibles",
};

// Todas las pantallas del módulo están construidas, así que sus rutas son
// `RutaConstruida` y el enlace se valida en compilación.
const entradas =
  modulos
    .find((m) => m.titulo === "Administración")
    ?.rutas.filter((r) => r.estado === "listo")
    .map((r) => ({ to: r.to as RutaConstruida, label: ABREVIATURAS[r.to] ?? r.label })) ?? [];

export const navAdmin = <NavPanel items={entradas} />;
