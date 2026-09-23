import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Award, Check, X } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
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
  /*
   * El veredicto lo da la base, no esta pantalla.
   *
   * Aquí vivía una TERCERA regla de elegibilidad escrita a mano —pago, entrada,
   * UNA evidencia y nombre sin observaciones— que no coincidía ni con
   * `v_elegibles` ni con `elegibilidad.ts`. Con una sola evidencia aprobada le
   * decía «Cumples los requisitos de constancia» a alguien que el listado de
   * administración, que pide dos, no incluía: esa persona llegaba a recoger un
   * documento que no se había impreso.
   *
   * Y no se puede arreglar recalculando mejor: el participante es anónimo y las
   * políticas le cierran `evidencias`, `asistencias` y `pagos`, así que
   * `useEstadoEvento()` le devuelve listas vacías. Cualquier cuenta hecha aquí
   * parte de cero y da lo mismo cuántos requisitos tenga.
   *
   * `fn_portal_estado` ya devolvía `v_elegibles` desde el principio; lo que
   * faltaba era leerlo.
   */
  const { datos } = usePortal();
  const e = datos?.elegibilidad ?? null;

  const requisitos = [
    { texto: "Pago del evento registrado", ok: e?.estado_pago_evento === "pagado" },
    { texto: `Registro de entrada del día ${p.dia}`, ok: e?.tiene_entrada === true },
    {
      texto:
        p.perfil === "alumno"
          ? "2 evidencias aprobadas de los días en línea"
          : "Evidencias: no aplican a tu perfil",
      ok: p.perfil !== "alumno" || (e?.evidencias_aprobadas ?? 0) >= 2,
    },
  ];
  /*
   * El elegible es el de la vista, no `requisitos.every(...)`. Si algún día las
   * dos cosas dejaran de coincidir, lo que se entrega sale de la vista, así que
   * es lo que esta pantalla tiene que decir. Los requisitos están para explicar
   * el porqué, no para calcularlo.
   *
   * El nombre en revisión se enseña aparte y NO como requisito: no impide la
   * constancia —`v_elegibles` no lo mira— pero sí conviene resolverlo antes de
   * que se imprima con una errata.
   */
  const elegible = e?.elegible === true;

  return (
    <PantallaPublica ancho="lg">
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
