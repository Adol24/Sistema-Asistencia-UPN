/**
 * Persistencia del historial de escaneos de la sesión de captura.
 *
 * Es la misma excepción que ya tiene `cola-pendientes.ts`, y por la misma
 * razón: `/captura/historial` le promete al capturista «aquí está lo que
 * llevas hoy», y perderlo con una recarga accidental —una pestaña que se
 * cierra sola, un teléfono que se reinicia— contradice justo esa promesa en
 * medio de una fila de setecientas personas. El resto del estado del
 * prototipo sigue reiniciando en memoria a propósito; esto no.
 *
 * Toda lectura y escritura está protegida igual que la cola: `localStorage`
 * puede no existir (renderizado en servidor), estar deshabilitado por el
 * navegador, contener basura de una versión anterior o estar lleno. En
 * cualquiera de esos casos el historial se comporta como vacío y la
 * aplicación sigue funcionando.
 */

import type { EscaneoHistorial } from "@/lib/contrato-estado";

const CLAVE = "encuentro:historial:v1";

/*
 * Tope razonable, como la bitácora (`datos.ts`, 500 también). Un capturista
 * no revisa el escaneo 501 de su jornada en esta pantalla; sí necesita que
 * los más recientes —los que puede necesitar deshacer— sobrevivan intactos.
 */
const MAXIMO = 500;

function almacen(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Safari en modo privado y algunas políticas corporativas lanzan al acceder.
    return null;
  }
}

/*
 * Comprobación ligera a propósito: a diferencia de la cola, esto no vuelve a
 * escribirse en la base si está mal formado, solo se pinta en una lista. El
 * peor caso de confiar de más es una fila rara en pantalla, no un dato
 * perdido ni una sincronización equivocada.
 */
function esEntrada(x: unknown): x is EscaneoHistorial {
  if (typeof x !== "object" || x === null) return false;
  const h = x as Record<string, unknown>;
  return (
    typeof h["id"] === "string" &&
    typeof h["hora"] === "string" &&
    typeof h["pendiente"] === "boolean"
  );
}

/** Lee el historial guardado. Devuelve `[]` ante cualquier problema; nunca lanza. */
export function leerHistorial(): EscaneoHistorial[] {
  const s = almacen();
  if (!s) return [];
  try {
    const crudo = s.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    // Se descarta lo que no encaje en lugar de propagar datos corruptos.
    return datos.filter(esEntrada);
  } catch {
    return [];
  }
}

/** Guarda el historial. Si el almacenamiento falla, la sesión sigue en memoria. */
export function guardarHistorial(historial: EscaneoHistorial[]): void {
  const s = almacen();
  if (!s) return;
  try {
    if (historial.length === 0) s.removeItem(CLAVE);
    else s.setItem(CLAVE, JSON.stringify(historial.slice(0, MAXIMO)));
  } catch {
    // Cuota llena o escritura bloqueada: no es motivo para romper la captura.
  }
}
