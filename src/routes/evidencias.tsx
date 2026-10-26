import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, FileText } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Rotulo, Titulo, Texto } from "@/components/tipografia";
import { meta } from "@/lib/seo";

const FORMULARIO_EVIDENCIAS = "https://forms.gle/vUcDwvoLizmSAHKF9";

export const Route = createFileRoute("/evidencias")({
  head: () =>
    meta(
      "Evidencias — XIV Encuentro Internacional de Educación",
      "Sube tu producción académica del XIV Encuentro Internacional de Educación a través del formulario oficial.",
    ),
  component: Evidencias,
});

function Evidencias() {
  return (
    <PantallaPublica titulo="Evidencias del Encuentro" ancho="md">
      <Rotulo className="text-primary">Producción académica</Rotulo>
      <Titulo className="mt-2">XIV Encuentro Internacional de Educación</Titulo>
      <Texto className="mt-4">
        Fortalecer la formación y profesionalización del estudiantado de las diferentes
        Licenciaturas y Posgrados de la UPN 212, mediante la realización del XIV Encuentro
        Internacional de Educación como un espacio de intercambio académico e intelectual con
        especialistas nacionales e internacionales en Humanismo, Interculturalidad, Investigación
        Educativa e Inteligencia Artificial Generativa, para impulsar el desarrollo de las
        competencias profesionales que demanda la política educativa actual.
      </Texto>

      <a
        href={FORMULARIO_EVIDENCIAS}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <FileText className="size-4 shrink-0" aria-hidden />
        Subir mi evidencia
        <ExternalLink className="size-4 shrink-0" aria-hidden />
      </a>
    </PantallaPublica>
  );
}
