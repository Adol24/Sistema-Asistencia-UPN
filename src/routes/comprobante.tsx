import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, Info, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { CodigoQR } from "@/components/qr";
import { PerfilBadge } from "@/components/estado-badges";
import { avanceTexto } from "@/mocks/catalogos";
import { moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/comprobante")({
  head: () =>
    meta(
      "Comprobante de pre-registro — XIV Encuentro Internacional de Educación",
      "Resumen de tu pre-registro: folio, perfil, día, lugar, taller y montos por pagar del XIV Encuentro Internacional de Educación.",
    ),
  component: Comprobante,
});

function Comprobante() {
  const { borrador, participante } = usePrototipo();
  const { configuracion: evento, getTaller, infoDia } = useEstadoEvento();
  // Los datos académicos son del alumno: docentes y externos no los tienen.
  const nivel = borrador.nivel ?? participante.nivel;
  const programa = borrador.programa ?? participante.programa;
  const avance = borrador.avance ?? participante.avance;
  const grupo = borrador.grupo ?? participante.grupo;
  const plantel = borrador.plantel ?? participante.plantel;
  const avance_ = avanceTexto(evento.catalogoAcademico, nivel, avance);
  // El folio del pre-registro recién creado, no el del participante de contexto.
  const folio = borrador.folio ?? participante.folio;
  const dia = infoDia(borrador.dia ?? participante.dia);
  const taller = getTaller(borrador.tallerId ?? participante.tallerId);
  const nombre = borrador.nombre ?? participante.nombre;
  const total = evento.cuotaEvento + (taller?.costo ?? 0);

  return (
    <PantallaPublica titulo="Comprobante de pre-registro" volverA="/pago" ancho="lg">
      <div className="rounded-lg border border-estado-pagado/30 bg-estado-pagado-bg p-4 text-estado-pagado">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="size-5" aria-hidden /> Tu pre-registro quedó guardado
        </p>
        <p className="mt-1 text-xs">Descárgalo o guarda esta pantalla: es tu comprobante.</p>
      </div>

      <div className="mt-4 grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-[1fr_auto]">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Nombre</dt>
            <dd className="text-lg font-bold">{nombre}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Folio</dt>
            <dd className="font-mono text-lg font-bold tabular-nums">{folio}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Perfil</dt>
            <dd className="mt-1">
              <PerfilBadge perfil={borrador.perfil ?? participante.perfil} />
            </dd>
          </div>
          {programa ? (
            <div>
              <dt className="text-xs text-muted-foreground">Programa</dt>
              <dd className="font-medium">
                {programa}
                {avance_ ? <span className="text-muted-foreground"> · {avance_}</span> : null}
                {grupo ? <span className="text-muted-foreground"> · Grupo {grupo}</span> : null}
                {plantel ? <span className="text-muted-foreground"> · {plantel}</span> : null}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Día y lugar</dt>
            <dd className="font-medium">
              {dia.etiqueta} — {dia.fecha} · {dia.sede}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Taller</dt>
            <dd className="font-medium">{taller ? taller.nombre : "Sin taller"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total por pagar (en dos depósitos)</dt>
            <dd className="text-lg font-bold tabular-nums">{moneda(total)}</dd>
          </div>
        </dl>
        <div className="justify-self-center">
          <CodigoQR valor={folio} size={148} />
          <p className="mt-2 text-center text-xs text-muted-foreground">Folio para ventanilla</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button
          className="h-12 text-base"
          onClick={() => toast.success("Descargamos tu comprobante en PDF.")}
        >
          <Download className="size-4" /> Descargar comprobante
        </Button>
        <Link
          to="/portal"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-base font-medium transition-colors hover:bg-accent"
        >
          <LayoutList className="size-4" aria-hidden /> Ver mi estado en el portal
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Siguiente paso: haz tus depósitos y entrega los vouchers antes del {evento.fechaLimite}.{" "}
        <Link to="/portal" className="font-semibold text-primary underline">
          Consulta tu estado en el portal
        </Link>
      </p>

      {/*
       * Este bloque existe para evitar una expectativa equivocada, no para
       * informar de más.
       *
       * Hasta aquí el alumno solo se ha pre-registrado, y ninguno de los tres
       * requisitos de constancia depende de eso: dependen de pagar, de asistir y
       * —si es alumno— de que le aprueben las evidencias. El sitio hablaba de
       * «tu constancia» desde el primer paso, así que era razonable terminar el
       * registro creyendo que ya estaba resuelta. Decirlo aquí, y no al final
       * del evento, es lo que deja tiempo de hacer algo al respecto.
       *
       * La lista se redacta a mano en lugar de leerse de `elegibilidad.ts`
       * porque aquí son condiciones generales, no el estado de esta persona:
       * su avance real vive en `/portal/constancia`, que sí las evalúa.
       */}
      <section className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 shrink-0 text-primary" aria-hidden />
          El pre-registro no da derecho a la constancia
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Para aparecer en el listado de elegibles necesitas, además de este registro:
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-primary">
              1.
            </span>
            Tu pago del evento registrado como pagado.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-primary">
              2.
            </span>
            Entrada y salida registradas el día {dia.etiqueta}.
          </li>
          {participante.perfil === "alumno" ? (
            <li className="flex gap-2">
              <span aria-hidden className="text-primary">
                3.
              </span>
              Tus evidencias de los días en línea, aprobadas.
            </li>
          ) : null}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          La universidad elabora el documento con ese listado; el sistema no lo emite. Puedes seguir
          tu avance en el portal.
        </p>
      </section>
    </PantallaPublica>
  );
}
