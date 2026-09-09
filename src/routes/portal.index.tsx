import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { simularLatencia } from "@/lib/formato";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { usePrototipo } from "@/lib/prototipo";
import { usePortal } from "@/lib/portal";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/portal/")({
  head: () =>
    meta(
      "Portal del participante — XIV Encuentro Internacional de Educación",
      "Consulta el estado de tu registro, tu código QR, tus evidencias y si cumples los requisitos de constancia, con tu folio del XIV Encuentro Internacional de Educación.",
    ),
  component: AccesoPortal,
});

/** Un único mensaje para folio inexistente y credencial que no corresponde. */
const ERROR_ACCESO = "Ese folio y ese dato no coinciden. Revísalos y vuelve a intentar.";

function AccesoPortal() {
  const navigate = useNavigate();
  const { participante, setFolio } = usePrototipo();
  const { abrir } = usePortal();
  const [folio, setFolioInput] = useState("");
  const [verificacion, setVerificacion] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError("");
    if (!folio.trim() || !verificacion.trim()) {
      setError("Captura tu folio y tu matrícula o correo para entrar.");
      return;
    }
    setCargando(true);

    /*
     * La pareja folio-credencial la comprueba la base, no el navegador.
     *
     * Antes se traía al participante por folio y se comparaba aquí. Eso obliga a
     * entregar primero los datos de alguien a quien todavía no se le ha pedido
     * nada: con solo el folio ya se conocía su nombre y su correo. Ahora
     * `fn_autenticar_portal` compara dentro de Postgres y solo responde si los
     * dos casan.
     *
     * El mensaje de error es uno solo para los dos casos —folio inexistente y
     * credencial que no corresponde— a propósito: distinguirlos convertiría esta
     * pantalla en un buscador de folios válidos.
     */
    const credencial = verificacion.trim();
    const clave = folio.trim().toUpperCase();
    try {
      const { autenticarPortal } = await import("@/lib/datos");
      const id = await autenticarPortal(clave, credencial);
      setCargando(false);
      if (!id) return setError(ERROR_ACCESO);
    } catch {
      setCargando(false);
      return setError("No pudimos comprobar tus datos. Inténtalo de nuevo en un momento.");
    }

    setFolio(clave);
    abrir(clave, credencial);
    navigate({ to: "/portal/estado" });
  };

  return (
    <PantallaPublica
      volverA="/bienvenida"
      titulo="Entra con tu folio"
      descripcion="No necesitas contraseña. Usa tu folio y tu matrícula (o el correo con el que te registraste)."
    >
      <form
        className="rounded-lg border border-border bg-card p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <div className="grid gap-4">
          <div>
            <Label htmlFor="folio">Folio</Label>
            <Input
              id="folio"
              value={folio}
              onChange={(e) => setFolioInput(e.target.value)}
              {...CAMPO_MAYUSCULAS}
              placeholder={participante?.folio}
              className="mt-1 h-12 text-base uppercase"
            />
          </div>
          <div>
            <Label htmlFor="verif">Matrícula o correo</Label>
            <Input
              id="verif"
              value={verificacion}
              onChange={(e) => setVerificacion(e.target.value)}
              placeholder={participante?.matricula ?? participante?.correo}
              className="mt-1 h-12 text-base"
            />
          </div>
        </div>
        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="size-4" />
            <AlertTitle>No pudimos entrar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="mt-5 h-12 w-full text-base" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Consultando…
            </>
          ) : (
            <>
              <LogIn className="size-5" /> Entrar al portal
            </>
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          En el prototipo puedes entrar con el folio {participante?.folio} y{" "}
          {participante?.matricula ?? participante?.correo}.
        </p>
      </form>
    </PantallaPublica>
  );
}
