import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PantallaPublica } from "@/components/layouts";
import { FormularioDeFolio } from "@/components/acceso-por-folio";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/portal/")({
  head: () =>
    meta(
      "Portal del participante — XIV Encuentro Internacional de Educación",
      "Consulta el estado de tu registro, tu código QR y tus evidencias con tu folio del XIV Encuentro Internacional de Educación.",
    ),
  component: AccesoPortal,
});

/*
 * El formulario y su llamada a la base viven en `acceso-por-folio`.
 *
 * No es reparto por gusto: `/comprobante` y `/pago` piden lo mismo cuando la
 * pestaña del pre-registro murió y hay que rehacer el documento desde la base.
 * Con una copia en cada sitio, la comprobación que impide que esto sea un
 * buscador de folios válidos tendría que acertarse tres veces.
 */
function AccesoPortal() {
  const navigate = useNavigate();

  return (
    <PantallaPublica
      titulo="Entra con tu folio"
      descripcion="No necesitas contraseña. Usa tu folio y tu matrícula (o el correo con el que te registraste)."
    >
      <div className="rounded-lg border border-border bg-card p-5 lg:p-6">
        <FormularioDeFolio
          textoBoton="Entrar al portal"
          alEntrar={() => void navigate({ to: "/portal/estado" })}
        />
      </div>
    </PantallaPublica>
  );
}
