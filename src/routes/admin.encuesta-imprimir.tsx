/**
 * La hoja de resultados de la encuesta: el reporte con gráficas, hecho para
 * el papel.
 *
 * Mismo patrón que `admin.avance.tsx` —leer su cabecera para el porqué
 * completo—, resumido aquí:
 *
 * - Es una hoja, no un botón que fabrique un PDF. `Ctrl+P` → «Guardar como
 *   PDF» da un documento vectorial, gratis; jsPDF + html2canvas daría una
 *   captura rasterizada y medio mega más de librerías, solo para esta
 *   pantalla.
 * - Los colores van escritos en `oklch`, copiados de los literales CLAROS de
 *   `styles.css` y de `admin.avance.tsx`: el panel tiene modo oscuro, y una
 *   hoja que heredara el tema saldría con texto claro sobre el blanco del
 *   papel.
 * - `recharts` se importa de forma ESTÁTICA: esta pantalla ES la gráfica, y
 *   una carga diferida es la puerta abierta a que alguien imprima antes de
 *   que el trozo termine de bajar.
 * - El ancho es fijo en 48rem porque `recharts` mide su contenedor al
 *   montarse, no al imprimir.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquareWarning, Printer } from "lucide-react";
import { Protegido } from "@/components/acceso";
import { GraficaConteo, GraficaLikert, GraficaPerfiles } from "@/components/graficas-panel";
import { CONFERENCIAS_PRELIMINARES, conferenciaDe } from "@/lib/conferencias";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  ESCALA,
  INSTRUMENTOS,
  preguntasVisibles,
  PREGUNTAS_VISIBLES,
  type Instrumento,
  type RespuestaEncuesta,
  type ValorEscala,
} from "@/lib/encuesta";
import { mensajeDeError } from "@/lib/errores";
import { fechaHora } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/encuesta-imprimir")({
  head: () =>
    meta(
      "Hoja de resultados de la encuesta",
      "Promedios y distribución de respuestas de la encuesta de conferencias preliminares, con gráficas, para imprimir o guardar como PDF.",
    ),
  component: () => (
    <Protegido area="admin">
      <HojaDeEncuesta />
    </Protegido>
  ),
});

/*
 * La paleta clara del sistema, escrita. Mismos valores que `TINTA` en
 * `admin.avance.tsx`: esta hoja tampoco se tematiza.
 */
const TINTA = {
  alumno: "oklch(0.443 0.193 261)",
  docente: "oklch(0.506 0.142 149)",
  externo: "oklch(0.509 0.007 255.5)",
};

/** El promedio de 1 a 5 de una respuesta, sobre las preguntas visibles que de verdad contestó. */
function promedioDe(r: RespuestaEncuesta): number | null {
  const valores = PREGUNTAS_VISIBLES.map((p) => r.respuestas[p.numero]).filter(
    (v): v is ValorEscala => v !== undefined,
  );
  if (valores.length === 0) return null;
  return valores.reduce((a: number, b) => a + b, 0) / valores.length;
}

/** El promedio de un conjunto de respuestas, ignorando a quien no contestó ninguna. */
function promedioGeneral(respuestas: RespuestaEncuesta[]): number | null {
  const valores = respuestas.map(promedioDe).filter((v): v is number => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/**
 * Un bloque de la hoja: su título, su aclaración y lo que enseñe.
 *
 * Mismo componente que `Seccion` en `admin.avance.tsx` —no se comparte entre
 * archivos porque cada hoja es su propia ruta y ninguna otra pantalla lo
 * necesita—.
 */
function Seccion({
  titulo,
  nota,
  junta = true,
  nuevaPagina = false,
  children,
}: {
  titulo: string;
  nota?: string;
  junta?: boolean;
  nuevaPagina?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("mt-6", junta && "break-inside-avoid", nuevaPagina && "print:break-before-page")}
    >
      <h2 className="text-sm font-bold">{titulo}</h2>
      {nota ? <p className="mb-2 text-xs text-neutral-500">{nota}</p> : null}
      {children}
    </section>
  );
}

/** El alto de la gráfica Likert: un renglón por pregunta, como una tabla. */
const altoLikert = (preguntas: number) => Math.max(120, 26 * preguntas + 40);

/** Las cinco respuestas de la distribución Likert, listas para `GraficaLikert`. */
function distribucionDe(respuestas: RespuestaEncuesta[], numero: number) {
  const valores = respuestas.map((r) => r.respuestas[numero]).filter((v) => v !== undefined);
  const contar = (valor: number) => valores.filter((v) => v === valor).length;
  return { v5: contar(5), v4: contar(4), v3: contar(3), v2: contar(2), v1: contar(1) };
}

function HojaDeEncuesta() {
  const { configuracion } = useEstadoEvento();

  const [respuestas, setRespuestas] = useState<RespuestaEncuesta[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { obtenerRespuestasEncuesta } = await import("@/lib/datos");
        const r = await obtenerRespuestasEncuesta();
        if (vivo) setRespuestas(r);
      } catch (e) {
        if (vivo) setError(mensajeDeError(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const r = respuestas ?? [];

  const porPerfil = useMemo(
    () =>
      (["alumno", "docente", "externo"] as const).map((perfil) => ({
        perfil,
        etiqueta: perfil[0]!.toUpperCase() + perfil.slice(1) + "s",
        total: r.filter((x) => x.perfil === perfil).length,
      })),
    [r],
  );

  const porConferencia = useMemo(
    () =>
      CONFERENCIAS_PRELIMINARES.map((c) => {
        const deEsta = r.filter((x) => x.conferencia === c.slug);
        return {
          etiqueta: c.titulo.length > 28 ? `${c.titulo.slice(0, 27)}…` : c.titulo,
          cantidad: promedioGeneral(deEsta) ?? 0,
          respuestas: deEsta.length,
        };
      }),
    [r],
  );

  /** Las preguntas de un instrumento, con su promedio y su distribución. */
  const bloqueDe = (instrumento: Instrumento) => {
    const preguntas = preguntasVisibles(instrumento);
    const filas = preguntas.map((p) => {
      const valores = r
        .map((x) => x.respuestas[p.numero])
        .filter((v): v is ValorEscala => v !== undefined);
      const promedio = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
      return { pregunta: p, promedio, respondidaPor: valores.length };
    });
    return { preguntas, filas };
  };

  const impacto = useMemo(() => bloqueDe("impacto"), [r]);
  const seguimiento = useMemo(() => bloqueDe("seguimiento"), [r]);

  const promedio = promedioGeneral(r);

  const tarjetas = [
    { etiqueta: "Respuestas", valor: String(r.length), pie: "en las tres conferencias" },
    {
      etiqueta: "Promedio general",
      valor: promedio !== null ? promedio.toFixed(2) : "—",
      pie: "de 1 a 5, sobre las preguntas visibles",
    },
    {
      etiqueta: "Conferencias evaluadas",
      valor: String(CONFERENCIAS_PRELIMINARES.filter((c) => r.some((x) => x.conferencia === c.slug)).length),
      pie: `de ${CONFERENCIAS_PRELIMINARES.length} preliminares`,
    },
  ];

  return (
    <div className="min-h-svh bg-neutral-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/encuesta"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver a encuesta
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-neutral-600">
            Elige <strong className="font-semibold">Guardar como PDF</strong> como destino.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-700"
          >
            <Printer className="size-4" aria-hidden /> Descargar PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[48rem] bg-white p-8 text-neutral-900 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-4">
          <h1 className="text-xl font-bold tracking-tight">Resultados de la encuesta</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {configuracion.nombre}
            {configuracion.fechas ? ` · ${configuracion.fechas}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">Generado el {fechaHora()}</p>
        </header>

        {cargando ? (
          <div className="flex items-center gap-2 py-12 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando respuestas…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquareWarning className="size-8 text-red-600" aria-hidden />
            <p className="text-sm font-semibold">No se pudieron cargar las respuestas</p>
            <p className="text-sm text-neutral-500">{error}</p>
          </div>
        ) : (
          <>
            <section className="mt-5 grid grid-cols-3 gap-4 break-inside-avoid">
              {tarjetas.map((c) => (
                <div key={c.etiqueta} className="rounded-lg border border-neutral-300 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {c.etiqueta}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">{c.valor}</p>
                  <p className="text-xs text-neutral-500">{c.pie}</p>
                </div>
              ))}
            </section>

            <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
              <div>
                <h2 className="text-sm font-bold">Por perfil</h2>
                <p className="mb-2 text-xs text-neutral-500">Reparto de {r.length} respuestas</p>
                <div className="flex items-center gap-3">
                  <GraficaPerfiles datos={porPerfil} color={TINTA} alto={160} ancho="55%" />
                  <ul className="grid flex-1 gap-1.5">
                    {porPerfil.map((d) => (
                      <li key={d.perfil} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 rounded-sm" style={{ background: TINTA[d.perfil] }} />
                          {d.etiqueta}
                        </span>
                        <span className="font-bold tabular-nums">{d.total}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-bold">Promedio por conferencia</h2>
                <p className="mb-2 text-xs text-neutral-500">De 1 a 5, cada una con sus respuestas</p>
                <GraficaConteo
                  datos={porConferencia}
                  color={TINTA.alumno}
                  alto={160}
                  horizontal
                  anchoEtiqueta={130}
                />
              </div>
            </section>

            {(
              [
                { instrumento: "impacto" as const, bloque: impacto, nuevaPagina: true },
                { instrumento: "seguimiento" as const, bloque: seguimiento, nuevaPagina: false },
              ] as const
            ).map(({ instrumento, bloque, nuevaPagina }) => (
              <Seccion
                key={instrumento}
                titulo={INSTRUMENTOS[instrumento].titulo}
                nota={INSTRUMENTOS[instrumento].descripcion}
                junta={false}
                nuevaPagina={nuevaPagina}
              >
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-600">Promedio por pregunta</p>
                    <GraficaConteo
                      datos={bloque.filas.map((f) => ({
                        etiqueta: `P${f.pregunta.numero}`,
                        cantidad: f.promedio ?? 0,
                      }))}
                      color={TINTA.alumno}
                      horizontal
                      anchoEtiqueta={32}
                      alto={altoLikert(bloque.preguntas.length)}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-600">Distribución de respuestas</p>
                    <GraficaLikert
                      datos={bloque.preguntas.map((p) => ({
                        etiqueta: `P${p.numero}`,
                        ...distribucionDe(r, p.numero),
                      }))}
                      alto={altoLikert(bloque.preguntas.length)}
                    />
                  </div>
                </div>

                <table className="mt-3 w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-neutral-400 text-left">
                      <th className="py-1.5 pr-2 font-semibold">Pregunta</th>
                      <th className="py-1.5 pr-2 font-semibold">Promedio</th>
                      <th className="py-1.5 font-semibold">Respondida por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloque.filas.map((f) => (
                      <tr key={f.pregunta.numero} className="border-b border-neutral-200">
                        <td className="py-1.5 pr-2">
                          {f.pregunta.numero}. {f.pregunta.texto}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">
                          {f.promedio !== null ? f.promedio.toFixed(2) : "—"}
                        </td>
                        <td className="py-1.5 tabular-nums">{f.respondidaPor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Seccion>
            ))}

            <footer className="mt-5 break-inside-avoid border-t border-neutral-300 pt-3 text-xs text-neutral-500">
              <p>
                La escala va de <strong className="font-semibold text-neutral-700">1</strong> (
                {ESCALA.find((e) => e.valor === 1)?.etiqueta.toLowerCase()}) a{" "}
                <strong className="font-semibold text-neutral-700">5</strong> (
                {ESCALA.find((e) => e.valor === 5)?.etiqueta.toLowerCase()}).
              </p>
              <p className="mt-1">
                El promedio se calcula sobre las preguntas visibles del instrumento: diez de los doce
                reactivos del cuestionario en papel. Los dos restantes no se le presentan hoy a quien
                contesta.
              </p>
              <p className="mt-1">
                <strong className="font-semibold text-neutral-700">Respondida por</strong> puede ser
                menor al total de respuestas de la hoja: cuenta solo a quien de verdad contestó esa
                pregunta, no a quien dejó la encuesta a medias.
              </p>
            </footer>
          </>
        )}
      </article>
    </div>
  );
}
