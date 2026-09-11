/**
 * Reglas del escáner de asistencia, sin React.
 *
 * Decide el color del semáforo, qué se registra y si hay que parar la fila. Es
 * pura a propósito: recibe el instante (`ahora`) en lugar de leer el reloj, para
 * que las ventanas de cortesía se puedan comprobar sin esperar a que pasen.
 *
 * **La puerta es un torniquete, no un formulario.** El capturista no elige si
 * está registrando una entrada o una salida: lo deduce el sistema del último
 * movimiento de esa persona. Con ocho puntos de captura y gente entrando y
 * saliendo durante la jornada, nadie puede saber de qué lado del recinto está
 * cada quien, y equivocarse de modo invierte el registro de todos los que pasen
 * después.
 *
 * La única salida que NO se escanea es la del final del día: esa la pone el
 * cierre automático, porque las 700 personas se van a la misma hora y formarlas
 * sería una fila de casi una hora en el peor momento.
 */

import type { Asistencia, Dia, EstadoPago, Participante } from "@/dominio/tipos";
import { sinAcreditar } from "@/lib/pagos-logica";

/**
 * Lo que atiende un capturista. `puerta` cubre entradas y salidas porque son el
 * mismo acto —pasar por la puerta— y cuál de los dos es lo decide el sistema.
 */
export type Modo = "puerta" | "taller";
export type Color = "verde" | "amarillo" | "rojo";

/**
 * Minutos dentro de los cuales un segundo escaneo de la misma persona en la
 * puerta NO cuenta.
 *
 * Aquí cada escaneo invierte el estado, así que un doble escaneo por descuido
 * —el capturista que pasa el lector dos veces, o dos filas que leen a la misma
 * persona— no deja un duplicado inocuo: la marca como que se fue.
 *
 * Dos minutos es más de lo que tarda un doble escaneo y menos de lo que tarda la
 * ida más corta al baño, que es el movimiento real más breve que existe.
 */
export const VENTANA_ANTIDOBLE_MIN = 2;

/** Lo mismo para el pase de lista de taller, donde no hay idas y vueltas. */
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
  /**
   * Qué se registra. En la puerta lo decide el motor a partir de dónde estaba
   * esa persona, así que viaja en el resultado en vez de leerse del modo de la
   * sesión: el modo ya no dice la dirección.
   */
  tipo: Asistencia["tipo"];
  /**
   * ¿Hay que parar la fila por esta persona?
   *
   * No es lo mismo que el color, y confundirlos costaba caro. «YA ESCANEADO» es
   * amarillo y su instrucción es literalmente «déjalo pasar». Taparle la
   * pantalla al capturista dos segundos y medio por eso detiene a los que vienen
   * detrás para no comunicar nada.
   *
   * Detienen los casos en los que el capturista tiene algo que HACER: mandar a
   * la mesa de incidencias, o avisarle a esa persona que pase por Servicios
   * Financieros. El resto es un destello sobre el vídeo y la cámara sigue viva.
   *
   * El valor por defecto es `true`: ante un caso que nadie previó, parar es
   * menos grave que dejar pasar a alguien en silencio.
   */
  detiene: boolean;
  participante?: Participante | undefined;
  /** Solo para día equivocado: un supervisor puede autorizar el paso. */
  autorizable: boolean;
  entradaCruda: string;
}

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

/**
 * Cuándo ocurrió un movimiento, en milisegundos.
 *
 * Las asistencias capturadas en esta sesión traen `ts`; las que llegan de la
 * base solo traen la hora en texto, así que se reconstruye sobre el día de
 * `ahora`. Sin esto, todo lo que no se escaneó en este teléfono contaría como
 * ocurrido en 1970 y la ventana antidoble no protegería de nada, que es
 * justamente el caso de los otros siete puntos de captura.
 */
function instante(a: Asistencia, ahora: number): number {
  if (typeof a.ts === "number") return a.ts;
  const [h, m] = a.hora.split(":").map(Number);
  const d = new Date(ahora);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/** Las entradas y salidas de una persona ese día, de la más vieja a la más nueva. */
export function movimientosDe(asistencias: Asistencia[], folio: string, dia: Dia): Asistencia[] {
  return asistencias
    .filter(
      (a) => a.folio === folio && a.dia === dia && (a.tipo === "entrada" || a.tipo === "salida"),
    )
    .sort((a, b) => a.hora.localeCompare(b.hora) || (a.ts ?? 0) - (b.ts ?? 0));
}

/**
 * ¿Esta persona está dentro del recinto ahora mismo?
 *
 * Manda su último movimiento. Quien nunca pasó por la puerta está fuera, y quien
 * salió a las 11 y no volvió también: eso es exactamente lo que el cierre del
 * día no debe tapar, y lo que deja ver cuánta gente se fue a media jornada.
 */
export function estaDentro(asistencias: Asistencia[], folio: string, dia: Dia): boolean {
  const movs = movimientosDe(asistencias, folio, dia);
  return movs[movs.length - 1]?.tipo === "entrada";
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
 * Evalúa un escaneo. El orden de las reglas importa.
 *
 * Primero se resuelve la puerta de quien ya pasó por ella hoy, y se resuelve en
 * verde sin mirar nada más. Son dos decisiones, no un descuido: a nadie se le
 * niega salir, y a quien ya fue admitido no se le vuelve a auditar el pago para
 * dejarlo volver del baño. Los controles son de admisión, no de cada paso.
 *
 * Después, para quien llega por primera vez, va lo que impide el paso (rojo), la
 * duplicación del pase de lista (amarillo que no registra) y al final la
 * discrepancia de pago (amarillo que sí registra, porque a esa persona se le
 * deja entrar avisando).
 */
export function evaluarEscaneo(e: EntradaEvaluacion): ResultadoEscaneo {
  const { entrada, sesion, participantes, asistencias, estadoDe, ahora, autorizado } = e;
  const base = {
    entradaCruda: entrada.trim(),
    autorizable: false,
    participante: undefined,
    detiene: true,
    tipo: "entrada" as Asistencia["tipo"],
  };

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

  // --- Puerta: la dirección la decide el sistema, no el capturista ---
  if (sesion.modo === "puerta") {
    const movs = movimientosDe(asistencias, p.folio, sesion.dia);
    const ultimo = movs[movs.length - 1];

    if (ultimo) {
      // Doble escaneo por descuido. Aquí no basta con no duplicar: registrarlo
      // invertiría el estado y dejaría fuera a quien acaba de entrar.
      const minutos = Math.floor((ahora - instante(ultimo, ahora)) / 60000);
      if (minutos < VENTANA_ANTIDOBLE_MIN)
        return {
          ...conPersona,
          tipo: ultimo.tipo,
          color: "amarillo",
          titulo: "YA ESCANEADO",
          motivo: `Su ${ultimo.tipo} se registró hace ${
            minutos < 1 ? "menos de un minuto" : `${minutos} min`
          }.`,
          accion: "Déjalo pasar.",
          registra: false,
          detiene: false,
        };

      // Estaba dentro, así que esto es una salida. No se le niega a nadie ni se
      // le revisa nada: ya pasó los controles al entrar.
      if (ultimo.tipo === "entrada") {
        const primera = movs.find((m) => m.tipo === "entrada");
        return {
          ...conPersona,
          tipo: "salida",
          color: "verde",
          titulo: "SALIDA REGISTRADA",
          motivo: primera ? `Entró a las ${primera.hora}.` : "",
          accion: "",
          registra: true,
          detiene: false,
        };
      }

      // Estaba fuera habiendo salido antes: vuelve. Mismo criterio.
      return {
        ...conPersona,
        tipo: "entrada",
        color: "verde",
        titulo: "REGRESÓ",
        motivo: `Había salido a las ${ultimo.hora}.`,
        accion: "",
        registra: true,
        detiene: false,
      };
    }
  }

  // --- Día equivocado: no se registra salvo autorización de supervisor ---
  if (p.dia !== sesion.dia && !autorizado)
    return {
      ...conPersona,
      color: "rojo",
      titulo: "DÍA EQUIVOCADO",
      motivo: `Su asistencia es el DÍA ${p.dia} (${p.lugar}), hoy se registra el DÍA ${sesion.dia}.`,
      accion: "PASAR A MESA DE INCIDENCIAS",
      registra: false,
      autorizable: true,
    };

  const estado = estadoDe(p);

  // --- Sin pagar ---
  if (sinAcreditar(estado.evento))
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
    if (estado.taller && sinAcreditar(estado.taller))
      return {
        ...conPersona,
        color: "rojo",
        titulo: "TALLER SIN PAGAR",
        motivo: `No tiene registrado el pago del taller ${p.tallerId}.`,
        accion: "PASAR A MESA DE INCIDENCIAS",
        registra: false,
      };

    /*
     * Pase de lista ya hecho: no se duplica.
     *
     * Solo aplica al taller. En la puerta un segundo paso es legítimo —es salir,
     * o es volver— y de los accidentes ya se encargó la ventana antidoble.
     */
    const suyas = asistencias.filter(
      (a) => a.folio === p.folio && a.dia === sesion.dia && a.tipo === "taller",
    );
    const ultima = suyas.length
      ? suyas.reduce((a, b) => (instante(a, ahora) > instante(b, ahora) ? a : b))
      : undefined;
    if (ultima) {
      const minutos = Math.floor((ahora - instante(ultima, ahora)) / 60000);
      return {
        ...conPersona,
        tipo: "taller",
        color: "amarillo",
        titulo: minutos < VENTANA_REINGRESO_MIN ? "REINGRESO" : "YA REGISTRADO",
        motivo: `Su taller del día ${sesion.dia} ya está registrado (${ultima.hora}).`,
        accion: "Déjalo pasar. No se registra otra vez.",
        registra: false,
        detiene: false,
      };
    }
  }

  const tipo: Asistencia["tipo"] = sesion.modo === "taller" ? "taller" : "entrada";

  // --- Discrepancia de pago: pasa, pero avisando ---
  const estadoRelevante = sesion.modo === "taller" ? estado.taller : estado.evento;
  if (estadoRelevante === "discrepancia")
    return {
      ...conPersona,
      tipo,
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
    tipo,
    color: "verde",
    titulo: tipo === "taller" ? "TALLER REGISTRADA" : "ENTRADA REGISTRADA",
    motivo: autorizado && p.dia !== sesion.dia ? "Paso autorizado por supervisor." : "",
    accion: "",
    registra: true,
    detiene: false,
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
    // El tipo sale del resultado, no del modo de la sesión: en la puerta el modo
    // ya no dice la dirección, la dice el motor.
    tipo: r.tipo,
    hora,
    punto: sesion.punto,
    capturista: sesion.capturista,
    ts: ahora,
  };
}
