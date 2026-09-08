import type { RolInterno } from "@/mocks/tipos";

/**
 * Los roles internos, y el puente entre cómo se llaman aquí y cómo se llaman en
 * la base.
 *
 * Los dos vocabularios no coincidían y nadie se había dado cuenta porque
 * `FilaUsuario.rol` estaba tipado como `RolInterno`, o sea afirmando que la base
 * devuelve las palabras de la aplicación. No es verdad: el enum `rol_interno` de
 * Postgres usa `admin`, `financieros` y `revisor` donde la aplicación dice
 * `administrador`, `servicios_financieros` y `revisor_evidencias`.
 *
 * TypeScript no podía atraparlo porque el tipo describe una suposición sobre la
 * base, no algo que compruebe. Con el control de acceso encima, esa suposición
 * dejaba de ser cosmética: `rol === "administrador"` habría dado falso para todo
 * administrador real y lo habría dejado fuera de su propio panel.
 */
export type RolBase = "admin" | "financieros" | "capturista" | "revisor" | "soporte";

const DESDE_BASE: Record<RolBase, RolInterno> = {
  admin: "administrador",
  financieros: "servicios_financieros",
  capturista: "capturista",
  revisor: "revisor_evidencias",
  soporte: "soporte",
};

const HACIA_BASE: Record<RolInterno, RolBase> = {
  administrador: "admin",
  servicios_financieros: "financieros",
  capturista: "capturista",
  revisor_evidencias: "revisor",
  soporte: "soporte",
};

/** Traduce el rol que devuelve Postgres. Ante un valor desconocido, el más
 *  limitado: un rol que no se reconoce no debe heredar permisos por descuido. */
export const rolDesdeBase = (valor: string): RolInterno =>
  DESDE_BASE[valor as RolBase] ?? "soporte";

export const rolHaciaBase = (rol: RolInterno): RolBase => HACIA_BASE[rol];

/** Las cuatro zonas internas de la aplicación. */
export type Area = "admin" | "financieros" | "captura" | "revision";

/**
 * Quién entra a cada zona.
 *
 * Reproduce a propósito lo que ya dicen las políticas de la base —por ejemplo
 * `asistencias_alta` exige `admin` o `capturista`—, para que la interfaz no
 * ofrezca lo que la base va a rechazar. La base sigue siendo la que manda: esto
 * evita el callejón sin salida, no sustituye la autorización.
 */
export const ROLES_POR_AREA: Record<Area, readonly RolInterno[]> = {
  admin: ["administrador"],
  financieros: ["administrador", "servicios_financieros"],
  captura: ["administrador", "capturista"],
  revision: ["administrador", "revisor_evidencias"],
};

export const ETIQUETA_AREA: Record<Area, string> = {
  admin: "Administración",
  financieros: "Servicios Financieros",
  captura: "Captura de asistencia",
  revision: "Revisión de evidencias",
};

export const ETIQUETA_ROL: Record<RolInterno, string> = {
  administrador: "Administración",
  servicios_financieros: "Servicios Financieros",
  capturista: "Capturista",
  revisor_evidencias: "Revisor de evidencias",
  soporte: "Soporte",
};

export const puedeEntrar = (rol: RolInterno | undefined, area: Area): boolean =>
  !!rol && ROLES_POR_AREA[area].includes(rol);
