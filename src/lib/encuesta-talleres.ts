/**
 * El instrumento de evaluación de talleres del Encuentro.
 *
 * Diez reactivos pensados para un taller concreto, no para el evento en su
 * conjunto —es la versión de `lib/encuesta.ts` con «el taller» en vez de «el
 * evento», y la misma escala Likert de cinco puntos—. A diferencia de las
 * conferencias preliminares, que son tres y viven fijas en
 * `lib/conferencias.ts`, el taller que se evalúa es uno de los que ya existen
 * en la base: la lista la trae `useEstadoEvento().talleres`, no un arreglo de
 * este archivo.
 *
 * Sin reactivos ocultos ni split por instrumento: las diez preguntas se le
 * presentan todas a quien contesta, en el orden del papel.
 */

import { ESCALA, type ValorEscala } from "@/lib/encuesta";

export { ESCALA };
export type { ValorEscala };

export interface PreguntaTaller {
  /** El número impreso en el papel. Se muestra, así que no es un índice. */
  numero: number;
  texto: string;
}

export const PREGUNTAS_TALLER: readonly PreguntaTaller[] = [
  { numero: 1, texto: "El taller cumplió mis expectativas académicas." },
  {
    numero: 2,
    texto: "Encontré relación entre las temáticas expuestas y mi formación universitaria actual.",
  },
  { numero: 3, texto: "Identifiqué líneas de investigación emergentes." },
  {
    numero: 4,
    texto:
      "Los contenidos del taller aportaron elementos para fortalecer mi trabajo académico actual.",
  },
  {
    numero: 5,
    texto:
      "Podré incorporar alguno de los enfoques estudiados en trabajos académicos de mi formación.",
  },
  {
    numero: 6,
    texto:
      "Los aprendizajes obtenidos me permitieron identificar posibles problemas o líneas de investigación para mi formación.",
  },
  {
    numero: 7,
    texto:
      "Generé un producto académico derivado de mi participación en el Encuentro, como infografía, síntesis, reflexión, etc.",
  },
  {
    numero: 8,
    texto:
      "Considero pertinente conservar y consultar el acervo intelectual generado en este taller.",
  },
  {
    numero: 9,
    texto:
      "Los aprendizajes del taller han modificado o enriquecido mi perspectiva sobre la práctica educativa.",
  },
  // Tal como se pidió: «evento taller», no solo «taller».
  { numero: 10, texto: "Me siento satisfecho por lo aportado en este evento taller." },
];

/**
 * Una evaluación guardada, tal como la ve `/admin/encuesta-taller`.
 *
 * `tallerClave` y `tallerNombre` llegan de la base por el `join` contra
 * `talleres` —ver `aRespuestaEncuestaTaller` en `lib/esquema.ts`—, así que si
 * la organización renombra un taller después de recibir evaluaciones, el
 * panel sigue mostrando el nombre vigente y no el que tenía el día de la
 * respuesta.
 */
export interface RespuestaEncuestaTaller {
  id: string;
  tallerClave: string;
  tallerNombre: string;
  perfil: "alumno" | "docente" | "externo";
  nombre: string;
  matricula: string | null;
  programa: string | null;
  correo: string | null;
  respuestas: Record<number, ValorEscala>;
  creadoEn: string;
}
