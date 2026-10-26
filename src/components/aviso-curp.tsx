import { useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";

const FORMATO_CURP = /^[A-Z0-9]{18}$/;

/**
 * El aviso de que falta la CURP, con el campo para escribirla ahí mismo.
 *
 * Solo para alumnos -docente y externo no tienen expediente que ligar a
 * RENAPO para la constancia- y solo mientras `curp` siga vacía: en cuanto se
 * guarda, el siguiente `fn_portal_estado` la trae y este bloque deja de
 * dibujarse solo, sin que nadie tenga que cerrarlo a mano.
 *
 * Vive en `PortalNav` y no en una sola pantalla: las tres rutas del portal la
 * montan, y así se ve sin importar por dónde entre la persona, no solo en
 * `/portal/estado`.
 */
export function AvisoCurp() {
  const { sesion, refrescar } = usePortal();
  const p = useParticipanteDelPortal();
  const [curp, setCurp] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  if (!p || p.perfil !== "alumno" || p.curp) return null;

  const guardar = async () => {
    const limpia = curp.trim().toUpperCase();
    if (!FORMATO_CURP.test(limpia)) {
      setError("Tu CURP debe tener 18 letras y números, sin espacios ni guiones.");
      ref.current?.focus();
      return;
    }
    setError("");
    if (!sesion) return;
    setGuardando(true);
    try {
      const { guardarCurpRemoto } = await import("@/lib/datos");
      await guardarCurpRemoto(sesion.folio, sesion.credencial, limpia);
      toast.success("Tu CURP quedó guardada.");
      refrescar();
    } catch (e) {
      const { mensajeDeError } = await import("@/lib/supabase");
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Alert className="mb-4 border-estado-discrepancia/40 bg-estado-discrepancia-bg">
      <AlertTriangle className="size-4" />
      <AlertTitle>Falta tu CURP</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>
          Es un paso fundamental para tu constancia: sin ella, la universidad no puede elaborar tu
          documento.
        </p>
        <div className="grid gap-2 sm:flex sm:items-start">
          <div className="flex-1">
            <Label htmlFor="curp" className="sr-only">
              CURP
            </Label>
            <Input
              ref={ref}
              id="curp"
              value={curp}
              onChange={(e) => {
                setCurp(e.target.value.toUpperCase());
                setError("");
              }}
              maxLength={18}
              placeholder="18 caracteres, por ejemplo GARC850101HDFLRS09"
              className="h-11 font-mono uppercase tracking-wide"
              aria-invalid={!!error}
              aria-describedby="ayuda-curp"
            />
          </div>
          <Button className="h-11 sm:shrink-0" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Guardando…
              </>
            ) : (
              "Guardar mi CURP"
            )}
          </Button>
        </div>
        <p id="ayuda-curp" className={error ? "text-xs font-medium text-destructive" : "text-xs"}>
          {error || "Son 18 caracteres alfanuméricos; los expide RENAPO."}
        </p>
      </AlertDescription>
    </Alert>
  );
}
