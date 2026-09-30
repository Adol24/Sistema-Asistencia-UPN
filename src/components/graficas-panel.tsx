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
}: {
  datos: BarraAvance[];
  /** En la pantalla son variables del tema; en el papel, colores escritos. */
  colores: { meta: string; preinscritos: string; pagados: string };
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} barGap={4}>
        <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/*
          La meta va primera y en gris: es el fondo contra el que se leen las
          otras dos, no una cifra que compita con ellas.
        */}
        <Bar dataKey="meta" fill={colores.meta} name="Caben" radius={[3, 3, 0, 0]} />
        <Bar
          dataKey="preinscritos"
          fill={colores.preinscritos}
          name="Pre-registrados"
          radius={[3, 3, 0, 0]}
        />
        <Bar dataKey="pagados" fill={colores.pagados} name="Pagados" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
