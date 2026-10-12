import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { Ayuda, Rotulo, Tarjeta, Texto, Titulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAMPO_MAYUSCULAS,
  MAX_MATRICULA,
  esMatricula,
  soloDigitos,
  soloLetras,
} from "@/lib/campos";
import { CONFERENCIAS_PRELIMINARES, conferenciaDe } from "@/lib/conferencias";
import {
  ESCALA,
  INSTRUMENTOS,
  PREGUNTAS_VISIBLES,
  preguntasVisibles,
  type Instrumento,
  type ValorEscala,
} from "@/lib/encuesta";
import { mensajeDeError } from "@/lib/errores";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { opcion } from "@/lib/estilos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/encuesta")({
  head: () =>
    meta(
      "Evalúa una conferencia — XIV Encuentro Internacional de Educación",
      "Evaluación de las conferencias preliminares al XIV Encuentro Internacional de Educación UPN-212.",
    ),
  component: Encuesta,
});

type Rol = "alumno" | "docente" | "externo";
type Paso = "identificacion" | "conferencia" | "preguntas" | "acuse";

/**
 * Evalúa las conferencias preliminares al XIV Encuentro, una por una.
 *
 * Cuatro pasos: identificación (una sola vez), elegir cuál conferencia se
 * evalúa, las preguntas del instrumento, y el acuse. Desde el acuse se puede
 * volver a elegir conferencia sin repetir la identificación —ver `Acuse`—,
 * pero solo dentro de la misma visita: las tres conferencias están repartidas
 * en dos días y horarios distintos, así que casi nadie va a tener la pestaña
 * abierta de una a otra. Pedir los datos otra vez al volver es lo esperado, no
 * un error.
 *
 * Quien contesta no ve ningún puntaje ni nivel de logro —ver `Acuse`—. El
 * cálculo existe igual, en `lib/encuesta.ts`, y es para el agregado de la
 * coordinación.
 */
function Encuesta() {
  const { configuracion: evento } = useEstadoEvento();
  const [paso, setPaso] = useState<Paso>("identificacion");

  // ---------------------------------------------------------- identidad ---
  const [rol, setRol] = useState<Rol>("alumno");
  const [nombre, setNombre] = useState("");
  const [matricula, setMatricula] = useState("");
  const [correo, setCorreo] = useState("");
  const [programa, setPrograma] = useState("");
  const [errorIdentidad, setErrorIdentidad] = useState("");

  const programas = useMemo(
    () =>
      evento.catalogoAcademico
        .flatMap((n) => n.programas.map((p) => p.nombre))
        .sort((a, b) => a.localeCompare(b)),
    [evento.catalogoAcademico],
  );

  function continuarIdentificacion() {
    if (!nombre.trim()) {
      setErrorIdentidad("Escribe tu nombre completo.");
      return;
    }
    if (rol === "alumno") {
      if (!esMatricula(matricula)) {
        setErrorIdentidad(`Tu matrícula debe tener entre 8 y 11 dígitos.`);
        return;
      }
      if (!programa) {
        setErrorIdentidad("Elige tu licenciatura o maestría.");
        return;
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      setErrorIdentidad("Escribe un correo válido.");
      return;
    }
    setErrorIdentidad("");
    setPaso("conferencia");
  }

  // -------------------------------------------------------- conferencia ---
  const [conferenciaSlug, setConferenciaSlug] = useState<string | null>(null);
  // Qué conferencias ya evaluó, en esta misma visita. Las que ya evaluó no
  // vuelven a ofrecerse: evitar repetirla por accidente importa más que dejar
  // una puerta para corregir un envío, que de cualquier forma no muestra nada
  // que corregir —ver `Acuse`—.
  const [evaluadas, setEvaluadas] = useState<Set<string>>(new Set());
  const porEvaluar = CONFERENCIAS_PRELIMINARES.filter((c) => !evaluadas.has(c.slug));

  function elegirConferencia(slug: string) {
    setConferenciaSlug(slug);
    setRespuestas({});
    setFaltantes(new Set());
    setPaso("preguntas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------- preguntas ---
  const [respuestas, setRespuestas] = useState<Record<number, ValorEscala>>({});
  const [faltantes, setFaltantes] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  /*
   * Para llevar el foco a la primera pregunta sin contestar. Decir «te faltan
   * tres» al pie de una página larga obliga a buscarlas a mano.
   */
  const bloques = useRef(new Map<number, HTMLFieldSetElement>());

  const contestadas = Object.keys(respuestas).length;
  const completa = contestadas === PREGUNTAS_VISIBLES.length;

  function responder(numero: number, valor: ValorEscala) {
    setRespuestas((previas) => ({ ...previas, [numero]: valor }));
    setFaltantes((previas) => {
      if (!previas.has(numero)) return previas;
      const quedan = new Set(previas);
      quedan.delete(numero);
      return quedan;
    });
  }

  async function enviar() {
    // Solo las VISIBLES pueden exigirse: una pregunta oculta no tiene dónde
    // contestarse, y pedirla dejaría el botón de enviar roto para siempre.
    const sinContestar = PREGUNTAS_VISIBLES.filter((p) => respuestas[p.numero] === undefined);
    if (sinContestar.length > 0) {
      setFaltantes(new Set(sinContestar.map((p) => p.numero)));
      bloques.current.get(sinContestar[0]!.numero)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    if (!conferenciaSlug) return;
    setFaltantes(new Set());
    setEnviando(true);
    try {
      if (hayBaseDeDatos) {
        const d = await import("@/lib/datos");
        await d.evaluarConferencia({
          conferencia: conferenciaSlug,
          perfil: rol,
          nombre: nombre.trim(),
          matricula: rol === "alumno" ? matricula : undefined,
          programa: rol === "alumno" ? programa : undefined,
          correo: rol !== "alumno" ? correo.trim().toLowerCase() : undefined,
          respuestas,
        });
      }
      setEvaluadas((previas) => new Set(previas).add(conferenciaSlug));
      setPaso("acuse");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const conferencia = conferenciaSlug ? conferenciaDe(conferenciaSlug) : undefined;

  return (
    <PantallaPublica ancho="lg" variante="portada">
      <header>
        <Rotulo className="text-primary">Evaluación de conferencias</Rotulo>
        <Titulo className="mt-2">
          {evento.nombre || "XIV Encuentro Internacional de Educación UPN-212"}
        </Titulo>
        <Texto className="mt-3">
          Programa de actividades preliminares, modalidad virtual. Evalúa cada conferencia que hayas
          visto.
        </Texto>
      </header>

      {paso === "identificacion" ? (
        <Identificacion
          rol={rol}
          onRol={(r) => {
            setRol(r);
            setErrorIdentidad("");
          }}
          nombre={nombre}
          onNombre={setNombre}
          matricula={matricula}
          onMatricula={setMatricula}
          correo={correo}
          onCorreo={setCorreo}
          programa={programa}
          onPrograma={setPrograma}
          programas={programas}
          error={errorIdentidad}
          onContinuar={continuarIdentificacion}
        />
      ) : paso === "conferencia" ? (
        <SelectorConferencia opciones={porEvaluar} onElegir={elegirConferencia} />
      ) : paso === "preguntas" && conferencia ? (
        <>
          <Rotulo className="mt-6 text-primary">{conferencia.titulo}</Rotulo>

          <Seccion
            instrumento="impacto"
            respuestas={respuestas}
            faltantes={faltantes}
            onResponder={responder}
            bloques={bloques}
          />
          <Seccion
            instrumento="seguimiento"
            respuestas={respuestas}
            faltantes={faltantes}
            onResponder={responder}
            bloques={bloques}
          />

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={enviando}
              onClick={() => void enviar()}
            >
              {enviando ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              {enviando ? "Enviando…" : "Enviar mis respuestas"}
            </Button>
            {faltantes.size > 0 ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                Te{" "}
                {faltantes.size === 1 ? "falta 1 pregunta" : `faltan ${faltantes.size} preguntas`}{" "}
                por contestar.
              </p>
            ) : (
              <Ayuda>
                {completa
                  ? `Ya contestaste las ${PREGUNTAS_VISIBLES.length}.`
                  : `Contesta las ${PREGUNTAS_VISIBLES.length} afirmaciones para poder enviarlas.`}
              </Ayuda>
            )}
          </div>
        </>
      ) : (
        <Acuse
          conferencia={conferencia}
          quedanPorEvaluar={porEvaluar.length > 0}
          onEvaluarOtra={() => setPaso("conferencia")}
        />
      )}
    </PantallaPublica>
  );
}

/** El paso de identificación: rol y los datos que le corresponden. */
function Identificacion({
  rol,
  onRol,
  nombre,
  onNombre,
  matricula,
  onMatricula,
  correo,
  onCorreo,
  programa,
  onPrograma,
  programas,
  error,
  onContinuar,
}: {
  rol: Rol;
  onRol: (r: Rol) => void;
  nombre: string;
  onNombre: (v: string) => void;
  matricula: string;
  onMatricula: (v: string) => void;
  correo: string;
  onCorreo: (v: string) => void;
  programa: string;
  onPrograma: (v: string) => void;
  programas: string[];
  error: string;
  onContinuar: () => void;
}) {
  const OPCIONES_ROL: { valor: Rol; titulo: string; detalle: string }[] = [
    { valor: "alumno", titulo: "Alumno", detalle: "Me identifico con mi matrícula." },
    { valor: "docente", titulo: "Docente", detalle: "Doy clase en una institución." },
    { valor: "externo", titulo: "Externo", detalle: "Público en general." },
  ];

  return (
    <Tarjeta className="mt-6 p-5 lg:p-6">
      <Rotulo como="span">¿Quién contesta?</Rotulo>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {OPCIONES_ROL.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={rol === o.valor}
            onClick={() => onRol(o.valor)}
            className={cn("min-h-12 rounded-md border p-3 text-left", opcion(rol === o.valor))}
          >
            <span className="block text-sm font-semibold">{o.titulo}</span>
            <span
              className={cn(
                "mt-0.5 block text-xs leading-snug",
                rol === o.valor ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {o.detalle}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4">
        <div>
          <Label htmlFor="nombre">Nombre completo</Label>
          <Input
            id="nombre"
            value={nombre}
            onChange={(e) => onNombre(soloLetras(e.target.value, 100))}
            {...CAMPO_MAYUSCULAS}
            placeholder="JUAN CARLOS PÉREZ LÓPEZ"
            className="mt-1.5 h-12 md:h-11 text-base uppercase"
          />
        </div>

        {rol === "alumno" ? (
          <>
            <div>
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                value={matricula}
                onChange={(e) => onMatricula(soloDigitos(e.target.value, MAX_MATRICULA))}
                inputMode="numeric"
                placeholder="202012345"
                className="mt-1.5 h-12 md:h-11 text-base"
              />
            </div>
            <div>
              <Label htmlFor="programa">Licenciatura o maestría</Label>
              <select
                id="programa"
                value={programa}
                onChange={(e) => onPrograma(e.target.value)}
                className="mt-1.5 h-12 md:h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              >
                <option value="">Elige tu programa</option>
                {programas.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="correo">Correo</Label>
            <Input
              id="correo"
              type="email"
              value={correo}
              onChange={(e) => onCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="mt-1.5 h-12 md:h-11 text-base"
            />
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button size="lg" className="mt-5 w-full sm:w-auto" onClick={onContinuar}>
        Continuar
      </Button>
    </Tarjeta>
  );
}

/** El paso de elegir cuál conferencia se evalúa. */
function SelectorConferencia({
  opciones,
  onElegir,
}: {
  opciones: readonly (typeof CONFERENCIAS_PRELIMINARES)[number][];
  onElegir: (slug: string) => void;
}) {
  return (
    <div className="mt-6">
      <Rotulo como="span">¿Cuál conferencia vas a evaluar?</Rotulo>
      <div className="mt-3 grid gap-3">
        {opciones.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onElegir(c.slug)}
            className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <span className="block text-sm font-semibold">{c.titulo}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {c.ponente} · {c.pais}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {c.fecha}, {c.hora}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Uno de los dos instrumentos, con sus preguntas. */
function Seccion({
  instrumento,
  respuestas,
  faltantes,
  onResponder,
  bloques,
}: {
  instrumento: Instrumento;
  respuestas: Record<number, ValorEscala>;
  faltantes: Set<number>;
  onResponder: (numero: number, valor: ValorEscala) => void;
  bloques: React.RefObject<Map<number, HTMLFieldSetElement>>;
}) {
  const { titulo, descripcion } = INSTRUMENTOS[instrumento];

  return (
    <section className="mt-8">
      <Rotulo className="text-primary">{titulo}</Rotulo>
      <Texto className="mt-1.5">{descripcion}</Texto>

      {/*
       * La leyenda de la escala, una vez por sección y solo en pantalla
       * angosta. De `md:` en adelante cada botón lleva su etiqueta completa
       * —como las columnas del cuestionario impreso— y repetirla aquí sería
       * decir lo mismo dos veces; en el teléfono los botones solo caben con el
       * número, así que el número necesita quien lo traduzca.
       */}
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground md:hidden">
        {ESCALA.map((o) => (
          <li key={o.valor}>
            <span className="font-semibold text-foreground">{o.valor}</span> {o.etiqueta}
          </li>
        ))}
      </ul>

      <Tarjeta className="mt-4 grid gap-6 p-5">
        {preguntasVisibles(instrumento).map((pregunta) => (
          <ReactivoLikert
            key={pregunta.numero}
            numero={pregunta.numero}
            texto={pregunta.texto}
            valor={respuestas[pregunta.numero]}
            falta={faltantes.has(pregunta.numero)}
            onResponder={onResponder}
            bloques={bloques}
          />
        ))}
      </Tarjeta>
    </section>
  );
}

/** Una afirmación y sus cinco opciones. */
function ReactivoLikert({
  numero,
  texto,
  valor,
  falta,
  onResponder,
  bloques,
}: {
  numero: number;
  texto: string;
  valor: ValorEscala | undefined;
  falta: boolean;
  onResponder: (numero: number, valor: ValorEscala) => void;
  bloques: React.RefObject<Map<number, HTMLFieldSetElement>>;
}) {
  const elegida = ESCALA.find((o) => o.valor === valor);

  return (
    <fieldset
      ref={(nodo) => {
        if (nodo) bloques.current.set(numero, nodo);
        else bloques.current.delete(numero);
      }}
      /*
       * `scroll-mt-24` para que al llevar el foco a una pregunta sin contestar
       * no quede pegada al borde superior de la ventana.
       */
      className={cn(
        "scroll-mt-24 border-t border-border pt-6 first:border-0 first:pt-0",
        falta && "rounded-md border border-destructive bg-destructive/5 p-4",
      )}
    >
      <legend className="text-sm font-medium leading-snug">
        <span className="font-bold text-primary">{numero}.</span> {texto}
      </legend>

      {/*
       * Cinco columnas siempre, también en el teléfono: la escala se lee de una
       * punta a la otra, y apilada en vertical deja de verse como una escala.
       * A 360 px de ancho le tocan unos 60 px por botón, que es más que el
       * objetivo táctil mínimo.
       */}
      <div className="mt-3 grid grid-cols-5 gap-1.5 md:gap-2">
        {ESCALA.map((o) => {
          const activa = valor === o.valor;
          return (
            <label
              key={o.valor}
              className={cn(
                "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-center transition-colors focus-within:ring-2 focus-within:ring-ring md:min-h-24 md:gap-1.5 md:px-2",
                opcion(activa),
              )}
            >
              <input
                type="radio"
                name={`pregunta-${numero}`}
                value={o.valor}
                checked={activa}
                onChange={() => onResponder(numero, o.valor)}
                className="sr-only"
              />
              <span className="text-lg font-bold leading-none tabular-nums md:text-xl">
                {o.valor}
              </span>
              {/*
               * La etiqueta completa solo de `md:` en adelante. El lector de
               * pantalla la recibe siempre por el texto oculto de abajo, así
               * que esconderla en el teléfono no deja a nadie sin ella.
               */}
              <span
                aria-hidden
                className={cn(
                  "hidden text-[11px] leading-tight md:block",
                  activa ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                {o.etiqueta}
              </span>
              <span className="sr-only">{o.etiqueta}</span>
            </label>
          );
        })}
      </div>

      {/*
       * En el teléfono, lo marcado escrito con palabras. El número por sí solo
       * no confirma nada: quien eligió el 2 queriendo el 4 no lo nota hasta
       * que lee «En desacuerdo».
       */}
      {elegida ? (
        <p className="mt-2 text-xs font-medium text-primary md:hidden">
          Elegiste: {elegida.etiqueta}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Lo que se ve al terminar de evaluar una conferencia: un acuse, y nada más.
 *
 * Sin puntaje, sin nivel de logro. **La calificación no es para quien
 * contesta**: el instrumento mide la conferencia, no a la persona, y
 * devolverle un veredicto a quien acaba de dedicarle diez minutos la convierte
 * en una nota sobre ella. El cálculo —`nivelDeLogro`, los rangos— sigue
 * entero en `lib/encuesta.ts`, para cuando la coordinación lo lea sobre el
 * agregado.
 */
function Acuse({
  conferencia,
  quedanPorEvaluar,
  onEvaluarOtra,
}: {
  conferencia: { titulo: string } | undefined;
  quedanPorEvaluar: boolean;
  onEvaluarOtra: () => void;
}) {
  return (
    <div className="mt-6">
      <Tarjeta className="text-center">
        <CheckCircle2 className="mx-auto size-8 text-estado-pagado" aria-hidden />
        <p className="mt-3 text-lg font-bold tracking-tight">Gracias por responder</p>
        <p className="mx-auto mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          {conferencia ? (
            <>
              Tu evaluación de <strong className="font-semibold">{conferencia.titulo}</strong> quedó
              registrada. Tus respuestas se analizan en conjunto, no una por una.
            </>
          ) : (
            "Tus respuestas se analizan en conjunto, no una por una."
          )}
        </p>
      </Tarjeta>

      {quedanPorEvaluar ? (
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={onEvaluarOtra}>
            Evaluar otra conferencia
          </Button>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Ya evaluaste las tres conferencias preliminares. Gracias por tu tiempo.
        </p>
      )}
    </div>
  );
}
