import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { AvisoDePrivacidad } from "@/components/aviso-privacidad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CAMPO_MAYUSCULAS, LARGO, faltanDigitos, soloDigitos } from "@/lib/campos";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { meta } from "@/lib/seo";
import { opcion } from "@/lib/estilos";
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
  const { borrador, setBorrador, reset } = usePrototipo();
  const { configuracion: evento } = useEstadoEvento();
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
  const dominioAlumnos = evento.dominioInstitucional.trim().toLowerCase();
  const [aceptoAviso, setAceptoAviso] = useState(false);
  const [errorAviso, setErrorAviso] = useState("");
  // Revisar antes de continuar. Sustituye a la verificación por código: atrapa el
  // error de dedo, que es lo común, sin depender de que un correo llegue.
  const [porConfirmar, setPorConfirmar] = useState<{ nombre: string; correo: string } | null>(null);

  /*
   * La ventana de su perfil, preguntada al elegirlo y no al enviar.
   *
   * Es el mismo trato que recibe el alumno en `confirmar-nombre`: enterarse de
   * que su registro abre el 3 de octubre DESPUÉS de teclear nombre, apellidos,
   * correo, celular e institución es la diferencia entre una fecha y un portazo.
   *
   * Esto **no es la puerta**. La puerta es `trg_ventana_preregistro`, que vuelve
   * a comprobarlo justo antes de insertar; esto es el aviso. Por eso un fallo
   * aquí se calla y deja continuar: si la consulta no responde, quien decide es
   * la base, y bloquear el formulario por no haber podido preguntar dejaría
   * fuera a gente que sí puede pasar.
   */
  const [fueraDeVentana, setFueraDeVentana] = useState("");
  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vivo = true;
    void (async () => {
      try {
        const { ventanaDePerfilRemota } = await import("@/lib/datos");
        const motivo = await ventanaDePerfilRemota(perfil);
        if (vivo) setFueraDeVentana(motivo ?? "");
      } catch {
        if (vivo) setFueraDeVentana("");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [perfil]);

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
    const correoLimpio = c.correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio))
      e.correo = "Ese correo no tiene un formato válido.";
    /*
     * Un alumno no se inscribe por aquí, y se le dice ANTES de que llene el
     * formulario entero.
     *
     * La regla de verdad vive en `fn_preregistrar_externo` —que además mira si
     * ese correo ya está registrado como alumno, cosa que desde el navegador no
     * se puede ver porque `participantes` está cerrada—. Esto solo adelanta el
     * caso reconocible: si el dominio de alumnos está configurado y el correo es
     * de ahí, se para aquí en vez de al final del recorrido.
     *
     * Con `dominioInstitucional` vacío esta comprobación no hace nada, igual que
     * su gemela en la base.
     */
    else if (dominioAlumnos && correoLimpio.endsWith(`@${dominioAlumnos}`))
      e.correo = "correo-de-alumno";
    if (!c.celular) e.celular = "Escribe tu celular.";
    else {
      const falta = faltanDigitos(c.celular, LARGO.celular, "el celular");
      if (falta) e.celular = falta;
    }
    if (!c.institucion.trim()) e.institucion = "Escribe tu institución de procedencia.";
    setErrores(e);
    if (Object.keys(e).length) return;

    // Después de los campos: si algo de arriba falla, eso es lo que hay que
    // arreglar primero. El aviso está justo encima del botón, a la vista.
    if (!aceptoAviso) {
      setErrorAviso("Para continuar hay que aceptar el aviso de privacidad.");
      return;
    }
    setErrorAviso("");

    setPorConfirmar({
      // Se convierte aquí, no al teclear: ver `CAMPO_MAYUSCULAS`.
      nombre: [c.nombres, c.paterno, c.materno].map((x) => x.trim().toUpperCase()).join(" "),
      correo: correoLimpio,
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
    /*
     * Mismo caso que en `/alumno`, comparando por correo porque el docente y el
     * externo no tienen matrícula: si el borrador guardado es de otra persona,
     * se vacía antes de mezclar. Ver el comentario de allá.
     */
    if (borrador.correo && borrador.correo !== porConfirmar!.correo) reset();
    setBorrador({
      perfil,
      ...porConfirmar!,
      celular: c.celular.trim(),
      institucion: c.institucion.trim(),
      aceptoAviso: true,
    });
    navigate({ to: "/mi-dia" });
  };

  if (porConfirmar) {
    return (
      <PantallaPublica
        titulo="Confirma tus datos"
        descripcion="Así quedará tu registro. No podrás editarlo después."
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
              className="h-12 md:h-11 text-base"
              onClick={() => setPorConfirmar(null)}
            >
              Corregirlos
            </Button>
            <Button
              className="h-12 md:h-11 text-base"
              disabled={cargando}
              onClick={() => void confirmar()}
            >
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
    <PantallaPublica titulo="Registro de docente o externo">
      <Alert className="mb-4">
        <AlertTriangle className="size-4" />
        <AlertTitle>Escribe tu nombre en MAYÚSCULAS y sin acentos</AlertTitle>
        <AlertDescription>Verifica bien tus datos: así quedará tu registro.</AlertDescription>
      </Alert>

      <form
        className="rounded-lg border border-border bg-card p-5 lg:p-6"
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
                opcion(perfil === p),
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/*
         * Va justo debajo del selector de perfil porque es lo que acaba de
         * cambiar: la ventana depende de ese botón, y el aviso tiene que
         * aparecer donde estaba mirando quien lo pulsó. Debajo del formulario
         * —o arriba del todo, con el otro aviso— se leería como una advertencia
         * general y no como la respuesta a «soy docente».
         */}
        {fueraDeVentana ? (
          <Alert className="mt-4 border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg">
            <CalendarClock className="size-4" />
            <AlertTitle>Todavía no es tu turno</AlertTitle>
            <AlertDescription>
              {fueraDeVentana} Mientras tanto no se puede completar este registro.
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
         * Seis campos cortos, en dos columnas a partir de 768.
         *
         * Apilados eran seis renglones y el formulario medía más que la
         * ventana: en un monitor de 1920 —que es ancho y BAJO— el aviso de
         * privacidad salía cortado y el botón «Continuar» no llegaba a verse.
         * Había que desplazar para encontrar el final de un formulario de seis
         * campos, con media pantalla vacía a los lados.
         *
         * Son seis exactos, así que en dos columnas salen tres renglones justos,
         * sin huecos: nombres|paterno, materno|correo, celular|institución. El
         * orden no cambia —se lee de izquierda a derecha y hacia abajo, igual
         * que en papel— así que el recorrido con el tabulador sigue siendo el
         * mismo.
         *
         * Lo que NO se hace es ensanchar los campos: a 1280 cada columna mide
         * unos 348 px, menos que los 520 de cuando iban apilados. Un celular de
         * diez dígitos en 520 px era el síntoma de que el ancho sobrante se
         * estaba repartiendo mal.
         */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
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
                className={
                  k === "correo"
                    ? "mt-1 h-12 md:h-11 text-base"
                    : "mt-1 h-12 md:h-11 text-base uppercase"
                }
                {...(k === "correo" || k === "celular" ? {} : CAMPO_MAYUSCULAS)}
                aria-invalid={!!errores[k]}
                {...(k === "celular"
                  ? { inputMode: "numeric" as const, autoComplete: "tel", maxLength: LARGO.celular }
                  : {})}
              />
              {/*
               * El caso del correo de alumno no se puede decir con una cadena:
               * necesita el enlace a su propio camino. Rechazar a alguien sin
               * enseñarle por dónde sí es lo que convierte un error en un
               * mensaje a soporte.
               */}
              {errores[k] === "correo-de-alumno" ? (
                <p className="mt-1 text-xs font-medium text-destructive">
                  Ese correo es una cuenta de alumno. Entra por{" "}
                  <Link to="/alumno" className="underline underline-offset-2">
                    «Soy alumno de la universidad»
                  </Link>{" "}
                  con tu matrícula.
                </p>
              ) : errores[k] ? (
                <p className="mt-1 text-xs font-medium text-destructive">{errores[k]}</p>
              ) : k === "celular" && c.celular.length > 0 && c.celular.length < LARGO.celular ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.celular.length} de {LARGO.celular} dígitos
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <AvisoDePrivacidad
          className="mt-5"
          aceptado={aceptoAviso}
          onAceptar={(v) => {
            setAceptoAviso(v);
            if (v) setErrorAviso("");
          }}
          error={errorAviso || undefined}
        />

        {/*
         * Bloquea el envío, pero no es lo que cierra la puerta: quien la cierra
         * es el disparador de la base. Esto le ahorra a la persona llenarlo
         * entero para que se lo rechacen al final.
         */}
        <Button
          type="submit"
          className="mt-5 h-12 md:h-11 w-full text-base"
          disabled={cargando || !!fueraDeVentana}
        >
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
