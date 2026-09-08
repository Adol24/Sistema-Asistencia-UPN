import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEstadoEvento } from "@/lib/estado-evento";

import { avance, construidasDe, modulos, rutaResuelta } from "@/lib/mapa-pantallas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Índice del prototipo — XIV Encuentro Internacional de Educación" },
      {
        name: "description",
        content:
          "Índice de todas las pantallas del prototipo: registro público, portal del participante, financieros, captura, evidencias y administración.",
      },
      {
        property: "og:title",
        content: "Índice del prototipo — XIV Encuentro Internacional de Educación",
      },
      {
        property: "og:description",
        content: "Todas las pantallas del prototipo agrupadas por módulo.",
      },
    ],
  }),
  component: Indice,
});

function Indice() {
  const { configuracion: evento } = useEstadoEvento();
  const porcentaje = Math.round((avance.construidas / avance.total) * 100);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
            Prototipo de interfaz
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{evento.nombre}</h1>
          <p className="mt-2 max-w-2xl text-sm text-primary-foreground/80">
            {evento.fechas}. Los datos son simulados y el estado se reinicia al recargar.
          </p>

          <div className="mt-6 max-w-md rounded-lg bg-primary-foreground/10 p-4">
            <p className="text-sm font-semibold">
              {avance.construidas} de {avance.total} pantallas construidas
            </p>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-foreground/20"
              role="progressbar"
              aria-valuenow={avance.construidas}
              aria-valuemin={0}
              aria-valuemax={avance.total}
              aria-label={`${avance.construidas} de ${avance.total} pantallas construidas`}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className="mt-2 text-xs text-primary-foreground/80">
              Las {avance.pendientes} pantallas restantes aparecen atenuadas y no son navegables
              todavía.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-6 sm:grid-cols-2">
          {modulos.map((m) => {
            const listas = construidasDe(m);
            return (
              <section key={m.titulo} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{m.titulo}</h2>
                  <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {listas}/{m.rutas.length}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">{m.nota}</p>
                <ul className="grid gap-1">
                  {m.rutas.map((r) =>
                    r.estado === "listo" ? (
                      <li key={rutaResuelta(r)}>
                        <Link
                          to={r.to}
                          params={r.params as never}
                          className="flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-sm hover:bg-muted"
                        >
                          <span>{r.label}</span>
                          <span className="text-xs text-muted-foreground">{rutaResuelta(r)}</span>
                        </Link>
                      </li>
                    ) : (
                      <li key={rutaResuelta(r)}>
                        <div
                          aria-disabled="true"
                          className="flex min-h-11 cursor-not-allowed items-center justify-between gap-2 rounded-md px-3 text-sm opacity-55"
                        >
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Lock className="size-3.5 shrink-0" aria-hidden />
                            {r.label}
                          </span>
                          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            No construido
                          </span>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
