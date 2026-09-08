import { participantes } from "./participantes";
import { talleresBase } from "./talleres-base";
import type { Taller } from "./tipos";

/**
 * Los 11 talleres con su cupo ocupado real.
 *
 * `cupoOcupado` NO se escribe a mano: es `ocupadosPrevios` (inscritos fuera del
 * conjunto simulado) más los participantes del prototipo que eligieron ese
 * taller. Así el contador de lugares disponibles y la etiqueta CUPO LLENO del
 * catálogo siempre concuerdan con los datos que el resto de las pantallas
 * muestran. `npm run verificar-mocks` comprueba esta correspondencia.
 */
export const talleres: Taller[] = talleresBase.map(({ ocupadosPrevios, ...t }) => ({
  ...t,
  cupoOcupado: ocupadosPrevios + participantes.filter((p) => p.tallerId === t.id).length,
}));

export const getTaller = (id?: string) => talleres.find((t) => t.id === id);

/** Lugares que quedan libres en un taller. */
export const lugaresLibres = (t: Taller) => Math.max(0, t.cupoTotal - t.cupoOcupado);
