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
