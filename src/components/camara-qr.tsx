import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * La cámara del capturista, leyendo códigos de verdad.
 *
 * Antes había aquí un rectángulo con un icono y el rótulo «Cámara simulada»: no
 * abría la cámara ni leía nada, y la única forma de capturar era teclear el
 * folio a mano. En una puerta con fila, eso es la diferencia entre tres segundos
 * y treinta por persona.
 *
 * Decisiones que vienen de cómo se usa esto, de pie y con una mano:
 *
 * - **Cámara trasera** (`environment`). La frontal apunta a la cara del
 *   capturista, no al teléfono del participante.
 * - **No se detiene tras leer.** El escáner sigue vivo y quien captura solo
 *   mueve el aparato al siguiente. Reabrir la cámara por cada persona añade un
 *   segundo largo que se paga en cada uno de los cientos que pasan.
 * - **Antirrebote propio.** El lector dispara varias veces sobre el mismo código
 *   mientras esté encuadrado; sin esto, una persona quieta genera una ráfaga de
 *   escaneos del mismo folio.
 * - **La cámara se apaga al salir de la pantalla.** Un teléfono con la cámara
 *   encendida en segundo plano se calienta y gasta batería durante una jornada
 *   de ocho horas.
 */
export function CamaraQR({
  onLeer,
  activa = true,
  children,
}: {
  onLeer: (valor: string) => void;
  /** Se apaga mientras hay un resultado en pantalla, para no leer de nuevo. */
  activa?: boolean;
  children?: React.ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const escaner = useRef<{ start: () => Promise<void>; stop: () => void; destroy: () => void }>(
    null,
  );
  const ultimo = useRef<{ valor: string; en: number }>({ valor: "", en: 0 });
  const [estado, setEstado] = useState<"iniciando" | "lista" | "sin-permiso" | "sin-camara">(
    "iniciando",
  );

  // El manejador va en una referencia para no reiniciar la cámara cada vez que
  // el componente padre se vuelve a dibujar, que en esta pantalla es constante.
  const alLeer = useRef(onLeer);
  alLeer.current = onLeer;

  const iniciar = useCallback(async () => {
    if (!video.current) return;
    try {
      const { default: QrScanner } = await import("qr-scanner");
      if (!(await QrScanner.hasCamera())) return setEstado("sin-camara");

      const s = new QrScanner(
        video.current,
        (r) => {
          const valor = r.data.trim();
          const ahora = Date.now();
          // Cinco segundos sobre el MISMO código. Eran dos, y con la cámara ya
          // sin detenerse entre personas eso alcanzaba para releer al que
          // todavía no se ha apartado de la puerta: su segundo escaneo cae
          // dentro de la ventana de reingreso, sale amarillo y detiene la fila
          // para avisar de algo que no le importa a nadie. A un código distinto
          // —la siguiente persona— responde al instante, que es lo que cuenta.
          if (valor === ultimo.current.valor && ahora - ultimo.current.en < 5000) return;
          ultimo.current = { valor, en: ahora };
          alLeer.current(valor);
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
        },
      );
      escaner.current = s;
      await s.start();
      setEstado("lista");
    } catch {
      // Lo habitual es que la persona haya negado el permiso, o que el navegador
      // exija HTTPS. Se distingue del «no hay cámara» porque tiene arreglo.
      setEstado("sin-permiso");
    }
  }, []);

  useEffect(() => {
    void iniciar();
    return () => {
      escaner.current?.destroy();
      escaner.current = null;
    };
  }, [iniciar]);

  useEffect(() => {
    if (estado !== "lista") return;
    if (activa) void escaner.current?.start();
    else escaner.current?.stop();
  }, [activa, estado]);

  return (
    <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-lg bg-foreground/90">
      <video ref={video} className="size-full object-cover" muted playsInline />

      {estado !== "lista" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          {estado === "iniciando" ? (
            <>
              <Loader2 className="size-8 animate-spin text-background/80" aria-hidden />
              <p className="text-xs text-background/90">Abriendo la cámara…</p>
            </>
          ) : (
            <>
              <CameraOff className="size-8 text-background/80" aria-hidden />
              <p className="text-sm font-semibold text-background">
                {estado === "sin-camara"
                  ? "Este aparato no tiene cámara"
                  : "Sin acceso a la cámara"}
              </p>
              <p className="text-xs text-background/80">
                {estado === "sin-camara"
                  ? "Captura el folio a mano con el campo de abajo."
                  : "Permite el acceso en el navegador, o captura el folio a mano."}
              </p>
              {estado === "sin-permiso" ? (
                <Button size="sm" variant="secondary" onClick={() => void iniciar()}>
                  Reintentar
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <ScanLine
          className="pointer-events-none absolute left-1/2 top-3 size-5 -translate-x-1/2 text-background/70"
          aria-hidden
        />
      )}

      {children}
    </div>
  );
}
