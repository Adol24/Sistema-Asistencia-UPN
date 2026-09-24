import { useEffect, useState } from "react";
import { Clock3, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { pngDelPase } from "@/components/qr";
import { Button } from "@/components/ui/button";

/**
 * El hueco donde irá su código, mientras el pago no esté confirmado.
 *
 * ---------------------------------------------------------------------------
 * El código no se atenúa: no se dibuja.
 * ---------------------------------------------------------------------------
 *
 * Aquí vivía `SelloDelCodigo`, que enseñaba el QR desde el pre-registro con un
 * sello de «todavía no abre la puerta». Aquel arreglo venía de un problema
 * real: el comprobante y el portal pintaban el mismo símbolo y parecían dos
 * códigos distintos, así que se decidió enseñar uno solo y nombrar en voz alta
 * lo único que cambiaba entre pantallas.
 *
 * Resolvió la confusión de los dos códigos y dejó en pie la que importaba. Su
 * propio comentario la nombraba: «gente llegando el día del evento con el
 * comprobante guardado, convencida de que era su pase». Un sello gris debajo
 * de una imagen que el ojo ya clasificó como «mi QR del evento» no compite con
 * la imagen, y `/pago` lo remataba ofreciendo descargarla con el nombre y el
 * escudo a quien todavía estaba leyendo cómo depositar.
 *
 * La regla nueva no admite esa lectura: **hasta que Servicios Financieros
 * confirme el pago, no hay código que enseñar.** Lo que se enseña es el folio,
 * que es lo que de verdad hace falta antes —es la llave del portal y lo que se
 * dice en ventanilla— y que nadie confunde con un boleto.
 *
 * Quién puede verlo lo decide `abreLaPuerta`, en `pagos-logica.ts`, que es la
 * misma línea que traza `fn_evaluar_escaneo` en la base. Esta pieza sigue
 * viviendo aquí, y no escrita a mano en cada pantalla, por la razón de siempre:
 * son tres pantallas que tienen que contar la misma historia.
 */
export function CodigoPendiente({
  folio,
  children,
}: {
  folio: string;
  /** El siguiente paso, que sí es distinto en cada pantalla. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-3 text-center">
      {/*
        El recuadro ocupa el sitio del código y se ve vacío a propósito. Dejar
        el hueco sin marcar haría pensar que la pantalla no cargó; marcarlo con
        un QR de adorno nos devolvería al problema.
      */}
      <div className="mx-auto flex size-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-3">
        <Clock3 className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-pretty text-xs font-semibold leading-snug text-muted-foreground">
          Tu código aparece aquí cuando se confirme tu pago
        </p>
      </div>

      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-estado-pre-bg px-3 py-1 text-xs font-bold text-estado-pre">
        <Clock3 className="size-3.5" aria-hidden />
        Todavía no tienes código
      </span>

      {/*
        La frase invariante, la que tiene que sonar igual en las tres pantallas.
        No se le pasa como prop a propósito: en cuanto una pantalla pueda
        decirlo «a su manera», volvemos a tener tres versiones de un solo hecho.
      */}
      <p className="mx-auto mt-2 max-w-xs text-pretty text-xs text-muted-foreground">
        Mientras tanto, lo que necesitas es tu folio{" "}
        <span className="font-mono font-semibold text-foreground">{folio}</span>: con él te atienden
        en ventanilla y con él entras a tu portal.
      </p>
      {children}
    </div>
  );
}

/**
 * Las dos acciones del pase.
 *
 * Antes eran «Descargar QR» y «Guardar en mi celular», que sonaban distintas y
 * hacían lo mismo: enseñar un aviso. Ni siquiera había un archivo detrás.
 *
 * Ahora se distinguen porque hacen cosas distintas de verdad. Descargar deja el
 * archivo donde el navegador guarda las descargas. Compartir abre el menú del
 * sistema, que en un teléfono es el único camino para dejar la imagen en la
 * galería o mandársela por WhatsApp; solo aparece si el dispositivo puede
 * compartir archivos, en vez de ofrecer un botón que no haría nada.
 *
 * Recibía un `activo` para poder descargar también el folio sin pagar, con el
 * archivo llamado `folio-*.png` en vez de `pase-*.png`. Ya no hay tal caso:
 * antes de confirmarse el pago no hay imagen que llevarse, así que estas
 * acciones solo se dibujan cuando el pase existe y son siempre del pase.
 */
export function AccionesDelPase({
  folio,
  nombre,
  evento,
}: {
  folio: string;
  nombre: string;
  evento: string;
}) {
  const [trabajando, setTrabajando] = useState<"descargar" | "compartir" | null>(null);

  const generar = async () => {
    const blob = await pngDelPase(folio, { nombre, evento, activo: true });
    if (!blob) throw new Error("El navegador no pudo generar la imagen");
    return new File([blob], `pase-${folio}.png`, { type: "image/png" });
  };

  /*
   * Se decide después de montar, no durante el render.
   *
   * El servidor no tiene `navigator`, así que calcularlo en el render daría
   * `false` en el HTML y `true` en el teléfono: React vería dos árboles
   * distintos al hidratar. Empezar en `false` y corregir en el efecto hace que
   * el botón aparezca, y no que parpadee al desaparecer.
   *
   * Se prueba con `canShare` y un archivo de verdad porque hay navegadores con
   * `share` que no aceptan archivos; ahí el botón prometería algo que no puede
   * cumplir.
   */
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  useEffect(() => {
    try {
      setPuedeCompartir(
        !!navigator.canShare?.({ files: [new File([], "x.png", { type: "image/png" })] }),
      );
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  const descargar = async () => {
    setTrabajando("descargar");
    try {
      const archivo = await generar();
      const url = URL.createObjectURL(archivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = archivo.name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Descargamos tu pase.");
    } catch {
      toast.error("No pudimos generar la imagen. Toma una captura de pantalla.");
    } finally {
      setTrabajando(null);
    }
  };

  const compartir = async () => {
    setTrabajando("compartir");
    try {
      const archivo = await generar();
      await navigator.share({ files: [archivo], title: `Pase ${folio}` });
    } catch (e) {
      // Cancelar el menú del sistema no es un fallo y no merece un aviso.
      if ((e as Error)?.name !== "AbortError")
        toast.error("No pudimos compartir la imagen. Prueba con Descargar.");
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <div className={`mt-5 grid gap-2 ${puedeCompartir ? "sm:grid-cols-2" : ""}`}>
      <Button className="h-12 text-base" disabled={!!trabajando} onClick={() => void descargar()}>
        {trabajando === "descargar" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        Descargar pase
      </Button>
      {puedeCompartir ? (
        <Button
          variant="outline"
          className="h-12 text-base"
          disabled={!!trabajando}
          onClick={() => void compartir()}
        >
          {trabajando === "compartir" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="size-4" aria-hidden />
          )}
          Guardar o compartir
        </Button>
      ) : null}
    </div>
  );
}
