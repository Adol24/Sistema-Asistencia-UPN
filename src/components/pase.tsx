import { useEffect, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { pngDelPase } from "@/components/qr";
import { Button } from "@/components/ui/button";

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
    const blob = await pngDelPase(folio, { nombre, evento });
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
