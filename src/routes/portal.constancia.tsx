import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Award, Check, X } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/constancia")({
  head: () =>
    meta(
      "Mi constancia — XIV Encuentro Internacional de Educación",
      "Consulta si cumples los requisitos de constancia del XIV Encuentro Internacional de Educación. El documento lo elabora la institución.",
    ),
  component: MiConstancia,
});

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function MiConstancia() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <MiConstanciaContenido p={p} />;
}

function MiConstanciaContenido({ p }: { p: Participante }) {
  const { estadoDe, asistenciasDe, evidencias } = useEstadoEvento();
  const estado = estadoDe(p);
  const delDia = asistenciasDe(p.folio, p.dia);
  const mias = evidencias.filter((e) => e.folio === p.folio);
  const aprobadas = mias.filter((e) => e.estado === "aprobada").length;

  const requisitos = [
    { texto: "Pago del evento registrado", ok: estado.evento === "pagado" },
    {
      texto: "Registro de entrada y salida del día asignado",
      ok: delDia.some((a) => a.tipo === "entrada") && delDia.some((a) => a.tipo === "salida"),
    },
    {
      texto:
        p.perfil === "alumno"
          ? "Evidencias aprobadas de los días en línea"
          : "No aplica para tu perfil",
      ok: p.perfil === "alumno" ? aprobadas >= 1 : true,
    },
    { texto: "Nombre confirmado sin observaciones", ok: !p.nombreEnRevision },
  ];
  const elegible = requisitos.every((r) => r.ok);

  return (
    <PantallaPublica volverA="/portal" ancho="lg">
      <PortalNav />
      <section className="rounded-lg border border-border bg-card p-6 text-center">
        <Award
          className={cn(
            "mx-auto size-10",
            elegible ? "text-estado-pagado" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <h1 className="mt-3 text-lg font-bold">
          {elegible ? "Cumples los requisitos de constancia" : "Todavía no cumples los requisitos"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se emite a nombre de <span className="font-semibold text-foreground">{p.nombre}</span>
        </p>

        <ul className="mx-auto mt-5 grid max-w-md gap-2 text-left">
          {requisitos.map((r) => (
            <li
              key={r.texto}
              className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"
            >
              {r.ok ? (
                <Check className="size-4 shrink-0 text-estado-pagado" aria-hidden />
              ) : (
                <X className="size-4 shrink-0 text-estado-cancelado" aria-hidden />
              )}
              <span className={r.ok ? "" : "text-muted-foreground"}>{r.texto}</span>
            </li>
          ))}
        </ul>

        {p.nombreEnRevision ? (
          <p className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-md bg-estado-discrepancia-bg p-3 text-left text-sm text-estado-discrepancia">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Tu nombre está en revisión. Apareces en el listado con tu caso señalado, para que la
            institución no elabore tu documento con el nombre equivocado. Soporte se pondrá en
            contacto contigo.
          </p>
        ) : null}

        {/*
          El sistema no genera el documento: solo dice si cumples. La constancia
          la elabora la institución a partir del listado de elegibles.
        */}
        <p className="mx-auto mt-6 max-w-md rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {elegible
            ? "Ya cumples los requisitos. La institución elabora las constancias con el listado de elegibles y te avisará cómo recogerla."
            : "En cuanto completes lo que falta aparecerás en el listado de elegibles que usa la institución para elaborar las constancias."}
        </p>
      </section>
    </PantallaPublica>
  );
}
