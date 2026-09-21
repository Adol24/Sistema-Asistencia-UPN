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
 *
 * El separador se pasa porque **no siempre es la coma**: un Excel en español
 * exporta con punto y coma, y un archivo correcto guardado desde ahí caía entero
 * en la primera celda. El importador contestaba «faltan estas columnas»
 * nombrándolas todas, que es el peor mensaje posible cuando están todas ahí.
 */
export function partirLinea(linea: string, separador = ","): string[] {
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
    } else if (c === separador && !enComillas) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

/**
 * Con qué carácter está partido este archivo.
 *
 * Se cuenta sobre el encabezado y gana el que más aparezca. Adivinarlo es
 * preferible a pedírselo a quien sube el archivo: la persona que exporta desde
 * Excel no eligió el separador y a menudo ni sabe cuál salió.
 */
const separadorDe = (encabezado: string): string => {
  const fuera = (sep: string) => partirLinea(encabezado, sep).length;
  return [",", ";", "\t"].reduce((mejor, sep) => (fuera(sep) > fuera(mejor) ? sep : mejor), ",");
};

/**
 * Convierte una matriz de celdas en encabezado y filas.
 *
 * Es el punto donde se juntan los dos orígenes —el CSV y el `.xlsx`—, y por eso
 * las mañas del formato se resuelven aquí una sola vez:
 *
 * - **Las columnas vacías de la izquierda se descartan.** El padrón oficial trae
 *   una columna A sin encabezado, de adorno o de numeración, delante de los
 *   datos. En CSV eso es una coma inicial.
 * - **Las filas en blanco se descartan**, que es lo que queda debajo de una
 *   tabla cuando alguien borró unos renglones en Excel.
 * - **El encabezado baja a minúsculas**, porque quien lo escribió no eligió
 *   mayúsculas por ningún motivo.
 */
export function tablaDeMatriz(matriz: string[][]): { encabezado: string[]; filas: FilaCruda[] } {
  const conDatos = matriz.filter((f) => f.some((c) => c.trim().length > 0));
  if (conDatos.length < 2)
    throw new Error("El archivo no tiene filas de datos debajo del encabezado.");

  const crudo0 = conDatos[0]!;
  const desde = crudo0.findIndex((c) => c.trim().length > 0);
  const encabezado = crudo0.slice(desde).map((h) => h.trim().toLowerCase());

  const filas = conDatos.slice(1).map((fila, k) => {
    const celdas = fila.slice(desde);
    const crudo: Record<string, string> = {};
    encabezado.forEach((h, i) => (crudo[h] = celdas[i] ?? ""));
    return { n: k + 1, crudo };
  });

  return { encabezado, filas };
}

/**
 * El archivo entero, ya partido: su encabezado en minúsculas y sus filas.
 *
 * Lanza si no hay nada debajo del encabezado, que es el único caso en el que no
 * hay ningún diagnóstico posible que dar fila por fila.
 */
export function leerTabla(texto: string): { encabezado: string[]; filas: FilaCruda[] } {
  // El BOM del «CSV UTF-8» de Excel es invisible y se queda pegado al primer
  // encabezado, que deja de llamarse `matricula` y por eso deja de encontrarse.
  // Cuesta un carácter quitarlo y una tarde descubrirlo. Va escrito con su
  // escape y no literal: un carácter invisible en el código es justo lo que este
  // recorte viene a arreglar.
  const limpio = texto.replace(/^\uFEFF/, "");
  const lineas = limpio.split(/\r?\n/);
  const primera = lineas.find((l) => l.trim().length > 0) ?? "";
  const separador = separadorDe(primera);

  return tablaDeMatriz(lineas.map((l) => partirLinea(l, separador)));
}

/**
 * De dónde salen las celdas: el texto de un CSV, o la hoja ya leída de un
 * `.xlsx`.
 *
 * Los dos importadores aceptan los dos, y ninguno de los dos necesita saber cuál
 * le tocó: lo que validan —qué columnas hacen falta, qué es una fila correcta—
 * no cambia según el formato del archivo.
 */
export type OrigenTabla = string | string[][];

/** El archivo, venga como venga. */
export const leerOrigen = (origen: OrigenTabla) =>
  typeof origen === "string" ? leerTabla(origen) : tablaDeMatriz(origen);
