/**
 * Comprueba que lo que la aplicación le pide a Supabase existe y responde.
 *
 * Ejecuta las mismas consultas que `cargarTodo()` y las mismas llamadas del
 * portal, contra el proyecto real. **Solo lee**: no inserta, no actualiza y no
 * borra nada, así que se puede correr sobre la base de producción sin riesgo.
 *
 *     bun run verificar-conexion
 *
 * Las credenciales salen de `.env`, que Bun carga solo. No se imprimen.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env["VITE_SUPABASE_URL"];
const clave = process.env["VITE_SUPABASE_ANON_KEY"];

if (!url || !clave) {
  console.error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  process.exit(1);
}

const sb = createClient(url, clave);

let fallas = 0;
const ok = (m: string) => console.log(`OK     ${m}`);
const falla = (m: string, e?: unknown) => {
  fallas++;
  const d = e as { message?: string; code?: string; hint?: string } | undefined;
  console.log(`FALLA  ${m}`);
  if (d?.message) console.log(`       ${d.code ? `[${d.code}] ` : ""}${d.message}`);
  if (d?.hint) console.log(`       pista: ${d.hint}`);
};

console.log(`Proyecto: ${url.replace(/https:\/\/([^.]+)\..*/, "$1")}\n`);

// ------------------------------------------------ lo que ve un anónimo ---
console.log("=== LECTURA PÚBLICA (lo que ve quien no ha iniciado sesión) ===\n");

const publicas = [
  ["configuracion_evento", "*", 1],
  ["dias_evento", "*", 3],
  [
    "niveles_academicos",
    "id, nivel, etiqueta_avance, total_avance, orden, programas ( nombre )",
    1,
  ],
  ["talleres", "*, taller_dias ( dia )", 0],
] as const;

for (const [tabla, cols, minimo] of publicas) {
  const { data, error } = await sb.from(tabla).select(cols);
  if (error) falla(`${tabla}`, error);
  else if ((data?.length ?? 0) < minimo)
    falla(`${tabla}: ${data?.length ?? 0} filas, se esperaban al menos ${minimo}`);
  else ok(`${tabla.padEnd(22)} ${data?.length ?? 0} filas`);
}

// La forma exacta que espera el puente de tipos.
{
  const { data } = await sb.from("configuracion_evento").select("*").eq("id", 1).single();
  const faltan = [
    "nombre",
    "cuota_evento",
    "fecha_limite",
    "horas_validacion",
    "dominio_institucional",
    "banco_clabe",
    "ventanilla_lugar",
    "aviso_privacidad",
  ].filter((c) => data && !(c in data));
  if (faltan.length) falla(`configuracion_evento sin columnas: ${faltan.join(", ")}`);
  else ok("configuracion_evento tiene las columnas que el puente espera");
}

{
  const { data } = await sb
    .from("niveles_academicos")
    .select("nivel, etiqueta_avance, total_avance, programas ( nombre )");
  const total = (data ?? []).reduce(
    (n, x) => n + ((x as { programas?: unknown[] }).programas?.length ?? 0),
    0,
  );
  if (total === 0) falla("el catálogo no trae programas: la relación no está resolviendo");
  else ok(`catálogo académico: ${data?.length} niveles, ${total} programas`);
}

// ------------------------------------------ lo que NO debe ver un anónimo ---
console.log("\n=== LO QUE LAS POLÍTICAS DEBEN CERRAR ===\n");

for (const tabla of ["padron_alumnos", "participantes", "pagos", "bitacora"] as const) {
  const { data, error } = await sb.from(tabla).select("*").limit(1);
  if (error) ok(`${tabla.padEnd(22)} cerrada (${error.code})`);
  else if ((data?.length ?? 0) === 0) ok(`${tabla.padEnd(22)} cerrada (0 filas para el anónimo)`);
  else falla(`${tabla}: el anónimo puede leerla, y no debería`);
}

// -------------------------------------------- las funciones del portal ---
console.log("\n=== FUNCIONES DEL PORTAL ===\n");

{
  /*
   * `fn_buscar_en_padron` tiene que estar CERRADA al anónimo.
   *
   * Este comprobante esperaba lo contrario, y llevaba desde entonces gritando
   * una falla que era en realidad la corrección funcionando. La migración
   * `20260908120000_padron_sin_enumeracion` la cerró porque devolvía datos del
   * padrón a cualquiera que probara matrículas: anulaba por completo el arreglo
   * de privacidad hecho en la interfaz. El pre-registro no la usa; usa
   * `fn_padron_existe` y `fn_padron_confirmar`.
   *
   * Un comprobante que avisa de algo que está bien acaba enseñando a ignorarlo,
   * y entonces deja de servir el día que avisa de algo que está mal.
   */
  const { error } = await sb.rpc("fn_buscar_en_padron", { p_matricula: "00000000000" });
  if (error) ok(`fn_buscar_en_padron          cerrada al anónimo (${error.code ?? "sin código"})`);
  else falla("fn_buscar_en_padron: el anónimo puede enumerar el padrón, y no debería");
}

{
  // Esta sí es pública, y es la que el pre-registro necesita.
  const { error } = await sb.rpc("fn_padron_existe", { p_matricula: "00000000000" });
  if (error) falla("fn_padron_existe", error);
  else ok("fn_padron_existe responde y el anónimo puede llamarla");
}

{
  const { error } = await sb.rpc("fn_portal_estado", {
    p_folio: "PRE-00000",
    p_credencial: "00000000000",
  });
  // Con credenciales falsas tiene que rechazar, que es justo lo que se comprueba.
  if (error && /incorrect/i.test(error.message)) ok("fn_portal_estado rechaza credenciales falsas");
  else if (error) falla("fn_portal_estado", error);
  else falla("fn_portal_estado aceptó credenciales que no existen");
}

for (const fn of ["fn_repartir_dias_pendientes", "fn_dia_mas_vacio"] as const) {
  const { error } = await sb.rpc(fn);
  if (error) ok(`${fn.padEnd(28)} cerrada al anónimo (${error.code ?? "sin código"})`);
  else falla(`${fn}: el anónimo puede ejecutarla, y no debería`);
}

// ------------------------------------------------ la puerta y sus puntos ---
//
// Comprueba las dos migraciones que cambian cómo funciona la puerta. Ninguna se
// puede dar por aplicada leyendo el archivo: lo que importa es qué contesta la
// base.
console.log("\n=== LA PUERTA COMO TORNIQUETE ===\n");

{
  /*
   * La firma de `fn_evaluar_escaneo` cambió: recibe `p_modo` y ya no `p_tipo`.
   *
   * El anónimo no puede ejecutarla en ninguno de los dos casos, así que lo que
   * se mira es CUÁL error devuelve. Si los parámetros encajan con una función
   * que existe, PostgREST llega hasta el permiso y responde 42501. Si no encaja
   * con ninguna, ni siquiera la encuentra y responde PGRST202. Esa diferencia
   * es la que distingue «la migración corrió» de «la migración no corrió».
   */
  const nueva = await sb.rpc("fn_evaluar_escaneo", {
    p_entrada: "X",
    p_dia: 1,
    p_modo: "puerta",
  });
  if (nueva.error?.code === "42501")
    ok("fn_evaluar_escaneo acepta p_modo y está cerrada al anónimo");
  else if (nueva.error?.code === "PGRST202")
    falla("fn_evaluar_escaneo no conoce p_modo: falta la migración 20260911120000");
  else if (nueva.error) falla("fn_evaluar_escaneo con p_modo", nueva.error);
  else falla("fn_evaluar_escaneo: el anónimo puede ejecutarla, y no debería");

  const vieja = await sb.rpc("fn_evaluar_escaneo", {
    p_entrada: "X",
    p_dia: 1,
    p_tipo: "entrada",
  });
  if (vieja.error?.code === "PGRST202") ok("la firma vieja con p_tipo ya no existe");
  else falla("la firma vieja con p_tipo sigue viva: la migración la dejó a medias");
}

{
  const { error } = await sb.rpc("fn_esta_dentro", {
    p_participante: "00000000-0000-0000-0000-000000000000",
    p_dia: 1,
  });
  if (error?.code === "42501") ok("fn_esta_dentro existe y está cerrada al anónimo");
  else if (error?.code === "PGRST202")
    falla("fn_esta_dentro no existe: falta la migración 20260911120000");
  else if (error) falla("fn_esta_dentro", error);
  else falla("fn_esta_dentro: el anónimo puede ejecutarla, y no debería");
}

{
  // Los puntos de captura por sede, y que los de SUTERM quedaran sembrados.
  const { data, error } = await sb.from("dias_evento").select("dia, puntos").order("dia");
  if (error) falla("dias_evento.puntos: falta la migración 20260911140000", error);
  else {
    const filas = (data ?? []) as { dia: number; puntos: string[] | null }[];
    const conPuertaSuterm = filas.filter((d) =>
      (d.puntos ?? []).some((p) => /suterm/i.test(p)),
    ).length;
    if (conPuertaSuterm >= 2)
      ok(`dias_evento.puntos sembrado: ${conPuertaSuterm} días con la puerta de SUTERM`);
    else
      falla(
        `dias_evento.puntos existe pero solo ${conPuertaSuterm} día(s) traen la puerta de SUTERM; se esperaban 2`,
      );

    const sinPuntos = filas.filter((d) => (d.puntos ?? []).length === 0).map((d) => d.dia);
    if (sinPuntos.length)
      console.log(
        `       día ${sinPuntos.join(", ")} sin puntos: usará los genéricos hasta que se llenen`,
      );
  }
}

// --------------------------------------------------------------- vistas ---
console.log("\n=== VISTAS ===\n");

for (const vista of ["v_talleres", "v_estado_pago", "v_elegibles", "v_reparto_dias"] as const) {
  const { data, error } = await sb.from(vista).select("*").limit(5);
  if (error && error.code === "42501") ok(`${vista.padEnd(22)} existe y está cerrada al anónimo`);
  else if (error) falla(`${vista}`, error);
  else ok(`${vista.padEnd(22)} ${data?.length ?? 0} filas visibles`);
}

console.log(fallas === 0 ? "\nLA CONEXIÓN FUNCIONA" : `\n${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
