import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { QrCode, SearchX } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { CamaraQR } from "@/components/camara-qr";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { navFinancieros } from "@/components/nav-financieros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/financieros/")({
  head: () =>
    meta(
      "Ventanilla — Servicios Financieros",
      "La lista de participantes con su estado de pago, filtrable y buscable, para registrar cobros en ventanilla de Servicios Financieros.",
    ),
  component: BusquedaFinancieros,
});

/** Cuántas filas se pintan de una vez. Ver el aviso del final antes de subirlo. */
const TOPE = 200;

type Filtro = "todos" | "por_cobrar" | "pagados";

const ETIQUETA: Record<Filtro, string> = {
  todos: "Todos",
  por_cobrar: "Por cobrar",
  pagados: "Pagados",
};

function BusquedaFinancieros() {
  const navigate = useNavigate();
  const { setFolio } = usePrototipo();
  const { estadoDe, getParticipante, participantes, cargandoDatos } = useEstadoEvento();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [camara, setCamara] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  /**
   * La lista sale entera desde el principio, y el buscador la estrecha.
   *
   * Antes había que teclear algo para ver siquiera una fila. Con una sola
   * ventanilla eso no ahorra nada: el encargado necesita ver a quién le falta
   * pagar sin tener que preguntárselo a la pantalla primero. Buscar sigue
   * estando —con la persona enfrente es más rápido que recorrer la lista, y el
   * QR más aún—, pero deja de ser el peaje para empezar.
   */
  const lista = useMemo(() => {
    // Al corriente es haber pagado TODO lo que debe. Quien tiene el evento
    // pagado y el taller a medias sigue teniendo algo que cobrar, y contarlo
    // entre los pagados es justo lo que haría que se le pasara.
    const alCorriente = (p: Participante) => {
      const e = estadoDe(p);
      return e.evento === "pagado" && (!e.taller || e.taller === "pagado");
    };
    const base = q.trim() ? buscarEnParticipantes(participantes, q) : participantes;
    if (filtro === "todos") return base;
    return base.filter((p) => alCorriente(p) === (filtro === "pagados"));
  }, [participantes, q, filtro, estadoDe]);

  const visibles = lista.slice(0, TOPE);

  // Los atajos que la pantalla anuncia tienen que responder de verdad: en
  // ventanilla se capturan cientos de personas y el cartel enseña a confiar.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQ("");
        setFiltro("todos");
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

  const abrir = (p: Participante) => {
    setFolio(p.folio);
    navigate({ to: "/financieros/ficha" });
  };

  return (
    <PantallaPanel
      area="financieros"
      titulo="Servicios Financieros"
      descripcion="Atiende la fila: busca, verifica montos y registra el pago."
      nav={navFinancieros}
    >
      <form
        className="flex flex-col gap-3 sm:flex-row"
        // La lista se estrecha con cada tecla; enviar solo evitaría que Enter
        // recargue la página.
        onSubmit={(e) => e.preventDefault()}
      >
        <Input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtra por folio, matrícula, nombre o correo"
          className="h-14 text-lg"
          aria-label="Filtrar participantes"
        />
        <Button
          type="button"
          variant="outline"
          className="h-14 px-6 text-base"
          onClick={() => setCamara(true)}
        >
          <QrCode className="size-5" /> Escanear QR
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(Object.keys(ETIQUETA) as Filtro[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFiltro(v)}
            aria-pressed={filtro === v}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filtro === v
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            {ETIQUETA[v]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {cargandoDatos ? "Cargando…" : `${lista.length} de ${participantes.length} participantes`}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Atajos: <kbd className="rounded border border-border px-1">Esc</kbd> limpiar ·{" "}
        <kbd className="rounded border border-border px-1">F2</kbd> escanear
      </p>

      <div className="mt-6">
        {cargandoDatos ? (
          <ul className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="mt-2 h-4 w-40" />
              </li>
            ))}
          </ul>
        ) : lista.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">
              {participantes.length === 0
                ? "Todavía no hay participantes"
                : "Sin coincidencias para ese filtro"}
            </p>
            <p className="text-sm text-muted-foreground">
              {participantes.length === 0
                ? "Nadie se ha pre-registrado, o esta cuenta no puede leer la lista."
                : "Revisa el folio completo (por ejemplo PRE-00842), busca por apellido o cambia el filtro."}
            </p>
          </div>
        ) : (
          <>
            <ul className="grid gap-2">
              {visibles.map((p) => {
                const estado = estadoDe(p);
                return (
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
                        <EstadoPagoBadge estado={estado.evento} etiqueta="Evento" />
                        {estado.taller ? (
                          <EstadoPagoBadge estado={estado.taller} etiqueta="Taller" />
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/*
              El tope se dice, no se aplica en silencio. Una lista recortada sin
              avisar se lee como «ya no hay más», y en ventanilla eso significa
              dar por atendido a quien nadie llegó a ver.
            */}
            {lista.length > TOPE ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Se muestran {TOPE} de {lista.length}. Escribe en el filtro para acotar.
              </p>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={camara} onOpenChange={setCamara}>
        <DialogContent>
          <DialogTitle>Escanea el código del participante</DialogTitle>
          {/*
            La cámara solo se monta con el diálogo abierto: montarla siempre la
            dejaría encendida durante toda la jornada de ventanilla, calentando
            el equipo sin que nadie la esté mirando.

            Aquí el escaneo solo BUSCA a la persona; no registra nada. Quien
            cobra necesita ver la ficha antes de tocar el pago.
          */}
          {camara ? (
            <CamaraQR
              onLeer={(valor) => {
                const p = getParticipante(valor.trim().toUpperCase());
                if (!p) {
                  toast.error(`No encontramos el folio ${valor.trim()}.`);
                  return;
                }
                setCamara(false);
                abrir(p);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PantallaPanel>
  );
}
