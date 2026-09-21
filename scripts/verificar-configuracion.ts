/**
 * Comprueba que la configuración del evento se guarde de verdad.
 *
 *     bun run verificar-configuracion
 *
 * **No toca la base ni la red.** Todo lo que mira son funciones puras, así que
 * corre en cualquier sitio y en un parpadeo.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe
 * ---------------------------------------------------------------------------
 * `/admin/configuracion` edita veintitrés campos y la capa de escritura sabía
 * guardar ocho. Los otros trece se descartaban en silencio —los cuatro datos
 * bancarios, los dos de la ventanilla, la fecha límite, el aviso de privacidad,
 * los términos, el horario de soporte y los dos tramos de registro— y la
 * pantalla anunciaba «Configuración guardada» igual.
 *
 * El más caro era el banco: es la cuenta a la que depositan setecientas
 * personas. Alguien corrige la CLABE, lee que se guardó, se va tranquilo, y los
 * depósitos siguen yendo a la cuenta vieja.
 *
 * Lo que dejó que durara no fue el error, fue que era invisible: añadir un
 * campo al formulario y olvidar su fila en el mapa no rompía nada. Esta
 * comprobación es lo que faltaba — ahora olvidarlo falla aquí.
 */

import { CONFIGURACION_VACIA, type ConfiguracionEvento } from "@/lib/configuracion";
import {
  camposSinGuardar,
  columnasDeConfiguracion,
  DESTINO_DE_CAMPO,
} from "@/lib/escritura-remota";
import { fechaLimiteTexto, isoAMomentoLocal, momentoLocalAIso } from "@/lib/formato";

let fallas = 0;
const ok = (m: string) => console.log(`OK     ${m}`);
const falla = (m: string, esperaba?: unknown, obtuvo?: unknown) => {
  fallas++;
  console.log(`FALLA  ${m}`);
  if (esperaba !== undefined) {
    console.log(`       esperaba ${JSON.stringify(esperaba)}`);
    console.log(`       obtuvo   ${JSON.stringify(obtuvo)}`);
  }
};
const igual = (que: string, obtuvo: unknown, esperaba: unknown) =>
  JSON.stringify(obtuvo) === JSON.stringify(esperaba) ? ok(que) : falla(que, esperaba, obtuvo);

// ---------------------------------------------------------------------------
console.log("=== TODO CAMPO TIENE DESTINO ===\n");
// ---------------------------------------------------------------------------
/*
 * La comprobación que habría evitado el defecto entero, y la única de este
 * archivo que se defiende sola: no enumera los campos que hay hoy —esa lista
 * envejece— sino que los saca de `ConfiguracionEvento` y exige que cada uno
 * esté colocado. Un campo nuevo sin fila en el mapa aparece aquí el mismo día.
 */
{
  const cubiertos = new Set<string>([
    ...DESTINO_DE_CAMPO.columna,
    ...DESTINO_DE_CAMPO.anidada,
    ...DESTINO_DE_CAMPO.sinColumna,
    ...DESTINO_DE_CAMPO.tablaPropia,
  ]);
  const campos = Object.keys(CONFIGURACION_VACIA) as (keyof ConfiguracionEvento)[];
  const huerfanos = campos.filter((c) => !cubiertos.has(c));

  if (huerfanos.length === 0) ok(`los ${campos.length} campos de la configuración tienen destino`);
  else
    falla(
      `${huerfanos.length} campo(s) sin destino: ${huerfanos.join(", ")}.\n` +
        "       Añádelos a COLUMNA o ANIDADAS en src/lib/escritura-remota.ts si se pueden\n" +
        "       guardar, o a SIN_COLUMNA si no, para que la pantalla lo pueda avisar.",
    );

  const sobran = [...cubiertos].filter((c) => !(c in CONFIGURACION_VACIA));
  if (sobran.length === 0) ok("ningún destino apunta a un campo que ya no existe");
  else falla(`destinos huérfanos, el campo ya no existe: ${sobran.join(", ")}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== LOS TRECE QUE SE DESCARTABAN ===\n");
// ---------------------------------------------------------------------------
igual(
  "los cuatro datos bancarios llegan a sus columnas",
  columnasDeConfiguracion({
    banco: {
      banco: "BBVA",
      cuenta: "0123456789",
      clabe: "012345678901234567",
      beneficiario: "UPN",
    },
  }),
  {
    banco_nombre: "BBVA",
    banco_cuenta: "0123456789",
    banco_clabe: "012345678901234567",
    banco_beneficiario: "UPN",
  },
);

igual(
  "los dos de la ventanilla llegan a las suyas",
  columnasDeConfiguracion({ ventanilla: { lugar: "Caja 2", horario: "9:00 a 14:00" } }),
  { ventanilla_lugar: "Caja 2", ventanilla_horario: "9:00 a 14:00" },
);

igual(
  "fecha límite, tramos de registro, soporte, aviso y términos",
  columnasDeConfiguracion({
    fechaLimite: "2026-10-09T18:00:00.000Z",
    registroEntrada: "8:00 a 9:00 hrs",
    registroSalida: "13:00 a 14:00 hrs",
    horarioSoporte: "9:00 a 18:00",
    avisoPrivacidad: "El aviso.",
    terminos: "Los términos.",
  }),
  {
    fecha_limite: "2026-10-09T18:00:00.000Z",
    registro_entrada: "8:00 a 9:00 hrs",
    registro_salida: "13:00 a 14:00 hrs",
    horario_soporte: "9:00 a 18:00",
    aviso_privacidad: "El aviso.",
    terminos: "Los términos.",
  },
);

// ---------------------------------------------------------------------------
console.log("\n=== LO QUE YA FUNCIONABA SIGUE IGUAL ===\n");
// ---------------------------------------------------------------------------
igual(
  "los campos planos de siempre",
  columnasDeConfiguracion({ nombre: "XIV Encuentro", cuotaEvento: 350, horasValidacion: 48 }),
  { nombre: "XIV Encuentro", cuota_evento: 350, horas_validacion: 48 },
);
// Con dominio vacío se acepta cualquier correo, y eso en la tabla es NULL, no "".
igual(
  "el dominio en blanco sigue guardándose como NULL",
  columnasDeConfiguracion({ dominioInstitucional: "" }),
  { dominio_institucional: null },
);
igual("un parche vacío no escribe nada", columnasDeConfiguracion({}), {});

// ---------------------------------------------------------------------------
console.log("\n=== LO QUE NO SE PUEDE GUARDAR, SE DICE ===\n");
// ---------------------------------------------------------------------------
igual(
  "horario y catálogo no producen ninguna columna",
  columnasDeConfiguracion({ horario: "8:00 a 14:00", catalogoAcademico: [] }),
  {},
);
{
  const avisos = camposSinGuardar({ horario: "8:00 a 14:00" });
  if (avisos.length === 1) ok("y el horario se puede nombrar para avisar");
  else falla("el horario debería poder nombrarse", 1, avisos.length);
}
igual("un parche que sí se guarda no inventa avisos", camposSinGuardar({ nombre: "X" }), []);
// Ni `dias` ni el catálogo se descartan: los dos tienen tabla propia y su
// propio camino de escritura, `guardarDia` y `guardarCatalogo`. Que no
// produzcan columnas no es lo mismo que perderse, y confundirlo haría que la
// pantalla avisara de una pérdida que no ocurre.
igual("los días NO se reportan como perdidos", camposSinGuardar({ dias: [] }), []);
igual("el catálogo académico tampoco", camposSinGuardar({ catalogoAcademico: [] }), []);

// ---------------------------------------------------------------------------
console.log("\n=== EL VIAJE DE IDA Y VUELTA DE LA FECHA LÍMITE ===\n");
// ---------------------------------------------------------------------------
{
  const crudo = "2026-10-09T18:00:00.000Z";

  // El defecto original: la configuración se quedaba con la frase y perdía la
  // fecha, así que no había nada que mandar a una columna `timestamptz`.
  const texto = fechaLimiteTexto(crudo);
  if (texto && Number.isNaN(new Date(texto).getTime()))
    ok(`el texto que lee el participante no es una fecha válida: «${texto}»`);
  else falla("fechaLimiteTexto debería producir texto para leer, no una fecha", "una frase", texto);

  if (!/\d{1,2}:\d{2}/.test(texto)) ok("y no lleva hora: al participante se le promete un día");
  else falla("el texto del participante no debería llevar hora", "sin hora", texto);

  // Lo que hace el campo `datetime-local` del panel: crudo -> campo -> crudo.
  const vuelta = momentoLocalAIso(isoAMomentoLocal(crudo));
  igual("editarla en el panel conserva el instante exacto", new Date(vuelta).toISOString(), crudo);

  igual("una fecha vacía no revienta", fechaLimiteTexto(""), "");
  igual("una fecha que no se entiende se devuelve intacta", fechaLimiteTexto("ayer"), "ayer");
}

console.log(fallas === 0 ? "\nLA CONFIGURACIÓN SE GUARDA" : `\n${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
