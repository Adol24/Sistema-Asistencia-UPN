/**
 * El avance contra la meta: cuánta gente hay apuntada para cada día, de la que
 * cabe, y cuánta de esa ya dejó el dinero.
 *
 * Es la pregunta que hace la organización, y hasta ahora no la contestaba
 * ninguna pantalla. El tablero enseñaba los pre-registros por día pero nunca
 * contra cuántos caben; `/admin/padron` sí compara contra el aforo, pero sobre
 * OTRA cosa —el reparto planeado del Excel de Servicios Escolares, no los
 * pre-registros confirmados—, y confundir las dos es fácil porque los números
 * se parecen.
 *
 * Vive aquí y no dentro de una pantalla porque la usan DOS: la tarjeta de
 * `/admin` y el reporte descargable de `/admin/reportes`. Escrita dos veces,
 * la primera vez que alguien corrigiera una de las dos, el panel y el archivo
 * que se entrega empezarían a decir cifras distintas del mismo día.
 *
 * Y vive suelta, sin React, para poder comprobarse sin montar la aplicación:
 * la resta de los exentos es justo el tipo de cuenta que se equivoca en
 * silencio y que nadie nota hasta que alguien persigue a treinta maestros que
 * no deben nada.
 */

import type { Dia, EstadoPago, Participante } from "@/dominio/tipos";
import type { DiaEvento } from "@/lib/configuracion";

/** Cómo va un día del evento. */
export interface AvanceDelDia {
  dia: Dia;
  /** «DÍA 1», tal como lo escribe la configuración. */
  etiqueta: string;
  /** La sede, que no es la misma los tres días. */
  sede: string;
  /**
   * El aforo de esa sede, de `dias_evento.cupo`.
   *
   * Cero significa «sin configurar», no «no caben». Quien lo pinte tiene que
   * distinguirlo: con cero, cualquier porcentaje sale infinito y el primer día
   * de uso el tablero gritaría sobrecupo.
   */
  meta: number;
  /** Pre-registrados de ese día, los tres perfiles juntos. */
  total: number;
  alumnos: number;
  docentes: number;
  externos: number;
  /** Los que ya tienen el depósito confirmado. */
  pagados: number;
  /**
   * Los que no deben nada: hoy, los maestros que eligieron asistir sin
   * constancia.
   *
   * Tienen columna propia porque son un dato —es la gente que va a pasar la
   * puerta sin dejar un peso en la caja— y porque sin separarlos la cuenta de
   * abajo miente.
   */
  exentos: number;
  /**
   * Los que todavía deben: `total − pagados − exentos`.
   *
   * Restar solo los pagados es el error que hay que evitar. Un exento nunca va
   * a aparecer como pagado, así que se quedaría en «faltan» para siempre y el
   * reporte inventaría una morosidad que no existe. Es la misma corrección que
   * el embudo del tablero se hizo el 2026-09-29, cuando apareció la primera
   * audiencia entera de exentos.
   */
  faltan: number;
  /** Qué tanto de la meta se lleva, redondeado. Cero si no hay meta puesta. */
  pct: number;
}

/**
 * El avance de cada día.
 *
 * `estadoEvento` se recibe en vez de derivarse aquí: es la MISMA función que
 * pinta la insignia de una ficha y la que decide el embudo del tablero, y
 * compartirla es lo que impide que este reporte y esa ficha discrepen sobre la
 * misma persona.
 *
 * Los días salen de la configuración y no de `[1, 2, 3]` escrito aquí: si
 * alguna vez el evento tiene dos días o cuatro, esto no hay que tocarlo.
 */
export function avancePorDia(
  dias: DiaEvento[],
  participantes: Participante[],
  estadoEvento: (p: Participante) => EstadoPago,
): AvanceDelDia[] {
  return dias.map((d) => {
    const suyos = participantes.filter((p) => p.dia === d.dia);
    const pagados = suyos.filter((p) => estadoEvento(p) === "pagado").length;
    const exentos = suyos.filter((p) => estadoEvento(p) === "exento").length;
    return {
      dia: d.dia,
      etiqueta: d.etiqueta,
      sede: d.lugar,
      meta: d.cupo,
      total: suyos.length,
      alumnos: suyos.filter((p) => p.perfil === "alumno").length,
      docentes: suyos.filter((p) => p.perfil === "docente").length,
      externos: suyos.filter((p) => p.perfil === "externo").length,
      pagados,
      exentos,
      faltan: suyos.length - pagados - exentos,
      pct: d.cupo > 0 ? Math.round((suyos.length / d.cupo) * 100) : 0,
    };
  });
}

/**
 * La fila de totales.
 *
 * Suma los días en vez de recorrer otra vez a los participantes, y no es por
 * ahorrar: recorrerlos de nuevo dejaría fuera a quien no tenga día asignado en
 * la suma de los días pero DENTRO del gran total, así que el archivo no
 * cuadraría consigo mismo. Lo que suma una columna es lo que está en esa
 * columna.
 *
 * `pct` se recalcula sobre las sumas y no se promedia: promediar tres
 * porcentajes de metas distintas —700, 700 y 600— da un número que no es el
 * porcentaje de nada.
 */
export function totalDelAvance(filas: AvanceDelDia[]): Omit<AvanceDelDia, "dia" | "etiqueta"> {
  const suma = (f: (x: AvanceDelDia) => number) => filas.reduce((n, x) => n + f(x), 0);
  const meta = suma((x) => x.meta);
  const total = suma((x) => x.total);
  return {
    sede: "",
    meta,
    total,
    alumnos: suma((x) => x.alumnos),
    docentes: suma((x) => x.docentes),
    externos: suma((x) => x.externos),
    pagados: suma((x) => x.pagados),
    exentos: suma((x) => x.exentos),
    faltan: suma((x) => x.faltan),
    pct: meta > 0 ? Math.round((total / meta) * 100) : 0,
  };
}
