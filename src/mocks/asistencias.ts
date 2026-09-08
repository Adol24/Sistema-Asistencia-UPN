import { participantes } from "./participantes";
import type { Asistencia, Dia } from "./tipos";

const puntos = ["Puerta A", "Puerta B", "Vestíbulo", "Registro Taller"];
const capturistas = ["MARIO CANTU", "LETICIA BAÑOS", "JOSUE PALOMO"];

const pagados = participantes.filter((p) => p.estadoPagoEvento === "pagado");

/**
 * Uno de cada tres pagados llega SIN registro de asistencia.
 *
 * No es un hueco en los datos: es el caso normal de la puerta. Si todo pagado
 * ya tuviera entrada, el escáner respondería «YA REGISTRADO» casi siempre y el
 * caso verde —el que ocurre cientos de veces al día— sería el más difícil de
 * demostrar. `npm run verificar-mocks` comprueba que cada día conserve varios.
 */
const sinRegistroAun = (i: number) => i % 3 === 2;

const ordinarias: Asistencia[] = pagados.flatMap((p, i) => {
  if (sinRegistroAun(i)) return [];

  const base: Asistencia[] = [
    {
      id: `AS-${p.folio}-E`,
      folio: p.folio,
      nombre: p.nombre,
      dia: p.dia as Dia,
      tipo: "entrada",
      hora: `8:${String(15 + (i % 40)).padStart(2, "0")}`,
      punto: puntos[i % 3]!,
      capturista: capturistas[i % capturistas.length]!,
    },
  ];
  // Quien no tiene salida es a quien le toca el cierre automático del día.
  // La regla deja al menos un caso por día para poder evaluarlo en los tres, y
  // al mismo tiempo deja a la mayoría con el día completo: en un cierre de
  // evento real casi todo el que entró termina con entrada y salida, y sin eso
  // el listado de elegibles queda demasiado corto para evaluarlo.
  if (i % 6 !== 0) {
    base.push({
      id: `AS-${p.folio}-S`,
      folio: p.folio,
      nombre: p.nombre,
      dia: p.dia as Dia,
      tipo: "salida",
      hora: `13:${String(20 + (i % 35)).padStart(2, "0")}`,
      punto: puntos[i % 3]!,
      capturista: capturistas[i % capturistas.length]!,
      cierreAutomatico: i % 3 === 0,
    });
  }
  if (p.tallerId && i % 3 === 0) {
    base.push({
      id: `AS-${p.folio}-T`,
      folio: p.folio,
      nombre: p.nombre,
      dia: p.dia as Dia,
      tipo: "taller",
      hora: `10:${String(5 + (i % 20)).padStart(2, "0")}`,
      punto: "Registro Taller",
      capturista: capturistas[i % capturistas.length]!,
    });
  }
  return base;
});

/**
 * Anomalías sembradas a propósito, para que el monitoreo en vivo tenga qué
 * detectar. Las dos que pide la especificación:
 *
 * 1. Ráfaga: un capturista con decenas de registros en dos minutos. Delata a
 *    alguien escaneando una pila de credenciales sin que las personas estén.
 * 2. Horario improbable: escaneos fuera de la ventana del evento (8:00–14:00).
 *
 * Se apoyan en participantes que ya tenían entrada, para no inventar asistencia
 * donde no la había ni alterar los conteos de casos verdes del escáner.
 */
// Ráfaga: un solo capturista registra a todo el grupo de taller del día 1 en
// dos minutos. Son personas reales del día 1 inscritas en un taller, así que el
// dato es coherente; lo anómalo es el ritmo, que es justo lo que hay que ver.
const grupoRafaga = participantes.filter(
  (p) => p.dia === 1 && p.tallerId && p.estadoPagoEvento === "pagado",
);

const rafaga: Asistencia[] = grupoRafaga.map((p, k) => ({
  id: `AS-ANOM-RAFAGA-${k}`,
  folio: p.folio,
  nombre: p.nombre,
  dia: 1,
  tipo: "taller",
  hora: `9:${String(40 + Math.floor(k / 5)).padStart(2, "0")}`,
  punto: "Registro Taller",
  capturista: "JOSUE PALOMO",
}));

// Horario improbable: escaneos fuera de la ventana del evento (8:00 a 14:00).
const grupoHorario = participantes.filter(
  (p) => p.dia === 2 && p.tallerId && p.estadoPagoEvento === "pagado",
);

const horarioImprobable: Asistencia[] = grupoHorario.slice(0, 3).map((p, k) => ({
  id: `AS-ANOM-HORARIO-${k}`,
  folio: p.folio,
  nombre: p.nombre,
  dia: 2,
  tipo: "taller",
  hora: k === 0 ? "5:12" : k === 1 ? "6:41" : "22:03",
  punto: "Vestíbulo",
  capturista: "LETICIA BAÑOS",
}));

export const asistencias: Asistencia[] = [...ordinarias, ...rafaga, ...horarioImprobable];
