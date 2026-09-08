import type { Dia, EstadoPago, Participante, Perfil } from "./tipos";
import { getTallerBase } from "./talleres-base";
import { alumnosPadron } from "./alumnosPadron";

const CUOTA = 650;

type Fila = [
  nombre: string,
  perfil: Perfil,
  dia: Dia,
  estado: EstadoPago,
  tallerId: string | undefined,
  estadoTaller: EstadoPago | undefined,
  enRevision: boolean,
];

/**
 * Los primeros 40 registros son los 40 alumnos de `alumnosPadron.ts`, en el
 * mismo orden: la matrícula se deriva del índice con la misma fórmula, así que
 * todo alumno del padrón tiene su participante y no hay registros huérfanos.
 * El día de cada alumno es el que le asigna el padrón —Servicios Escolares es
 * la fuente de verdad— y el taller elegido siempre se imparte ese día.
 *
 * Después vienen 12 docentes y 8 externos, que no pertenecen al padrón.
 *
 * `bun run verificar-mocks` comprueba todas estas reglas.
 */
const filas: Fila[] = [
  ["JUAN CARLOS PEREZ MUÑOZ", "alumno", 1, "pagado", "T01", "pagado", false],
  ["MARIA FERNANDA LOPEZ PEÑA", "alumno", 2, "pagado", "T06", "pre_registrado", false],
  ["LUIS ANGEL NUÑEZ RAMIREZ", "alumno", 3, "comprobante_recibido", "T05", "pagado", false],
  ["ANA SOFIA GUTIERREZ SOLIS", "alumno", 1, "pagado", undefined, undefined, false],
  [
    "DIEGO ARMANDO CASTILLO RUIZ",
    "alumno",
    2,
    "pre_registrado",
    "T01",
    "comprobante_recibido",
    false,
  ],
  ["ALEJANDRA MORENO ZAVALA", "alumno", 3, "pagado", undefined, undefined, false],
  ["JOSE EDUARDO SANDOVAL LIRA", "alumno", 1, "pagado", "T07", "expirado", false],
  ["KARLA PATRICIA MEDINA ROJAS", "alumno", 2, "pagado", "T06", "pagado", true],
  [
    "RICARDO ALONSO TREVIÑO CANTU",
    "alumno",
    3,
    "comprobante_recibido",
    undefined,
    undefined,
    false,
  ],
  ["PAOLA MICHELLE HERRERA VEGA", "alumno", 1, "pagado", "T04", "cancelado", false],
  ["FERNANDO JAVIER AGUILAR MOTA", "alumno", 2, "pagado", "T01", "pagado", false],
  ["ITZEL GUADALUPE RIVERA SOTO", "alumno", 3, "pagado", "T09", "comprobante_recibido", false],
  ["MIGUEL ANGEL BARRERA LUNA", "alumno", 1, "pagado", undefined, undefined, false],
  ["DANIELA ESTEFANIA CRUZ MARQUEZ", "alumno", 2, "pagado", undefined, undefined, false],
  ["EMILIANO SALAZAR OCHOA", "alumno", 3, "pagado", "T08", "expirado", false],
  ["REGINA ALEJANDRA VALDEZ PINEDA", "alumno", 1, "pagado", "T01", "pagado", false],
  ["OSCAR IVAN DELGADO ESPARZA", "alumno", 2, "pagado", "T01", "cancelado", true],
  ["XIMENA GUADALUPE FLORES QUEZADA", "alumno", 3, "cancelado", "T05", "pre_registrado", false],
  ["ANDRES FELIPE ROMERO CHAVEZ", "alumno", 1, "pagado", undefined, undefined, false],
  ["NATALIA MONSERRAT GAONA PALACIOS", "alumno", 2, "pagado", undefined, undefined, false],
  ["SERGIO ANTONIO MENDOZA IBARRA", "alumno", 3, "pagado", "T03", "pagado", false],
  ["VALERIA JIMENEZ ESCOBEDO", "alumno", 1, "pagado", "T07", "pre_registrado", false],
  ["HECTOR MANUEL CAMPOS ARELLANO", "alumno", 2, "pagado", "T01", "pagado", false],
  ["CAMILA RENATA ORTIZ MUÑIZ", "alumno", 3, "pagado", undefined, undefined, false],
  [
    "JORGE LUIS SANTIAGO BECERRA",
    "alumno",
    1,
    "pre_registrado",
    "T04",
    "comprobante_recibido",
    false,
  ],
  ["MARIANA ISABEL DUARTE FONSECA", "alumno", 2, "pagado", "T06", "pagado", true],
  ["PABLO CESAR VILLANUEVA ROSAS", "alumno", 3, "discrepancia", undefined, undefined, false],
  ["JIMENA ALEJANDRA ROBLES CANO", "alumno", 1, "pagado", "T02", "pagado", false],
  [
    "ALEXIS GERARDO NAVARRO PONCE",
    "alumno",
    2,
    "comprobante_recibido",
    undefined,
    undefined,
    false,
  ],
  ["FERNANDA LIZBETH MARTINEZ SOLANO", "alumno", 3, "pagado", "T08", "cancelado", false],
  ["CARLOS ALBERTO ESTRADA GALINDO", "alumno", 1, "expirado", "T01", "pagado", false],
  ["LUCIA MARGARITA ACOSTA VARELA", "alumno", 2, "pagado", "T06", "comprobante_recibido", false],
  ["BRENDA JAZMIN CARRILLO OSUNA", "alumno", 3, "pagado", "T05", "discrepancia", false],
  ["IVAN ALEJANDRO PEÑALOZA GARZA", "alumno", 1, "pagado", undefined, undefined, false],
  ["MELISSA ARACELI CORTES YAÑEZ", "alumno", 2, "pagado", "T01", "expirado", true],
  ["GUSTAVO ADOLFO LIMON BALDERAS", "alumno", 3, "discrepancia", "T03", "pagado", false],
  ["ARIADNA SOFIA MUÑOZ CASTAÑEDA", "alumno", 1, "pagado", "T07", "cancelado", false],
  ["LEONARDO DANIEL BAUTISTA REYES", "alumno", 2, "pagado", "T06", "pre_registrado", false],
  ["ANDREA CAROLINA VAZQUEZ NIÑO", "alumno", 3, "pagado", undefined, undefined, false],
  [
    "JOAQUIN EMILIO SERNA PLASCENCIA",
    "alumno",
    1,
    "expirado",
    "T04",
    "comprobante_recibido",
    false,
  ],
  ["ROBERTO CARLOS PEÑA MALDONADO", "docente", 1, "pagado", "T02", "pagado", false],
  [
    "SILVIA ELENA CABRERA MONTES",
    "docente",
    2,
    "comprobante_recibido",
    "T06",
    "discrepancia",
    false,
  ],
  ["ARTURO MARTIN GALVAN REYNA", "docente", 3, "pagado", undefined, undefined, true],
  ["BEATRIZ ADRIANA LARIOS MENDEZ", "docente", 1, "pre_registrado", "T04", "pagado", false],
  ["GERARDO ANTONIO ZUÑIGA PARRA", "docente", 2, "pagado", "T06", "expirado", false],
  ["MONICA GABRIELA TOVAR ESQUIVEL", "docente", 3, "discrepancia", undefined, undefined, false],
  ["RAUL EDUARDO SEPULVEDA ARIAS", "docente", 1, "pagado", "T07", "pre_registrado", false],
  [
    "ADRIANA CECILIA MONTOYA GRANADOS",
    "docente",
    2,
    "comprobante_recibido",
    "T06",
    "cancelado",
    false,
  ],
  ["FRANCISCO JAVIER OLVERA BAEZ", "docente", 3, "pagado", undefined, undefined, false],
  [
    "LETICIA VERONICA ANGULO SERRANO",
    "docente",
    1,
    "expirado",
    "T10",
    "comprobante_recibido",
    false,
  ],
  ["ISMAEL ALEJANDRO PARDO GUZMAN", "docente", 2, "pagado", "T06", "discrepancia", false],
  ["ARMANDO NICOLAS FIGUEROA BRISEÑO", "docente", 3, "pre_registrado", undefined, undefined, true],
  [
    "MARTIN ALFONSO BUSTOS RENDON",
    "externo",
    1,
    "discrepancia",
    "T04",
    "comprobante_recibido",
    false,
  ],
  ["GRISELDA ANAHI PORTILLO MEZA", "externo", 2, "pagado", undefined, undefined, false],
  ["JULIO ANDRES QUIROGA LANDA", "externo", 3, "cancelado", "T11", "pre_registrado", false],
  ["MAYRA ALEJANDRA CERVANTES OROZCO", "externo", 1, "pre_registrado", "T01", "pagado", false],
  ["SAUL ANTONIO IBARRA MUÑOZ", "externo", 2, "expirado", "T01", "discrepancia", true],
  ["NANCY GUADALUPE RANGEL BELTRAN", "externo", 3, "pagado", undefined, undefined, false],
  ["EDGAR OMAR VALENZUELA CORONA", "externo", 1, "pagado", "T07", "pagado", false],
  [
    "TANIA MARISOL ESPINOZA GALLEGOS",
    "externo",
    2,
    "comprobante_recibido",
    "T06",
    "expirado",
    false,
  ],
];

const sedePorDia = (dia: Dia) => (dia === 3 ? "Teatro Victoria" : "Salón SUTERM");

const correoDe = (nombre: string, perfil: Perfil, i: number) => {
  const base = nombre.toLowerCase().replace(/ñ/g, "n").split(" ").slice(0, 2).join(".");
  const dominio =
    perfil === "alumno"
      ? "alumnos.universidad.mx"
      : perfil === "docente"
        ? "universidad.mx"
        : "correo.com";
  return `${base}${i}@${dominio}`;
};

export const participantes: Participante[] = filas.map((f, i) => {
  const [nombre, perfil, dia, estado, tallerId, estadoTaller, enRevision] = f;
  const taller = getTallerBase(tallerId);
  // Del padrón sale todo lo académico: matrícula, nombre, nivel, programa,
  // avance, grupo y plantel. Lo único que el alumno declara es su correo y su
  // celular, así que eso sí se simula aquí.
  const alumno = perfil === "alumno" ? alumnosPadron[i] : undefined;
  const diaFinal = alumno?.dia ?? dia;
  return {
    id: `P${String(i + 1).padStart(3, "0")}`,
    folio: `PRE-00${String(800 + i + 1)}`,
    matricula: alumno?.matricula,
    nombre,
    perfil,
    correo: correoDe(nombre, perfil, i + 1),
    celular: `81${String(10000000 + i * 137311).slice(0, 8)}`,
    institucion:
      perfil === "externo"
        ? ["Instituto Tecnológico Regional", "Universidad del Valle", "Colegio de Bachilleres"][
            i % 3
          ]!
        : "Universidad Autónoma",
    // Los datos académicos salen del padrón, no se inventan aquí: es Servicios
    // Escolares quien los entrega, y el alumno no los captura.
    nivel: alumno?.nivel,
    programa: alumno?.programa,
    avance: alumno?.avance,
    grupo: alumno?.grupo,
    plantel: alumno?.plantel,
    dia: diaFinal,
    sede: sedePorDia(diaFinal),
    estadoPagoEvento: estado,
    tallerId,
    estadoPagoTaller: estadoTaller,
    nombreEnRevision: enRevision,
    montoEsperadoEvento: CUOTA,
    montoEsperadoTaller: taller?.costo,
    referenciaEvento:
      estado === "pagado" || estado === "comprobante_recibido" || estado === "discrepancia"
        ? `REF${String(482910 + i * 13)}`
        : undefined,
    creadoEn: `0${(i % 9) + 1}/09/2026 1${i % 6}:${String(10 + (i % 40)).padStart(2, "0")}`,
  };
});

export const buscarParticipante = (q: string) => {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return participantes.filter(
    (p) =>
      p.folio.toLowerCase().includes(t) ||
      (p.matricula ?? "").toLowerCase().includes(t) ||
      p.nombre.toLowerCase().includes(t) ||
      p.correo.toLowerCase().includes(t),
  );
};

export const getParticipante = (folio: string) => participantes.find((p) => p.folio === folio);

/** Participante que corresponde a una matrícula del padrón, si ya se pre-registró. */
export const getParticipantePorMatricula = (matricula: string) =>
  participantes.find((p) => p.matricula?.toLowerCase() === matricula.trim().toLowerCase());
