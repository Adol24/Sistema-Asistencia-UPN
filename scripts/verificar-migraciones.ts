/**
 * Revisa las migraciones SIN base de datos, buscando lo que solo se descubre al
 * pegarlas en el editor SQL de producción.
 *
 *     bun run verificar-migraciones
 *
 * Por qué existe
 * -------------
 * `MIGRACIONES.md` lo dice desde siempre: «No se ejecutan contra ningún Postgres
 * al escribirlas: en la máquina donde se escriben no hay `psql`, ni el CLI de
 * Supabase, ni Docker. Salen revisadas leyéndolas, no probadas — y ya se vio lo
 * que eso cuesta.»
 *
 * El 23 de septiembre volvió a costar. `20260923200000` llevaba un `raise` con
 * `%%` —que en PL/pgSQL es un porcentaje LITERAL, no dos marcadores— y tres
 * argumentos para dos marcadores. La función entera no compiló y el error
 * apareció donde más molesta: en producción, al aplicarla, con el pre-registro
 * a cuatro días.
 *
 * Revisarlo a ojo no funciona, y hay prueba: al auditar las tres migraciones de
 * ese día a mano no se encontró, y el primer comprobante que se escribió para
 * buscarlo daba cinco falsos positivos porque cortaba el formato en la primera
 * coma sin mirar si estaba dentro de una cadena. Lo que hace falta es leer el
 * SQL como lo lee Postgres, y eso es lo que hay aquí.
 *
 * Qué NO hace
 * -----------
 * No valida SQL. Un `select` mal escrito, una columna que no existe o una
 * política mal puesta pasan por aquí sin que nadie se entere: eso solo lo dice
 * la base. Esto cubre las comprobaciones que se pueden hacer LEYENDO, y ninguna
 * más, porque un comprobante que pareciera validar el SQL sería peor que
 * ninguno —haría creer que un verde significa «se puede aplicar»—.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Las dos carpetas, no solo una.
 *
 * `utilidades/` no lleva migraciones —son datos y consultas— pero se pega en el
 * MISMO editor SQL y trae las mismas construcciones: `raise` con marcadores y
 * bloques `do $$ … $$`. El fallo que dio origen a este comprobante fue un
 * `raise` mal contado, y ahí puede ocurrir igual sin que nadie lo revise.
 *
 * La diferencia es cuánto duele, y va al revés de lo que sugiere el nombre de
 * la carpeta: una migración se aplica una vez, con cuidado y con el archivo
 * delante. Un archivo de utilidades se pega deprisa, y `abrir-ventana-…` abre o
 * cierra el pre-registro de una audiencia entera.
 */
const CARPETAS = ["supabase/migrations", "supabase/utilidades"];

let fallas = 0;
const falla = (archivo: string, linea: number, m: string) => {
  fallas++;
  console.log(`FALLA  ${archivo}:${linea}`);
  console.log(`       ${m}`);
};

/**
 * Separa el formato de un `raise` de sus argumentos.
 *
 * El formato son las cadenas literales pegadas al principio —PL/pgSQL las
 * concatena— y los argumentos, lo que va tras la primera coma DE NIVEL
 * SUPERIOR. «De nivel superior» es la parte que importa: el formato lleva comas
 * dentro, y los argumentos llevan paréntesis con comas dentro.
 *
 * El escape de una comilla simple en SQL es doblarla (`''`), no una barra.
 */
function partir(cuerpo: string): { formato: string; argumentos: string } {
  const partes: string[] = [];
  let i = 0;
  let profundidad = 0;

  while (i < cuerpo.length) {
    const ch = cuerpo[i]!;

    if (ch === "'") {
      let j = i + 1;
      let trozo = "";
      while (j < cuerpo.length) {
        if (cuerpo[j] === "'") {
          if (cuerpo[j + 1] === "'") {
            trozo += "'";
            j += 2;
            continue;
          }
          break;
        }
        trozo += cuerpo[j];
        j++;
      }
      partes.push(trozo);
      i = j + 1;
      continue;
    }

    if (ch === "," && profundidad === 0)
      return { formato: partes.join(""), argumentos: cuerpo.slice(i + 1) };

    if (ch === "(" || ch === "[") profundidad++;
    else if (ch === ")" || ch === "]") profundidad--;
    i++;
  }

  return { formato: partes.join(""), argumentos: "" };
}

/**
 * Lo que va desde `desde` hasta el punto y coma que cierra la sentencia.
 *
 * NO se busca con `/(.*?);/`, y este comprobante nació de equivocarse en esto
 * dos veces seguidas. Un punto y coma dentro de una cadena es perfectamente
 * legal —«El programa no las trae; se escriben en /admin/talleres»— y una
 * expresión perezosa corta ahí, se queda sin los argumentos y acusa de
 * desajuste a un `raise` que estaba bien.
 *
 * Es la misma lección que la de `%%`: hay que leer el SQL como lo lee Postgres,
 * y eso significa saber cuándo se está dentro de una cadena.
 */
function hastaElPuntoYComa(sql: string, desde: number): string {
  let i = desde;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      i = j + 1;
      continue;
    }
    if (ch === ";") return sql.slice(desde, i);
    i++;
  }
  return sql.slice(desde);
}

/** Marcadores de verdad: `%%` es un porcentaje literal y no cuenta. */
const marcadores = (formato: string) => (formato.replace(/%%/g, "").match(/%/g) ?? []).length;

/** Cuántos argumentos hay, contando comas de nivel superior. */
function argumentos(resto: string): number {
  if (!resto.trim()) return 0;
  let n = 1;
  let profundidad = 0;
  let hayAlgo = false;
  let i = 0;

  while (i < resto.length) {
    const ch = resto[i]!;
    if (ch === "'") {
      let j = i + 1;
      while (j < resto.length) {
        if (resto[j] === "'") {
          if (resto[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      i = j + 1;
      hayAlgo = true;
      continue;
    }
    if (ch === "(" || ch === "[") profundidad++;
    else if (ch === ")" || ch === "]") profundidad--;
    else if (ch === "," && profundidad === 0) n++;
    else if (!/\s/.test(ch)) hayAlgo = true;
    i++;
  }
  return hayAlgo ? n : 0;
}

/**
 * Quita comentarios para no confundirlos con código.
 *
 * Un `-- raise exception 'algo %'` dentro de una explicación no es un `raise`, y
 * en este repo los comentarios son largos y hablan justamente de los `raise` que
 * hay al lado. Sin esto, el comprobante se pelearía con la documentación.
 *
 * Se sustituyen por espacios y no se borran, para que los números de línea
 * sigan siendo los del archivo: un aviso que señala la línea equivocada obliga
 * a buscar a mano lo que se acaba de encontrar.
 */
function sinComentarios(sql: string): string {
  let fuera = "";
  let i = 0;
  while (i < sql.length) {
    const dos = sql.slice(i, i + 2);
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      fuera += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (dos === "--") {
      const fin = sql.indexOf("\n", i);
      const hasta = fin === -1 ? sql.length : fin;
      fuera += " ".repeat(hasta - i);
      i = hasta;
      continue;
    }
    if (dos === "/*") {
      const fin = sql.indexOf("*/", i + 2);
      const hasta = fin === -1 ? sql.length : fin + 2;
      // Se conservan los saltos de línea del bloque, que es lo que cuenta.
      fuera += sql.slice(i, hasta).replace(/[^\n]/g, " ");
      i = hasta;
      continue;
    }
    fuera += sql[i];
    i++;
  }
  return fuera;
}

const archivos = CARPETAS.flatMap((carpeta) =>
  readdirSync(carpeta)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    // Se conserva la carpeta para poder abrir el archivo y, sobre todo, para
    // que el nombre de una falla diga en cuál de las dos está.
    .map((nombre) => ({ carpeta, nombre, ruta: join(carpeta, nombre) })),
);

for (const carpeta of CARPETAS)
  console.log(
    `Revisando ${archivos.filter((a) => a.carpeta === carpeta).length} archivos en ${carpeta}`,
  );
console.log();

let raises = 0;

for (const { ruta, nombre: archivo } of archivos) {
  const bruto = readFileSync(ruta, "utf8");
  const sql = sinComentarios(bruto);

  // --- Los argumentos de cada `raise` ---------------------------------------
  for (const m of sql.matchAll(/\braise\s+(?:exception|notice|warning|info|log|debug)\b/gi)) {
    const cuerpoCompleto = hastaElPuntoYComa(sql, m.index + m[0].length);
    // `using errcode = …` y compañía no son argumentos del formato.
    const cuerpo = cuerpoCompleto.split(/\busing\b/i)[0]!;
    const { formato, argumentos: resto } = partir(cuerpo);
    // Un `raise` sin cadena es `raise;` —relanzar— o `raise exception using …`.
    if (!formato.trim() && !resto.trim()) continue;
    raises++;
    const nf = marcadores(formato);
    const na = argumentos(resto);
    if (nf !== na) {
      const linea = bruto.slice(0, m.index).split("\n").length;
      falla(
        archivo,
        linea,
        `raise con ${nf} marcador(es) y ${na} argumento(s). Ojo a «%%», que es un ` +
          `porcentaje literal y NO dos marcadores. Formato: «${formato.slice(0, 60)}…»`,
      );
    }
  }

  // --- El equilibrio de las comillas de dólar ------------------------------
  /*
   * Un `$$` o un `$fn$` sin cerrar no da un error legible: Postgres se come el
   * resto del archivo como si fuera texto y falla mucho más abajo, o —peor— crea
   * una función a medias sin quejarse.
   */
  for (const etiqueta of new Set(
    [...sql.matchAll(/\$[a-z_]*\$/gi)].map((m) => m[0].toLowerCase()),
  )) {
    const escapada = etiqueta.replace(/\$/g, "\\$");
    const veces = (sql.match(new RegExp(escapada, "gi")) ?? []).length;
    if (veces % 2 !== 0)
      falla(archivo, 1, `la comilla de dólar «${etiqueta}» aparece ${veces} veces, y son impares.`);
  }
}

console.log(`Comprobados ${raises} «raise» con formato.\n`);
console.log(
  fallas === 0
    ? "LO QUE SE PUEDE REVISAR LEYENDO, PASA\n" +
        "  Esto NO valida el SQL: una columna que no existe o una política mal\n" +
        "  puesta solo las dice la base. Pruébalas en un proyecto de prueba."
    : `${fallas} PROBLEMA(S)`,
);
process.exit(fallas === 0 ? 0 : 1);
