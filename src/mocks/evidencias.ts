import { participantes } from "./participantes";
import type { Dia, Evidencia, EstadoEvidencia } from "./tipos";

const estados: EstadoEvidencia[] = ["pendiente", "aprobada", "rechazada", "no_entregada"];
const motivos = [
  "No se distingue a la persona",
  "No se ve la transmisión",
  "Imagen ilegible o muy oscura",
  "Fuera del horario permitido",
];
const revisores = ["ANA LAURA VIDAL", "PEDRO SEGOVIA", "MARTHA ELENA RIOS"];

const alumnos = participantes.filter((p) => p.perfil === "alumno");

/**
 * Cada alumno sube evidencia de los DOS días en los que no asiste en persona.
 *
 * Su día asignado queda cubierto por el registro de entrada y salida, así que
 * pedirle evidencia de ese día no tendría sentido: el portal ya lo pinta como
 * presencial. De aquí salen 80 evidencias repartidas de forma pareja entre los
 * tres días, en lugar de amontonarlas en los días 1 y 2 y dejar al 3 con una
 * cola simbólica. `bun run verificar-mocks` fija el mínimo por día.
 */
const diasDeEvidencia = (diaAsignado: Dia): Dia[] =>
  ([1, 2, 3] as Dia[]).filter((d) => d !== diaAsignado);

const generadas: Evidencia[] = alumnos.flatMap((p, i) =>
  diasDeEvidencia(p.dia).map((dia, j) => {
    const idx = i * 3 + j;
    // La mayoría de quienes ya pagaron tiene sus DOS evidencias aprobadas.
    //
    // Sin esta regla el requisito de constancia —dos evidencias aprobadas— sería
    // inalcanzable: los estados por índice nunca coinciden en aprobada para el
    // mismo alumno, y la lista de elegibles salía vacía para el perfil más
    // numeroso. Se deja fuera uno de cada tres para conservar el caso contrario,
    // el de quien cumple todo salvo las evidencias.
    const ambasAprobadas = p.estadoPagoEvento === "pagado" && i % 3 !== 2;
    const estado = ambasAprobadas ? ("aprobada" as const) : estados[idx % 4]!;
    return {
      id: `EV-${String(idx + 1).padStart(4, "0")}`,
      folio: p.folio,
      matricula: p.matricula ?? "",
      nombre: p.nombre,
      dia,
      subidaEn: `1${3 + dia}/10/2026 ${String(9 + (idx % 7)).padStart(2, "0")}:${String(10 + (idx % 49)).padStart(2, "0")}`,
      estado,
      motivoRechazo: estado === "rechazada" ? motivos[idx % motivos.length]! : undefined,
      revisor:
        estado === "pendiente" || estado === "no_entregada" ? undefined : revisores[idx % 3]!,
      hash: `h${String(idx).padStart(4, "0")}a7f3c19b8e2d45`,
      imagen: `https://placehold.co/900x1200/1f2937/e5e7eb?text=EVIDENCIA+${idx + 1}`,
      intentos: (idx % 3) + 1,
    };
  }),
);

/**
 * Dos pares de evidencias con hash idéntico, a propósito, para poder probar la
 * alerta de duplicados y la comparación lado a lado del panel de revisión.
 *
 * Se definen por POSICIÓN en el arreglo ya generado, no por el `idx` interno del
 * generador: ese `idx` vale `i * 3 + j` con `j` de longitud variable, así que
 * salta valores (nunca produce 5, 8, 14…) y un par definido sobre un número
 * saltado no llega a existir. Cada par toma posiciones de alumnos distintos,
 * que es el caso que el panel debe saber mostrar.
 */
const paresDuplicados: ReadonlyArray<readonly [number, number]> = [
  [2, 7], // alumno 1 (día 3) y alumno 4 (día 1)
  [11, 19], // alumno 5 (día 2) y alumno 9 (día 1)
];

const hashesCompartidos = ["d41d8cd98f00b204e9800998ecf8427e", "9e107d9d372bb6826bd81d3542a419d6"];

paresDuplicados.forEach(([a, b], n) => {
  const compartido = hashesCompartidos[n]!;
  generadas[a]!.hash = compartido;
  generadas[b]!.hash = compartido;
});

export const evidencias: Evidencia[] = generadas;

export const evidenciasDuplicadas = () => {
  const porHash = new Map<string, Evidencia[]>();
  evidencias.forEach((e) => porHash.set(e.hash, [...(porHash.get(e.hash) ?? []), e]));
  return [...porHash.values()].filter((g) => g.length > 1);
};

export const IMAGEN_VOUCHER_OK =
  "https://placehold.co/800x1000/065f46/ecfdf5?text=EJEMPLO+CORRECTO";
export const IMAGEN_VOUCHER_MAL =
  "https://placehold.co/800x1000/7f1d1d/fef2f2?text=EJEMPLO+INCORRECTO";
export const IMAGEN_VOUCHER = "https://placehold.co/800x1000/334155/f1f5f9?text=VOUCHER";
