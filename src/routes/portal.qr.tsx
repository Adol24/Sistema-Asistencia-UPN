import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Camera, Maximize2 } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { CodigoQR, PaseAPantallaCompleta } from "@/components/qr";
import { AccionesDelPase, CodigoPendiente } from "@/components/pase";
import { usePantallaEncendida } from "@/lib/pantalla-encendida";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { fechaLimiteTexto } from "@/lib/formato";
import { abreLaPuerta } from "@/lib/pagos-logica";

export const Route = createFileRoute("/portal/qr")({
  head: () =>
    meta(
      "Mi código QR — XIV Encuentro Internacional de Educación",
      "Tu código de entrada al XIV Encuentro Internacional de Educación. Aparece aquí en cuanto Servicios Financieros confirme tu pago.",
    ),
  component: MiQr,
});

const faltantesDe = (horas: number): Record<string, string> => ({
  pre_registrado: "Falta que hagas tu depósito y entregues el voucher en Servicios Financieros.",
  comprobante_recibido: `Ya recibimos tu comprobante. Servicios Financieros tarda unas ${horas} horas en validarlo; vuelve a esta pantalla y tu código estará aquí.`,
  // `discrepancia` ya NO está en este mapa: esa persona tiene código —la puerta
  // la admite— así que nunca llega a esta rama. Su aviso se da junto al código,
  // que es donde le sirve. Ver `abreLaPuerta`.
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
  /*
   * Quién tiene código, y no se decide aquí.
   *
   * Era `estado.evento === "pagado"`, escrito a mano, y esta pantalla no era la
   * única: `/pago` tenía su propia versión y `/comprobante` daba por hecho que
   * nunca. Ahora las tres preguntan a `abreLaPuerta`, que es la misma línea que
   * `fn_evaluar_escaneo` traza en la base.
   *
   * El cambio de fondo es que `discrepancia` entra aquí. Antes caía en la rama
   * de «todavía no» y se le enseñaba el código atenuado; pero a esa persona el
   * torniquete SÍ la admite —depositó, por un importe que no cuadra— así que
   * dejarla sin código que escanear la mandaba a mesa de incidencias por una
   * puerta que le estaba abierta.
   */
  const tieneCodigo = abreLaPuerta(estado.evento);
  const faltantes = faltantesDe(evento.horasValidacion);
  const [ampliado, setAmpliado] = useState(false);

  // También en la vista normal: alguien puede enseñar el pase sin ampliarlo.
  usePantallaEncendida(tieneCodigo);

  return (
    <PantallaPublica titulo="Mi código QR" ancho="lg">
      <PortalNav />
      {/*
        Sin pago confirmado no hay código, y no se dibuja uno atenuado.
        ------------------------------------------------------------------
        Esta pantalla pasó por las dos versiones equivocadas. Primero enseñaba
        el QR solo al pagar pero decía «esta pantalla es la única que lo tiene»,
        cuando el comprobante ya lo había pintado: de ahí salían los dos
        códigos que nadie sabía distinguir. Luego lo enseñó siempre, atenuado y
        con un sello, para dejar de fingir que eran dos.

        Las dos dejaban en pie el mismo riesgo: una imagen que el ojo clasifica
        como «mi QR del evento», en manos de quien no ha pagado, termina en la
        puerta el día del evento. El sello gris no compite con la imagen.

        Ahora el código existe cuando el pago está confirmado y antes no. Lo que
        se enseña mientras tanto es el folio, que es lo que de verdad sirve
        antes: abre el portal y es lo que se dice en ventanilla.
      */}
      <section className="rounded-lg border border-border bg-card p-6 text-center">
        {tieneCodigo ? (
          <>
            {/*
             * Tocar el código lo abre a pantalla completa. Es el gesto que la
             * gente intenta por instinto con cualquier imagen, y aquí resulta
             * ser justo lo que conviene hacer en la puerta.
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

            {/*
             * La discrepancia se dice AQUÍ, junto al código que sí funciona.
             *
             * Antes esta persona caía en la otra rama y leía «acude a ventanilla
             * para aclararlo» en lugar de un pase. Ahora tiene su código —la
             * puerta la admite— y lo que necesita saber es que aun así le falta
             * un trámite. Callarlo aquí sería dejar que se enterara en la fila.
             */}
            {estado.evento === "discrepancia" ? (
              <p className="mt-4 flex items-start gap-2 rounded-md border border-estado-discrepancia/40 bg-estado-discrepancia-bg p-3 text-left text-sm text-estado-discrepancia">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Tu código ya abre la puerta, pero el monto depositado no coincide con el esperado.
                Pasa a Servicios Financieros a aclararlo.
              </p>
            ) : null}

            <AccionesDelPase folio={p.folio} nombre={p.nombre} evento={evento.nombre} />
            <p className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-left text-sm">
              <Camera className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Toma una captura de pantalla: en la entrada no necesitas internet para mostrar tu
              código.
            </p>
          </>
        ) : (
          <>
            <p className="text-balance text-lg font-bold leading-snug">{p.nombre}</p>

            <CodigoPendiente folio={p.folio} />

            <div className="mt-5 flex justify-center">
              <EstadoPagoBadge estado={estado.evento} etiqueta="Evento" />
            </div>
            <p className="mt-3 text-sm font-medium">
              {faltantes[estado.evento] ?? "Consulta tu estado en la línea de tiempo."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Fecha límite de entrega de vouchers: {fechaLimiteTexto(evento.fechaLimite)}
            </p>
            <Link
              to="/portal/estado"
              className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Ver mi línea de tiempo
            </Link>
          </>
        )}
      </section>
      {ampliado && tieneCodigo ? (
        <PaseAPantallaCompleta
          valor={p.folio}
          nombre={p.nombre}
          onCerrar={() => setAmpliado(false)}
        />
      ) : null}
    </PantallaPublica>
  );
}
