import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, MessageSquareWarning, Star } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { Buscador } from "@/components/buscador";
import { Campo, Rotulo } from "@/components/tipografia";
import { PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { descargarCsv } from "@/lib/exportar";
import { mensajeDeError } from "@/lib/errores";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePaginacion } from "@/lib/paginacion";
import { CONFERENCIAS_PRELIMINARES, conferenciaDe } from "@/lib/conferencias";
import {
  ESCALA,
  PREGUNTAS_VISIBLES,
  type RespuestaEncuesta,
  type ValorEscala,
} from "@/lib/encuesta";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/admin/encuesta")({
  head: () =>
    meta(
      "Encuesta — Administración del Encuentro",
      "Quién ha evaluado cada conferencia preliminar, y qué contestó.",
    ),
  component: PanelEncuesta,
});

/** La etiqueta de la escala que corresponde a un valor, o el número si no se encuentra. */
const etiquetaDe = (valor: number) => ESCALA.find((o) => o.valor === valor)?.etiqueta ?? `${valor}`;

/** El promedio de 1 a 5 de una respuesta, sobre las preguntas visibles que de verdad contestó. */
function promedioDe(r: RespuestaEncuesta): number | null {
  const valores = PREGUNTAS_VISIBLES.map((p) => r.respuestas[p.numero]).filter(
    (v): v is ValorEscala => v !== undefined,
  );
  if (valores.length === 0) return null;
  return valores.reduce((a: number, b) => a + b, 0) / valores.length;
}

function PanelEncuesta() {
  const { registrarBitacora } = useEstadoEvento();

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

  const [q, setQ] = useState("");
  const [conferencia, setConferencia] = useState<"todas" | string>("todas");
  const [perfil, setPerfil] = useState<"todos" | RespuestaEncuesta["perfil"]>("todos");
  const [abierta, setAbierta] = useState<RespuestaEncuesta | null>(null);

  const porConferencia = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of respuestas ?? []) m.set(r.conferencia, (m.get(r.conferencia) ?? 0) + 1);
    return m;
  }, [respuestas]);

  const filtrando = q.trim() !== "" || conferencia !== "todas" || perfil !== "todos";

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (respuestas ?? [])
      .filter((r) => {
        if (conferencia !== "todas" && r.conferencia !== conferencia) return false;
        if (perfil !== "todos" && r.perfil !== perfil) return false;
        if (!t) return true;
        return (
          r.nombre.toLowerCase().includes(t) ||
          (r.matricula ?? "").toLowerCase().includes(t) ||
          (r.correo ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }, [respuestas, q, conferencia, perfil]);

  const tramo = usePaginacion(visibles, 50, `${conferencia}|${perfil}|${q}`);

  const limpiar = () => {
    setQ("");
    setConferencia("todas");
    setPerfil("todos");
  };

  const exportar = () => {
    const n = descargarCsv(
      "encuesta.csv",
      [
        "conferencia",
        "perfil",
        "nombre",
        "matricula",
        "programa",
        "correo",
        "promedio",
        "fecha",
        ...PREGUNTAS_VISIBLES.map((p) => `pregunta_${p.numero}`),
      ],
      visibles.map((r) => [
        conferenciaDe(r.conferencia)?.titulo ?? r.conferencia,
        r.perfil,
        r.nombre,
        r.matricula ?? "",
        r.programa ?? "",
        r.correo ?? "",
        promedioDe(r)?.toFixed(2) ?? "",
        r.creadoEn,
        ...PREGUNTAS_VISIBLES.map((p) => `${r.respuestas[p.numero] ?? ""}`),
      ]),
    );
    registrarBitacora("Exportó las respuestas de la encuesta", `${n} respuestas`);
    toast.success(`Exportamos ${n} respuestas.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Encuesta"
      descripcion="Quién ha evaluado cada conferencia preliminar, y qué contestó."
      acciones={
        respuestas && respuestas.length > 0 ? (
          <Button variant="outline" className="h-11" onClick={exportar}>
            <Download className="size-4" /> Exportar ({visibles.length})
          </Button>
        ) : undefined
      }
    >
      {cargando ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando respuestas…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageSquareWarning className="size-8 text-destructive" aria-hidden />
          <p className="text-sm font-semibold">No se pudieron cargar las respuestas</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {respuestas?.length ?? 0} respuestas en total
            {filtrando ? (
              <>
                {" "}
                · <span className="font-semibold text-foreground">{visibles.length}</span> con estos
                filtros
              </>
            ) : null}
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {CONFERENCIAS_PRELIMINARES.map((c) => (
              <span
                key={c.slug}
                className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
              >
                {c.titulo}:{" "}
                <span className="text-foreground">{porConferencia.get(c.slug) ?? 0}</span>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Buscador
              className="w-full max-w-xs"
              valor={q}
              alCambiar={setQ}
              marcador="Nombre, matrícula o correo"
              etiqueta="Buscar en las respuestas"
            />
            <Campo etiqueta="Conferencia">
              <select
                value={conferencia}
                onChange={(e) => setConferencia(e.target.value)}
                className="h-11 max-w-64 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="todas">Todas</option>
                {CONFERENCIAS_PRELIMINARES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.titulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Perfil">
              <select
                value={perfil}
                onChange={(e) => setPerfil(e.target.value as "todos" | RespuestaEncuesta["perfil"])}
                className="h-11 max-w-40 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="alumno">Alumnos</option>
                <option value="docente">Docentes</option>
                <option value="externo">Externos</option>
              </select>
            </Campo>
            {filtrando ? (
              <Button variant="outline" className="h-11" onClick={limpiar}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>

          <Tabla
            className="mt-3"
            anchoMinimo="64rem"
            columnas={["Nombre", "Perfil", "Conferencia", "Contacto", "Promedio", "Fecha", ""]}
            vacio={
              visibles.length === 0 ? (
                <>
                  <Star className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-3 text-sm font-semibold">
                    {(respuestas?.length ?? 0) === 0
                      ? "Todavía no hay respuestas"
                      : "Nadie coincide con estos filtros"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(respuestas?.length ?? 0) === 0
                      ? "Aparecerán en cuanto alguien evalúe una conferencia."
                      : "Prueba con menos filtros."}
                  </p>
                </>
              ) : null
            }
          >
            {tramo.visibles.map((r) => {
              const promedio = promedioDe(r);
              return (
                <Fila key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.nombre}</td>
                  <td className="px-3 py-2">
                    <PerfilBadge perfil={r.perfil} />
                  </td>
                  <td className="px-3 py-2">
                    {conferenciaDe(r.conferencia)?.titulo ?? r.conferencia}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.perfil === "alumno" ? (r.matricula ?? "—") : (r.correo ?? "—")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {promedio ? promedio.toFixed(1) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.creadoEn}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" className="h-9" onClick={() => setAbierta(r)}>
                      Ver respuestas
                    </Button>
                  </td>
                </Fila>
              );
            })}
          </Tabla>
          <Paginacion
            tramo={tramo}
            nota="La exportación se lleva estas mismas, con el filtro puesto."
          />
        </>
      )}

      {abierta ? <DetalleRespuesta r={abierta} onCerrar={() => setAbierta(null)} /> : null}
    </PantallaPanel>
  );
}

/**
 * Las diez respuestas de una persona, pregunta por pregunta.
 *
 * Sin puntaje sobre 60 ni nivel de logro: ese cálculo está calibrado para los
 * doce reactivos del papel —ver `nivelDeLogro` en `lib/encuesta.ts`— y aquí
 * solo se guardan los diez visibles. Aplicarlo de todos modos enseñaría un
 * veredicto que no es el que corresponde.
 */
function DetalleRespuesta({ r, onCerrar }: { r: RespuestaEncuesta; onCerrar: () => void }) {
  const conferencia = conferenciaDe(r.conferencia);

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <PerfilBadge perfil={r.perfil} />
          <span className="text-xs text-muted-foreground">
            {conferencia?.titulo ?? r.conferencia} · {r.creadoEn}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {r.perfil === "alumno"
            ? `Matrícula ${r.matricula ?? "—"} · ${r.programa ?? "—"}`
            : (r.correo ?? "Sin correo")}
        </p>

        <div className="grid gap-3">
          {PREGUNTAS_VISIBLES.map((p) => (
            <div key={p.numero} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <Rotulo como="span">
                {p.numero}. {p.texto}
              </Rotulo>
              <p className="mt-1 text-sm font-medium">
                {r.respuestas[p.numero] !== undefined
                  ? etiquetaDe(r.respuestas[p.numero]!)
                  : "Sin respuesta"}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
