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

/** El alto lo fija el panel; aquí solo se respeta, para que no salte al cargar. */
const ALTO = 180;

export function GraficaPerfiles({
  datos,
  color,
}: {
  datos: RebanadaPerfil[];
  color: Record<string, string>;
}) {
  return (
    <ResponsiveContainer width="45%" height={ALTO}>
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
}: {
  datos: BarraDia[];
  color: Record<string, string>;
}) {
  return (
    <ResponsiveContainer width="100%" height={ALTO}>
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
