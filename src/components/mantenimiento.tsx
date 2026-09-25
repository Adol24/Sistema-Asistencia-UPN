import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

import { useSesion } from "@/lib/sesion";
import {
  esRutaDelPersonal,
  faltaParaVolver,
  regresoEnPalabras,
  sigueEnMantenimiento,
} from "@/lib/mantenimiento";

/**
 * Cada cuánto se comprueba la hora.
 *
 * Quince segundos y no un minuto porque la cuenta atrás se muestra en minutos:
 * con un minuto de resolución el número se quedaría hasta sesenta segundos
 * parado, que es mucho tiempo mirando un contador que no baja.
 */
const CADA = 15_000;

/**
 * La puerta.
 *
 * Envuelve a toda la aplicación y decide, antes de montar nada más, si lo que
 * se dibuja es el sistema o el cartel. Va por encima de `EstadoEventoProvider`
 * a propósito: durante el mantenimiento no tiene sentido abrir suscripciones a
 * la base ni cargar el estado del evento para una pantalla que no los usa, y
 * menos si lo que se está arreglando es justamente la base.
 *
 * Deja pasar dos casos: las zonas internas —por dirección, porque ahí vive el
 * formulario de acceso— y a quien ya tiene sesión de personal, que así puede
 * recorrer el flujo público para comprobar que el arreglo funcionó.
 */
export function PuertaDeMantenimiento({ children }: { children: ReactNode }) {
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const { persona } = useSesion();
  const activo = useMantenimientoActivo();

  if (!activo) return <>{children}</>;
  if (persona || esRutaDelPersonal(ruta)) return <>{children}</>;
  return <Mantenimiento />;
}

/**
 * Si el mantenimiento sigue en pie, y se entera solo de cuándo deja de estarlo.
 *
 * El valor inicial se calcula igual en el servidor y en el navegador, así que el
 * HTML que llega y el que React hidrata coinciden. A partir de ahí un intervalo
 * lo apaga en cuanto pasa la hora: quien dejó la pestaña abierta esperando ve
 * volver el sistema sin tener que recargar.
 *
 * Cuando no hay mantenimiento configurado, `sigueEnMantenimiento` es falso
 * desde el principio y el efecto no llega a montar ningún intervalo: fuera de
 * las horas de apagón esto no cuesta nada.
 */
function useMantenimientoActivo(): boolean {
  const [activo, setActivo] = useState(() => sigueEnMantenimiento());

  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => {
      if (!sigueEnMantenimiento()) setActivo(false);
    }, CADA);
    return () => clearInterval(t);
  }, [activo]);

  return activo;
}

/**
 * El cartel.
 *
 * Dice tres cosas y ninguna de más: que no es culpa de quien mira, a qué hora
 * volvemos, y cuánto falta. La hora exacta es lo que evita que alguien recargue
 * cada dos minutos durante toda la tarde.
 */
function Mantenimiento() {
  /*
   * La cuenta atrás empieza vacía y se llena al montar.
   *
   * No es pereza: el servidor calcularía «4 h 12 min» y el navegador, un
   * instante después, «4 h 11 min». Serían dos textos distintos para el mismo
   * nodo y React tiraría la hidratación del árbol entero. La hora de regreso sí
   * se dibuja desde el servidor, porque esa no se mueve.
   */
  const [falta, setFalta] = useState<string | null>(null);

  useEffect(() => {
    const poner = () => setFalta(faltaParaVolver());
    poner();
    const t = setInterval(poner, CADA);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="max-w-md text-center">
        <div
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10"
          aria-hidden
        >
          <Wrench className="size-7 text-primary" />
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-balance text-foreground">
          Estamos en mantenimiento
        </h1>

        <p className="mx-auto mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
          El sistema del Encuentro está fuera de servicio un rato mientras lo ponemos al día. No
          perdiste nada: tu pre-registro, tu pago y tu comprobante siguen guardados y te esperan
          igual que los dejaste.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-foreground">
            Vuelve a intentarlo <span className="font-semibold">{regresoEnPalabras()}</span>.
          </p>
          {/*
           * `aria-live="polite"` para que un lector de pantalla anuncie el
           * cambio sin interrumpir lo que esté leyendo. `min-h` reserva el
           * renglón desde el principio: sin él, la tarjeta pega un salto en
           * cuanto el contador aparece, medio segundo después de cargar.
           */}
          <p className="mt-1 min-h-5 text-xs text-muted-foreground" aria-live="polite">
            {falta ? `Tiempo estimado para volver: ${falta}` : "\u00A0"}
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Volver a intentar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
