import type { Participante } from "@/dominio/tipos";

/**
 * Busca a alguien por folio, matrícula, nombre o correo.
 *
 * Recibe la lista en lugar de importarla. Antes vivía junto a los datos
 * simulados y buscaba siempre en ellos, así que en ventanilla se tecleaba un
 * folio real y salía «sin resultados» mientras los inventados sí aparecían.
 */
export const buscarEnParticipantes = (participantes: Participante[], q: string) => {
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

/**
 * Un folio de ejemplo para la ayuda de un buscador vacío, o `null` si no hay.
 *
 * Dos pantallas lo tomaban con `participantes[0]!.folio`, y esa afirmación se
 * caía justo donde se usa: el texto sale cuando la búsqueda no encontró nada,
 * que es exactamente cuando la lista puede estar vacía. En el servidor, donde
 * el personal aún no tiene sesión y la lista SIEMPRE está vacía, tumbaba la
 * pantalla entera al pintarla.
 *
 * Es el mismo caso que ya documenta `prototipo.tsx`: los datos de ejemplo
 * ocultaban una pregunta que siempre existió —qué enseñar cuando no hay
 * nadie—, y el `!` la seguía escondiendo.
 */
export const folioDeEjemplo = (participantes: Participante[]): string | null =>
  participantes[0]?.folio ?? null;
