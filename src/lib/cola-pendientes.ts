/**
 * Persistencia de la cola de escaneos pendientes de sincronizar.
 *
 * Es la ÚNICA excepción a la regla de que el estado del prototipo vive en
 * memoria y se reinicia al recargar. La razón es que aquí la interfaz promete
 * algo concreto —«SIN CONEXIÓN — 23 pendientes», los escaneos se guardan y se
 * sincronizan al volver la red— y perderlos al recargar demostraría justo lo
 * contrario. En todo lo demás el reinicio sigue siendo el comportamiento
 * correcto.
 *
 * Toda lectura y escritura está protegida: `localStorage` puede no existir
 * (renderizado en servidor), estar deshabilitado por el navegador, contener
 * basura de una versión anterior o estar lleno. En cualquiera de esos casos la
 * cola se comporta como vacía y la aplicación sigue funcionando.
 */

import type { Asistencia } from "@/mocks/tipos";

const CLAVE = "encuentro:cola-pendientes:v1";

function almacen(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Safari en modo privado y algunas políticas corporativas lanzan al acceder.
    return null;
  }
}

/** Comprueba que lo leído tenga la forma de una asistencia antes de confiar en ello. */
function esAsistencia(x: unknown): x is Asistencia {
  if (typeof x !== "object" || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a["id"] === "string" &&
    typeof a["folio"] === "string" &&
    typeof a["nombre"] === "string" &&
    (a["dia"] === 1 || a["dia"] === 2 || a["dia"] === 3) &&
    (a["tipo"] === "entrada" || a["tipo"] === "salida" || a["tipo"] === "taller") &&
    typeof a["hora"] === "string"
  );
}

/** Lee la cola. Devuelve `[]` ante cualquier problema; nunca lanza. */
export function leerCola(): Asistencia[] {
  const s = almacen();
  if (!s) return [];
  try {
    const crudo = s.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    // Se descarta lo que no encaje en lugar de propagar datos corruptos.
    return datos.filter(esAsistencia);
  } catch {
    return [];
  }
}

/** Guarda la cola. Si el almacenamiento falla, la sesión sigue en memoria. */
export function guardarCola(cola: Asistencia[]): void {
  const s = almacen();
  if (!s) return;
  try {
    if (cola.length === 0) s.removeItem(CLAVE);
    else s.setItem(CLAVE, JSON.stringify(cola));
  } catch {
    // Cuota llena o escritura bloqueada: no es motivo para romper la captura.
  }
}
