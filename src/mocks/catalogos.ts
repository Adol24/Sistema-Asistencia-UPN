/**
 * Catálogo académico que el alumno declara en su pre-registro.
 *
 * Servicios Escolares entrega el padrón con el nombre completo y la matrícula,
 * nada más. El nivel, el programa, el avance y el grupo los captura el propio
 * alumno, así que tienen que existir como catálogo: en un campo libre, cuarenta
 * alumnos escriben la misma carrera de cuarenta maneras y el reporte por
 * programa deja de servir.
 *
 * Es **dato editable, no una constante**. Vive en la configuración del evento y
 * se administra desde `/admin/configuracion`, igual que la cuota o la fecha
 * límite: qué niveles imparte la universidad y cómo se llama su avance es algo
 * que cambia, y no debería requerir tocar código.
 */

/** Un nivel educativo con su catálogo de programas y su forma de contar avance. */
export interface NivelAcademico {
  /** «Licenciatura», «Maestría», «Doctorado»… */
  nivel: string;
  /** Cómo se llama el avance en este nivel: «Semestre», «Módulo», «Cuatrimestre». */
  etiquetaAvance: string;
  /** Hasta dónde llega ese avance. */
  totalAvance: number;
  programas: string[];
}

/** El catálogo de arranque. La configuración parte de aquí y se puede editar. */
export const catalogoAcademico: NivelAcademico[] = [
  {
    nivel: "Licenciatura",
    etiquetaAvance: "Semestre",
    totalAvance: 10,
    programas: [
      "Ingeniería en Sistemas Computacionales",
      "Ingeniería Industrial",
      "Licenciatura en Administración",
      "Licenciatura en Ciencias de la Educación",
      "Licenciatura en Derecho",
      "Licenciatura en Nutrición",
      "Licenciatura en Psicología",
    ],
  },
  {
    nivel: "Maestría",
    etiquetaAvance: "Módulo",
    totalAvance: 6,
    programas: [
      "Maestría en Administración",
      "Maestría en Ciencias Computacionales",
      "Maestría en Docencia",
      "Maestría en Educación",
      "Maestría en Innovación Educativa",
    ],
  },
];

/** El nivel con ese nombre, o undefined si ya no está en el catálogo. */
export const buscarNivel = (catalogo: NivelAcademico[], nivel?: string) =>
  nivel ? catalogo.find((n) => n.nivel === nivel) : undefined;

/**
 * Cómo se lee el avance de alguien: «Semestre 6», «Módulo 3». Devuelve cadena
 * vacía si falta el dato o si su nivel ya no existe, para que quien lo pinte no
 * tenga que comprobarlo.
 */
export const avanceTexto = (
  catalogo: NivelAcademico[],
  nivel?: string,
  avance?: number,
): string => {
  const n = buscarNivel(catalogo, nivel);
  return n && avance ? `${n.etiquetaAvance} ${avance}` : "";
};

/** Las opciones de avance de un nivel: [1, 2, … total]. */
export const avancesDe = (n: NivelAcademico): number[] =>
  Array.from({ length: n.totalAvance }, (_, i) => i + 1);

/** Todos los programas del catálogo, sin importar el nivel. */
export const todosLosProgramas = (catalogo: NivelAcademico[]): string[] =>
  catalogo.flatMap((n) => n.programas);
