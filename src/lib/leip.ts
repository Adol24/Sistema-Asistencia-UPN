/**
 * La estadística de LEIP por sede y grupo.
 *
 * LEIP es la Licenciatura en Educación e Innovación Pedagógica, y es el único
 * programa de la universidad que se cuenta por módulos en vez de semestres
 * —llega al 13 siendo licenciatura; ver `cuentaDeAvance`—. También es el que se
 * imparte en varias sedes a la vez, cada una con sus grupos, y por eso su
 * coordinación pregunta siempre lo mismo: de este grupo de esta sede, cuántos
 * hay en el padrón, cuántos se pre-registraron y cuántos ya pagaron.
 *
 * Hasta ahora esa respuesta salía bajando «Padrón de alumnos», bajando «Datos
 * académicos declarados» y cruzándolos en Excel por matrícula. Aquí ya viene
 * cruzada.
 *
 * Vive suelta —sin React— por el mismo motivo que `avance.ts`: la resta de los
 * exentos y el cruce contra el padrón son cuentas que se equivocan en silencio,
 * y así se pueden comprobar sin montar la aplicación.
 */

import type { NivelAcademico } from "@/dominio/catalogos";
import type { AlumnoPadron, EstadoPago, Participante } from "@/dominio/tipos";

/**
 * Compara nombres de programa ignorando acentos, mayúsculas y espacios de más.
 *
 * El padrón llega de Servicios Escolares en mayúsculas y sin garantía de
 * acentos. Es la misma normalización que usa `catalogos.ts` para resolver la
 * excepción del avance; está repetida y no compartida porque allá es privada y
 * exportarla solo para esto ampliaría una superficie que no hace falta ampliar.
 */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Si un nombre de programa es LEIP.
 *
 * **No se compara contra una cadena exacta, y es a propósito.** El mismo
 * programa aparece escrito de varias formas según de dónde venga el dato:
 * «Licenciatura en Educación e Innovación Pedagógica» en el catálogo, la misma
 * en mayúsculas y sin acentos en el padrón, y «LIC. EN EDUCACIÓN E INNOVACIÓN
 * PEDAGÓGICA» en algunos archivos. Lo que no cambia en ninguna son las dos
 * palabras que lo distinguen de los demás programas —innovación y pedagógica—,
 * así que la firma son esas dos; y se acepta además la sigla suelta, que es
 * como lo escribe la propia coordinación.
 *
 * Lo que NO se hace es deducirlo de «el programa que se cuenta por módulos».
 * Hoy LEIP es el único, pero el catálogo es editable: el día que otro programa
 * se declare modular, este reporte pasaría a mezclar dos licenciaturas sin que
 * nadie lo note.
 */
export const esLeip = (programa?: string | undefined): boolean => {
  if (!programa) return false;
  const t = normalizar(programa);
  if (/\bLEIP\b/.test(t)) return true;
  return t.includes("INNOVACION") && t.includes("PEDAGOGICA");
};

/**
 * Cómo se llama LEIP en el catálogo del evento, para rotular el reporte con el
 * nombre oficial en vez de con la sigla.
 *
 * Devuelve `undefined` si el catálogo no lo tiene, y esa ausencia se enseña: un
 * reporte vacío porque el programa no está dado de alta se parece demasiado a
 * un reporte vacío porque nadie se ha pre-registrado.
 */
export const nombreOficialLeip = (catalogo: NivelAcademico[]): string | undefined =>
  catalogo.flatMap((n) => n.programas).find((p) => esLeip(p.nombre))?.nombre;

/** Una sede y un grupo de LEIP, con sus cuentas. */
export interface FilaLeip {
  /**
   * El plantel donde estudia el alumno. **No es la sede del evento**: una la
   * entrega la universidad con el padrón y la otra la asigna la organización al
   * repartir los días.
   */
  sede: string;
  grupo: string;
  /**
   * Los módulos presentes en ese grupo, separados por una barra.
   *
   * Casi siempre es uno solo —un grupo va junto—, y cuando son dos es un dato:
   * significa que el grupo trae alumnos de dos cortes.
   */
  modulos: string;
  /** Alumnos de LEIP que Servicios Escolares entregó para esa sede y grupo. */
  enPadron: number;
  /** Cuántos de esa sede y grupo ya se pre-registraron. */
  preinscritos: number;
  /** Los que tienen el depósito del evento confirmado. */
  pagados: number;
  /** Los que no deben nada. Ver por qué tienen columna propia en `avance.ts`. */
  exentos: number;
  /** Preinscritos menos pagados menos exentos. Nunca solo menos pagados. */
  faltan: number;
  /** Qué parte del grupo se pre-registró. Cero si el grupo no está en el padrón. */
  pct: number;
}

/** Las etiquetas de lo que viene vacío, para que el grupo exista aunque falte. */
const SIN_SEDE = "(sin sede)";
const SIN_GRUPO = "(sin grupo)";

/**
 * Lo que separa la sede del grupo dentro de la llave de agrupación.
 *
 * Es un carácter nulo y no un espacio ni un guion: con un espacio, la sede
 * «TEZIUTLÁN A» del grupo «1» y la sede «TEZIUTLÁN» del grupo «A 1» darían la
 * misma llave y se sumarían en una sola fila. El nulo no puede aparecer dentro
 * de un nombre que venga del padrón.
 */
const SEPARADOR = "\u0000";

/**
 * La estadística, una fila por sede y grupo.
 *
 * **Las filas salen de los dos lados, no solo del padrón.** Un grupo que está
 * en el padrón y del que nadie se pre-registró tiene que aparecer con cero
 * —es justo el que hay que ir a buscar—, y un pre-registrado cuya sede o grupo
 * no coincide con ninguna fila del padrón también, porque si solo se recorriera
 * el padrón ese alumno desaparecería del archivo y las columnas dejarían de
 * sumar lo mismo que los otros reportes.
 *
 * `estadoEvento` se recibe en vez de derivarse aquí, igual que en `avance.ts`:
 * es la misma función que pinta la insignia de una ficha, y compartirla es lo
 * que impide que este reporte y esa ficha discrepen sobre la misma persona.
 */
export function estadisticaLeip(
  padron: AlumnoPadron[],
  participantes: Participante[],
  estadoEvento: (p: Participante) => EstadoPago,
): FilaLeip[] {
  interface Acumulado {
    sede: string;
    grupo: string;
    modulos: Set<number>;
    enPadron: number;
    preinscritos: number;
    pagados: number;
    exentos: number;
  }

  const filas = new Map<string, Acumulado>();

  const dame = (sede: string, grupo: string): Acumulado => {
    const llave = sede + SEPARADOR + grupo;
    let fila = filas.get(llave);
    if (!fila) {
      fila = {
        sede,
        grupo,
        modulos: new Set<number>(),
        enPadron: 0,
        preinscritos: 0,
        pagados: 0,
        exentos: 0,
      };
      filas.set(llave, fila);
    }
    return fila;
  };

  for (const a of padron) {
    if (!esLeip(a.programa)) continue;
    const fila = dame(a.plantel || SIN_SEDE, a.grupo || SIN_GRUPO);
    fila.enPadron += 1;
    if (a.avance) fila.modulos.add(a.avance);
  }

  for (const p of participantes) {
    if (p.perfil !== "alumno" || !esLeip(p.programa)) continue;
    const fila = dame(p.plantel || SIN_SEDE, p.grupo || SIN_GRUPO);
    fila.preinscritos += 1;
    if (p.avance) fila.modulos.add(p.avance);
    const estado = estadoEvento(p);
    if (estado === "pagado") fila.pagados += 1;
    else if (estado === "exento") fila.exentos += 1;
  }

  return [...filas.values()]
    .map((f) => ({
      sede: f.sede,
      grupo: f.grupo,
      modulos: [...f.modulos].sort((a, b) => a - b).join(" / "),
      enPadron: f.enPadron,
      preinscritos: f.preinscritos,
      pagados: f.pagados,
      exentos: f.exentos,
      faltan: f.preinscritos - f.pagados - f.exentos,
      pct: f.enPadron > 0 ? Math.round((f.preinscritos / f.enPadron) * 100) : 0,
    }))
    .sort(
      (a, b) =>
        // `numeric` para que el grupo 10 vaya después del 9 y no después del 1.
        a.sede.localeCompare(b.sede, "es", { numeric: true }) ||
        a.grupo.localeCompare(b.grupo, "es", { numeric: true }),
    );
}

/**
 * La fila de totales.
 *
 * Suma las filas en vez de recorrer otra vez a la gente, por lo mismo que
 * `totalDelAvance`: lo que suma una columna tiene que ser lo que está en esa
 * columna, o el archivo no cuadra consigo mismo.
 *
 * `pct` se recalcula sobre las sumas. Promediar los porcentajes de grupos de
 * tamaños distintos da un número que no es el porcentaje de nada.
 */
export function totalLeip(filas: FilaLeip[]): Omit<FilaLeip, "sede" | "grupo" | "modulos"> {
  const suma = (f: (x: FilaLeip) => number) => filas.reduce((n, x) => n + f(x), 0);
  const enPadron = suma((x) => x.enPadron);
  const preinscritos = suma((x) => x.preinscritos);
  return {
    enPadron,
    preinscritos,
    pagados: suma((x) => x.pagados),
    exentos: suma((x) => x.exentos),
    faltan: suma((x) => x.faltan),
    pct: enPadron > 0 ? Math.round((preinscritos / enPadron) * 100) : 0,
  };
}
