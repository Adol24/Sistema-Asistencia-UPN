/**
 * Punto de entrada de `npm run verificar-mocks`.
 *
 * Imprime el resumen de los datos simulados y la lista de invariantes violados.
 * Sale con código 1 si hay alguna violación, para que sirva en CI.
 */

import { resumenMocks, verificarMocks } from "../src/mocks/verificar";

const violaciones = verificarMocks();
const resumen = resumenMocks();

console.log("Resumen de los datos simulados");
console.log("──────────────────────────────");
for (const [clave, valor] of Object.entries(resumen)) {
  const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
  console.log(`  ${clave.padEnd(22)} ${texto}`);
}

console.log("");
if (violaciones.length === 0) {
  console.log("✓ Todos los invariantes se cumplen.");
  process.exit(0);
}

console.log(`✗ ${violaciones.length} invariante(s) violado(s):`);
const porInvariante = new Map<string, string[]>();
for (const v of violaciones) {
  porInvariante.set(v.invariante, [...(porInvariante.get(v.invariante) ?? []), v.detalle]);
}
for (const [invariante, detalles] of porInvariante) {
  console.log(`\n  [${invariante}] ${detalles.length} caso(s)`);
  for (const d of detalles.slice(0, 10)) console.log(`      · ${d}`);
  if (detalles.length > 10) console.log(`      … y ${detalles.length - 10} más`);
}
process.exit(1);
