import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, Info, LayoutList } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { CodigoParaPagar } from "@/components/pase";
import { PerfilBadge } from "@/components/estado-badges";
import { EsperaDelPortal } from "@/components/acceso";
import { RecuperarPorFolio } from "@/components/acceso-por-folio";
import { avanceTexto } from "@/dominio/catalogos";
import { fechasEnTexto, isoAFecha, moneda, sitioDelTaller } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useCitaDePago, useParticipanteDelPortal, usePortal } from "@/lib/portal";
import { citaEnPantalla, rotulosDeLaCita } from "@/lib/cita";
import { useEstadoEvento } from "@/lib/estado-evento";
import { depositoDePersona } from "@/lib/deposito";
import { estadoDelDeposito } from "@/lib/pagos-logica";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comprobante")({
  head: () =>
    meta(
      "Comprobante de pre-registro — XIV Encuentro Internacional de Educación",
      "Resumen de tu pre-registro: folio, perfil, día, lugar, taller, el total por pagar y el concepto del depósito del XIV Encuentro Internacional de Educación.",
    ),
  component: Comprobante,
});

/*
 * Se parte en dos, y el de fuera solo decide de dónde salen los datos.
 *
 * -----------------------------------------------------------------------------
 * Qué pasaba sin esto
 * -----------------------------------------------------------------------------
 * Todo lo que este papel dice sale del borrador del pre-registro, que vive en
 * `sessionStorage` y muere con la pestaña. Esta pantalla y `/pago` eran las dos
 * únicas del flujo público sin guardia, así que con el borrador vacío dibujaban
 * el documento igual: el nombre, el folio y el taller en blanco, «Sin taller»
 * donde había un taller elegido, y el día cayendo al 1 porque `infoDia` no
 * falla. Los reportes del 2026-09-26 son eso, y la captura de pantalla no tiene
 * nada que ver: nada en la aplicación borra estado al salir de la pantalla —los
 * dos oyentes de `visibilitychange` solo recargan, y solo escriben si la carga
 * sale bien—. Lo que se pierde es la pestaña.
 *
 * -----------------------------------------------------------------------------
 * Qué hace ahora
 * -----------------------------------------------------------------------------
 * Sin folio pide folio y matrícula, y rehace el documento desde la base con la
 * misma llamada del portal. El respaldo del borrador ya no es el participante
 * del contexto —que en público es SIEMPRE nulo: las políticas le cierran la
 * tabla al anónimo, así que esa lista llega vacía— sino el del portal, que sí
 * llega cuando la persona acredita quién es.
 *
 * La comprobación va después de los hooks del contenido y por eso vive en otro
 * componente: un `return` temprano en medio los llamaría en distinto orden según
 * el caso, que es lo que React no permite.
 */
function Comprobante() {
  const { borrador, recuperado } = usePrototipo();
  const { sesion, cargando, error } = usePortal();
  const ficha = useParticipanteDelPortal();

  // Mientras se recupera el borrador de la pestaña no se dibuja nada: el primer
  // fotograma siempre lo tiene vacío —se lee en un efecto, ver `prototipo.tsx`—
  // y enseñar aquí la pantalla de recuperación para quitarla al fotograma
  // siguiente mandaría a teclear su folio a quien lo traía puesto.
  if (!recuperado) return null;

  if (!(borrador.folio ?? ficha?.folio)) {
    // Con sesión del portal abierta los datos vienen en camino: es espera, no
    // falta de identificación.
    if (sesion) return <EsperaDelPortal cargando={cargando} error={error} />;
    return (
      <RecuperarPorFolio
        titulo="Comprobante de pre-registro"
        explicacion="Tu comprobante se armó en la pestaña donde te registraste, y esa pestaña ya se cerró."
        textoBoton="Ver mi comprobante"
      />
    );
  }

  return <ComprobanteContenido />;
}

function ComprobanteContenido() {
  const { borrador } = usePrototipo();
  const ficha = useParticipanteDelPortal();
  const { configuracion: evento, getTaller, infoDia, estadoDe } = useEstadoEvento();
  // Los datos académicos son del alumno: docentes y externos no los tienen.
  const nivel = borrador.nivel ?? ficha?.nivel;
  const programa = borrador.programa ?? ficha?.programa;
  const avance = borrador.avance ?? ficha?.avance;
  const grupo = borrador.grupo ?? ficha?.grupo;
  const plantel = borrador.plantel ?? ficha?.plantel;
  const avance_ = avanceTexto(evento.catalogoAcademico, nivel, avance, programa);
  // El folio del pre-registro recién creado, o el de la sesión del portal para
  // quien volvió a identificarse porque perdió la pestaña.
  const folio = borrador.folio ?? ficha?.folio;
  const dia = infoDia(borrador.dia ?? ficha?.dia ?? 1);
  const taller = getTaller(borrador.tallerId ?? ficha?.tallerId);
  const nombre = borrador.nombre ?? ficha?.nombre;
  /*
   * El perfil, UNA vez y no dos.
   *
   * La insignia lo leía con su valor por omisión y el tercer requisito de la
   * constancia lo leía del participante del contexto, o sea de nadie: ese
   * renglón —«tus evidencias aprobadas»— no se le enseñaba nunca a ningún
   * alumno, que es justo a quien le toca.
   */
  const perfil = borrador.perfil ?? ficha?.perfil ?? "alumno";
  /*
   * El total y el concepto salen de `depositoDe`, no de una suma escrita aquí.
   *
   * Eran dos sumas idénticas —esta y la de `/pago`— y ese es exactamente el
   * arreglo que hace falta ahora que además hay un concepto que depende de lo
   * mismo: un papel que diga 600 con el concepto de solo evento manda a
   * ventanilla una hoja que hay que devolver.
   */
  const deposito = depositoDePersona(evento, perfil, taller?.costo);
  /*
   * El maestro que no quiere constancia: este papel no le pide nada.
   *
   * Es el mismo par de preguntas que hace `/pago`, y por lo mismo: el borrador es
   * lo único que hay recién cerrado el pre-registro, y el estado de la ficha es lo
   * que queda cuando vuelve desde su portal semanas después.
   *
   * Lo que cambia aquí son tres cosas, y todas son cifras o promesas: el total, el
   * concepto que iría escrito a mano en la hoja del banco, y el aviso de la
   * constancia —que para él no es «todavía no», es «no»—.
   */
  const exento =
    (perfil === "docente" && borrador.quiereConstancia === false) ||
    (!!ficha && estadoDe(ficha).evento === "exento");
  /*
   * Los días del taller, en fechas.
   *
   * Se buscan en `evento.dias` y NO con `infoDia`: esa función se cae al día 1
   * cuando no encuentra el que le piden, que para pintar un rótulo está bien y
   * para datar un taller sería mentir con aplomo. Sin fecha, `fechasEnTexto`
   * devuelve vacío y el renglón no se dibuja.
   */
  const fechasTaller = taller
    ? fechasEnTexto(taller.dias.map((d) => evento.dias.find((c) => c.dia === d)?.fecha ?? ""))
    : "";

  /*
   * El día que le toca ir a pagar, que es lo que la persona pregunta aquí.
   *
   * El calendario oficial tiene DOS tablas y son dos procesos: el registro es
   * este formulario, y la inscripción es el pago presencial, que ocurre otro
   * día y fuera del sistema. Hasta ahora esta pantalla solo hablaba de la fecha
   * límite general —«antes del 10 de octubre»—, que es cierta para todos y no
   * le dice a nadie cuándo le toca a él.
   *
   * Se pide por matrícula y no se calcula aquí: la correspondencia generación →
   * fecha vive en `cita_cohortes` porque el calendario lo firma Jefatura
   * Administrativa y puede cambiar sin que cambie el sistema.
   *
   * `null` no es un fallo. Docentes y externos no tienen cita en el documento,
   * y entonces esta pantalla enseña lo de siempre: la ventanilla y su horario.
   *
   * `estricto` distingue los dos casos que hay. Para casi todos la cita es un
   * RANGO —«28 y 29 de septiembre»— y llegar cualquiera de esos días vale. Para
   * LEIP es UN día, el de su reinscripción, que Servicios Escolares fija por
   * sede, módulo y grupo: ir antes o después no sirve, porque ese día es cuando
   * su sede está abierta para ellos.
   *
   * `useCitaDePago` es el mismo hook que usan la línea de tiempo del portal y la
   * pantalla del pase. Aquí vivía copiado con su propio `useState` y su propio
   * efecto: tres copias de la misma consulta es donde una se queda sin limpiar
   * la cita anterior y un docente hereda la del alumno que usó la pestaña antes.
   */
  const citaRemota = useCitaDePago(borrador.matricula ?? ficha?.matricula);
  /*
   * La misma regla que el portal, en `lib/cita.ts`.
   *
   * El estado sale de la ficha cuando existe, y cuando no —el caso normal de
   * esta pantalla, que se abre recién cerrado el pre-registro— es
   * `pre_registrado`: esa persona acaba de registrarse y no puede haber pagado.
   * Decirlo así es más honesto que pasar un estado inventado: el valor por
   * omisión es justo el que esa situación tiene.
   */
  const cita = citaEnPantalla({
    perfil,
    estado: ficha ? estadoDelDeposito(estadoDe(ficha)) : "pre_registrado",
    remota: citaRemota,
    fechaTope: evento.fechaPagoDocentesExternos,
  });

  return (
    <PantallaPublica titulo="Comprobante de pre-registro" ancho="xl">
      <div className="rounded-lg border border-estado-pagado/30 bg-estado-pagado-bg p-4 text-estado-pagado">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="size-5" aria-hidden /> Tu pre-registro quedó guardado
        </p>
        <p className="mt-1 text-xs">Descárgalo o guarda esta pantalla: es tu comprobante.</p>
      </div>

      {/*
       * Dos columnas desde `lg:`, y el corte no es por tamaño sino por para qué
       * sirve cada cosa: a la izquierda el documento —la ficha, el QR y los dos
       * botones para llevárselo— y a la derecha lo que hay que saber después
       * —la fecha límite y por qué esto todavía no es la constancia—.
       *
       * Apiladas, esa advertencia quedaba al fondo de una página que ya había
       * dicho «tu pre-registro quedó guardado» con una palomita verde, así que
       * casi nadie llegaba a ella. Al costado se lee a la vez que el comprobante,
       * que es cuando todavía importa.
       *
       * El reparto de la ficha —datos a la izquierda, QR a la derecha— ya
       * existía en `sm:` y se queda como estaba.
       */}
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6 print:block">
        <div>
          <div className="mt-4 rounded-lg border border-border bg-card p-5 lg:p-6">
            {/*
             * La cabecera del documento, y no es adorno: **este papel no decía
             * de qué evento era**.
             *
             * La barra superior, el pie y el riel son los tres `print:hidden`,
             * que está bien —son navegación—, pero entre los tres se llevaban el
             * nombre del encuentro. Impreso quedaba «Comprobante de
             * pre-registro» y una ficha con un nombre, un folio y un QR: ni el
             * evento, ni el año, ni las fechas. Quien lo presenta en ventanilla
             * trae un papel que no se identifica solo.
             *
             * El logotipo va a 64 px porque por debajo de eso el trazo no se
             * lee —ver `docs/marca/LEEME.md`—, y una cabecera con un borrón
             * gris habría sido peor que ninguna.
             *
             * El nombre se comprueba antes de pintarlo, igual que en el pie: sin
             * base configurada llega vacío, y una cabecera con el logotipo
             * encima de un renglón en blanco se ve como un fallo de carga.
             */}
            <header className="mb-5 flex items-center gap-4 border-b border-border pb-4">
              <img
                src="/logo-encuentro.png"
                alt=""
                aria-hidden
                width={512}
                height={453}
                className="h-16 w-auto shrink-0 dark:invert"
              />
              {evento.nombre ? (
                <div className="min-w-0">
                  <p className="text-balance text-sm font-bold leading-snug">{evento.nombre}</p>
                  {evento.fechas ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{evento.fechas}</p>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Nombre</dt>
                  <dd className="text-lg font-bold">{nombre}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Folio</dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">{folio}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Perfil</dt>
                  <dd className="mt-1">
                    <PerfilBadge perfil={perfil} />
                  </dd>
                </div>
                {programa ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Programa</dt>
                    <dd className="font-medium">
                      {programa}
                      {avance_ ? <span className="text-muted-foreground"> · {avance_}</span> : null}
                      {grupo ? (
                        <span className="text-muted-foreground"> · Grupo {grupo}</span>
                      ) : null}
                      {plantel ? <span className="text-muted-foreground"> · {plantel}</span> : null}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-muted-foreground">Día y lugar</dt>
                  <dd className="font-medium">
                    {dia.etiqueta} — {isoAFecha(dia.fecha)} · {dia.lugar}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Taller</dt>
                  <dd className="font-medium">
                    {taller ? taller.nombre : "Sin taller"}
                    {/*
                     * La fecha, la hora y el lugar del taller van aquí y no se dan
                     * por sabidos. El renglón de arriba dice cuándo y dónde son las
                     * ponencias, y el taller puede caer otro día y es otro edificio:
                     * quien lleva taller se mueve por la tarde, y este papel es lo
                     * único que trae consigo.
                     */}
                    {taller ? (
                      <>
                        {fechasTaller ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {fechasTaller}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {taller.horario} · {sitioDelTaller(taller)}
                        </span>
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {exento ? "Total por pagar" : "Total por pagar (en un solo depósito)"}
                  </dt>
                  <dd className="text-lg font-bold tabular-nums">
                    {exento ? "Nada" : moneda(deposito.total)}
                  </dd>
                </div>
                {/*
                 * El concepto también va en este papel, y no solo en `/pago`.
                 *
                 * Este es el que se imprime y el que se lleva al banco; la
                 * pantalla de instrucciones se lee una vez y se cierra. Dejar
                 * el concepto solo allí obligaba a volver a buscarlo justo
                 * cuando ya no se tiene el teléfono a mano.
                 *
                 * `sm:col-span-2` porque es una frase larga dentro de una
                 * rejilla de datos cortos: en media columna se parte en cinco
                 * renglones.
                 */}
                {/*
                 * El concepto solo existe si hay depósito: es la frase que se
                 * escribe a mano DEBAJO del voucher, y quien no lleva voucher no
                 * tiene dónde escribirla. Dejarla puesta mandaría al banco a quien
                 * no tiene nada que depositar, y este es el papel que se imprime y
                 * se lleva, o sea el que se obedece.
                 */}
                {exento ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Qué llevas el día del evento</dt>
                    <dd className="text-pretty font-medium leading-snug">
                      Solo tu código. No hay depósito ni voucher que entregar.
                    </dd>
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Concepto que debes anotar</dt>
                    <dd className="text-pretty font-medium leading-snug">{deposito.concepto}</dd>
                  </div>
                )}
              </dl>
              {/*
                El QR vuelve aquí, y este papel es el que lo necesita.

                Esta pantalla estuvo dos versiones sin código, y la razón era
                buena: es la hoja que la gente guarda y trae consigo el día del
                evento —lo dice el propio encabezado, «descárgalo o guarda esta
                pantalla»—, así que un QR encima la convierte en un boleto a los
                ojos de cualquiera.

                Lo que cambió es a qué fila sirve esta hoja ANTES de eso. Son
                cerca de dos mil alumnos entregando voucher, y sin código cada
                uno le dicta doce caracteres a quien cobra. `/financieros` ya
                tenía la cámara; lo que faltaba era que el alumno trajera algo
                que enseñarle, y es justo este papel el que trae.

                El riesgo de la puerta no se contiene con lo que esta pantalla
                dibuje: quien llegue el día del evento sin pago confirmado sale
                en rojo en el torniquete, porque eso lo decide
                `fn_evaluar_escaneo`. Lo que sí está en nuestra mano es no
                anunciarlo como el pase, y de eso se encarga el rótulo de
                `CodigoParaPagar`: habla de su pago y no menciona la entrada.
              */}
              {/*
               * Para el exento este código NO es «para su pago»: es su entrada.
               *
               * Es el mismo símbolo y el mismo folio, y la diferencia está en el
               * rótulo: sin la variante, este papel —que se imprime y se lleva—
               * le decía «muéstralo en ventanilla cuando entregues tu voucher»,
               * o sea lo contrario de lo que la organización le prometió. Y el
               * código ya lo admite de verdad: `fn_evaluar_escaneo` trata
               * `exento` igual que `pagado`.
               */}
              <div className="justify-self-center">
                <CodigoParaPagar
                  folio={folio ?? ""}
                  lugar={evento.ventanilla.lugar}
                  variante={exento ? "entrada" : "pago"}
                />
              </div>
            </div>
          </div>

          {/*
            Aquí había un botón «Descargar comprobante» y ya no está.

            No descargaba nada: llamaba a `toast.success("Descargamos tu
            comprobante en PDF.")` y se quedaba tan ancho. Anunciar un archivo
            que no existe es peor que no ofrecerlo, porque quien se fía cierra
            la pestaña creyendo que lo tiene guardado.

            No se sustituye por `window.print()`, que es lo que se pediría a
            continuación: `pago.tsx` ya quitó ese botón por hacer lo que el
            navegador hace solo con Ctrl+P. La hoja de impresión sigue en pie
            —las clases `print:hidden` y `print:block` de esta pantalla no se
            tocan— así que quien quiera el papel lo tiene igual.

            Queda un solo destino, que además es el que hay que seguir: el
            portal, donde este mismo código se activa cuando el pago se valide.
          */}
          <Link
            to="/portal"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <LayoutList className="size-4" aria-hidden /> Ver mi estado en el portal
          </Link>
        </div>

        <div>
          {/*
           * Lo primero de esta columna, y por delante de la fecha límite.
           *
           * Son dos fechas distintas y se confundían en una: la fecha límite es
           * el tope común para todos, y esta es la cita concreta de SU
           * generación. Quien terminaba el registro solo veía la primera y se
           * iba sin saber qué día presentarse.
           *
           * El horario sale de la configuración y no del calendario: el
           * documento da el día, la ventanilla pone la hora.
           */}
          {cita ? (
            <section
              className={cn(
                "mt-6 rounded-lg border p-4 lg:mt-4",
                // El día único se pinta como advertencia y no como dato: quien
                // lo lea de reojo tiene que llevarse que ahí no hay margen.
                cita.clase !== "rango"
                  ? "border-estado-discrepancia/50 bg-estado-discrepancia-bg"
                  : "border-primary/30 bg-primary/5",
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock
                  className={cn(
                    "size-4 shrink-0",
                    cita.clase !== "rango" ? "text-estado-discrepancia" : "text-primary",
                  )}
                  aria-hidden
                />
                {rotulosDeLaCita(cita).titulo}
              </h2>
              {/*
                La frase sale de `rotulosDeLaCita` y no de un `estricto` leído
                aquí: cuando la fecha es una reposición hay que decir que la
                suya pasó, y esta pantalla y el portal tienen que decirlo igual.
              */}
              {rotulosDeLaCita(cita).aviso ? (
                <p className="mt-2 text-sm font-semibold text-estado-discrepancia">
                  {rotulosDeLaCita(cita).aviso}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                Es el día que te toca ir a pagar en persona. Lleva tu folio{" "}
                <span className="font-mono font-semibold text-foreground">{folio}</span>.
              </p>
              {evento.ventanilla.lugar ? (
                <p className="mt-2 text-sm text-muted-foreground">{evento.ventanilla.lugar}</p>
              ) : null}
              {evento.ventanilla.horario ? (
                <p className="text-sm text-muted-foreground">{evento.ventanilla.horario}</p>
              ) : null}
            </section>
          ) : null}

          {/*
           * Aquí decía «haz tu depósito y entrega tu voucher antes del viernes 9 de
           * octubre», y se quitó porque desmentía a la tarjeta de arriba.
           *
           * Este renglón se dibuja SIEMPRE, y la tarjeta de la cita solo cuando hay
           * una. Así que un alumno con cita estricta leía, en dos frases seguidas,
           * «es ese día y solo ese: no puedes ir antes ni después» y a renglón
           * seguido una fecha distinta y más tardía para lo mismo. Ganaba la
           * segunda, que es la que suena a instrucción y da más margen.
           *
           * El 9 de octubre no era un error: es `fecha_limite`, el corte tras el
           * cual el pre-registro sin pago expira. Pero es un dato administrativo, y
           * presentado como «entrega tu voucher antes del» se lee como un día de
           * entrega, que es justo lo que decide `dia_entrega_voucher`. Dos fechas
           * ciertas sobre el mismo acto es una de más: se queda la que le dice a
           * esta persona qué día presentarse.
           *
           * No deja a nadie sin el plazo. `/pago` lo sigue enseñando, y ahí es
           * donde se va a depositar.
           */}
          <p className="mt-6 text-center text-sm text-muted-foreground lg:mt-4 lg:text-left">
            <Link to="/portal" className="font-semibold text-primary underline">
              Consulta tu estado en el portal
            </Link>
          </p>

          {/*
           * Este bloque existe para evitar una expectativa equivocada, no para
           * informar de más.
           *
           * Hasta aquí el alumno solo se ha pre-registrado, y ninguno de los tres
           * requisitos de constancia depende de eso: dependen de pagar, de asistir y
           * —si es alumno— de que le aprueben las evidencias. El sitio hablaba de
           * «tu constancia» desde el primer paso, así que era razonable terminar el
           * registro creyendo que ya estaba resuelta. Decirlo aquí, y no al final
           * del evento, es lo que deja tiempo de hacer algo al respecto.
           *
           * La lista se redacta a mano en lugar de leerse de `elegibilidad.ts`
           * porque aquí son condiciones GENERALES, no el estado de esta persona.
           *
           * Y esa distinción pasó a ser lo único que se le dice al alumno sobre
           * la constancia: `/portal/constancia` evaluaba su caso concreto y se
           * quitó por eso mismo —dos de los tres requisitos solo se cumplen
           * durante el evento, así que antes le enseñaba tachas rojas sobre
           * cosas que no estaban en su mano—. Ver `portal-nav.tsx`.
           *
           * Así que este bloque es ahora el sitio donde el alumno se entera de
           * qué se le va a pedir. Lo accionable vive donde se puede accionar: su
           * pago en `/portal/estado` y cada evidencia en `/portal/evidencias`.
           */}
          {/*
           * Para el exento este bloque no es una advertencia, es un hecho.
           *
           * «El pre-registro no da derecho a la constancia» y la lista de tres
           * requisitos le dirían que le falta cumplirlos, cuando lo que pasa es que
           * el primero no está en su mano: eligió no pagar. Enumerárselos lo
           * mandaría a intentar cumplir algo que su propia respuesta cerró, y a
           * descubrirlo el día del reparto.
           */}
          {exento ? (
            <section className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Info className="size-4 shrink-0 text-primary" aria-hidden />
                No vas a recibir constancia
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Elegiste asistir sin constancia, y por eso el Encuentro y tu taller no te cuestan
                nada. Tu entrada el día {dia.etiqueta} sí queda registrada.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Si cambias de opinión, escríbenos a soporte antes del evento: para tener constancia
                hay que pagar la cuota del Encuentro.
              </p>
            </section>
          ) : (
            <section className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Info className="size-4 shrink-0 text-primary" aria-hidden />
                El pre-registro no da derecho a la constancia
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Para aparecer en el listado de elegibles necesitas, además de este registro:
              </p>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span aria-hidden className="text-primary">
                    1.
                  </span>
                  Tu pago del evento registrado como pagado.
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-primary">
                    2.
                  </span>
                  Tu entrada registrada el día {dia.etiqueta}.
                </li>
                {perfil === "alumno" ? (
                  <li className="flex gap-2">
                    <span aria-hidden className="text-primary">
                      3.
                    </span>
                    Tus evidencias de los días en línea, aprobadas.
                  </li>
                ) : null}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                La universidad elabora el documento con ese listado; el sistema no lo emite. Puedes
                seguir tu avance en el portal.
              </p>
            </section>
          )}
        </div>
      </div>
    </PantallaPublica>
  );
}
