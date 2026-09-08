import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { QrFalso } from "@/components/qr-falso";
import { Button } from "@/components/ui/button";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { usePrototipo } from "@/lib/prototipo";
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

function MiQr() {
  const { participante: p } = usePrototipo();
  // La configuración sale del contexto, no del mock: si administración cambia el
  // plazo o la fecha límite, esta pantalla lo refleja sin recargar.
  const { estadoDe, configuracion: evento } = useEstadoEvento();
  const estado = estadoDe(p);
  const pagado = estado.evento === "pagado";
  const faltantes = faltantesDe(evento.horasValidacion);

  return (
    <PantallaPublica titulo="Mi código QR" volverA="/portal" ancho="lg">
      <PortalNav />
      {pagado ? (
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <div className="flex justify-center">
            <QrFalso valor={p.folio} size={320} />
          </div>
          <p className="mt-5 text-balance text-lg font-bold leading-snug">{p.nombre}</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-muted-foreground">{p.folio}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button
              className="h-12 text-base"
              onClick={() => toast.success("Descargamos tu código QR.")}
            >
              <Download className="size-4" /> Descargar QR
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base"
              onClick={() => toast.success("Guardamos tu QR en el dispositivo.")}
            >
              <Save className="size-4" /> Guardar en mi celular
            </Button>
          </div>
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
    </PantallaPublica>
  );
}
