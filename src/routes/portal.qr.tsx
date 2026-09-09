import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Download, Loader2, Maximize2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { CodigoQR, PaseAPantallaCompleta, pngDelPase } from "@/components/qr";
import { usePantallaEncendida } from "@/lib/pantalla-encendida";
import { Button } from "@/components/ui/button";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/portal/qr")({
  head: () =>
    meta(
      "Mi código QR — XIV Encuentro Internacional de Educación",
      "Descarga tu código QR de acceso al XIV Encuentro Internacional de Educación en cuanto Servicios Financieros valide tu pago.",
    ),
  component: MiQr,
});

const faltantesDe = (horas: number): Record<string, string> => ({
  pre_registrado: "Falta que hagas tu depósito y entregues el voucher en Servicios Financieros.",
  comprobante_recibido: `Ya recibimos tu comprobante. Servicios Financieros tarda unas ${horas} horas en validarlo; vuelve a esta pantalla y tu código estará aquí.`,
  discrepancia:
    "El monto depositado no coincide con el esperado. Acude a ventanilla para aclararlo.",
  expirado: "Tu pre-registro venció porque no se recibió el comprobante a tiempo.",
  cancelado: "Tu registro fue cancelado. Contacta a soporte si crees que es un error.",
});

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function MiQr() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <MiQrContenido p={p} />;
}

function MiQrContenido({ p }: { p: Participante }) {
  // La configuración sale del contexto, no del mock: si administración cambia el
  // plazo o la fecha límite, esta pantalla lo refleja sin recargar.
  const { estadoDe, configuracion: evento } = useEstadoEvento();
  const estado = estadoDe(p);
  const pagado = estado.evento === "pagado";
  const faltantes = faltantesDe(evento.horasValidacion);
  const [ampliado, setAmpliado] = useState(false);

  // También en la vista normal: alguien puede enseñar el pase sin ampliarlo.
  usePantallaEncendida(pagado);

  return (
    <PantallaPublica titulo="Mi código QR" volverA="/portal" ancho="lg">
      <PortalNav />
      {pagado ? (
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          {/*
           * Tocar el código lo abre a pantalla completa. Es el gesto que la
           * gente intenta por instinto con cualquier imagen, y aquí resulta ser
           * justo lo que conviene hacer en la puerta.
           */}
          <button
            type="button"
            onClick={() => setAmpliado(true)}
            className="mx-auto flex flex-col items-center gap-2 rounded-lg"
            aria-label="Ver el código a pantalla completa"
          >
            <CodigoQR valor={p.folio} size={320} etiqueta="UPN" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Maximize2 className="size-3.5" aria-hidden />
              Tócalo para mostrarlo en grande
            </span>
          </button>
          <p className="mt-5 text-balance text-lg font-bold leading-snug">{p.nombre}</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-muted-foreground">{p.folio}</p>
          <AccionesDelPase folio={p.folio} nombre={p.nombre} evento={evento.nombre} />
          <p className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-left text-sm">
            <Camera className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Toma una captura de pantalla: en la entrada no necesitas internet para mostrar tu
            código.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Todavía no podemos generar tu código QR.</p>
          <div className="mt-3 flex justify-center">
            <EstadoPagoBadge estado={estado.evento} etiqueta="Evento" />
          </div>
          <p className="mt-4 text-sm font-medium">
            {faltantes[estado.evento] ?? "Consulta tu estado en la línea de tiempo."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Fecha límite de entrega de vouchers: {evento.fechaLimite}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            El código no se envía por correo: se descarga aquí. Esta pantalla es la única que lo
            tiene.
          </p>
          <Link
            to="/portal/estado"
            className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Ver mi línea de tiempo
          </Link>
        </section>
      )}
      {ampliado && pagado ? (
        <PaseAPantallaCompleta
          valor={p.folio}
          nombre={p.nombre}
          onCerrar={() => setAmpliado(false)}
        />
      ) : null}
    </PantallaPublica>
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
function AccionesDelPase({
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
