/**
 * Leer un `.xlsx` sin dependencias.
 *
 * Servicios Escolares entrega el padrón en Excel, con varias hojas. Hasta aquí
 * el sistema solo sabía leer CSV, así que alguien tenía que abrir el archivo,
 * elegir la pestaña, «Guardar como CSV UTF-8» y repetirlo por cada hoja. Tres
 * oportunidades de equivocarse antes de que el importador vea un solo dato: el
 * Excel en español exporta con punto y coma, el CSV normal rompe los acentos, y
 * el CSV UTF-8 mete un BOM que se pega al primer encabezado.
 *
 * Por qué a mano y no con una librería: un `.xlsx` es un ZIP con XML dentro, y
 * de todo ese formato aquí solo se necesita el texto de las celdas. Las
 * librerías que lo leen entero pesan cientos de kilobytes y traen consigo la
 * hoja de cálculo completa —fórmulas, estilos, gráficas—. Esto son ciento y pico
 * de líneas y no hay nada que actualizar.
 *
 * **Lo que NO hace, y hay que saberlo**: no interpreta formatos. Una fecha sale
 * como el número de serie de Excel y un porcentaje sale sin su signo. El padrón
 * no trae ninguna de las dos cosas —matrícula, nombre, programa, avance, grupo y
 * sede son texto o enteros— y el día que traiga una fecha, esto se queda corto y
 * hay que ampliarlo aquí, no en quien lo llama.
 */

/** Una hoja del libro: su nombre de pestaña y sus celdas ya en texto. */
export interface HojaXlsx {
  nombre: string;
  /** Fila por fila, celda por celda. Las celdas vacías son cadena vacía. */
  filas: string[][];
}

/* ---------------------------------------------------------------------------
 * ZIP
 * ------------------------------------------------------------------------ */

/**
 * Los archivos de un ZIP, por ruta interna.
 *
 * Se recorre el directorio central y no las cabeceras locales porque la cabecera
 * local puede declarar tamaño 0 y dejar el dato real en un descriptor posterior;
 * el directorio central siempre lo tiene. Es el mismo motivo por el que un ZIP
 * se lee desde el final.
 */
async function abrirZip(datos: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(datos);
  const vista = new DataView(datos);

  // El fin del directorio central lleva un comentario de largo variable, así
  // que su firma se busca hacia atrás. 22 es su tamaño mínimo.
  let fin = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("Ese archivo no es un .xlsx: no parece un ZIP válido.");

  const total = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const archivos = new Map<string, Uint8Array>();

  for (let i = 0; i < total; i++) {
    if (vista.getUint32(p, true) !== 0x02014b50) break;
    const metodo = vista.getUint16(p + 10, true);
    const comprimido = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const inicioLocal = vista.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));

    // La cabecera local repite el nombre y los extras, y con OTRA longitud: hay
    // programas que añaden relleno solo ahí. Por eso el dato se localiza con los
    // largos de la cabecera local, no con los del directorio.
    const nLocal = vista.getUint16(inicioLocal + 26, true);
    const eLocal = vista.getUint16(inicioLocal + 28, true);
    const inicioDato = inicioLocal + 30 + nLocal + eLocal;
    const crudo = bytes.subarray(inicioDato, inicioDato + comprimido);

    archivos.set(nombre, metodo === 0 ? crudo : await inflar(crudo));
    p += 46 + largoNombre + largoExtra + largoComentario;
  }

  return archivos;
}

/**
 * Descomprime un bloque deflate.
 *
 * `DecompressionStream` es del navegador y de Bun, así que no hay que traerse un
 * inflador propio. `deflate-raw` y no `deflate`: dentro de un ZIP los datos van
 * sin la cabecera zlib, y pedir el otro modo falla con un error de checksum que
 * no dice nada útil.
 */
async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined")
    throw new Error("Este navegador no puede abrir archivos .xlsx. Sube el padrón en CSV.");

  const flujo = new Blob([datos as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/* ---------------------------------------------------------------------------
 * XML
 * ------------------------------------------------------------------------ */

/**
 * Las cinco entidades del XML, y las numéricas.
 *
 * `&amp;` va al final: hacerlo primero convertiría `&amp;lt;` —un «&lt;»
 * literal— en `&lt;` y de ahí en `<`, inventando una etiqueta que el archivo no
 * tenía.
 */
const desescapar = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** El texto de un nodo, juntando sus `<t>`. Un texto con formato trae varios. */
const textoDe = (xml: string) =>
  desescapar([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]!).join(""));

/** «C» -> 2. La referencia de una celda dice en qué columna está de verdad. */
const columnaDe = (ref: string) =>
  ref.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;

const leerTexto = (archivos: Map<string, Uint8Array>, ruta: string) => {
  const b = archivos.get(ruta);
  return b ? new TextDecoder().decode(b) : "";
};

/* ---------------------------------------------------------------------------
 * El libro
 * ------------------------------------------------------------------------ */

/**
 * Las hojas de un `.xlsx`, **en el orden de las pestañas**.
 *
 * Ese orden importa: la pantalla enseña la lista para que alguien elija, y una
 * lista que no coincide con lo que se ve en Excel obliga a adivinar.
 */
export async function leerLibro(datos: ArrayBuffer): Promise<HojaXlsx[]> {
  const archivos = await abrirZip(datos);

  // Los textos repetidos se guardan una vez y las celdas los referencian por
  // número. Un archivo sin esta parte guarda el texto dentro de la celda.
  const compartidas = [
    ...leerTexto(archivos, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) => textoDe(m[1]!));

  // El libro nombra las pestañas y las apunta con un id de relación; el archivo
  // de relaciones dice qué XML es cada una. El número de `sheetN.xml` NO sigue
  // el orden de las pestañas, así que este rodeo no es opcional.
  const relaciones = new Map<string, string>();
  for (const m of leerTexto(archivos, "xl/_rels/workbook.xml.rels").matchAll(
    /Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  ))
    relaciones.set(m[1]!, m[2]!.replace(/^\/?xl\//, ""));

  const libro = leerTexto(archivos, "xl/workbook.xml");
  if (!libro) throw new Error("Ese archivo no es un .xlsx: le falta la hoja de cálculo.");

  const hojas: HojaXlsx[] = [];
  for (const m of libro.matchAll(/<sheet\s([^>]*)\/?>/g)) {
    const atributos = m[1]!;
    const nombre = desescapar(/name="([^"]*)"/.exec(atributos)?.[1] ?? "");
    const idRelacion = /r:id="([^"]+)"/.exec(atributos)?.[1];
    const ruta = idRelacion ? relaciones.get(idRelacion) : undefined;
    if (!ruta) continue;
    hojas.push({ nombre, filas: filasDe(leerTexto(archivos, `xl/${ruta}`), compartidas) });
  }

  if (!hojas.length) throw new Error("Ese archivo no tiene ninguna hoja que leer.");
  return hojas;
}

/** Las filas de una hoja, ya en texto. */
function filasDe(xml: string, compartidas: string[]): string[][] {
  const filas: string[][] = [];

  for (const f of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const celdas: string[] = [];

    // Las dos formas de una celda: vacía con atributos (`<c r="A1"/>`) o con
    // contenido. Una sola expresión las cubre y por eso hay dos grupos de
    // atributos, de los que solo uno viene con valor.
    for (const c of f[2]!.matchAll(/<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const atributos = c[1] ?? c[2] ?? "";
      const cuerpo = c[3] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(atributos)?.[1];
      // Excel omite las celdas vacías, así que la posición sale de la
      // referencia. Sin esto, una fila con un hueco desplaza todo lo que sigue
      // y el nombre de alguien acaba en la columna del programa.
      const columna = ref ? columnaDe(ref) : celdas.length;
      const tipo = /t="([^"]+)"/.exec(atributos)?.[1];
      const valor = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? "";

      let texto: string;
      if (tipo === "s") texto = compartidas[Number(valor)] ?? "";
      else if (tipo === "inlineStr") texto = textoDe(cuerpo);
      else texto = desescapar(valor);

      while (celdas.length < columna) celdas.push("");
      celdas[columna] = texto.trim();
    }

    // Las filas de una hoja también pueden venir salteadas, pero un hueco entre
    // filas no desplaza columnas: se descarta y ya. Lo que sí se conserva son
    // las filas con celdas vacías, que quien lee decide si le sirven.
    filas.push(celdas);
  }

  return filas;
}
