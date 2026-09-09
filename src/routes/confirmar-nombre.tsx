import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Info, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { usePrototipo } from "@/lib/prototipo";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { buscarEnPadron } from "@/mocks/alumnosPadron";
import { useEstadoEvento } from "@/lib/estado-evento";
import { nombreConstancia } from "@/lib/elegibilidad";
import { meta } from "@/lib/seo";

/** Intentos antes de cerrar la pantalla y mandar a soporte. */
const INTENTOS = 3;

/**
 * ¿Los nombres de pila escritos corresponden al inicio del nombre del padrón?
 *
 * Se compara token por token desde el principio, no con `startsWith` sobre la
 * cadena: así «JUAN» acierta contra «JUAN CARLOS PEREZ MUÑOZ» y «JUA» no. El
 * padrón guarda el nombre completo en una sola columna —sin separar nombres de
 * apellidos—, así que comparar por prefijo de palabras es lo más que se puede
 * afirmar sin inventar una división que el dato no trae.
 */
function coincidenNombres(escrito: string, completo: string): boolean {
  const partes = nombreConstancia(escrito).split(" ").filter(Boolean);
  if (partes.length === 0) return false;
  const reales = nombreConstancia(completo).split(" ").filter(Boolean);
  // Escribir el nombre entero, apellidos incluidos, también vale.
  if (partes.length > reales.length) return false;
  return partes.every((parte, i) => parte === reales[i]);
}

export const Route = createFileRoute("/confirmar-nombre")({
  head: () =>
    meta(
      "Confirmación de nombre — XIV Encuentro Internacional de Educación",
      "Verifica que tu nombre sea correcto: es el nombre con el que quedas registrado en el XIV Encuentro Internacional de Educación.",
    ),
  component: ConfirmarNombre,
});

function ConfirmarNombre() {
  const navigate = useNavigate();
  const { borrador, participante, setBorrador } = usePrototipo();
  const { abrirCasoNombre, configuracion: evento, diaDe } = useEstadoEvento();
  // La matrícula es lo único que `/alumno` deja: el resto lo entrega el servidor
  // cuando se supera el reto.
  const matricula = borrador.matricula ?? participante.matricula ?? "";
  const nombre = borrador.nombre ?? participante.nombre;
  const folio = participante.folio;
  const [opcion, setOpcion] = useState<"correcto" | "incorrecto" | null>(null);
  const [correccion, setCorreccion] = useState("");
  const [errorCorreccion, setErrorCorreccion] = useState("");

  /*
   * Comprobación de identidad antes de enseñar el nombre.
   *
   * A esta pantalla se llega escribiendo una matrícula en `/alumno`, y nada
   * garantiza que quien la escribe sea su dueño. Mostrar el nombre de entrada
   * convertía el pre-registro en un buscador del padrón: con matrículas al azar
   * se cosechaban nombres.
   *
   * Se piden dos datos que el dueño sabe de memoria y un extraño no: sus
   * nombres de pila y su programa. Lo importante no es que sean secretos
   * difíciles, sino que **hay que aportarlos para ver el nombre**, así que ya no
   * se puede extraer lo que no se sabe. Un atacante con un nombre de pila común
   * todavía puede confirmar o descartar una pareja que ya sospecha; eso es un
   * oráculo mucho más pobre que la cosecha libre, y se estrecha con el límite de
   * intentos.
   *
   * En un sistema real esto va acompañado de un límite por IP en el servidor:
   * un contador en el navegador se salta recargando la página.
   */
  const [verificado, setVerificado] = useState(false);
  const [nombresPila, setNombresPila] = useState("");
  const [programa, setPrograma] = useState("");
  const [errorIdentidad, setErrorIdentidad] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [comprobando, setComprobando] = useState(false);
  const bloqueado = intentos >= INTENTOS;

  const programas = useMemo(
    () => evento.catalogoAcademico.flatMap((n) => n.programas).sort((a, b) => a.localeCompare(b)),
    [evento.catalogoAcademico],
  );

  const wa = `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
    "Hola, no puedo confirmar mis datos para el pre-registro.",
  )}`;

  /*
   * El reto lo resuelve el servidor cuando hay base de datos.
   *
   * `fn_padron_confirmar` recibe la matrícula, los nombres y el programa, y
   * devuelve el expediente solo si los tres casan; si no, devuelve nulo. Así la
   * comprobación deja de ser una condición del navegador —que cualquiera puede
   * saltarse llamando a la API— y el nombre no llega al cliente hasta que se
   * gana el derecho a verlo. La función lleva además el límite por IP.
   *
   * Sin base configurada se comprueba en local contra el padrón simulado, que es
   * lo único que hay, y se anota como tal.
   */
  async function verificar() {
    if (!nombresPila.trim() || !programa) {
      setErrorIdentidad("Completa los dos datos.");
      return;
    }
    setComprobando(true);
    let ok = false;
    try {
      if (hayBaseDeDatos) {
        const { confirmarEnPadronRemoto } = await import("@/lib/datos");
        const ficha = await confirmarEnPadronRemoto(matricula, nombresPila, programa);
        if (ficha) {
          ok = true;
          // El expediente llega ahora, no antes. Se guarda para los pasos
          // siguientes del pre-registro.
          setBorrador({
            nombre: ficha.nombre,
            nivel: ficha.nivel,
            programa: ficha.programa,
            avance: ficha.avance,
            grupo: ficha.grupo ?? undefined,
            plantel: ficha.plantel,
            dia: diaDe(matricula),
          });
        }
      } else {
        const alumno = buscarEnPadron(matricula);
        ok =
          !!alumno &&
          coincidenNombres(nombresPila, alumno.nombre) &&
          nombreConstancia(programa) === nombreConstancia(alumno.programa);
        if (ok && alumno)
          setBorrador({
            nombre: alumno.nombre,
            nivel: alumno.nivel,
            programa: alumno.programa,
            avance: alumno.avance,
            grupo: alumno.grupo,
            plantel: alumno.plantel,
            dia: diaDe(matricula),
          });
      }
    } catch {
      setComprobando(false);
      setErrorIdentidad("No pudimos comprobar tus datos. Inténtalo de nuevo en un momento.");
      return;
    }
    setComprobando(false);

    if (ok) {
      setErrorIdentidad("");
      setVerificado(true);
      return;
    }
    const usados = intentos + 1;
    setIntentos(usados);
    setErrorIdentidad(
      usados >= INTENTOS
        ? "No pudimos confirmar que estos datos sean tuyos."
        : `Esos datos no coinciden con la matrícula. Te ${INTENTOS - usados === 1 ? "queda 1 intento" : `quedan ${INTENTOS - usados} intentos`}.`,
    );
  }

  if (!verificado) {
    return (
      <PantallaPublica
        titulo="Confirma que eres tú"
        descripcion="Antes de mostrarte tu nombre necesitamos comprobar que la matrícula es tuya."
        volverA="/alumno"
      >
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Son datos que sabes de memoria. Así nadie puede consultar el padrón escribiendo
            matrículas que no le pertenecen.
          </p>

          <div className="mt-5 grid gap-4">
            <div>
              <Label htmlFor="nombres">Tus nombres, sin apellidos</Label>
              <Input
                id="nombres"
                value={nombresPila}
                onChange={(e) => {
                  setNombresPila(e.target.value);
                  setErrorIdentidad("");
                }}
                {...CAMPO_MAYUSCULAS}
                placeholder="JUAN CARLOS"
                autoFocus
                autoComplete="off"
                disabled={bloqueado}
                className="mt-1.5 h-12 text-base uppercase"
                aria-invalid={!!errorIdentidad}
              />
            </div>

            <div>
              <Label htmlFor="programa">Tu programa</Label>
              <select
                id="programa"
                value={programa}
                onChange={(e) => {
                  setPrograma(e.target.value);
                  setErrorIdentidad("");
                }}
                disabled={bloqueado}
                className="mt-1.5 h-12 w-full rounded-md border border-input bg-background px-3 text-base disabled:opacity-50"
                aria-invalid={!!errorIdentidad}
              >
                <option value="">Elige tu programa</option>
                {programas.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorIdentidad ? (
            <p className="mt-3 text-xs font-medium text-destructive">{errorIdentidad}</p>
          ) : null}

          {bloqueado ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground"
            >
              <MessageCircle className="size-4" aria-hidden /> Escribir a soporte
            </a>
          ) : (
            <Button
              className="mt-5 h-12 w-full text-base"
              disabled={comprobando}
              onClick={() => void verificar()}
            >
              {comprobando ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              {comprobando ? "Comprobando…" : "Continuar"}
            </Button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          ¿Te equivocaste de matrícula?{" "}
          <Link to="/alumno" className="underline">
            Escríbela de nuevo
          </Link>
        </p>
      </PantallaPublica>
    );
  }

  return (
    <PantallaPublica
      titulo="Confirma tu nombre"
      descripcion="Revísalo con calma: corregirlo después toma más tiempo."
      volverA="/alumno"
    >
      {/*
       * El nombre es el único contenido de esta tarjeta. Antes lo acompañaban
       * tres líneas más —una instrucción, el formato y una advertencia—, y el
       * dato que hay que verificar quedaba compitiendo con ellas. La instrucción
       * y la advertencia subieron al encabezado de la pantalla; aquí solo queda
       * lo que el ojo tiene que revisar.
       */}
      <div className="rounded-lg border-2 border-primary/25 bg-card px-5 py-8 text-center">
        <p className="text-balance text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
          {nombre}
        </p>
        <p className="mx-auto mt-4 max-w-sm text-pretty text-xs text-muted-foreground">
          Formato: Nombre(s), Apellido Paterno, Apellido Materno — todo en MAYÚSCULAS y sin acentos.
        </p>
      </div>

      <fieldset className="mt-6 grid gap-2">
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
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <Label htmlFor="correccion">¿Cómo debe decir tu nombre?</Label>
          <Input
            id="correccion"
            value={correccion}
            onChange={(e) => {
              setCorreccion(e.target.value);
              setErrorCorreccion("");
            }}
            placeholder={nombre}
            className="mt-1.5 h-12 text-base uppercase"
            {...CAMPO_MAYUSCULAS}
            aria-invalid={!!errorCorreccion}
          />
          {errorCorreccion ? (
            <p className="mt-2 text-xs font-medium text-destructive">{errorCorreccion}</p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
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
            // Se convierte aquí, no al teclear: ver `CAMPO_MAYUSCULAS`.
            const limpio = correccion.trim().replace(/\s+/g, " ").toUpperCase();
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
      <p className="mt-4 text-center text-xs text-muted-foreground">
        ¿Te equivocaste de perfil?{" "}
        <Link to="/bienvenida" className="underline">
          Vuelve al inicio
        </Link>
      </p>
    </PantallaPublica>
  );
}
