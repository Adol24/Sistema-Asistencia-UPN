import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  Camera,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  QrCode,
  SearchX,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navFinancieros } from "@/components/nav-financieros";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { soloImporte } from "@/lib/campos";
import { avanceTexto } from "@/mocks/catalogos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTaller } from "@/mocks/talleres";

import { IMAGEN_VOUCHER } from "@/mocks/evidencias";
import { isoAFecha, moneda, simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { parsearMonto, type Concepto, type Diagnostico } from "@/lib/pagos-logica";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/financieros/ficha")({
  head: () =>
    meta(
      "Ficha del participante — Servicios Financieros",
      "Ficha del participante con montos esperados, estados de pago separados de evento y taller, y registro de pago en ventanilla.",
    ),
  component: FichaFinancieros,
});

function FichaFinancieros() {
  const { participante: p } = usePrototipo();
  const { estadoDe, configuracion, infoDia } = useEstadoEvento();
  const taller = getTaller(p.tallerId);
  const dia = infoDia(p.dia);
  const estado = estadoDe(p);
  const totalEsperado = p.montoEsperadoEvento + (taller?.costo ?? 0);

  return (
    <PantallaPanel
      area="financieros"
      titulo="Ficha del participante"
      descripcion="Verifica los montos que el sistema espera y registra el pago."
      nav={navFinancieros}
      acciones={
        <Link
          to="/financieros"
          className="flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-muted"
        >
          Buscar a otra persona
        </Link>
      }
    >
      {p.nombreEnRevision ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertTitle>El nombre de esta persona está en revisión</AlertTitle>
          <AlertDescription>
            Puedes registrar su pago con normalidad. Su caso queda señalado en el listado de
            elegibles para que no se elabore su documento con el nombre equivocado; soporte lo
            resuelve. Avísale en ventanilla.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="text-xl font-bold leading-tight">{p.nombre}</h2>
              <PerfilBadge perfil={p.perfil} />
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {p.folio}
              {p.matricula ? ` · ${p.matricula}` : ""} · {p.correo}
            </p>
            {p.programa ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {p.programa}
                {avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance)
                  ? ` · ${avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance)}`
                  : ""}
                {p.grupo ? ` · Grupo ${p.grupo}` : ""}
                {p.plantel ? ` · ${p.plantel}` : ""}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-primary/30 bg-secondary px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Total esperado
            </p>
            <p className="text-2xl font-extrabold tabular-nums">{moneda(totalEsperado)}</p>
            <p className="text-xs text-muted-foreground">
              {taller ? "Evento + taller, en dos depósitos" : "Solo evento, un depósito"}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Día asignado</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {dia.etiqueta} — {dia.fecha}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lugar</dt>
            <dd className="mt-0.5 text-sm font-semibold">{p.sede}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pago del evento</dt>
            <dd className="mt-1">
              <EstadoPagoBadge estado={estado.evento} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pago del taller</dt>
            <dd className="mt-1">
              {estado.taller ? (
                <EstadoPagoBadge estado={estado.taller} />
              ) : (
                <span className="text-sm text-muted-foreground">Sin taller</span>
              )}
            </dd>
          </div>
        </dl>

        {taller ? (
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold">
              {taller.id} — {taller.nombre}
            </p>
            <p className="text-muted-foreground">
              {taller.ponente} · Día {taller.dias.join(" y ")} · {taller.horario} · {taller.lugar} ·{" "}
              {moneda(taller.costo)}
            </p>
          </div>
        ) : null}
      </section>

      <h2 className="mt-8 text-base font-semibold">Registro de pago</h2>
      <p className="text-sm text-muted-foreground">
        Un bloque por concepto. El sistema ya sabe cuánto debía pagar: solo captura lo que dice el
        voucher.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BloquePago
          concepto="evento"
          titulo="Depósito 1 — Evento"
          referenciaEsperada={`ENCUENTRO-${p.folio}`}
          montoEsperado={p.montoEsperadoEvento}
          estadoActual={estado.evento}
          folio={p.folio}
        />
        {taller ? (
          <BloquePago
            concepto="taller"
            titulo="Depósito 2 — Taller"
            referenciaEsperada={`TALLER-${p.folio}`}
            montoEsperado={taller.costo}
            estadoActual={estado.taller ?? "pre_registrado"}
            folio={p.folio}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
            <SearchX className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-semibold">Esta persona no eligió taller</p>
            <p className="text-sm text-muted-foreground">
              Solo debe entregar el voucher del evento.
            </p>
          </div>
        )}
      </div>
    </PantallaPanel>
  );
}

function BloquePago({
  concepto,
  titulo,
  referenciaEsperada,
  montoEsperado,
  estadoActual,
  folio,
}: {
  concepto: Concepto;
  titulo: string;
  referenciaEsperada: string;
  montoEsperado: number;
  estadoActual: string;
  folio: string;
}) {
  const { diagnosticar, registrarPago, registrarBitacora } = useEstadoEvento();
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [voucher, setVoucher] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<"pagado" | "discrepancia" | null>(null);
  const [tocado, setTocado] = useState(false);

  // Se evalúa en cada tecla, no al enviar: en ventanilla el aviso tiene que
  // llegar antes de que la persona termine de capturar.
  const d = diagnosticar({ referencia, monto, montoEsperado });
  const requiereNota = d.clase === "menor" || d.clase === "mayor";
  const bloqueado = d.clase === "duplicada" || d.clase === "invalido";
  const faltaFecha = !fecha;
  const faltaVoucher = !voucher;
  const puedeGuardar =
    !bloqueado &&
    (d.clase === "exacto" || requiereNota) &&
    !faltaFecha &&
    !faltaVoucher &&
    (!requiereNota || nota.trim().length >= 10) &&
    !guardando;

  const guardar = async () => {
    const n = parsearMonto(monto);
    if (n === null) return;
    setGuardando(true);
    await simularLatencia();
    const resultado = d.clase === "exacto" ? "pagado" : "discrepancia";
    registrarPago({
      folio,
      concepto,
      monto: n,
      montoEsperado,
      referencia: referencia.trim(),
      fechaDeposito: isoAFecha(fecha),
      resultado,
      origen: "ventanilla",
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    });
    registrarBitacora(
      resultado === "pagado" ? "Registró un pago" : "Registró un pago con discrepancia",
      `${folio} · ${concepto} · $${n.toFixed(2)} · ref ${referencia.trim()}`,
    );
    setGuardando(false);
    setHecho(resultado);
    toast.success(
      resultado === "pagado"
        ? "Pago registrado y QR generado"
        : "Pago registrado como discrepancia",
    );
  };

  if (hecho) {
    return (
      <section
        className={cn(
          "rounded-lg border-2 p-5",
          hecho === "pagado"
            ? "border-estado-pagado/40 bg-estado-pagado-bg"
            : "border-estado-discrepancia/40 bg-estado-discrepancia-bg",
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {titulo}
        </p>
        {hecho === "pagado" ? (
          <>
            <p className="mt-2 flex items-center gap-2 text-lg font-bold text-estado-pagado">
              <CheckCircle2 className="size-5" aria-hidden /> Pagado
            </p>
            <p className="mt-3 flex items-start gap-2 rounded-md bg-card p-3 text-sm">
              <QrCode className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Su código QR ya está disponible en su portal, para que lo descargue él mismo. Si
              pregunta en ventanilla, dile que entre con su folio y su matrícula.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 flex items-center gap-2 text-lg font-bold text-estado-discrepancia">
              <AlertTriangle className="size-5" aria-hidden /> Registrado con discrepancia
            </p>
            <p className="mt-3 rounded-md bg-card p-3 text-sm">
              El concepto queda en discrepancia y no genera QR todavía. La nota que capturaste viaja
              con el caso para que se resuelva.
            </p>
          </>
        )}
        <Button variant="outline" className="mt-4 h-11" onClick={() => setHecho(null)}>
          Corregir este registro
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {titulo}
        </p>
        <span className="text-xs text-muted-foreground">Estado actual: {estadoActual}</span>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">Concepto: {referenciaEsperada}</p>
      <p className="mt-2 text-sm">
        Monto esperado por el sistema:{" "}
        <span className="text-lg font-bold tabular-nums">{moneda(montoEsperado)}</span>
      </p>

      <div className="mt-4 grid gap-4">
        <div>
          <Label htmlFor={`monto-${concepto}`}>Monto del voucher</Label>
          <Input
            id={`monto-${concepto}`}
            inputMode="decimal"
            value={monto}
            // El campo no admite letras. `diagnosticarPago` conserva su rama de
            // monto inválido porque la carga masiva sí recibe texto de un CSV.
            onChange={(e) => setMonto(soloImporte(e.target.value))}
            onBlur={() => setTocado(true)}
            placeholder={String(montoEsperado)}
            className="mt-1 h-12 text-base"
            aria-invalid={d.clase === "menor" || d.clase === "mayor" || d.clase === "invalido"}
          />
        </div>
        <div>
          <Label htmlFor={`ref-${concepto}`}>Referencia bancaria</Label>
          <Input
            id={`ref-${concepto}`}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            onBlur={() => setTocado(true)}
            placeholder="REF482910"
            className="mt-1 h-12 font-mono text-base"
            aria-invalid={bloqueado}
          />
        </div>
        <div>
          <Label htmlFor={`fecha-${concepto}`}>Fecha del depósito</Label>
          <Input
            id={`fecha-${concepto}`}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onBlur={() => setTocado(true)}
            className="mt-1 h-12 text-base"
            aria-invalid={tocado && faltaFecha}
          />
          {tocado && faltaFecha ? (
            <p className="mt-1 text-xs font-medium text-destructive">
              Captura la fecha que aparece impresa en el voucher.
            </p>
          ) : fecha ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Se registrará como <span className="font-mono">{isoAFecha(fecha)}</span>
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={`voucher-${concepto}`}>Foto del voucher</Label>
          <label
            htmlFor={`voucher-${concepto}`}
            className="mt-1 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted/40 p-4 text-center text-sm hover:bg-muted"
          >
            <Camera className="size-5 text-muted-foreground" aria-hidden />
            <span className="font-medium">Tomar foto o elegir archivo</span>
            <span className="text-xs text-muted-foreground">Cámara simulada en el prototipo</span>
            <input
              id={`voucher-${concepto}`}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setVoucher(f ? URL.createObjectURL(f) : IMAGEN_VOUCHER);
              }}
            />
          </label>
          {voucher ? (
            <img
              src={voucher}
              alt="Vista previa del voucher capturado"
              className="mt-2 h-40 w-full rounded-md border border-border object-cover"
            />
          ) : tocado ? (
            <p className="mt-1 text-xs font-medium text-destructive">
              Falta la foto del voucher: es el respaldo del registro.
            </p>
          ) : null}
        </div>

        <AvisoValidacion d={d} />

        {requiereNota ? (
          <div>
            <Label htmlFor={`nota-${concepto}`}>Nota obligatoria — explica la diferencia</Label>
            <Textarea
              id={`nota-${concepto}`}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Por ejemplo: depositó $600, se le pidió complementar $50 antes del viernes."
              className="mt-1 text-base"
              aria-invalid={nota.trim().length > 0 && nota.trim().length < 10}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {nota.trim().length < 10
                ? `Escribe al menos 10 caracteres (llevas ${nota.trim().length}).`
                : "Nota lista."}
            </p>
          </div>
        ) : null}

        <Button className="h-12 text-base" disabled={!puedeGuardar} onClick={() => void guardar()}>
          {guardando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Registrando el pago…
            </>
          ) : (
            <>
              <Check className="size-5" /> Registrar pago del {concepto}
            </>
          )}
        </Button>
        {!puedeGuardar && !guardando ? (
          <p className="text-center text-xs text-muted-foreground">
            {bloqueado
              ? "Corrige la referencia bancaria para poder registrar."
              : d.clase === "vacio"
                ? "Captura monto y referencia para continuar."
                : requiereNota && nota.trim().length < 10
                  ? "La nota es obligatoria cuando el monto no coincide."
                  : faltaFecha
                    ? "Falta la fecha del depósito."
                    : faltaVoucher
                      ? "Falta la foto del voucher."
                      : "Completa los campos para registrar."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AvisoValidacion({ d }: { d: Diagnostico }) {
  if (d.clase === "vacio") return null;

  if (d.clase === "duplicada")
    return (
      <Alert variant="destructive">
        <Ban className="size-4" />
        <AlertTitle>Referencia bancaria duplicada</AlertTitle>
        <AlertDescription>
          {d.mensaje} No registres este voucher: verifica que no sea una copia del comprobante de
          otra persona.
        </AlertDescription>
      </Alert>
    );

  if (d.clase === "invalido")
    return (
      <Alert variant="destructive">
        <Ban className="size-4" />
        <AlertTitle>Dato inválido</AlertTitle>
        <AlertDescription>{d.mensaje}</AlertDescription>
      </Alert>
    );

  if (d.clase === "menor" || d.clase === "mayor")
    return (
      <div className="rounded-md border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg p-3">
        <p className="flex items-start gap-2 text-sm font-semibold text-estado-discrepancia">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {d.clase === "menor" ? "Monto menor al esperado" : "Monto mayor al esperado"}
        </p>
        <p className="mt-1 text-sm text-estado-discrepancia">{d.mensaje}</p>
        <p className="mt-1 text-xs text-estado-discrepancia">
          Puedes continuar: el concepto quedará en discrepancia.
        </p>
      </div>
    );

  return (
    <div className="rounded-md border-2 border-estado-pagado/40 bg-estado-pagado-bg p-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-estado-pagado">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {d.mensaje}
      </p>
      <p className="mt-1 flex items-start gap-2 text-xs text-estado-pagado">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Al registrar pasa a pagado y su código QR queda disponible en su portal.
      </p>
    </div>
  );
}
