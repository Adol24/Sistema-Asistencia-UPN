/**
 * Reglas del panel de revisión de evidencias, sin React.
 *
 * El módulo se diseña para volumen: unas 5,000 imágenes repartidas entre varios
 * revisores. Lo que aquí se decide —a quién le toca cada lote, qué cuenta como
 * duplicado, qué motivos son válidos— vive aparte para poder comprobarlo sin
 * montar la pantalla.
 */

import type { EstadoEvidencia, Evidencia, UsuarioInterno } from "@/dominio/tipos";

export type MotivoRechazo =
  "no_se_distingue" | "no_se_ve_transmision" | "ilegible" | "duplicada" | "fuera_horario" | "otro";

export const MOTIVOS: { valor: MotivoRechazo; etiqueta: string }[] = [
  { valor: "no_se_distingue", etiqueta: "No se distingue a la persona" },
  { valor: "no_se_ve_transmision", etiqueta: "No se ve la transmisión" },
  { valor: "ilegible", etiqueta: "Imagen ilegible o muy oscura" },
  { valor: "duplicada", etiqueta: "Imagen duplicada" },
  { valor: "fuera_horario", etiqueta: "Fuera del horario permitido" },
  { valor: "otro", etiqueta: "Otro (especificar)" },
];

export const etiquetaMotivo = (m: MotivoRechazo) =>
  MOTIVOS.find((x) => x.valor === m)?.etiqueta ?? m;

/**
 * Reparto de la cola entre revisores, POR BLOQUES DE DÍA.
 *
 * Dentro de cada día, las evidencias se ordenan y se cortan en tramos contiguos,
 * uno por revisor. Así cada quien revisa un bloque del mismo día en vez de
 * saltar entre días a cada imagen: el criterio se mantiene fresco y a este
 * volumen eso vale más que repartir de forma perfectamente pareja.
 *
 * Es determinista y sin solapamiento, que es lo que sustituye a la
 * autenticación que el prototipo no tiene: dos personas nunca reciben la misma
 * imagen y no hace falta que se coordinen.
 */
export function asignacionDeCola(
  evidencias: Evidencia[],
  revisores: string[],
): Map<string, string> {
  const asignacion = new Map<string, string>();
  if (revisores.length === 0) return asignacion;

  for (const dia of [1, 2, 3] as const) {
    const delDia = evidencias.filter((e) => e.dia === dia).sort((a, b) => a.id.localeCompare(b.id));
    if (delDia.length === 0) continue;
    // Tramos contiguos: el resto se reparte entre los primeros revisores.
    const base = Math.floor(delDia.length / revisores.length);
    const resto = delDia.length % revisores.length;
    let desde = 0;
    revisores.forEach((r, k) => {
      const tamano = base + (k < resto ? 1 : 0);
      for (const e of delDia.slice(desde, desde + tamano)) asignacion.set(e.id, r);
      desde += tamano;
    });
  }
  return asignacion;
}

/** Revisor al que le tocó una evidencia, según el reparto ya calculado. */
export const revisorDe = (idEvidencia: string, asignacion: Map<string, string>) =>
  asignacion.get(idEvidencia) ?? "";

/** Nombres de los revisores de evidencias, en el orden en que se reparte la cola. */
export const revisoresDe = (usuarios: UsuarioInterno[]) =>
  usuarios.filter((u) => u.rol === "revisor_evidencias").map((u) => u.nombre);

/** Agrupa por hash y devuelve solo los grupos con más de una evidencia. */
export function gruposDuplicados(evidencias: Evidencia[]): Map<string, Evidencia[]> {
  const porHash = new Map<string, Evidencia[]>();
  for (const e of evidencias) porHash.set(e.hash, [...(porHash.get(e.hash) ?? []), e]);
  return new Map([...porHash].filter(([, g]) => g.length > 1));
}

/** Las demás evidencias que comparten hash con esta. */
export function gemelasDe(evidencias: Evidencia[], e: Evidencia): Evidencia[] {
  return evidencias.filter((x) => x.hash === e.hash && x.id !== e.id);
}

export interface FiltrosRevision {
  dia: "todos" | 1 | 2 | 3;
  estado: "todos" | "pendiente" | "aprobada" | "rechazada" | "no_entregada";
  revisor: "todos" | string;
  soloDuplicados: boolean;
}

export const FILTROS_INICIALES: FiltrosRevision = {
  dia: "todos",
  estado: "pendiente",
  revisor: "todos",
  soloDuplicados: false,
};

/** Aplica los filtros de la barra superior a la cola completa. */
export function filtrarCola(
  evidencias: Evidencia[],
  filtros: FiltrosRevision,
  asignacion: Map<string, string>,
): Evidencia[] {
  const duplicadas = new Set([...gruposDuplicados(evidencias).values()].flat().map((e) => e.id));
  return evidencias.filter((e) => {
    if (filtros.dia !== "todos" && e.dia !== filtros.dia) return false;
    if (filtros.estado !== "todos" && e.estado !== filtros.estado) return false;
    if (filtros.revisor !== "todos" && revisorDe(e.id, asignacion) !== filtros.revisor)
      return false;
    if (filtros.soloDuplicados && !duplicadas.has(e.id)) return false;
    return true;
  });
}

/**
 * Volumen que el módulo atiende en el evento real: unas 5,000 imágenes.
 * El prototipo trabaja sobre una muestra; el contador lo dice en vez de
 * fingir la cifra grande o callar la escala.
 */
export const VOLUMEN_ESTIMADO_EVENTO = 4847;

/** Progreso global: una evidencia cuenta como revisada si ya no está pendiente. */
export function progresoDe(evidencias: Evidencia[]) {
  const total = evidencias.length;
  const revisadas = evidencias.filter((e) => e.estado !== "pendiente").length;
  const porcentaje = total === 0 ? 0 : Math.round((revisadas / total) * 100);
  return {
    total,
    revisadas,
    porcentaje,
    /** Dónde estaría el contador al mismo ritmo sobre el volumen real. */
    equivalenteEnEvento: Math.round((porcentaje / 100) * VOLUMEN_ESTIMADO_EVENTO),
    volumenEvento: VOLUMEN_ESTIMADO_EVENTO,
  };
}

/**
 * Criterios de aprobación. Sin un texto común, dos revisores dan resultados
 * distintos con la misma foto y ninguna decisión se puede defender después.
 * Están derivados de los seis motivos de rechazo, para que criterio y motivo
 * hablen del mismo hecho.
 */
export const CRITERIOS: { titulo: string; puntos: string[] }[] = [
  {
    titulo: "Se aprueba cuando",
    puntos: [
      "Se distingue con claridad a la persona registrada: rostro visible, sin recortes ni objetos que lo cubran.",
      "Se ve la transmisión del Encuentro en la pantalla, aunque sea de reojo, y el contenido es reconocible.",
      "La imagen es legible: enfocada, con luz suficiente para leer lo que aparece en pantalla.",
      "La hora de subida cae dentro de la ventana del día correspondiente, de 8:00 a 16:00 hrs.",
    ],
  },
  {
    titulo: "Se rechaza cuando",
    puntos: [
      "No se distingue a la persona: aparece de espaldas, fuera de cuadro o irreconocible.",
      "No se ve la transmisión: la pantalla está apagada, en otra cosa o fuera del encuadre.",
      "La imagen es ilegible o muy oscura para confirmar cualquiera de los dos puntos anteriores.",
      "La imagen está duplicada: coincide con la de otro alumno. Se rechazan ambas y se marca el caso.",
      "La subida quedó fuera del horario permitido de ese día.",
    ],
  },
  {
    titulo: "Ante la duda",
    puntos: [
      "Si la foto cumple lo esencial aunque no sea perfecta, se aprueba: el requisito es demostrar participación, no calidad fotográfica.",
      "Si la duda es sobre la identidad o sobre si la transmisión es la del evento, se rechaza con el motivo correspondiente. El alumno puede volver a subir dentro del plazo.",
      "Todo rechazo lleva motivo. Un rechazo sin explicación se convierte en un reclamo, y con 2,500 alumnos eso no escala.",
    ],
  },
];

export type AccionTecla = "aprobar" | "rechazar" | "siguiente" | "anterior" | "deshacer";

/**
 * Traduce una tecla a la acción del revisor.
 *
 * Devuelve null cuando el foco está en un campo de texto o hay un modal abierto:
 * a este ritmo, secuestrar el teclado mientras alguien escribe un motivo sería
 * peor que no tener atajos.
 */
export function accionDeTecla(
  tecla: string,
  contexto: { enCampo?: boolean; hayModal?: boolean } = {},
): AccionTecla | null {
  if (contexto.enCampo || contexto.hayModal) return null;
  switch (tecla.toLowerCase()) {
    case "a":
      return "aprobar";
    case "r":
      return "rechazar";
    case "z":
      return "deshacer";
    default:
      break;
  }
  if (tecla === "ArrowRight") return "siguiente";
  if (tecla === "ArrowLeft") return "anterior";
  return null;
}

/** Decisión de revisión tomada en la sesión. */
export interface RevisionAplicada {
  estado: Extract<EstadoEvidencia, "aprobada" | "rechazada">;
  motivo?: string | undefined;
  revisor: string;
  en: string;
}

/**
 * Superpone las decisiones de la sesión sobre las evidencias de los mocks.
 *
 * Es la regla que hace que una evidencia aprobada o rechazada en el panel se
 * vea igual en el portal del alumno, dentro de la misma sesión.
 */
export function aplicarRevisiones(
  base: Evidencia[],
  revisiones: Record<string, RevisionAplicada>,
): Evidencia[] {
  return base.map((e) => {
    const r = revisiones[e.id];
    if (!r) return e;
    return {
      ...e,
      estado: r.estado,
      motivoRechazo: r.estado === "rechazada" ? r.motivo : undefined,
      revisor: r.revisor,
    };
  });
}
