import { useEffect, useState } from "react";
import { CircleCheck, Clock3, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { pngDelPase } from "@/components/qr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Qué significa el código del folio ahora mismo.
 *
 * ---------------------------------------------------------------------------
 * El alumno tiene UN código, no dos. El sistema le enseñaba dos.
 * ---------------------------------------------------------------------------
 *
 * El comprobante del pre-registro pinta el folio en un QR, y el portal pinta
 * otro QR en cuanto el pago se valida. Son **el mismo símbolo con el mismo
 * contenido**: los dos codifican el folio y nada más. Lo único que los
 * distinguía era el tamaño y la sigla del centro.
 *
 * Eso bastaba para hacer creer que existían dos códigos distintos, y el portal
 * lo remataba diciéndole a quien todavía no había pagado que «esta pantalla es
 * la única que lo tiene», que era falso: ya se lo habíamos dado en el
 * comprobante. De ahí salía el miedo razonable de que el primero sirviera para
 * colarse sin pagar —no sirve; la puerta consulta el pago en la base y devuelve
 * rojo— y salía también algo que sí iba a pasar: gente llegando el día del
 * evento con el comprobante guardado, convencida de que era su pase.
 *
 * El arreglo no es dibujarlos distintos. `qr.tsx` ya decidió lo contrario y por
 * buenas razones: «dos códigos distintos para el mismo folio hacen dudar de si
 * son el mismo, y esa duda en la fila de una entrada pesa más». El arreglo es
 * dejar de fingir que son dos y decir en voz alta lo único que cambia entre un
 * sitio y el otro, que es **si ya deja entrar**.
 *
 * Por eso esta pieza vive aquí y no escrita a mano en cada pantalla: son dos
 * pantallas que tienen que contar la misma historia, y si cada una la redacta
 * por su cuenta vuelven a divergir.
 */
export function SelloDelCodigo({
  activo,
  children,
}: {
  activo: boolean;
  /** El siguiente paso, que sí es distinto en cada pantalla. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-3 text-center">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
          activo ? "bg-estado-pagado-bg text-estado-pagado" : "bg-estado-pre-bg text-estado-pre",
        )}
      >
        {activo ? (
          <CircleCheck className="size-3.5" aria-hidden />
        ) : (
          <Clock3 className="size-3.5" aria-hidden />
        )}
        {activo ? "Ya abre la puerta" : "Todavía no abre la puerta"}
      </span>
      {/*
        La frase invariante, la que tiene que sonar igual en los dos sitios. No
        se le pasa como prop a propósito: en cuanto una pantalla pueda decirlo
        «a su manera», volvemos a tener dos versiones de un solo hecho.
      */}
      <p className="mx-auto mt-2 max-w-xs text-pretty text-xs text-muted-foreground">
        Tu folio tiene un solo código. Este mismo te atiende en ventanilla y te abre la puerta en
        cuanto Servicios Financieros valide tu pago.
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
 */
export function AccionesDelPase({
  folio,
  nombre,
  evento,
  activo,
}: {
  folio: string;
  nombre: string;
  evento: string;
  /**
   * Si el código ya abre la puerta. Cambia el sello de la imagen, el nombre del
   * archivo y cómo se llama la acción.
   *
   * El nombre del archivo importa tanto como el dibujo: `pase-PRE-00847.png` y
   * `folio-PRE-00847.png` se distinguen en la lista de descargas, que es donde
   * se busca meses después y donde no se ve ninguna imagen.
   */
  activo: boolean;
}) {
  const [trabajando, setTrabajando] = useState<"descargar" | "compartir" | null>(null);
  const que = activo ? "pase" : "folio";

  const generar = async () => {
    const blob = await pngDelPase(folio, { nombre, evento, activo });
    if (!blob) throw new Error("El navegador no pudo generar la imagen");
    return new File([blob], `${que}-${folio}.png`, { type: "image/png" });
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
      toast.success(activo ? "Descargamos tu pase." : "Descargamos tu folio.");
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
      await navigator.share({ files: [archivo], title: `${activo ? "Pase" : "Folio"} ${folio}` });
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
        {activo ? "Descargar pase" : "Descargar mi folio"}
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
