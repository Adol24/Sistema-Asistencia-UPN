/**
 * El reloj del evento.
 *
 * Es la parte del contexto que no depende de ninguna otra: solo necesita saber
 * qué fecha tiene cada día del evento. Por eso sale de `estado-evento.tsx` —de
 * donde se lleva setenta líneas— sin arrastrar nada consigo.
 */

import { useCallback, useEffect, useState } from "react";

import type { ConfiguracionEvento } from "@/lib/configuracion";
import type { Dia } from "@/dominio/tipos";

/**
 * @param automatico Sigue la hora real. Se apaga en cuanto alguien mueve el
 *   reloj a mano, para poder enseñar la pantalla a las 13:40 sin que se
 *   corrija sola un segundo después.
 */
export interface RelojEvento {
  dia: Dia;
  /** Minutos desde medianoche. */
  minutos: number;
  automatico: boolean;
}

/** Cada cuánto se pone al día mientras sigue la hora real. */
const CADA = 30_000;

export function useRelojEvento(configuracion: ConfiguracionEvento) {
  /*
   * Arranca en un valor fijo —la hora pico de acceso del día 1— y pasa a la
   * hora real después de montar.
   *
   * Leer `new Date()` durante el render daría una hora en el servidor y otra en
   * el navegador, y React vería dos árboles distintos al hidratar. El valor
   * inicial es el mismo en los dos lados y el efecto de abajo lo corrige.
   */
  const [reloj, setRelojState] = useState<RelojEvento>({
    dia: 1,
    minutos: 8 * 60 + 30,
    automatico: true,
  });

  /*
   * Tocar el reloj a mano lo detiene.
   *
   * Enseñar la pantalla a las 13:40 y que el reloj se lo corrigiera un segundo
   * después sería pelearse con la pantalla. Para volver, `setReloj({
   * automatico: true })`.
   */
  const setReloj = useCallback(
    (r: Partial<RelojEvento>) => setRelojState((prev) => ({ ...prev, automatico: false, ...r })),
    [],
  );

  /*
   * El día del evento que corresponde a hoy, o `null` si hoy no es ninguno.
   *
   * Se compara contra la fecha local, no contra UTC: a las 19:00 en México ya
   * es el día siguiente en UTC, y el monitoreo saltaría al día 2 con la jornada
   * del 1 todavía en marcha.
   */
  const diaDeHoy = useCallback((): Dia | null => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const hoy = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return (configuracion.dias.find((x) => x.fecha.slice(0, 10) === hoy)?.dia as Dia) ?? null;
  }, [configuracion.dias]);

  /*
   * Mientras siga la hora real, se pone al día solo.
   *
   * Cada treinta segundos y no cada minuto porque el ritmo se mide en personas
   * por minuto: con un minuto de resolución el número daría saltos visibles
   * justo cuando alguien lo está mirando.
   *
   * Si hoy no es ninguno de los tres días, el día no se toca: se respeta el que
   * hubiera, que es lo útil para preparar la jornada la víspera.
   */
  useEffect(() => {
    if (!reloj.automatico) return;

    const poner = () => {
      const ahora = new Date();
      const hoy = diaDeHoy();
      setRelojState((prev) =>
        prev.automatico
          ? {
              ...prev,
              minutos: ahora.getHours() * 60 + ahora.getMinutes(),
              ...(hoy ? { dia: hoy } : {}),
            }
          : prev,
      );
    };

    poner();
    const t = setInterval(poner, CADA);
    return () => clearInterval(t);
  }, [reloj.automatico, diaDeHoy]);

  return { reloj, setReloj };
}
