/**
 * Comprueba que cada llamada del cliente a la base mande EXACTAMENTE los
 * parámetros que esa función declara.
 *
 *     bun run verificar-firmas-rpc
 *
 * Por qué existe
 * -------------
 * El 2026-09-29 se aplicó `20260929130000`, que le añadió `p_quiere_constancia`
 * a `fn_preregistrar_externo`. El cliente copió ese parámetro también al alta de
 * ALUMNO, que nunca lo tuvo —la exención es del maestro—, y el pre-registro de
 * todos los alumnos murió con la ventana abierta:
 *
 *     Could not find the function public.fn_preregistrar_alumno(
 *       p_acepto_aviso, p_celular, p_correo, p_matricula,
 *       p_quiere_constancia, p_taller
 *     ) in the schema cache
 *
 * **PostgREST resuelve la sobrecarga por los NOMBRES de los parámetros.** Un
 * parámetro de más no se ignora: no encuentra ninguna función con esa
 * combinación y contesta `PGRST202` antes de llegar a Postgres. Mandar de más
 * rompe igual que mandar de menos, y el mensaje habla de «schema cache», que
 * hace pensar en un caché sucio cuando lo que sobra es un argumento.
 *
 * TypeScript no puede verlo: `rpc` recibe un objeto suelto y las firmas viven en
 * archivos `.sql`. Un `create or replace` con otra firma tampoco avisa —crea una
 * SOBRECARGA nueva y deja viva la vieja—, así que ni siquiera aplicar la
 * migración delata el desajuste.
 *
 * Qué NO hace
 * -----------
 * No comprueba TIPOS, ni orden, ni que la función esté aplicada en la base: lee
 * los archivos. Una migración escrita y sin correr cuenta aquí como existente.
 * Eso solo lo dice la base, y para eso está `verificar-conexion`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRACIONES = "supabase/migrations";
const CLIENTE = "src/lib/datos.ts";

let fallas = 0;
const falla = (m: string, detalle: string) => {
  fallas++;
  console.log(`FALLA  ${m}`);
  console.log(`       ${detalle}`);
};

/**
 * Fuera los comentarios, que es donde se escondían los dos falsos positivos de
 * la primera versión.
 *
 * `fn_preregistrar_externo` lleva un bloque `/* … *\/` ENTRE dos parámetros para
 * explicar por qué el valor por omisión es el que cobra. Partir la firma por
 * comas sin quitarlo antes deja un trozo que no empieza por `p_`, y el
 * parámetro siguiente se pierde: la herramienta denunciaba como «de más» un
 * parámetro que la función sí declara.
 */
const sinComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/** Un parámetro declarado: su nombre y si puede omitirse. */
interface Param {
  nombre: string;
  conDefecto: boolean;
}

/**
 * Todas las firmas VIVAS de cada función, en el orden en que se aplican.
 *
 * Son varias a propósito: `fn_guardar_taller` existe con trece parámetros y con
 * doce, y la de doce es una envoltura que delega conservando el salón. Quedarse
 * con «la última» daría por malo al cliente que llama a la otra.
 *
 * **Y hay que seguir los `drop`, que es la mitad del asunto.** `create or
 * replace` sustituye solo cuando los TIPOS de los argumentos coinciden; con otra
 * lista crea una SOBRECARGA y deja viva la anterior. Por eso `20260917120000` y
 * `20260929130000` empiezan borrando la firma vieja a mano y terminan contando
 * cuántas quedaron. Sin honrar esos `drop`, esta herramienta daría por buena una
 * llamada a una firma que ya no existe —justo lo que rompió el pre-registro—.
 *
 * Los archivos se recorren ORDENADOS: se aplican por marca de tiempo, así que un
 * `drop` solo puede borrar lo que vino antes que él.
 */
function firmasDeclaradas(): Map<string, Param[][]> {
  const firmas = new Map<string, Param[][]>();
  const dir = join(process.cwd(), MIGRACIONES);
  for (const archivo of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(dir, archivo), "utf8");

    const limpio = sinComentarios(sql);

    /*
     * Primero los borrados. Se identifican por CUÁNTOS argumentos llevan y no
     * por cuáles: aquí las firmas se comparan por nombre de parámetro y un
     * `drop` solo escribe tipos, que es lo único que Postgres necesita para
     * distinguir sobrecargas.
     */
    for (const d of limpio.matchAll(
      /drop\s+function\s+(?:if\s+exists\s+)?([a-z0-9_]+)\s*\(([^)]*)\)/gi,
    )) {
      const nombre = d[1]!.toLowerCase();
      const cuantos = d[2]!.split(",").filter((t) => t.trim()).length;
      const suyas = firmas.get(nombre);
      if (suyas)
        firmas.set(
          nombre,
          suyas.filter((s) => s.length !== cuantos),
        );
    }

    /*
     * El borrado en bloque, que es como de verdad se hace aquí.
     *
     * `20260917120000` no escribe los tipos: recorre `pg_proc` por NOMBRE y
     * borra cuanta firma encuentre, y lo explica —«repetirlos es justo donde se
     * cuela el error, y una letra de más deja la función vieja en pie, abierta a
     * `anon` y sin pedir el consentimiento»—. Un `drop` así se lleva TODAS las
     * firmas anteriores de esos nombres, y hay que verlo: sin esto la
     * herramienta seguía creyendo viva la firma de cuatro parámetros del alta de
     * alumno, que la base retiró en septiembre.
     */
    for (const bloque of limpio.matchAll(/do\s+\$([a-z_]*)\$([\s\S]*?)\$\1\$/gi)) {
      const cuerpo = bloque[2]!;
      if (!/drop\s+function/i.test(cuerpo) || !/\bproname\b/i.test(cuerpo)) continue;
      for (const n of cuerpo.matchAll(/'(fn_[a-z0-9_]+)'/gi)) firmas.delete(n[1]!.toLowerCase());
    }

    const re = /create\s+or\s+replace\s+function\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns\b/gi;
    for (const m of sql.matchAll(re)) {
      const nombre = m[1]!.toLowerCase();
      const params = sinComentarios(m[2]!)
        .split(",")
        .map((t) => t.trim())
        .filter((t) => /^p_[a-z0-9_]+\s/i.test(t))
        .map((t) => ({
          nombre: /^(p_[a-z0-9_]+)/i.exec(t)![1]!.toLowerCase(),
          conDefecto: /\bdefault\b/i.test(t),
        }));
      // Una función sin parámetros no interesa: no hay nada que desajustar.
      if (params.length === 0) continue;
      // Con el mismo número de argumentos, sustituye; con otro, se suma.
      const suyas = (firmas.get(nombre) ?? []).filter((s) => s.length !== params.length);
      suyas.push(params);
      firmas.set(nombre, suyas);
    }
  }
  return firmas;
}

/**
 * El objeto de argumentos que sigue al nombre de la función, contando llaves.
 *
 * Con una expresión regular no basta: las llamadas se escriben de tres formas
 * —todo en una línea, el nombre y el objeto en líneas distintas, y el objeto con
 * objetos dentro— y un patrón que atrape las tres atrapa de más. Se cuentan las
 * llaves saltándose lo que hay dentro de comillas, que es lo que hace un
 * analizador de verdad.
 */
function argumentosTrasElNombre(codigo: string, desde: number): string | null {
  let i = desde;
  while (i < codigo.length && codigo[i] !== "{") {
    // Solo se admite lo que puede haber entre el nombre y su objeto. Cualquier
    // otra cosa significa que esa llamada no lleva argumentos.
    if (!/[\s,\n]/.test(codigo[i]!)) return null;
    i++;
  }
  if (i >= codigo.length) return null;
  const inicio = i;
  let nivel = 0;
  let comilla = "";
  for (; i < codigo.length; i++) {
    const c = codigo[i]!;
    if (comilla) {
      if (c === "\\") i++;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return codigo.slice(inicio, i + 1);
  }
  return null;
}

/** Las claves `p_algo:` del primer nivel del objeto. */
function parametrosEnviados(objeto: string): string[] {
  const limpio = objeto
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .slice(1, -1);
  const claves: string[] = [];
  let nivel = 0;
  let comilla = "";
  let inicioClave = 0;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!;
    if (comilla) {
      if (c === "\\") i++;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "{" || c === "[" || c === "(") nivel++;
    else if (c === "}" || c === "]" || c === ")") nivel--;
    else if (c === "," && nivel === 0) inicioClave = i + 1;
    else if (c === ":" && nivel === 0) {
      const clave = limpio.slice(inicioClave, i).trim();
      if (/^p_[a-z0-9_]+$/i.test(clave)) claves.push(clave.toLowerCase());
      inicioClave = i + 1;
    }
  }
  return claves;
}

// --------------------------------------------------------------------------

const firmas = firmasDeclaradas();
const codigo = readFileSync(join(process.cwd(), CLIENTE), "utf8");

let revisadas = 0;
for (const m of codigo.matchAll(/["'](fn_[a-z0-9_]+)["']/g)) {
  const fn = m[1]!.toLowerCase();
  const objeto = argumentosTrasElNombre(codigo, m.index! + m[0].length);
  if (objeto === null) continue;
  const enviados = parametrosEnviados(objeto);
  if (enviados.length === 0) continue;

  const linea = codigo.slice(0, m.index).split("\n").length;
  const suyas = firmas.get(fn);
  if (!suyas) {
    falla(
      `${CLIENTE}:${linea} · ${fn}`,
      "ninguna migración declara esa función con parámetros. O se llama mal, o " +
        "falta la migración que la crea.",
    );
    continue;
  }

  revisadas++;
  // Basta con que UNA sobrecarga admita la llamada; PostgREST hace lo mismo.
  const encaja = suyas.some((params) => {
    const declarados = new Set(params.map((p) => p.nombre));
    const sobran = enviados.filter((p) => !declarados.has(p));
    const faltan = params.filter((p) => !p.conDefecto && !enviados.includes(p.nombre));
    return sobran.length === 0 && faltan.length === 0;
  });
  if (encaja) continue;

  // Para el mensaje se elige la firma MÁS PARECIDA: con varias sobrecargas,
  // enumerarlas todas esconde cuál se quiso llamar.
  const cerca = [...suyas].sort(
    (a, b) =>
      enviados.filter((p) => !b.some((x) => x.nombre === p)).length -
      enviados.filter((p) => !a.some((x) => x.nombre === p)).length,
  )[0]!;
  const declarados = new Set(cerca.map((p) => p.nombre));
  const sobran = enviados.filter((p) => !declarados.has(p));
  const faltan = cerca.filter((p) => !p.conDefecto && !enviados.includes(p.nombre));
  falla(
    `${CLIENTE}:${linea} · ${fn}`,
    [
      sobran.length ? `manda de más: ${sobran.join(", ")}` : "",
      faltan.length
        ? `no manda, y no tienen valor por omisión: ${faltan.map((p) => p.nombre).join(", ")}`
        : "",
      `→ PostgREST contestaría PGRST202. Declarada como (${cerca.map((p) => p.nombre).join(", ")})`,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

console.log(`\nComprobadas ${revisadas} llamadas contra ${firmas.size} funciones declaradas.\n`);
console.log(
  fallas === 0
    ? "CADA LLAMADA CUADRA CON SU FIRMA\n" +
        "  Esto compara archivos, no la base: una migración escrita y sin correr\n" +
        "  cuenta aquí como existente. Los tipos y el orden tampoco se miran."
    : `${fallas} PROBLEMA(S)`,
);
process.exit(fallas === 0 ? 0 : 1);
