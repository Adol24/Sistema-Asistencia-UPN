import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, MapPin } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";

import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/mi-dia")({
  head: () =>
    meta(
      "Tu día y lugar — XIV Encuentro Internacional de Educación",
      "Consulta el día, el lugar y el horario de registro asignados para tu asistencia presencial al XIV Encuentro Internacional de Educación.",
    ),
  component: MiDia,
});

function MiDia() {
  const navigate = useNavigate();
  const { borrador, participante } = usePrototipo();
  const { configuracion: evento, infoDia } = useEstadoEvento();
  const dia = infoDia(borrador.dia ?? participante.dia);

  return (
    <PantallaPublica
      titulo="Tu día y sede"
      descripcion="Tu asistencia presencial ya está asignada. No es posible cambiar de día."
      volverA="/confirmar-nombre"
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="bg-primary px-5 py-5 text-primary-foreground">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
            Tu asistencia presencial es
          </p>
          <p className="mt-2 text-balance text-2xl font-extrabold leading-tight">
            {dia.etiqueta} — {dia.fecha}
          </p>
        </div>
        {/* `gap-4` y no `gap-3`: son datos distintos, no una lista continua. */}
        <dl className="grid gap-4 p-5 text-sm">
          <div className="flex items-center gap-3">
            <MapPin className="size-5 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Lugar</dt>
              <dd className="text-muted-foreground">{dia.sede}</dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="size-5 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Registro de entrada</dt>
              <dd className="text-muted-foreground">{evento.registroEntrada}</dd>
            </div>
          </div>
          {/*
           * El registro de salida NO se muestra al alumno: no tiene hora fija
           * —depende de cuánto se alarguen las ponencias— y anunciar un rango
           * que no se cumple hace que la gente se vaya antes de tiempo. El dato
           * sigue existiendo en la configuración y lo ve el personal de captura,
           * que es quien lo necesita para operar la puerta.
           */}
        </dl>
      </div>

      <Button className="mt-6 h-12 w-full text-base" onClick={() => navigate({ to: "/talleres" })}>
        Continuar a talleres
      </Button>
    </PantallaPublica>
  );
}
