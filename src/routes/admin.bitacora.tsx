import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, History, Search } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstadoEvento } from "@/lib/estado-evento";
import { descargarCsv } from "@/lib/exportar";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/bitacora")({
  head: () =>
    meta(
      "Bitácora — Administración del Encuentro",
      "Registro filtrable de acciones por usuario, tipo y rango de fechas, incluidas las de la sesión en curso.",
    ),
  component: Bitacora,
});

/** Convierte DD/MM/AAAA HH:mm a algo ordenable y comparable con un <input type=date>. */
function aIso(fecha: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function Bitacora() {
  const { bitacora, registrarBitacora } = useEstadoEvento();
  const [q, setQ] = useState("");
  const [usuario, setUsuario] = useState("todos");
  const [accion, setAccion] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const usuarios = useMemo(() => [...new Set(bitacora.map((b) => b.usuario))].sort(), [bitacora]);
  const acciones = useMemo(() => [...new Set(bitacora.map((b) => b.accion))].sort(), [bitacora]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return bitacora.filter((b) => {
      if (usuario !== "todos" && b.usuario !== usuario) return false;
      if (accion !== "todas" && b.accion !== accion) return false;
      const iso = aIso(b.fecha);
      if (desde && iso && iso < desde) return false;
      if (hasta && iso && iso > hasta) return false;
      if (!t) return true;
      return (
        b.usuario.toLowerCase().includes(t) ||
        b.accion.toLowerCase().includes(t) ||
        b.detalle.toLowerCase().includes(t)
      );
    });
  }, [bitacora, usuario, accion, desde, hasta, q]);

  const deLaSesion = bitacora.filter((b) => b.deLaSesion).length;

  const exportar = () => {
    const n = descargarCsv(
      "bitacora.csv",
      ["fecha", "usuario", "accion", "detalle", "origen"],
      visibles.map((b) => [
        b.fecha,
        b.usuario,
        b.accion,
        b.detalle,
        b.deLaSesion ? "sesión" : "histórico",
      ]),
    );
    registrarBitacora("Exportó la bitácora", `${n} registros`);
    toast.success(`Exportamos ${n} registros.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Bitácora"
      descripcion="Registra lo que ocurre en la sesión, no solo lo histórico. Sin eso no se puede aclarar ninguna inconformidad."
      nav={navAdmin}
      acciones={
        <Button variant="outline" className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar ({visibles.length})
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {bitacora.length} registros en total ·{" "}
        <span className="font-semibold text-foreground">{deLaSesion} de esta sesión</span>, marcados
        en la columna de origen.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en acción o detalle"
            className="h-11 pl-9"
            aria-label="Buscar en la bitácora"
          />
        </div>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Usuario
          </span>
          <select
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="h-11 max-w-56 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Acción
          </span>
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            className="h-11 max-w-64 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todas">Todas</option>
            {acciones.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Desde
          </span>
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-11 w-40"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Hasta
          </span>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-11 w-40"
          />
        </label>
        {desde || hasta || usuario !== "todos" || accion !== "todas" || q ? (
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              setQ("");
              setUsuario("todos");
              setAccion("todas");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              {["Fecha", "Usuario", "Acción", "Detalle", "Origen"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((b) => (
              <tr
                key={b.id}
                className={cn(
                  "border-b border-border last:border-0",
                  b.deLaSesion && "bg-secondary/40",
                )}
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{b.fecha}</td>
                <td className="px-3 py-2">{b.usuario}</td>
                <td className="px-3 py-2 font-medium">{b.accion}</td>
                <td className="px-3 py-2 text-muted-foreground">{b.detalle}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-semibold",
                      b.deLaSesion
                        ? "bg-estado-comprobante-bg text-estado-comprobante"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {b.deLaSesion ? "Sesión" : "Histórico"}
                  </span>
                </td>
              </tr>
            ))}
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center">
                  <History className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-3 text-sm font-semibold">Sin registros con estos filtros</p>
                  <p className="text-sm text-muted-foreground">
                    Prueba con un rango de fechas más amplio o limpia los filtros.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PantallaPanel>
  );
}
