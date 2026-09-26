import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Copy, KeyRound, QrCode } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Rotulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CodigoQR } from "@/components/qr";
import { AccionesDelPase, CodigoPendiente } from "@/components/pase";
import { IMAGEN_INSTRUCCIONES_VOUCHER } from "@/lib/imagenes";
import { fechaYHoraTexto, moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { abreLaPuerta } from "@/lib/pagos-logica";
import { depositoDe } from "@/lib/deposito";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/pago")({
  head: () =>
    meta(
      "Instrucciones de pago — XIV Encuentro Internacional de Educación",
      // Sin nombrar el departamento: una `meta` se arma antes de que llegue la
      // configuración, así que no puede leer `ventanilla_lugar` y cualquier
      // nombre escrito aquí envejece con el primer cambio de sitio.
      "Datos bancarios, monto único, concepto, fecha límite y entrega del voucher en ventanilla para completar tu registro al XIV Encuentro Internacional de Educación.",
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
  const { configuracion: evento, getTaller, estadoDe } = useEstadoEvento();
  // El folio del pre-registro recién creado. `participante?.folio` es el del
  // contexto —otra persona— y enseñarlo aquí era el fallo más visible del flujo.
  const folio = borrador.folio ?? participante?.folio;

  /*
   * ¿Esta persona ya tiene código, o todavía no?
   *
   * Casi siempre todavía no: esta pantalla explica CÓMO pagar, así que quien la
   * lee no ha pagado. Pero se puede volver a ella después, y entonces negarle
   * su código sería tan falso como enseñárselo antes.
   *
   * Se pregunta solo cuando el folio es el del participante del contexto. El
   * del borrador acaba de nacer en el pre-registro y no tiene pago que
   * consultar: ahí la respuesta es no, y lo es de verdad.
   *
   * `abreLaPuerta` y no `=== "pagado"` escrito a mano: es la misma regla que
   * `/portal/qr` y que `fn_evaluar_escaneo`, y vivía copiada en cada pantalla.
   */
  const tieneCodigo =
    !borrador.folio && !!participante && abreLaPuerta(estadoDe(participante).evento);
  // El nombre va impreso en la imagen del pase, para que se reconozca de quién
  // es sin tener que abrirla y leer el folio.
  const nombre = borrador.nombre ?? participante?.nombre ?? "";
  const taller = getTaller(borrador.tallerId ?? participante?.tallerId);
  // Un solo depósito y un solo voucher, con el concepto que le toca. La regla
  // vive en `lib/deposito.ts`; aquí solo se dibuja.
  const deposito = depositoDe(evento.cuotaEvento, taller?.costo);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [copiadoFolio, setCopiadoFolio] = useState(false);
  const [copiadoConcepto, setCopiadoConcepto] = useState(false);

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

          {/*
            De las tres pantallas que pintaban el código, esta era la peor.

            Salía pelado, sin una palabra que dijera qué era, y justo debajo
            estaba el botón de descargar la imagen del pase: quien leía estas
            instrucciones —o sea, quien todavía NO ha pagado— se bajaba un
            `pase-PRE-00847.png` con su nombre y el escudo, idéntico al que se
            lleva quien ya pagó. Ponerle un sello ayudó, pero seguía siendo una
            imagen descargable en manos de quien no ha depositado.

            Ahora aquí no hay código hasta que el pago se confirme. Lo que esta
            pantalla necesita enseñar es el folio, y ya lo enseña arriba en
            grande con su botón de copiar: es lo que se lleva a Aportaciones y
            lo que abre el portal.
          */}
          {tieneCodigo ? (
            <div className="mt-4 flex justify-center">
              <CodigoQR valor={folio ?? ""} size={148} />
            </div>
          ) : (
            <CodigoPendiente folio={folio ?? ""} />
          )}

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
              , donde ves si tu pago ya se registró, subes tus evidencias y aparece tu código para
              la entrada. Sin el folio no hay forma de entrar.
            </p>
          </div>

          {/* La descarga es real: genera la imagen y la guarda. Solo se ofrece
              cuando hay pase que descargar; antes de confirmarse el pago, el
              archivo con el nombre y el escudo era justo lo que terminaba en la
              puerta el día del evento. */}
          {tieneCodigo ? (
            <div className="print:hidden">
              <AccionesDelPase folio={folio ?? ""} nombre={nombre} evento={evento.nombre} />
            </div>
          ) : null}
        </aside>

        {/* La columna larga: todo lo que hay que hacer con ese folio. */}
        <div>
          {/*
            Esto decía lo contrario hasta el 2026-09-25: «son DOS depósitos por
            separado, debes presentar DOS vouchers distintos». Se cambió la
            regla, y este cartel es el sitio donde más caro salía dejarla vieja:
            quien lo leyera se iría al banco a hacer dos depósitos y llegaría a
            ventanilla con dos vouchers que ya no se reciben así.

            Sigue en rojo y sigue arriba del todo por el mismo motivo por el que
            estaba: es lo único de esta pantalla que, si se pasa por alto,
            obliga a volver al banco.
          */}
          <div className="rounded-lg border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg p-4 lg:p-5">
            <p className="flex items-start gap-2 text-sm font-bold text-estado-discrepancia">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              IMPORTANTE: es UN SOLO depósito y UN SOLO voucher.
              {deposito.llevaTaller
                ? " El taller va incluido en el mismo pago, no se deposita aparte."
                : null}
            </p>
          </div>

          {/*
           * Una sola tarjeta, y el total en grande.
           *
           * Antes eran dos, una por depósito, y el número que el alumno tenía
           * que llevarse al banco —cuánto deposita— no aparecía en ninguna: lo
           * tenía que sumar él. Ahora el total es lo primero que se lee y el
           * desglose va debajo en pequeño, que es el orden en que se necesita.
           *
           * Sigue sin haber «Concepto: ENCUENTRO-PRE-00842». Aquel era un
           * código que este sistema se inventaba y que no usa nadie más: ni el
           * banco lo pide en la ficha, ni Aportaciones lo busca al recibir. El
           * concepto que SÍ existe es la frase que se escribe a mano junto al
           * voucher, y tiene su propio bloque más abajo.
           */}
          <article className="mt-4 rounded-lg border border-border bg-card p-4 lg:p-5">
            <Rotulo>Cuánto depositar</Rotulo>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">{moneda(deposito.total)}</p>
            {deposito.llevaTaller && taller ? (
              <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Evento</dt>
                  <dd className="tabular-nums">{moneda(deposito.cuotaEvento)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="min-w-0">
                    Taller
                    <span className="block text-xs">{taller.nombre}</span>
                  </dt>
                  <dd className="tabular-nums">{moneda(deposito.costoTaller ?? 0)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No seleccionaste taller, así que es solo la cuota del evento.
              </p>
            )}
            <p className="mt-3 text-sm font-medium">Todo en un mismo depósito. No hagas dos.</p>
          </article>

          <section className="mt-6">
            <h2 className="text-base font-semibold">Datos bancarios</h2>
            <div className="mt-2 grid gap-2">
              <CampoCopiable etiqueta="Banco" valor={evento.banco.banco} />
              <CampoCopiable etiqueta="Número de cuenta" valor={evento.banco.cuenta} />
              <CampoCopiable etiqueta="Beneficiario" valor={evento.banco.beneficiario} />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-base font-semibold">Cómo presentar tu voucher</h2>
            {/*
             * La hoja de Servicios Financieros, y debajo lo que dice.
             *
             * La transcripción no es un extra: la hoja es tamaño carta y en un
             * teléfono, a tamaño de tarjeta, no se lee ni una línea. Quien no
             * piense en ampliarla se iría sin saber qué hay que anotar, que es
             * justo lo que la ventanilla revisa. Es la lista de la imagen, en
             * el mismo orden, y no otra cosa: si la hoja cambia, cambian las
             * dos.
             *
             * `object-contain` y fondo claro porque es una hoja, no una foto:
             * recortarla —que es lo que hacía `object-cover` con el ejemplo de
             * antes— le corta justo el bloque de datos.
             */}
            <button
              onClick={() => setAmpliada(IMAGEN_INSTRUCCIONES_VOUCHER)}
              className="mt-2 block w-full overflow-hidden rounded-lg border border-border bg-white text-left sm:max-w-sm"
            >
              <img
                src={IMAGEN_INSTRUCCIONES_VOUCHER}
                alt="Instrucciones para el canje del voucher original: pegar el voucher completo en la parte superior de la hoja y anotar debajo, con tinta negra o azul, nombre completo, matrícula escolar, licenciatura o maestría, sede regional, semestre o módulo, grupo y concepto. Después, pasar a ventanilla."
                className="h-72 w-full object-contain"
                loading="lazy"
              />
              <p className="border-t border-border p-3 text-xs font-medium">
                Instrucciones para el canje — toca para ampliar
              </p>
            </button>

            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Pega el{" "}
                <span className="font-medium text-foreground">voucher original completo</span> en la
                parte superior de una hoja.
              </li>
              <li>
                Debajo, con tinta negra o azul, anota en este orden: nombre completo, matrícula
                escolar, licenciatura o maestría, sede regional, semestre o módulo, grupo y
                concepto.
                <span className="mt-1 block">
                  Si no eres alumno, solo tu nombre completo y el concepto.
                </span>
              </li>
              <li>Pasa a ventanilla con esa hoja.</li>
            </ol>

            {/*
             * El concepto, literal.
             *
             * La lista de arriba pedía «…grupo y concepto» y ahí se acababa: en
             * ninguna parte decía QUÉ concepto. Cada quien escribía lo que le
             * parecía —«pago del encuentro», «taller», el nombre del taller— y
             * en ventanilla eso es una hoja que hay que devolver.
             *
             * Va fuera de la lista y en su propio recuadro porque no es un paso
             * más: es el texto que hay que copiar tal cual, y dentro del punto
             * 2 quedaba como una aclaración entre otras seis palabras.
             *
             * La frase cambia con el taller, y por eso no está escrita aquí:
             * sale de `depositoDe`, que es lo que garantiza que el concepto y
             * el importe de arriba hablen siempre del mismo depósito.
             */}
            <div className="mt-4 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <Rotulo>El concepto que debes anotar</Rotulo>
              <p className="mt-2 text-pretty text-base font-semibold leading-snug">
                {deposito.concepto}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Cópialo tal cual, completo y con las siglas del final.
                {deposito.llevaTaller
                  ? " Menciona el taller porque va en el mismo depósito."
                  : " Si después agregas un taller, el concepto cambia: vuelve a esta pantalla."}
              </p>
              <div className="mt-3 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11"
                  onClick={() => {
                    void navigator.clipboard?.writeText(deposito.concepto);
                    setCopiadoConcepto(true);
                    setTimeout(() => setCopiadoConcepto(false), 1800);
                  }}
                >
                  {copiadoConcepto ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiadoConcepto ? "Concepto copiado" : "Copiar el concepto"}
                </Button>
              </div>
            </div>
          </section>

          {/*
            Un lugar y un momento, y ninguno de los dos lleva letra chica.

            Aquí decía «Servicios Financieros, Edificio A, planta baja» y, al
            lado, «Lunes a viernes de 9:00 a 17:00 hrs». Los dos venían
            sembrados de la migración de datos iniciales y los dos eran falsos.
            La entrega es en el Departamento de Aportaciones —que se pregunta
            por su nombre, no por una letra de edificio que no está rotulada en
            ninguna pared— y no hay semana de entrega: hay UN día, con SU hora.

            Por eso la segunda tarjeta deja de titularse «Fecha límite»: no es
            un plazo que vence, es la cita. Y por eso enseña la hora, que un
            plazo se puede dar sin ella y una cita no.

            El horario de atención ya no se dibuja. La migración
            `20260924200000` lo dejó vacío, y además se quita de aquí para que
            el día que alguien vuelva a llenarlo no reaparezca contradiciendo a
            la tarjeta de al lado.
          */}
          <section className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
              <h2 className="text-sm font-semibold">Entrega de vouchers</h2>
              <p className="mt-1 text-sm text-muted-foreground">{evento.ventanilla.lugar}</p>
            </div>
            <div className="rounded-lg border-2 border-primary/30 bg-secondary p-4">
              <h2 className="text-sm font-semibold">Día y hora de entrega</h2>
              <p className="mt-1 text-lg font-bold">{fechaYHoraTexto(evento.fechaLimite)}</p>
            </div>
          </section>

          <section className="mt-4 rounded-lg border border-border bg-card p-4 lg:p-5">
            <h2 className="text-sm font-semibold">Qué llevar</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              <li>Credencial vigente</li>
              <li>Voucher original (uno solo, del depósito completo)</li>
              <li>Folio impreso o en pantalla</li>
            </ul>
          </section>

          <section className="mt-4 rounded-lg border-2 border-primary/25 bg-muted p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <QrCode className="size-5 shrink-0 text-primary" aria-hidden />
              Tu código se activa cuando validen tu pago
            </h2>
            {/*
              Este párrafo llegó a explicar de dónde sale el código: que ya lo
              tenía, que era el de arriba y que era el mismo de su comprobante.
              Las tres cosas sobran, y dos son además falsas aquí: mientras el
              pago no se confirme, arriba no hay ningún código —solo el folio y
              el sello de pendiente—, así que «el de arriba» manda a buscar algo
              que no está.

              Y lo del comprobante es fontanería nuestra. Al alumno le importa
              QUÉ hacer y CUÁNDO lo tendrá, no que dos pantallas dibujen el
              mismo dato. Contárselo solo invita a comparar códigos y a dudar de
              cuál sirve.

              Lo que sí tiene que quedar es que no espere un correo: es lo que
              evita la llamada de «no me ha llegado mi QR» y lo que le quita
              valor a un mensaje falso que se lo prometa.
            */}
            <p className="mt-2 text-sm">
              Después de dejar tu voucher en ventanilla, Servicios Financieros tarda unas{" "}
              <span className="font-semibold">{evento.horasValidacion} horas</span> en validar tu
              pago. En cuanto lo haga, tu código aparece en tu portal y abre la puerta.
            </p>
            <ol className="mt-3 grid gap-2 text-sm">
              {[
                "Deja tu voucher en ventanilla.",
                `Espera ${evento.horasValidacion} horas.`,
                "Entra a tu portal con tu folio y tu matrícula.",
                "Cuando diga «ya abre la puerta», descárgalo y tómale una captura.",
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
              Nadie te lo va a mandar por correo ni por WhatsApp: siempre está en tu portal. Con la
              captura en el celular no necesitas internet para mostrarlo en la entrada.
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
          <DialogTitle className="text-sm">Instrucciones para el canje del voucher</DialogTitle>
          {/*
           * Fondo blanco y no el del diálogo: la hoja es negra sobre blanco y
           * en modo oscuro quedaba un papel flotando sobre un marco oscuro con
           * los bordes del dibujo perdiéndose en él.
           */}
          {ampliada ? (
            <img
              src={ampliada}
              alt="Hoja de instrucciones para el canje del voucher original, ampliada"
              className="w-full rounded-md bg-white"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PantallaPublica>
  );
}
