/**
 * Quién le falta pagar algo, y cuánto.
 *
 * Vivía dentro de `financieros.index.tsx`, calculado una sola vez para su
 * propio botón de descarga. Se saca de ahí porque la hoja con gráficas
 * necesita exactamente la misma lista y el mismo monto, y la alternativa
 * —calcularlo otra vez en el segundo archivo— es cómo dos pantallas que
 * deberían decir lo mismo acaban diciendo cosas distintas el día que alguien
 * corrija una sola de las dos copias.
 */

import type { EstadoPago, Participante } from "@/dominio/tipos";
import { alCorriente, faltaDe, type Concepto, type IndicePagos } from "@/lib/pagos-logica";

/**
 * Los alumnos que todavía deben el evento o el taller, ordenados para leerse
 * de corrido: por sede, luego licenciatura, luego nombre.
 *
 * Solo alumnos. La sede, la licenciatura y el módulo o semestre vienen del
 * padrón de Servicios Escolares, que no tiene al docente ni al externo —quien
 * de esos dos perfiles deba se sigue viendo con el filtro «Por cobrar» de la
 * ventanilla, sin desglose académico porque no hay de dónde sacarlo.
 *
 * `alCorriente` ya es cierto solo cuando NINGÚN concepto debe nada, así que
 * `!alCorriente` entra con deber el evento, el taller, o los dos —no hace
 * falta deber ambos—, y ya excluye al exento, cuyo monto esperado es cero.
 */
export function alumnosPendientes(
  participantes: Participante[],
  estadoDe: (p: Participante) => { evento: EstadoPago; taller: EstadoPago | undefined },
): Participante[] {
  return participantes
    .filter((p) => p.perfil === "alumno" && !alCorriente(estadoDe(p)))
    .sort(
      (a, b) =>
        (a.plantel ?? "").localeCompare(b.plantel ?? "", "es") ||
        (a.programa ?? "").localeCompare(b.programa ?? "", "es") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
}

/**
 * Cuánto le falta a una persona, evento y taller sumados en un solo número.
 *
 * Por dentro siguen siendo dos conceptos —ver `faltaDe`—, pero quien paga en
 * ventanilla entrega un depósito, no dos, y los reportes que usan esto hablan
 * en esos mismos términos.
 */
export function montoPendienteDe(indicePagos: IndicePagos, p: Participante): number {
  const porConcepto = (concepto: Concepto, esperado: number) =>
    faltaDe(indicePagos, p.folio, concepto, esperado);
  const taller = p.tallerId ? porConcepto("taller", p.montoEsperadoTaller ?? 0) : 0;
  return porConcepto("evento", p.montoEsperadoEvento) + taller;
}
