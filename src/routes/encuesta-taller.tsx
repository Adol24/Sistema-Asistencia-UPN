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
import { ESCALA, PREGUNTAS_TALLER, type ValorEscala } from "@/lib/encuesta-talleres";
import { mensajeDeError } from "@/lib/errores";
import { hoyIso } from "@/lib/formato";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { opcion } from "@/lib/estilos";
import { cn } from "@/lib/utils";
import type { TallerBase } from "@/dominio/tipos";

export const Route = createFileRoute("/encuesta-taller")({
  head: () =>
    meta(
      "Evalúa un taller — XIV Encuentro Internacional de Educación",
      "Evaluación de los talleres del XIV Encuentro Internacional de Educación UPN-212.",
    ),
  component: EncuestaTaller,
});

type Rol = "alumno" | "docente" | "externo";
type Paso = "identificacion" | "taller" | "preguntas" | "acuse";

/**
 * Evalúa los talleres del Encuentro, uno por uno.
 *
 * Mismos cuatro pasos que `/encuesta` —identificación, elegir qué se evalúa,
 * las preguntas y el acuse—, pero lo que se elige no es un slug fijo: son los
 * talleres que ya existen en la base, con su cupo y su `activo`. Un taller
 * dado de baja deja de ofrecerse aquí igual que en `/talleres`.
 *
 * Quien contesta no ve ningún puntaje: el instrumento no lo calcula —ver
 * `lib/encuesta-talleres.ts`—, a diferencia del de conferencias, que sí lo
 * hace y de todos modos lo oculta.
 *
 * Los talleres se imparten en dos tardes —jueves y viernes—, algunos un solo
 * día y otros los dos. Un taller no se ofrece aquí hasta que de verdad ya
 * ocurrió: si se impartiera el viernes y alguien lo evaluara el jueves,
 * estaría calificando algo a lo que todavía no asistió. Se compara contra la
 * fecha LOCAL (`hoyIso`), no con `new Date(fecha)`, por la misma razón que
 * `diaRealDeHoy`: parsear un `AAAA-MM-DD` con `new Date` lo lee en UTC y
 * adelanta el día varias horas respecto a México.
 */
function EncuestaTaller() {
  const { configuracion: evento, talleres: catalogo } = useEstadoEvento();
  const [paso, setPaso] = useState<Paso>("identificacion");

  const activos = useMemo(() => catalogo.filter((t) => t.activo), [catalogo]);

  const yaImpartido = (t: TallerBase): boolean => {
    if (t.dias.length === 0) return false;
    const ultimoDia = Math.max(...t.dias);
    const fecha = evento.dias.find((d) => d.dia === ultimoDia)?.fecha ?? "";
    return fecha !== "" && fecha.slice(0, 10) <= hoyIso();
  };

  const talleres = useMemo(
    () => activos.filter(yaImpartido),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activos, evento.dias],
  );
  // Activos que existen pero cuyo turno todavía no llega: distinto de «ya los
  // evaluaste todos», que es lo que diría el acuse sin esta distinción.
  const faltanPorLlegar = activos.length > talleres.length;

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
    setPaso("taller");
  }

  // -------------------------------------------------------------- taller ---
  const [tallerId, setTallerId] = useState<string | null>(null);
  // Qué talleres ya evaluó, en esta misma visita. Mismo criterio que
  // `evaluadas` en `/encuesta`: no se vuelven a ofrecer.
  const [evaluados, setEvaluados] = useState<Set<string>>(new Set());
  const porEvaluar = talleres.filter((t) => !evaluados.has(t.id));

  function elegirTaller(id: string) {
    setTallerId(id);
    setRespuestas({});
    setFaltantes(new Set());
    setPaso("preguntas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------- preguntas ---
  const [respuestas, setRespuestas] = useState<Record<number, ValorEscala>>({});
  const [faltantes, setFaltantes] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const bloques = useRef(new Map<number, HTMLFieldSetElement>());

  const contestadas = Object.keys(respuestas).length;
  const completa = contestadas === PREGUNTAS_TALLER.length;

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
    const sinContestar = PREGUNTAS_TALLER.filter((p) => respuestas[p.numero] === undefined);
    if (sinContestar.length > 0) {
      setFaltantes(new Set(sinContestar.map((p) => p.numero)));
      bloques.current.get(sinContestar[0]!.numero)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    if (!tallerId) return;
    setFaltantes(new Set());
    setEnviando(true);
    try {
      if (hayBaseDeDatos) {
        const d = await import("@/lib/datos");
        await d.evaluarTaller({
          taller: tallerId,
          perfil: rol,
          nombre: nombre.trim(),
          matricula: rol === "alumno" ? matricula : undefined,
          programa: rol === "alumno" ? programa : undefined,
          correo: rol !== "alumno" ? correo.trim().toLowerCase() : undefined,
          respuestas,
        });
      }
      setEvaluados((previas) => new Set(previas).add(tallerId));
      setPaso("acuse");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const taller = tallerId ? talleres.find((t) => t.id === tallerId) : undefined;

  return (
    <PantallaPublica ancho="lg" variante="portada">
      <header>
        <Rotulo className="text-primary">Evaluación de talleres</Rotulo>
        <Titulo className="mt-2">
          {evento.nombre || "XIV Encuentro Internacional de Educación UPN-212"}
        </Titulo>
        <Texto className="mt-3">Evalúa cada taller al que hayas asistido.</Texto>
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
      ) : paso === "taller" ? (
        <SelectorTaller
          opciones={porEvaluar}
          faltanPorLlegar={faltanPorLlegar}
          onElegir={elegirTaller}
        />
      ) : paso === "preguntas" && taller ? (
        <>
          <Rotulo className="mt-6 text-primary">{taller.nombre}</Rotulo>

          <Tarjeta className="mt-4 grid gap-6 p-5">
            {PREGUNTAS_TALLER.map((pregunta) => (
              <ReactivoLikert
                key={pregunta.numero}
                numero={pregunta.numero}
                texto={pregunta.texto}
                valor={respuestas[pregunta.numero]}
                falta={faltantes.has(pregunta.numero)}
                onResponder={responder}
                bloques={bloques}
              />
            ))}
          </Tarjeta>

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
                  ? `Ya contestaste las ${PREGUNTAS_TALLER.length}.`
                  : `Contesta las ${PREGUNTAS_TALLER.length} afirmaciones para poder enviarlas.`}
              </Ayuda>
            )}
          </div>
        </>
      ) : (
        <Acuse
          taller={taller}
          quedanPorEvaluar={porEvaluar.length > 0}
          faltanPorLlegar={faltanPorLlegar}
          onEvaluarOtro={() => setPaso("taller")}
        />
      )}
    </PantallaPublica>
  );
}

/** El paso de identificación: rol y los datos que le corresponden. Idéntico al de `/encuesta`. */
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

/** El paso de elegir cuál taller se evalúa. */
function SelectorTaller({
  opciones,
  faltanPorLlegar,
  onElegir,
}: {
  opciones: TallerBase[];
  faltanPorLlegar: boolean;
  onElegir: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <Rotulo como="span">¿Cuál taller vas a evaluar?</Rotulo>
      <div className="mt-3 grid gap-3">
        {opciones.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onElegir(t.id)}
            className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <span className="block text-sm font-semibold">{t.nombre}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t.ponente}</span>
          </button>
        ))}
        {opciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {faltanPorLlegar
              ? "Todavía no se ha impartido ningún taller que puedas evaluar. Vuelve cuando termine tu sesión."
              : "Ya evaluaste todos los talleres disponibles hasta ahora."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Uno de los diez reactivos y sus cinco opciones. Idéntico al de `/encuesta`. */
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
  return (
    <fieldset
      ref={(nodo) => {
        if (nodo) bloques.current.set(numero, nodo);
        else bloques.current.delete(numero);
      }}
      className={cn(
        "scroll-mt-24 border-t border-border pt-6 first:border-0 first:pt-0",
        falta && "rounded-md border border-destructive bg-destructive/5 p-4",
      )}
    >
      <legend className="text-sm font-medium leading-snug">
        <span className="font-bold text-primary">{numero}.</span> {texto}
      </legend>

      <div className="mt-3 grid grid-cols-5 gap-1 md:gap-2">
        {ESCALA.map((o) => {
          const activa = valor === o.valor;
          return (
            <label
              key={o.valor}
              className={cn(
                "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-center text-[10px] leading-tight transition-colors focus-within:ring-2 focus-within:ring-ring md:min-h-24 md:gap-1.5 md:px-2 md:text-xs",
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
              <span>{o.etiqueta}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Lo que se ve al terminar de evaluar un taller: un acuse, y nada más. */
function Acuse({
  taller,
  quedanPorEvaluar,
  faltanPorLlegar,
  onEvaluarOtro,
}: {
  taller: { nombre: string } | undefined;
  quedanPorEvaluar: boolean;
  faltanPorLlegar: boolean;
  onEvaluarOtro: () => void;
}) {
  return (
    <div className="mt-6">
      <Tarjeta className="text-center">
        <CheckCircle2 className="mx-auto size-8 text-estado-pagado" aria-hidden />
        <p className="mt-3 text-lg font-bold tracking-tight">Gracias por responder</p>
        <p className="mx-auto mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          {taller ? (
            <>
              Tu evaluación de <strong className="font-semibold">{taller.nombre}</strong> quedó
              registrada. Tus respuestas se analizan en conjunto, no una por una.
            </>
          ) : (
            "Tus respuestas se analizan en conjunto, no una por una."
          )}
        </p>
      </Tarjeta>

      {quedanPorEvaluar ? (
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={onEvaluarOtro}>
            Evaluar otro taller
          </Button>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {faltanPorLlegar
            ? "Ya evaluaste todos los talleres disponibles hasta ahora. Cuando termine tu próximo taller, podrás volver a evaluarlo aquí."
            : "Ya evaluaste todos los talleres disponibles. Gracias por tu tiempo."}
        </p>
      )}
    </div>
  );
}
