/**
 * Lógica de pagos sin React: qué es un monto válido, qué referencia choca con
 * cuál y en qué estado queda cada concepto.
 *
 * Vive aparte de las pantallas para poder comprobarse sin montar componentes.
 * Lo que queda aquí lo usan la carga masiva del banco —la única vía que sigue
 * capturando referencias— y el cálculo del estado de pago, del que dependen la
 * ventanilla, el portal y el escáner de la puerta.
 */

import type { EstadoPago, Participante } from "@/dominio/tipos";

export type Concepto = "evento" | "taller";

export interface PagoRegistrado {
  id: string;
  folio: string;
  concepto: Concepto;
  monto: number;
  montoEsperado: number;
  /**
   * La referencia bancaria. **Opcional**: en ventanilla no se captura, porque
   * quien cobra tiene el voucher en la mano y lo verifica ahí mismo. La carga
   * masiva del banco sí la trae, y para esas filas sigue siendo el control que
   * impide registrar dos veces el mismo depósito.
   */
  referencia?: string | undefined;
  fechaDeposito: string;
  nota?: string | undefined;
  /** Resultado con el que quedó el concepto tras registrar este pago. */
  resultado: Extract<EstadoPago, "pagado" | "discrepancia">;
  origen: "ventanilla" | "carga_masiva";
  registradoEn: string;
}

/** Convierte el texto de un campo de monto a número. Devuelve null si no es válido. */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, "");
  if (!limpio) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** La referencia bancaria es de 6 a 20 caracteres alfanuméricos. */
export function referenciaValida(ref: string) {
  return /^[A-Za-z0-9-]{6,20}$/.test(ref.trim());
}

export function buscarReferenciaEn(
  pagos: PagoRegistrado[],
  referencia: string,
  ignorarId?: string,
): PagoRegistrado | undefined {
  const r = referencia.trim().toLowerCase();
  if (!r) return undefined;
  // Los pagos de ventanilla no tienen referencia, así que no pueden chocar con
  // ninguna: se saltan en vez de compararse contra una cadena vacía, que haría
  // que todos parecieran el mismo.
  return pagos.find((p) => p.referencia?.toLowerCase() === r && p.id !== ignorarId);
}

/**
 * Los pagos con los que arranca la aplicación: ninguno.
 *
 * Fabricaba pagos a partir de la lista de participantes de ejemplo, así que
 * ventanilla abría con decenas de cobros que nadie había hecho. Los pagos reales
 * viven en la tabla `pagos` y llegan con la carga inicial.
 *
 * Se conserva la función en vez de borrarla porque es el punto donde el estado
 * decide con qué empieza; devolver una lista vacía lo dice mejor que quitarla.
 */
export function pagosIniciales(): PagoRegistrado[] {
  return [];
}

/**
 * Estado de pago efectivo de un participante: el que trae él —derivado por
 * `v_estado_pago` al cargar—, salvo que en la lista haya un pago para ese
 * concepto, en cuyo caso manda el último. Es la regla que une Servicios
 * Financieros con el portal y con el escáner de la puerta.
 *
 * El respaldo del participante importa más de lo que parece: quien no puede
 * leer la tabla `pagos` —un capturista en la puerta— recibe la lista vacía y
 * decide con ese estado derivado, que sí puede ver y no revela ni importes ni
 * referencias.
 */
export function estadoDePagos(
  pagos: PagoRegistrado[],
  p: Participante,
): { evento: EstadoPago; taller: EstadoPago | undefined } {
  const ultimo = (c: Concepto) =>
    [...pagos].reverse().find((x) => x.folio === p.folio && x.concepto === c);
  const ev = ultimo("evento");
  const ta = ultimo("taller");
  return {
    evento: ev ? ev.resultado : p.estadoPagoEvento,
    taller: p.tallerId ? (ta ? ta.resultado : p.estadoPagoTaller) : undefined,
  };
}
