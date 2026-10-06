import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CheckCircle2, ClipboardList, RotateCcw } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Ayuda, Rotulo, Tarjeta, Texto, Titulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ESCALA,
  INSTRUMENTOS,
  NIVELES,
  PREGUNTAS,
  PUNTAJE_MAXIMO,
  maximoDe,
  nivelDeLogro,
  preguntasDe,
  type Instrumento,
  type ValorEscala,
} from "@/lib/encuesta";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { opcion } from "@/lib/estilos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/encuesta")({
  head: () =>
    meta(
      "Encuesta de satisfacción — XIV Encuentro Internacional de Educación",
      "Evaluación y seguimiento académico del XIV Encuentro Internacional de Educación UPN-212. Vista de demostración.",
    ),
  component: Encuesta,
});

/**
 * La encuesta de evaluación y seguimiento académico. **Vista de demostración.**
 *
 * Está aparte del flujo público a propósito y no se enlaza desde ninguna barra:
 * sirve para enseñar el instrumento ya dibujado —cómo se ve, cómo se contesta y
 * qué devuelve— sin tocar el pre-registro, los paneles ni la base. Nada de lo
 * que se marca aquí se guarda: el puntaje se calcula en el navegador y se
 * pierde al recargar, y la pantalla lo dice antes de pedir la primera respuesta
 * para que nadie crea que ya entregó su evaluación.
 *
 * Lo que sí es definitivo son las preguntas, la escala y los rangos de
 * interpretación, que viven en `lib/encuesta.ts` tal como están impresos.
 */
function Encuesta() {
  const { configuracion: evento } = useEstadoEvento();
  const [respuestas, setRespuestas] = useState<Record<number, ValorEscala>>({});
  const [enviada, setEnviada] = useState(false);
  /*
   * Qué preguntas quedaron sin contestar en el último intento de envío.
   *
   * No se marcan desde el principio: una pantalla con doce avisos en rojo antes
   * de que la persona toque nada regaña por adelantado. El resaltado aparece
   * solo después de pulsar «Ver mi resultado», que es cuando el hueco importa.
   */
  const [faltantes, setFaltantes] = useState<Set<number>>(new Set());
  /*
   * Para llevar el foco a la primera pregunta sin contestar. Decir «te faltan
   * tres» al pie de una página de doce bloques obliga a buscarlas a mano.
   */
  const bloques = useRef(new Map<number, HTMLFieldSetElement>());

  const contestadas = Object.keys(respuestas).length;
  const completa = contestadas === PREGUNTAS.length;

  const total = PREGUNTAS.reduce((suma, p) => suma + (respuestas[p.numero] ?? 0), 0);

  function responder(numero: number, valor: ValorEscala) {
    setRespuestas((previas) => ({ ...previas, [numero]: valor }));
    setFaltantes((previas) => {
      if (!previas.has(numero)) return previas;
      const quedan = new Set(previas);
      quedan.delete(numero);
      return quedan;
    });
  }

  function enviar() {
    const sinContestar = PREGUNTAS.filter((p) => respuestas[p.numero] === undefined);
    if (sinContestar.length > 0) {
      setFaltantes(new Set(sinContestar.map((p) => p.numero)));
      bloques.current.get(sinContestar[0]!.numero)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    setFaltantes(new Set());
    setEnviada(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reiniciar() {
    setRespuestas({});
    setFaltantes(new Set());
    setEnviada(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <PantallaPublica ancho="lg" variante="portada">
      <header>
        <Rotulo className="text-primary">Evaluación y seguimiento académico</Rotulo>
        <Titulo className="mt-2">
          {evento.nombre || "XIV Encuentro Internacional de Educación UPN-212"}
        </Titulo>
        <Texto className="mt-3">
          Esta evaluación mide la satisfacción, el impacto formativo y el acervo intelectual que
          dejó el Encuentro. Son doce afirmaciones: marca en cada una qué tan de acuerdo estás.
        </Texto>
      </header>

      {/*
       * El aviso de que esto no se guarda va arriba y no al pie. Abajo lo lee
       * quien ya contestó las doce, que es justo cuando ya no sirve de nada.
       */}
      <p className="mt-5 flex items-start gap-2 rounded-md border border-dashed border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
        <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-foreground">Vista de demostración.</strong> Las
          respuestas no se guardan en ninguna parte: el puntaje se calcula aquí mismo y se pierde al
          recargar la página.
        </span>
      </p>

      {enviada ? (
        <Resultado total={total} respuestas={respuestas} onReiniciar={reiniciar} />
      ) : (
        <>
          <Tarjeta className="mt-6 p-4" padding="none">
            <div className="flex items-center justify-between gap-4">
              <Rotulo como="span">Avance</Rotulo>
              <span className="text-sm font-semibold tabular-nums">
                {contestadas} de {PREGUNTAS.length}
              </span>
            </div>
            <Progress
              className="mt-2"
              value={(contestadas / PREGUNTAS.length) * 100}
              aria-label="Preguntas contestadas"
            />
          </Tarjeta>

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
            <Button size="lg" className="w-full sm:w-auto" onClick={enviar}>
              Ver mi resultado
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
                  ? "Ya contestaste las doce."
                  : "Contesta las doce afirmaciones para ver tu nivel de logro."}
              </Ayuda>
            )}
          </div>
        </>
      )}
    </PantallaPublica>
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
        {preguntasDe(instrumento).map((pregunta) => (
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

/** El puntaje, el nivel de logro y la tabla de interpretación. */
function Resultado({
  total,
  respuestas,
  onReiniciar,
}: {
  total: number;
  respuestas: Record<number, ValorEscala>;
  onReiniciar: () => void;
}) {
  const nivel = nivelDeLogro(total);
  const parcial = (instrumento: Instrumento) =>
    preguntasDe(instrumento).reduce((suma, p) => suma + (respuestas[p.numero] ?? 0), 0);

  return (
    <div className="mt-6">
      <Tarjeta className="text-center">
        <CheckCircle2 className="mx-auto size-8 text-estado-pagado" aria-hidden />
        <p className="mt-3 text-sm text-muted-foreground">Puntaje obtenido</p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight">
          {total}
          <span className="text-2xl font-bold text-muted-foreground"> / {PUNTAJE_MAXIMO}</span>
        </p>
        <p
          className={cn(
            "mt-4 inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold",
            nivel.clase,
          )}
        >
          Nivel de logro: {nivel.nombre}
        </p>
        <p className="mx-auto mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
          {nivel.interpretacion}
        </p>
      </Tarjeta>

      {/*
       * El desglose por instrumento. El total sobre 60 no distingue entre un
       * evento que gustó pero no deja trabajo después y uno al revés, y esa
       * diferencia es justo la que el instrumento se propone medir.
       */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["impacto", "seguimiento"] as const).map((instrumento) => {
          const preguntas = preguntasDe(instrumento);
          return (
            <Tarjeta key={instrumento} padding="sm">
              <Rotulo>{INSTRUMENTOS[instrumento].titulo}</Rotulo>
              <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">
                {parcial(instrumento)}
                <span className="text-base font-bold text-muted-foreground">
                  {" "}
                  / {maximoDe(instrumento)}
                </span>
              </p>
              <Ayuda className="mt-1">
                {preguntas.length} afirmaciones ({preguntas[0]!.numero} a{" "}
                {preguntas[preguntas.length - 1]!.numero})
              </Ayuda>
            </Tarjeta>
          );
        })}
      </div>

      <section className="mt-8">
        <Rotulo className="text-primary">Escala de interpretación</Rotulo>
        <Tarjeta className="mt-3 overflow-hidden" padding="none">
          <ul>
            {NIVELES.map((n) => {
              const actual = n.nombre === nivel.nombre;
              return (
                <li
                  key={n.nombre}
                  className={cn(
                    "flex flex-col gap-1 border-b border-border p-4 last:border-0 sm:flex-row sm:items-baseline sm:gap-4",
                    actual && "bg-muted",
                  )}
                >
                  <span className="flex shrink-0 items-baseline gap-2 sm:w-44">
                    <span className="text-sm font-semibold tabular-nums">
                      {n.min}–{n.max}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-semibold",
                        actual ? n.clase : "text-muted-foreground",
                      )}
                    >
                      {n.nombre}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      actual ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {n.interpretacion}
                  </span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      </section>

      <div className="mt-8 flex justify-center">
        <Button variant="outline" size="lg" onClick={onReiniciar}>
          <RotateCcw aria-hidden />
          Responder otra vez
        </Button>
      </div>
    </div>
  );
}
