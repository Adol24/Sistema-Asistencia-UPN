import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, MessageCircle, Search } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LARGOS_MATRICULA_EN_TEXTO, MAX_MATRICULA, esMatricula, soloDigitos } from "@/lib/campos";
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
  const { borrador, setBorrador, reset } = usePrototipo();
  const { configuracion: evento } = useEstadoEvento();
  const [matricula, setMatricula] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [noEncontrada, setNoEncontrada] = useState(false);

  const buscar = async () => {
    if (!matricula) return setError("Escribe tu matrícula.");
    /*
     * El campo ya impide las letras, así que lo único que puede estar mal es la
     * cantidad de dígitos. No se dice cuántos «faltan» porque con dos largos
     * válidos nadie puede saberlo: quien lleva nueve puede estar sobrando uno
     * de ocho o faltándole dos de once. Se dice cuáles son los largos y cuántos
     * escribió, y que él decida cuál de los dos es el suyo.
     */
    if (!esMatricula(matricula))
      return setError(
        `La matrícula son ${LARGOS_MATRICULA_EN_TEXTO} dígitos, y escribiste ${matricula.length}.`,
      );
    setError("");
    setNoEncontrada(false);
    setCargando(true);

    /*
     * Este paso solo pregunta si la matrícula existe. Nada más.
     *
     * Antes traía aquí el expediente completo —nombre, programa, plantel— y lo
     * dejaba en el borrador, así que el nombre estaba en el navegador ANTES de
     * comprobar la identidad. La pantalla siguiente lo tapaba, pero taparlo no
     * es lo mismo que no tenerlo: cualquiera podía leerlo en la memoria de la
     * página. Ahora el expediente lo entrega el servidor solo después del reto,
     * en `/confirmar-nombre`.
     */
    /*
     * `existeEnPadronRemoto` devuelve también `ya_registrado`, y aquí se
     * DESCARTA a propósito.
     *
     * A esta pantalla llega cualquiera con cualquier matrícula, y todavía no ha
     * demostrado que sea la suya. Contestarle «esa ya se registró» entrega un
     * dato de otra persona a quien no es ella: el mismo buscador del padrón que
     * el reto de `/confirmar-nombre` viene a cerrar.
     *
     * El aviso de «ya tienes tu pre-registro» se da allí, después del reto, con
     * la misma bandera que trae la ficha. No se suba aquí.
     */
    let existe: boolean;
    try {
      const { existeEnPadronRemoto } = await import("@/lib/datos");
      existe = (await existeEnPadronRemoto(matricula)).existe;
    } catch (e) {
      setCargando(false);
      const { esTopePorConexion } = await import("@/lib/datos");
      // Dos fallos distintos que se leían igual. Ver `esTopePorConexion`.
      return setError(
        esTopePorConexion(e)
          ? "Hay muchas personas registrándose desde esta misma red. Espera unos minutos y vuelve a intentarlo, o usa tus datos móviles."
          : "No pudimos comprobar tu matrícula. Inténtalo de nuevo en un momento.",
      );
    }
    setCargando(false);

    if (!existe) return setNoEncontrada(true);

    /*
     * Una matrícula distinta a la del borrador es OTRA PERSONA, y hay que
     * vaciar lo anterior antes de empezar.
     *
     * Hace falta desde que el borrador sobrevive a la recarga: en el equipo
     * prestado de una sala, quien se registra después heredaba el folio, el
     * nombre y el día de quien lo hizo antes, porque `setBorrador` mezcla sobre
     * lo que había. Cuando vivía en memoria, recargar lo limpiaba por accidente
     * y el problema no se veía.
     */
    if (borrador.matricula && borrador.matricula !== matricula) reset();
    setBorrador({ perfil: "alumno", matricula });
    // La identidad se comprueba en la pantalla siguiente. Solo si se supera, el
    // servidor devuelve a quién corresponde esta matrícula.
    navigate({ to: "/confirmar-nombre" });
  };

  const wa = `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
    `Hola, necesito ayuda con mi pre-registro. Matrícula: ${matricula || "(sin capturar)"}.`,
  )}`;

  return (
    <PantallaPublica
      titulo="Escribe tu matrícula"
      descripcion="Con eso te buscamos en los registros de Servicios Escolares. En la siguiente pantalla verás tu nombre para confirmar que eres tú."
    >
      {/*
       * La tarjeta se acota, y es la excepción que confirma la regla de
       * `PantallaPublica`: ahí el contenedor creció para que los formularios
       * repartan sus campos en columnas, y esta pantalla tiene UN campo. Sin
       * tope, a 1280 la matrícula se escribía en una caja de 664 px para once
       * dígitos. Se acota aquí y no allá porque el único sitio donde se sabe
       * cuánto mide lo que se escribe dentro es el que lo pide.
       */}
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void buscar();
        }}
        className="mx-auto w-full max-w-lg rounded-lg border border-border bg-card p-5 lg:p-6"
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
              setMatricula(soloDigitos(e.target.value, MAX_MATRICULA));
              setError("");
            }}
            placeholder="20262122031"
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={MAX_MATRICULA}
            className="mt-1.5 h-14 text-center font-mono text-xl tracking-widest"
            aria-invalid={!!error}
          />
          {error ? (
            <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {matricula.length === 0
                ? `Son ${LARGOS_MATRICULA_EN_TEXTO} dígitos. Ejemplo de la lista simulada: 20262122031`
                : esMatricula(matricula)
                  ? `Listo, son ${matricula.length} dígitos`
                  : `${matricula.length} dígitos: la matrícula son ${LARGOS_MATRICULA_EN_TEXTO}`}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-6 h-12 md:h-11 w-full text-base" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Buscando tu matrícula…
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
          <AlertTitle>No encontramos esa matrícula</AlertTitle>
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
