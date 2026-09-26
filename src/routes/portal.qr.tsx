import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Camera, CheckCircle2, Lock, Maximize2 } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { Subtitulo } from "@/components/tipografia";
import { CodigoQR, PaseAPantallaCompleta } from "@/components/qr";
import { AccionesDelPase, CodigoParaPagar } from "@/components/pase";
import { usePantallaEncendida } from "@/lib/pantalla-encendida";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { useCitaDePago, usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { abreLaPuerta } from "@/lib/pagos-logica";

export const Route = createFileRoute("/portal/qr")({
  head: () =>
    meta(
      "Mis códigos — XIV Encuentro Internacional de Educación",
      "Tu código para entregar el voucher y, en cuanto Servicios Financieros confirme tu pago, tu pase de entrada al XIV Encuentro Internacional de Educación.",
    ),
  component: MiQr,
});

/*
 * El sitio donde se entrega viene de la configuración, no escrito aquí.
 *
 * Decía «Servicios Financieros» y dejó de ser verdad el 2026-09-24, cuando la
 * entrega pasó al Departamento de Aportaciones —`20260924200000`—. El dato ya
 * vivía en `configuracion_evento.ventanilla_lugar` y `/pago` ya lo leía de
 * ahí; esta pantalla se había quedado con el nombre viejo escrito a mano, que
 * es justo cómo un cambio de sitio manda a la gente al edificio equivocado.
 *
 * El respaldo es «ventanilla» y no un nombre: sin dato configurado es mejor
 * una palabra genérica que un departamento que quizá ya no recibe a nadie.
 */
const faltantesDe = (horas: number, lugar: string): Record<string, string> => ({
  pre_registrado: `Falta que hagas tu depósito y entregues el voucher en ${lugar}.`,
  comprobante_recibido: `Ya recibimos tu comprobante. Servicios Financieros tarda unas ${horas} horas en validarlo; vuelve a esta pantalla y tu código estará aquí.`,
  // `discrepancia` ya NO está en este mapa: esa persona tiene código —la puerta
  // la admite— así que nunca llega a esta rama. Su aviso se da junto al código,
  // que es donde le sirve. Ver `abreLaPuerta`.
  expirado: "Tu pre-registro venció porque no se recibió el comprobante a tiempo.",
  cancelado: "Tu registro fue cancelado. Contacta a soporte si crees que es un error.",
});

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function MiQr() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <MiQrContenido p={p} />;
}

function MiQrContenido({ p }: { p: Participante }) {
  // La configuración sale del contexto, no del mock: si administración cambia el
  // plazo de validación o el sitio de entrega, esta pantalla lo refleja sin
  // recargar. La fecha límite ya no se lee aquí.
  const { estadoDe, configuracion: evento } = useEstadoEvento();
  const estado = estadoDe(p);
  /*
   * El día que le toca a ESTA persona, y no la fecha límite del evento.
   *
   * `configuracion.fecha_limite` es una sola para todos —hoy el 9 de octubre— y
   * es el corte tras el cual el pre-registro expira, no la cita de nadie. Quien
   * entra aquí sin haber pagado leía esa fecha como su plazo, y su cita puede
   * caer seis días antes: un alumno de LEIP en Guadalupe Victoria entrega el 3 de
   * octubre. Anunciarle el 9 es mandarlo a la sede cuando ya nadie recibe.
   *
   * Lo dice `fn_cita_de_pago`, que resuelve la fecha por programa, avance, sede y
   * grupo con el calendario oficial. Sin matrícula —docentes y externos— no hay
   * cita, y esta pantalla no dice ninguna fecha: ver el bloque de abajo.
   */
  const cita = useCitaDePago(p.matricula);
  /*
   * Quién tiene código, y no se decide aquí.
   *
   * Era `estado.evento === "pagado"`, escrito a mano, y esta pantalla no era la
   * única: `/pago` tenía su propia versión y `/comprobante` daba por hecho que
   * nunca. Ahora las tres preguntan a `abreLaPuerta`, que es la misma línea que
   * `fn_evaluar_escaneo` traza en la base.
   *
   * El cambio de fondo es que `discrepancia` entra aquí. Antes caía en la rama
   * de «todavía no» y se le enseñaba el código atenuado; pero a esa persona el
   * torniquete SÍ la admite —depositó, por un importe que no cuadra— así que
   * dejarla sin código que escanear la mandaba a mesa de incidencias por una
   * puerta que le estaba abierta.
   */
  const tieneCodigo = abreLaPuerta(estado.evento);
  const faltantes = faltantesDe(evento.horasValidacion, evento.ventanilla.lugar || "ventanilla");
  const [ampliado, setAmpliado] = useState(false);

  // También en la vista normal: alguien puede enseñar el pase sin ampliarlo.
  usePantallaEncendida(tieneCodigo);

  return (
    <PantallaPublica titulo="Mis códigos" ancho="lg">
      <PortalNav />
      {/*
        Dos secciones, y nunca las dos con un código a la vez.
        ------------------------------------------------------------------
        La pantalla se llamaba «Mi código QR» y dentro decía «Código para tu
        pago»: el título prometía el pase del evento y el contenido hablaba de la
        ventanilla. Ahora hay dos bloques con nombre propio, y cada uno enseña su
        código solo cuando toca.

        Que se turnen no es una economía de espacio, es lo que evita el problema
        que ya costó dos rediseños: **los dos códigos son el mismo símbolo**, el
        folio. Dibujados juntos serían dos imágenes idénticas con dos rótulos
        distintos, y la primera pregunta sería cuál de las dos sirve. Puestos en
        orden no hay nada que elegir: mientras no paga necesita el de la
        ventanilla, y una vez pagado ese trámite ya está hecho y lo que necesita
        es el pase.

        Lo que distingue a uno de otro no es la imagen sino lo que la base decide
        al leerla: `fn_evaluar_escaneo` rechaza en rojo al que no tenga el pago
        confirmado. Por eso el bloque del pase se puede dibujar cerrado sin
        engañar a nadie: no está oculto un código que ya funcionaría, está
        anunciado uno que todavía no.
      */}
      <div className="grid gap-4">
        {/*
          Bloque 1 · el del pago. Se enseña mientras el pago no esté confirmado, y
          después se queda como acuse: desaparecer del todo dejaría a quien vuelve
          preguntándose si ese paso existió.
        */}
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <Subtitulo>Código para tu pago</Subtitulo>
          {tieneCodigo ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-estado-pagado">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden />
              Tu pago ya está confirmado: este paso ya no te hace falta.
            </p>
          ) : (
            <>
              <CodigoParaPagar folio={p.folio} lugar={evento.ventanilla.lugar} />

              <div className="mt-5 flex justify-center">
                <EstadoPagoBadge estado={estado.evento} etiqueta="Evento" />
              </div>
              <p className="mt-3 text-sm font-medium">
                {faltantes[estado.evento] ?? "Consulta tu estado en la línea de tiempo."}
              </p>
              {/*
               * Sin cita no se dice ninguna fecha, y eso es una decisión de Adol
               * del 2026-09-25.
               *
               * Aquí se pintaba `fecha_limite` —«viernes, 9 de octubre»— a quien
               * no tuviera cita. Esa fecha es el corte tras el cual el
               * pre-registro expira, una sola para todo el evento, y nadie la
               * confirmó: viene de la siembra del prototipo. Enseñársela a
               * alguien como si fuera su plazo de entrega es lo que mandaba al
               * alumno de LEIP seis días tarde, y a un docente le daba una fecha
               * que no es de nadie.
               *
               * Quien no tiene cita —docentes y externos, que no están en el
               * calendario oficial— lee el renglón de arriba: qué le falta y
               * dónde se entrega. La fecha sigue en /pago y en el comprobante,
               * que es donde se leyó al registrarse.
               */}
              {cita ? (
                <>
                  <p className="mt-2 text-sm font-semibold">Tu día para entregar: {cita.cuando}</p>
                  {cita.estricto ? (
                    <p className="mt-1 text-xs font-semibold text-estado-discrepancia">
                      Es ese día y solo ese: no puedes ir antes ni después.
                    </p>
                  ) : null}
                </>
              ) : null}
              <Link
                to="/portal/estado"
                className="mt-5 inline-flex min-h-12 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Ver mi línea de tiempo
              </Link>
            </>
          )}
        </section>

        {/* Bloque 2 · el pase. Cerrado hasta que el pago esté confirmado. */}
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <Subtitulo>Pase para entrar al evento</Subtitulo>
          {tieneCodigo ? (
            <>
              <p className="mt-4 text-balance text-lg font-bold leading-snug">{p.nombre}</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-muted-foreground">
                {p.folio}
              </p>

              {/*
               * Tocar el código lo abre a pantalla completa. Es el gesto que la
               * gente intenta por instinto con cualquier imagen, y aquí resulta
               * ser justo lo que conviene hacer en la puerta.
               */}
              <button
                type="button"
                onClick={() => setAmpliado(true)}
                className="mx-auto mt-4 flex flex-col items-center gap-2 rounded-lg"
                aria-label="Ver el código a pantalla completa"
              >
                <CodigoQR valor={p.folio} size={320} etiqueta="UPN" />
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Maximize2 className="size-3.5" aria-hidden />
                  Tócalo para mostrarlo en grande
                </span>
              </button>

              {/*
               * La discrepancia se dice AQUÍ, junto al código que sí funciona.
               *
               * Antes esta persona caía en la otra rama y leía «acude a
               * ventanilla para aclararlo» en lugar de un pase. Ahora tiene su
               * código —la puerta la admite— y lo que necesita saber es que aun
               * así le falta un trámite. Callarlo aquí sería dejar que se
               * enterara en la fila.
               */}
              {estado.evento === "discrepancia" ? (
                <p className="mt-4 flex items-start gap-2 rounded-md border border-estado-discrepancia/40 bg-estado-discrepancia-bg p-3 text-left text-sm text-estado-discrepancia">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Tu código ya abre la puerta, pero el monto depositado no coincide con el esperado.
                  Pasa a {evento.ventanilla.lugar || "ventanilla"} a aclararlo.
                </p>
              ) : null}

              <AccionesDelPase folio={p.folio} nombre={p.nombre} evento={evento.nombre} />
              <p className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-left text-sm">
                <Camera className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Toma una captura de pantalla: en la entrada no necesitas internet para mostrar tu
                código.
              </p>
            </>
          ) : (
            /*
              El bloque cerrado no dibuja un QR atenuado: dice qué falta y ya.
              Un símbolo a medio tono es lo que en su día hizo que la gente
              llegara a la puerta con el comprobante creyendo que era su pase.
            */
            <div className="mx-auto mt-4 flex max-w-xs flex-col items-center gap-3">
              <span className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Lock className="size-6 text-muted-foreground" aria-hidden />
              </span>
              <p className="text-pretty text-sm font-semibold">
                Aparece aquí cuando se confirme tu pago
              </p>
              <p className="text-pretty text-xs text-muted-foreground">
                Es el que se escanea en la entrada, el día que te toca asistir. Hasta entonces no
                existe: primero entrega tu voucher con el código de arriba.
              </p>
            </div>
          )}
        </section>
      </div>
      {ampliado && tieneCodigo ? (
        <PaseAPantallaCompleta
          valor={p.folio}
          nombre={p.nombre}
          onCerrar={() => setAmpliado(false)}
        />
      ) : null}
    </PantallaPublica>
  );
}
