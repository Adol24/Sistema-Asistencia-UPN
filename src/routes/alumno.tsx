import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, MessageCircle, Search } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buscarEnPadron } from "@/mocks/alumnosPadron";
import { LARGO, faltanDigitos, soloDigitos } from "@/lib/campos";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/alumno")({
  head: () =>
    meta(
      "Identificación de alumno — XIV Encuentro Internacional de Educación",
      "Escribe tu matrícula para continuar con tu pre-registro al XIV Encuentro Internacional de Educación.",
    ),
  component: IdentificacionAlumno,
});

function IdentificacionAlumno() {
  const navigate = useNavigate();
  const { setBorrador } = usePrototipo();
  const { configuracion: evento, diaDe } = useEstadoEvento();
  const [matricula, setMatricula] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [noEncontrada, setNoEncontrada] = useState(false);

  const buscar = async () => {
    if (!matricula) return setError("Escribe tu matrícula.");
    // El campo ya impide las letras, así que lo único que puede faltar son
    // dígitos. Decir cuántos es más útil que repetir el formato.
    const falta = faltanDigitos(matricula, LARGO.matricula, "la matrícula");
    if (falta) return setError(falta);
    setError("");
    setNoEncontrada(false);
    setCargando(true);
    await simularLatencia();
    const alumno = buscarEnPadron(matricula);
    setCargando(false);

    if (!alumno) return setNoEncontrada(true);

    setBorrador({
      perfil: "alumno",
      matricula: alumno.matricula,
      nombre: alumno.nombre,
      // Lo académico viaja tal como lo entregó Servicios Escolares: el alumno no
      // lo captura, solo lo ve.
      nivel: alumno.nivel,
      programa: alumno.programa,
      avance: alumno.avance,
      grupo: alumno.grupo,
      plantel: alumno.plantel,
      // Si la organización todavía no repartió su día, se le asigna ahora el que
      // va más vacío. Nadie debería quedarse sin pre-registrarse porque una
      // tarea interna esté pendiente.
      dia: diaDe(alumno.matricula),
    });
    // El nombre se confirma en la pantalla siguiente: ahí el alumno ve a quién
    // corresponde la matrícula que escribió y puede corregir si se equivocó.
    navigate({ to: "/confirmar-nombre" });
  };

  const wa = `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
    `Hola, necesito ayuda con mi pre-registro. Matrícula: ${matricula || "(sin capturar)"}.`,
  )}`;

  return (
    <PantallaPublica
      volverA="/bienvenida"
      titulo="Escribe tu matrícula"
      descripcion="Con eso te encontramos en el padrón de alumnos. En la siguiente pantalla verás tu nombre para confirmar que eres tú."
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void buscar();
        }}
        className="rounded-lg border border-border bg-card p-5"
        noValidate
      >
        <div>
          <Label htmlFor="matricula">Matrícula</Label>
          <Input
            id="matricula"
            value={matricula}
            // Se descarta todo lo que no sea dígito en el momento de escribirlo,
            // también al pegar. Un campo que acepta una letra y luego la reprocha
            // es un campo que hace perder el tiempo dos veces.
            onChange={(e) => {
              setMatricula(soloDigitos(e.target.value, LARGO.matricula));
              setError("");
            }}
            placeholder="20262122031"
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={LARGO.matricula}
            className="mt-1.5 h-14 text-center font-mono text-xl tracking-widest"
            aria-invalid={!!error}
          />
          {error ? (
            <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {matricula.length === 0
                ? `Son ${LARGO.matricula} dígitos. Ejemplo del padrón simulado: 20262122031`
                : matricula.length < LARGO.matricula
                  ? `${matricula.length} de ${LARGO.matricula} dígitos`
                  : `Listo, son ${LARGO.matricula} dígitos`}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-6 h-12 w-full text-base" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Buscando en el padrón…
            </>
          ) : (
            <>
              <Search className="size-5" /> Continuar
            </>
          )}
        </Button>
      </form>

      {noEncontrada ? (
        <Alert variant="destructive" className="mt-5">
          <AlertCircle className="size-4" />
          <AlertTitle>No encontramos esa matrícula en el padrón</AlertTitle>
          <AlertDescription className="grid gap-3">
            <span>Revisa que esté bien escrita. Si estás seguro, escríbenos.</span>
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <MessageCircle className="size-4" /> Contactar a soporte por WhatsApp
            </a>
          </AlertDescription>
        </Alert>
      ) : null}
    </PantallaPublica>
  );
}
