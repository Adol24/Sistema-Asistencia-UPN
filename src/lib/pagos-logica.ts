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
  /**
   * Qué es este depósito.
   *
   * `parcial` es un abono de una prórroga autorizada, y lo decide la base
   * —`fn_resultado_pago`— mirando si esa persona tiene plazo. No es lo mismo
   * que `discrepancia`: ahí el dinero no cuadra y alguien se equivocó; aquí
   * falta dinero y es lo acordado.
   */
  resultado: Extract<EstadoPago, "pagado" | "parcial" | "discrepancia">;
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

/**
 * Ese concepto ya no admite cobro: o se pagó, o no se le cobra, o hay que
 * resolverlo aparte.
 *
 * `exento` está aquí desde el 2026-09-29. No es una concesión al maestro que no
 * quiere constancia: es que su monto esperado es CERO, así que no hay nada que
 * cobrar y dejarlo en la lista de cobros pendientes lo pondría a la cola de una
 * ventanilla que no tiene nada que hacer con él.
 */
export const resuelto = (e: EstadoPago): boolean =>
  e === "pagado" || e === "exento" || e === "discrepancia" || e === "cancelado";

/** Queda dinero por cobrar de ese concepto. Lo contrario de `resuelto`. */
export const porCobrar = (e: EstadoPago): boolean => !resuelto(e);

/**
 * No tiene el pago acreditado, así que la puerta lo detiene.
 *
 * `discrepancia` NO está aquí a propósito: esa persona sí depositó, solo que
 * por un importe que no cuadra. Se le deja pasar avisando y se le manda a
 * Servicios Financieros; devolverla sería castigarla por un error de cajero.
 *
 * `exento` tampoco, y es la misma línea que traza `fn_evaluar_escaneo` desde el
 * 2026-09-29: al maestro que no quiere constancia no se le cobra nada, así que no
 * hay pago que acreditarle y la puerta lo admite. Esta lista se enumera en vez de
 * negar `pagado` justo para esto: un estado nuevo entra aquí solo si alguien lo
 * escribe, y el que se olvide queda ABIERTO, no cerrado. El error que se evita es
 * dejar fuera del evento a quien sí puede entrar.
 */
export const sinAcreditar = (e: EstadoPago): boolean =>
  e === "pre_registrado" ||
  e === "comprobante_recibido" ||
  e === "parcial" ||
  e === "expirado" ||
  e === "cancelado";

/**
 * Servicios Financieros ya reconoció su depósito, así que la puerta lo admite.
 *
 * Es `sinAcreditar` del revés, y tiene nombre propio porque gobierna algo
 * distinto: **si se le enseña su código QR**. Hasta ahora las tres pantallas
 * que lo pintan —`/comprobante`, `/pago` y `/portal/qr`— lo enseñaban siempre,
 * atenuado y con un sello de «todavía no abre la puerta». La idea era no
 * fingir que hay dos códigos; el efecto era que quien no había pagado se
 * llevaba una imagen con su nombre y el escudo, y llegaba el día del evento
 * convencido de traer su boleto.
 *
 * Ahora el código no existe para él hasta que el pago se confirma. No se
 * atenúa: no se dibuja.
 *
 * `discrepancia` cuenta como confirmado, y esto NO es una concesión: es la
 * misma línea que traza `fn_evaluar_escaneo` en la base —«si no es `pagado` ni
 * `discrepancia`, SIN PAGO REGISTRADO»— y la que traza `escaneo.ts` en el
 * motor local. Esa persona depositó, solo que por un importe que no cuadra, y
 * el torniquete la deja pasar avisando. Ocultarle el código la dejaría sin
 * nada que escanear en una puerta que sí la habría admitido.
 */
export const abreLaPuerta = (e: EstadoPago): boolean => !sinAcreditar(e);

/**
 * Su lugar sigue apartado pero puede perderlo si no entrega a tiempo.
 *
 * `parcial` entra aquí: dejó la mitad, y lo que le queda vence el día de su
 * prórroga. Es exactamente la gente a la que hay que llamar antes de esa fecha.
 */
export const porVencer = (e: EstadoPago): boolean =>
  e === "pre_registrado" || e === "comprobante_recibido" || e === "parcial";

/**
 * No hay NINGUNA fila de pago de ese concepto. No es lo mismo que «no pagó».
 *
 * Se lee directamente de cómo deriva `v_estado_pago`: sus seis ramas dependen
 * de `count(pagos)`, y solo TRES de ellas se alcanzan con cero filas —
 * `exento` cuando no debe nada, y si debe, `pre_registrado` antes de la fecha
 * límite y `expirado` después—. Las otras tres (`comprobante_recibido`,
 * `pagado`, `discrepancia`) exigen al menos un registro.
 *
 * `exento` entró aquí el 2026-09-29 y es lo que permite al panel seguir
 * moviéndole el taller al maestro exento: no tiene depósito que invalidar.
 *
 * Sirve para anticipar lo que `fn_asignar_taller` va a rechazar: el taller viaja
 * en el mismo depósito desde el 2026-09-25, así que en cuanto existe una fila de
 * pago ya no se le puede PONER un taller a esa persona desde el panel.
 * Preguntarlo así evita ofrecer un formulario que la base va a rechazar al
 * enviarlo.
 *
 * Quitárselo es otra pregunta y se hace sobre el concepto del taller, no sobre
 * los dos: desde el 2026-09-29 la baja sigue abierta mientras el taller no tenga
 * una fila de pago suya, porque ahí no hay dinero que mover. Ver la cabecera de
 * `AsignarTaller`.
 *
 * NO se usa `sinAcreditar` para esto, aunque se parezca: incluye `cancelado`,
 * que `v_estado_pago` no produce nunca, y excluye `expirado`, que sí significa
 * cero filas. Son dos preguntas distintas —«¿pasa por la puerta?» y «¿hay
 * dinero registrado?»— y compartir la respuesta las haría divergir en silencio.
 */
export const sinDeposito = (e: EstadoPago): boolean =>
  e === "pre_registrado" || e === "expirado" || e === "exento";

/**
 * Debe TODO lo que se le puede cobrar. Al corriente es no deber nada: quien
 * tiene el evento pagado y el taller a medias sigue teniendo un cobro
 * pendiente, y contarlo entre los pagados es lo que haría que se le pasara.
 */
const nadaQueDeber = (e: EstadoPago): boolean => e === "pagado" || e === "exento";

export const alCorriente = (estado: {
  evento: EstadoPago;
  taller: EstadoPago | undefined;
}): boolean => nadaQueDeber(estado.evento) && (!estado.taller || nadaQueDeber(estado.taller));

/**
 * Depositó de verdad y no debe nada.
 *
 * `alCorriente` no basta para contestar «¿quién ya pagó?»: desde el 2026-09-29
 * también es cierto del maestro exento, que no debe nada porque su monto
 * esperado es CERO y nunca hizo un depósito. Una lista de pagados armada con
 * `alCorriente` mete a esa persona entre quienes sí pagaron, y quien la use
 * para cuadrar la caja buscará un depósito que no existe. Es el mismo error que
 * obligó a renombrar el filtro «Pagados» de la ventanilla a «Sin adeudo».
 *
 * `discrepancia` queda fuera, y no por descuido: esa persona depositó, pero por
 * un importe que no cuadra y que hay que resolver en persona. Darla por pagada
 * es cómo se pierde la diferencia.
 */
export const yaPago = (estado: { evento: EstadoPago; taller: EstadoPago | undefined }): boolean =>
  alCorriente(estado) && (estado.evento === "pagado" || estado.taller === "pagado");

/**
 * El estado del DEPÓSITO, que desde el 2026-09-25 es uno solo.
 *
 * Por dentro siguen existiendo dos conceptos y Servicios Financieros sigue
 * confirmando cada uno por su lado; por fuera el alumno hizo un único depósito
 * y presentó un único voucher. Enseñarle dos estados de pago por un papel que
 * entregó una vez es la pregunta que llega a soporte: «¿por qué me piden dos
 * pagos si solo hice uno?».
 *
 * El orden de abajo es el de qué contar primero cuando los dos conceptos no
 * dicen lo mismo, y se lee de arriba abajo:
 *
 * - `discrepancia` gana a todo, incluso a un `pagado` del otro concepto: es lo
 *   único que exige ir a resolverlo en persona, y callarlo porque la otra mitad
 *   cuadra es justo cómo se pierde.
 * - Después, lo menos avanzado. Quien tiene el evento pagado y el taller sin
 *   registrar todavía debe algo, y decirle «pagado» le haría creer que terminó.
 * - `pagado` solo cuando los dos lo están.
 *
 * `alCorriente` sigue existiendo y sigue sirviendo para otra cosa: contesta sí
 * o no, y los paneles internos lo usan para contar. Esto devuelve CUÁL de los
 * seis estados enseñar.
 */
const URGENCIA: Record<EstadoPago, number> = {
  discrepancia: 7,
  cancelado: 6,
  expirado: 5,
  pre_registrado: 4,
  comprobante_recibido: 3,
  /*
   * Por debajo de «comprobante recibido» y por encima de «pagado».
   *
   * Lo que ordena esta lista es qué tan avanzado está el cobro, y un abono está
   * MÁS avanzado que un voucher entregado: aquí el dinero ya se contó. Pero
   * sigue debiendo, así que nunca puede tapar a un concepto pagado.
   */
  parcial: 2,
  pagado: 1,
  /*
   * El menos urgente de todos, y por debajo de `pagado` a propósito.
   *
   * Solo se enseña cuando los DOS conceptos son exentos, que es el caso del
   * maestro al que la organización eximió del evento y del taller a la vez. Si
   * uno de los dos está pagado —el maestro que sí quiso constancia y depositó,
   * y a quien luego le regalan el taller— gana «Pagado», que es lo que esa
   * persona hizo y lo que quiere leer.
   */
  exento: 0,
};

export const estadoDelDeposito = (estado: {
  evento: EstadoPago;
  taller: EstadoPago | undefined;
}): EstadoPago =>
  !estado.taller || URGENCIA[estado.evento] >= URGENCIA[estado.taller]
    ? estado.evento
    : estado.taller;

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
  /**
   * Si esa persona tiene una prórroga autorizada. Con ella, quedarse corto es
   * un abono y no un error; pasarse sigue siendo un error.
   */
  conProrroga = false,
): Extract<EstadoPago, "pagado" | "parcial" | "discrepancia"> =>
  monto === esperado ? "pagado" : conProrroga && monto < esperado ? "parcial" : "discrepancia";

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

/**
 * Lo que hay registrado de una persona en UN concepto.
 *
 * El último pago ya no basta desde que existen los abonos: dos depósitos de 250
 * no se leen mirando el segundo, se leen sumándolos. Se guardan las tres cosas
 * de una pasada para no recorrer la lista otra vez por cada fila de la tabla.
 */
export interface PagosDeUnConcepto {
  /** El más reciente, que es quien manda cuando NO hay abonos. */
  ultimo: PagoRegistrado;
  /** Todo lo depositado en este concepto. */
  suma: number;
  /** Si alguno es un abono de prórroga. */
  hayAbono: boolean;
}

/** Lo registrado por persona y concepto, listo para consultar. */
export type IndicePagos = ReadonlyMap<string, PagosDeUnConcepto>;

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
  const indice = new Map<string, PagosDeUnConcepto>();
  for (const g of pagos) {
    const k = clave(g.folio, g.concepto);
    const previo = indice.get(k);
    indice.set(k, {
      ultimo: g,
      suma: (previo?.suma ?? 0) + g.monto,
      hayAbono: (previo?.hayAbono ?? false) || g.resultado === "parcial",
    });
  }
  return indice;
}

/**
 * Un céntimo de tolerancia al comparar importes.
 *
 * En la base los montos son `numeric` y la suma es exacta; aquí son `number`,
 * y sumar decimales en coma flotante puede dejar 499.99999999 donde debería
 * haber 500. Sin esta holgura, alguien que pagó completo en abonos seguiría
 * figurando como que debe un céntimo —y la puerta lo rechazaría—.
 */
const CENTIMO = 0.005;

/**
 * El estado de UN concepto a partir de lo que hay registrado.
 *
 * Dos reglas, y la primera es la de siempre: sin abonos de por medio manda el
 * último pago, igual que antes de que existieran las prórrogas. Con abonos
 * manda la SUMA, que es la misma cuenta que hace `v_estado_pago` en la base.
 * Tienen que coincidir: esta decide lo que se ve mientras la pestaña está
 * abierta, y aquella lo que se ve al recargar.
 */
function estadoDeUnConcepto(
  filas: PagosDeUnConcepto | undefined,
  esperado: number,
  respaldo: EstadoPago | undefined,
): EstadoPago | undefined {
  if (!filas) return respaldo;
  if (!filas.hayAbono) return filas.ultimo.resultado;
  if (filas.suma > esperado + CENTIMO) return "discrepancia";
  if (filas.suma >= esperado - CENTIMO) return "pagado";
  return "parcial";
}

/**
 * Lo registrado de una persona en un concepto, o `undefined` si no hay nada.
 *
 * Existe para no publicar la forma de la clave del índice: es un detalle de
 * aquí dentro, y las pantallas que necesitan saber cuánto lleva abonado alguien
 * —la ventanilla, para ofrecer lo que FALTA en vez de la cuota entera— no
 * tienen por qué armar `folio|concepto` a mano.
 */
export const pagosDe = (
  indice: IndicePagos,
  folio: string,
  concepto: Concepto,
): PagosDeUnConcepto | undefined => indice.get(clave(folio, concepto));

/**
 * Cuánto le falta a alguien en un concepto, nunca negativo.
 *
 * Con esto la ventanilla cobra el saldo y no la cuota: quien abonó 250 de 500
 * tiene que poder entregar 250, y el botón que ofreciera 500 le cobraría 750 en
 * total y dejaría su depósito en discrepancia.
 */
export const faltaDe = (
  indice: IndicePagos,
  folio: string,
  concepto: Concepto,
  esperado: number,
): number => Math.max(0, esperado - (pagosDe(indice, folio, concepto)?.suma ?? 0));

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
    evento: estadoDeUnConcepto(ev, p.montoEsperadoEvento, p.estadoPagoEvento) ?? "pre_registrado",
    taller: p.tallerId
      ? estadoDeUnConcepto(ta, p.montoEsperadoTaller ?? 0, p.estadoPagoTaller)
      : undefined,
  };
}
