/**
 * Métricas y detección de anomalías del monitoreo en vivo, sin React.
 *
 * Esta pantalla se mira durante la hora de acceso, con 700 personas entrando.
 * Si el ritmo cae por debajo de lo necesario, quien coordina tiene que verlo a
 * tiempo para abrir otra puerta; por eso el cálculo del ritmo y el de la
 * proyección están aquí, verificables, y no repartidos por la vista.
 */

import type { Asistencia, Dia } from "@/dominio/tipos";
import { estaDentro } from "@/lib/escaneo";

/** Ventana del evento: fuera de este rango un escaneo es improbable. */
export const HORA_INICIO = 8;
export const HORA_FIN = 14;

/** Registros del mismo capturista en esta ventana disparan la alerta de ráfaga. */
export const VENTANA_RAFAGA_MIN = 2;
export const UMBRAL_RAFAGA = 6;

export const minutosDe = (hora: string) => {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m ?? 0);
};

export const enHorarioImprobable = (hora: string) => {
  const m = minutosDe(hora);
  return m < HORA_INICIO * 60 || m > HORA_FIN * 60;
};

export type ClaseAnomalia = "rafaga" | "horario";

export interface Anomalia {
  clase: ClaseAnomalia;
  titulo: string;
  detalle: string;
  /** Qué debe hacer quien coordina. */
  accion: string;
  capturista: string;
  dia: Dia;
  afectadas: Asistencia[];
}

/**
 * Un capturista con muchos registros en dos minutos delata a alguien escaneando
 * una pila de credenciales sin que las personas estén presentes.
 */
export function anomaliasDeRafaga(asistencias: Asistencia[]): Anomalia[] {
  const cubos = new Map<string, Asistencia[]>();
  for (const a of asistencias) {
    const cubo = Math.floor(minutosDe(a.hora) / VENTANA_RAFAGA_MIN);
    const clave = `${a.capturista}|${a.dia}|${cubo}`;
    cubos.set(clave, [...(cubos.get(clave) ?? []), a]);
  }
  return [...cubos.entries()]
    .filter(([, g]) => g.length >= UMBRAL_RAFAGA)
    .map(([clave, g]) => {
      const [capturista, dia] = clave.split("|");
      const horas = g.map((a) => a.hora).sort();
      return {
        clase: "rafaga" as const,
        titulo: `${g.length} registros en ${VENTANA_RAFAGA_MIN} minutos`,
        detalle: `${capturista} registró ${g.length} asistencias entre las ${horas[0]} y las ${horas[horas.length - 1]} del día ${dia}, en ${g[0]!.punto}.`,
        accion:
          "Verifica que las personas estuvieran presentes; puede ser una pila de credenciales.",
        capturista: capturista!,
        dia: Number(dia) as Dia,
        afectadas: g,
      };
    })
    .sort((a, b) => b.afectadas.length - a.afectadas.length);
}

/** Escaneos fuera de la ventana del evento. */
export function anomaliasDeHorario(asistencias: Asistencia[]): Anomalia[] {
  const fuera = asistencias.filter((a) => enHorarioImprobable(a.hora));
  const porCapturista = new Map<string, Asistencia[]>();
  for (const a of fuera) {
    const clave = `${a.capturista}|${a.dia}`;
    porCapturista.set(clave, [...(porCapturista.get(clave) ?? []), a]);
  }
  return [...porCapturista.entries()].map(([clave, g]) => {
    const [capturista, dia] = clave.split("|");
    return {
      clase: "horario" as const,
      titulo: `${g.length} ${g.length === 1 ? "escaneo" : "escaneos"} en horario improbable`,
      detalle: `${capturista} registró a las ${g.map((a) => a.hora).join(", ")} del día ${dia}. El evento corre de ${HORA_INICIO}:00 a ${HORA_FIN}:00 hrs.`,
      accion: "Revisa si el reloj del dispositivo está mal o si el registro se hizo fuera de sede.",
      capturista: capturista!,
      dia: Number(dia) as Dia,
      afectadas: g,
    };
  });
}

export const detectarAnomalias = (asistencias: Asistencia[]): Anomalia[] => [
  ...anomaliasDeRafaga(asistencias),
  ...anomaliasDeHorario(asistencias),
];

export interface MetricasDia {
  dia: Dia;
  esperados: number;
  /**
   * PERSONAS que han entrado, no registros de entrada.
   *
   * Desde que la puerta registra idas y vueltas, quien sale al baño y vuelve
   * deja dos entradas. Contar registros hacía que el avance pasara del 100 % y
   * que la proyección dijera que ya había llegado gente que no había llegado.
   */
  entradas: number;
  /** Registros de salida, incluidas las de media jornada. */
  salidas: number;
  /** Cuántas personas están DENTRO del recinto ahora mismo. */
  dentro: number;
  /**
   * Entraron y ahora están fuera: se fueron y todavía no han vuelto.
   *
   * Es el número que antes no existía, y el que contesta la pregunta que abrió
   * todo esto: cuánta gente se va a media jornada.
   */
  seFueron: number;
  /** Porcentaje de los esperados que ya entró. */
  avance: number;
  /** Llegadas por minuto durante la ventana de registro observada. */
  ritmoPorMinuto: number;
  /** Minutos que faltarían al ritmo actual para terminar de recibir a todos. */
  minutosRestantes: number | null;
  porPunto: { punto: string; entradas: number; capturistas: string[] }[];
}

/** Métricas de la puerta para un día. `esperados` son los que deberían asistir. */
export function metricasDelDia(
  asistencias: Asistencia[],
  dia: Dia,
  esperados: number,
  /** Hora simulada, en minutos desde medianoche. Acota la ventana observada. */
  ahoraMinutos?: number,
): MetricasDia {
  const delDia = asistencias.filter((a) => a.dia === dia);
  const entradas = delDia.filter((a) => a.tipo === "entrada");
  const salidas = delDia.filter((a) => a.tipo === "salida");

  /*
   * De aquí en adelante se cuentan PERSONAS, no registros.
   *
   * La llegada de cada quien es su PRIMERA entrada del día; las siguientes son
   * regresos del baño o del receso. El ritmo y la proyección miden llegadas, no
   * pasos por la puerta: si no se separan, un receso multitudinario se ve como
   * si estuviera llegando el doble de gente de la que falta.
   */
  const llegadas = new Map<string, number>();
  for (const a of entradas) {
    const m = minutosDe(a.hora);
    const previa = llegadas.get(a.folio);
    if (previa === undefined || m < previa) llegadas.set(a.folio, m);
  }
  const personas = [...new Set(delDia.map((a) => a.folio))];
  const dentro = personas.filter((f) => estaDentro(delDia, f, dia));
  const seFueron = [...llegadas.keys()].filter((f) => !dentro.includes(f));

  const minutos = [...llegadas.values()];
  const desde = minutos.length ? Math.min(...minutos) : 0;
  // El ritmo se mide contra el reloj del evento, no contra el último escaneo:
  // si nadie ha pasado en diez minutos, el ritmo debe caer, no quedarse quieto.
  const hasta = ahoraMinutos ?? (minutos.length ? Math.max(...minutos) : 0);
  // Al menos un minuto, para no dividir entre cero.
  const transcurridos = Math.max(1, hasta - desde);
  const ritmoPorMinuto = llegadas.size / transcurridos;
  const faltantes = Math.max(0, esperados - llegadas.size);

  const puntos = new Map<string, Asistencia[]>();
  for (const a of entradas) puntos.set(a.punto, [...(puntos.get(a.punto) ?? []), a]);

  return {
    dia,
    esperados,
    entradas: llegadas.size,
    salidas: salidas.length,
    dentro: dentro.length,
    seFueron: seFueron.length,
    avance: esperados === 0 ? 0 : Math.round((llegadas.size / esperados) * 100),
    ritmoPorMinuto: Math.round(ritmoPorMinuto * 10) / 10,
    minutosRestantes: ritmoPorMinuto > 0 ? Math.ceil(faltantes / ritmoPorMinuto) : null,
    porPunto: [...puntos.entries()]
      .map(([punto, g]) => ({
        punto,
        entradas: g.length,
        capturistas: [...new Set(g.map((a) => a.capturista))],
      }))
      .sort((a, b) => b.entradas - a.entradas),
  };
}
