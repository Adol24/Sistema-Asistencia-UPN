import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, LogOut, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSesion } from "@/lib/sesion";
import { ETIQUETA_AREA, ETIQUETA_ROL, puedeEntrar, type Area } from "@/lib/roles";
import type { ReactNode } from "react";

/**
 * Puerta de las pantallas internas.
 *
 * Vive en los layouts compartidos —`PantallaPanel` y `PantallaCaptura`— en vez
 * de repetirse ruta por ruta. Son diecinueve pantallas: protegerlas una a una
 * garantiza que alguien olvide la próxima que se agregue.
 *
 * Tres estados y ninguno ambiguo: sin saber todavía, sin sesión, o con sesión
 * pero sin el rol que esta zona pide.
 */
export function Protegido({ area, children }: { area: Area; children: ReactNode }) {
  const { persona, cargando, modoPrototipo } = useSesion();

  if (modoPrototipo) return <>{children}</>;

  if (cargando) {
    return (
      <Centrado>
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm text-muted-foreground">Comprobando tu sesión…</p>
      </Centrado>
    );
  }

  if (!persona) return <FormularioAcceso area={area} />;

  if (!puedeEntrar(persona.rol, area)) {
    return (
      <Centrado>
        <ShieldAlert className="mx-auto size-8 text-estado-discrepancia" aria-hidden />
        <h1 className="mt-3 text-xl font-bold tracking-tight">Esta zona no es la tuya</h1>
        <p className="mx-auto mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          Entraste como {persona.nombre} con el perfil de {ETIQUETA_ROL[persona.rol]}, y{" "}
          {ETIQUETA_AREA[area]} pide otro. Si crees que te falta un permiso, pídelo a
          administración.
        </p>
        <BotonSalir className="mt-6" />
      </Centrado>
    );
  }

  return <>{children}</>;
}

function FormularioAcceso({ area }: { area: Area }) {
  const { entrar } = useSesion();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  return (
    <Centrado>
      <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden />
      <h1 className="mt-3 text-xl font-bold tracking-tight">Acceso del personal</h1>
      <p className="mx-auto mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
        {ETIQUETA_AREA[area]} es una pantalla interna. Entra con la cuenta que te dio
        administración.
      </p>

      <form
        noValidate
        className="mt-6 grid gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          setEnviando(true);
          setError("");
          void entrar(correo, contrasena)
            .then((fallo) => fallo && setError(fallo))
            .finally(() => setEnviando(false));
        }}
      >
        <div>
          <Label htmlFor="correo">Correo</Label>
          <Input
            id="correo"
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              setError("");
            }}
            className="mt-1.5 h-12 text-base"
            aria-invalid={!!error}
          />
        </div>
        <div>
          <Label htmlFor="contrasena">Contraseña</Label>
          <Input
            id="contrasena"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => {
              setContrasena(e.target.value);
              setError("");
            }}
            className="mt-1.5 h-12 text-base"
            aria-invalid={!!error}
          />
        </div>

        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

        <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
          {enviando ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        ¿Eres participante?{" "}
        <Link to="/portal" className="font-semibold text-primary underline underline-offset-2">
          Entra al portal con tu folio
        </Link>
      </p>
    </Centrado>
  );
}

/** Cierra la sesión. Se muestra en las barras internas. */
export function BotonSalir({ className }: { className?: string }) {
  const { persona, salir, modoPrototipo } = useSesion();
  if (modoPrototipo || !persona) return null;
  return (
    <button
      onClick={() => void salir()}
      className={
        "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted " +
        (className ?? "")
      }
    >
      <LogOut className="size-4" aria-hidden />
      Salir
    </button>
  );
}

/**
 * Aviso de que las pantallas internas están abiertas.
 *
 * Solo aparece sin base de datos configurada. Existe porque el modo con datos
 * simulados es indistinguible del real a simple vista, y ese parecido es
 * justamente el riesgo: alguien podría publicar el prototipo creyendo que la
 * administración está cerrada.
 */
export function AvisoPrototipo() {
  const { modoPrototipo } = useSesion();
  if (!modoPrototipo) return null;
  return (
    <p className="flex items-center justify-center gap-2 bg-estado-discrepancia-bg px-4 py-1.5 text-center text-[11px] font-semibold text-estado-discrepancia print:hidden">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      Modo prototipo: datos simulados y pantallas internas sin contraseña
    </p>
  );
}

function Centrado({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background [padding-bottom:calc(env(safe-area-inset-bottom)+var(--teclado,0px))]">
      <div className="mx-auto w-full max-w-sm px-4 py-10 text-center alto:my-auto">{children}</div>
    </div>
  );
}
