import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  elegibilidadEvento,
  elegibilidadTaller,
  nombreConstancia,
  nombreEnRevisionActivo,
  type Elegibilidad,
  type EntornoConstancias,
} from "@/lib/elegibilidad";
import { descargarCsv } from "@/lib/exportar";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia, Participante } from "@/mocks/tipos";

export const Route = createFileRoute("/admin/elegibles")({
  head: () =>
    meta(
      "Listado de elegibles — Administración del Encuentro",
      "Quién cumple los requisitos de constancia por perfil, qué le falta a quien no, y exportación para quien elabora los documentos.",
    ),
  component: Elegibles,
});

type FiltroEstado = "todos" | "elegibles" | "no_elegibles" | "en_revision";

interface Fila {
  p: Participante;
  evento: Elegibilidad;
  taller: Elegibilidad | null;
  marca: ReturnType<typeof nombreEnRevisionActivo>;
}

function Elegibles() {
  const {
    participantes,
    estadoDe,
    asistenciasDe,
    evidencias,
    casos,
    getTaller,
    registrarBitacora,
  } = useEstadoEvento();
  const [q, setQ] = useState("");
  const [perfil, setPerfil] = useState<"todos" | "alumno" | "docente" | "externo">("todos");
  const [dia, setDia] = useState<"todos" | Dia>("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");

  const entorno = useMemo<EntornoConstancias>(
    () => ({
      estadoDe,
      asistenciasDe,
      evidencias,
      diasTallerDe: (id) => (getTaller(id)?.dias ?? []) as Dia[],
    }),
    [estadoDe, asistenciasDe, evidencias, getTaller],
  );

  const filas = useMemo<Fila[]>(
    () =>
      participantes.map((p) => ({
        p,
        evento: elegibilidadEvento(entorno, p),
        taller: elegibilidadTaller(entorno, p),
        marca: nombreEnRevisionActivo(p, casos),
      })),
    [participantes, entorno, casos],
  );

  const conteos = useMemo(() => {
    const porPerfil = (["alumno", "docente", "externo"] as const).map((x) => {
      const suyas = filas.filter((f) => f.p.perfil === x);
      return {
        perfil: x,
        total: suyas.length,
        elegibles: suyas.filter((f) => f.evento.elegible).length,
        enRevision: suyas.filter((f) => f.marca.marcado).length,
      };
    });
    return {
      porPerfil,
      taller: filas.filter((f) => f.taller?.elegible).length,
      elegibles: filas.filter((f) => f.evento.elegible).length,
      enRevision: filas.filter((f) => f.marca.marcado).length,
    };
  }, [filas]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => {
      if (perfil !== "todos" && f.p.perfil !== perfil) return false;
      if (dia !== "todos" && f.p.dia !== dia) return false;
      if (estado === "elegibles" && !f.evento.elegible) return false;
      if (estado === "no_elegibles" && f.evento.elegible) return false;
      if (estado === "en_revision" && !f.marca.marcado) return false;
      if (!t) return true;
      return (
        f.p.nombre.toLowerCase().includes(t) ||
        f.p.folio.toLowerCase().includes(t) ||
        (f.p.matricula ?? "").toLowerCase().includes(t)
      );
    });
  }, [filas, perfil, dia, estado, q]);

  // La marca de nombre en revisión viaja en la exportación, no solo en pantalla:
  // quien elabora los documentos tiene que poder apartar esos casos.
  const exportarEvento = (soloElegibles: boolean) => {
    const fuente = soloElegibles ? filas.filter((f) => f.evento.elegible) : visibles;
    const n = descargarCsv(
      soloElegibles ? "elegibles-evento.csv" : "listado-evento.csv",
      [
        "nombre_constancia",
        "folio",
        "matricula",
        "perfil",
        "dia",
        "sede",
        "elegible",
        "nombre_en_revision",
        "caso_soporte",
        "requisito_faltante",
      ],
      fuente.map((f) => [
        nombreConstancia(f.p.nombre),
        f.p.folio,
        f.p.matricula ?? "",
        f.p.perfil,
        f.p.dia,
        f.p.sede,
        f.evento.elegible ? "SI" : "NO",
        f.marca.marcado ? "SI — REVISAR ANTES DE IMPRIMIR" : "NO",
        f.marca.marcado ? f.marca.caso.id : "",
        f.evento.faltante?.comoSeResuelve ?? "",
      ]),
    );
    registrarBitacora(
      "Exportó listado de elegibles",
      `${soloElegibles ? "Solo elegibles" : "Listado filtrado"} · ${n} registros`,
    );
    toast.success(`Exportamos ${n} registros.`);
  };

  const exportarTalleres = () => {
    const fuente = filas.filter((f) => f.taller);
    const n = descargarCsv(
      "elegibles-talleres.csv",
      [
        "nombre_constancia",
        "folio",
        "matricula",
        "taller",
        "taller_nombre",
        "dias",
        "elegible",
        "nombre_en_revision",
        "requisito_faltante",
      ],
      fuente.map((f) => {
        const t = getTaller(f.p.tallerId);
        return [
          nombreConstancia(f.p.nombre),
          f.p.folio,
          f.p.matricula ?? "",
          f.p.tallerId ?? "",
          t?.nombre ?? "",
          t?.dias.join(" y ") ?? "",
          f.taller?.elegible ? "SI" : "NO",
          f.marca.marcado ? "SI — REVISAR ANTES DE IMPRIMIR" : "NO",
          f.taller?.faltante?.comoSeResuelve ?? "",
        ];
      }),
    );
    registrarBitacora("Exportó listado de talleres", `${n} registros`);
    toast.success(`Exportamos ${n} registros de taller.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Listado de elegibles"
      descripcion="El sistema no genera las constancias: calcula quién cumple y entrega el listado a quien las elabora."
      nav={navAdmin}
      acciones={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => exportarEvento(false)}>
            <Download className="size-4" /> Exportar lo filtrado ({visibles.length})
          </Button>
          <Button variant="outline" className="h-11" onClick={exportarTalleres}>
            <Download className="size-4" /> Talleres
          </Button>
          <Button className="h-11" onClick={() => exportarEvento(true)}>
            <Download className="size-4" /> Solo elegibles ({conteos.elegibles})
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {conteos.porPerfil.map((r) => (
          <article key={r.perfil} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {r.perfil}s elegibles
            </p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">
              {r.elegibles}
              <span className="text-base font-medium text-muted-foreground"> / {r.total}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.enRevision > 0 ? `${r.enRevision} con nombre en revisión` : "Sin marcas"}
            </p>
          </article>
        ))}
        <article className="rounded-lg border border-primary/40 bg-secondary p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Elegibles de taller
          </p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums">{conteos.taller}</p>
          <p className="mt-1 text-xs text-muted-foreground">Listado independiente</p>
        </article>
        <article
          className={cn(
            "rounded-lg border bg-card p-4",
            conteos.enRevision > 0 ? "border-estado-discrepancia/40" : "border-border",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Nombre en revisión
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-extrabold tabular-nums",
              conteos.enRevision > 0 && "text-estado-discrepancia",
            )}
          >
            {conteos.enRevision}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Apartar antes de imprimir</p>
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
            placeholder="Buscar por nombre, folio o matrícula"
            className="h-11 pl-9"
            aria-label="Buscar participante"
          />
        </div>
        <Selector
          etiqueta="Perfil"
          valor={perfil}
          onChange={(v) => setPerfil(v as typeof perfil)}
          opciones={[
            ["todos", "Todos"],
            ["alumno", "Alumnos"],
            ["docente", "Docentes"],
            ["externo", "Externos"],
          ]}
        />
        <Selector
          etiqueta="Día"
          valor={String(dia)}
          onChange={(v) => setDia(v === "todos" ? "todos" : (Number(v) as Dia))}
          opciones={[
            ["todos", "Todos"],
            ["1", "Día 1"],
            ["2", "Día 2"],
            ["3", "Día 3"],
          ]}
        />
        <Selector
          etiqueta="Elegibilidad"
          valor={estado}
          onChange={(v) => setEstado(v as FiltroEstado)}
          opciones={[
            ["todos", "Todos"],
            ["elegibles", "Elegibles"],
            ["no_elegibles", "No elegibles"],
            ["en_revision", "Nombre en revisión"],
          ]}
        />
        <p className="ml-auto text-sm text-muted-foreground">
          {visibles.length} de {filas.length} · {visibles.filter((f) => f.evento.elegible).length}{" "}
          elegibles en pantalla
        </p>
      </div>

      <ul className="mt-3 grid gap-2">
        {visibles.map((f) => (
          <li
            key={f.p.folio}
            className={cn(
              "rounded-lg border bg-card p-4",
              f.marca.marcado ? "border-estado-discrepancia/50" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{f.p.nombre}</span>
                  <PerfilBadge perfil={f.p.perfil} />
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-bold",
                      f.evento.elegible
                        ? "bg-estado-pagado-bg text-estado-pagado"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {f.evento.elegible ? "Elegible" : "No elegible"}
                  </span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {f.p.folio}
                  {f.p.matricula ? ` · ${f.p.matricula}` : ""} · Día {f.p.dia} · {f.p.sede}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-muted-foreground">Nombre para la constancia: </span>
                  <span className="font-mono font-semibold">{nombreConstancia(f.p.nombre)}</span>
                </p>
              </div>
            </div>

            {f.marca.marcado ? (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-estado-discrepancia-bg p-3 text-sm text-estado-discrepancia">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-bold">Nombre en revisión — apartar antes de imprimir.</span>{" "}
                  Caso {f.marca.caso.id} ({f.marca.caso.estado.replace("_", " ")}):{" "}
                  {f.marca.caso.asunto}. La marca desaparece al resolver el caso en la bandeja de
                  soporte.
                </span>
              </p>
            ) : null}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <BloqueRequisitos titulo="Constancia del evento" e={f.evento} />
              {f.taller ? (
                <BloqueRequisitos titulo={`Constancia del taller ${f.p.tallerId}`} e={f.taller} />
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Sin taller inscrito: solo aplica el listado del evento.
                </div>
              )}
            </div>
          </li>
        ))}
        {visibles.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm font-semibold">Sin participantes con estos filtros</p>
            <p className="text-sm text-muted-foreground">
              Cambia el perfil o el estado, o busca por folio, por ejemplo {participantes[0]!.folio}
              .
            </p>
          </li>
        ) : null}
      </ul>
    </PantallaPanel>
  );
}

function Selector({
  etiqueta,
  valor,
  onChange,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: [string, string][];
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {etiqueta}
      </span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-md border border-input bg-card px-2 text-sm"
      >
        {opciones.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function BloqueRequisitos({ titulo, e }: { titulo: string; e: Elegibilidad }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      <ul className="mt-2 grid gap-1">
        {e.requisitos.map((r) => (
          <li key={r.texto} className="flex items-start gap-2 text-sm">
            {r.ok ? (
              <Check className="mt-0.5 size-4 shrink-0 text-estado-pagado" aria-hidden />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-estado-cancelado" aria-hidden />
            )}
            <span className={r.ok ? "" : "text-muted-foreground"}>{r.texto}</span>
          </li>
        ))}
      </ul>
      {e.faltante ? (
        <p className="mt-2 rounded-md bg-muted p-2 text-xs">
          <span className="font-semibold">Le falta:</span> {e.faltante.comoSeResuelve}
        </p>
      ) : null}
    </div>
  );
}
