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

/**
 * Compara dos textos ignorando acentos, mayúsculas y espacios de más.
 *
 * El archivo lo teclean personas: «Maestria en educacion basica» y «Maestría en
 * Educación Básica» son el mismo programa, y rechazar la fila por los acentos
 * castigaría una diferencia que no significa nada.
 */
const igual = (a: string, b: string) =>
  a.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase() ===
  b.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * El número de un avance escrito como texto.
 *
 * El archivo trae «Semestre 1» o «Modulo 5», no un número suelto. La palabra que
 * lo acompaña ya la sabe el catálogo —es la etiqueta del nivel— y repetirla en
 * cada celda solo da ocasión de que no coincida.
 */
const soloNumero = (v: string | undefined) => (v ?? "").replace(/[^\d]/g, "").trim();

/**
 * Quita la palabra que precede a un valor: «Grupo A» -> «A».
 *
 * La expresión se arma con `String.raw` porque dentro de una plantilla normal
 * `\s` se convierte en una simple «s» antes de llegar al constructor, y la
 * expresión deja de ser la que está escrita. Funcionaba por casualidad —el
 * `trim()` final se comía el espacio que `\s` debía absorber— hasta que un valor
 * viniera como «Grupo: A».
 */
const sinEtiqueta = (v: string | undefined, etiqueta: string) =>
  (v ?? "")
    .trim()
    .replace(new RegExp(String.raw`^${etiqueta}\s*[:.\-]?\s*`, "i"), "")
    .trim();

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
  /**
   * Las sedes que existen. Se validan aquí y no solo al guardar porque esta
   * pantalla es una vista previa: enseñar una fila en verde y que la base la
   * rechace después convierte la previsualización en una promesa que no cumple.
   */
  sedes: string[];
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
    // El archivo llega con el nombre tal como lo escribió Servicios Escolares
    // —«Matias Santos Ramos»— y la base lo quiere en mayúsculas. Se convierte
    // aquí en vez de rechazar la fila: es una diferencia de forma, no un dato
    // que falte, y devolverle a alguien dos mil filas por eso sería absurdo.
    const nombre = (crudo["nombre"] ?? "").trim().toUpperCase();
    const programa = (crudo["programa"] ?? "").trim();
    const avanceTxt = soloNumero(crudo["avance"]);
    const grupo = sinEtiqueta(crudo["grupo"], "grupo").toUpperCase();
    const plantel = (crudo[columnaDe(encabezado, "sede") ?? "sede"] ?? "").trim();

    if (!/^\d{11}$/.test(matricula))
      return error(
        `Matrícula con formato inválido: "${crudo["matricula"]}". Se esperan 11 dígitos.`,
      );
    if (!nombre) return error("Falta el nombre.");
    if (nombre.trim().split(/\s+/).length < 2)
      return error(`El nombre viene incompleto: "${nombre}". Se espera el nombre completo.`);

    // El catálogo académico es la única fuente de niveles y programas válidos.
    // Sin esta comprobación, un archivo con un programa mal escrito llega hasta
    // el reporte por programa y lo parte en dos.
    /*
     * El nivel se deduce del programa, no se pide aparte.
     *
     * En el archivo real ambos van en la misma celda: «Licenciatura en
     * Administración Educativa». Pedir una columna `nivel` obligaba a Servicios
     * Escolares a añadir un dato que ya está ahí, y a mantener dos celdas que
     * pueden contradecirse. Si viene la columna se acepta, pero manda el
     * catálogo: es él quien sabe a qué nivel pertenece cada programa.
     */
    const nivel = e.catalogo.find((n) => n.programas.some((p) => igual(p, programa)));
    if (!nivel)
      return error(
        `Programa desconocido: "${programa}". El catálogo tiene ${e.catalogo
          .flatMap((n) => n.programas)
          .join(", ")}.`,
      );
    // Se guarda el nombre del catálogo, no el del archivo: así una fila escrita
    // «Maestria en educacion basica» no crea una segunda versión del programa en
    // los reportes.
    const programaCanonico = nivel.programas.find((p) => igual(p, programa))!;
    const avance = Number(avanceTxt);
    if (!/^\d+$/.test(avanceTxt) || avance < 1 || avance > nivel.totalAvance)
      return error(
        `${nivel.etiquetaAvance} inválido: "${avanceTxt}". En ${nivel.nivel} va de 1 a ${nivel.totalAvance}.`,
      );
    if (!plantel) return error("Falta la sede.");
    const sedeCanonica = e.sedes.find((x) => igual(x, plantel));
    if (!sedeCanonica)
      return error(`Sede desconocida: "${plantel}". Las que existen: ${e.sedes.join(", ")}.`);

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
      programa: programaCanonico,
      avance,
      ...(grupo ? { grupo } : {}),
      plantel: sedeCanonica,
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
