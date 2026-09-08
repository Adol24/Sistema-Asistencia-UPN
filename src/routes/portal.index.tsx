import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getParticipante } from "@/mocks/participantes";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/portal/")({
  head: () =>
    meta(
      "Portal del participante — XIV Encuentro Internacional de Educación",
      "Consulta el estado de tu registro, tu código QR, tus evidencias y tu constancia con tu folio del XIV Encuentro Internacional de Educación.",
    ),
  component: AccesoPortal,
});

function AccesoPortal() {
  const navigate = useNavigate();
  const { participante, setFolio } = usePrototipo();
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
    await simularLatencia();
    const p = getParticipante(folio.trim().toUpperCase());
    setCargando(false);
    if (!p) {
      setError("No encontramos ese folio. Revisa que esté completo, por ejemplo PRE-00842.");
      return;
    }
    const v = verificacion.trim().toLowerCase();
    if (v !== (p.matricula ?? "").toLowerCase() && v !== p.correo.toLowerCase()) {
      setError("Ese folio no coincide con la matrícula o el correo que capturaste.");
      return;
    }
    setFolio(p.folio);
    navigate({ to: "/portal/estado" });
  };

  return (
    <PantallaPublica titulo="Portal del participante" volverA="/bienvenida">
      <form
        className="rounded-lg border border-border bg-card p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <h1 className="text-lg font-semibold">Entra con tu folio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No necesitas contraseña. Usa tu folio y tu matrícula (o el correo con el que te
          registraste).
        </p>
        <div className="mt-5 grid gap-4">
          <div>
            <Label htmlFor="folio">Folio</Label>
            <Input
              id="folio"
              value={folio}
              onChange={(e) => setFolioInput(e.target.value.toUpperCase())}
              placeholder={participante.folio}
              className="mt-1 h-12 text-base"
            />
          </div>
          <div>
            <Label htmlFor="verif">Matrícula o correo</Label>
            <Input
              id="verif"
              value={verificacion}
              onChange={(e) => setVerificacion(e.target.value)}
              placeholder={participante.matricula ?? participante.correo}
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
          En el prototipo puedes entrar con el folio {participante.folio} y{" "}
          {participante.matricula ?? participante.correo}.
        </p>
      </form>
    </PantallaPublica>
  );
}
