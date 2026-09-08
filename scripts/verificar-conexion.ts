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
  // Una matrícula que no existe: la función debe responder, no fallar.
  const { error } = await sb.rpc("fn_buscar_en_padron", { p_matricula: "00000000000" });
  if (error) falla("fn_buscar_en_padron", error);
  else ok("fn_buscar_en_padron responde y el anónimo puede llamarla");
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
