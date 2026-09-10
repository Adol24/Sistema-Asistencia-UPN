import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Search, SearchX, UserRound } from "lucide-react";
import { PantallaPanel } from "@/components/layouts";
import { navFinancieros } from "@/components/nav-financieros";
import { EstadoVacio, Rotulo } from "@/components/tipografia";
import type { Participante } from "@/dominio/tipos";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { avanceTexto } from "@/dominio/catalogos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { moneda } from "@/lib/formato";
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
      nav={navFinancieros}
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
      nav={navFinancieros}
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
                {avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance)
                  ? ` · ${avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance)}`
                  : ""}
                {p.grupo ? ` · Grupo ${p.grupo}` : ""}
                {p.plantel ? ` · ${p.plantel}` : ""}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-primary/30 bg-secondary px-4 py-3 text-right">
            <Rotulo>Total esperado</Rotulo>
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
              {taller.ponente} · Día {taller.dias.join(" y ")} · {taller.horario} · {taller.lugar} ·{" "}
              {moneda(taller.costo)}
            </p>
          </div>
        ) : null}
      </section>

      <h2 className="mt-8 text-base font-semibold">Pagos registrados</h2>
      <p className="text-sm text-muted-foreground">
        Esta pantalla es de consulta. El cobro se confirma desde la lista, con el botón de cada
        concepto.
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {["Concepto", "Monto", "Fecha", "Origen", "Referencia", "Resultado"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suyos.map((g) => (
                  <tr key={g.id} className="border-t border-border">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
