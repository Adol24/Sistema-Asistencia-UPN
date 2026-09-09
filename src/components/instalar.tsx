import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** El evento que Chrome dispara cuando la aplicación se puede instalar. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OCULTO = "encuentro:instalar-oculto";

/**
 * Registra el trabajador de servicio y ofrece instalar la aplicación.
 *
 * Instalarla importa más de lo que parece para quien la usa de pie: se abre sin
 * la barra del navegador —que en un teléfono se come un dedo de altura—, queda
 * en la pantalla de inicio en vez de perdida entre pestañas, y arranca aunque la
 * red esté intermitente.
 *
 * Los dos sistemas se comportan distinto y no se puede tratar igual:
 *
 * - **Android y escritorio** avisan con `beforeinstallprompt`, y ahí el
 *   navegador instala con un toque. Se guarda el evento porque solo se dispara
 *   una vez y hay que poder usarlo cuando la persona decida.
 * - **iOS no tiene nada de eso.** Safari solo instala desde «Compartir → Añadir
 *   a inicio», así que lo único honesto es explicar ese camino con sus palabras
 *   en vez de fingir un botón que no existe.
 *
 * Si alguien lo cierra, no se vuelve a ofrecer: un aviso que reaparece en cada
 * visita deja de leerse y pasa a estorbar.
 */
export function AvisoInstalar() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [enIOS, setEnIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Ya instalada: no hay nada que ofrecer.
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (instalada || localStorage.getItem(OCULTO)) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setEnIOS(ios);
    if (ios) setVisible(true);

    const alPoder = (e: Event) => {
      // Se evita el aviso propio del navegador para ofrecerlo donde se entiende,
      // dentro de la página y con una explicación.
      e.preventDefault();
      setEvento(e as EventoInstalar);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", alPoder);
    return () => window.removeEventListener("beforeinstallprompt", alPoder);
  }, []);

  const cerrar = () => {
    setVisible(false);
    localStorage.setItem(OCULTO, "1");
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-lg border border-border bg-card p-4 shadow-lg pb-seguro print:hidden">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instala el Encuentro en tu teléfono</p>
          {enIOS ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Toca <Share className="inline size-3.5 align-text-bottom" aria-label="Compartir" />{" "}
              abajo y elige «Añadir a pantalla de inicio».
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Se abre a pantalla completa y funciona aunque la red falle.
            </p>
          )}
        </div>
        <button
          onClick={cerrar}
          aria-label="Ahora no"
          className="-m-2 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {evento ? (
        <Button
          className="mt-3 h-11 w-full"
          onClick={() => {
            void evento.prompt().then(() => {
              setVisible(false);
              setEvento(null);
            });
          }}
        >
          Instalar
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Pone el trabajador de servicio en marcha.
 *
 * Va aparte del aviso porque no dependen el uno del otro: el trabajador tiene
 * que registrarse aunque nadie instale nada, ya que es lo que permite abrir la
 * aplicación sin red.
 */
// El aviso y el registro comparten el mismo asunto —que la aplicación se pueda
// instalar y abrir sin red—, así que separarlos en dos archivos por una regla de
// recarga en caliente costaría más de lo que ahorra.
// eslint-disable-next-line react-refresh/only-export-components
export function useTrabajadorDeServicio(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return; // en desarrollo estorba: sirve archivos viejos
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin trabajador la aplicación funciona igual, solo que sin modo sin red.
    });
  }, []);
}
