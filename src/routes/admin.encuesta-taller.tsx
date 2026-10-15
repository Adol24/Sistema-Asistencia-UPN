import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, MessageSquareWarning, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { Buscador } from "@/components/buscador";
import { Campo, Rotulo } from "@/components/tipografia";
import { PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { descargarCsv } from "@/lib/exportar";
import { mensajeDeError } from "@/lib/errores";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePaginacion } from "@/lib/paginacion";
import {
  ESCALA,
  PREGUNTAS_TALLER,
  type RespuestaEncuestaTaller,
  type ValorEscala,
} from "@/lib/encuesta-talleres";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/admin/encuesta-taller")({
  head: () =>
    meta(
      "Encuesta de talleres — Administración del Encuentro",
      "Quién ha evaluado cada taller, y qué contestó.",
    ),
  component: PanelEncuestaTaller,
});

/** La etiqueta de la escala que corresponde a un valor, o el número si no se encuentra. */
const etiquetaDe = (valor: number) => ESCALA.find((o) => o.valor === valor)?.etiqueta ?? `${valor}`;

/** El promedio de 1 a 5 de una respuesta, sobre las diez preguntas del instrumento. */
function promedioDe(r: RespuestaEncuestaTaller): number | null {
  const valores = PREGUNTAS_TALLER.map((p) => r.respuestas[p.numero]).filter(
    (v): v is ValorEscala => v !== undefined,
  );
  if (valores.length === 0) return null;
  return valores.reduce((a: number, b) => a + b, 0) / valores.length;
}

function PanelEncuestaTaller() {
  const { registrarBitacora, talleres: catalogo } = useEstadoEvento();

  const [respuestas, setRespuestas] = useState<RespuestaEncuestaTaller[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { obtenerRespuestasEncuestaTalleres } = await import("@/lib/datos");
        const r = await obtenerRespuestasEncuestaTalleres();
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
  const [taller, setTaller] = useState<"todos" | string>("todos");
  const [perfil, setPerfil] = useState<"todos" | RespuestaEncuestaTaller["perfil"]>("todos");
  const [abierta, setAbierta] = useState<RespuestaEncuestaTaller | null>(null);
  const [aBorrar, setABorrar] = useState<RespuestaEncuestaTaller | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const porTaller = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of respuestas ?? []) m.set(r.tallerClave, (m.get(r.tallerClave) ?? 0) + 1);
    return m;
  }, [respuestas]);

  // Los doce talleres, aunque hoy no tengan ninguna respuesta: así el conteo
  // en cero también dice algo, en vez de desaparecer de la lista.
  const talleresOrdenados = useMemo(
    () => [...catalogo].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [catalogo],
  );

  const filtrando = q.trim() !== "" || taller !== "todos" || perfil !== "todos";

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (respuestas ?? [])
      .filter((r) => {
        if (taller !== "todos" && r.tallerClave !== taller) return false;
        if (perfil !== "todos" && r.perfil !== perfil) return false;
        if (!t) return true;
        return (
          r.nombre.toLowerCase().includes(t) ||
          (r.matricula ?? "").toLowerCase().includes(t) ||
          (r.correo ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }, [respuestas, q, taller, perfil]);

  const tramo = usePaginacion(visibles, 50, `${taller}|${perfil}|${q}`);

  const limpiar = () => {
    setQ("");
    setTaller("todos");
    setPerfil("todos");
  };

  const exportar = () => {
    const n = descargarCsv(
      "encuesta-talleres.csv",
      [
        "taller",
        "perfil",
        "nombre",
        "matricula",
        "programa",
        "correo",
        "promedio",
        "fecha",
        ...PREGUNTAS_TALLER.map((p) => `pregunta_${p.numero}`),
      ],
      visibles.map((r) => [
        r.tallerNombre,
        r.perfil,
        r.nombre,
        r.matricula ?? "",
        r.programa ?? "",
        r.correo ?? "",
        promedioDe(r)?.toFixed(2) ?? "",
        r.creadoEn,
        ...PREGUNTAS_TALLER.map((p) => `${r.respuestas[p.numero] ?? ""}`),
      ]),
    );
    registrarBitacora("Exportó las respuestas de la encuesta de talleres", `${n} respuestas`);
    toast.success(`Exportamos ${n} respuestas.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Encuesta de talleres"
      descripcion="Quién ha evaluado cada taller, y qué contestó."
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
            {talleresOrdenados.map((t) => (
              <span
                key={t.id}
                className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
              >
                {t.id}: <span className="text-foreground">{porTaller.get(t.id) ?? 0}</span>
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
            <Campo etiqueta="Taller">
              <select
                value={taller}
                onChange={(e) => setTaller(e.target.value)}
                className="h-11 max-w-64 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="todos">Todos</option>
                {talleresOrdenados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Perfil">
              <select
                value={perfil}
                onChange={(e) =>
                  setPerfil(e.target.value as "todos" | RespuestaEncuestaTaller["perfil"])
                }
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
            columnas={["Nombre", "Perfil", "Taller", "Contacto", "Promedio", "Fecha", ""]}
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
                      ? "Aparecerán en cuanto alguien evalúe un taller."
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
                  <td className="px-3 py-2">{r.tallerNombre}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.perfil === "alumno" ? (r.matricula ?? "—") : (r.correo ?? "—")}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {promedio ? promedio.toFixed(1) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.creadoEn}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" className="h-9" onClick={() => setAbierta(r)}>
                        Ver respuestas
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                        aria-label="Eliminar esta respuesta"
                        onClick={() => setABorrar(r)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
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

      {/*
       * Eliminar no se deshace, así que el diálogo dice quién es —nombre y
       * taller— antes de pedir confirmación. Mismo patrón que `/admin/encuesta`.
       */}
      <DialogoConfirmar
        abierto={!!aBorrar}
        alCerrar={() => {
          if (!eliminando) setABorrar(null);
        }}
        titulo={`¿Eliminar la respuesta de ${aBorrar?.nombre}?`}
        descripcion={`Evaluó "${aBorrar?.tallerNombre}". Esto no se puede deshacer.`}
        confirmar={eliminando ? "Eliminando…" : "Sí, eliminar"}
        deshabilitado={eliminando}
        alConfirmar={() => {
          const r = aBorrar;
          if (!r) return;
          setEliminando(true);
          (async () => {
            try {
              const { eliminarRespuestaEncuestaTaller } = await import("@/lib/datos");
              await eliminarRespuestaEncuestaTaller(r.id);
              setRespuestas((previas) => (previas ?? []).filter((x) => x.id !== r.id));
              toast.success(`Eliminamos la respuesta de ${r.nombre}.`);
              setABorrar(null);
            } catch (e) {
              toast.error(mensajeDeError(e));
            } finally {
              setEliminando(false);
            }
          })();
        }}
      />
    </PantallaPanel>
  );
}

/** Las diez respuestas de una persona, pregunta por pregunta. */
function DetalleRespuesta({ r, onCerrar }: { r: RespuestaEncuestaTaller; onCerrar: () => void }) {
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{r.nombre}</DialogTitle>
        </DialogHeader>
        <Rotulo como="span" className="text-primary">
          {r.tallerNombre}
        </Rotulo>
        <div className="mt-3 grid gap-3">
          {PREGUNTAS_TALLER.map((p) => {
            const valor = r.respuestas[p.numero];
            return (
              <div key={p.numero} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <p className="text-sm leading-snug">
                  <span className="font-bold text-primary">{p.numero}.</span> {p.texto}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {valor !== undefined ? etiquetaDe(valor) : "Sin contestar"}
                </p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
