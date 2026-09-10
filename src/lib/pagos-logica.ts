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

/*
 * ---------------------------------------------------------------------------
 * El vocabulario de los estados de pago.
 *
 * Los seis estados de `EstadoPago` se agrupaban a mano en cada pantalla: la
 * ventanilla repetía dos veces qué cuenta como «al corriente», el escáner tenía
 * su propia lista de «sin pagar», y conciliación la suya de «por vencer». Eran
 * las mismas reglas de negocio escritas en cuatro sitios, y separarlas garantiza
 * que un día no digan lo mismo —añadir un séptimo estado obligaba a recordar
 * los cuatro—.
 *
 * Son funciones y no listas sueltas porque así el nombre explica la regla en el
 * sitio donde se usa: `porCobrar(e)` se lee, `!LISTA.includes(e)` hay que
 * descifrarlo.
 * ---------------------------------------------------------------------------
 */

/** Ese concepto ya no admite cobro: o se pagó, o hay que resolverlo aparte. */
export const resuelto = (e: EstadoPago): boolean =>
  e === "pagado" || e === "discrepancia" || e === "cancelado";

/** Queda dinero por cobrar de ese concepto. Lo contrario de `resuelto`. */
export const porCobrar = (e: EstadoPago): boolean => !resuelto(e);

/**
 * No tiene el pago acreditado, así que la puerta lo detiene.
 *
 * `discrepancia` NO está aquí a propósito: esa persona sí depositó, solo que
 * por un importe que no cuadra. Se le deja pasar avisando y se le manda a
 * Servicios Financieros; devolverla sería castigarla por un error de cajero.
 */
export const sinAcreditar = (e: EstadoPago): boolean =>
  e === "pre_registrado" || e === "comprobante_recibido" || e === "expirado" || e === "cancelado";

/** Su lugar sigue apartado pero puede perderlo si no entrega a tiempo. */
export const porVencer = (e: EstadoPago): boolean =>
  e === "pre_registrado" || e === "comprobante_recibido";

/**
 * Debe TODO lo que se le puede cobrar. Al corriente es no deber nada: quien
 * tiene el evento pagado y el taller a medias sigue teniendo un cobro
 * pendiente, y contarlo entre los pagados es lo que haría que se le pasara.
 */
export const alCorriente = (estado: {
  evento: EstadoPago;
  taller: EstadoPago | undefined;
}): boolean => estado.evento === "pagado" && (!estado.taller || estado.taller === "pagado");

/**
 * Cómo queda un concepto según lo depositado.
 *
 * **Quien captura no lo elige**: lo decide la comparación. Está escrito así en
 * el disparador `fn_resultado_pago` de la base, que es quien manda; esto es su
 * reflejo para poder enseñarlo antes de guardar. Vivía copiado en la carga
 * masiva y en la escritura del pago, que es como dos copias de una regla acaban
 * divergiendo.
 */
export const resultadoDe = (
  monto: number,
  esperado: number,
): Extract<EstadoPago, "pagado" | "discrepancia"> =>
  monto === esperado ? "pagado" : "discrepancia";

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

/** El último pago de cada persona y concepto, listo para consultar. */
export type IndicePagos = ReadonlyMap<string, PagoRegistrado>;

const clave = (folio: string, concepto: Concepto) => `${folio}|${concepto}`;

/**
 * Indexa los pagos por folio y concepto para poder consultarlos de un salto.
 *
 * **Esto era el cuello de botella de la ventanilla.** `estadoDePagos` hacía
 * `[...pagos].reverse().find(...)` una vez por concepto, o sea que copiaba y
 * recorría la lista entera DOS veces por cada llamada. La pantalla de
 * ventanilla la llama seis veces por fila: con quinientos participantes y mil
 * pagos, eso son millones de comparaciones y seis mil copias del arreglo en
 * cada repintado, y con el tiempo real repintando solo, en cada cambio ajeno.
 *
 * Ahora se recorre una vez por cada cambio de la lista y las consultas son
 * inmediatas.
 *
 * Se recorre hacia adelante y el último gana, que da el mismo resultado que
 * `reverse().find()` sin copiar nada: la lista viene del más antiguo al más
 * reciente, y ese orden es el que garantiza `cargarTodo` al pedirla.
 */
export function indexarPagos(pagos: PagoRegistrado[]): IndicePagos {
  const indice = new Map<string, PagoRegistrado>();
  for (const g of pagos) indice.set(clave(g.folio, g.concepto), g);
  return indice;
}

/**
 * Estado de pago efectivo de un participante: el que trae él —derivado por
 * `v_estado_pago` al cargar—, salvo que haya un pago registrado para ese
 * concepto, en cuyo caso manda el último. Es la regla que une Servicios
 * Financieros con el portal y con el escáner de la puerta.
 *
 * El respaldo del participante importa más de lo que parece: quien no puede
 * leer la tabla `pagos` —un capturista en la puerta— recibe el índice vacío y
 * decide con ese estado derivado, que sí puede ver y no revela ni importes ni
 * referencias.
 */
export function estadoDePagos(
  indice: IndicePagos,
  p: Participante,
): { evento: EstadoPago; taller: EstadoPago | undefined } {
  const ev = indice.get(clave(p.folio, "evento"));
  const ta = indice.get(clave(p.folio, "taller"));
  return {
    evento: ev ? ev.resultado : p.estadoPagoEvento,
    taller: p.tallerId ? (ta ? ta.resultado : p.estadoPagoTaller) : undefined,
  };
}
