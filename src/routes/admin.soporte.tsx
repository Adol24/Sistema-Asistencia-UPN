import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  HelpCircle,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Store,
  UserPen,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { EstadoCasoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { CasoSoporte } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/soporte")({
  head: () =>
    meta(
      "Casos de soporte — Administración del Encuentro",
      "Bandeja de casos con filtros por estado y canal, detalle y cambio de estado.",
    ),
  component: Soporte,
});

const ESTADOS = [
  { valor: "abierto", etiqueta: "Abierto" },
  { valor: "en_proceso", etiqueta: "En proceso" },
  { valor: "resuelto", etiqueta: "Resuelto" },
] as const;

/**
 * Los cuatro canales del enum `canal_caso`.
 *
 * `portal` faltaba, y era el único que se usaba: `fn_abrir_caso_nombre` —la
 * única vía por la que hoy se crea un caso— lo inserta con ese valor. Al pintar
 * el primer caso real, `CANAL[c.canal]` daba `undefined` y leer `.Icono` de ahí
 * tumbaba la pantalla entera. El módulo de soporte no fallaba: no llegaba a
 * dibujarse.
 */
const CANAL: Record<CasoSoporte["canal"], { etiqueta: string; Icono: typeof Mail }> = {
  whatsapp: { etiqueta: "WhatsApp", Icono: MessageCircle },
  correo: { etiqueta: "Correo", Icono: Mail },
  ventanilla: { etiqueta: "Ventanilla", Icono: Store },
  portal: { etiqueta: "Portal del participante", Icono: Smartphone },
};

/**
 * El canal, o un marcador si es uno que esta pantalla no conoce.
 *
 * La lección de `portal`: si mañana se añade un quinto valor al enum y aquí no,
 * la bandeja de soporte vuelve a caerse entera por un icono. Un caso que no se
 * sabe etiquetar se enseña igual —su contenido es lo que importa— y el canal
 * desconocido se dice, en vez de llevarse la pantalla por delante.
 */
const canalDe = (canal: CasoSoporte["canal"]) =>
  CANAL[canal] ?? { etiqueta: canal, Icono: HelpCircle };

/**
 * Saca el nombre propuesto del detalle del caso.
 *
 * `fn_abrir_caso_nombre` lo escribe con un formato fijo: Dice "X" y debe decir
 * "Y". Se lee el segundo entrecomillado para dejar el campo ya lleno, que es lo
 * que ahorra el trabajo: quien corrige suele confirmar, no teclear.
 *
 * Si el formato no cuadra —un caso escrito a mano, por ejemplo— devuelve el
 * nombre actual y quien corrige lo escribe. Adivinar mal sería peor que no
 * adivinar: el nombre es lo que se imprime en la constancia.
 */
const nombrePropuesto = (detalle: string, actual: string): string => {
  const m = /debe decir "([^"]+)"/i.exec(detalle);
  return m?.[1]?.trim() || actual;
};

function Soporte() {
  const {
    casos,
    participantes,
    abrirCaso,
    cambiarEstadoCaso,
    corregirNombre,
    editarCaso,
    registrarBitacora,
    usuarioActual,
    getParticipante,
  } = useEstadoEvento();
  /** El caso que se está editando y el borrador de sus campos, o null. */
  const [editando, setEditando] = useState<{
    id: string;
    asunto: string;
    detalle: string;
    canal: CasoSoporte["canal"];
  } | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | CasoSoporte["estado"]>("todos");
  const [canal, setCanal] = useState<"todos" | CasoSoporte["canal"]>("todos");
  const [abierto, setAbierto] = useState<string | null>(null);
  /** El borrador del caso nuevo, o null si el diálogo está cerrado. */
  const [nuevo, setNuevo] = useState<{
    folio: string;
    nombre: string;
    busqueda: string;
    asunto: string;
    detalle: string;
    canal: CasoSoporte["canal"];
  } | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** El caso cuyo nombre se está corrigiendo, y el nombre propuesto. */
  const [corrigiendo, setCorrigiendo] = useState<{
    id: string;
    folio: string;
    nombre: string;
  } | null>(null);

  // Se busca entre los participantes porque `casos_soporte.participante_id` es
  // obligatorio: un caso siempre es de alguien. No se puede abrir «en general».
  const candidatos = useMemo(
    () => (nuevo?.busqueda.trim() ? buscarEnParticipantes(participantes, nuevo.busqueda) : []),
    [participantes, nuevo?.busqueda],
  );

  const conteos = useMemo(
    () => ({
      abierto: casos.filter((c) => c.estado === "abierto").length,
      en_proceso: casos.filter((c) => c.estado === "en_proceso").length,
      resuelto: casos.filter((c) => c.estado === "resuelto").length,
      nombre: casos.filter((c) => c.estado !== "resuelto" && /nombre/i.test(c.asunto)).length,
    }),
    [casos],
  );

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return casos.filter((c) => {
      if (estado !== "todos" && c.estado !== estado) return false;
      if (canal !== "todos" && c.canal !== canal) return false;
      if (!t) return true;
      return (
        c.nombre.toLowerCase().includes(t) ||
        c.folio.toLowerCase().includes(t) ||
        c.asunto.toLowerCase().includes(t) ||
        c.id.toLowerCase().includes(t)
      );
    });
  }, [casos, estado, canal, q]);

  const cambiar = (c: CasoSoporte, nuevo: CasoSoporte["estado"]) => {
    cambiarEstadoCaso(c.id, nuevo, usuarioActual);
    registrarBitacora(
      nuevo === "resuelto" ? "Resolvió un caso de soporte" : "Cambió el estado de un caso",
      `${c.id} · ${c.folio} · ${c.asunto} → ${nuevo.replace("_", " ")}`,
    );
    // Resolver un caso de nombre quita la marca del listado de elegibles: es la
    // única cadena que atraviesa el sistema de punta a punta.
    const esDeNombre = /nombre/i.test(c.asunto);
    toast.success(
      nuevo === "resuelto" && esDeNombre
        ? `${c.id} resuelto. Se quitó la marca de nombre en revisión de ${c.nombre}.`
        : `${c.id} pasó a ${nuevo.replace("_", " ")}.`,
    );
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Casos de soporte"
      descripcion="Contraparte del botón de WhatsApp y de la casilla de nombre incorrecto del pre-registro."
      nav={navAdmin}
      acciones={
        <Button
          className="h-11"
          onClick={() =>
            setNuevo({
              folio: "",
              nombre: "",
              busqueda: "",
              asunto: "",
              detalle: "",
              canal: "whatsapp",
            })
          }
        >
          <Plus className="size-4" /> Abrir caso
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ESTADOS.map((e) => (
          <button
            key={e.valor}
            onClick={() => setEstado(estado === e.valor ? "todos" : e.valor)}
            className={cn(
              "rounded-lg border bg-card p-4 text-left",
              estado === e.valor ? "border-primary" : "border-border hover:bg-muted",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {e.etiqueta}
            </p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">{conteos[e.valor]}</p>
          </button>
        ))}
        <article
          className={cn(
            "rounded-lg border bg-card p-4",
            conteos.nombre > 0 ? "border-estado-discrepancia/40" : "border-border",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            De nombre, sin resolver
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-extrabold tabular-nums",
              conteos.nombre > 0 && "text-estado-discrepancia",
            )}
          >
            {conteos.nombre}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Marcan al participante en el{" "}
            <Link to="/admin/elegibles" className="font-semibold text-primary underline">
              listado de elegibles
            </Link>
          </p>
        </article>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por folio, nombre, asunto o número de caso"
            className="h-11 pl-9"
            aria-label="Buscar caso"
          />
        </div>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Estado
          </span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as typeof estado)}
            className="h-11 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Canal
          </span>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value as typeof canal)}
            className="h-11 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {Object.entries(CANAL).map(([v, c]) => (
              <option key={v} value={v}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto text-sm text-muted-foreground">
          {visibles.length} de {casos.length} casos
        </p>
      </div>

      <ul className="mt-3 grid gap-2">
        {visibles.map((c) => {
          const p = getParticipante(c.folio);
          const Icono = canalDe(c.canal).Icono;
          const esDeNombre = /nombre/i.test(c.asunto);
          const expandido = abierto === c.id;
          return (
            <li key={c.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setAbierto(expandido ? null : c.id)}
                className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left hover:bg-muted/50"
                aria-expanded={expandido}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    <span className="text-base font-semibold">{c.asunto}</span>
                    {esDeNombre && c.estado !== "resuelto" ? (
                      <span className="flex items-center gap-1 rounded-md bg-estado-discrepancia-bg px-2 py-0.5 text-xs font-bold text-estado-discrepancia">
                        <AlertTriangle className="size-3" aria-hidden /> Marca al participante
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.nombre} · {c.folio} · {c.creadoEn}
                    {c.atiende ? ` · atiende ${c.atiende}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icono className="size-3.5" aria-hidden /> {canalDe(c.canal).etiqueta}
                  </span>
                  <EstadoCasoBadge estado={c.estado} />
                </div>
              </button>

              {expandido ? (
                <div className="border-t border-border p-4">
                  {/*
                    El editor sustituye al detalle en el sitio, no en otra
                    pantalla: quien corrige está leyendo justo lo que va a
                    cambiar, y sacarlo a un diálogo le quitaría de la vista el
                    resto del caso.
                  */}
                  {editando?.id === c.id ? (
                    <div className="grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Asunto
                        </span>
                        <Input
                          value={editando.asunto}
                          onChange={(e) => setEditando({ ...editando, asunto: e.target.value })}
                          className="h-11"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Detalle
                        </span>
                        <Textarea
                          value={editando.detalle}
                          onChange={(e) => setEditando({ ...editando, detalle: e.target.value })}
                          rows={4}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Canal
                        </span>
                        <select
                          value={editando.canal}
                          onChange={(e) =>
                            setEditando({
                              ...editando,
                              canal: e.target.value as CasoSoporte["canal"],
                            })
                          }
                          className="h-11 rounded-md border border-input bg-card px-2 text-sm"
                        >
                          {Object.entries(CANAL).map(([v, x]) => (
                            <option key={v} value={v}>
                              {x.etiqueta}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-11"
                          // Un caso sin asunto no se puede encontrar después, y
                          // uno sin detalle no dice qué hay que resolver.
                          disabled={!editando.asunto.trim() || !editando.detalle.trim()}
                          onClick={() => {
                            const cambios = {
                              asunto: editando.asunto.trim(),
                              detalle: editando.detalle.trim(),
                              canal: editando.canal,
                            };
                            editarCaso(c.id, cambios);
                            registrarBitacora(
                              "Editó un caso de soporte",
                              `${c.id} · ${c.folio} · ${cambios.asunto}`,
                            );
                            setEditando(null);
                            toast.success(`${c.id} actualizado.`);
                          }}
                        >
                          <Check className="size-4" /> Guardar cambios
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setEditando(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-line text-sm">{c.detalle}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-9"
                        onClick={() =>
                          setEditando({
                            id: c.id,
                            asunto: c.asunto,
                            detalle: c.detalle,
                            canal: c.canal,
                          })
                        }
                      >
                        <Pencil className="size-4" /> Editar caso
                      </Button>
                    </>
                  )}
                  {p ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PerfilBadge perfil={p.perfil} />
                      {p.matricula ? `${p.matricula} · ` : ""}
                      Día {p.dia} · {p.lugar} · {p.correo}
                    </p>
                  ) : null}
                  {esDeNombre ? (
                    <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                      {/*
                        Corregir el nombre es lo que faltaba en toda la cadena.
                        El alumno lo reportaba, el caso se abría y quedaba
                        marcado en elegibles, pero nadie podía escribir el
                        nombre bueno: resolver el caso solo quitaba la marca, y
                        la constancia se habría impreso igual de mal.
                      */}
                      {corrigiendo?.id === c.id ? (
                        <div className="grid gap-2">
                          <label className="grid gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Nombre correcto
                            </span>
                            <Input
                              autoFocus
                              value={corrigiendo.nombre}
                              onChange={(e) =>
                                setCorrigiendo({ ...corrigiendo, nombre: e.target.value })
                              }
                              className="h-11 uppercase"
                            />
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Se guarda en mayúsculas y sustituye al que aparece en la constancia y en
                            el padrón. Sigue en revisión hasta que marques el caso como resuelto.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              className="h-11"
                              disabled={corrigiendo.nombre.trim().split(/\s+/).length < 2}
                              onClick={() => {
                                const nuevo = corrigiendo.nombre.trim().toUpperCase();
                                corregirNombre(c.folio, nuevo);
                                registrarBitacora(
                                  "Corrigió el nombre de un participante",
                                  `${c.folio} · «${c.nombre}» pasa a «${nuevo}»`,
                                );
                                setCorrigiendo(null);
                                toast.success(`El nombre de ${c.folio} quedó como ${nuevo}.`);
                              }}
                            >
                              <Check className="size-4" /> Guardar el nombre
                            </Button>
                            <Button
                              variant="outline"
                              className="h-11"
                              onClick={() => setCorrigiendo(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p>
                            Al marcar este caso como resuelto, {c.nombre} deja de aparecer marcado
                            en el listado de elegibles y su nombre puede imprimirse.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-9"
                            onClick={() =>
                              setCorrigiendo({
                                id: c.id,
                                folio: c.folio,
                                nombre: nombrePropuesto(c.detalle, c.nombre),
                              })
                            }
                          >
                            <UserPen className="size-4" /> Corregir el nombre
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ESTADOS.filter((e) => e.valor !== c.estado).map((e) => (
                      <Button
                        key={e.valor}
                        variant={e.valor === "resuelto" ? "default" : "outline"}
                        className="h-11"
                        onClick={() => cambiar(c, e.valor)}
                      >
                        {e.valor === "resuelto" ? <Check className="size-4" /> : null}
                        Marcar como {e.etiqueta.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
        {visibles.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <LifeBuoy className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Sin casos con estos filtros</p>
            <p className="text-sm text-muted-foreground">
              Cambia el estado o el canal, o busca por número de caso, por ejemplo CS-001.
            </p>
          </li>
        ) : null}
      </ul>

      {/*
        Abrir un caso a mano: la contraparte de quien llama por WhatsApp o llega
        a ventanilla. Hasta ahora solo nacían del alumno reportando su nombre.
      */}
      <Dialog open={nuevo !== null} onOpenChange={(a) => !a && setNuevo(null)}>
        <DialogContent>
          <DialogTitle>Abrir un caso</DialogTitle>
          {nuevo ? (
            <div className="grid gap-3">
              {/*
                Primero de quién es. `casos_soporte.participante_id` es
                obligatorio: un caso siempre es de alguien, no se puede abrir
                sin participante, y por eso este paso va antes que el asunto.
              */}
              {nuevo.folio ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <span>
                    <span className="font-semibold">{nuevo.nombre}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {nuevo.folio}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNuevo({ ...nuevo, folio: "", nombre: "", busqueda: "" })}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    ¿De quién es el caso?
                  </span>
                  <Input
                    autoFocus
                    value={nuevo.busqueda}
                    onChange={(e) => setNuevo({ ...nuevo, busqueda: e.target.value })}
                    placeholder="Folio, matrícula, nombre o correo"
                    className="h-11"
                  />
                  {candidatos.length > 0 ? (
                    <ul className="mt-1 grid max-h-48 gap-1 overflow-y-auto">
                      {candidatos.slice(0, 8).map((x) => (
                        <li key={x.folio}>
                          <button
                            type="button"
                            onClick={() => setNuevo({ ...nuevo, folio: x.folio, nombre: x.nombre })}
                            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                          >
                            <span className="font-semibold">{x.nombre}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {x.folio}
                              {x.matricula ? ` · ${x.matricula}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : nuevo.busqueda.trim() ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sin coincidencias. Solo se puede abrir un caso a alguien ya pre-registrado.
                    </p>
                  ) : null}
                </label>
              )}

              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Asunto
                </span>
                <Input
                  value={nuevo.asunto}
                  onChange={(e) => setNuevo({ ...nuevo, asunto: e.target.value })}
                  placeholder="No le llegó su código QR"
                  className="h-11"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Detalle
                </span>
                <Textarea
                  value={nuevo.detalle}
                  onChange={(e) => setNuevo({ ...nuevo, detalle: e.target.value })}
                  placeholder="Qué reporta y qué se le respondió."
                  rows={4}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Canal
                </span>
                <select
                  value={nuevo.canal}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, canal: e.target.value as CasoSoporte["canal"] })
                  }
                  className="h-11 rounded-md border border-input bg-card px-2 text-sm"
                >
                  {Object.entries(CANAL).map(([v, x]) => (
                    <option key={v} value={v}>
                      {x.etiqueta}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                className="h-11"
                disabled={
                  guardando || !nuevo.folio || !nuevo.asunto.trim() || !nuevo.detalle.trim()
                }
                onClick={() => {
                  setGuardando(true);
                  /*
                   * Se espera a la base, al revés que el resto del sistema. La
                   * clave CS-004 la pone una secuencia de la base y no hay forma
                   * honesta de adivinarla aquí; enseñar una inventada y
                   * corregirla después sería peor que esperar un momento.
                   */
                  void abrirCaso({
                    folio: nuevo.folio,
                    nombre: nuevo.nombre,
                    asunto: nuevo.asunto,
                    detalle: nuevo.detalle,
                    canal: nuevo.canal,
                  })
                    .then((caso) => {
                      registrarBitacora(
                        "Abrió un caso de soporte",
                        `${caso.id} · ${caso.folio} · ${caso.asunto}`,
                      );
                      toast.success(`${caso.id} abierto.`);
                      setNuevo(null);
                      setAbierto(caso.id);
                    })
                    .catch((e: unknown) =>
                      toast.error((e as Error)?.message || "No pudimos abrir el caso."),
                    )
                    .finally(() => setGuardando(false));
                }}
              >
                {guardando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Abriendo…
                  </>
                ) : (
                  <>
                    <Plus className="size-4" /> Abrir caso
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PantallaPanel>
  );
}
