/**
 * Las dos gráficas del panel, en su propio archivo para que lleguen tarde.
 *
 * **Por qué viven aquí y no en `admin.index.tsx`.** `recharts` arrastra
 * `lodash`, y entre las dos son unos 375 de los 389 KB que pesaba el trozo del
 * panel. Importándolas de forma estática, quien abre `/admin` esperaba esos
 * 389 KB antes de ver el primer indicador — y los indicadores, el embudo de
 * pagos y las tablas no dependen de `recharts` para nada.
 *
 * Separadas, el panel pinta lo que ya tiene y las gráficas aparecen cuando su
 * trozo termina de bajar. El resto de la pantalla no espera a nadie.
 *
 * Los datos llegan ya calculados: el memo que los produce vive en el panel,
 * junto a las otras quince pasadas sobre `participantes`, y no tiene por qué
 * mudarse por esto.
 */
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RebanadaPerfil {
  perfil: string;
  etiqueta: string;
  total: number;
}

export interface BarraDia {
  etiqueta: string;
  alumno: number;
  docente: number;
  externo: number;
}

/**
 * El alto por omisión lo fija el panel, para que la tarjeta no salte al cargar.
 *
 * La hoja de avance lo sube: en papel hay sitio de sobra y una gráfica de 180 px
 * estirada al ancho de un A4 sale con las barras aplastadas.
 */
const ALTO = 180;

export function GraficaPerfiles({
  datos,
  color,
  alto = ALTO,
  ancho = "45%",
}: {
  datos: RebanadaPerfil[];
  color: Record<string, string>;
  alto?: number;
  ancho?: string;
}) {
  return (
    <ResponsiveContainer width={ancho} height={alto}>
      <PieChart>
        <Pie
          data={datos}
          dataKey="total"
          nameKey="etiqueta"
          innerRadius={38}
          outerRadius={68}
          strokeWidth={2}
        >
          {datos.map((d) => (
            <Cell key={d.perfil} fill={color[d.perfil]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GraficaPorDia({
  datos,
  color,
  alto = ALTO,
}: {
  datos: BarraDia[];
  color: Record<string, string>;
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos}>
        <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} />
        <Tooltip />
        <Bar dataKey="alumno" stackId="a" fill={color["alumno"]} name="Alumnos" />
        <Bar dataKey="docente" stackId="a" fill={color["docente"]} name="Docentes" />
        <Bar
          dataKey="externo"
          stackId="a"
          fill={color["externo"]}
          name="Externos"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Los rótulos de siempre: los del aforo del evento. */
const NOMBRES_AVANCE = {
  meta: "Caben",
  preinscritos: "Pre-registrados",
  pagados: "Pagados",
};

/** Un día en la gráfica de avance: lo que cabe, lo apuntado y lo cobrado. */
export interface BarraAvance {
  etiqueta: string;
  meta: number;
  preinscritos: number;
  pagados: number;
}

/**
 * Avance contra la meta: tres barras por día, juntas y no apiladas.
 *
 * Apiladas serían una mentira aritmética. `meta` no se SUMA a los
 * pre-registrados —es el techo contra el que se comparan—, y los pagados son un
 * subconjunto de los pre-registrados, no gente aparte. Una pila de las tres
 * dibujaría una columna de 1 800 personas donde hay 700 lugares.
 *
 * Juntas, la lectura es la que interesa de un vistazo: cuánto falta para llenar
 * la sala, y cuánto de lo que ya está apuntado dejó el dinero.
 */
export function GraficaAvance({
  datos,
  colores,
  alto = ALTO,
  horizontal = false,
  anchoEtiqueta = 150,
  nombres = NOMBRES_AVANCE,
}: {
  datos: BarraAvance[];
  /** En la pantalla son variables del tema; en el papel, colores escritos. */
  colores: { meta: string; preinscritos: string; pagados: string };
  alto?: number;
  /** Tumbada, para rótulos largos. Mismo motivo que en `GraficaDesglose`. */
  horizontal?: boolean;
  /** Cuánto se reserva para el rótulo cuando va tumbada. */
  anchoEtiqueta?: number;
  /**
   * Cómo se llaman las tres series en la leyenda.
   *
   * El techo no siempre es un aforo: en la hoja de LEIP es cuánta gente
   * entregó Servicios Escolares para ese grupo, y una leyenda que dijera
   * «Caben» ahí estaría hablando de sillas donde se habla de matrícula.
   */
  nombres?: { meta: string; preinscritos: string; pagados: string };
}) {
  // Tumbada no se redondean las esquinas de arriba: ahí la barra crece hacia la
  // derecha y el redondeo le tocaría al costado, no a la punta.
  const punta: [number, number, number, number] = horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0];
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} barGap={4}>
        {/*
          Los ejes van sueltos y no envueltos por pareja en un fragmento:
          `recharts` los busca entre los hijos directos del gráfico y, metidos
          en un `<>…</>`, la gráfica sale sin ejes y sin avisar.
        */}
        {horizontal ? (
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
        ) : (
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={12} />
        )}
        {horizontal ? (
          <YAxis
            type="category"
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={anchoEtiqueta}
          />
        ) : (
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
        )}
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/*
          La meta va primera y en gris: es el fondo contra el que se leen las
          otras dos, no una cifra que compita con ellas.
        */}
        <Bar dataKey="meta" fill={colores.meta} name={nombres.meta} radius={punta} />
        <Bar
          dataKey="preinscritos"
          fill={colores.preinscritos}
          name={nombres.preinscritos}
          radius={punta}
        />
        <Bar dataKey="pagados" fill={colores.pagados} name={nombres.pagados} radius={punta} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Un grupo cualquiera del desglose: lo apuntado y lo cobrado dentro de él. */
export interface BarraDesglose {
  etiqueta: string;
  preinscritos: number;
  pagados: number;
}

/**
 * Dos barras por grupo —apuntados y pagados— para cualquiera de los cortes de
 * la hoja de avance: licenciatura, semestre, nivel, taller.
 *
 * Juntas y no apiladas, por lo mismo que `GraficaAvance`: los pagados son un
 * subconjunto de los apuntados, no gente aparte, y apilarlas dibujaría el doble
 * de personas de las que hay.
 *
 * `horizontal` existe para los nombres largos. «Licenciatura en Educación e
 * Innovación Pedagógica» en el eje de abajo sale girado, recortado o encima del
 * siguiente; tumbada la gráfica, el nombre se lee de corrido y lo que crece es
 * el alto, que en papel es lo que sobra.
 */
export function GraficaDesglose({
  datos,
  colores,
  alto = ALTO,
  horizontal = false,
  anchoEtiqueta = 150,
}: {
  datos: BarraDesglose[];
  colores: { preinscritos: string; pagados: string };
  alto?: number;
  horizontal?: boolean;
  /** Cuánto se reserva para el rótulo cuando la gráfica va tumbada. */
  anchoEtiqueta?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout={horizontal ? "vertical" : "horizontal"}
        barGap={2}
        margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
      >
        {/*
          Los cuatro ejes van sueltos y no envueltos en un fragmento por pareja.

          `recharts` busca sus ejes recorriendo los hijos directos del gráfico y
          mirando de qué componente son; metidos en un `<>…</>` deja de
          encontrarlos y la gráfica sale sin ejes, sin avisar de nada.
        */}
        {horizontal ? (
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
        ) : (
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
        )}
        {horizontal ? (
          <YAxis
            type="category"
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={anchoEtiqueta}
          />
        ) : (
          <YAxis type="number" tickLine={false} axisLine={false} fontSize={11} width={32} />
        )}
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="preinscritos" fill={colores.preinscritos} name="Pre-registrados" />
        <Bar dataKey="pagados" fill={colores.pagados} name="Pagados" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Un corte cualquiera, con una sola cifra —sin pareja que compararle. */
export interface BarraConteo {
  etiqueta: string;
  cantidad: number;
}

/**
 * Una sola barra por corte, sin segunda serie.
 *
 * `GraficaDesglose` siempre dibuja dos —preinscritos y pagados— porque esa es
 * la pregunta de la hoja de avance: de lo apuntado, cuánto ya se cobró. Hay
 * reportes que no comparan nada, solo cuentan —cuántos alumnos faltan por
 * pagar en cada sede—, y forzarlos por `GraficaDesglose` obligaría a inventar
 * una segunda serie en cero solo para que el componente la ignore.
 *
 * Sin leyenda: con una sola serie, la leyenda repetiría el título de la
 * sección sin añadir nada que el eje no diga ya.
 */
export function GraficaConteo({
  datos,
  color,
  alto = ALTO,
  horizontal = false,
  anchoEtiqueta = 150,
  dominio,
  ticks,
  mostrarValor = false,
  multilinea = false,
}: {
  datos: BarraConteo[];
  color: string;
  alto?: number;
  horizontal?: boolean;
  /** Cuánto se reserva para el rótulo cuando va tumbada. */
  anchoEtiqueta?: number;
  /**
   * El rango del eje numérico, escrito.
   *
   * Sin esto, Recharts autoescala a «números redondos»: con promedios de 1 a
   * 5 y un máximo real de 4.5, eso da un eje de 0 a 8, que no significa nada
   * para una escala que no pasa de 5. Se usa solo donde el dato tiene un techo
   * conocido —el promedio de la encuesta—, no en los conteos de siempre.
   */
  dominio?: [number, number];
  /** Las marcas exactas del eje numérico, a juego con `dominio`. */
  ticks?: number[];
  /**
   * Escribe la cifra exacta al final de cada barra.
   *
   * El `<Tooltip>` de abajo no sirve de nada en un PDF —no hay con qué pasar
   * el mouse por encima—, así que una gráfica pensada para imprimirse necesita
   * su número ya puesto, no escondido detrás de un hover que nunca llega.
   */
  mostrarValor?: boolean;
  /**
   * Parte el rótulo del eje tumbado en varias líneas, por palabras.
   *
   * Pensado para títulos largos —el de una conferencia, no un «P3»—, donde
   * truncar con «…» esconde la mitad del dato y ensanchar el eje a lo bestia
   * le quita todo el ancho a la barra.
   */
  multilinea?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: mostrarValor ? 36 : 12, bottom: 0, left: 0 }}
      >
        {horizontal ? (
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            allowDecimals={false}
            domain={dominio}
            ticks={ticks}
          />
        ) : (
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
        )}
        {horizontal ? (
          <YAxis
            type="category"
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={anchoEtiqueta}
            interval={0}
            tick={multilinea ? <TickMultilinea anchoMaximo={anchoEtiqueta - 8} /> : undefined}
          />
        ) : (
          <YAxis
            type="number"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={32}
            allowDecimals={false}
            domain={dominio}
            ticks={ticks}
          />
        )}
        <Tooltip />
        <Bar dataKey="cantidad" fill={color} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
          {mostrarValor ? (
            <LabelList
              dataKey="cantidad"
              position={horizontal ? "right" : "top"}
              fontSize={11}
              fill="#404040"
              formatter={(v: number) => v.toFixed(2)}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * El rótulo tumbado, partido en varias líneas.
 *
 * Reemplaza el `<text>` de una sola línea que pone Recharts por omisión. Parte
 * por palabras hasta un ancho aproximado —no hay medida real de texto SVG sin
 * montar el DOM, así que se estima a ~6.2px por carácter a 11px de fuente—, y
 * si aun así sobran líneas, la última se corta con «…» en vez de desbordar.
 */
function TickMultilinea({
  x,
  y,
  payload,
  anchoMaximo,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  anchoMaximo: number;
}) {
  if (x === undefined || y === undefined || !payload) return null;
  const maxCaracteres = Math.max(10, Math.floor(anchoMaximo / 6.2));
  const palabras = payload.value.split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (prueba.length > maxCaracteres && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);

  const MAX_LINEAS = 4;
  const final =
    lineas.length > MAX_LINEAS
      ? [...lineas.slice(0, MAX_LINEAS - 1), `${lineas[MAX_LINEAS - 1]}…`]
      : lineas;
  const altoLinea = 12;
  const primerOffset = -((final.length - 1) * altoLinea) / 2;

  return (
    <text x={x} y={y} textAnchor="end" fontSize={11} fill="#525252">
      {final.map((linea, i) => (
        <tspan key={i} x={x} dy={i === 0 ? primerOffset : altoLinea}>
          {linea}
        </tspan>
      ))}
    </text>
  );
}

/** Un reactivo Likert: cuántas respuestas cayeron en cada uno de los cinco valores. */
export interface BarraLikert {
  etiqueta: string;
  v5: number;
  v4: number;
  v3: number;
  v2: number;
  v1: number;
}

/**
 * La paleta de la escala, verde a rojo.
 *
 * Divergente de verdad: los extremos son oscuros y saturados —de acuerdo
 * total en verde, desacuerdo total en rojo—, y el centro es un gris casi sin
 * matiz, porque «ni de acuerdo ni en desacuerdo» es precisamente eso, neutral.
 * La primera versión variaba el matiz pero no la luminosidad —los cinco
 * rondaban L≈0.5—, y en papel se leían como una sola mancha continua sin
 * jerarquía. Aquí la luminosidad SÍ cambia de extremo a centro, que es lo que
 * separa un verde de un gris a simple vista.
 */
export const TINTA_LIKERT: Record<"v5" | "v4" | "v3" | "v2" | "v1", string> = {
  v5: "oklch(0.45 0.15 150)",
  v4: "oklch(0.75 0.12 145)",
  v3: "oklch(0.8 0.01 255)",
  v2: "oklch(0.72 0.14 50)",
  v1: "oklch(0.45 0.18 25)",
};

/**
 * La distribución 1-5 de un conjunto de reactivos: una barra apilada por
 * pregunta, de «totalmente de acuerdo» a «totalmente en desacuerdo».
 *
 * Apiladas y no una barra por valor: lo que importa no es cuánta gente marcó
 * exactamente un 3, sino qué tan pareja o polarizada sale cada pregunta de un
 * vistazo, y eso solo lo enseña ver las cinco juntas en la misma barra.
 *
 * Sin `<Legend>` de Recharts: le comía alto al área de dibujo y, con menos
 * alto disponible, Recharts auto-ocultaba ticks del eje categórico para no
 * amontonarlos —con cinco preguntas, solo dejaba ver la 1ª, 3ª y 5ª—. La
 * leyenda vive ahora en HTML normal, fuera de este componente, junto a quien
 * lo llama. `interval={0}` en el eje es el cinturón además del tirante: nunca
 * debe esconder una pregunta aunque el alto vuelva a quedar justo.
 */
export function GraficaLikert({
  datos,
  color = TINTA_LIKERT,
  alto,
  anchoEtiqueta = 40,
}: {
  datos: BarraLikert[];
  color?: Record<"v5" | "v4" | "v3" | "v2" | "v1", string>;
  alto?: number;
  /** Cuánto se reserva para el rótulo de la izquierda. */
  anchoEtiqueta?: number;
}) {
  // Sin alto fijo por omisión: crece con el número de reactivos, igual que
  // una tabla. Una gráfica de doce preguntas en 180 px sale con las barras de
  // un hilo.
  const altoFinal = alto ?? Math.max(120, 26 * datos.length + 40);
  return (
    <ResponsiveContainer width="100%" height={altoFinal}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="etiqueta"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={anchoEtiqueta}
          interval={0}
        />
        <Tooltip />
        <Bar dataKey="v5" stackId="a" fill={color.v5} name="Totalmente de acuerdo" />
        <Bar dataKey="v4" stackId="a" fill={color.v4} name="De acuerdo" />
        <Bar dataKey="v3" stackId="a" fill={color.v3} name="Ni de acuerdo ni en desacuerdo" />
        <Bar dataKey="v2" stackId="a" fill={color.v2} name="En desacuerdo" />
        <Bar
          dataKey="v1"
          stackId="a"
          fill={color.v1}
          name="Totalmente en desacuerdo"
          radius={[0, 3, 3, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
