import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, GraduationCap, UserPlus } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { useEstadoEvento } from "@/lib/estado-evento";

import { meta } from "@/lib/seo";

export const Route = createFileRoute("/bienvenida")({
  head: () =>
    meta(
      "Bienvenida — XIV Encuentro Internacional de Educación",
      "Inicia tu pre-registro al XIV Encuentro Internacional de Educación. Elige si eres alumno de la universidad o participante externo.",
    ),
  component: Bienvenida,
});

function Bienvenida() {
  const { configuracion: evento } = useEstadoEvento();

  return (
    <PantallaPublica>
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pre-registro</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{evento.nombre}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{evento.subtitulo}</p>

        <dl className="mt-6 grid gap-3 text-left text-sm">
          <div className="flex items-start gap-3 rounded-md bg-muted p-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Fechas</dt>
              <dd className="text-muted-foreground">{evento.fechas}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="mt-6 grid gap-3">
        <Link
          to="/alumno"
          className="flex min-h-16 items-center gap-3 rounded-lg bg-primary px-5 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <GraduationCap className="size-6 shrink-0" aria-hidden />
          <span>
            <span className="block text-base font-semibold">Soy alumno de la universidad</span>
            <span className="block text-xs text-primary-foreground/80">
              Te identificas con tu matrícula
            </span>
          </span>
        </Link>
        <Link
          to="/registro"
          className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card px-5 text-left shadow-sm transition-colors hover:bg-muted"
        >
          <UserPlus className="size-6 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block text-base font-semibold">No soy alumno</span>
            <span className="block text-xs text-muted-foreground">
              Docente o participante externo
            </span>
          </span>
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿Ya te registraste?{" "}
        <Link to="/portal" className="font-semibold text-primary underline">
          Consulta tu estado en el portal
        </Link>
      </p>
    </PantallaPublica>
  );
}
