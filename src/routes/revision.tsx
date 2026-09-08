import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ImageOff,
  Minus,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Protegido } from "@/components/acceso";
import { EstadoEvidenciaBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usuariosInternos } from "@/mocks/usuariosInternos";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  CRITERIOS,
  FILTROS_INICIALES,
  MOTIVOS,
  accionDeTecla,
  type AccionTecla,
  etiquetaMotivo,
  asignacionDeCola,
  filtrarCola,
  gemelasDe,
  gruposDuplicados,
  progresoDe,
  revisorDe,
  revisoresDe,
  type FiltrosRevision,
  type MotivoRechazo,
} from "@/lib/revision";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Evidencia } from "@/mocks/tipos";

export const Route = createFileRoute("/revision")({
  head: () =>
    meta(
      "Panel de revisión de evidencias — XIV Encuentro Internacional de Educación",
      "Revisión de evidencias por lotes: visor con zoom, atajos de teclado, alerta de duplicados y motivos de rechazo obligatorios.",
    ),
  component: PanelRevision,
});

const REVISORES = revisoresDe(usuariosInternos);

function PanelRevision() {
  const { evidencias, revisarEvidencia, deshacerRevision, revisiones, registrarBitacora } =
    useEstadoEvento();
  const [revisor, setRevisor] = useState(REVISORES[0] ?? "");
  const [filtros, setFiltros] = useState<FiltrosRevision>({
    ...FILTROS_INICIALES,
    revisor: REVISORES[0] ?? "todos",
  });
  const [indice, setIndice] = useState(0);
  // Evidencia a la que hay que volver tras deshacer, si sigue en la cola visible.
  const [anclaId, setAnclaId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [criterios, setCriterios] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazo | null>(null);
  const [otro, setOtro] = useState("");

  // El reparto por bloques de día se calcula una vez sobre la cola completa.
  const asignacion = useMemo(() => asignacionDeCola(evidencias, REVISORES), [evidencias]);
  const cola = useMemo(
    () => filtrarCola(evidencias, filtros, asignacion),
    [evidencias, filtros, asignacion],
  );
  const actual: Evidencia | undefined = cola[Math.min(indice, cola.length - 1)];
  const gemelas = useMemo(
    () => (actual ? gemelasDe(evidencias, actual) : []),
    [evidencias, actual],
  );
  const progreso = useMemo(() => progresoDe(evidencias), [evidencias]);
  const duplicados = useMemo(() => gruposDuplicados(evidencias).size, [evidencias]);
  const miLote = useMemo(
    () => evidencias.filter((e) => revisorDe(e.id, asignacion) === revisor),
    [evidencias, revisor, asignacion],
  );

  useEffect(() => {
    setZoom(1);
  }, [actual?.id]);

  useEffect(() => {
    if (indice >= cola.length) setIndice(Math.max(0, cola.length - 1));
  }, [cola.length, indice]);

  // Reposiciona el cursor sobre la evidencia recién revertida.
  useEffect(() => {
    if (!anclaId) return;
    const pos = cola.findIndex((e) => e.id === anclaId);
    if (pos >= 0) setIndice(pos);
    setAnclaId(null);
  }, [anclaId, cola]);

  const avanzar = useCallback(
    () => setIndice((i) => Math.min(i + 1, Math.max(0, cola.length - 1))),
    [cola.length],
  );
  const retroceder = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  const aprobar = useCallback(() => {
    if (!actual) return;
    revisarEvidencia(actual.id, "aprobada", revisor);
    registrarBitacora("Aprobó evidencia", `${actual.id} · ${actual.nombre}`, revisor);
    toast.success(`Aprobada — ${actual.nombre}`);
    // Avance automático: al decidir, la siguiente imagen ya está en pantalla.
  }, [actual, revisarEvidencia, revisor, registrarBitacora]);

  const deshacer = useCallback(() => {
    const id = deshacerRevision();
    if (!id) {
      toast.info("No hay decisiones que deshacer en esta sesión.");
      return;
    }
    // La cola filtrada se reordena al revertir. Anclar el cursor a la evidencia
    // revertida evita que el revisor quede mirando otra imagen sin saber por qué.
    setAnclaId(id);
    const e = evidencias.find((x) => x.id === id);
    toast.success(`Se deshizo la decisión sobre ${e?.nombre ?? id}. Vuelves a verla en pantalla.`);
  }, [deshacerRevision, evidencias]);

  const confirmarRechazo = () => {
    if (!actual || !motivo) return;
    if (motivo === "otro" && otro.trim().length < 5) return;
    const texto = motivo === "otro" ? otro.trim() : etiquetaMotivo(motivo);
    revisarEvidencia(actual.id, "rechazada", revisor, texto);
    registrarBitacora("Rechazó evidencia", `${actual.id} · ${actual.nombre} · ${texto}`, revisor);
    toast.success(`Rechazada — ${actual.nombre}`);
    setRechazando(false);
    setMotivo(null);
    setOtro("");
  };

  // Los atajos responden de verdad: es la única forma de sostener el ritmo.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      // No secuestrar el teclado mientras se escribe en un campo o hay modal.
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      const accion = accionDeTecla(e.key, { enCampo, hayModal: rechazando || criterios });
      if (!accion) return;
      e.preventDefault();
      /*
       * Tabla en vez de escalera de `else if`. Cada atajo es una entrada, así
       * que agregar uno no obliga a leer las ramas anteriores para saber dónde
       * encaja, y TypeScript avisa si `accionDeTecla` devuelve una acción que
       * aquí no está contemplada.
       */
      const acciones: Record<AccionTecla, () => void> = {
        aprobar,
        rechazar: () => actual && setRechazando(true),
        siguiente: avanzar,
        anterior: retroceder,
        deshacer,
      };
      acciones[accion]();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [aprobar, avanzar, retroceder, deshacer, rechazando, criterios, actual]);

  return (
    <Protegido area="revision">
      <div className="flex min-h-svh flex-col bg-background">
        {/* Barra de progreso y filtros */}
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-64 flex-1 items-center gap-3">
              <div className="min-w-0">
                <p className="whitespace-nowrap text-sm font-bold">
                  {progreso.revisadas.toLocaleString("es-MX")} de{" "}
                  {progreso.total.toLocaleString("es-MX")} revisadas
                </p>
                <p
                  className="whitespace-nowrap text-[11px] text-muted-foreground"
                  title="El prototipo trabaja sobre una muestra; el evento real ronda las 5,000 imágenes."
                >
                  Muestra del prototipo · al mismo ritmo serían{" "}
                  {progreso.equivalenteEnEvento.toLocaleString("es-MX")} de{" "}
                  {progreso.volumenEvento.toLocaleString("es-MX")} del evento
                </p>
              </div>
              <Progress value={progreso.porcentaje} className="h-2 max-w-64 flex-1" />
              <span className="text-xs font-semibold text-muted-foreground">
                {progreso.porcentaje}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCriterios(true)}
                className="flex h-10 items-center gap-2 rounded-md border border-primary/40 bg-secondary px-3 text-sm font-semibold text-primary hover:bg-secondary/80"
              >
                <BookOpen className="size-4" aria-hidden /> Criterios de aprobación
              </button>
            </div>
          </div>

          <div className="mx-auto flex max-w-[100rem] flex-wrap items-end gap-3 border-t border-border px-4 py-2">
            <Campo etiqueta="Revisor (lote asignado)">
              <select
                value={revisor}
                onChange={(e) => {
                  setRevisor(e.target.value);
                  setFiltros((f) => ({ ...f, revisor: e.target.value }));
                  setIndice(0);
                }}
                className="h-10 rounded-md border border-input bg-card px-2 text-sm font-semibold"
              >
                {REVISORES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Día">
              <select
                value={String(filtros.dia)}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    dia:
                      e.target.value === "todos" ? "todos" : (Number(e.target.value) as 1 | 2 | 3),
                  }))
                }
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="1">Día 1</option>
                <option value="2">Día 2</option>
                <option value="3">Día 3</option>
              </select>
            </Campo>
            <Campo etiqueta="Estado">
              <select
                value={filtros.estado}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, estado: e.target.value as FiltrosRevision["estado"] }))
                }
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="pendiente">Pendientes</option>
                <option value="aprobada">Aprobadas</option>
                <option value="rechazada">Rechazadas</option>
                <option value="no_entregada">No entregadas</option>
                <option value="todos">Todos</option>
              </select>
            </Campo>
            <Campo etiqueta="Asignación">
              <select
                value={filtros.revisor}
                onChange={(e) => setFiltros((f) => ({ ...f, revisor: e.target.value }))}
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="todos">Toda la cola</option>
                {REVISORES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Campo>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
              <input
                type="checkbox"
                checked={filtros.soloDuplicados}
                onChange={(e) => setFiltros((f) => ({ ...f, soloDuplicados: e.target.checked }))}
                className="size-4"
              />
              Solo duplicados ({duplicados})
            </label>
            <p className="ml-auto text-xs text-muted-foreground">
              Lote de {revisor}: {miLote.length} evidencias · en pantalla {cola.length}
            </p>
          </div>
        </header>

        {!actual ? (
          <main className="flex flex-1 items-center justify-center p-10">
            <div className="max-w-md rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <ImageOff className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold">No queda nada con estos filtros</p>
              <p className="mt-1 text-sm text-muted-foreground">
                El lote de {revisor} está al día para esta combinación. Cambia el estado a «Todos» o
                elige otro revisor para seguir revisando.
              </p>
              <Button
                className="mt-4 h-11"
                onClick={() => setFiltros({ ...FILTROS_INICIALES, revisor: "todos" })}
              >
                Ver toda la cola pendiente
              </Button>
            </div>
          </main>
        ) : (
          <main className="mx-auto grid w-full max-w-[100rem] flex-1 gap-4 p-4 lg:grid-cols-[1fr_22rem]">
            {/* Visor */}
            <section className="flex min-h-[26rem] flex-col">
              {gemelas.length > 0 ? (
                <ComparacionDuplicados actual={actual} gemelas={gemelas} />
              ) : (
                <div className="relative flex flex-1 items-center justify-center overflow-auto rounded-lg bg-foreground/95 p-4">
                  <img
                    src={actual.imagen}
                    alt={`Evidencia de ${actual.nombre}, día ${actual.dia}`}
                    style={{ transform: `scale(${zoom})` }}
                    className="max-h-[70vh] origin-center rounded-md transition-transform"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-background/95 p-1">
                    <button
                      onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      className="flex size-9 items-center justify-center rounded hover:bg-muted"
                      aria-label="Alejar"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-12 text-center text-xs font-semibold">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                      className="flex size-9 items-center justify-center rounded hover:bg-muted"
                      aria-label="Acercar"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Decisión */}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  className="h-16 bg-estado-pagado text-base font-bold text-white hover:bg-estado-pagado/90"
                  onClick={aprobar}
                >
                  <Check className="size-6" /> Aprobar
                  <kbd className="ml-2 rounded border border-white/40 px-1.5 text-xs">A</kbd>
                </Button>
                <Button
                  className="h-16 bg-estado-cancelado text-base font-bold text-white hover:bg-estado-cancelado/90"
                  onClick={() => setRechazando(true)}
                >
                  <X className="size-6" /> Rechazar
                  <kbd className="ml-2 rounded border border-white/40 px-1.5 text-xs">R</kbd>
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Atajos:
                  <Tecla>A</Tecla> aprobar
                  <Tecla>R</Tecla> rechazar
                  <Tecla>←</Tecla>
                  <Tecla>→</Tecla> navegar
                  <Tecla>Z</Tecla> deshacer
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={retroceder}
                    disabled={indice === 0}
                  >
                    <ChevronLeft className="size-4" /> Anterior
                  </Button>
                  <span className="px-2 text-xs text-muted-foreground">
                    {cola.length === 0 ? 0 : indice + 1} / {cola.length}
                  </span>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={avanzar}
                    disabled={indice >= cola.length - 1}
                  >
                    Siguiente <ChevronRight className="size-4" />
                  </Button>
                  <Button variant="outline" className="h-10" onClick={deshacer}>
                    <Undo2 className="size-4" /> Deshacer
                  </Button>
                </div>
              </div>
            </section>

            {/* Panel lateral */}
            <aside className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-lg font-bold leading-tight">{actual.nombre}</h2>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {actual.matricula} · {actual.folio}
              </p>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Día</dt>
                  <dd className="font-semibold">Día {actual.dia}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Subida</dt>
                  <dd className="font-semibold">{actual.subidaEn}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Estado</dt>
                  <dd className="mt-1">
                    <EstadoEvidenciaBadge estado={actual.estado} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Intentos usados</dt>
                  <dd className="font-semibold">{actual.intentos} de 3</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Asignada a</dt>
                  <dd className="font-semibold">{revisorDe(actual.id, asignacion)}</dd>
                </div>
                {actual.motivoRechazo ? (
                  <div className="rounded-md bg-estado-cancelado-bg p-3 text-estado-cancelado">
                    <dt className="text-xs font-semibold">Motivo del rechazo</dt>
                    <dd className="text-sm">{actual.motivoRechazo}</dd>
                  </div>
                ) : null}
                {revisiones[actual.id] ? (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    Decidida en esta sesión por {revisiones[actual.id]!.revisor} el{" "}
                    {revisiones[actual.id]!.en}.
                  </p>
                ) : null}
                <div>
                  <dt className="text-xs text-muted-foreground">Identificador de imagen</dt>
                  <dd className="break-all font-mono text-xs">{actual.hash}</dd>
                </div>
              </dl>
            </aside>
          </main>
        )}

        {/* Modal de rechazo */}
        <Dialog
          open={rechazando}
          onOpenChange={(o) => {
            setRechazando(o);
            if (!o) {
              setMotivo(null);
              setOtro("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rechazar la evidencia de {actual?.nombre}</DialogTitle>
              <DialogDescription>
                El motivo es obligatorio: viaja al portal del alumno para que sepa qué corregir y
                pueda volver a subir dentro del plazo.
              </DialogDescription>
            </DialogHeader>
            <fieldset className="grid gap-1">
              <legend className="sr-only">Motivo del rechazo</legend>
              {MOTIVOS.map((m) => (
                <label
                  key={m.valor}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm",
                    motivo === m.valor
                      ? "border-primary bg-secondary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="motivo"
                    checked={motivo === m.valor}
                    onChange={() => setMotivo(m.valor)}
                    className="size-4"
                  />
                  {m.etiqueta}
                </label>
              ))}
            </fieldset>
            {motivo === "otro" ? (
              <div>
                <Textarea
                  value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  rows={3}
                  placeholder="Describe el motivo con el detalle que el alumno necesita para corregirlo."
                  aria-label="Motivo específico"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {otro.trim().length < 5
                    ? `Escribe al menos 5 caracteres (llevas ${otro.trim().length}).`
                    : "Motivo listo."}
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" className="h-11" onClick={() => setRechazando(false)}>
                Cancelar
              </Button>
              <Button
                className="h-11"
                disabled={!motivo || (motivo === "otro" && otro.trim().length < 5)}
                onClick={confirmarRechazo}
              >
                Rechazar con este motivo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Panel lateral de criterios */}
        <Sheet open={criterios} onOpenChange={setCriterios}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Criterios de aprobación</SheetTitle>
              <SheetDescription>
                Texto de referencia común. Sin un criterio compartido, dos revisores dan resultados
                distintos con la misma foto.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 px-4 pb-8">
              {CRITERIOS.map((bloque) => (
                <section key={bloque.titulo}>
                  <h3 className="text-sm font-bold">{bloque.titulo}</h3>
                  <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
                    {bloque.puntos.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Protegido>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-bold">
      {children}
    </kbd>
  );
}

/** Alerta de hash duplicado: las dos imágenes lado a lado con los datos de ambos. */
function ComparacionDuplicados({ actual, gemelas }: { actual: Evidencia; gemelas: Evidencia[] }) {
  return (
    <div className="flex flex-1 flex-col rounded-lg border-2 border-estado-cancelado/50 bg-estado-cancelado-bg p-3">
      <p className="flex items-start gap-2 text-sm font-bold text-estado-cancelado">
        <Copy className="mt-0.5 size-5 shrink-0" aria-hidden />
        Imagen duplicada: este archivo ya fue subido por{" "}
        {gemelas.length === 1 ? "otro alumno" : `otros ${gemelas.length} alumnos`}. Compara antes de
        decidir; si son la misma foto, se rechazan ambas.
      </p>
      <div className="mt-3 grid flex-1 gap-3 md:grid-cols-2">
        {[actual, ...gemelas].slice(0, 2).map((e, i) => (
          <figure key={e.id} className="flex flex-col rounded-lg border border-border bg-card p-2">
            <figcaption className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{e.nombre}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {e.matricula} · Día {e.dia} · {e.subidaEn}
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] font-bold">
                {i === 0 ? "En revisión" : "Ya subida"}
              </span>
            </figcaption>
            <img
              src={e.imagen}
              alt={`Evidencia de ${e.nombre}`}
              className="max-h-[46vh] w-full rounded-md bg-foreground/90 object-contain"
            />
            <p className="mt-2">
              <EstadoEvidenciaBadge estado={e.estado} />
            </p>
          </figure>
        ))}
      </div>
      <p className="mt-2 break-all text-center font-mono text-[11px] text-estado-cancelado">
        Identificador compartido: {actual.hash}
      </p>
    </div>
  );
}
