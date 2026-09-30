/**
 * Cortar la lista de participantes por donde haga falta —licenciatura,
 * semestre, plantel, taller— y contar siempre lo mismo en cada corte.
 *
 * La hoja de avance hace seis de estos cortes. Escritos a mano serían seis
 * `filter().length` casi iguales con la misma resta al final, y la resta es
 * justo la que se equivoca en silencio: `faltan` descuenta a los exentos, y la
 * copia que lo olvide inventa una morosidad que no existe. Aquí se escribe una
 * vez y los seis cortes no pueden discrepar.
 *
 * Vive sin React para poder comprobarse sin montar la aplicación, igual que
 * `avance.ts`, con el que comparte vocabulario a propósito: `total`, `pagados`,
 * `exentos` y `faltan` significan en los dos archivos exactamente lo mismo.
 */

import type { EstadoPago, Participante } from "@/dominio/tipos";

/** Un corte: quiénes cayeron aquí y en qué punto del cobro están. */
export interface GrupoDesglosado {
  /** La etiqueta, que es también la clave con la que se agrupó. */
  etiqueta: string;
  /**
   * La etiqueta partida, cuando el corte es por más de un dato a la vez.
   *
   * Un grupo académico no se identifica solo: «7A» existe en tres carreras. La
   * clave real es la licenciatura, el avance y el grupo juntos, y la tabla
   * quiere esos tres en columnas separadas en vez de una tira larga. Con un
   * corte de un solo dato trae ese dato y ya.
   */
  partes: string[];
  /** Cuántos hay apuntados en este grupo. */
  total: number;
  alumnos: number;
  docentes: number;
  externos: number;
  /** Con el depósito confirmado. */
  pagados: number;
  /** No deben nada: hoy, los maestros que asisten sin constancia. */
  exentos: number;
  /** `total − pagados − exentos`. Ver `avance.ts`: restar solo los pagados miente. */
  faltan: number;
  /** Qué tanto de este grupo ya pagó, redondeado. */
  pct: number;
}

/** Lo que se enseña cuando el dato que agrupa no está. */
export const SIN_DATO = "Sin dato";

/**
 * Agrupa y cuenta.
 *
 * @param etiquetaDe Por dónde cortar. Una cadena vacía NO descarta a nadie: cae
 *   en «Sin dato», que se enseña al final de la tabla. Es deliberado — un
 *   reporte que deja fuera a los que les falta el programa no cuadra con su
 *   propio total, y quien lo lea no tiene forma de saber que faltan.
 *
 *   Devolviendo una lista se corta por varios datos a la vez: la clave es la
 *   combinación y cada dato queda además en `partes`, para su columna. Ahí un
 *   hueco se marca dato a dato —«Licenciatura X · Semestre 7 · Sin dato»— y
 *   solo cae en el «Sin dato» del final quien no tenga ninguno de los tres,
 *   porque decir que a esa fila le falta «el grupo» es más útil que mandarla
 *   entera al cajón de lo desconocido.
 * @param estado Qué concepto se está mirando. Se recibe en vez de derivarse
 *   para poder desglosar el evento o el taller con la misma función, y para que
 *   la cuenta sea la MISMA que pinta la insignia de la ficha.
 * @param orden Por cantidad —el corte que se lee buscando el más grande— o por
 *   etiqueta —semestres y módulos, donde el orden natural es el del número—.
 */
export function desglosar(
  participantes: Participante[],
  etiquetaDe: (p: Participante) => string | string[],
  estado: (p: Participante) => EstadoPago,
  orden: "cantidad" | "etiqueta" = "cantidad",
): GrupoDesglosado[] {
  const grupos = new Map<string, GrupoDesglosado>();

  for (const p of participantes) {
    const crudo = etiquetaDe(p);
    const partes = (Array.isArray(crudo) ? crudo : [crudo]).map((x) => x.trim());
    const etiqueta = partes.some((x) => x)
      ? partes.map((x) => x || SIN_DATO).join(" · ")
      : SIN_DATO;
    let g = grupos.get(etiqueta);
    if (!g) {
      g = {
        etiqueta,
        partes: partes.map((x) => x || SIN_DATO),
        total: 0,
        alumnos: 0,
        docentes: 0,
        externos: 0,
        pagados: 0,
        exentos: 0,
        faltan: 0,
        pct: 0,
      };
      grupos.set(etiqueta, g);
    }
    g.total++;
    if (p.perfil === "alumno") g.alumnos++;
    else if (p.perfil === "docente") g.docentes++;
    else g.externos++;
    const e = estado(p);
    if (e === "pagado") g.pagados++;
    else if (e === "exento") g.exentos++;
  }

  const lista = [...grupos.values()];
  for (const g of lista) {
    g.faltan = g.total - g.pagados - g.exentos;
    g.pct = g.total > 0 ? Math.round((g.pagados / g.total) * 100) : 0;
  }

  /*
   * «Sin dato» siempre al final, gane lo que gane en la ordenación. Es un hueco
   * del padrón, no un grupo: encabezando la tabla se lee como si fuera la
   * carrera más numerosa.
   *
   * `numeric` en la comparación es lo que pone «Semestre 2» antes que
   * «Semestre 10»; sin él la ordenación es la del diccionario y el 10 se cuela
   * detrás del 1.
   */
  return lista.sort((a, b) => {
    if (a.etiqueta === SIN_DATO) return 1;
    if (b.etiqueta === SIN_DATO) return -1;
    if (orden === "etiqueta" || a.total === b.total)
      return a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true });
    return b.total - a.total;
  });
}

/**
 * La fila de totales de un desglose.
 *
 * Suma los grupos y no vuelve a recorrer a los participantes, por lo mismo que
 * `totalDelAvance`: lo que suma una columna tiene que ser lo que está en esa
 * columna, o la tabla no cuadra consigo misma. `pct` se recalcula sobre las
 * sumas —promediar porcentajes de grupos de tamaños distintos da un número que
 * no es el porcentaje de nada—.
 */
export function sumaDelDesglose(
  grupos: GrupoDesglosado[],
): Omit<GrupoDesglosado, "etiqueta" | "partes"> {
  const suma = (f: (g: GrupoDesglosado) => number) => grupos.reduce((n, g) => n + f(g), 0);
  const total = suma((g) => g.total);
  const pagados = suma((g) => g.pagados);
  return {
    total,
    alumnos: suma((g) => g.alumnos),
    docentes: suma((g) => g.docentes),
    externos: suma((g) => g.externos),
    pagados,
    exentos: suma((g) => g.exentos),
    faltan: suma((g) => g.faltan),
    pct: total > 0 ? Math.round((pagados / total) * 100) : 0,
  };
}
