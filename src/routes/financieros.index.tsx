import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, QrCode, Search, SearchX } from "lucide-react";
import { PantallaPanel } from "@/components/layouts";
import { navFinancieros } from "@/components/nav-financieros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { buscarParticipante, participantes } from "@/mocks/participantes";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import type { Participante } from "@/mocks/tipos";

export const Route = createFileRoute("/financieros/")({
  head: () =>
    meta(
      "Búsqueda — Servicios Financieros",
      "Busca por folio, matrícula, nombre o correo para registrar pagos en ventanilla de Servicios Financieros.",
    ),
  component: BusquedaFinancieros,
});

function BusquedaFinancieros() {
  const navigate = useNavigate();
  const { setFolio } = usePrototipo();
  const { estadoDe } = useEstadoEvento();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState<Participante[] | null>(null);
  const [camara, setCamara] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Los atajos que la pantalla anuncia tienen que responder de verdad: en
  // ventanilla se capturan cientos de personas y el cartel enseña a confiar.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQ("");
        setResultados(null);
        ref.current?.focus();
      }
      if (e.key === "F2") {
        e.preventDefault();
        setCamara(true);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  const buscar = async () => {
    if (!q.trim()) return;
    setCargando(true);
    setResultados(null);
    await simularLatencia();
    setResultados(buscarParticipante(q));
    setCargando(false);
  };

  const abrir = (p: Participante) => {
    setFolio(p.folio);
    navigate({ to: "/financieros/ficha" });
  };

  return (
    <PantallaPanel
      titulo="Servicios Financieros"
      descripcion="Atiende la fila: busca, verifica montos y registra el pago."
      nav={navFinancieros}
    >
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <Input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Folio, matrícula, nombre o correo"
          className="h-14 text-lg"
          aria-label="Buscar participante"
        />
        <Button type="submit" className="h-14 px-6 text-base" disabled={cargando}>
          {cargando ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
          Buscar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 px-6 text-base"
          onClick={() => setCamara(true)}
        >
          <QrCode className="size-5" /> Escanear QR
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        Atajos: <kbd className="rounded border border-border px-1">Enter</kbd> buscar ·{" "}
        <kbd className="rounded border border-border px-1">Esc</kbd> limpiar ·{" "}
        <kbd className="rounded border border-border px-1">F2</kbd> escanear
      </p>

      <div className="mt-6">
        {cargando ? (
          <ul className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="mt-2 h-4 w-40" />
              </li>
            ))}
          </ul>
        ) : resultados === null ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <Search className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Escribe un dato para comenzar</p>
            <p className="text-sm text-muted-foreground">
              Ejemplos del prototipo: {participantes[0]!.folio}, {participantes[0]!.matricula} o
              MUÑOZ.
            </p>
          </div>
        ) : resultados.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Sin coincidencias para “{q}”</p>
            <p className="text-sm text-muted-foreground">
              Revisa el folio completo (por ejemplo PRE-00842) o busca por apellido.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {resultados.map((p) => (
              <li key={p.folio}>
                <button
                  onClick={() => abrir(p)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-muted"
                >
                  <div>
                    <p className="text-base font-semibold">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.folio} · {p.matricula ?? p.correo} · Día {p.dia}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PerfilBadge perfil={p.perfil} />
                    <EstadoPagoBadge estado={estadoDe(p).evento} etiqueta="Evento" />
                    {estadoDe(p).taller ? (
                      <EstadoPagoBadge estado={estadoDe(p).taller!} etiqueta="Taller" />
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={camara} onOpenChange={setCamara}>
        <DialogContent>
          <DialogTitle>Escaneo de QR (simulado)</DialogTitle>
          <div className="relative flex h-64 items-center justify-center rounded-md bg-foreground/90">
            <div className="size-40 rounded-lg border-4 border-dashed border-background/70" />
            <p className="absolute bottom-3 text-xs text-background">
              Apunta al código QR del participante
            </p>
          </div>
          <Button
            className="h-12"
            onClick={() => {
              setCamara(false);
              abrir(participantes[0]!);
            }}
          >
            Simular lectura de {participantes[0]!.folio}
          </Button>
        </DialogContent>
      </Dialog>
    </PantallaPanel>
  );
}
