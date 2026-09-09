import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Circle, Clock3, Dot } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PortalNav } from "@/components/portal-nav";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";

import { avanceTexto } from "@/dominio/catalogos";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { EstadoPago } from "@/dominio/tipos";

export const Route = createFileRoute("/portal/estado")({
  head: () =>
    meta(
      "Estado de mi registro — XIV Encuentro Internacional de Educación",
      "Línea de tiempo de tu registro: pre-registrado, comprobante recibido, pagado y QR generado.",
    ),
  component: EstadoPortal,
});

const nodos = ["Pre-registrado", "Comprobante recibido", "Pagado", "QR disponible"];

const indiceDe = (estado: EstadoPago) =>
  estado === "pagado" ? 3 : estado === "comprobante_recibido" ? 1 : 0;

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function EstadoPortal() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <EstadoPortalContenido p={p} />;
}

function EstadoPortalContenido({ p }: { p: Participante }) {
  const {
    estadoDe,
    configuracion: evento,
    infoDia,
    avisosDe,
    descartarAvisos,
    getTaller,
  } = useEstadoEvento();
  const estado = estadoDe(p);
  const dia = infoDia(p.dia);
  const taller = getTaller(p.tallerId);
  const avance = avanceTexto(evento.catalogoAcademico, p.nivel, p.avance);
  const avisos = avisosDe(p.folio);
  const actual = indiceDe(estado.evento);

  return (
    <PantallaPublica volverA="/portal" ancho="lg">
      <PortalNav />

      {avisos.length > 0 ? (
        <Alert className="mb-4 border-estado-discrepancia/40 bg-estado-discrepancia-bg">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {avisos.length === 1 ? "Un cambio en tu registro" : "Cambios en tu registro"}
          </AlertTitle>
          <AlertDescription className="grid gap-2">
            <ul className="grid gap-2">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/talleres"
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Elegir otro taller
              </Link>
              <button
                type="button"
                onClick={() => descartarAvisos(p.folio)}
                className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Ya lo vi
              </button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">{p.nombre}</h1>
            <p className="font-mono text-sm text-muted-foreground">{p.folio}</p>
          </div>
          <PerfilBadge perfil={p.perfil} />
        </div>

        <div className="mt-6 overflow-x-auto">
          <ol className="flex min-w-[34rem] items-start">
            {nodos.map((n, i) => {
              const completado = i < actual;
              const esActual = i === actual;
              return (
                <li key={n} className="flex flex-1 flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <span
                      className={cn(
                        "h-1 flex-1",
                        i === 0
                          ? "bg-transparent"
                          : completado || esActual
                            ? "bg-primary"
                            : "bg-border",
                      )}
                    />
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                        completado && "border-estado-pagado bg-estado-pagado text-white",
                        esActual && "border-primary bg-primary text-primary-foreground",
                        !completado && !esActual && "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {completado ? (
                        <Check className="size-4" />
                      ) : esActual ? (
                        <Dot className="size-6" />
                      ) : (
                        <Circle className="size-3" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "h-1 flex-1",
                        i === nodos.length - 1
                          ? "bg-transparent"
                          : completado
                            ? "bg-primary"
                            : "bg-border",
                      )}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 px-1 text-xs",
                      esActual ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {n}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {completado ? "Completado" : esActual ? "Actual" : "Pendiente"}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {estado.evento === "comprobante_recibido" ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Servicios Financieros tarda unas{" "}
              <span className="font-semibold">{evento.horasValidacion} horas</span> en validar tu
              voucher. Cuando termine, tu código QR aparece en{" "}
              <Link to="/portal/qr" className="font-semibold text-primary underline">
                Mi código QR
              </Link>
              . No te lo enviamos por correo: lo descargas tú.
            </span>
          </p>
        ) : null}
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pago del evento</p>
          <div className="mt-2">
            <EstadoPagoBadge estado={estado.evento} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pago del taller</p>
          <div className="mt-2">
            {estado.taller ? (
              <EstadoPagoBadge estado={estado.taller} />
            ) : (
              <span className="text-sm text-muted-foreground">Sin taller seleccionado</span>
            )}
          </div>
          {taller ? <p className="mt-2 text-xs text-muted-foreground">{taller.nombre}</p> : null}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 sm:col-span-2">
          <p className="text-xs text-muted-foreground">Tu asistencia presencial</p>
          <p className="mt-1 text-sm font-semibold">
            {dia.etiqueta} — {dia.fecha} · {dia.lugar}
          </p>
        </div>
        {p.programa ? (
          <div className="rounded-lg border border-border bg-card p-4 sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Tus datos escolares, según Servicios Escolares
            </p>
            <p className="mt-1 text-sm font-semibold">
              {p.programa}
              {avance ? ` · ${avance}` : ""}
              {p.grupo ? ` · Grupo ${p.grupo}` : ""}
            </p>
            {p.plantel ? <p className="text-sm text-muted-foreground">{p.plantel}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Si algo aquí está mal, escríbenos: se corrige con Servicios Escolares, no desde el
              portal.
            </p>
          </div>
        ) : null}
      </section>

      {p.nombreEnRevision ? (
        <div className="mt-4 rounded-lg border border-estado-discrepancia/40 bg-estado-discrepancia-bg p-4 text-sm text-estado-discrepancia">
          Tu nombre está en revisión. Tu registro avanza normalmente: soporte se pondrá en contacto
          contigo para corregirlo, y mientras tanto tu caso queda señalado para que tu documento no
          se elabore con el nombre equivocado.
        </div>
      ) : null}
    </PantallaPublica>
  );
}
