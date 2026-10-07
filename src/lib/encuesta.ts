/**
 * El instrumento de evaluación y seguimiento académico del Encuentro.
 *
 * Es la transcripción del cuestionario en papel: doce reactivos, una escala
 * Likert de cinco puntos y la tabla de niveles de logro que interpreta la suma.
 * Vive aparte de la pantalla por una razón concreta: hoy la vista es una
 * demostración y no escribe en ninguna parte, pero el instrumento es el mismo
 * que habrá que guardar cuando se decida persistirlo. Separado, conectar el
 * envío no obliga a volver a teclear las preguntas ni los rangos.
 *
 * De esos doce, el 11 y el 12 están marcados `oculta: true` y hoy no se le
 * presentan a quien contesta —ver `preguntasVisibles`—. El total de doce y la
 * tabla de niveles de 0 a 60 siguen siendo los del papel: lo que cambió es
 * cuántos de los doce se preguntan hoy, no el instrumento.
 */

export type Instrumento = "impacto" | "seguimiento";

export interface Pregunta {
  /** El número impreso en el papel. Se muestra, así que no es un índice. */
  numero: number;
  texto: string;
  instrumento: Instrumento;
  /**
   * Si esta pregunta NO se le presenta a quien contesta.
   *
   * Es una decisión de la vista, no del instrumento: el papel sigue teniendo
   * doce reactivos y el 11 y el 12 siguen aquí, con su texto y su número,
   * porque es lo que habrá que retomar si algún día se vuelven a preguntar.
   * Borrarlos de este arreglo habría sido otra cosa —encoger el instrumento—
   * y no lo que se pidió, que fue dejar de enseñarlos.
   */
  oculta?: boolean;
}

/**
 * La escala, de mayor a menor.
 *
 * El orden es el del papel —5 a la izquierda, 1 a la derecha— y no el natural
 * de un arreglo ascendente. Invertirlo haría que quien tiene el cuestionario
 * impreso enfrente marcara la columna equivocada.
 */
export const ESCALA = [
  { valor: 5, etiqueta: "Totalmente de acuerdo" },
  { valor: 4, etiqueta: "De acuerdo" },
  { valor: 3, etiqueta: "Ni de acuerdo ni en desacuerdo" },
  { valor: 2, etiqueta: "En desacuerdo" },
  { valor: 1, etiqueta: "Totalmente en desacuerdo" },
] as const;

export type ValorEscala = (typeof ESCALA)[number]["valor"];

/** Los dos títulos bajo los que se agrupan los reactivos. */
export const INSTRUMENTOS: Record<Instrumento, { titulo: string; descripcion: string }> = {
  impacto: {
    titulo: "Instrumento de Impacto",
    descripcion:
      "Qué tanto respondió el evento a lo que esperabas y a tu formación en este momento.",
  },
  seguimiento: {
    titulo: "Instrumento de Seguimiento",
    descripcion:
      "Qué puedes hacer después del evento con lo que te llevas: productos, líneas de investigación y titulación.",
  },
};

/**
 * Los doce reactivos, en el orden del papel.
 *
 * El corte entre un instrumento y otro está en el 6: los cinco primeros miden
 * impacto y los siete restantes, seguimiento.
 */
export const PREGUNTAS: readonly Pregunta[] = [
  { numero: 1, instrumento: "impacto", texto: "El evento cumplió mis expectativas académicas." },
  {
    numero: 2,
    instrumento: "impacto",
    texto: "Encontré relación entre las temáticas expuestas y mi formación universitaria actual.",
  },
  { numero: 3, instrumento: "impacto", texto: "Identifiqué líneas de investigación emergentes." },
  {
    numero: 4,
    instrumento: "impacto",
    texto:
      "Los contenidos del evento aportaron elementos para fortalecer mi trabajo académico actual.",
  },
  {
    numero: 5,
    instrumento: "impacto",
    texto:
      "Podré incorporar alguno de los enfoques estudiados en trabajos académicos de mi formación.",
  },
  {
    numero: 6,
    instrumento: "seguimiento",
    texto:
      "Los aprendizajes obtenidos me permitieron identificar posibles problemas o líneas de investigación para mi formación.",
  },
  {
    numero: 7,
    instrumento: "seguimiento",
    texto: "Puedo generar un producto académico derivado de mi participación en el Encuentro.",
  },
  {
    numero: 8,
    instrumento: "seguimiento",
    texto:
      "Considero pertinente conservar y consultar el acervo intelectual generado en este evento.",
  },
  {
    numero: 9,
    instrumento: "seguimiento",
    texto:
      "Los aprendizajes del evento han modificado o enriquecido mi perspectiva sobre la práctica educativa.",
  },
  {
    numero: 10,
    instrumento: "seguimiento",
    texto: "Me siento satisfecho por lo aportado en este evento académico.",
  },
  {
    numero: 11,
    instrumento: "seguimiento",
    texto: "Identifiqué perspectivas y enfoques teóricos.",
    oculta: true,
  },
  {
    numero: 12,
    instrumento: "seguimiento",
    texto: "El evento aportó elementos que pueden fortalecer mi trabajo de titulación.",
    oculta: true,
  },
];

/** Las preguntas de un instrumento, en orden. Incluye las ocultas. */
export const preguntasDe = (instrumento: Instrumento) =>
  PREGUNTAS.filter((p) => p.instrumento === instrumento);

/**
 * Las preguntas que de verdad se le presentan a quien contesta: sin las
 * marcadas `oculta`.
 *
 * Es lo que tiene que usar la pantalla para tres cosas a la vez —qué se
 * dibuja, cuántas hacen falta para completar y cuáles exige `enviar`—, porque
 * si una sola de las tres siguiera mirando `PREGUNTAS` a secas, la pantalla
 * pediría contestar una pregunta que nunca llegó a mostrar.
 */
export const preguntasVisibles = (instrumento: Instrumento) =>
  preguntasDe(instrumento).filter((p) => !p.oculta);

/** Todas las preguntas visibles, de los dos instrumentos. */
export const PREGUNTAS_VISIBLES: readonly Pregunta[] = PREGUNTAS.filter((p) => !p.oculta);

/** 60: doce reactivos por cinco puntos. Es el techo de la tabla de niveles. */
export const PUNTAJE_MAXIMO = PREGUNTAS.length * 5;

/** El techo de cada instrumento por separado: 25 el de impacto, 35 el de seguimiento. */
export const maximoDe = (instrumento: Instrumento) => preguntasDe(instrumento).length * 5;

export interface Nivel {
  nombre: string;
  min: number;
  max: number;
  interpretacion: string;
  /** Color de estado. Ver los tokens `--estado-*` en `styles.css`. */
  clase: string;
}

/**
 * La escala de interpretación, del mejor nivel al peor.
 *
 * Dos cosas del papel que aquí quedan corregidas a propósito:
 *
 * - Dos renglones están escritos de mayor a menor —«49-45», «44-39»— y los
 *   otros tres al revés. Se guardan todos como `min`/`max` porque lo que se
 *   hace con ellos es comparar, no leer.
 * - El último rango empieza en 0, pero con doce reactivos obligatorios el
 *   puntaje más bajo posible es 12. Se respeta el 0 porque así está impreso y
 *   porque no cambia ningún resultado: nadie va a caer entre 0 y 11.
 *
 * Los rangos son contiguos y cubren de 0 a 60 sin huecos ni traslapes, así que
 * cualquier total cae en exactamente uno.
 *
 * «Bajo» y «Crítico» comparten el rojo. No es un descuido: los dos significan
 * lo mismo para quien lee el reporte —el evento no alcanzó— y lo que los separa
 * es el texto, no el color.
 */
export const NIVELES: readonly Nivel[] = [
  {
    nombre: "Excelente",
    min: 55,
    max: 60,
    interpretacion: "El evento generó una apropiación y transferencia académica sobresaliente.",
    clase: "border-estado-pagado/30 bg-estado-pagado-bg text-estado-pagado",
  },
  {
    nombre: "Alto",
    min: 50,
    max: 54,
    interpretacion: "Se alcanzaron satisfactoriamente los objetivos planteados.",
    clase: "border-estado-comprobante/30 bg-estado-comprobante-bg text-estado-comprobante",
  },
  {
    nombre: "Medio",
    min: 45,
    max: 49,
    interpretacion: "Existe cumplimiento aceptable, pero requiere fortalecer algunos componentes.",
    clase: "border-estado-discrepancia/30 bg-estado-discrepancia-bg text-estado-discrepancia",
  },
  {
    nombre: "Bajo",
    min: 39,
    max: 44,
    interpretacion: "El impacto académico fue limitado.",
    clase: "border-estado-cancelado/30 bg-estado-cancelado-bg text-estado-cancelado",
  },
  {
    nombre: "Crítico",
    min: 0,
    max: 38,
    interpretacion: "No se alcanzaron los resultados esperados y se requiere replanteamiento.",
    clase: "border-estado-cancelado/30 bg-estado-cancelado-bg text-estado-cancelado",
  },
];

/**
 * El nivel de logro que le toca a un total.
 *
 * El respaldo es «Crítico» y no un `undefined` que cada pantalla tenga que
 * contemplar: un total fuera de rango solo puede venir de un error de cálculo,
 * y en ese caso es mejor enseñar el peor nivel que no enseñar nada.
 */
export const nivelDeLogro = (total: number): Nivel =>
  NIVELES.find((n) => total >= n.min && total <= n.max) ?? NIVELES[NIVELES.length - 1]!;
