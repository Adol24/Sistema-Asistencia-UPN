import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Clock, MapPin } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";

import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia } from "@/dominio/tipos";

export const Route = createFileRoute("/mi-dia")({
  head: () =>
    meta(
      "Tu día y lugar — XIV Encuentro Internacional de Educación",
      "Consulta o elige el día, el lugar y el horario de registro de tu asistencia presencial al XIV Encuentro Internacional de Educación.",
    ),
  component: MiDia,
});

/**
 * El día de la asistencia presencial.
 *
 * **Quién lo decide depende del perfil, y esa es toda la pantalla.**
 *
 * Al alumno se lo reparte Servicios Escolares: viene en el padrón, sale de
 * `fn_dia_de` y no es negociable —cambiarlo desbalancearía las sedes—. Al
 * docente y al visitante externo no los reparte nadie, porque no están en
 * ningún padrón: elegir es la única respuesta correcta.
 *
 * Antes esta pantalla les decía a los tres lo mismo, «tu asistencia ya está
 * asignada, no es posible cambiar de día», y al docente le enseñaba el DÍA 1.
 * Ese 1 no lo había decidido nadie: era el valor por defecto de un `?? 1` en el
 * navegador, sobre un dato que para él no existía todavía.
 */
function MiDia() {
  const navigate = useNavigate();
  const { borrador, participante, setBorrador } = usePrototipo();
  const { configuracion: evento, infoDia } = useEstadoEvento();

  const perfil = borrador.perfil ?? participante?.perfil ?? "alumno";
  const eligeSuDia = perfil === "docente" || perfil === "externo";
  const elegido = borrador.dia ?? participante?.dia;

  if (eligeSuDia) {
    return (
      <PantallaPublica
        titulo="Elige tu día"
        descripcion="El encuentro se imparte tres días con el mismo programa en sedes distintas. Escoge al que asistirás."
        volverA="/registro"
      >
        <ul className="grid gap-3">
          {evento.dias.map((d) => {
            const activo = elegido === d.dia;
            return (
              <li key={d.dia}>
                <button
                  type="button"
                  onClick={() => setBorrador({ dia: d.dia as Dia })}
                  aria-pressed={activo}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    activo
                      ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-extrabold">
                      {d.etiqueta} — {d.fecha}
                    </p>
                    {activo ? (
                      <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                        <Check className="size-4" aria-hidden /> Elegido
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4 text-primary" aria-hidden /> {d.lugar}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-primary" aria-hidden />
                      Registro de entrada {evento.registroEntrada}
                    </div>
                  </dl>
                </button>
              </li>
            );
          })}
        </ul>

        {/*
          Los talleres se imparten en días concretos, así que el día acota el
          catálogo. Se dice aquí y no al llegar a la lista, donde ya sería
          tarde: quien buscaba un taller en particular tiene que poder volver y
          cambiar de día antes de elegir, no descubrir que no está.
        */}
        <p className="mt-4 text-sm text-muted-foreground">
          Cada taller se imparte en días concretos, así que el que elijas define cuáles puedes
          tomar. Podrás volver aquí antes de pagar.
        </p>

        <Button
          className="mt-6 h-12 w-full text-base"
          disabled={!elegido}
          onClick={() => navigate({ to: "/talleres" })}
        >
          {elegido ? "Continuar a talleres" : "Elige un día para continuar"}
        </Button>
      </PantallaPublica>
    );
  }

  /*
   * Puede que Servicios Escolares todavía no le haya repartido día.
   *
   * Antes esto no se distinguía: un `?? 1` anunciaba el DÍA 1 a quien no tenía
   * ninguno, y con el catálogo de talleres acotado por día eso lo mandaba a
   * elegir entre los talleres equivocados. Se dice la verdad, que es que su día
   * se fija al confirmar el registro.
   */
  if (!elegido) {
    return (
      <PantallaPublica
        titulo="Tu día y lugar"
        descripcion="Servicios Escolares todavía no reparte tu día."
        volverA="/confirmar-nombre"
      >
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm">
            Tu día se fija al confirmar tu registro, y lo verás enseguida en tu comprobante y en tu
            portal. Si eliges taller, se te asignará un día en el que ese taller se imparta.
          </p>
          <p className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
            <Clock className="size-5 text-primary" aria-hidden />
            Registro de entrada {evento.registroEntrada}
          </p>
        </div>

        <Button
          className="mt-6 h-12 w-full text-base"
          onClick={() => navigate({ to: "/talleres" })}
        >
          Continuar a talleres
        </Button>
      </PantallaPublica>
    );
  }

  const dia = infoDia(elegido);

  return (
    <PantallaPublica
      titulo="Tu día y lugar"
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
              <dd className="text-muted-foreground">{dia.lugar}</dd>
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
