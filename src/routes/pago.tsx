import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Copy, KeyRound, QrCode } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Rotulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CodigoQR } from "@/components/qr";
import { AccionesDelPase } from "@/components/pase";
import { IMAGEN_VOUCHER_MAL, IMAGEN_VOUCHER_OK } from "@/lib/imagenes";
import { moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/pago")({
  head: () =>
    meta(
      "Instrucciones de pago — XIV Encuentro Internacional de Educación",
      "Datos bancarios, montos, fecha límite y entrega de vouchers en Servicios Financieros para completar tu registro al XIV Encuentro Internacional de Educación.",
    ),
  component: Pago,
});

function CampoCopiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <p className="truncate font-mono text-sm font-semibold">{valor}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 shrink-0"
        onClick={() => {
          void navigator.clipboard?.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        }}
      >
        {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

function Pago() {
  const navigate = useNavigate();
  const { borrador, participante } = usePrototipo();
  // Configuración y catálogo salen del contexto: lo que administración cambie se
  // ve aquí sin recargar.
  const { configuracion: evento, getTaller } = useEstadoEvento();
  // El folio del pre-registro recién creado. `participante?.folio` es el del
  // contexto —otra persona— y enseñarlo aquí era el fallo más visible del flujo.
  const folio = borrador.folio ?? participante?.folio;
  // El nombre va impreso en la imagen del pase, para que se reconozca de quién
  // es sin tener que abrirla y leer el folio.
  const nombre = borrador.nombre ?? participante?.nombre ?? "";
  const taller = getTaller(borrador.tallerId ?? participante?.tallerId);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [copiadoFolio, setCopiadoFolio] = useState(false);

  return (
    <PantallaPublica titulo="Instrucciones de pago" ancho="xl">
      {/*
       * Aquí hubo un botón de imprimir y ya no está.
       *
       * Llamaba a `window.print()`, o sea que abría el mismo diálogo que
       * Ctrl+P: un botón para hacer lo que el navegador ya hace, ocupando el
       * primer sitio de la pantalla —por encima del folio— con lo que menos
       * importa de ella. Lo que hay que llevarse de aquí es el folio, y para
       * eso están los botones de copiar y de descargar el pase, que sí generan
       * algo. La hoja de impresión se queda: las clases `print:hidden` siguen
       * puestas y quien imprima desde el navegador obtiene la misma página
       * limpia de siempre.
       */}
      {/*
       * De `lg:` en adelante el folio se sale de la columna y se queda fijo al
       * costado. Es la pantalla más larga del flujo —depósitos, datos del
       * banco, ejemplos de voucher, ventanilla, los cuatro pasos del QR— y el
       * folio estaba hasta arriba: para copiarlo al llenar la ficha del banco
       * había que subir, copiarlo y volver a bajar a buscar el renglón donde se
       * iba. Fijo al lado no hay que ir a buscarlo, que es justo lo que se hace
       * con este papel delante.
       *
       * `lg:items-start` es lo que hace que `sticky` funcione dentro de una
       * rejilla: sin él la celda se estira a lo alto de la fila y ya no le queda
       * recorrido al que se pega.
       *
       * `print:block` por si el navegador resuelve las consultas de medios de
       * impresión con el ancho de la ventana en vez del de la hoja: en papel
       * esto tiene que volver a ser una columna.
       */}
      <div className="lg:grid lg:grid-cols-[21rem_1fr] lg:items-start lg:gap-6 print:block">
        {/*
        El folio no es un número de referencia: es la llave del portal.
        Con él y su matrícula —o su correo— el alumno entra a ver su estado de
        pago, sus evidencias y su código QR. Si lo pierde, no hay forma de que
        entre, así que la pantalla se lo dice y le da las tres maneras de
        guardarlo: copiarlo, descargar la imagen o imprimir la hoja.
      */}
        <aside className="rounded-lg border border-border bg-card p-5 text-center lg:sticky lg:top-6 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Tu folio
          </p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{folio}</p>

          <div className="mt-3 flex justify-center print:hidden">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                void navigator.clipboard?.writeText(folio ?? "");
                setCopiadoFolio(true);
                setTimeout(() => setCopiadoFolio(false), 1800);
              }}
            >
              {copiadoFolio ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiadoFolio ? "Folio copiado" : "Copiar mi folio"}
            </Button>
          </div>

          <div className="mt-4 flex justify-center">
            <CodigoQR valor={folio ?? ""} size={148} />
          </div>

          <div className="mx-auto mt-4 max-w-md rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-left">
            <p className="flex items-start gap-2 text-sm font-semibold">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              Guarda tu folio: es como entras a tu portal.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Con tu folio y tu matrícula —o tu correo— entras a{" "}
              <Link to="/portal" className="font-semibold text-primary underline">
                tu portal
              </Link>
              , donde ves si tu pago ya se registró, subes tus evidencias y obtienes tu código QR
              para la entrada. Sin el folio no hay forma de entrar.
            </p>
          </div>

          {/* La descarga es real: genera la imagen del pase y la guarda. */}
          <div className="print:hidden">
            <AccionesDelPase folio={folio ?? ""} nombre={nombre} evento={evento.nombre} />
          </div>
        </aside>

        {/* La columna larga: todo lo que hay que hacer con ese folio. */}
        <div>
          <div className="rounded-lg border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg p-4 lg:p-5">
            <p className="flex items-start gap-2 text-sm font-bold text-estado-discrepancia">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              IMPORTANTE: son DOS depósitos por separado. Debes presentar DOS vouchers distintos.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className="rounded-lg border border-border bg-card p-4 lg:p-5">
              <Rotulo>Depósito 1 — Evento</Rotulo>
              <p className="mt-2 font-mono text-sm">Concepto: ENCUENTRO-{folio}</p>
              <p className="mt-1 text-2xl font-bold">{moneda(evento.cuotaEvento)}</p>
            </article>
            {taller ? (
              <article className="rounded-lg border border-border bg-card p-4 lg:p-5">
                <Rotulo>Depósito 2 — Taller</Rotulo>
                <p className="mt-2 font-mono text-sm">Concepto: TALLER-{folio}</p>
                <p className="mt-1 text-2xl font-bold">{moneda(taller.costo)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{taller.nombre}</p>
              </article>
            ) : (
              <article className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
                <Rotulo>Depósito 2 — Taller</Rotulo>
                <p className="mt-2 text-sm text-muted-foreground">
                  No seleccionaste taller, solo debes hacer el depósito del evento.
                </p>
              </article>
            )}
          </div>

          <section className="mt-6">
            <h2 className="text-base font-semibold">Datos bancarios</h2>
            <div className="mt-2 grid gap-2">
              <CampoCopiable etiqueta="Banco" valor={evento.banco.banco} />
              <CampoCopiable etiqueta="Número de cuenta" valor={evento.banco.cuenta} />
              <CampoCopiable etiqueta="CLABE interbancaria" valor={evento.banco.clabe} />
              <CampoCopiable etiqueta="Beneficiario" valor={evento.banco.beneficiario} />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-base font-semibold">Cómo presentar tu voucher</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {[
                { src: IMAGEN_VOUCHER_OK, txt: "Así SÍ: voucher completo, legible y sin dobleces" },
                {
                  src: IMAGEN_VOUCHER_MAL,
                  txt: "Así NO: voucher cortado, borroso o con datos tapados",
                },
              ].map((img) => (
                <button
                  key={img.txt}
                  onClick={() => setAmpliada(img.src)}
                  className="overflow-hidden rounded-lg border border-border bg-card text-left"
                >
                  <img
                    src={img.src}
                    alt={img.txt}
                    className="h-56 w-full object-cover"
                    loading="lazy"
                  />
                  <p className="p-3 text-xs font-medium">{img.txt} — toca para ampliar</p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
              <h2 className="text-sm font-semibold">Entrega de vouchers</h2>
              <p className="mt-1 text-sm text-muted-foreground">{evento.ventanilla.lugar}</p>
              <p className="text-sm text-muted-foreground">{evento.ventanilla.horario}</p>
            </div>
            <div className="rounded-lg border-2 border-primary/30 bg-secondary p-4">
              <h2 className="text-sm font-semibold">Fecha límite de entrega</h2>
              <p className="mt-1 text-lg font-bold">{evento.fechaLimite}</p>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4 lg:p-5">
            <h2 className="text-sm font-semibold">Qué llevar</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              <li>Credencial vigente</li>
              <li>Voucher original (uno por cada depósito)</li>
              <li>Folio impreso o en pantalla</li>
            </ul>
          </section>

          <section className="mt-4 rounded-lg border-2 border-primary/25 bg-muted p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <QrCode className="size-5 shrink-0 text-primary" aria-hidden />
              Tu código QR lo descargas tú
            </h2>
            <p className="mt-2 text-sm">
              Nadie te lo va a enviar. Después de dejar tu voucher en ventanilla, espera{" "}
              <span className="font-semibold">{evento.horasValidacion} horas</span> a que Servicios
              Financieros valide tu pago, entra a tu portal y descárgalo.
            </p>
            <ol className="mt-3 grid gap-2 text-sm">
              {[
                "Deja tu voucher en ventanilla.",
                `Espera ${evento.horasValidacion} horas.`,
                "Entra a tu portal con tu folio y tu matrícula.",
                "Descarga tu QR y tómale una captura de pantalla.",
              ].map((paso, i) => (
                <li key={paso} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  {paso}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              Ese código es tu acceso al evento. Con la captura en tu celular no necesitas internet
              para mostrarlo en la entrada.
            </p>
            <Button
              variant="outline"
              className="mt-3 h-11 w-full print:hidden"
              onClick={() => navigate({ to: "/portal/qr" })}
            >
              Ir a mi código QR
            </Button>
          </section>

          <Button
            className="mt-6 h-12 md:h-11 w-full text-base print:hidden"
            onClick={() => navigate({ to: "/comprobante" })}
          >
            Ver mi comprobante de pre-registro
          </Button>
        </div>
      </div>

      <Dialog open={!!ampliada} onOpenChange={(o) => !o && setAmpliada(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-sm">Ejemplo de voucher</DialogTitle>
          {ampliada ? (
            <img src={ampliada} alt="Ejemplo de voucher ampliado" className="w-full rounded-md" />
          ) : null}
        </DialogContent>
      </Dialog>
    </PantallaPublica>
  );
}
