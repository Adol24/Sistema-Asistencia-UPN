import { createFileRoute } from "@tanstack/react-router";
import { CloudOff, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaCaptura } from "@/components/captura-shell";
import { Button } from "@/components/ui/button";
import { PuntoSemaforo } from "@/components/estado-badges";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/captura/historial")({
  head: () =>
    meta(
      "Historial de la sesión — Captura de asistencia",
      "Últimos escaneos de la sesión de captura, con opción de deshacer el más reciente.",
    ),
  component: Historial,
});

function Historial() {
  const { historial, deshacerUltimo, enLinea, pendientes } = useEstadoEvento();

  return (
    <PantallaCaptura titulo="Historial de la sesión">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {historial.length} {historial.length === 1 ? "escaneo" : "escaneos"} en esta sesión
          {!enLinea && pendientes > 0 ? ` · ${pendientes} sin sincronizar` : ""}
        </p>
        <Button
          variant="outline"
          className="h-11"
          disabled={historial.length === 0}
          onClick={() => {
            const h = deshacerUltimo();
            if (!h) return;
            toast.success(
              h.asistencia
                ? `Se deshizo el registro de ${h.resultado.participante?.nombre ?? h.resultado.entradaCruda}.`
                : "Se quitó el último escaneo del historial. No había registro que deshacer.",
            );
          }}
        >
          <Undo2 className="size-4" /> Deshacer el último
        </Button>
      </div>

      {historial.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <History className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-semibold">Todavía no hay escaneos</p>
          <p className="text-sm text-muted-foreground">
            Los escaneos de esta sesión aparecerán aquí, del más reciente al más antiguo.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {historial.map((h) => (
            <li
              key={h.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <PuntoSemaforo color={h.resultado.color} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {h.resultado.participante?.nombre ?? h.resultado.entradaCruda}
                </p>
                <p className="text-xs text-muted-foreground">
                  {/*
                    Se enseña lo que se REGISTRÓ, no el modo de la sesión: en la
                    puerta el modo vale para entrar y para salir, así que decir
                    «PUERTA» no distinguiría una cosa de la otra en el historial.
                  */}
                  {h.hora} · {(h.asistencia?.tipo ?? h.sesion.modo).toUpperCase()} · Día{" "}
                  {h.sesion.dia} · {h.sesion.punto}
                </p>
                <p className="mt-1 text-xs font-medium">{h.resultado.titulo}</p>
                {h.resultado.motivo ? (
                  <p className="text-xs text-muted-foreground">{h.resultado.motivo}</p>
                ) : null}
                {h.asistencia?.autorizacion ? (
                  <p className="mt-1 rounded-md bg-estado-discrepancia-bg p-2 text-xs text-estado-discrepancia">
                    <span className="font-semibold">
                      Excepción autorizada por {h.asistencia.autorizacion.autorizadoPor}
                    </span>{" "}
                    · {h.asistencia.autorizacion.en} · «{h.asistencia.autorizacion.nota}»
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {h.asistencia ? "Registrado" : "Sin registro"}
                </span>
                {h.pendiente ? (
                  <span className="flex items-center gap-1 rounded-md bg-estado-discrepancia-bg px-1.5 py-0.5 text-[11px] font-semibold text-estado-discrepancia">
                    <CloudOff className="size-3" aria-hidden /> Pendiente
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PantallaCaptura>
  );
}
