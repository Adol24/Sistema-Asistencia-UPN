import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { CodigoQR, PaseAPantallaCompleta } from "@/components/qr";
import { AccionesDelPase } from "@/components/pase";
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
