/**
 * Lectura y análisis del archivo de carga masiva de pagos, sin React.
 *
 * `analizarArchivo` es una función pura: recibe el texto del archivo y los pagos
 * ya registrados, y devuelve el diagnóstico fila por fila. No registra nada. La
 * pantalla solo aplica los pagos cuando el usuario confirma, y usa exactamente
 * los `pago` que esta función preparó.
 */

import { getParticipante } from "@/mocks/participantes";
import { getTaller } from "@/mocks/talleres";
import {
  buscarReferenciaEn,
  parsearMonto,
  referenciaValida,
  type Concepto,
  type PagoRegistrado,
} from "@/lib/pagos-logica";

export const COLUMNAS = [
  "folio",
  "concepto",
  "monto",
  "referencia_bancaria",
  "fecha_deposito",
] as const;

export type Semaforo = "listo" | "advertencia" | "error";

export interface FilaAnalizada {
  n: number;
  crudo: Record<string, string>;
  semaforo: Semaforo;
  motivo: string;
  nombre?: string | undefined;
  /** Presente solo si la fila es aplicable (listo o advertencia). */
  pago?: Omit<PagoRegistrado, "id" | "registradoEn"> | undefined;
}

/** Parte una línea de CSV respetando comillas dobles. */
export function partirLinea(linea: string): string[] {
  const out: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === "," && !enComillas) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((s) => s.trim());
}

const moneda = (n: number) => `$${n.toFixed(2)}`;

/**
 * Analiza el archivo completo. Lanza si el archivo entero es inservible
 * (sin filas o sin las columnas requeridas); los problemas por fila se
 * devuelven como semáforo rojo, no como excepción.
 */
export function analizarArchivo(
  texto: string,
  pagosRegistrados: PagoRegistrado[],
): FilaAnalizada[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2)
    throw new Error("El archivo no tiene filas de datos debajo del encabezado.");
  const encabezado = partirLinea(lineas[0]!).map((h) => h.toLowerCase());
  const faltantes = COLUMNAS.filter((c) => !encabezado.includes(c));
  if (faltantes.length)
    throw new Error(`Al archivo le faltan estas columnas: ${faltantes.join(", ")}.`);

  // Las referencias repetidas dentro del propio archivo también son duplicados.
  const vistasEnArchivo = new Map<string, number>();

  return lineas.slice(1).map((linea, k) => {
    const celdas = partirLinea(linea);
    const crudo: Record<string, string> = {};
    encabezado.forEach((h, i) => (crudo[h] = celdas[i] ?? ""));
    const n = k + 1;
    const base = { n, crudo };
    const error = (motivo: string, nombre?: string): FilaAnalizada => ({
      ...base,
      semaforo: "error",
      motivo,
      nombre,
    });

    const folio = (crudo["folio"] ?? "").toUpperCase();
    const conceptoTxt = (crudo["concepto"] ?? "").toLowerCase();
    const referencia = crudo["referencia_bancaria"] ?? "";
    const fecha = crudo["fecha_deposito"] ?? "";
    const monto = parsearMonto(crudo["monto"] ?? "");

    const p = getParticipante(folio);
    if (!p) return error(`El folio ${folio || "(vacío)"} no existe.`);
    if (conceptoTxt !== "evento" && conceptoTxt !== "taller")
      return error(
        `Concepto inválido: "${crudo["concepto"]}". Debe ser evento o taller.`,
        p.nombre,
      );
    const concepto = conceptoTxt as Concepto;
    if (monto === null) return error(`Monto con formato inválido: "${crudo["monto"]}".`, p.nombre);
    if (!referenciaValida(referencia))
      return error(`Referencia con formato inválido: "${referencia}".`, p.nombre);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fecha))
      return error(`Fecha inválida: "${fecha}". Se espera DD/MM/AAAA.`, p.nombre);

    const yaRegistrada = buscarReferenciaEn(pagosRegistrados, referencia);
    if (yaRegistrada)
      return error(
        `Referencia duplicada: ya está registrada con el folio ${yaRegistrada.folio}.`,
        p.nombre,
      );
    const repetida = vistasEnArchivo.get(referencia.toLowerCase());
    if (repetida)
      return error(
        `Referencia repetida dentro del archivo (ya venía en la fila ${repetida}).`,
        p.nombre,
      );
    vistasEnArchivo.set(referencia.toLowerCase(), n);

    const taller = getTaller(p.tallerId);
    if (concepto === "taller" && !taller)
      return error("Trae pago de taller pero la persona no eligió ninguno.", p.nombre);

    const esperado = concepto === "evento" ? p.montoEsperadoEvento : taller!.costo;
    const pago = {
      folio: p.folio,
      concepto,
      monto,
      montoEsperado: esperado,
      referencia: referencia.trim(),
      fechaDeposito: fecha,
      origen: "carga_masiva" as const,
      resultado: (monto === esperado ? "pagado" : "discrepancia") as "pagado" | "discrepancia",
    };

    if (concepto === "taller" && taller && taller.cupoOcupado > taller.cupoTotal)
      return {
        ...base,
        semaforo: "advertencia",
        motivo: `El taller ${taller.id} está sobrecupo.`,
        nombre: p.nombre,
        pago,
      };
    if (monto !== esperado) {
      const dif = monto - esperado;
      return {
        ...base,
        semaforo: "advertencia",
        motivo: `Monto ${dif > 0 ? "mayor" : "menor"} al esperado por ${moneda(Math.abs(dif))}. Entrará como discrepancia.`,
        nombre: p.nombre,
        pago,
      };
    }
    return { ...base, semaforo: "listo", motivo: "Listo para aplicar.", nombre: p.nombre, pago };
  });
}

export function resumirFilas(filas: FilaAnalizada[]) {
  const listo = filas.filter((f) => f.semaforo === "listo").length;
  const advertencia = filas.filter((f) => f.semaforo === "advertencia").length;
  const error = filas.filter((f) => f.semaforo === "error").length;
  return { listo, advertencia, error, aplicables: listo + advertencia };
}
