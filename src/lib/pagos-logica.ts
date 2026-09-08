/**
 * Lógica de validación y siembra de los pagos, sin React.
 *
 * Vive aparte de `pagos.tsx` para que las cuatro validaciones del README se
 * puedan comprobar directamente, sin montar componentes.
 */

import { participantes } from "@/mocks/participantes";
import { getTaller } from "@/mocks/talleres";
import type { EstadoPago, Participante } from "@/mocks/tipos";

export type Concepto = "evento" | "taller";

export interface PagoRegistrado {
  id: string;
  folio: string;
  concepto: Concepto;
  monto: number;
  montoEsperado: number;
  referencia: string;
  fechaDeposito: string;
  nota?: string | undefined;
  /** Resultado con el que quedó el concepto tras registrar este pago. */
  resultado: Extract<EstadoPago, "pagado" | "discrepancia">;
  origen: "ventanilla" | "carga_masiva";
  registradoEn: string;
}

/** Diagnóstico de un intento de pago, antes de registrarlo. */
export type Diagnostico =
  | { clase: "vacio" }
  | { clase: "duplicada"; folioEnConflicto: string; mensaje: string }
  | { clase: "invalido"; mensaje: string }
  | { clase: "menor"; diferencia: number; mensaje: string }
  | { clase: "mayor"; diferencia: number; mensaje: string }
  | { clase: "exacto"; mensaje: string };

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
  return pagos.find((p) => p.referencia.toLowerCase() === r && p.id !== ignorarId);
}

/**
 * Evalúa monto y referencia contra los pagos ya registrados.
 *
 * El orden importa: la referencia duplicada gana sobre cualquier aviso de monto,
 * porque es el control que impide registrar dos veces el mismo voucher.
 */
export function diagnosticarPago(
  pagos: PagoRegistrado[],
  entrada: { referencia: string; monto: string; montoEsperado: number },
): Diagnostico {
  const ref = entrada.referencia.trim();
  const n = parsearMonto(entrada.monto);

  if (!ref && !entrada.monto.trim()) return { clase: "vacio" };
  if (ref && !referenciaValida(ref))
    return {
      clase: "invalido",
      mensaje: "La referencia bancaria debe tener entre 6 y 20 caracteres, solo letras y números.",
    };

  const dup = ref ? buscarReferenciaEn(pagos, ref) : undefined;
  if (dup)
    return {
      clase: "duplicada",
      folioEnConflicto: dup.folio,
      mensaje: `Esa referencia bancaria ya fue registrada con el folio ${dup.folio}.`,
    };

  if (!entrada.monto.trim()) return { clase: "vacio" };
  if (n === null)
    return {
      clase: "invalido",
      mensaje: "Escribe el monto del voucher en pesos, por ejemplo 650.00",
    };

  const dif = Math.round((n - entrada.montoEsperado) * 100) / 100;
  if (dif < 0)
    return {
      clase: "menor",
      diferencia: Math.abs(dif),
      mensaje: `El voucher es menor al monto esperado por $${Math.abs(dif).toFixed(2)}. Explica en la nota cómo se resolverá.`,
    };
  if (dif > 0)
    return {
      clase: "mayor",
      diferencia: dif,
      mensaje: `El voucher excede el monto esperado por $${dif.toFixed(2)}. Explica en la nota qué se hará con la diferencia.`,
    };
  return { clase: "exacto", mensaje: "El monto coincide con lo esperado." };
}

/** Pagos que los datos simulados ya dan por registrados antes de abrir ventanilla. */
export function pagosIniciales(): PagoRegistrado[] {
  const out: PagoRegistrado[] = [];
  participantes.forEach((p, i) => {
    const registrado = p.estadoPagoEvento === "pagado" || p.estadoPagoEvento === "discrepancia";
    if (!registrado || !p.referenciaEvento) return;
    out.push({
      id: `PG-${p.folio}-EV`,
      folio: p.folio,
      concepto: "evento",
      monto:
        p.estadoPagoEvento === "discrepancia" ? p.montoEsperadoEvento - 50 : p.montoEsperadoEvento,
      montoEsperado: p.montoEsperadoEvento,
      referencia: p.referenciaEvento,
      fechaDeposito: p.creadoEn.slice(0, 10),
      resultado: p.estadoPagoEvento === "discrepancia" ? "discrepancia" : "pagado",
      origen: "ventanilla",
      registradoEn: p.creadoEn,
      ...(p.estadoPagoEvento === "discrepancia"
        ? { nota: "Depositó menos de lo esperado; se solicitó complemento." }
        : {}),
    });
    const t = getTaller(p.tallerId);
    if (t && (p.estadoPagoTaller === "pagado" || p.estadoPagoTaller === "discrepancia")) {
      out.push({
        id: `PG-${p.folio}-TA`,
        folio: p.folio,
        concepto: "taller",
        monto: p.estadoPagoTaller === "discrepancia" ? t.costo + 50 : t.costo,
        montoEsperado: t.costo,
        referencia: `REFT${String(690430 + i * 17)}`,
        fechaDeposito: p.creadoEn.slice(0, 10),
        resultado: p.estadoPagoTaller === "discrepancia" ? "discrepancia" : "pagado",
        origen: "ventanilla",
        registradoEn: p.creadoEn,
        ...(p.estadoPagoTaller === "discrepancia"
          ? { nota: "Depositó de más; se registró la diferencia a favor." }
          : {}),
      });
    }
  });
  return out;
}

/**
 * Estado de pago efectivo de un participante: el del mock, salvo que en esta
 * sesión se haya registrado un pago para ese concepto, en cuyo caso manda el
 * más reciente. Es la regla que une Servicios Financieros con el portal y con
 * el escáner de la puerta.
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
