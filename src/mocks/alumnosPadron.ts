import type { AlumnoPadron, Dia } from "./tipos";
import { catalogoAcademico } from "./catalogos";

const nombres = [
  "JUAN CARLOS PEREZ MUÑOZ",
  "MARIA FERNANDA LOPEZ PEÑA",
  "LUIS ANGEL NUÑEZ RAMIREZ",
  "ANA SOFIA GUTIERREZ SOLIS",
  "DIEGO ARMANDO CASTILLO RUIZ",
  "ALEJANDRA MORENO ZAVALA",
  "JOSE EDUARDO SANDOVAL LIRA",
  "KARLA PATRICIA MEDINA ROJAS",
  "RICARDO ALONSO TREVIÑO CANTU",
  "PAOLA MICHELLE HERRERA VEGA",
  "FERNANDO JAVIER AGUILAR MOTA",
  "ITZEL GUADALUPE RIVERA SOTO",
  "MIGUEL ANGEL BARRERA LUNA",
  "DANIELA ESTEFANIA CRUZ MARQUEZ",
  "EMILIANO SALAZAR OCHOA",
  "REGINA ALEJANDRA VALDEZ PINEDA",
  "OSCAR IVAN DELGADO ESPARZA",
  "XIMENA GUADALUPE FLORES QUEZADA",
  "ANDRES FELIPE ROMERO CHAVEZ",
  "NATALIA MONSERRAT GAONA PALACIOS",
  "SERGIO ANTONIO MENDOZA IBARRA",
  "VALERIA JIMENEZ ESCOBEDO",
  "HECTOR MANUEL CAMPOS ARELLANO",
  "CAMILA RENATA ORTIZ MUÑIZ",
  "JORGE LUIS SANTIAGO BECERRA",
  "MARIANA ISABEL DUARTE FONSECA",
  "PABLO CESAR VILLANUEVA ROSAS",
  "JIMENA ALEJANDRA ROBLES CANO",
  "ALEXIS GERARDO NAVARRO PONCE",
  "FERNANDA LIZBETH MARTINEZ SOLANO",
  "CARLOS ALBERTO ESTRADA GALINDO",
  "LUCIA MARGARITA ACOSTA VARELA",
  "BRENDA JAZMIN CARRILLO OSUNA",
  "IVAN ALEJANDRO PEÑALOZA GARZA",
  "MELISSA ARACELI CORTES YAÑEZ",
  "GUSTAVO ADOLFO LIMON BALDERAS",
  "ARIADNA SOFIA MUÑOZ CASTAÑEDA",
  "LEONARDO DANIEL BAUTISTA REYES",
  "ANDREA CAROLINA VAZQUEZ NIÑO",
  "JOAQUIN EMILIO SERNA PLASCENCIA",
];

/**
 * Punto de partida de las matrículas simuladas. La universidad usa matrículas de
 * **11 dígitos**, sin letra: `20262122031` es una real. Las 40 se generan a
 * partir de ahí para que se vean como las de verdad.
 *
 * Si los primeros dígitos codifican algo —la generación, el campus, el
 * programa—, este mock no lo refleja: todas caen en el mismo rango. Está
 * anotado en el informe como pregunta abierta.
 */
const BASE_MATRICULA = 20262122031;

/**
 * El padrón tal como llega de Servicios Escolares: nombre completo en una sola
 * columna y matrícula. El día lo asigna la organización, no la universidad.
 */
/** Los planteles de la universidad. Vienen en el archivo, no se eligen. */
const planteles = ["Campus Central", "Campus Norte", "Campus Sur", "Unidad Poniente"];

export const alumnosPadron: AlumnoPadron[] = nombres.map((nombre, i) => {
  // Uno de cada cinco es de posgrado, para que las pantallas tengan casos de los
  // dos niveles sin que el reparto parezca artificial.
  const n = catalogoAcademico[i % 5 === 0 ? 1 : 0]!;
  return {
    matricula: String(BASE_MATRICULA + i * 7),
    nombre,
    nivel: n.nivel,
    programa: n.programas[i % n.programas.length]!,
    avance: (i % n.totalAvance) + 1,
    // No todos los programas manejan grupo: uno de cada tres viene vacío.
    grupo: i % 3 === 0 ? undefined : `${String.fromCharCode(65 + (i % 4))}${(i % 2) + 1}`,
    plantel: planteles[i % planteles.length]!,
    dia: ((i % 3) + 1) as Dia,
  };
});

export const buscarEnPadron = (matricula: string) =>
  alumnosPadron.find((a) => a.matricula.toLowerCase() === matricula.trim().toLowerCase());
