import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";

import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/mi-dia")({
  head: () =>
    meta(
      "Tu día y sede — XIV Encuentro Internacional de Educación",
      "Consulta el día, la sede y el horario de registro asignados para tu asistencia presencial al XIV Encuentro Internacional de Educación.",
    ),
  component: MiDia,
});

function MiDia() {
  const navigate = useNavigate();
  const { borrador, participante } = usePrototipo();
  const { configuracion: evento, infoDia } = useEstadoEvento();
  const dia = infoDia(borrador.dia ?? participante.dia);

  return (
    <PantallaPublica titulo="Tu día y sede" volverA="/confirmar-nombre">
      <p className="text-sm text-muted-foreground">
        Tu asistencia presencial ya está asignada. No es posible cambiar de día.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="bg-primary px-5 py-4 text-primary-foreground">
          <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/70">
            Tu asistencia presencial es
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {dia.etiqueta} — {dia.fecha}
          </p>
        </div>
        <dl className="grid gap-3 p-5 text-sm">
          <div className="flex items-center gap-3">
            <MapPin className="size-5 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Sede</dt>
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
          <div className="flex items-center gap-3">
            <CalendarCheck className="size-5 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Registro de salida</dt>
              <dd className="text-muted-foreground">{evento.registroSalida}</dd>
            </div>
          </div>
        </dl>
      </div>

      <Button className="mt-6 h-12 w-full text-base" onClick={() => navigate({ to: "/talleres" })}>
        Continuar a talleres
      </Button>
    </PantallaPublica>
  );
}
