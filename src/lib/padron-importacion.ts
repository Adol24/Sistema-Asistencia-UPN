/**
 * Lectura y análisis del archivo de importación del padrón, sin React.
 *
 * Misma mecánica que la carga masiva de pagos: la función es pura, devuelve el
 * diagnóstico fila por fila y NO aplica nada. La pantalla solo escribe cuando el
 * usuario confirma.
 *
 * La diferencia de fondo con los pagos es que aquí una fila puede tocar a alguien
 * que ya está registrado: cambiarle el día asignado a quien ya pagó tiene
 * consecuencias operativas —viene otro día, su taller puede no impartirse— así
 * que eso se marca en ámbar aunque el dato sea válido.
 */

import { partirLinea } from "@/lib/carga-masiva";
import type { AlumnoPadron, Participante } from "@/dominio/tipos";
import type { NivelAcademico } from "@/dominio/catalogos";

/**
 * Lo que el archivo de Servicios Escolares tiene que traer. El nombre viene
 * completo en una sola columna, sin separar nombres de apellidos, y `grupo`
 * puede ir vacío porque no todos los programas lo manejan.
 *
 * No trae el correo —lo declara el alumno y se verifica con un código— **ni el
 * día**, que no lo asigna la universidad sino la organización, repartiendo a los
 * alumnos entre los tres días desde `/admin/padron`.
 */
export const COLUMNAS_PADRON = [
  "matricula",
  "nombre",
  "nivel",
  "programa",
  "avance",
  "grupo",
  "sede",
] as const;

/**
 * Nombres alternativos que puede traer una columna.
 *
 * El archivo lo genera Servicios Escolares, no este sistema, y su encabezado no
 * se puede imponer. La columna de la sede llegó llamándose «plantel» en el
 * prototipo y «sede» en el uso real; aceptar los dos evita que un archivo
 * correcto se rechace entero por una palabra del encabezado.
 */
const SINONIMOS: Record<string, string[]> = {
  sede: ["plantel", "unidad", "subsede"],
};

/** El nombre con el que la columna aparece en ESTE archivo, si aparece. */
const columnaDe = (encabezado: string[], columna: string): string | undefined =>
  [columna, ...(SINONIMOS[columna] ?? [])].find((n) => encabezado.includes(n));

export type SemaforoPadron = "listo" | "advertencia" | "error";

export interface FilaPadron {
  n: number;
  crudo: Record<string, string>;
  semaforo: SemaforoPadron;
  motivo: string;
  alumno?: AlumnoPadron | undefined;
}

export interface EntradaAnalisisPadron {
  texto: string;
  padronActual: AlumnoPadron[];
  participantes: Participante[];
  /** Contra qué se validan el nivel, el programa y el avance de cada fila. */
  catalogo: NivelAcademico[];
  /** Estado de pago efectivo, para saber si el cambio afecta a alguien que ya pagó. */
  estadoDe: (p: Participante) => { evento: string };
}

export function analizarPadron(e: EntradaAnalisisPadron): FilaPadron[] {
  const lineas = e.texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2)
    throw new Error("El archivo no tiene filas de datos debajo del encabezado.");
  const encabezado = partirLinea(lineas[0]!).map((h) => h.toLowerCase());
  const faltantes = COLUMNAS_PADRON.filter((c) => !columnaDe(encabezado, c));
  if (faltantes.length)
    throw new Error(`Al archivo le faltan estas columnas: ${faltantes.join(", ")}.`);

  const porMatriculaActual = new Map(e.padronActual.map((a) => [a.matricula, a]));
  const participantePorMatricula = new Map(
    e.participantes.filter((p) => p.matricula).map((p) => [p.matricula!, p]),
  );
  const vistas = new Map<string, number>();

  return lineas.slice(1).map((linea, k) => {
    const celdas = partirLinea(linea);
    const crudo: Record<string, string> = {};
    encabezado.forEach((h, i) => (crudo[h] = celdas[i] ?? ""));
    const n = k + 1;
    const base = { n, crudo };
    const error = (motivo: string): FilaPadron => ({ ...base, semaforo: "error", motivo });

    const matricula = (crudo["matricula"] ?? "").trim();
    const nombre = (crudo["nombre"] ?? "").trim();
    const nivelTxt = (crudo["nivel"] ?? "").trim();
    const programa = (crudo["programa"] ?? "").trim();
    const avanceTxt = (crudo["avance"] ?? "").trim();
    const grupo = (crudo["grupo"] ?? "").trim().toUpperCase();
    const plantel = (crudo[columnaDe(encabezado, "sede") ?? "sede"] ?? "").trim();

    if (!/^\d{11}$/.test(matricula))
      return error(
        `Matrícula con formato inválido: "${crudo["matricula"]}". Se esperan 11 dígitos.`,
      );
    if (!nombre) return error("Falta el nombre.");
    if (nombre !== nombre.toUpperCase())
      return error(`El nombre debe ir en MAYÚSCULAS: "${nombre}".`);
    if (nombre.trim().split(/\s+/).length < 2)
      return error(`El nombre viene incompleto: "${nombre}". Se espera el nombre completo.`);

    // El catálogo académico es la única fuente de niveles y programas válidos.
    // Sin esta comprobación, un archivo con un programa mal escrito llega hasta
    // el reporte por programa y lo parte en dos.
    const nivel = e.catalogo.find((n) => n.nivel === nivelTxt);
    if (!nivel)
      return error(
        `Nivel desconocido: "${nivelTxt}". El catálogo tiene ${e.catalogo.map((n) => n.nivel).join(", ")}.`,
      );
    if (!nivel.programas.includes(programa))
      return error(`"${programa}" no es un programa de ${nivel.nivel}.`);
    const avance = Number(avanceTxt);
    if (!/^\d+$/.test(avanceTxt) || avance < 1 || avance > nivel.totalAvance)
      return error(
        `${nivel.etiquetaAvance} inválido: "${avanceTxt}". En ${nivel.nivel} va de 1 a ${nivel.totalAvance}.`,
      );
    if (!plantel) return error("Falta la sede.");

    const repetida = vistas.get(matricula);
    if (repetida)
      return error(`Matrícula repetida dentro del archivo (ya venía en la fila ${repetida}).`);
    vistas.set(matricula, n);

    const existente = porMatriculaActual.get(matricula);
    const participante = participantePorMatricula.get(matricula);
    // El día no viaja en el archivo: quien ya lo tenía asignado lo conserva, y
    // el alta nueva entra sin día hasta que la organización lo reparta.
    const alumno: AlumnoPadron = {
      matricula,
      nombre,
      nivel: nivel.nivel,
      programa,
      avance,
      ...(grupo ? { grupo } : {}),
      plantel,
      dia: existente?.dia,
    };

    // Advertencias: el dato es válido pero tiene consecuencias operativas.
    if (existente && existente.nombre !== nombre) {
      const pagado = participante && e.estadoDe(participante).evento === "pagado";
      return {
        ...base,
        semaforo: "advertencia",
        motivo: pagado
          ? `Cambia el nombre de "${existente.nombre}" a "${nombre}" y YA PAGÓ: su constancia sale con el nombre nuevo, confírmalo antes de aplicar.`
          : `Cambia el nombre de "${existente.nombre}" a "${nombre}". Revisa que no sea un error de captura.`,
        alumno,
      };
    }
    if (existente)
      return {
        ...base,
        semaforo: "listo",
        motivo: existente.dia
          ? `Actualiza un registro existente. Conserva su día ${existente.dia}.`
          : "Actualiza un registro existente, que sigue sin día asignado.",
        alumno,
      };
    return {
      ...base,
      semaforo: "advertencia",
      motivo: "Alta nueva. Queda sin día asignado hasta que se reparta.",
      alumno,
    };
  });
}

export function resumirPadron(filas: FilaPadron[]) {
  const listo = filas.filter((f) => f.semaforo === "listo").length;
  const advertencia = filas.filter((f) => f.semaforo === "advertencia").length;
  const error = filas.filter((f) => f.semaforo === "error").length;
  return { listo, advertencia, error, aplicables: listo + advertencia };
}
