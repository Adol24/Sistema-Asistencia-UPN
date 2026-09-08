import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/confirmar-nombre")({
  head: () =>
    meta(
      "Confirmación de nombre — XIV Encuentro Internacional de Educación",
      "Verifica que tu nombre sea correcto: así aparecerá impreso en tu constancia del XIV Encuentro Internacional de Educación.",
    ),
  component: ConfirmarNombre,
});

function ConfirmarNombre() {
  const navigate = useNavigate();
  const { borrador, participante, setBorrador } = usePrototipo();
  const { abrirCasoNombre } = useEstadoEvento();
  const nombre = borrador.nombre ?? participante.nombre;
  const folio = participante.folio;
  const [opcion, setOpcion] = useState<"correcto" | "incorrecto" | null>(null);
  const [correccion, setCorreccion] = useState("");
  const [errorCorreccion, setErrorCorreccion] = useState("");

  return (
    <PantallaPublica titulo="Confirmación de nombre" volverA="/alumno">
      <div className="rounded-lg border-2 border-primary/25 bg-card p-5 text-center">
        <p className="text-sm font-semibold text-muted-foreground">
          Verifica que tu nombre sea correcto
        </p>
        <p className="my-6 text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
          {nombre}
        </p>
        <p className="text-xs text-muted-foreground">
          Formato: Nombre(s), Apellido Paterno, Apellido Materno — todo en MAYÚSCULAS y sin acentos.
        </p>
        <p className="mt-2 text-sm font-semibold">Así aparecerá en tu constancia.</p>
      </div>

      <fieldset className="mt-5 grid gap-2">
        <legend className="sr-only">Confirmación del nombre</legend>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4">
          <Checkbox
            checked={opcion === "correcto"}
            onCheckedChange={(v) => setOpcion(v ? "correcto" : null)}
          />
          <span className="text-sm font-medium">Confirmo que mi nombre es correcto</span>
        </label>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4">
          <Checkbox
            checked={opcion === "incorrecto"}
            onCheckedChange={(v) => setOpcion(v ? "incorrecto" : null)}
          />
          <span className="text-sm font-medium">Mi nombre aparece incorrecto</span>
        </label>
      </fieldset>

      {opcion === "incorrecto" ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <Label htmlFor="correccion">¿Cómo debe decir tu nombre?</Label>
          <Input
            id="correccion"
            value={correccion}
            onChange={(e) => {
              setCorreccion(e.target.value.toUpperCase());
              setErrorCorreccion("");
            }}
            placeholder={nombre}
            className="mt-1 h-12 text-base"
            aria-invalid={!!errorCorreccion}
          />
          {errorCorreccion ? (
            <p className="mt-1 text-xs font-medium text-destructive">{errorCorreccion}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Escríbelo completo, en MAYÚSCULAS y sin acentos. La Ñ sí va.
            </p>
          )}

          <Alert className="mt-4">
            <Info className="size-4" />
            <AlertTitle>Puedes seguir con tu pre-registro</AlertTitle>
            <AlertDescription>
              Al continuar se abre tu caso con esta corrección. No detiene nada: tu día, tu taller y
              tu pago siguen igual, y soporte lo revisa con Servicios Escolares.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <Button
        className="mt-6 h-12 w-full text-base"
        disabled={!opcion}
        onClick={() => {
          if (opcion === "incorrecto") {
            const limpio = correccion.trim().replace(/\s+/g, " ");
            if (limpio.split(" ").length < 2)
              return setErrorCorreccion("Escribe tu nombre completo, con apellidos.");
            if (limpio === nombre)
              return setErrorCorreccion("Ese es el nombre que ya tenemos. ¿Seguro que está mal?");
            abrirCasoNombre({ folio, nombre, nombreCorrecto: limpio });
          }
          setBorrador({ nombre, nombreEnRevision: opcion === "incorrecto" });
          navigate({ to: "/completar-datos" });
        }}
      >
        Continuar
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        ¿Te equivocaste de perfil?{" "}
        <Link to="/bienvenida" className="underline">
          Vuelve al inicio
        </Link>
      </p>
    </PantallaPublica>
  );
}
