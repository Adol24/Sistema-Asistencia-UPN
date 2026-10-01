import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Copy, KeyRound, QrCode } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Rotulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CodigoQR } from "@/components/qr";
import { AccionesDelPase, CodigoParaPagar } from "@/components/pase";
import { EsperaDelPortal } from "@/components/acceso";
import { RecuperarPorFolio } from "@/components/acceso-por-folio";
import { IMAGEN_INSTRUCCIONES_VOUCHER } from "@/lib/imagenes";
import { moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useCitaDePago, useParticipanteDelPortal, usePortal } from "@/lib/portal";
import { useEstadoEvento } from "@/lib/estado-evento";
import { abreLaPuerta, estadoDelDeposito } from "@/lib/pagos-logica";
import { citaEnPantalla, rotulosDeLaCita } from "@/lib/cita";
import { depositoDePersona } from "@/lib/deposito";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/pago")({
  head: () =>
    meta(
      "Instrucciones de pago — XIV Encuentro Internacional de Educación",
      // Sin nombrar el departamento: una `meta` se arma antes de que llegue la
      // configuración, así que no puede leer `ventanilla_lugar` y cualquier
      // nombre escrito aquí envejece con el primer cambio de sitio.
      // Sin «fecha límite»: la pantalla ya no dice ninguna, y una descripción
      // que la promete manda a buscarla dentro.
      "Datos bancarios, monto único, concepto y entrega del voucher en ventanilla para completar tu registro al XIV Encuentro Internacional de Educación.",
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

/*
 * Igual que `/comprobante`: el de fuera decide de dónde salen los datos.
 *
 * Esta pantalla enseña «Tu folio» en letra de cuatro pisos, y con el borrador
 * vacío lo enseñaba con nada debajo —justo el dato del que advierte que no hay
 * otra forma de entrar al portal—. Pasa cada vez que muere la pestaña, que es
 * más a menudo de lo que parece: el navegador incrustado de WhatsApp se cierra
 * al deslizar atrás, «abrir en el navegador» estrena pestaña, y el teléfono
 * descarta la que dejó en segundo plano. Ver el comentario largo de
 * `comprobante.tsx`.
 */
function Pago() {
  const { borrador, recuperado } = usePrototipo();
  const { sesion, cargando, error } = usePortal();
  const ficha = useParticipanteDelPortal();

  if (!recuperado) return null;

  if (!(borrador.folio ?? ficha?.folio)) {
    if (sesion) return <EsperaDelPortal cargando={cargando} error={error} />;
    return (
      <RecuperarPorFolio
        titulo="Instrucciones de pago"
        explicacion="Tu folio y estas instrucciones se quedaron en la pestaña donde te registraste, y esa pestaña ya se cerró."
        textoBoton="Ver mis instrucciones"
      />
    );
  }

  return <PagoContenido />;
}

function PagoContenido() {
  const navigate = useNavigate();
  const { borrador } = usePrototipo();
  /*
   * El respaldo del borrador es la ficha del portal, no el participante del
   * contexto.
   *
   * Aquel es siempre nulo en público —las políticas le cierran la tabla al
   * anónimo— así que enseñaba el folio de otra persona en local y nada en
   * producción. Con el del portal, quien perdió la pestaña y volvió a
   * identificarse ve SUS datos, y `tieneCodigo` pasa a poder ser cierto de
   * verdad para quien ya pagó.
   */
  const ficha = useParticipanteDelPortal();
  // Configuración y catálogo salen del contexto: lo que administración cambie se
  // ve aquí sin recargar.
  const { configuracion: evento, getTaller, estadoDe } = useEstadoEvento();
  const folio = borrador.folio ?? ficha?.folio;

  /*
   * ¿Esta persona ya tiene código, o todavía no?
   *
   * Casi siempre todavía no: esta pantalla explica CÓMO pagar, así que quien la
   * lee no ha pagado. Pero se puede volver a ella después, y entonces negarle
   * su código sería tan falso como enseñárselo antes.
   *
   * Se pregunta solo cuando el folio NO es el del borrador: ese acaba de nacer
   * en el pre-registro y no tiene pago que consultar, así que ahí la respuesta
   * es no, y lo es de verdad. Si viene de la ficha del portal, en cambio, el
   * estado del pago llega con ella.
   *
   * `abreLaPuerta` y no `=== "pagado"` escrito a mano: es la misma regla que
   * `/portal/qr` y que `fn_evaluar_escaneo`, y vivía copiada en cada pantalla.
   */
  const tieneCodigo = !borrador.folio && !!ficha && abreLaPuerta(estadoDe(ficha).evento);
  // El nombre va impreso en la imagen del pase, para que se reconozca de quién
  // es sin tener que abrirla y leer el folio.
  const nombre = borrador.nombre ?? ficha?.nombre ?? "";
  const taller = getTaller(borrador.tallerId ?? ficha?.tallerId);
  /*
   * Quién es, porque desde el 2026-09-30 el importe depende de eso.
   *
   * El borrador primero y la ficha después, el mismo orden que el folio y el
   * nombre de arriba: el borrador es lo único que hay recién cerrado el
   * pre-registro, y la ficha es lo que queda cuando esa persona vuelve desde su
   * portal. `"alumno"` de respaldo es el caso mayoritario y el más caro de los
   * tres, así que equivocarse por ahí cobra de más, nunca de menos.
   */
  const perfil = borrador.perfil ?? ficha?.perfil ?? "alumno";
  // Un solo depósito y un solo voucher, con el concepto que le toca. La regla
  // vive en `lib/deposito.ts`; aquí solo se dibuja.
  const deposito = depositoDePersona(evento, perfil, taller?.costo);
  /*
   * El día que le toca a ESTA persona. Nunca la fecha límite del evento.
   *
   * Aquí se pintaba `fecha_limite` con su hora —«viernes, 9 de octubre · 18:00
   * hrs»— bajo el rótulo «Día y hora de entrega». Era la última pantalla que lo
   * hacía: `/portal/qr` lo dejó de hacer el 2026-09-25 y el comprobante en
   * `dec206d`, y el comentario que quedó en `portal.qr.tsx` decía «la fecha
   * sigue en /pago», que es exactamente lo que se corrige ahora.
   *
   * `fecha_limite` es UNA sola para todo el evento —el corte tras el cual
   * expira el pre-registro sin pagar— y esta tarjeta no tenía condición
   * ninguna, así que todos leían el 9 de octubre como su cita. No es la de
   * nadie: los días de `dia_entrega_voucher` van del 28 de septiembre al 8 de
   * octubre. A quien le tocaba el 2 lo mandaba una semana tarde, y para
   * entonces su lugar ya se había liberado.
   *
   * La hora se va con ella y no se sustituye: `fn_cita_de_pago` devuelve un día
   * sin hora, y `ventanilla_horario` está vacío a propósito en la base. Inventar
   * una aquí sería volver a poner el dato que causó el problema.
   */
  const citaRemota = useCitaDePago(borrador.matricula ?? ficha?.matricula);
  /*
   * Qué fecha de pago le toca ver, que puede ser ninguna.
   *
   * Esta pantalla se quedó fuera cuando la regla se centralizó, y era la peor
   * de las cuatro para quedarse fuera: es la que explica CÓMO pagar, así que es
   * donde el docente iba a buscar su fecha y donde no la encontraba. Ahora
   * pregunta lo mismo que `/comprobante` y `/portal/estado`.
   *
   * El estado sale de la ficha cuando existe; recién cerrado el pre-registro no
   * la hay, y entonces es `pre_registrado`, que es exactamente lo que esa
   * persona es.
   */
  const cita = citaEnPantalla({
    perfil,
    estado: ficha ? estadoDelDeposito(estadoDe(ficha)) : "pre_registrado",
    remota: citaRemota,
    fechaTope: evento.fechaPagoDocentesExternos,
  });
  /*
   * A quien no debe nada, esta pantalla entera le sobra.
   *
   * `/pago` son los datos del banco, el concepto que hay que escribir a mano, los
   * dos ejemplos de voucher, la ventanilla y los cuatro pasos del QR. Para el
   * maestro que dijo que no quiere constancia no hay depósito, no hay concepto y
   * no hay voucher: dejarle leer todo eso es pedirle que averigüe cuál de las seis
   * secciones le aplica, y la respuesta es ninguna.
   *
   * Se pregunta por los DOS lados porque las dos son ciertas en momentos
   * distintos. El borrador es lo único que hay recién cerrado el pre-registro —el
   * participante existe pero su ficha aún no se ha vuelto a cargar—; el estado de
   * la ficha es lo que queda cuando esa persona vuelve semanas después desde su
   * portal, y entonces el borrador ya se fue con la pestaña.
   *
   * `=== "exento"` y no `abreLaPuerta`: aquí no se pregunta si pasa, se pregunta
   * si debe. Un `pagado` también abre la puerta y a ese sí hay que enseñarle lo
   * que depositó.
   */
  const exento =
    (borrador.perfil === "docente" && borrador.quiereConstancia === false) ||
    (!!ficha && estadoDe(ficha).evento === "exento");
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [copiadoFolio, setCopiadoFolio] = useState(false);
  const [copiadoConcepto, setCopiadoConcepto] = useState(false);

  /*
   * La salida temprana va DESPUÉS de todos los `useState`, no antes.
   *
   * Un `return` en medio de los hooks cambiaría cuántos se llaman según quién
   * mire la pantalla, y React cuenta con que sean siempre los mismos. Cuesta tres
   * estados que este camino no usa; equivocarlo cuesta la pantalla entera.
   */
  if (exento) {
    return (
      <PantallaPublica
        titulo="No tienes nada que pagar"
        descripcion="Elegiste asistir sin constancia, así que no hay depósito ni voucher."
      >
        <section className="rounded-lg border-2 border-estado-pagado/30 bg-estado-pagado-bg p-5 text-center">
          <Rotulo>Tu folio</Rotulo>
          <p className="mt-2 break-all font-mono text-2xl font-extrabold tracking-tight">{folio}</p>
          {nombre ? <p className="mt-1 text-sm font-semibold">{nombre}</p> : null}
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Qué sigue</h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>
              Guarda tu folio: con él entras a tu portal y ahí está tu código para la entrada.
            </li>
            <li>El día que te toca, llega y escanea tu código. No pases por ventanilla.</li>
            {taller ? (
              <li>
                Tu taller <span className="font-semibold text-foreground">{taller.nombre}</span>{" "}
                tampoco se paga. Es por la tarde en {taller.lugar}.
              </li>
            ) : null}
          </ul>
          {/*
           * Se le dice lo que NO tiene, y aquí es donde hay que decirlo.
           *
           * Es la única consecuencia de su respuesta que no se ve hasta el final
           * del evento, cuando se reparten los documentos y ya no se puede hacer
           * nada. Contestó esto en `/registro` hace tres pantallas; repetirlo aquí
           * es la última vez que le sale gratis cambiar de opinión.
           */}
          <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            No vas a recibir constancia. Si la necesitas, escríbenos a soporte antes del evento:
            para tenerla hay que pagar la cuota del Encuentro.
          </p>
        </section>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 print:hidden">
          <Button
            className="h-12 md:h-11 text-base"
            onClick={() => navigate({ to: "/comprobante" })}
          >
            Ver mi comprobante
          </Button>
          <Button
            variant="outline"
            className="h-12 md:h-11 text-base"
            onClick={() => navigate({ to: "/portal" })}
          >
            Entrar a mi portal
          </Button>
        </div>
      </PantallaPublica>
    );
  }

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
            El código vuelve, con rótulo y sin el botón de descargar.

            De las tres pantallas que lo pintaban, esta era la peor: salía pelado,
            sin una palabra que dijera qué era, y justo debajo estaba el botón de
            descargar la imagen del pase. Quien leía estas instrucciones —o sea,
            quien todavía NO ha pagado— se bajaba un `pase-PRE-00847.png` con su
            nombre y el escudo, idéntico al que se lleva quien ya pagó.

            Lo que estaba mal no era dibujarlo: era llamarlo pase y dejar que se
            lo llevara como archivo. `CodigoParaPagar` lo rotula por lo que sirve
            hoy —que en Aportaciones lo lean con la cámara en vez de que dicte sus
            doce caracteres— y las acciones del pase siguen reservadas a la rama
            de arriba, la de quien ya tiene el pago confirmado.
          */}
          {tieneCodigo ? (
            <div className="mt-4 flex justify-center">
              <CodigoQR valor={folio ?? ""} size={148} />
            </div>
          ) : (
            <CodigoParaPagar folio={folio ?? ""} lugar={evento.ventanilla.lugar} />
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
                  {/*
                    «Incluido» y no «$0.00» para el maestro.
                    Su taller vale cero porque ya va dentro de su cuota, no
                    porque el taller sea gratis, y un renglón de «$0.00» pegado
                    a otro de «$250.00» se lee como un error de la pantalla.
                  */}
                  <dd className="tabular-nums">
                    {deposito.costoTaller === 0 ? "Incluido" : moneda(deposito.costoTaller ?? 0)}
                  </dd>
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
            un plazo que vence, es la cita —y por eso la dice `fn_cita_de_pago`,
            que sabe de quién es, y no `fecha_limite`, que es de todos y por eso
            no es de nadie—.

            Sin cita no se dibuja. Docentes y externos no están en el calendario
            oficial, y a ellos la tarjeta anterior les daba una fecha que no era
            suya: el mismo razonamiento que dejó escrito `portal.qr.tsx`.

            El horario de atención ya no se dibuja. La migración
            `20260924200000` lo dejó vacío, y además se quita de aquí para que
            el día que alguien vuelva a llenarlo no reaparezca contradiciendo a
            la tarjeta de al lado.
          */}
          <section className={`mt-6 grid gap-3 ${cita ? "sm:grid-cols-2" : ""}`}>
            <div className="rounded-lg border border-border bg-card p-4 lg:p-5">
              <h2 className="text-sm font-semibold">Entrega de vouchers</h2>
              <p className="mt-1 text-sm text-muted-foreground">{evento.ventanilla.lugar}</p>
            </div>
            {/*
              El título y el aviso salen de `rotulosDeLaCita`, no escritos aquí.

              Para el alumno es «Tu inscripción» y para el docente «Tu último día
              para pagar», y la diferencia no es de estilo: al maestro ir antes
              es lo que se espera de él, así que «no puedes ir antes» sería falso.
              Dos pantallas no pueden redactarlo cada una a su manera.
            */}
            {cita ? (
              <div className="rounded-lg border-2 border-primary/30 bg-secondary p-4">
                <p className="text-lg font-bold">{rotulosDeLaCita(cita).titulo}</p>
                {rotulosDeLaCita(cita).aviso ? (
                  <p className="mt-1 text-xs font-semibold text-estado-discrepancia">
                    {rotulosDeLaCita(cita).aviso}
                  </p>
                ) : null}
              </div>
            ) : null}
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
