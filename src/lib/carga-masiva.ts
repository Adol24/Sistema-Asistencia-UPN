/**
 * Lectura y análisis del archivo de carga masiva de pagos, sin React.
 *
 * `analizarArchivo` es una función pura: recibe el archivo —un CSV o una hoja
 * de Excel ya leída— y los pagos
 * ya registrados, y devuelve el diagnóstico fila por fila. No registra nada. La
 * pantalla solo aplica los pagos cuando el usuario confirma, y usa exactamente
 * los `pago` que esta función preparó.
 */

import {
  parsearMonto,
  resultadoDe,
  referenciaValida,
  type Concepto,
  type PagoRegistrado,
} from "@/lib/pagos-logica";
import type { Participante, Taller } from "@/dominio/tipos";
import { leerOrigen, type OrigenTabla } from "@/lib/csv";

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

const moneda = (n: number) => `$${n.toFixed(2)}`;

/**
 * Analiza el archivo completo. Lanza si el archivo entero es inservible
 * (sin filas o sin las columnas requeridas); los problemas por fila se
 * devuelven como semáforo rojo, no como excepción.
 */
export function analizarArchivo(
  origen: OrigenTabla,
  pagosRegistrados: PagoRegistrado[],
  /*
   * Las listas se reciben, no se importan.
   *
   * Antes salían de los módulos de datos simulados, así que este análisis
   * validaba un archivo real contra participantes inventados: un folio correcto
   * salía como inexistente y uno de ejemplo pasaba. Pedirlas por parámetro es lo
   * que permite que vengan de la base.
   */
  buscarParticipante: (folio: string) => Participante | undefined,
  buscarTaller: (id?: string) => Taller | undefined,
): FilaAnalizada[] {
  const { encabezado, filas } = leerOrigen(origen);
  const faltantes = COLUMNAS.filter((c) => !encabezado.includes(c));
  if (faltantes.length)
    throw new Error(`Al archivo le faltan estas columnas: ${faltantes.join(", ")}.`);

  // Las referencias repetidas dentro del propio archivo también son duplicados.
  const vistasEnArchivo = new Map<string, number>();

  /*
   * Las referencias ya registradas, indexadas una sola vez.
   *
   * Se comprobaban recorriendo la lista entera de pagos por cada fila del
   * archivo. Un corte del banco con quinientas filas contra mil pagos ya
   * registrados son medio millón de comparaciones, y la vista previa se
   * congelaba justo cuando alguien está mirando si el archivo está bien.
   */
  const yaRegistradas = new Map<string, string>();
  for (const g of pagosRegistrados) {
    const r = g.referencia?.trim().toLowerCase();
    // Los pagos de ventanilla no llevan referencia y no pueden chocar con nada.
    if (r) yaRegistradas.set(r, g.folio);
  }

  return filas.map((base) => {
    const { n, crudo } = base;
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

    const p = buscarParticipante(folio);
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

    const folioEnConflicto = yaRegistradas.get(referencia.trim().toLowerCase());
    if (folioEnConflicto)
      return error(
        `Referencia duplicada: ya está registrada con el folio ${folioEnConflicto}.`,
        p.nombre,
      );
    const repetida = vistasEnArchivo.get(referencia.toLowerCase());
    if (repetida)
      return error(
        `Referencia repetida dentro del archivo (ya venía en la fila ${repetida}).`,
        p.nombre,
      );
    vistasEnArchivo.set(referencia.toLowerCase(), n);

    const taller = buscarTaller(p.tallerId);
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
      resultado: resultadoDe(monto, esperado),
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
      const motivo = `Monto ${dif > 0 ? "mayor" : "menor"} al esperado por ${moneda(Math.abs(dif))}. Entrará como discrepancia.`;
      return {
        ...base,
        semaforo: "advertencia",
        motivo,
        nombre: p.nombre,
        /*
         * El motivo viaja también como NOTA del pago, y no es cosmético:
         * `chk_discrepancia_con_nota` la exige, y sin ella la base rechazaba la
         * fila entera. El archivo del banco perdía justo lo que no cuadraba.
         *
         * Se manda el texto que ya se calculó para la vista previa, que es el
         * que lleva las cifras: quien abra esa discrepancia tres semanas después
         * lee lo mismo que vio quien la aplicó.
         */
        pago: { ...pago, nota: motivo },
      };
    }
    return { ...base, semaforo: "listo", motivo: "Listo para aplicar.", nombre: p.nombre, pago };
  });
}
