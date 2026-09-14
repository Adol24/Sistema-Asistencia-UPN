/**
 * Leer el archivo que llega de fuera.
 *
 * Los dos importadores del sistema —el corte del banco y el padrón de Servicios
 * Escolares— hacían lo mismo antes de empezar a validar: partir las líneas,
 * comprobar que hay algo debajo del encabezado, y convertir cada fila en un
 * diccionario de columna a texto. Estaba escrito dos veces, y el padrón
 * importaba `partirLinea` **de la carga masiva de pagos**: para leer un archivo
 * de alumnos había que pasar por el módulo de cobros, que no tiene nada que ver.
 *
 * Aquí no se valida nada. Qué columnas hacen falta y qué es una fila correcta
 * lo decide cada importador, porque es lo único que de verdad los distingue.
 */

/** Una fila ya partida: su número para la pantalla y sus celdas por nombre. */
export interface FilaCruda {
  /** 1 para la primera fila de datos, que es como la cuenta quien mira el archivo. */
  n: number;
  crudo: Record<string, string>;
}

/**
 * Parte una línea de CSV respetando comillas dobles.
 *
 * Una comilla dentro de un campo entrecomillado se escribe doblada —`""`—, que
 * es lo que genera Excel, y es la razón de no partir por comas a secas.
 */
export function partirLinea(linea: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === "," && !enComillas) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/**
 * El archivo entero, ya partido: su encabezado en minúsculas y sus filas.
 *
 * Lanza si no hay nada debajo del encabezado, que es el único caso en el que no
 * hay ningún diagnóstico posible que dar fila por fila.
 */
export function leerTabla(texto: string): { encabezado: string[]; filas: FilaCruda[] } {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2)
    throw new Error("El archivo no tiene filas de datos debajo del encabezado.");

  const encabezado = partirLinea(lineas[0]!).map((h) => h.toLowerCase());
  const filas = lineas.slice(1).map((linea, k) => {
    const celdas = partirLinea(linea);
    const crudo: Record<string, string> = {};
    encabezado.forEach((h, i) => (crudo[h] = celdas[i] ?? ""));
    return { n: k + 1, crudo };
  });

  return { encabezado, filas };
}
