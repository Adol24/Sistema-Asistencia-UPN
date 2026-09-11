import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clock, DoorOpen, Gauge, ShieldAlert, Users } from "lucide-react";
import { PantallaPanel } from "@/components/layouts";
import { EstadoVacio } from "@/components/tipografia";
import { navAdmin } from "@/components/nav-admin";
import { Progress } from "@/components/ui/progress";
import { RelojEventoControl } from "@/components/reloj-evento";
import { Indicador } from "@/components/indicador";
import { comoHora } from "@/lib/formato";
import { useEstadoEvento } from "@/lib/estado-evento";
import { detectarAnomalias, metricasDelDia } from "@/lib/monitoreo";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/monitoreo")({
  head: () =>
    meta(
      "Monitoreo en vivo — Administración del Encuentro",
      "Asistencia en tiempo real: escaneado contra esperado, ritmo por minuto, desempeño por punto de captura y alertas de anomalías.",
    ),
  component: Monitoreo,
});

function Monitoreo() {
  const { participantes, asistencias, estadoDe, configuracion, reloj } = useEstadoEvento();
  // El día lo manda el reloj, que normalmente sigue la hora real y solo se
  // detiene si alguien lo mueve a mano para ensayar.
  const dia = reloj.dia;
  const info = configuracion.dias.find((d) => d.dia === dia)!;

  const esperados = useMemo(
    () => participantes.filter((p) => p.dia === dia && estadoDe(p).evento === "pagado").length,
    [participantes, dia, estadoDe],
  );
  const m = useMemo(
    () => metricasDelDia(asistencias, dia, esperados, reloj.minutos),
    [asistencias, dia, esperados, reloj.minutos],
  );
  const anomalias = useMemo(
    () => detectarAnomalias(asistencias).filter((a) => a.dia === dia),
    [asistencias, dia],
  );

  return (
    <PantallaPanel
      area="admin"
      titulo="Monitoreo en vivo"
      descripcion={`Registro de entrada: ${configuracion.registroEntrada}. Si el ritmo no alcanza, hay que abrir otra puerta.`}
      nav={navAdmin}
      acciones={<RelojEventoControl />}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {info.etiqueta} — {info.fecha} · {info.lugar} · son las{" "}
        <span className="font-mono font-semibold text-foreground">{comoHora(reloj.minutos)}</span>
        {/*
          Decir de dónde sale la hora, porque de ella depende el ritmo. «Son las
          9:15» a secas se lee como un dato del sistema, y si el reloj está
          detenido eso es exactamente lo que no es.
        */}
        {reloj.automatico ? (
          ""
        ) : (
          <span className="font-semibold text-estado-discrepancia">
            {" "}
            en el reloj detenido a mano, no la hora real
          </span>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador
          icono={<DoorOpen className="size-5" aria-hidden />}
          etiqueta="Han llegado"
          valor={`${m.entradas} / ${m.esperados}`}
          detalle={`${m.avance}% de los que pagaron`}
        />
        {/*
          «Han llegado» y «dentro ahora» dejaron de ser el mismo número desde que
          la puerta registra idas y vueltas, y la diferencia entre los dos es
          justo lo que nadie podía ver antes: cuánta gente se va a media jornada.
        */}
        <Indicador
          icono={<Users className="size-5" aria-hidden />}
          etiqueta="Dentro ahora"
          valor={String(m.dentro)}
          detalle={
            m.seFueron === 0
              ? "No se ha ido nadie"
              : `${m.seFueron} ${m.seFueron === 1 ? "se fue" : "se fueron"} y no ${m.seFueron === 1 ? "ha" : "han"} vuelto`
          }
          tono={m.entradas > 0 && m.seFueron > m.entradas / 4 ? "alerta" : undefined}
        />
        <Indicador
          icono={<Gauge className="size-5" aria-hidden />}
          etiqueta="Ritmo"
          valor={`${m.ritmoPorMinuto}`}
          detalle="llegadas por minuto"
        />
        <Indicador
          icono={<Clock className="size-5" aria-hidden />}
          etiqueta="Faltan por llegar"
          valor={String(Math.max(0, m.esperados - m.entradas))}
          detalle={
            m.minutosRestantes === null
              ? "Sin ritmo suficiente para proyectar"
              : `≈ ${m.minutosRestantes} min al ritmo actual`
          }
          tono={m.minutosRestantes !== null && m.minutosRestantes > 60 ? "alerta" : undefined}
        />
        <Indicador
          icono={<ShieldAlert className="size-5" aria-hidden />}
          etiqueta="Anomalías detectadas"
          valor={String(anomalias.length)}
          detalle={anomalias.length === 0 ? "Nada que revisar" : "Requieren revisión"}
          tono={anomalias.length > 0 ? "alerta" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-bold">Avance de la puerta</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {m.entradas} personas han llegado · {m.dentro} están dentro · {m.salidas}{" "}
            {m.salidas === 1 ? "salida registrada" : "salidas registradas"}
          </p>
          <Progress value={m.avance} className="h-4" />
          <p className="mt-2 text-sm">
            <span className="font-bold">{m.avance}%</span> de los {m.esperados} que pagaron para el
            día {dia}
          </p>
          {m.minutosRestantes !== null && m.minutosRestantes > 60 ? (
            <p className="mt-3 rounded-md bg-estado-discrepancia-bg p-3 text-sm text-estado-discrepancia">
              Al ritmo actual faltarían unos {m.minutosRestantes} minutos para terminar de recibir a
              todos. La ventana de registro es de una hora: conviene abrir otro punto de captura.
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-bold">Desempeño por punto de captura</h2>
          <p className="mb-3 text-xs text-muted-foreground">Entradas registradas en cada acceso</p>
          {m.porPunto.length === 0 ? (
            <EstadoVacio
              className="bg-transparent p-8"
              titulo={`Todavía no hay entradas del día ${dia}`}
            >
              En cuanto se registre la primera, el desglose aparece aquí.
            </EstadoVacio>
          ) : (
            <ul className="grid gap-3">
              {m.porPunto.map((p) => {
                const pct = Math.round((p.entradas / Math.max(1, m.entradas)) * 100);
                return (
                  <li key={p.punto}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{p.punto}</span>
                      <span className="text-muted-foreground">
                        <span className="font-bold text-foreground">{p.entradas}</span> · {pct}%
                      </span>
                    </div>
                    <Progress value={pct} className="mt-1 h-2" />
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.capturistas.join(", ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4">
        <h2 className="text-sm font-bold">Alertas de anomalías</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Ritmos imposibles y escaneos fuera de la ventana del evento
        </p>
        {anomalias.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm font-semibold">Sin anomalías el día {dia}</p>
            <p className="text-sm text-muted-foreground">
              Los registros del día caen dentro del horario y a un ritmo humano. Cambia de día para
              revisar los demás.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {anomalias.map((a, i) => (
              <li
                key={`${a.clase}-${i}`}
                className="rounded-lg border-2 border-estado-cancelado/40 bg-estado-cancelado-bg p-4"
              >
                <p className="flex items-start gap-2 text-sm font-bold text-estado-cancelado">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
                  {a.titulo}
                </p>
                <p className="mt-1 text-sm text-estado-cancelado">{a.detalle}</p>
                <p className="mt-2 rounded-md bg-card p-2 text-sm">
                  <span className="font-semibold">Qué hacer:</span> {a.accion}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-estado-cancelado">
                    Ver los {a.afectadas.length} registros
                  </summary>
                  <ul className="mt-2 grid gap-1">
                    {a.afectadas.map((x) => (
                      <li key={x.id} className="font-mono text-xs text-muted-foreground">
                        {x.hora} · {x.folio} · {x.nombre} · {x.punto}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PantallaPanel>
  );
}
