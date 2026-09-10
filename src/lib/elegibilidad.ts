/**
 * Cálculo de elegibilidad para constancia, sin React.
 *
 * El sistema NO genera los documentos: calcula quién es elegible y entrega el
 * listado a quien los elabore. Es la única pieza que nadie más puede hacer,
 * porque solo el sistema sabe quién pagó, quién asistió y quién tiene sus
 * evidencias aprobadas.
 *
 * Los requisitos cambian por perfil, y el listado de taller es independiente del
 * de evento. Todo vive aquí para poder comprobarlo sin montar la pantalla, y
 * porque quien opere el módulo va a responder muchas veces la misma pregunta:
 * por qué fulano no aparece en el listado.
 */

import { useMemo } from "react";

import type { Asistencia, CasoSoporte, EstadoPago, Evidencia, Participante } from "@/dominio/tipos";
import { useEstadoEvento } from "@/lib/estado-evento";

/** Los dos listados que el sistema entrega por separado. */
export type TipoListado = "evento" | "taller";

export interface Requisito {
  texto: string;
  ok: boolean;
  /** Qué hacer para cumplirlo, cuando no se cumple. */
  comoSeResuelve: string;
}

export interface Elegibilidad {
  requisitos: Requisito[];
  elegible: boolean;
  /** Primer requisito incumplido, que es lo que se muestra en la lista. */
  faltante?: Requisito | undefined;
}

/** Evidencias aprobadas que un alumno necesita para su constancia. */
export const EVIDENCIAS_REQUERIDAS = 2;

export interface EntornoConstancias {
  estadoDe: (p: Participante) => { evento: EstadoPago; taller: EstadoPago | undefined };
  asistenciasDe: (folio: string, dia?: 1 | 2 | 3) => Asistencia[];
  /**
   * Las evidencias de esa persona, ordenadas por día.
   *
   * Antes se recibía la lista completa y cada participante la filtraba y
   * ordenaba entera. Quien arma el entorno las agrupa de una pasada para todos,
   * que es lo que convierte un coste cuadrático en lineal.
   */
  evidenciasDe: (folio: string) => Evidencia[];
  /** Días en los que se imparte el taller del participante, si tiene. */
  diasTallerDe: (tallerId?: string) => (1 | 2 | 3)[];
}

/**
 * ¿Registró entrada y salida ese día?
 *
 * El cierre automático cuenta como salida válida: no salir escaneando es lo
 * normal cuando el evento termina y la gente se va en bloque, y penalizarlo
 * dejaría sin constancia a quien sí asistió el día completo.
 *
 * Recibe las asistencias del día en vez de ir a buscarlas: quien la llama ya
 * las tiene, y pedirlas dos veces era recorrer la lista dos veces por persona.
 */
export function asistioElDia(delDia: Asistencia[]): boolean {
  return delDia.some((a) => a.tipo === "entrada") && delDia.some((a) => a.tipo === "salida");
}

/** Elegibilidad para la constancia del EVENTO, según el perfil. */
export function elegibilidadEvento(entorno: EntornoConstancias, p: Participante): Elegibilidad {
  const estado = entorno.estadoDe(p);
  // Las asistencias del día se piden UNA vez y de ahí sale todo. Se pedían dos
  // —una aquí y otra dentro de `asistioElDia`— y la entrada se buscaba otras
  // dos, para el mismo dato.
  const delDia = entorno.asistenciasDe(p.folio, p.dia);
  const asistio = asistioElDia(delDia);
  const aprobadas = entorno.evidenciasDe(p.folio).filter((e) => e.estado === "aprobada").length;

  // El detalle tiene que alcanzar para responder sin abrir otra pantalla: es la
  // pregunta que va a llegar cientos de veces cuando se entreguen los documentos.
  const entrada = delDia.find((a) => a.tipo === "entrada");
  const salida = delDia.find((a) => a.tipo === "salida");
  const detalleAsistencia = !entrada
    ? `No tiene entrada registrada el día ${p.dia}. Revisa la captura de asistencia de ese día.`
    : !salida
      ? `Tiene entrada (${entrada.hora}) pero no salida del día ${p.dia}. Ejecuta el cierre automático del día para completarla.`
      : "";

  const requisitos: Requisito[] = [
    {
      texto: "Pago del evento registrado como pagado",
      ok: estado.evento === "pagado",
      comoSeResuelve: `Su pago está en «${estado.evento.replace("_", " ")}»${
        p.referenciaEvento ? `, referencia ${p.referenciaEvento}` : ""
      }. Debe resolverse en Servicios Financieros.`,
    },
    {
      texto: `Entrada y salida registradas el día ${p.dia}`,
      ok: asistio,
      comoSeResuelve: detalleAsistencia,
    },
  ];

  if (p.perfil === "alumno") {
    // Se enumera evidencia por evidencia, con su día y su estado, para no obligar
    // a nadie a ir al panel de revisión a averiguar cuál falta.
    const suyas = entorno.evidenciasDe(p.folio);
    const problemas = suyas
      .filter((e) => e.estado !== "aprobada")
      .map((e) => {
        if (e.estado === "rechazada")
          return `la del día ${e.dia} fue rechazada (${e.motivoRechazo ?? "sin motivo"})`;
        if (e.estado === "pendiente") return `la del día ${e.dia} sigue pendiente de revisión`;
        return `la del día ${e.dia} no se entregó`;
      });
    requisitos.push({
      texto: `${EVIDENCIAS_REQUERIDAS} evidencias aprobadas de los días en línea`,
      ok: aprobadas >= EVIDENCIAS_REQUERIDAS,
      comoSeResuelve: `Lleva ${aprobadas} de ${EVIDENCIAS_REQUERIDAS} evidencias aprobadas${
        problemas.length ? `; ${problemas.join(" y ")}` : ""
      }.`,
    });
  }

  const faltante = requisitos.find((r) => !r.ok);
  return { requisitos, elegible: !faltante, faltante };
}

/** Elegibilidad para la constancia de TALLER, que es un documento aparte. */
export function elegibilidadTaller(
  entorno: EntornoConstancias,
  p: Participante,
): Elegibilidad | null {
  if (!p.tallerId) return null;
  const estado = entorno.estadoDe(p);
  const dias = entorno.diasTallerDe(p.tallerId);
  const asistidos = dias.filter((d) =>
    entorno.asistenciasDe(p.folio, d).some((a) => a.tipo === "taller"),
  );
  const faltanDias = dias.filter((d) => !asistidos.includes(d));

  const requisitos: Requisito[] = [
    {
      texto: "Pago del taller registrado como pagado",
      ok: estado.taller === "pagado",
      comoSeResuelve: `El pago del taller está en «${estado.taller ?? "sin registrar"}».`,
    },
    {
      texto:
        dias.length === 1
          ? `Asistencia registrada al taller el día ${dias[0]}`
          : `Asistencia registrada al taller los ${dias.length} días (${dias.join(" y ")})`,
      ok: asistidos.length === dias.length && dias.length > 0,
      comoSeResuelve: `Tiene ${asistidos.length} de ${dias.length} días de taller registrados${
        faltanDias.length ? `; falta el día ${faltanDias.join(" y el ")}` : ""
      }.`,
    },
  ];

  const faltante = requisitos.find((r) => !r.ok);
  return { requisitos, elegible: !faltante, faltante };
}

/**
 * ¿Hay que marcar a esta persona por tener el nombre en revisión?
 *
 * Solo cuenta si además hay un caso de soporte abierto o en proceso. El sistema
 * ya no emite documentos, así que este campo no bloquea nada: sirve para que
 * quien elabore las constancias aparte esos casos antes de imprimir un nombre
 * que ya se sabe incorrecto. Por eso la marca viaja también en la exportación.
 * Al cerrar el caso en la bandeja de soporte, la marca desaparece.
 */
export function nombreEnRevisionActivo(p: Participante, casos: CasoSoporte[]) {
  if (!p.nombreEnRevision) return { marcado: false as const };
  const caso = casos.find((c) => c.folio === p.folio && c.estado !== "resuelto");
  if (!caso) return { marcado: false as const };
  return { marcado: true as const, caso };
}

/**
 * Nombre tal como se imprime: MAYÚSCULAS, sin tildes, conservando la Ñ.
 *
 * La Ñ se protege antes de descomponer los acentos, porque en Unicode es una N
 * con tilde y una normalización ingenua la convertiría en N. Un apellido MUÑOZ
 * impreso como MUNOZ en un documento oficial es un error que hay que ir a
 * corregir a mano.
 */
export function nombreConstancia(nombre: string): string {
  // Marcador de uso privado: no aparece en ningún nombre real, así que sirve
  // para apartar la Ñ mientras se quitan los demás acentos.
  const MARCA = "";
  return nombre
    .toUpperCase()
    .replace(/Ñ/g, MARCA)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(new RegExp(MARCA, "g"), "Ñ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Arma el entorno de constancias desde el estado del evento.
 *
 * Lo construían tres pantallas por su cuenta —elegibles, el panel y reportes—
 * con el mismo objeto escrito tres veces, y las tres pasaban las listas
 * completas para que cada participante las recorriera entera. Aquí se agrupan
 * una sola vez y se comparten.
 *
 * Vive junto a la lógica que alimenta, no en el contexto del evento: el
 * contexto no tiene por qué saber qué necesita el cálculo de constancias, y
 * separarlos deja que este cambie sin tocar el estado global.
 */
export function useEntornoConstancias(): EntornoConstancias {
  const { estadoDe, asistenciasDe, evidencias, getTaller } = useEstadoEvento();

  // Se agrupan y ordenan de una pasada, no una vez por participante.
  const porFolio = useMemo(() => {
    const indice = new Map<string, Evidencia[]>();
    for (const e of evidencias) {
      const suyas = indice.get(e.folio);
      if (suyas) suyas.push(e);
      else indice.set(e.folio, [e]);
    }
    for (const suyas of indice.values()) suyas.sort((a, b) => a.dia - b.dia);
    return indice;
  }, [evidencias]);

  return useMemo(
    () => ({
      estadoDe,
      asistenciasDe,
      evidenciasDe: (folio) => porFolio.get(folio) ?? [],
      diasTallerDe: (id) => getTaller(id)?.dias ?? [],
    }),
    [estadoDe, asistenciasDe, porFolio, getTaller],
  );
}
