/**
 * Las conferencias preliminares al XIV Encuentro, modalidad virtual.
 *
 * Son tres, fijas para este programa, y transmitidas por Facebook Live. El
 * `slug` de cada una es el mismo que valida `fn_evaluar_conferencia` en la
 * base —ver la migración `20261002140000_evaluar_conferencias_preliminares.sql`—,
 * así que si algún día cambia una conferencia, los dos lados se editan juntos.
 */
export interface ConferenciaPreliminar {
  slug: string;
  titulo: string;
  ponente: string;
  pais: string;
  fecha: string;
  hora: string;
}

export const CONFERENCIAS_PRELIMINARES: readonly ConferenciaPreliminar[] = [
  {
    slug: "arlety-pacheco",
    titulo: "Abrazar la inclusión: de la política al aula",
    ponente: "Mtra. Arlety Pacheco Gómez",
    pais: "Cuba",
    fecha: "Lunes 12 de octubre",
    hora: "10:00 hrs.",
  },
  {
    slug: "juan-hernandez",
    titulo: "Etnomatemáticas, matemáticas y decolonialidad",
    ponente: "Mtro. Juan Ignacio Hernández Vázquez",
    pais: "México",
    fecha: "Lunes 12 de octubre",
    hora: "16:00 hrs.",
  },
  {
    slug: "fidel-gonzales",
    titulo: "El futuro de la educación en la era digital y de la IA",
    ponente: "Dr. Fidel Ramón Gonzáles Quincho",
    pais: "Perú",
    fecha: "Martes 13 de octubre",
    hora: "16:00 hrs.",
  },
];

export const conferenciaDe = (slug: string) =>
  CONFERENCIAS_PRELIMINARES.find((c) => c.slug === slug);
