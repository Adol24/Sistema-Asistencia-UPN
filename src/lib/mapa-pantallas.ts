/**
 * Mapa único de las pantallas del prototipo.
 *
 * Es la fuente de verdad para las barras de navegación de los paneles y para la
 * pantalla de 404: una entrada `pendiente` no se enlaza y, si alguien llega a
 * su URL, el 404 puede decir "aún no se construye" en lugar de "no existe".
 *
 * Para dar por construida una pantalla, cambia su `estado` a "listo" y agrega
 * su ruta a `RutaConstruida`.
 */

/** Rutas que existen realmente en `src/routes/`. */
export type RutaConstruida =
  | "/bienvenida"
  | "/alumno"
  | "/confirmar-nombre"
  | "/completar-datos"
  | "/registro"
  | "/mi-dia"
  | "/talleres"
  | "/pago"
  | "/comprobante"
  | "/portal"
  | "/portal/estado"
  | "/portal/qr"
  | "/portal/evidencias"
  | "/portal/constancia"
  | "/financieros"
  | "/financieros/ficha"
  | "/financieros/carga-masiva"
  | "/financieros/conciliacion"
  | "/captura"
  | "/captura/escaneo"
  | "/captura/taller"
  | "/captura/historial"
  | "/revision"
  | "/admin"
  | "/admin/monitoreo"
  | "/admin/elegibles"
  | "/admin/talleres"
  | "/admin/configuracion"
  | "/admin/padron"
  | "/admin/usuarios"
  | "/admin/soporte"
  | "/admin/bitacora"
  | "/admin/reportes";

export type EntradaIndice =
  | {
      estado: "listo";
      to: RutaConstruida;
      label: string;
      /** Valores para las rutas con parámetro, si alguna los necesita. */
      params?: Record<string, string>;
    }
  | { estado: "pendiente"; to: string; label: string; params?: Record<string, string> };

/** Ruta tal como se muestra y se navega, con los parámetros ya sustituidos. */
export function rutaResuelta(e: EntradaIndice): string {
  if (!e.params) return e.to;
  return Object.entries(e.params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), e.to);
}

export interface ModuloIndice {
  titulo: string;
  nota: string;
  rutas: EntradaIndice[];
}

export const modulos: ModuloIndice[] = [
  {
    titulo: "Registro público",
    nota: "Flujo de pre-registro, un paso por pantalla",
    rutas: [
      { estado: "listo", to: "/bienvenida", label: "Bienvenida" },
      { estado: "listo", to: "/alumno", label: "Identificación de alumno" },
      { estado: "listo", to: "/confirmar-nombre", label: "Confirmación de nombre" },
      { estado: "listo", to: "/completar-datos", label: "Datos de contacto y académicos" },
      { estado: "listo", to: "/registro", label: "Formulario docente / externo" },
      { estado: "listo", to: "/mi-dia", label: "Día y sede asignados" },
      { estado: "listo", to: "/talleres", label: "Catálogo de talleres" },
      { estado: "listo", to: "/pago", label: "Instrucciones de pago" },
      { estado: "listo", to: "/comprobante", label: "Comprobante de pre-registro" },
    ],
  },
  {
    titulo: "Portal del participante",
    nota: "Acceso con folio, sin contraseña",
    rutas: [
      { estado: "listo", to: "/portal", label: "Acceso al portal" },
      { estado: "listo", to: "/portal/estado", label: "Vista de estado" },
      { estado: "listo", to: "/portal/qr", label: "Mi código QR" },
      { estado: "listo", to: "/portal/evidencias", label: "Mis evidencias" },
      { estado: "listo", to: "/portal/constancia", label: "Mi constancia" },
    ],
  },
  {
    titulo: "Servicios Financieros",
    nota: "Optimizado para atender fila",
    rutas: [
      { estado: "listo", to: "/financieros", label: "Búsqueda y escaneo" },
      { estado: "listo", to: "/financieros/ficha", label: "Ficha y registro de pago" },
      { estado: "listo", to: "/financieros/carga-masiva", label: "Carga masiva por Excel" },
      { estado: "listo", to: "/financieros/conciliacion", label: "Conciliación" },
    ],
  },
  {
    titulo: "Captura de asistencia",
    nota: "Interfaz para celular",
    rutas: [
      { estado: "listo", to: "/captura", label: "Configuración de sesión" },
      { estado: "listo", to: "/captura/escaneo", label: "Escaneo con semáforo" },
      { estado: "listo", to: "/captura/taller", label: "Modo taller — pase de lista" },
      { estado: "listo", to: "/captura/historial", label: "Historial de la sesión" },
    ],
  },
  {
    titulo: "Revisión de evidencias",
    nota: "Diseñado para volumen alto",
    rutas: [{ estado: "listo", to: "/revision", label: "Panel de revisión" }],
  },
  {
    titulo: "Administración",
    nota: "Densidad de información",
    rutas: [
      { estado: "listo", to: "/admin", label: "Dashboard" },
      { estado: "listo", to: "/admin/monitoreo", label: "Monitoreo en vivo" },
      { estado: "listo", to: "/admin/talleres", label: "Talleres (CRUD)" },
      { estado: "listo", to: "/admin/configuracion", label: "Configuración del evento" },
      { estado: "listo", to: "/admin/padron", label: "Importación del padrón" },
      { estado: "listo", to: "/admin/usuarios", label: "Usuarios y roles" },
      { estado: "listo", to: "/admin/soporte", label: "Casos de soporte" },
      { estado: "listo", to: "/admin/bitacora", label: "Bitácora" },
      { estado: "listo", to: "/admin/reportes", label: "Reportes" },
      { estado: "listo", to: "/admin/elegibles", label: "Listado de elegibles" },
    ],
  },
];

const todasLasEntradas = modulos.flatMap((m) => m.rutas);

/**
 * Estado de una ruta según este mapa. Lo usan las barras de navegación de los
 * paneles para no ofrecer enlaces a pantallas que aún no existen, sin repetir
 * el estado en cada archivo de navegación.
 */
export const estadoDeRuta = (to: string): "listo" | "pendiente" =>
  todasLasEntradas.find((e) => e.to === to || rutaResuelta(e) === to)?.estado ?? "pendiente";

/**
 * Busca una pantalla planeada pero aún no construida que corresponda a la ruta
 * pedida. Permite que el 404 distinga "todavía no existe" de "no existe".
 *
 * Compara por prefijo para que una subruta de un módulo aún sin construir se
 * reconozca aunque el mapa solo liste la ruta base.
 */
export function pantallaPendienteDe(pathname: string): EntradaIndice | undefined {
  const ruta = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const pendientes = todasLasEntradas.filter((e) => e.estado === "pendiente");

  const exacta = pendientes.find((e) => rutaResuelta(e).toLowerCase() === ruta);
  if (exacta) return exacta;

  // `/admin/lo-que-sea` cae bajo el módulo de administración, aún sin construir.
  return pendientes.find((e) => {
    const base = `/${rutaResuelta(e).split("/")[1] ?? ""}`;
    return base !== "/" && (ruta === base || ruta.startsWith(`${base}/`));
  });
}
