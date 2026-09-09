/**
 * Reglas del escáner de asistencia, sin React.
 *
 * Decide el color del semáforo y si el escaneo se registra. Es pura a propósito:
 * recibe el instante (`ahora`) en lugar de leer el reloj, para que la ventana de
 * reingreso de 15 minutos se pueda comprobar sin esperar 15 minutos.
 */

import type { Asistencia, Dia, EstadoPago, Participante } from "@/dominio/tipos";

export type Modo = "entrada" | "salida" | "taller";
export type Color = "verde" | "amarillo" | "rojo";

/** Minutos dentro de los cuales volver a escanear NO genera un registro nuevo. */
export const VENTANA_REINGRESO_MIN = 15;

export interface SesionCaptura {
  dia: Dia;
  modo: Modo;
  punto: string;
  capturista: string;
}

export interface ResultadoEscaneo {
  color: Color;
  /** Texto grande, legible a un metro. */
  titulo: string;
  motivo: string;
  /** Qué debe hacer el capturista. En rojo siempre es pasar a incidencias. */
  accion: string;
  /** Si es false, no se agrega ninguna asistencia. */
  registra: boolean;
  participante?: Participante | undefined;
  /** Solo para día equivocado: un supervisor puede autorizar el paso. */
  autorizable: boolean;
  entradaCruda: string;
}

const ETIQUETA_MODO: Record<Modo, string> = {
  entrada: "ENTRADA",
  salida: "SALIDA",
  taller: "TALLER",
};

const SIN_PAGAR: EstadoPago[] = ["pre_registrado", "comprobante_recibido", "expirado", "cancelado"];

const MOTIVO_SIN_PAGAR: Record<string, string> = {
  pre_registrado: "No ha entregado su comprobante de pago.",
  comprobante_recibido: "Entregó comprobante pero Servicios Financieros aún no valida el monto.",
  expirado: "Su pre-registro venció por no entregar el comprobante a tiempo.",
  cancelado: "Su registro fue cancelado.",
};

/** Busca por folio o matrícula, sin distinguir mayúsculas ni espacios. */
export function buscarParaEscaneo(
  participantes: Participante[],
  entrada: string,
): Participante | undefined {
  const t = entrada.trim().toLowerCase();
  if (!t) return undefined;
  return participantes.find(
    (p) => p.folio.toLowerCase() === t || (p.matricula ?? "").toLowerCase() === t,
  );
}

export interface EntradaEvaluacion {
  entrada: string;
  sesion: SesionCaptura;
  participantes: Participante[];
  /** Asistencias ya conocidas: las de los mocks más las de esta sesión. */
  asistencias: Asistencia[];
  /** Estado de pago efectivo, con los pagos de la sesión ya aplicados. */
  estadoDe: (p: Participante) => { evento: EstadoPago; taller: EstadoPago | undefined };
  /** Instante del escaneo, en milisegundos. */
  ahora: number;
  /** Un supervisor autorizó el paso pese al día equivocado. */
  autorizado?: boolean;
}

/**
 * Evalúa un escaneo. El orden de las reglas importa:
 * primero lo que impide el paso (rojo), después la duplicación de registro
 * (amarillo que no registra) y al final la discrepancia de pago (amarillo que
 * sí registra, porque a esa persona se le deja entrar avisando).
 */
export function evaluarEscaneo(e: EntradaEvaluacion): ResultadoEscaneo {
  const { entrada, sesion, participantes, asistencias, estadoDe, ahora, autorizado } = e;
  const base = { entradaCruda: entrada.trim(), autorizable: false, participante: undefined };

  const p = buscarParaEscaneo(participantes, entrada);
  if (!p)
    return {
      ...base,
      color: "rojo",
      titulo: "FOLIO INVÁLIDO",
      motivo: `No existe ningún registro con «${entrada.trim() || "(vacío)"}».`,
      accion: "PASAR A MESA DE INCIDENCIAS",
      registra: false,
    };

  const conPersona = { ...base, participante: p };

  // --- Día equivocado: no se registra salvo autorización de supervisor ---
  if (p.dia !== sesion.dia && !autorizado)
    return {
      ...conPersona,
      color: "rojo",
      titulo: "DÍA EQUIVOCADO",
      motivo: `Su asistencia es el DÍA ${p.dia} (${p.sede}), hoy se registra el DÍA ${sesion.dia}.`,
      accion: "PASAR A MESA DE INCIDENCIAS",
      registra: false,
      autorizable: true,
    };

  const estado = estadoDe(p);

  // --- Sin pagar ---
  if (SIN_PAGAR.includes(estado.evento))
    return {
      ...conPersona,
      color: "rojo",
      titulo: "SIN PAGAR",
      motivo: MOTIVO_SIN_PAGAR[estado.evento] ?? "No tiene el pago registrado.",
      accion: "PASAR A MESA DE INCIDENCIAS",
      registra: false,
    };

  // --- Modo taller: debe estar inscrito ---
  if (sesion.modo === "taller") {
    if (!p.tallerId)
      return {
        ...conPersona,
        color: "rojo",
        titulo: "SIN TALLER",
        motivo: "No está inscrito en ningún taller.",
        accion: "PASAR A MESA DE INCIDENCIAS",
        registra: false,
      };
    if (estado.taller && SIN_PAGAR.includes(estado.taller))
      return {
        ...conPersona,
        color: "rojo",
        titulo: "TALLER SIN PAGAR",
        motivo: `No tiene registrado el pago del taller ${p.tallerId}.`,
        accion: "PASAR A MESA DE INCIDENCIAS",
        registra: false,
      };
  }

  const suyas = asistencias.filter(
    (a) => a.folio === p.folio && a.dia === sesion.dia && a.tipo === sesion.modo,
  );

  // --- Reingreso dentro de la ventana: no duplica el registro ---
  const conMarca = suyas.filter((a) => typeof a.ts === "number");
  const ultima = conMarca.length
    ? conMarca.reduce((a, b) => ((a.ts ?? 0) > (b.ts ?? 0) ? a : b))
    : undefined;
  if (ultima) {
    const minutos = Math.floor((ahora - (ultima.ts ?? 0)) / 60000);
    if (minutos < VENTANA_REINGRESO_MIN)
      return {
        ...conPersona,
        color: "amarillo",
        titulo: "REINGRESO",
        motivo: `Ya registró ${ETIQUETA_MODO[sesion.modo].toLowerCase()} hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}, dentro de la ventana de ${VENTANA_REINGRESO_MIN}.`,
        accion: "Déjalo pasar sin registrar de nuevo.",
        registra: false,
      };
  }

  // --- Ya registrado hoy (fuera de la ventana) ---
  if (suyas.length > 0)
    return {
      ...conPersona,
      color: "amarillo",
      titulo: "YA REGISTRADO",
      motivo: `Su ${ETIQUETA_MODO[sesion.modo].toLowerCase()} del día ${sesion.dia} ya está registrada (${suyas[0]!.hora}).`,
      accion: "Déjalo pasar. No se registra otra vez.",
      registra: false,
    };

  // --- Salida sin entrada previa ---
  if (sesion.modo === "salida") {
    const entradas = asistencias.filter(
      (a) => a.folio === p.folio && a.dia === sesion.dia && a.tipo === "entrada",
    );
    if (entradas.length === 0)
      return {
        ...conPersona,
        color: "amarillo",
        titulo: "SIN ENTRADA PREVIA",
        motivo: "No tiene entrada registrada hoy; su salida quedará sin par.",
        accion: "Regístralo y avisa a la mesa de incidencias.",
        registra: true,
      };
  }

  // --- Discrepancia de pago: pasa, pero avisando ---
  const estadoRelevante = sesion.modo === "taller" ? estado.taller : estado.evento;
  if (estadoRelevante === "discrepancia")
    return {
      ...conPersona,
      color: "amarillo",
      titulo: "DISCREPANCIA DE PAGO",
      motivo:
        sesion.modo === "taller"
          ? "El monto del taller no coincide con lo esperado."
          : "El monto depositado no coincide con lo esperado.",
      accion: "Déjalo pasar y pídele acudir a Servicios Financieros.",
      registra: true,
    };

  // --- Verde ---
  return {
    ...conPersona,
    color: "verde",
    titulo: `${ETIQUETA_MODO[sesion.modo]} REGISTRADA`,
    motivo: autorizado && p.dia !== sesion.dia ? "Paso autorizado por supervisor." : "",
    accion: "",
    registra: true,
  };
}

/** Construye la asistencia que corresponde a un resultado que sí se registra. */
export function asistenciaDe(
  r: ResultadoEscaneo,
  sesion: SesionCaptura,
  ahora: number,
  hora: string,
  secuencia: number,
): Asistencia {
  const p = r.participante!;
  return {
    id: `AS-S${String(secuencia).padStart(4, "0")}-${p.folio}`,
    folio: p.folio,
    nombre: p.nombre,
    dia: sesion.dia,
    tipo: sesion.modo,
    hora,
    punto: sesion.punto,
    capturista: sesion.capturista,
    ts: ahora,
  };
}
