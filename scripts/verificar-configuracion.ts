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
import { asistenciaDe, estaDentro, movimientosDe } from "@/lib/escaneo";
import { aAsistencia, aHora } from "@/lib/esquema";
import { elegibilidadEvento } from "@/lib/elegibilidad";
import { referenciaValida, resultadoDe } from "@/lib/pagos-logica";
import { gemelasDe, gruposDuplicados } from "@/lib/revision";
import {
  estadoDeVentana,
  perfilesSinVentana,
  problemasDeVentana,
  programasSinVentana,
  type ProgramaDeVentana,
  type VentanaPreregistro,
} from "@/lib/ventanas";

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

// ---------------------------------------------------------------------------
console.log("\n=== LAS VENTANAS DE PRE-REGISTRO ===\n");
// ---------------------------------------------------------------------------
/*
 * Lo que se comprueba aquí es lo que la base NO puede comprobar.
 *
 * `ventanas_preregistro` tiene su `check (cierra > abre)` y `ventana_cohortes`
 * su `check (avance >= 1)`, así que esos dos errores acaban rebotando de todas
 * formas. Los otros dos no: una ventana sin ningún programa y una cohorte de un
 * avance que ese programa no alcanza son filas perfectamente válidas para
 * PostgreSQL, y las dos rechazan a todo el mundo con «todavía no se anuncia la
 * fecha de registro para tu grupo». Ese es el defecto que esta pantalla puede
 * introducir sin que nada falle, y por eso se comprueba antes de guardar.
 */
{
  const PROGRAMAS: ProgramaDeVentana[] = [
    {
      id: "p-pedagogia",
      nombre: "Licenciatura en Pedagogía",
      nivel: "Licenciatura",
      etiquetaAvance: "Semestre",
      totalAvance: 8,
    },
    {
      id: "p-leip",
      nombre: "Licenciatura en Educación e Innovación Pedagógica",
      nivel: "Licenciatura",
      etiquetaAvance: "Módulo",
      totalAvance: 13,
    },
  ];

  const base: VentanaPreregistro = {
    id: "v1",
    etiqueta: "El registro previo para semestre 7 y módulo 13",
    abre: "2026-09-25T06:00:00.000Z",
    cierra: "2026-09-28T05:59:59.000Z",
    cohortes: [
      { programaId: "p-pedagogia", avance: 7 },
      { programaId: "p-leip", avance: 13 },
    ],
    perfiles: [],
  };

  igual("una ventana completa se puede guardar", problemasDeVentana(base, PROGRAMAS), []);

  // Una ventana solo de docentes es legítima: es el caso para el que se hizo la
  // migración 49 —darle a la organización un turno aparte para quien no sale
  // del padrón— y no lleva ningún programa marcado.
  igual(
    "una ventana solo de perfiles, sin programas, también se guarda",
    problemasDeVentana({ ...base, cohortes: [], perfiles: ["docente", "externo"] }, PROGRAMAS),
    [],
  );

  // El error que ninguna restricción detecta, y el más fácil de cometer: se
  // crea la ventana, se ponen las fechas y se guarda sin marcar a nadie.
  const sinNadie = problemasDeVentana({ ...base, cohortes: [] }, PROGRAMAS);
  if (sinNadie.some((p) => p.includes("no admite a nadie")))
    ok("una ventana sin programas se detiene antes de llegar a la base");
  else falla("una ventana sin programas tiene que bloquear el guardado", "un aviso", sinNadie);

  const sinAvance = problemasDeVentana(
    { ...base, cohortes: [{ programaId: "p-pedagogia", avance: null }] },
    PROGRAMAS,
  );
  if (sinAvance.some((p) => p.includes("Falta el avance")))
    ok("una casilla marcada sin avance tampoco pasa");
  else falla("un programa marcado sin avance tiene que bloquear", "un aviso", sinAvance);

  // El otro silencioso: semestre 13 no existe en una licenciatura de 8, así que
  // esa cohorte no contiene a nadie y la ventana parece cargada.
  const fuera = problemasDeVentana(
    { ...base, cohortes: [{ programaId: "p-pedagogia", avance: 13 }] },
    PROGRAMAS,
  );
  if (fuera.some((p) => p.includes("no existe en")))
    ok("un avance por encima del tope del programa se nombra");
  else falla("un avance fuera de rango tiene que bloquear", "un aviso", fuera);

  const alReves = problemasDeVentana({ ...base, abre: base.cierra, cierra: base.abre }, PROGRAMAS);
  if (alReves.some((p) => p.includes("cierra antes de abrir")))
    ok("cerrar antes de abrir se dice aquí y no en el error de la base");
  else falla("una ventana invertida tiene que bloquear", "un aviso", alReves);

  const sinTexto = problemasDeVentana({ ...base, etiqueta: "  " }, PROGRAMAS);
  if (sinTexto.some((p) => p.includes("Falta el texto")))
    ok("sin texto no se guarda: es lo que lee quien llega tarde");
  else falla("una ventana sin etiqueta tiene que bloquear", "un aviso", sinTexto);

  // --------------------------------------------------------------- estado ---
  const antes = Date.parse("2026-09-20T12:00:00.000Z");
  const durante = Date.parse("2026-09-26T12:00:00.000Z");
  const despues = Date.parse("2026-10-01T12:00:00.000Z");
  igual("antes de abrir está pendiente", estadoDeVentana(base, antes), "pendiente");
  igual("entre las dos fechas está abierta", estadoDeVentana(base, durante), "abierta");
  igual("pasado el cierre está cerrada", estadoDeVentana(base, despues), "cerrada");

  // ------------------------------------------------------ quién queda fuera ---
  igual(
    "con las dos cohortes declaradas no queda ningún programa fuera",
    programasSinVentana([base], PROGRAMAS).map((p) => p.id),
    [],
  );
  igual(
    "y si solo entra una, la otra se puede nombrar",
    programasSinVentana(
      [{ ...base, cohortes: [{ programaId: "p-leip", avance: 13 }] }],
      PROGRAMAS,
    ).map((p) => p.id),
    ["p-pedagogia"],
  );
  /*
   * Sin ninguna ventana TODOS quedan «sin ventana», y eso no es que nadie pueda
   * registrarse: es que puede registrarse cualquiera. El interruptor de la
   * migración 44 va al revés de lo que sugiere una lista vacía, así que la
   * pantalla no enseña este aviso en ese caso —enseña el otro—.
   */
  igual(
    "sin ninguna ventana, ningún programa tiene la suya",
    programasSinVentana([], PROGRAMAS).length,
    PROGRAMAS.length,
  );

  // ------------------------------------------- los perfiles, que van al revés ---
  /*
   * El interruptor de los perfiles es POR AUDIENCIA, y esto es lo que lo
   * comprueba. Mientras ninguna ventana nombre un perfil, docentes y externos
   * entran cuando quieran: la lista sale vacía y la pantalla no avisa de nada,
   * porque avisar diría lo contrario de lo que pasa.
   *
   * Es justo la trampa que la migración 49 tuvo que esquivar en la base: si el
   * interruptor mirase «¿hay alguna ventana?» en vez de «¿hay alguna que hable
   * de esta audiencia?», la ventana de los alumnos cerraría la puerta a los
   * docentes sin que nadie tocase sus fechas.
   */
  igual(
    "con una ventana que solo habla de alumnos, ningún perfil queda fuera",
    perfilesSinVentana([base]).map((p) => p.perfil),
    [],
  );
  igual(
    "sin ninguna ventana tampoco: es que están abiertos, no cerrados",
    perfilesSinVentana([]).map((p) => p.perfil),
    [],
  );
  igual(
    "en cuanto una ventana nombra a los docentes, el externo se queda fuera",
    perfilesSinVentana([{ ...base, perfiles: ["docente"] }]).map((p) => p.perfil),
    ["externo"],
  );
  igual(
    "y con los dos nombrados no queda nadie fuera",
    perfilesSinVentana([{ ...base, perfiles: ["docente", "externo"] }]).map((p) => p.perfil),
    [],
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== LA LLAVE QUE HACE SEGURA LA COLA SIN CONEXIÓN ===\n");
// ---------------------------------------------------------------------------
/*
 * `idRemoto` es el uuid con el que una asistencia se va a guardar, generado por
 * el NAVEGADOR al capturar y no por la base al insertar. Es lo único que permite
 * reintentar la cola sin duplicar: si la fila entró pero la respuesta se perdió
 * de vuelta, el reintento choca contra la llave primaria, y eso significa «ya
 * estaba», no «falló».
 *
 * Si `asistenciaDe` dejara de ponerlo, o lo repitiera, vaciar la cola volvería a
 * poder duplicar asistencias. Y un duplicado no es un renglón de más: invierte
 * el torniquete, así que el siguiente escaneo de esa persona se registra al
 * revés. Por eso se comprueba aquí y no se deja a la vista.
 */
{
  const sesion = { dia: 1, modo: "puerta", punto: "Puerta 1", capturista: "QA" } as const;
  const resultado = {
    tipo: "entrada",
    participante: { folio: "PRE-00801", nombre: "QA PRUEBA" },
  } as unknown as Parameters<typeof asistenciaDe>[0];

  const a = asistenciaDe(resultado, sesion, 1_760_000_000_000, "09:10", 1);
  const b = asistenciaDe(resultado, sesion, 1_760_000_000_000, "09:10", 2);

  if (a.idRemoto) ok("una asistencia nueva trae su propio uuid para la base");
  else falla("asistenciaDe ya no pone `idRemoto`: la cola volvería a poder duplicar");

  if (a.idRemoto && b.idRemoto && a.idRemoto !== b.idRemoto)
    ok("dos escaneos seguidos no comparten uuid");
  else falla("dos escaneos comparten `idRemoto`", "distintos", [a.idRemoto, b.idRemoto]);

  const formaUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (a.idRemoto && formaUuid.test(a.idRemoto))
    ok("tiene forma de uuid, que es lo que la columna `id` admite");
  else falla("`idRemoto` no tiene forma de uuid: el insert lo rechazaría", "uuid", a.idRemoto);
}

// ---------------------------------------------------------------------------
console.log("\n=== LA REGLA DE ELEGIBILIDAD, QUE LLEGÓ A SER TRES ===\n");
// ---------------------------------------------------------------------------
/*
 * Hubo tres reglas y se contradecían en tres ejes: la salida, el umbral de
 * evidencias y a qué perfiles se les piden. Nada las comparaba, así que fueron
 * separándose commit a commit hasta que el portal le prometía constancia a
 * gente que no salía en el listado que se manda a imprimir.
 *
 * Esto fija los tres ejes sobre `elegibilidadEvento`, que es la que alimenta el
 * panel y la exportación. Lo que decide de verdad quién recibe el documento es
 * `v_elegibles`; esta comprobación existe para que las dos no puedan volver a
 * decir cosas distintas sin que nadie se entere.
 */
{
  const persona = (perfil: string, dia: number) =>
    ({ folio: "PRE-00801", nombre: "QA", perfil, dia }) as unknown as Parameters<
      typeof elegibilidadEvento
    >[1];

  const entorno = (aprobadas: { dia: number }[], conEntrada = true) =>
    ({
      estadoDe: () => ({ evento: "pagado", taller: undefined }),
      // Solo la entrada: la salida NO condiciona la constancia. Ver la 25.
      asistenciasDe: () => (conEntrada ? [{ tipo: "entrada" }] : []),
      evidenciasDe: () => aprobadas.map((e) => ({ ...e, estado: "aprobada" })),
      diasTallerDe: () => [],
    }) as unknown as Parameters<typeof elegibilidadEvento>[0];

  const alumno = persona("alumno", 1);

  igual(
    "alumno con pago, entrada y dos evidencias de otros días: elegible",
    elegibilidadEvento(entorno([{ dia: 2 }, { dia: 3 }]), alumno).elegible,
    true,
  );

  // El eje que el cliente no tenía: la evidencia del día propio no cuenta.
  igual(
    "una de las dos es de su propio día: NO elegible",
    elegibilidadEvento(entorno([{ dia: 1 }, { dia: 2 }]), alumno).elegible,
    false,
  );

  igual(
    "alumno con una sola evidencia: NO elegible (el umbral son dos, no una)",
    elegibilidadEvento(entorno([{ dia: 2 }]), alumno).elegible,
    false,
  );

  // A docentes y externos no se les piden: su portal no les ofrece subirlas en
  // ninguna pantalla, así que exigírselas era condenarlos a no serlo nunca.
  igual(
    "docente con pago y entrada, sin evidencias: elegible",
    elegibilidadEvento(entorno([]), persona("docente", 2)).elegible,
    true,
  );

  igual(
    "sin entrada registrada no hay constancia, tenga lo que tenga",
    elegibilidadEvento(entorno([{ dia: 2 }, { dia: 3 }], false), alumno).elegible,
    false,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== LA FRONTERA DEL DINERO ===\n");
// ---------------------------------------------------------------------------
/*
 * La pantalla y la columna tienen que admitir exactamente las mismas
 * referencias. Divergían en UN carácter —el guion, que los bancos usan— y eso
 * bastaba para que el archivo del corte saliera entero en verde en la vista
 * previa y la base rechazara ciento veinte filas por formato. Nadie revisa un
 * archivo que salió todo en verde.
 *
 * Esto fija el lado del cliente. El de la columna lo puso la migración 54 con el
 * mismo patrón, y el comentario de esa migración explica por qué se amplió la
 * base en vez de estrechar el cliente: el guion aparece en cortes reales, así
 * que rechazarlo no evita un error, pierde un depósito que existe.
 */
{
  igual(
    "una referencia con guion es válida: los bancos los usan",
    referenciaValida("REF-900123"),
    true,
  );
  igual("una sin guion también", referenciaValida("REF900123"), true);
  igual("seis caracteres es el mínimo", referenciaValida("ABC12"), false);
  igual("veinte el máximo", referenciaValida("A".repeat(21)), false);
  // Si esto pasara a `true`, la columna las seguiría rechazando en silencio.
  igual("un espacio en medio NO vale", referenciaValida("REF 900123"), false);
  igual("una barra tampoco", referenciaValida("REF/900123"), false);
}

/*
 * Y la regla de la que depende que una discrepancia se pueda guardar: si el
 * monto no cuadra, `resultado` es `discrepancia`, y entonces
 * `chk_discrepancia_con_nota` exige nota. `guardarPago` la garantiza aunque
 * quien llame no la ponga, porque sin ella la base rechazaba el depósito entero
 * y la persona se quedaba en `pre_registrado` con su dinero ya en el banco.
 */
{
  igual("lo que cuadra es un pago", resultadoDe(500, 500), "pagado");
  igual("de menos es discrepancia", resultadoDe(450, 500), "discrepancia");
  igual("de MÁS también: sobra dinero y hay que devolverlo", resultadoDe(600, 500), "discrepancia");
}

// ---------------------------------------------------------------------------
console.log("\n=== EL TORNIQUETE ORDENA BIEN ANTES DE LAS DIEZ ===\n");
// ---------------------------------------------------------------------------
/*
 * El defecto: `aHora` devolvía la hora SIN cero a la izquierda mientras el
 * torniquete ordena los movimientos comparando esas cadenas. Y `"9:10"` es
 * mayor que `"11:30"` como texto, porque compara `"9"` contra `"1"`.
 *
 * Así que cualquier movimiento anterior a las 10:00 leído de la base se ordenaba
 * como el MÁS RECIENTE del día. Alguien que entró a las 09:10 y salió a las
 * 11:30 constaba como dentro, y al volver a las 15:00 la puerta le registraba
 * otra salida en vez de una entrada.
 *
 * Esto lo fija por los dos extremos: que la hora venga rellenada, y que con esas
 * horas el torniquete diga que esa persona está FUERA. Si alguien vuelve a
 * quitar el `padStart`, la segunda comprobación cae sola.
 */
{
  // 2026-10-15, 09:10 y 11:30 en hora local, que es la que pinta `aHora`.
  const nueveDiez = new Date(2026, 9, 15, 9, 10).toISOString();
  const onceTreinta = new Date(2026, 9, 15, 11, 30).toISOString();

  igual("la hora lleva cero a la izquierda", aHora(nueveDiez), "09:10");

  const fila = (registrada_en: string, tipo: string) =>
    ({
      id: `a-${tipo}`,
      dia: 1,
      tipo,
      registrada_en,
      punto: "Puerta 1",
      autorizacion_motivo: null,
      autorizada_por: null,
      participantes: { folio: "PRE-00801", nombre: "QA" },
      capturista: { nombre: "QA" },
      supervisor: null,
    }) as unknown as Parameters<typeof aAsistencia>[0];

  const movimientos = [
    aAsistencia(fila(nueveDiez, "entrada")),
    aAsistencia(fila(onceTreinta, "salida")),
  ];

  igual(
    "entró a las 09:10 y salió a las 11:30: el orden respeta el reloj",
    movimientosDe(movimientos, "PRE-00801", 1).map((m) => m.hora),
    ["09:10", "11:30"],
  );

  igual("y por tanto está FUERA, no dentro", estaDentro(movimientos, "PRE-00801", 1), false);

  // El caso inverso, para que la comprobación no pase por no mirar nada.
  igual(
    "si solo entró, sí está dentro",
    estaDentro([aAsistencia(fila(nueveDiez, "entrada"))], "PRE-00801", 1),
    true,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== SIN HUELLA NO HAY DUPLICADO ===\n");
// ---------------------------------------------------------------------------
/*
 * `aEvidencia` convierte `hash_archivo` nulo en cadena vacía, y en la base es
 * nulo en toda fila `no_entregada`: no hay archivo del que sacar huella. Al
 * agrupar por igualdad de texto, esas filas caían todas en el mismo grupo.
 *
 * Con trescientas sin entregar, el panel anunciaba «Imagen duplicada: este
 * archivo ya fue subido por otros 299 alumnos» y enseñaba dos rectángulos
 * vacíos lado a lado. El revisor rechazaba por duplicada a gente que
 * simplemente no había subido nada — y el rechazo le consume un intento.
 */
{
  const ev = (id: string, hash: string) =>
    ({ id, hash, dia: 2, estado: "pendiente" }) as unknown as Parameters<
      typeof gemelasDe
    >[0][number];

  const sinHuella = [ev("a", ""), ev("b", ""), ev("c", "")];
  igual(
    "tres evidencias sin entregar NO son duplicadas entre sí",
    gruposDuplicados(sinHuella).size,
    0,
  );
  igual("y ninguna tiene gemelas", gemelasDe(sinHuella, sinHuella[0]!).length, 0);

  const h = "a".repeat(64);
  const conHuella = [ev("d", h), ev("e", h), ev("f", "")];
  igual("dos que comparten huella SÍ se agrupan", gruposDuplicados(conHuella).size, 1);
  igual("y se ven la una a la otra", gemelasDe(conHuella, conHuella[0]!).length, 1);
}

console.log(fallas === 0 ? "\nLA CONFIGURACIÓN SE GUARDA" : `\n${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
