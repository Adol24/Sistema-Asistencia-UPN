import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Info, LayoutList } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { CodigoPendiente } from "@/components/pase";
import { PerfilBadge } from "@/components/estado-badges";
import { avanceTexto } from "@/dominio/catalogos";
import { fechaLimiteTexto, isoAFecha, moneda } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/comprobante")({
  head: () =>
    meta(
      "Comprobante de pre-registro — XIV Encuentro Internacional de Educación",
      "Resumen de tu pre-registro: folio, perfil, día, lugar, taller y montos por pagar del XIV Encuentro Internacional de Educación.",
    ),
  component: Comprobante,
});

function Comprobante() {
  const { borrador, participante } = usePrototipo();
  const { configuracion: evento, getTaller, infoDia } = useEstadoEvento();
  // Los datos académicos son del alumno: docentes y externos no los tienen.
  const nivel = borrador.nivel ?? participante?.nivel;
  const programa = borrador.programa ?? participante?.programa;
  const avance = borrador.avance ?? participante?.avance;
  const grupo = borrador.grupo ?? participante?.grupo;
  const plantel = borrador.plantel ?? participante?.plantel;
  const avance_ = avanceTexto(evento.catalogoAcademico, nivel, avance, programa);
  // El folio del pre-registro recién creado, no el del participante de contexto.
  const folio = borrador.folio ?? participante?.folio;
  const dia = infoDia(borrador.dia ?? participante?.dia ?? 1);
  const taller = getTaller(borrador.tallerId ?? participante?.tallerId);
  const nombre = borrador.nombre ?? participante?.nombre;
  const total = evento.cuotaEvento + (taller?.costo ?? 0);

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
                    <PerfilBadge perfil={borrador.perfil ?? participante?.perfil ?? "alumno"} />
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
                     * La hora y el lugar del taller van aquí y no se dan por sabidos.
                     * El renglón de arriba dice dónde son las ponencias, que es otro
                     * edificio: quien lleva taller se mueve por la tarde, y este papel
                     * es lo único que trae consigo ese día.
                     */}
                    {taller ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {taller.horario} · {taller.lugar}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Total por pagar (en dos depósitos)
                  </dt>
                  <dd className="text-lg font-bold tabular-nums">{moneda(total)}</dd>
                </div>
              </dl>
              {/*
                Aquí ya no hay QR, y esta pantalla es la razón de la regla.

                Pasó por dos intentos. Primero ponía «Folio para ventanilla» en
                gris junto al código: tres palabras que no compiten con una
                imagen que el ojo ya clasificó como «mi QR del evento». Luego se
                le puso un sello que decía «todavía no abre la puerta», que era
                honesto y seguía perdiendo contra la imagen.

                Este papel es el que la gente guarda y el que trae consigo el
                día del evento —lo dice el propio encabezado: «descárgalo o
                guarda esta pantalla»—. Un comprobante de pre-registro con un
                QR encima ES un boleto para cualquiera que lo mire. Y no lo es:
                el pago todavía no está confirmado, y cuando lo esté el código
                aparecerá en el portal.

                Lo que sí tiene que llevarse de aquí es el folio, que es lo que
                le piden en ventanilla y lo que abre su portal.
              */}
              <div className="justify-self-center">
                <CodigoPendiente folio={folio ?? ""} />
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
          <p className="mt-6 text-center text-sm text-muted-foreground lg:mt-4 lg:text-left">
            Siguiente paso: haz tus depósitos y entrega los vouchers antes del{" "}
            {fechaLimiteTexto(evento.fechaLimite)}.{" "}
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
           * porque aquí son condiciones generales, no el estado de esta persona:
           * su avance real vive en `/portal/constancia`, que sí las evalúa.
           */}
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
              {participante?.perfil === "alumno" ? (
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
        </div>
      </div>
    </PantallaPublica>
  );
}
