import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, HandCoins, Search, SearchX, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Tabla } from "@/components/tabla";
import { EstadoVacio, Rotulo } from "@/components/tipografia";
import type { Participante } from "@/dominio/tipos";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { avanceTexto } from "@/dominio/catalogos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fechaHora, hoyIso, isoAFecha, moneda, sitioDelTaller } from "@/lib/formato";
import { parsearMonto, resultadoDe, type PagoRegistrado } from "@/lib/pagos-logica";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/financieros/ficha")({
  head: () =>
    meta(
      "Ficha del participante — Servicios Financieros",
      "Ficha de consulta: montos esperados, estado de pago de evento y taller, y el historial de pagos ya registrados.",
    ),
  component: FichaFinancieros,
});

/*
 * Se parte en dos por la misma razón que las pantallas del portal: la
 * comprobación tiene que ocurrir después de todos los hooks. Aquí además la
 * respuesta correcta cuando no hay nadie seleccionado no es un rótulo de espera
 * sino volver a la búsqueda, que es de donde se llega a esta ficha.
 */
function FichaFinancieros() {
  const { participante } = usePrototipo();
  if (!participante) return <SinParticipante />;
  return <FichaDe p={participante} />;
}

function SinParticipante() {
  return (
    <PantallaPanel
      area="financieros"
      titulo="Ficha del participante"
      descripcion="Primero busca a la persona por folio, matrícula o nombre."
    >
      <EstadoVacio icono={<Search className="size-8" aria-hidden />} titulo="Nadie seleccionado">
        Vuelve a la búsqueda y elige a quién quieres atender.
      </EstadoVacio>
    </PantallaPanel>
  );
}

function FichaDe({ p }: { p: Participante }) {
  const { estadoDe, configuracion, infoDia, getTaller, pagos } = useEstadoEvento();
  const taller = getTaller(p.tallerId);
  const dia = infoDia(p.dia);
  const estado = estadoDe(p);
  const totalEsperado = p.montoEsperadoEvento + (taller?.costo ?? 0);
  // Del más antiguo al más reciente, que es el orden en que ocurrieron. Una
  // corrección se registra como un pago más, así que la última fila es la que
  // manda y verlas todas es lo que permite entender cómo se llegó ahí.
  const suyos = pagos.filter((g) => g.folio === p.folio);

  return (
    <PantallaPanel
      area="financieros"
      titulo="Ficha del participante"
      descripcion="Consulta los montos que el sistema espera y los pagos ya registrados."
      acciones={
        <Link
          to="/financieros"
          className="flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-muted"
        >
          Volver a la lista
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
                {avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa)
                  ? ` · ${avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa)}`
                  : ""}
                {p.grupo ? ` · Grupo ${p.grupo}` : ""}
                {p.plantel ? ` · ${p.plantel}` : ""}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-primary/30 bg-secondary px-4 py-3 text-right">
            <Rotulo>Total esperado</Rotulo>
            <p className="text-2xl font-extrabold tabular-nums">{moneda(totalEsperado)}</p>
            {/*
              Un solo depósito desde el 2026-09-25, lleve taller o no. Aquí
              decía «en dos depósitos» cuando hay taller, y esta pantalla la lee
              quien tiene el voucher delante: un voucher único por el total, que
              según este renglón tendría que ser dos. Por dentro se siguen
              confirmando los dos conceptos, y eso es lo que dice el desglose de
              abajo; lo que cambia es cuántos papeles trae la persona.
            */}
            <p className="text-xs text-muted-foreground">
              {taller ? "Evento + taller, en un solo depósito" : "Solo evento, un depósito"}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Día asignado</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {dia.etiqueta} — {isoAFecha(dia.fecha)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lugar</dt>
            <dd className="mt-0.5 text-sm font-semibold">{p.lugar}</dd>
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
              {taller.ponente} · Día {taller.dias.join(" y ")} · {taller.horario} ·{" "}
              {sitioDelTaller(taller)} · {moneda(taller.costo)}
            </p>
          </div>
        ) : null}
      </section>

      <Prorroga p={p} suyos={suyos} />

      <h2 className="mt-8 text-base font-semibold">Pagos registrados</h2>
      <p className="text-sm text-muted-foreground">
        El cobro completo se confirma desde la lista, con el botón de cada concepto. Aquí solo se
        registran los abonos de una prórroga.
      </p>

      <div className="mt-4">
        {suyos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
            <SearchX className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-semibold">Todavía no tiene ningún pago</p>
            <p className="text-sm text-muted-foreground">
              Confírmalo desde la lista cuando presente su comprobante.
            </p>
          </div>
        ) : (
          <Tabla
            anchoMinimo="38rem"
            columnas={["Concepto", "Monto", "Fecha", "Origen", "Referencia", "Resultado"]}
          >
            {suyos.map((g) => (
              <Fila key={g.id}>
                <td className="px-3 py-2 capitalize">{g.concepto}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{moneda(g.monto)}</td>
                <td className="px-3 py-2">{g.fechaDeposito}</td>
                <td className="px-3 py-2">
                  {g.origen === "ventanilla" ? "Ventanilla" : "Carga masiva"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {/* Los de ventanilla no la traen: quien cobró verificó el
                          comprobante en mano. Se dice, en vez de dejar el hueco. */}
                  {g.referencia ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <EstadoPagoBadge estado={g.resultado} />
                </td>
              </Fila>
            ))}
          </Tabla>
        )}
        {/*
          La nota solo existe cuando el monto no cuadró, y es lo que explica la
          discrepancia. Sin ella, el registro no dice nada tres semanas después.
        */}
        {suyos
          .filter((g) => g.nota)
          .map((g) => (
            <p key={`${g.id}-nota`} className="mt-2 rounded-md bg-muted p-3 text-sm">
              <span className="font-semibold capitalize">{g.concepto}:</span> {g.nota}
            </p>
          ))}
      </div>
    </PantallaPanel>
  );
}

/**
 * La prórroga de un alumno: autorizarla, ver el saldo y registrar los abonos.
 *
 * Vive en la ficha y no en la lista porque es el caso raro: la lista atiende la
 * fila con un clic por concepto, y esto necesita leer con calma cuánto lleva
 * esa persona y cuánto le queda.
 *
 * Solo alumnos. Al docente con constancia y al externo no se les ofreció plazo,
 * y la base lo rechaza —`chk_prorroga_solo_alumno`—, así que enseñar aquí un
 * formulario que va a fallar solo sirve para que alguien lo intente.
 */
function Prorroga({ p, suyos }: { p: Participante; suyos: PagoRegistrado[] }) {
  const { autorizarProrroga, quitarProrroga, registrarPago, registrarBitacora } = useEstadoEvento();
  const [hasta, setHasta] = useState("");
  const [monto, setMonto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  if (p.perfil !== "alumno") return null;

  const abonado = (concepto: "evento" | "taller") =>
    suyos.filter((g) => g.concepto === concepto).reduce((n, g) => n + g.monto, 0);

  const esperadoTaller = p.tallerId ? (p.montoEsperadoTaller ?? 0) : 0;
  const faltaEvento = Math.max(0, p.montoEsperadoEvento - abonado("evento"));
  const faltaTaller = Math.max(0, esperadoTaller - abonado("taller"));
  const falta = faltaEvento + faltaTaller;
  const pagado = abonado("evento") + abonado("taller");

  /*
   * A qué concepto va cada peso: primero al evento, después al taller.
   *
   * Es la regla que fijó la organización el 2026-10-02, y hay que aplicarla
   * aquí porque el depósito es UNO solo desde el 2026-09-25 mientras que por
   * dentro siguen siendo dos conceptos con su propio estado. Sin un orden, un
   * abono de 300 contra 500 + 100 podría dejar el taller pagado y el evento a
   * medias, que es justo al revés de lo que le sirve a esa persona: lo que
   * abre la puerta es el evento.
   */
  const reparto = (cantidad: number) => {
    const alEvento = Math.min(cantidad, faltaEvento);
    const alTaller = Math.min(cantidad - alEvento, faltaTaller);
    return { alEvento, alTaller, sobra: cantidad - alEvento - alTaller };
  };

  const cantidad = parsearMonto(monto);
  const previo = cantidad === null ? null : reparto(cantidad);

  const autorizar = async () => {
    /*
     * El día que se elige vence a las 23:59, no a las 00:00.
     *
     * El `T23:59:59` sin «Z» se lee en la zona de quien autoriza, que es la de
     * aquí. Sin la hora, `new Date("2026-10-13")` se interpreta en UTC y en
     * México eso son las 18:00 del día 12: la prórroga vencería seis horas
     * antes de empezar el día prometido.
     */
    const iso = new Date(`${hasta}T23:59:59`).toISOString();
    setOcupado(true);
    try {
      await autorizarProrroga(p.folio, iso);
      toast.success(`${p.nombre} tiene plazo hasta el ${isoAFecha(hasta)}.`);
      setHasta("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo autorizar la prórroga.");
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async () => {
    setOcupado(true);
    try {
      await quitarProrroga(p.folio);
      toast.success("Prórroga retirada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar la prórroga.");
    } finally {
      setOcupado(false);
    }
  };

  /*
   * Un abono puede partirse en dos filas, y es correcto que así sea.
   *
   * La persona entrega un solo voucher, pero los conceptos se cobran por
   * separado desde siempre —una fila por concepto— y el estado de cada uno se
   * deriva de sus propias filas. Registrar 300 como una sola fila del evento
   * dejaría el taller eternamente a cero con el dinero ya cobrado.
   *
   * El importe de cada fila es el del abono, no el esperado: así lo marca la
   * base como «parcial» y así lo suma la vista. Ver `fn_resultado_pago`.
   */
  const registrarAbono = () => {
    if (!previo || previo.sobra > 0) return;
    const fecha = isoAFecha(hoyIso());
    if (previo.alEvento > 0)
      registrarPago({
        folio: p.folio,
        concepto: "evento",
        monto: previo.alEvento,
        montoEsperado: p.montoEsperadoEvento,
        fechaDeposito: fecha,
        resultado: resultadoDe(previo.alEvento, p.montoEsperadoEvento, true),
        origen: "ventanilla",
      });
    if (previo.alTaller > 0)
      registrarPago({
        folio: p.folio,
        concepto: "taller",
        monto: previo.alTaller,
        montoEsperado: esperadoTaller,
        fechaDeposito: fecha,
        resultado: resultadoDe(previo.alTaller, esperadoTaller, true),
        origen: "ventanilla",
      });
    registrarBitacora(
      "Registró un abono de prórroga",
      `${p.folio} · ${moneda(previo.alEvento + previo.alTaller)}`,
    );
    toast.success(`Abono de ${moneda(previo.alEvento + previo.alTaller)} registrado.`);
    setMonto("");
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Prórroga de pago
      </h2>

      {p.prorrogaHasta ? (
        <>
          <p className="mt-1 text-sm">
            Tiene plazo hasta el{" "}
            <strong className="font-semibold">{fechaHora(new Date(p.prorrogaHasta))}</strong>.
          </p>
          {/*
            Las tres cifras juntas, que es como se atiende: lo que debía, lo que
            lleva y lo que falta. Quien cobra necesita la tercera para decirla
            en voz alta, y calcularla de cabeza con un taller de por medio es
            donde se equivoca.
          */}
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Esperado", v: moneda(p.montoEsperadoEvento + esperadoTaller) },
              { t: "Lleva abonado", v: moneda(pagado) },
              { t: "Le falta", v: moneda(falta) },
            ].map((c) => (
              <div key={c.t} className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{c.t}</dt>
                <dd className="mt-0.5 text-xl font-extrabold tabular-nums">{c.v}</dd>
              </div>
            ))}
          </dl>

          {falta > 0 ? (
            <div className="mt-4 border-t border-border pt-4">
              <Label htmlFor="abono" className="text-sm font-semibold">
                Registrar un abono
              </Label>
              <p className="text-xs text-muted-foreground">
                Lo que traiga hoy. Se aplica primero al evento y después al taller.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Input
                  id="abono"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder={`Hasta ${moneda(falta)}`}
                  className="h-11 w-44"
                />
                <Button
                  className="h-11"
                  disabled={!previo || previo.sobra > 0 || previo.alEvento + previo.alTaller === 0}
                  onClick={registrarAbono}
                >
                  <HandCoins className="size-4" /> Registrar abono
                </Button>
                {previo && previo.sobra > 0 ? (
                  <span className="text-sm font-semibold text-estado-discrepancia">
                    Se pasa {moneda(previo.sobra)} de lo que debe.
                  </span>
                ) : null}
                {/*
                  Cómo se va a repartir, antes de pulsar. Solo cuando hay dos
                  conceptos de por medio: decir «$250 al evento» cuando no hay
                  taller es ruido.
                */}
                {previo && previo.sobra === 0 && previo.alTaller > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    {moneda(previo.alEvento)} al evento y {moneda(previo.alTaller)} al taller.
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-md bg-estado-pagado-bg p-3 text-sm font-semibold text-estado-pagado">
              Ya completó su pago. Su código de entrada aparece en su portal en unos minutos.
            </p>
          )}

          {/*
            Quitarla solo se ofrece mientras no haya un peso suyo registrado. La
            base lo niega igual —ver `fn_quitar_prorroga`—, y enseñar un botón
            que va a fallar es peor que no enseñarlo.
          */}
          {suyos.length === 0 ? (
            <Button variant="outline" className="mt-4 h-11" disabled={ocupado} onClick={quitar}>
              Quitar la prórroga
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Dale plazo para completar su depósito. Mientras no lo complete{" "}
            <strong className="font-semibold text-foreground">
              no se le genera su código y no entra al evento
            </strong>
            , pero sigue en la lista de cobros con lo que le falta.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="hasta">Hasta el día</Label>
              <Input
                id="hasta"
                type="date"
                min={hoyIso()}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-11 w-48"
              />
            </div>
            <Button className="h-11" disabled={!hasta || ocupado} onClick={() => void autorizar()}>
              Autorizar prórroga
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
