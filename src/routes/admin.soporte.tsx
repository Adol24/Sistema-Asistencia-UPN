import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, LifeBuoy, Mail, MessageCircle, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { EstadoCasoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const CANAL = {
  whatsapp: { etiqueta: "WhatsApp", Icono: MessageCircle },
  correo: { etiqueta: "Correo", Icono: Mail },
  ventanilla: { etiqueta: "Ventanilla", Icono: Store },
} as const;

function Soporte() {
  const { casos, cambiarEstadoCaso, registrarBitacora, usuarioActual, getParticipante } =
    useEstadoEvento();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | CasoSoporte["estado"]>("todos");
  const [canal, setCanal] = useState<"todos" | CasoSoporte["canal"]>("todos");
  const [abierto, setAbierto] = useState<string | null>(null);

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
          const Icono = CANAL[c.canal].Icono;
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
                    <Icono className="size-3.5" aria-hidden /> {CANAL[c.canal].etiqueta}
                  </span>
                  <EstadoCasoBadge estado={c.estado} />
                </div>
              </button>

              {expandido ? (
                <div className="border-t border-border p-4">
                  <p className="text-sm">{c.detalle}</p>
                  {p ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PerfilBadge perfil={p.perfil} />
                      {p.matricula ? `${p.matricula} · ` : ""}
                      Día {p.dia} · {p.lugar} · {p.correo}
                    </p>
                  ) : null}
                  {esDeNombre ? (
                    <p className="mt-3 rounded-md bg-muted p-3 text-sm">
                      Al marcar este caso como resuelto, {c.nombre} deja de aparecer marcado en el
                      listado de elegibles y su nombre puede imprimirse.
                    </p>
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
    </PantallaPanel>
  );
}
