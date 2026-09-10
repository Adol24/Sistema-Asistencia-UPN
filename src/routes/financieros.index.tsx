import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, QrCode, SearchX } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { CamaraQR } from "@/components/camara-qr";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { navFinancieros } from "@/components/nav-financieros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { hoyIso, isoAFecha, moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { EstadoPago, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/financieros/")({
  head: () =>
    meta(
      "Ventanilla — Servicios Financieros",
      "La lista de participantes con su estado de pago y un botón para confirmar el cobro de cada concepto.",
    ),
  component: Ventanilla,
});

/** Cuántas filas se pintan de una vez. Ver el aviso del final antes de subirlo. */
const TOPE = 200;

type Filtro = "todos" | "por_cobrar" | "pagados";

const ETIQUETA: Record<Filtro, string> = {
  todos: "Todos",
  por_cobrar: "Por cobrar",
  pagados: "Pagados",
};

function Ventanilla() {
  const navigate = useNavigate();
  const { setFolio } = usePrototipo();
  const {
    estadoDe,
    getParticipante,
    participantes,
    cargandoDatos,
    registrarPago,
    registrarBitacora,
  } = useEstadoEvento();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [camara, setCamara] = useState(false);
  /**
   * Conceptos ya confirmados en esta sesión, para que un doble clic no registre
   * dos pagos.
   *
   * Va en una referencia y no en estado a propósito. El estado se lee del
   * render anterior: dos clics seguidos dentro del mismo ciclo verían los dos
   * que no hay nada en curso y cobrarían dos veces. Y no hay red debajo —la
   * tabla `pagos` no tiene restricción de unicidad por participante y concepto,
   * porque una corrección se registra precisamente como un pago más—, así que
   * este guardia es el único que hay.
   */
  const confirmados = useRef<Set<string>>(new Set());

  useEffect(() => {
    ref.current?.focus();
  }, []);

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

  /**
   * Confirma el cobro de un concepto desde la propia lista.
   *
   * El importe registrado es el esperado, no uno capturado: quien cobra tiene
   * el comprobante delante y confirma que coincide. Si no coincidiera, no
   * pulsa. Por eso el botón enseña la cantidad —confirmar a ciegas y confirmar
   * $650 no son el mismo gesto—, y por eso el registro nunca puede quedar en
   * discrepancia por esta vía.
   *
   * La fecha es la de hoy, que es cuando se atiende la ventanilla. Para un
   * depósito de otro día, la carga masiva del banco trae la suya.
   */
  const confirmar = (p: Participante, concepto: "evento" | "taller", montoEsperado: number) => {
    const clave = `${p.folio}:${concepto}`;
    if (confirmados.current.has(clave)) return;
    confirmados.current.add(clave);
    registrarPago({
      folio: p.folio,
      concepto,
      monto: montoEsperado,
      montoEsperado,
      fechaDeposito: isoAFecha(hoyIso()),
      resultado: "pagado",
      origen: "ventanilla",
    });
    registrarBitacora(
      "Confirmó un pago en ventanilla",
      `${p.folio} · ${concepto} · ${moneda(montoEsperado)}`,
    );
    toast.success(`${p.nombre}: ${concepto} pagado.`);
  };

  const abrirFicha = (p: Participante) => {
    setFolio(p.folio);
    void navigate({ to: "/financieros/ficha" });
  };

  return (
    <PantallaPanel
      area="financieros"
      titulo="Servicios Financieros"
      descripcion="Atiende la fila: busca a la persona y confirma su pago."
      nav={navFinancieros}
    >
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
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
        <kbd className="rounded border border-border px-1">F2</kbd> escanear · toca el nombre para
        ver su ficha
      </p>

      <div className="mt-6">
        {cargandoDatos ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="mt-2 h-4 w-40" />
              </div>
            ))}
          </div>
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Participante</th>
                    <th className="px-3 py-2 font-semibold">Evento</th>
                    <th className="px-3 py-2 font-semibold">Taller</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => {
                    const estado = estadoDe(p);
                    return (
                      <tr key={p.folio} className="border-t border-border align-middle">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => abrirFicha(p)}
                            className="text-left hover:underline"
                          >
                            <span className="font-semibold">{p.nombre}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {p.folio}
                              {p.matricula ? ` · ${p.matricula}` : ""}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <Celda
                            estado={estado.evento}
                            monto={p.montoEsperadoEvento}
                            onConfirmar={() => confirmar(p, "evento", p.montoEsperadoEvento)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {p.tallerId && estado.taller ? (
                            <Celda
                              estado={estado.taller}
                              monto={p.montoEsperadoTaller ?? 0}
                              onConfirmar={() => confirmar(p, "taller", p.montoEsperadoTaller ?? 0)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin taller</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/*
              El tope se dice, no se aplica en silencio. Una lista recortada sin
              avisar se lee como «ya no hay más», y en ventanilla eso es dar por
              atendido a quien nadie llegó a ver.
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

            El escaneo solo FILTRA la lista; no confirma nada. Quien cobra tiene
            que ver a quién le está cobrando antes de pulsar.
          */}
          {camara ? (
            <CamaraQR
              onLeer={(valor) => {
                const folio = valor.trim().toUpperCase();
                if (!getParticipante(folio)) {
                  toast.error(`No encontramos el folio ${valor.trim()}.`);
                  return;
                }
                setCamara(false);
                setFiltro("todos");
                setQ(folio);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PantallaPanel>
  );
}

/**
 * Una celda de concepto: o el estado en que quedó, o el botón para confirmarlo.
 *
 * El botón lleva el importe escrito. Confirmar a ciegas y confirmar $650 no son
 * el mismo gesto, y esta pantalla registra un cobro con un solo clic.
 */
function Celda({
  estado,
  monto,
  onConfirmar,
}: {
  estado: EstadoPago;
  monto: number;
  onConfirmar: () => void;
}) {
  // Ya resuelto: no hay nada que confirmar. La discrepancia se arregla desde la
  // ficha o con la carga masiva, no volviendo a pulsar aquí.
  if (estado === "pagado" || estado === "discrepancia" || estado === "cancelado")
    return <EstadoPagoBadge estado={estado} />;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" className="h-9" onClick={onConfirmar}>
        <Check className="size-4" />
        Confirmar {moneda(monto)}
      </Button>
      <EstadoPagoBadge estado={estado} />
    </div>
  );
}
