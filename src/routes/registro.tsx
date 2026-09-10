import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CAMPO_MAYUSCULAS, LARGO, faltanDigitos, soloDigitos } from "@/lib/campos";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registro")({
  head: () =>
    meta(
      "Registro de docente o externo — XIV Encuentro Internacional de Educación",
      "Llena tus datos como docente o participante externo para pre-registrarte al XIV Encuentro Internacional de Educación.",
    ),
  component: RegistroExterno,
});

interface Campos {
  nombres: string;
  paterno: string;
  materno: string;
  correo: string;
  celular: string;
  institucion: string;
}

function RegistroExterno() {
  const navigate = useNavigate();
  const { setBorrador } = usePrototipo();
  const [perfil, setPerfil] = useState<"docente" | "externo">("docente");
  const [c, setC] = useState<Campos>({
    nombres: "",
    paterno: "",
    materno: "",
    correo: "",
    celular: "",
    institucion: "",
  });
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({});
  const [cargando, setCargando] = useState(false);
  // Revisar antes de continuar. Sustituye a la verificación por código: atrapa el
  // error de dedo, que es lo común, sin depender de que un correo llegue.
  const [porConfirmar, setPorConfirmar] = useState<{ nombre: string; correo: string } | null>(null);

  // El celular es el único campo numérico del formulario: filtra los dígitos al
  // escribirlos, en vez de aceptar una letra y reprocharla al enviar.
  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC((prev) => ({
      ...prev,
      [k]: k === "celular" ? soloDigitos(e.target.value, LARGO.celular) : e.target.value,
    }));

  const enviar = async () => {
    const e: Partial<Record<keyof Campos, string>> = {};
    if (!c.nombres.trim()) e.nombres = "Escribe tu nombre o nombres.";
    if (!c.paterno.trim()) e.paterno = "Escribe tu apellido paterno.";
    /*
     * El apellido materno era opcional y no debía serlo.
     *
     * El alumno no elige su nombre: llega del padrón completo. Quien se registra
     * por su cuenta lo escribe, y si aquí falta un apellido el nombre queda
     * incompleto en el listado de elegibles que la universidad usa para elaborar
     * los documentos. Corregirlo después significa un caso de soporte y volver a
     * emitir.
     */
    if (!c.materno.trim()) e.materno = "Escribe tu apellido materno.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.correo.trim()))
      e.correo = "Ese correo no tiene un formato válido.";
    if (!c.celular) e.celular = "Escribe tu celular.";
    else {
      const falta = faltanDigitos(c.celular, LARGO.celular, "el celular");
      if (falta) e.celular = falta;
    }
    if (!c.institucion.trim()) e.institucion = "Escribe tu institución de procedencia.";
    setErrores(e);
    if (Object.keys(e).length) return;

    setPorConfirmar({
      // Se convierte aquí, no al teclear: ver `CAMPO_MAYUSCULAS`.
      nombre: [c.nombres, c.paterno, c.materno].map((x) => x.trim().toUpperCase()).join(" "),
      correo: c.correo.trim().toLowerCase(),
    });
  };

  const confirmar = async () => {
    setCargando(true);
    await simularLatencia();
    setCargando(false);
    /*
     * Van los cuatro datos, no solo los dos que se enseñan en la confirmación.
     *
     * El celular y la institución se quedaban aquí: la pantalla de confirmar
     * solo repasa nombre y correo, que es lo que se teclea mal, y el borrador
     * heredaba justo eso. Cuando el alta pasó a existir de verdad para este
     * perfil, los dos campos llegaban vacíos y la base rechazaba el registro
     * por falta de institución.
     */
    setBorrador({
      perfil,
      ...porConfirmar!,
      celular: c.celular.trim(),
      institucion: c.institucion.trim(),
    });
    navigate({ to: "/mi-dia" });
  };

  if (porConfirmar) {
    return (
      <PantallaPublica
        titulo="Confirma tus datos"
        descripcion="Así quedará tu registro. No podrás editarlo después."
        volverA="/bienvenida"
      >
        <section className="rounded-lg border-2 border-primary/25 bg-card px-5 py-8">
          <p className="text-balance text-center text-2xl font-extrabold leading-snug tracking-tight">
            {porConfirmar.nombre}
          </p>
          <p className="mt-6 rounded-md bg-muted p-3 text-center text-sm">
            <span className="text-muted-foreground">Correo: </span>
            <span className="break-all font-semibold">{porConfirmar.correo}</span>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            El nombre es con el que quedas registrado, y el correo es por donde soporte te contacta.
            Revísalos bien.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-12 text-base"
              onClick={() => setPorConfirmar(null)}
            >
              Corregirlos
            </Button>
            <Button className="h-12 text-base" disabled={cargando} onClick={() => void confirmar()}>
              {cargando ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Guardando…
                </>
              ) : (
                "Sí, continuar"
              )}
            </Button>
          </div>
        </section>
      </PantallaPublica>
    );
  }

  return (
    <PantallaPublica titulo="Registro de docente o externo" volverA="/bienvenida">
      <Alert className="mb-4">
        <AlertTriangle className="size-4" />
        <AlertTitle>Escribe tu nombre en MAYÚSCULAS y sin acentos</AlertTitle>
        <AlertDescription>Verifica bien tus datos: así quedará tu registro.</AlertDescription>
      </Alert>

      <form
        className="rounded-lg border border-border bg-card p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <p className="text-sm font-semibold">Tipo de participante</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["docente", "externo"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPerfil(p)}
              className={cn(
                "min-h-12 rounded-md border text-sm font-semibold capitalize",
                perfil === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4">
          {(
            [
              ["nombres", "Nombre(s)", "JUAN CARLOS"],
              ["paterno", "Apellido paterno", "PEREZ"],
              ["materno", "Apellido materno", "MUÑOZ"],
              ["correo", "Correo electrónico", "correo@dominio.com"],
              ["celular", "Celular (10 dígitos)", "8112345678"],
              ["institucion", "Institución de procedencia", "UNIVERSIDAD DEL VALLE"],
            ] as [keyof Campos, string, string][]
          ).map(([k, label, ph]) => (
            <div key={k}>
              <Label htmlFor={k}>{label}</Label>
              <Input
                id={k}
                value={c[k]}
                onChange={set(k)}
                placeholder={ph}
                className={k === "correo" ? "mt-1 h-12 text-base" : "mt-1 h-12 text-base uppercase"}
                {...(k === "correo" || k === "celular" ? {} : CAMPO_MAYUSCULAS)}
                aria-invalid={!!errores[k]}
                {...(k === "celular"
                  ? { inputMode: "numeric" as const, autoComplete: "tel", maxLength: LARGO.celular }
                  : {})}
              />
              {errores[k] ? (
                <p className="mt-1 text-xs font-medium text-destructive">{errores[k]}</p>
              ) : k === "celular" && c.celular.length > 0 && c.celular.length < LARGO.celular ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.celular.length} de {LARGO.celular} dígitos
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <Button type="submit" className="mt-5 h-12 w-full text-base" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Enviando código de verificación…
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </form>
    </PantallaPublica>
  );
}
