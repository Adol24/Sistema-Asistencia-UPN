/**
 * Verificación de los invariantes de los datos simulados.
 *
 * Existe porque estas reglas no estaban escritas en ninguna parte y se rompió
 * una sin querer: al alinear los días con el padrón, nueve participantes
 * quedaron inscritos en talleres que no se imparten su día. Nadie lo habría
 * notado hasta ver la pantalla.
 *
 * Se ejecuta con `npm run verificar-mocks`. Al agregar una regla nueva a los
 * mocks, agrégala también aquí.
 */

import { elegibilidadEvento, nombreEnRevisionActivo } from "@/lib/elegibilidad";
import { alumnosPadron as padronMock } from "./alumnosPadron";
import { buscarNivel, catalogoAcademico } from "./catalogos";
import { asistencias as asistenciasMock } from "./asistencias";
import { bitacora, casosSoporte as casosMock } from "./casosSoporte";
import { evidencias as evidenciasMock, evidenciasDuplicadas as duplicadasMock } from "./evidencias";
import { participantes as participantesMock } from "./participantes";
import { talleres as talleresMock } from "./talleres";
import { usuariosInternos as usuariosMock } from "./usuariosInternos";
import type { EstadoEvidencia, EstadoPago, RolInterno } from "./tipos";

/**
 * Los invariantes son de dos clases, y confundirlas hace ruido:
 *
 * - `integridad`: reglas que deben cumplirse SIEMPRE, al arrancar y en marcha.
 *   El día del participante sigue al padrón, su taller se imparte su día, nada
 *   apunta a folios inexistentes. Si una se rompe, hay un error.
 * - `cobertura`: propiedades del conjunto de ARRANQUE para que el prototipo sea
 *   evaluable —dos talleres llenos, casos verdes por día, dos pares de hash
 *   duplicado, un mínimo de elegibles—. Que un administrador edite el catálogo y
 *   deje un solo taller lleno no es un error: es su trabajo.
 * - `historico`: consecuencias legítimas de un cambio en marcha. Si a alguien se
 *   le mueve el día, sus asistencias anteriores quedan en el día viejo. No se
 *   reescribe la historia; se avisa.
 */
export type ClaseInvariante = "integridad" | "cobertura" | "historico";

export interface Violacion {
  invariante: string;
  detalle: string;
  clase: ClaseInvariante;
}

/**
 * Datos sobre los que se comprueban los invariantes.
 *
 * Por omisión son los de arranque, que es lo que valida `npm run verificar-mocks`.
 * Pero la sesión puede moverlos: la importación del padrón cambia el día de un
 * participante y la edición de un taller cambia sus días. Poder pasar el estado
 * vivo es lo que permite comprobar que esas dos operaciones no rompen en tiempo
 * de ejecución las mismas reglas que se respetan al arrancar.
 */
export interface DatosVerificables {
  participantes: typeof participantesMock;
  asistencias: typeof asistenciasMock;
  evidencias: typeof evidenciasMock;
  talleres: typeof talleresMock;
  casosSoporte: typeof casosMock;
  usuariosInternos: typeof usuariosMock;
  alumnosPadron: typeof padronMock;
}

const ESTADOS_PAGO: EstadoPago[] = [
  "pre_registrado",
  "comprobante_recibido",
  "pagado",
  "discrepancia",
  "expirado",
  "cancelado",
];
const ESTADOS_EVIDENCIA: EstadoEvidencia[] = ["pendiente", "aprobada", "rechazada", "no_entregada"];
const ROLES: RolInterno[] = [
  "administrador",
  "servicios_financieros",
  "capturista",
  "revisor_evidencias",
  "soporte",
];

/**
 * Propiedades del conjunto de ARRANQUE, no reglas permanentes: garantizan que el
 * prototipo tenga casos con los que evaluarse. Que un administrador edite el
 * catálogo y deje un solo taller lleno no es un error, es su trabajo.
 */
const DE_COBERTURA = new Set([
  "volumen",
  "caso-cupo-lleno",
  "caso-dos-lugares",
  "caso-pocos-lugares",
  "cobertura-pago-evento",
  "cobertura-pago-taller",
  "cobertura-evidencia",
  "cobertura-roles",
  "cobertura-soporte",
  "hash-duplicado",
  "enie",
  "pagados-sin-entrada",
  "cierre-automatico-sin-casos",
  "evidencias-por-dia",
  "constancia-inalcanzable",
  "elegibles-por-perfil",
  "elegibles-total",
  "marca-nombre-en-revision",
  "anomalia-rafaga",
  "anomalia-horario",
  "niveles-representados",
]);

/**
 * Consecuencias legítimas de un cambio en marcha: si a alguien se le mueve el
 * día, sus asistencias y evidencias anteriores quedan en el día viejo. No se
 * reescribe la historia; se avisa.
 */
const HISTORICAS = new Set(["asistencia-vs-dia", "evidencia-en-dia-presencial"]);

const claseDe = (invariante: string): ClaseInvariante =>
  DE_COBERTURA.has(invariante)
    ? "cobertura"
    : HISTORICAS.has(invariante)
      ? "historico"
      : "integridad";

export const DATOS_DE_ARRANQUE: DatosVerificables = {
  participantes: participantesMock,
  asistencias: asistenciasMock,
  evidencias: evidenciasMock,
  talleres: talleresMock,
  casosSoporte: casosMock,
  usuariosInternos: usuariosMock,
  alumnosPadron: padronMock,
};

/** Comprueba todos los invariantes conocidos y devuelve las violaciones encontradas. */
export function verificarMocks(datos: DatosVerificables = DATOS_DE_ARRANQUE): Violacion[] {
  const {
    participantes,
    asistencias,
    evidencias,
    talleres,
    casosSoporte,
    usuariosInternos,
    alumnosPadron,
  } = datos;
  const getParticipante = (folio: string) => participantes.find((p) => p.folio === folio);
  const getTaller = (id?: string) => talleres.find((t) => t.id === id);
  const evidenciasDuplicadas = () => {
    const porHash = new Map<string, (typeof evidencias)[number][]>();
    evidencias.forEach((e) => porHash.set(e.hash, [...(porHash.get(e.hash) ?? []), e]));
    return [...porHash.values()].filter((g) => g.length > 1);
  };
  const v: Violacion[] = [];
  const fallo = (invariante: string, detalle: string) =>
    v.push({ invariante, detalle, clase: claseDe(invariante) });

  // --- Volúmenes exigidos por la especificación -----------------------------
  if (participantes.length !== 60)
    fallo("volumen", `participantes = ${participantes.length}, se esperan 60`);
  if (alumnosPadron.length !== 40)
    fallo("volumen", `alumnosPadron = ${alumnosPadron.length}, se esperan 40`);
  if (talleres.length !== 11) fallo("volumen", `talleres = ${talleres.length}, se esperan 11`);
  if (evidencias.length < 60) fallo("volumen", `evidencias = ${evidencias.length}, se esperan ~80`);

  // --- Padrón y participantes son consistentes ------------------------------
  const porMatricula = new Map(
    participantes.filter((p) => p.matricula).map((p) => [p.matricula!, p]),
  );
  alumnosPadron.forEach((a) => {
    const p = porMatricula.get(a.matricula);
    if (!p) {
      fallo(
        "padron-sin-participante",
        `${a.matricula} (${a.nombre}) está en el padrón pero no en participantes`,
      );
      return;
    }
    // Solo cuando el padrón ya tiene día: el alta que espera reparto no está en
    // desacuerdo con nadie, simplemente todavía no se le asignó.
    if (a.dia && p.dia !== a.dia)
      fallo("dia-vs-padron", `${a.matricula}: padrón día ${a.dia}, participante día ${p.dia}`);
    if (!a.dia)
      fallo(
        "participante-sin-dia-en-padron",
        `${a.matricula} (${a.nombre}) ya es participante del día ${p.dia} y su fila del padrón no tiene día`,
      );
    if (p.nombre !== a.nombre)
      fallo("nombre-vs-padron", `${a.matricula}: padrón "${a.nombre}", participante "${p.nombre}"`);
  });
  participantes
    .filter((p) => p.perfil === "alumno" && !p.matricula)
    .forEach((p) =>
      fallo("alumno-sin-matricula", `${p.folio} (${p.nombre}) es alumno y no tiene matrícula`),
    );

  // --- Los datos académicos del participante vienen del padrón ---------------
  // Ya no los declara el alumno: los entrega Servicios Escolares. Si el
  // participante y su fila del padrón no coinciden, alguien los desalineó en
  // marcha, y el reporte por programa deja de significar nada.
  participantes
    .filter((p) => p.perfil === "alumno")
    .forEach((p) => {
      const a = alumnosPadron.find((x) => x.matricula === p.matricula);
      if (!a) return; // ya lo reporta `alumno-sin-matricula` / `padron-sin-participante`
      if (p.nivel !== a.nivel || p.programa !== a.programa || p.avance !== a.avance)
        fallo(
          "academicos-vs-padron",
          `${p.folio}: padrón dice ${a.nivel} · ${a.programa} · ${a.avance}, participante dice ${p.nivel} · ${p.programa} · ${p.avance}`,
        );
      if ((p.grupo ?? "") !== (a.grupo ?? ""))
        fallo(
          "academicos-vs-padron",
          `${p.folio}: grupo "${p.grupo ?? ""}" contra "${a.grupo ?? ""}" del padrón`,
        );
      if (p.plantel !== a.plantel)
        fallo(
          "plantel-vs-padron",
          `${p.folio}: plantel "${p.plantel ?? ""}" contra "${a.plantel}" del padrón`,
        );
    });

  // --- El padrón trae datos académicos válidos -------------------------------
  alumnosPadron.forEach((a) => {
    const nivel = buscarNivel(catalogoAcademico, a.nivel);
    if (!nivel) {
      fallo("nivel-inexistente", `${a.matricula}: "${a.nivel}" no está en el catálogo académico`);
      return;
    }
    if (!nivel.programas.includes(a.programa))
      fallo("programa-vs-nivel", `${a.matricula}: "${a.programa}" no es un programa de ${a.nivel}`);
    if (a.avance < 1 || a.avance > nivel.totalAvance)
      fallo(
        "avance-fuera-de-rango",
        `${a.matricula}: ${nivel.etiquetaAvance.toLowerCase()} ${a.avance}, y ${a.nivel} llega a ${nivel.totalAvance}`,
      );
    if (!a.plantel) fallo("plantel-vacio", `${a.matricula} (${a.nombre}) no tiene plantel`);
  });

  // Que existan alumnos de cada nivel es cobertura: hace falta para que las
  // pantallas se puedan evaluar con casos de licenciatura y de posgrado.
  catalogoAcademico.forEach(({ nivel }) => {
    const n = participantes.filter((p) => p.perfil === "alumno" && p.nivel === nivel).length;
    if (n === 0) fallo("niveles-representados", `ningún alumno declara ${nivel}`);
  });

  // --- Sede derivada del día ------------------------------------------------
  participantes.forEach((p) => {
    const esperada = p.dia === 3 ? "Teatro Victoria" : "Salón SUTERM";
    if (p.sede !== esperada)
      fallo("sede-vs-dia", `${p.folio}: día ${p.dia} debería ser "${esperada}", es "${p.sede}"`);
  });

  // --- El taller elegido se imparte el día del participante ------------------
  participantes
    .filter((p) => p.tallerId)
    .forEach((p) => {
      const t = getTaller(p.tallerId);
      if (!t) {
        fallo("taller-inexistente", `${p.folio} apunta al taller ${p.tallerId}, que no existe`);
        return;
      }
      if (!t.dias.includes(p.dia))
        fallo(
          "taller-vs-dia",
          `${p.folio}: ${t.id} se imparte los días ${t.dias.join(",")}, el participante va el ${p.dia}`,
        );
      if (p.montoEsperadoTaller !== t.costo)
        fallo(
          "monto-taller",
          `${p.folio}: monto esperado ${p.montoEsperadoTaller}, costo de ${t.id} es ${t.costo}`,
        );
    });

  // --- cupoOcupado coherente con las asignaciones ---------------------------
  talleres.forEach((t) => {
    const inscritos = participantes.filter((p) => p.tallerId === t.id).length;
    if (t.cupoOcupado < inscritos)
      fallo(
        "cupo-ocupado",
        `${t.id}: cupoOcupado ${t.cupoOcupado} es menor que los ${inscritos} inscritos del prototipo`,
      );
    if (t.cupoOcupado > t.cupoTotal)
      fallo("cupo-excedido", `${t.id}: ${t.cupoOcupado} ocupados sobre un cupo de ${t.cupoTotal}`);
  });

  // --- Casos visuales que la especificación exige del catálogo ---------------
  const llenos = talleres.filter((t) => t.cupoTotal - t.cupoOcupado <= 0);
  if (llenos.length < 2)
    fallo("caso-cupo-lleno", `se exigen 2 talleres con cupo lleno, hay ${llenos.length}`);
  const conDosLugares = talleres.filter((t) => t.cupoTotal - t.cupoOcupado === 2);
  if (conDosLugares.length < 1)
    fallo("caso-dos-lugares", `se exige 1 taller con solo 2 lugares, hay ${conDosLugares.length}`);
  const pocos = talleres.filter((t) => {
    const libres = t.cupoTotal - t.cupoOcupado;
    return libres > 0 && libres < 5;
  });
  if (pocos.length < 1)
    fallo("caso-pocos-lugares", "ningún taller cae en el estado «pocos lugares» (menos de 5)");

  // --- Cobertura de estados -------------------------------------------------
  ESTADOS_PAGO.forEach((e) => {
    if (!participantes.some((p) => p.estadoPagoEvento === e))
      fallo("cobertura-pago-evento", `ningún participante en estado "${e}"`);
    if (!participantes.some((p) => p.estadoPagoTaller === e))
      fallo("cobertura-pago-taller", `ningún taller de participante en estado "${e}"`);
  });
  ESTADOS_EVIDENCIA.forEach((e) => {
    if (!evidencias.some((x) => x.estado === e))
      fallo("cobertura-evidencia", `ninguna evidencia en estado "${e}"`);
  });
  ROLES.forEach((r) => {
    if (!usuariosInternos.some((u) => u.rol === r))
      fallo("cobertura-roles", `ningún usuario interno con rol "${r}"`);
  });
  (["abierto", "en_proceso", "resuelto"] as const).forEach((e) => {
    if (!casosSoporte.some((c) => c.estado === e))
      fallo("cobertura-soporte", `ningún caso de soporte en estado "${e}"`);
  });

  // --- Dos pares de hash duplicado ------------------------------------------
  const dup = evidenciasDuplicadas();
  if (dup.length !== 2)
    fallo("hash-duplicado", `se exigen 2 pares de hash duplicado, hay ${dup.length}`);
  dup.forEach((g) => {
    if (g.length !== 2)
      fallo("hash-duplicado", `un grupo de duplicados tiene ${g.length} evidencias, se esperan 2`);
    if (new Set(g.map((e) => e.folio)).size !== g.length)
      fallo(
        "hash-duplicado",
        `el par con hash ${g[0]!.hash} pertenece al mismo alumno; deben ser alumnos distintos`,
      );
  });

  // --- Nombres: mayúsculas sin acentos, pero conservando la Ñ ----------------
  const conEnie = participantes.filter((p) => /Ñ/.test(p.nombre)).length;
  if (conEnie < 3) fallo("enie", `se exigen al menos 3 nombres con Ñ, hay ${conEnie}`);
  participantes.forEach((p) => {
    if (/[ÁÉÍÓÚÜ]/.test(p.nombre))
      fallo("acentos", `${p.folio}: "${p.nombre}" lleva acentos y no debería`);
    if (p.nombre !== p.nombre.toUpperCase())
      fallo("mayusculas", `${p.folio}: "${p.nombre}" no está en mayúsculas`);
  });

  // --- Asistencias ----------------------------------------------------------
  if (!asistencias.some((a) => a.cierreAutomatico))
    fallo("cierre-automatico", "ninguna asistencia con cierreAutomatico: true");
  asistencias.forEach((a) => {
    const p = getParticipante(a.folio);
    if (!p) fallo("asistencia-huerfana", `${a.id} apunta al folio ${a.folio}, que no existe`);
    else if (p.dia !== a.dia)
      fallo("asistencia-vs-dia", `${a.id}: día ${a.dia}, el participante asiste el ${p.dia}`);
  });

  // --- Casos verdes disponibles para el escáner ------------------------------
  // Si todo pagado tuviera ya su entrada, el escáner respondería «YA REGISTRADO»
  // casi siempre y el caso normal de la puerta sería el más difícil de mostrar.
  const MIN_VERDES_POR_DIA = 2;
  ([1, 2, 3] as const).forEach((dia) => {
    const pagadosDelDia = participantes.filter(
      (p) => p.dia === dia && p.estadoPagoEvento === "pagado",
    );
    const conEntrada = new Set(
      asistencias.filter((a) => a.dia === dia && a.tipo === "entrada").map((a) => a.folio),
    );
    const sinEntrada = pagadosDelDia.filter((p) => !conEntrada.has(p.folio));
    if (sinEntrada.length < MIN_VERDES_POR_DIA)
      fallo(
        "pagados-sin-entrada",
        `día ${dia}: solo ${sinEntrada.length} pagados sin entrada, se necesitan al menos ${MIN_VERDES_POR_DIA} para poder escanear en verde`,
      );
    const conSalida = new Set(
      asistencias.filter((a) => a.dia === dia && a.tipo === "salida").map((a) => a.folio),
    );
    const sinSalida = [...conEntrada].filter((f) => !conSalida.has(f));
    if (sinSalida.length < 1)
      fallo(
        "cierre-automatico-sin-casos",
        `día ${dia}: nadie con entrada y sin salida, el cierre automático no se puede evaluar`,
      );
  });

  // --- Evidencias repartidas entre los tres días -----------------------------
  // Sin un mínimo por día, filtrar por el día 3 en el panel de revisión deja
  // una cola simbólica que no representa nada.
  const MIN_EVIDENCIAS_POR_DIA = 15;
  ([1, 2, 3] as const).forEach((dia) => {
    const n = evidencias.filter((e) => e.dia === dia).length;
    if (n < MIN_EVIDENCIAS_POR_DIA)
      fallo(
        "evidencias-por-dia",
        `día ${dia}: solo ${n} evidencias, se necesitan al menos ${MIN_EVIDENCIAS_POR_DIA} para que la cola sea representativa`,
      );
  });
  // Nadie sube evidencia del día en que asistió en persona.
  evidencias.forEach((e) => {
    const p = getParticipante(e.folio);
    if (p && p.dia === e.dia)
      fallo("evidencia-en-dia-presencial", `${e.id}: ${e.folio} asiste el día ${e.dia} en persona`);
  });

  // --- El requisito de constancia debe ser alcanzable -------------------------
  // Un alumno necesita 2 evidencias aprobadas. Si el reparto de estados nunca
  // coincide en aprobada para el mismo alumno, la lista de elegibles sale vacía
  // para el perfil más numeroso y el módulo de constancias no se puede evaluar.
  const MIN_ALUMNOS_CON_DOS_APROBADAS = 5;
  const aprobadasPorFolio = new Map<string, number>();
  evidencias
    .filter((e) => e.estado === "aprobada")
    .forEach((e) => aprobadasPorFolio.set(e.folio, (aprobadasPorFolio.get(e.folio) ?? 0) + 1));
  const conDos = [...aprobadasPorFolio.values()].filter((n) => n >= 2).length;
  if (conDos < MIN_ALUMNOS_CON_DOS_APROBADAS)
    fallo(
      "constancia-inalcanzable",
      `solo ${conDos} alumnos tienen 2 evidencias aprobadas, se necesitan al menos ${MIN_ALUMNOS_CON_DOS_APROBADAS} para que haya elegibles`,
    );

  // --- El listado de elegibles debe ser evaluable -----------------------------
  // Con dos o tres elegibles no se pueden probar filtros, orden ni exportación.
  // El mínimo por perfil garantiza además que los tres estén representados.
  const entornoMock = {
    estadoDe: (p: (typeof participantes)[number]) => ({
      evento: p.estadoPagoEvento,
      taller: p.tallerId ? p.estadoPagoTaller : undefined,
    }),
    asistenciasDe: (folio: string, dia?: 1 | 2 | 3) =>
      asistencias.filter((a) => a.folio === folio && (dia === undefined || a.dia === dia)),
    evidencias,
    diasTallerDe: (id?: string) => (getTaller(id)?.dias ?? []) as (1 | 2 | 3)[],
  };
  const MIN_ELEGIBLES_POR_PERFIL = 1;
  const MIN_ELEGIBLES_TOTAL = 10;
  let totalElegibles = 0;
  (["alumno", "docente", "externo"] as const).forEach((perfil) => {
    const n = participantes.filter(
      (p) => p.perfil === perfil && elegibilidadEvento(entornoMock, p).elegible,
    ).length;
    totalElegibles += n;
    if (n < MIN_ELEGIBLES_POR_PERFIL)
      fallo(
        "elegibles-por-perfil",
        `perfil ${perfil}: ${n} elegibles, se necesita al menos ${MIN_ELEGIBLES_POR_PERFIL}`,
      );
  });
  if (totalElegibles < MIN_ELEGIBLES_TOTAL)
    fallo(
      "elegibles-total",
      `${totalElegibles} elegibles en total, se necesitan al menos ${MIN_ELEGIBLES_TOTAL} para poder evaluar filtros y exportación`,
    );
  if (!participantes.some((p) => nombreEnRevisionActivo(p, casosSoporte).marcado))
    fallo(
      "marca-nombre-en-revision",
      "nadie con nombre en revisión y caso vivo: no se puede evaluar la marca del listado",
    );

  // --- Casos que el monitoreo en vivo debe poder detectar ---------------------
  const minutosDe = (hora: string) => {
    const [h, m] = hora.split(":");
    return Number(h) * 60 + Number(m ?? 0);
  };
  const porCapturistaYMinuto = new Map<string, number>();
  asistencias.forEach((a) => {
    const clave = `${a.capturista}|${a.dia}|${Math.floor(minutosDe(a.hora) / 2)}`;
    porCapturistaYMinuto.set(clave, (porCapturistaYMinuto.get(clave) ?? 0) + 1);
  });
  const hayRafaga = [...porCapturistaYMinuto.values()].some((n) => n >= 6);
  if (!hayRafaga)
    fallo(
      "anomalia-rafaga",
      "ningún capturista concentra registros suficientes en dos minutos; el monitoreo no tendría qué alertar",
    );
  const fueraDeHorario = asistencias.filter((a) => {
    const m = minutosDe(a.hora);
    return m < 8 * 60 || m > 14 * 60;
  });
  if (fueraDeHorario.length === 0)
    fallo(
      "anomalia-horario",
      "ninguna asistencia en horario improbable; el monitoreo no tendría qué alertar",
    );

  // --- Evidencias y casos de soporte apuntan a participantes reales ---------
  evidencias.forEach((e) => {
    if (!getParticipante(e.folio))
      fallo("evidencia-huerfana", `${e.id} apunta al folio ${e.folio}, que no existe`);
  });
  casosSoporte.forEach((c) => {
    const p = getParticipante(c.folio);
    if (!p) fallo("caso-huerfano", `${c.id} apunta al folio ${c.folio}, que no existe`);
    else if (p.nombre !== c.nombre)
      fallo(
        "caso-nombre",
        `${c.id}: folio ${c.folio} es de "${p.nombre}", el caso dice "${c.nombre}"`,
      );
  });
  bitacora.forEach((b) => {
    const folio = /PRE-\d+/.exec(b.detalle)?.[0];
    if (folio && !getParticipante(folio))
      fallo("bitacora-huerfana", `bitácora ${b.id} cita el folio ${folio}, que no existe`);
  });

  // --- Folios únicos --------------------------------------------------------
  const folios = new Set(participantes.map((p) => p.folio));
  if (folios.size !== participantes.length)
    fallo("folio-duplicado", "hay folios repetidos entre participantes");

  return v;
}

/** Resumen legible de los datos, para acompañar el reporte de verificación. */
export function resumenMocks(datos: DatosVerificables = DATOS_DE_ARRANQUE) {
  const {
    participantes,
    asistencias,
    evidencias,
    talleres,
    casosSoporte,
    usuariosInternos,
    alumnosPadron,
  } = datos;
  const getTaller = (id?: string) => talleres.find((t) => t.id === id);
  const evidenciasDuplicadas = () => {
    const porHash = new Map<string, (typeof evidencias)[number][]>();
    evidencias.forEach((e) => porHash.set(e.hash, [...(porHash.get(e.hash) ?? []), e]));
    return [...porHash.values()].filter((g) => g.length > 1);
  };
  const cuenta = <T, K extends string>(xs: T[], k: (x: T) => K | undefined) => {
    const r: Record<string, number> = {};
    xs.forEach((x) => {
      const key = k(x);
      if (key) r[key] = (r[key] ?? 0) + 1;
    });
    return r;
  };
  return {
    participantes: participantes.length,
    porPerfil: cuenta(participantes, (p) => p.perfil),
    porDia: cuenta(participantes, (p) => String(p.dia)),
    estadoPagoEvento: cuenta(participantes, (p) => p.estadoPagoEvento),
    estadoPagoTaller: cuenta(participantes, (p) => p.estadoPagoTaller),
    alumnosPadron: alumnosPadron.length,
    talleres: talleres.length,
    talleresLlenos: talleres.filter((t) => t.cupoOcupado >= t.cupoTotal).map((t) => t.id),
    talleresPocosLugares: talleres
      .filter((t) => t.cupoTotal - t.cupoOcupado > 0 && t.cupoTotal - t.cupoOcupado < 5)
      .map((t) => `${t.id} (${t.cupoTotal - t.cupoOcupado})`),
    evidencias: evidencias.length,
    evidenciasPorDia: Object.fromEntries(
      ([1, 2, 3] as const).map((d) => [d, evidencias.filter((e) => e.dia === d).length]),
    ),
    estadoEvidencia: cuenta(evidencias, (e) => e.estado),
    paresHashDuplicado: evidenciasDuplicadas().length,
    alumnosConDosEvidenciasAprobadas: (() => {
      const m = new Map<string, number>();
      evidencias
        .filter((e) => e.estado === "aprobada")
        .forEach((e) => m.set(e.folio, (m.get(e.folio) ?? 0) + 1));
      return [...m.values()].filter((n) => n >= 2).length;
    })(),
    asistencias: asistencias.length,
    cierresAutomaticos: asistencias.filter((a) => a.cierreAutomatico).length,
    pagadosSinEntradaPorDia: Object.fromEntries(
      ([1, 2, 3] as const).map((dia) => {
        const conEntrada = new Set(
          asistencias.filter((a) => a.dia === dia && a.tipo === "entrada").map((a) => a.folio),
        );
        return [
          dia,
          participantes.filter(
            (p) => p.dia === dia && p.estadoPagoEvento === "pagado" && !conEntrada.has(p.folio),
          ).length,
        ];
      }),
    ),
    usuariosInternos: usuariosInternos.length,
    casosSoporte: casosSoporte.length,
    nombresConEnie: participantes.filter((p) => /Ñ/.test(p.nombre)).length,
    elegiblesPorPerfil: Object.fromEntries(
      (["alumno", "docente", "externo"] as const).map((perfil) => [
        perfil,
        participantes.filter(
          (p) =>
            p.perfil === perfil &&
            elegibilidadEvento(
              {
                estadoDe: (x) => ({
                  evento: x.estadoPagoEvento,
                  taller: x.tallerId ? x.estadoPagoTaller : undefined,
                }),
                asistenciasDe: (folio, dia) =>
                  asistencias.filter(
                    (a) => a.folio === folio && (dia === undefined || a.dia === dia),
                  ),
                evidencias,
                diasTallerDe: (id) => (getTaller(id)?.dias ?? []) as (1 | 2 | 3)[],
              },
              p,
            ).elegible,
        ).length,
      ]),
    ),
  };
}
