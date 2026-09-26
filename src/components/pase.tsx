import { useEffect, useState } from "react";
import { Camera, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { CodigoQR, pngDelPase } from "@/components/qr";
import { Button } from "@/components/ui/button";

/**
 * Su código antes del pago, rotulado para lo único que sirve todavía: que en la
 * ventanilla lo lean con la cámara en vez de que dicte su folio.
 *
 * ---------------------------------------------------------------------------
 * Por qué vuelve el código al pre-registro
 * ---------------------------------------------------------------------------
 *
 * Aquí hubo un hueco punteado —«tu código aparece aquí cuando se confirme tu
 * pago»— y antes de eso un QR con un sello de «todavía no abre la puerta». Las
 * dos versiones peleaban el mismo riesgo: que el papel del pre-registro se
 * leyera como un boleto y su dueño llegara con él a la puerta el día del evento.
 *
 * El hueco resolvía ese riesgo creando otro, y este se cuenta con números. Son
 * cerca de dos mil alumnos entregando voucher en una fila, y sin código cada uno
 * dicta su folio a quien cobra: un dato de doce caracteres, leído en voz alta,
 * en una ventanilla con ruido. `/financieros` ya tiene la cámara montada y la
 * ficha que abre al leer un folio —solo faltaba que el alumno tuviera algo que
 * enseñarle—.
 *
 * Lo que hace seguro dibujarlo es que **el riesgo de la puerta no depende de
 * esta imagen.** Quien llegue el día del evento con este código sin pago
 * confirmado sale en rojo en el torniquete: lo decide `fn_evaluar_escaneo` en la
 * base, no lo que el alumno crea que tiene en la mano. La pantalla de antes
 * intentaba impedir con un hueco algo que la base ya impide con una regla.
 *
 * Lo que sí sigue en pie de aquella decisión es **no anunciarlo como el pase**.
 * El rótulo habla de su pago y nada más: ni «entrada», ni «acceso», ni que este
 * mismo símbolo será el que abra la puerta cuando le confirmen el depósito. Eso
 * lo sabrá cuando llegue a `/portal/qr` y su código esté ahí con sus acciones.
 *
 * Vive aquí, y no escrita a mano en cada pantalla, por la razón de siempre: son
 * tres pantallas que tienen que contar la misma historia.
 */
export function CodigoParaPagar({
  folio,
  lugar,
  children,
}: {
  folio: string;
  /**
   * Dónde se entrega, de `configuracion_evento.ventanilla_lugar`. El respaldo es
   * «ventanilla» y no un nombre: sin dato configurado, una palabra genérica es
   * mejor que un departamento que quizá ya no recibe a nadie.
   */
  lugar?: string;
  /** El siguiente paso, que sí es distinto en cada pantalla. */
  children?: React.ReactNode;
}) {
  const donde = lugar?.trim() || "ventanilla";
  const [descargando, setDescargando] = useState(false);

  /*
   * Descargar el código, y solo descargar.
   *
   * No hay botón de compartir como en el pase. Compartir abre el menú del
   * sistema, que es el camino para dejar una imagen en WhatsApp, y este archivo
   * no está hecho para viajar entre personas: es el folio de UNA, y en la fila
   * del pago sirve a quien lo trae. La captura de pantalla —la leyenda de
   * abajo— cubre el caso de guardarlo sin pasar por la carpeta de descargas.
   */
  const descargar = async () => {
    setDescargando(true);
    try {
      const { pngDelCodigoDePago } = await import("@/components/qr");
      const blob = await pngDelCodigoDePago(folio, { lugar: donde });
      if (!blob) throw new Error("El navegador no pudo generar la imagen");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // El nombre importa: `pase-*.png` es el otro archivo, el que sí abre la
      // puerta. Dos imágenes del mismo folio en la misma galería tienen que
      // poder distinguirse por el nombre, sin abrirlas.
      a.download = `codigo-pago-${folio}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Descargamos tu código.");
    } catch {
      toast.error("No pudimos generar la imagen. Toma una captura de pantalla.");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="mt-3 text-center">
      {/*
        Sin etiqueta en el centro, y no es un olvido: el hueco con «UPN» es lo que
        convierte al símbolo en una credencial a los ojos de quien lo mira. Ese
        remate se lo queda el pase de verdad, en el portal, una vez pagado.
      */}
      <div className="mx-auto w-fit rounded-lg border border-border bg-card p-3">
        <CodigoQR valor={folio} size={176} />
      </div>

      <p className="mt-3 text-sm font-bold">Código para tu pago</p>

      {/*
        La frase invariante, la que tiene que sonar igual en las tres pantallas.
        No se le pasa como prop a propósito: en cuanto una pantalla pueda decirlo
        «a su manera», volvemos a tener tres versiones de un solo hecho.
      */}
      <p className="mx-auto mt-1 max-w-xs text-pretty text-xs text-muted-foreground">
        Muéstralo en {donde} cuando entregues tu voucher: con él te atienden sin dictar tu folio.
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
        Folio <span className="font-mono font-semibold text-foreground">{folio}</span>
      </p>

      {/*
        Las dos formas de conservarlo, y la leyenda va PRIMERO a propósito.
        ------------------------------------------------------------------
        La captura de pantalla es la que de verdad usa la gente, no necesita
        permisos ni carpeta de descargas, y es la única que funciona igual en
        cualquier teléfono. El botón está debajo para quien prefiera el archivo.

        `print:hidden` porque esto se imprime desde el comprobante: un botón en
        papel es tinta gastada, y la frase sobre la captura no le dice nada a
        quien ya tiene la hoja en la mano.
      */}
      <p className="mx-auto mt-3 flex max-w-xs items-start gap-2 rounded-md bg-muted p-2.5 text-left text-xs print:hidden">
        <Camera className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Toma una captura de pantalla: en la fila no necesitas internet para mostrar tu código.
      </p>

      <div className="mt-2 flex justify-center print:hidden">
        <Button
          variant="outline"
          className="h-11"
          disabled={descargando}
          onClick={() => void descargar()}
        >
          {descargando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Descargar mi código
        </Button>
      </div>
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
 * archivo llamado `folio-*.png` en vez de `pase-*.png`. Ese parámetro ya no
 * hace falta, y no porque antes de pagar no haya nada que llevarse: hay
 * `codigo-pago-*.png`, que lo genera `CodigoParaPagar` con su propio botón. Son
 * dos archivos distintos para dos cosas distintas, así que estas acciones solo
 * se dibujan cuando el pase existe y son siempre del pase.
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
