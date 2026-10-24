/**
 * El cruce completo por participante: académico, asistencia real, pago y
 * evidencia, en una sola fila.
 *
 * Nace porque "¿quién pagó y no asistió?", "¿quién se preinscribió y no ha
 * pagado?" o "¿cuánta gente de tal licenciatura sí llegó?" vivían repartidas
 * entre `/admin/alumnos`, `/admin/elegibles` y `/admin/asistencias`, y
 * cruzarlas a mano significaba abrir las tres. La elegibilidad para
 * constancia NO se reinventa aquí: se reutiliza `elegibilidadEvento` y
 * `elegibilidadTaller` de `elegibilidad.ts`, que son la fuente de verdad de
 * esa regla. Esto solo añade las cuentas crudas y las banderas de decisión que
 * esos dos cálculos no exponen por sí solos.
 */

import { avanceTexto } from "@/dominio/catalogos";
import type { NivelAcademico } from "@/dominio/catalogos";
import type { DiaEvento } from "@/lib/configuracion";
import {
  asistioElDia,
  elegibilidadEvento,
  elegibilidadTaller,
  EVIDENCIAS_REQUERIDAS,
  EVIDENCIAS_TALLER_REQUERIDAS,
  type EntornoConstancias,
} from "@/lib/elegibilidad";
import { movimientosDe } from "@/lib/escaneo";
import { sinAcreditar } from "@/lib/pagos-logica";
import type { Asistencia, Dia, EstadoPago, Participante, Taller } from "@/dominio/tipos";

const DIAS: Dia[] = [1, 2, 3];

export interface FilaPanorama {
  p: Participante;
  avance: string;
  tallerNombre: string | undefined;
  estadoPagoEvento: EstadoPago;
  estadoPagoTaller: EstadoPago | undefined;
  /** Si asistió el día que le tocaba, que es el que cuenta para su constancia. */
  asistioSuDia: boolean;
  /**
   * Todos los días con entrada registrada, incluidos los que no eran el suyo.
   *
   * Solo informativo: un día de más es un reintegro, y por sí solo no dice
   * nada malo. La decisión de asistencia usa `asistioSuDia`, no esto.
   */
  diasAsistidos: Dia[];
  evidenciasEventoAprobadas: number;
  diasTaller: Dia[];
  diasTallerAsistidos: number;
  evidenciaTallerAprobada: boolean;
  /** Primera entrada y última salida registradas el día que le tocaba. `undefined` si no entró. */
  horaEntradaEvento: string | undefined;
  horaSalidaEvento: string | undefined;
  /**
   * Entradas y salidas del evento el día que le tocaba, completas y en orden.
   *
   * `horaEntradaEvento`/`horaSalidaEvento` resumen el extremo de esta lista;
   * esto trae cada movimiento de en medio, que es lo que un reintegro deja
   * fuera de ese resumen. Ver `movimientosDe` y `etiquetaMovimiento`.
   */
  movimientosEvento: Asistencia[];
  /** Hora del primer escaneo de taller, de cualquiera de sus días. `undefined` si no entró a ninguno. */
  horaEntradaTaller: string | undefined;
  elegibleEvento: boolean;
  elegibleTaller: boolean | null;
  /** Tiene el depósito del evento confirmado pero no llegó el día que le tocaba. */
  pagoSinAsistencia: boolean;
  /** Entró el día que le tocaba y su pago del evento no está confirmado. Anomalía: la puerta no debería dejarlo pasar así. */
  asistioSinPagoConfirmado: boolean;
  /** Se preinscribió y su depósito del evento todavía no se reconoce, haya asistido o no. */
  preinscritoSinPagar: boolean;
  /** Tiene el taller pagado pero no completó sus días de asistencia. */
  tallerPagadoSinCompletar: boolean;
}

export function filaPanoramaDe(
  entorno: EntornoConstancias,
  p: Participante,
  talleres: Taller[],
  catalogo: NivelAcademico[],
): FilaPanorama {
  const estado = entorno.estadoDe(p);
  const asistioSuDia = asistioElDia(entorno.asistenciasDe(p.folio, p.dia));
  const diasAsistidos = DIAS.filter((d) => asistioElDia(entorno.asistenciasDe(p.folio, d)));

  const evidenciasEventoAprobadas = entorno
    .evidenciasDe(p.folio)
    .filter((e) => e.tipo === "evento" && e.dia !== p.dia && e.estado === "aprobada").length;

  const diasTaller = entorno.diasTallerDe(p.tallerId);
  const diasTallerAsistidos = diasTaller.filter((d) =>
    entorno.asistenciasDe(p.folio, d).some((a) => a.tipo === "taller"),
  ).length;
  const evidenciaTallerAprobada =
    entorno.evidenciasDe(p.folio).filter((e) => e.tipo === "taller" && e.estado === "aprobada")
      .length >= EVIDENCIAS_TALLER_REQUERIDAS;

  const taller = elegibilidadTaller(entorno, p);

  // `hora` ya llega como "HH:MM" con cero a la izquierda, así que ordena bien
  // alfabéticamente dentro de un mismo día sin tener que tocar fechas.
  const delDia = entorno.asistenciasDe(p.folio, p.dia);
  const horasDe = (tipo: "entrada" | "salida") =>
    delDia
      .filter((a) => a.tipo === tipo)
      .map((a) => a.hora)
      .sort();
  const entradasEvento = horasDe("entrada");
  const salidasEvento = horasDe("salida");
  const movimientosEvento = movimientosDe(delDia, p.folio, p.dia);

  const asistenciasTaller = entorno
    .asistenciasDe(p.folio)
    .filter((a) => a.tipo === "taller")
    .sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora));

  return {
    p,
    avance: avanceTexto(catalogo, p.nivel, p.avance, p.programa),
    tallerNombre: talleres.find((t) => t.id === p.tallerId)?.nombre,
    estadoPagoEvento: estado.evento,
    estadoPagoTaller: estado.taller,
    asistioSuDia,
    diasAsistidos,
    evidenciasEventoAprobadas,
    diasTaller,
    diasTallerAsistidos,
    evidenciaTallerAprobada,
    horaEntradaEvento: entradasEvento[0],
    horaSalidaEvento: salidasEvento[salidasEvento.length - 1],
    movimientosEvento,
    horaEntradaTaller: asistenciasTaller[0]?.hora,
    elegibleEvento: elegibilidadEvento(entorno, p).elegible,
    elegibleTaller: taller ? taller.elegible : null,
    pagoSinAsistencia: estado.evento === "pagado" && !asistioSuDia,
    asistioSinPagoConfirmado:
      asistioSuDia && estado.evento !== "pagado" && estado.evento !== "exento",
    preinscritoSinPagar: sinAcreditar(estado.evento),
    tallerPagadoSinCompletar:
      estado.taller === "pagado" &&
      diasTaller.length > 0 &&
      diasTallerAsistidos < diasTaller.length,
  };
}

export function construirPanorama(
  entorno: EntornoConstancias,
  participantes: Participante[],
  talleres: Taller[],
  catalogo: NivelAcademico[],
): FilaPanorama[] {
  return participantes.map((p) => filaPanoramaDe(entorno, p, talleres, catalogo));
}

/** Evidencias que un alumno necesita aprobadas para que no cuente como pendiente. Ver `EVIDENCIAS_REQUERIDAS`. */
export const EVIDENCIAS_EVENTO_REQUERIDAS = EVIDENCIAS_REQUERIDAS;

export interface ResumenGeneral {
  total: number;
  pagadosEvento: number;
  asistieronEvento: number;
  pctAsistencia: number;
  pagoSinAsistencia: number;
  preinscritosSinPagar: number;
  asistioSinPagoConfirmado: number;
  conTaller: number;
  tallerCompletaron: number;
}

export function resumenGeneral(filas: FilaPanorama[]): ResumenGeneral {
  const conTaller = filas.filter((f) => f.p.tallerId);
  const total = filas.length;
  const asistieronEvento = filas.filter((f) => f.asistioSuDia).length;
  return {
    total,
    pagadosEvento: filas.filter((f) => f.estadoPagoEvento === "pagado").length,
    asistieronEvento,
    pctAsistencia: total > 0 ? Math.round((asistieronEvento / total) * 100) : 0,
    pagoSinAsistencia: filas.filter((f) => f.pagoSinAsistencia).length,
    preinscritosSinPagar: filas.filter((f) => f.preinscritoSinPagar).length,
    asistioSinPagoConfirmado: filas.filter((f) => f.asistioSinPagoConfirmado).length,
    conTaller: conTaller.length,
    tallerCompletaron: conTaller.filter(
      (f) => f.diasTaller.length > 0 && f.diasTallerAsistidos === f.diasTaller.length,
    ).length,
  };
}

export interface ResumenPrograma {
  nivel: string;
  programa: string;
  preinscritos: number;
  pagados: number;
  asistieron: number;
  pctAsistencia: number;
}

const SIN_NIVEL = "(sin nivel)";
const SIN_PROGRAMA = "(sin programa)";

/**
 * Una fila por licenciatura/maestría, para ver de un vistazo quién sí llegó y
 * de dónde viene.
 *
 * Agrupa con un `Map` anidado en vez de una llave de texto compuesta: un
 * nombre de nivel o de programa con el separador adentro rompería un `split`
 * al reconstruirla, y aquí no hay que reconstruir nada porque nivel y
 * programa viajan ya separados.
 */
export function resumenPorPrograma(filas: FilaPanorama[]): ResumenPrograma[] {
  const porNivel = new Map<string, Map<string, FilaPanorama[]>>();
  for (const f of filas) {
    const nivel = f.p.nivel ?? SIN_NIVEL;
    const programa = f.p.programa ?? SIN_PROGRAMA;
    let porPrograma = porNivel.get(nivel);
    if (!porPrograma) {
      porPrograma = new Map();
      porNivel.set(nivel, porPrograma);
    }
    const suyas = porPrograma.get(programa);
    if (suyas) suyas.push(f);
    else porPrograma.set(programa, [f]);
  }

  const filas_: ResumenPrograma[] = [];
  for (const [nivel, porPrograma] of porNivel)
    for (const [programa, suyas] of porPrograma) {
      const asistieron = suyas.filter((f) => f.asistioSuDia).length;
      filas_.push({
        nivel,
        programa,
        preinscritos: suyas.length,
        pagados: suyas.filter((f) => f.estadoPagoEvento === "pagado").length,
        asistieron,
        pctAsistencia: suyas.length > 0 ? Math.round((asistieron / suyas.length) * 100) : 0,
      });
    }
  return filas_.sort(
    (a, b) => a.nivel.localeCompare(b.nivel, "es") || b.preinscritos - a.preinscritos,
  );
}

export interface ResumenDia {
  dia: Dia;
  etiqueta: string;
  asignados: number;
  asistieron: number;
  pctAsistencia: number;
}

/** Cuánta gente tenía ese día asignado y cuánta sí llegó, día por día. */
export function resumenPorDia(filas: FilaPanorama[], dias: DiaEvento[]): ResumenDia[] {
  return DIAS.map((dia) => {
    const asignados = filas.filter((f) => f.p.dia === dia);
    const asistieron = asignados.filter((f) => f.asistioSuDia).length;
    return {
      dia,
      etiqueta: dias.find((d) => d.dia === dia)?.etiqueta ?? `Día ${dia}`,
      asignados: asignados.length,
      asistieron,
      pctAsistencia: asignados.length > 0 ? Math.round((asistieron / asignados.length) * 100) : 0,
    };
  });
}
