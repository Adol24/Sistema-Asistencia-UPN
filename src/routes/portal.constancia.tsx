import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Award, CheckCircle2, Clock, GraduationCap } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PortalNav } from "@/components/portal-nav";
import { EsperaDelPortal } from "@/components/acceso";
import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  elegibilidadTaller,
  EVIDENCIAS_REQUERIDAS,
  EVIDENCIAS_TALLER_REQUERIDAS,
  type EntornoConstancias,
} from "@/lib/elegibilidad";
import { hoyIso } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Asistencia, Evidencia, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/portal/constancia")({
  head: () =>
    meta(
      "Mi constancia — XIV Encuentro Internacional de Educación",
      "Qué te falta para la constancia del evento y, si tienes, la de tu taller: lo que ya cumples y lo que todavía puedes resolver.",
    ),
  component: MiConstancia,
});

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function MiConstancia() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <MiConstanciaContenido p={p} />;
}

const yaPaso = (fecha: string) => fecha !== "" && hoyIso() > fecha.slice(0, 10);

type NivelRequisito = "cumplido" | "pendiente" | "futuro";

/** `evaluable` en falso es lo que separa "no cumples" de "todavía no toca": ver la nota de `portal-nav.tsx`. */
const nivelDe = (ok: boolean, evaluable: boolean): NivelRequisito =>
  ok ? "cumplido" : evaluable ? "pendiente" : "futuro";

interface RequisitoVista {
  texto: string;
  nivel: NivelRequisito;
  comoSeResuelve: string;
}

function MiConstanciaContenido({ p }: { p: Participante }) {
  const { estadoDe, configuracion: evento, infoDia, getTaller } = useEstadoEvento();
  const { datos } = usePortal();
  const e = datos?.elegibilidad ?? null;

  const taller = p.tallerId ? getTaller(p.tallerId) : undefined;
  const diasTaller = taller?.dias ?? [];

  /*
   * El taller no tiene una vista equivalente a `v_elegibles`. En vez de
   * escribir una CUARTA regla a mano —que es justo el error que esta pantalla
   * ya cometió una vez (ver la migración 53)—, se arma un entorno mínimo con
   * solo lo que `elegibilidadTaller` necesita para llamar a la MISMA función
   * que usa `/admin/elegibles`. El `as unknown as` es el mismo criterio que
   * `scripts/verificar-configuracion.ts` usa para probarla: rellenar el
   * objeto entero escondería de qué depende de verdad el cálculo.
   *
   * Se calcula ANTES del `return` temprano de abajo, aunque solo haga falta
   * cuando `e` existe: un hook no puede llamarse condicionalmente, y mover
   * este `useMemo` después del `if` cambiaría cuántos hooks corren según el
   * caso, que es justo el error que la vieja `/portal/constancia` ya evitaba
   * partiendo la pantalla en dos componentes. Ver `MiConstancia`, arriba.
   */
  const entornoTaller: EntornoConstancias = useMemo(() => {
    const asistencias = (datos?.asistencias ?? []) as unknown as Asistencia[];
    const evidencias = (datos?.evidencias ?? []) as unknown as Evidencia[];
    return {
      estadoDe,
      asistenciasDe: (_folio, dia) =>
        dia === undefined ? asistencias : asistencias.filter((a) => a.dia === dia),
      evidenciasDe: () => evidencias,
      diasTallerDe: () => diasTaller,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, estadoDe, diasTaller.join(",")]);

  if (!e) {
    return (
      <PantallaPublica ancho="lg">
        <PortalNav />
        <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-semibold">
            Todavía no hay datos para evaluar tu constancia
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vuelve a intentarlo en unos minutos. Si acabas de pre-registrarte, esto es normal.
          </p>
        </section>
      </PantallaPublica>
    );
  }

  const diaPropioPaso = yaPaso(infoDia(p.dia).fecha);
  const otrosDiasPasaron = evento.dias.filter((d) => d.dia !== p.dia).every((d) => yaPaso(d.fecha));

  /*
   * El veredicto del evento es el de `v_elegibles` (vía `fn_portal_estado`), no
   * `requisitos.every(...)`: desde la migración 53 esa vista es la ÚNICA regla
   * de elegibilidad del evento, la misma que usa `/admin/elegibles`. Esta lista
   * solo EXPLICA ese veredicto requisito por requisito; no lo recalcula.
   */
  const requisitosEvento: RequisitoVista[] = [
    {
      texto: "Pago del evento confirmado",
      nivel:
        e.estado_pago_evento === "pagado"
          ? "cumplido"
          : e.estado_pago_evento === "exento"
            ? "futuro"
            : "pendiente",
      comoSeResuelve:
        e.estado_pago_evento === "exento"
          ? "Estás exento de depósito, pero ese requisito no es lo mismo que la constancia: tu caso lo decide la organización, no el pago."
          : `Tu pago está en «${e.estado_pago_evento.replace("_", " ")}». Consulta el detalle en la pestaña Estado o resuélvelo en Servicios Financieros.`,
    },
    {
      texto: `Entrada registrada el día ${p.dia}`,
      nivel: nivelDe(e.tiene_entrada, diaPropioPaso),
      comoSeResuelve: diaPropioPaso
        ? "No tenemos tu entrada de ese día. Si sí asististe pero no alcanzaron a escanearte, escríbenos por soporte."
        : "Se confirma el día que te toca asistir en persona.",
    },
  ];
  if (p.perfil === "alumno") {
    requisitosEvento.push({
      texto: `${EVIDENCIAS_REQUERIDAS} evidencias aprobadas de los días en línea`,
      nivel: nivelDe(e.evidencias_aprobadas >= EVIDENCIAS_REQUERIDAS, otrosDiasPasaron),
      comoSeResuelve: otrosDiasPasaron
        ? `Llevas ${e.evidencias_aprobadas} de ${EVIDENCIAS_REQUERIDAS} aprobadas. Súbelas o revisa su estado en la pestaña Evidencias.`
        : "Se confirma conforme subas y se aprueben tus evidencias de los días que no te tocan presencial.",
    });
  }
  const eventoTieneFalta = requisitosEvento.some((r) => r.nivel === "pendiente");

  const diasTallerPasaron =
    diasTaller.length > 0 && diasTaller.every((d) => yaPaso(infoDia(d).fecha));
  const elegTaller = p.tallerId ? elegibilidadTaller(entornoTaller, p) : null;

  const diasTallerAsistidos = diasTaller.filter((d) =>
    (datos?.asistencias ?? []).some((a) => a.dia === d && a.tipo === "taller"),
  ).length;
  const evidenciaTallerUltima = (datos?.evidencias ?? [])
    .filter((ev) => ev.tipo === "taller")
    .at(-1);

  /*
   * El booleano `ok` de cada requisito viene de `elegibilidadTaller`, así que
   * el veredicto nunca puede divergir de admin. El texto de abajo es propio
   * de esta pantalla: los de `elegibilidad.ts` están escritos en tercera
   * persona para quien revisa a otros («Tiene N de M…», «Todavía no sube
   * su…»), y repetirlos aquí tal cual le hablaría al alumno de sí mismo como
   * si fuera otra persona.
   */
  const requisitosTaller: RequisitoVista[] = elegTaller
    ? [
        {
          texto: "Pago del taller confirmado",
          nivel: nivelDe(elegTaller.requisitos[0]!.ok, true),
          comoSeResuelve: `Tu pago del taller está en «${(estadoDe(p).taller ?? "sin registrar").replace("_", " ")}». Consulta el detalle en la pestaña Estado.`,
        },
        {
          texto:
            diasTaller.length === 1
              ? `Asistencia registrada el día ${diasTaller[0]} de tu taller`
              : `Asistencia registrada los ${diasTaller.length} días de tu taller`,
          nivel: nivelDe(elegTaller.requisitos[1]!.ok, diasTallerPasaron),
          comoSeResuelve: diasTallerPasaron
            ? `Llevas ${diasTallerAsistidos} de ${diasTaller.length} días registrados.`
            : "Se confirma conforme avancen los días de tu taller.",
        },
        ...(p.perfil === "alumno"
          ? [
              {
                texto: `${EVIDENCIAS_TALLER_REQUERIDAS} evidencia aprobada de tu taller`,
                nivel: nivelDe(elegTaller.requisitos[2]!.ok, diasTallerPasaron),
                comoSeResuelve: !evidenciaTallerUltima
                  ? "Todavía no subes tu evidencia del taller. Hazlo en la pestaña Evidencias."
                  : evidenciaTallerUltima.estado === "rechazada"
                    ? `Tu evidencia fue rechazada (${evidenciaTallerUltima.motivo_rechazo ?? "sin motivo"}). Vuelve a subirla en Evidencias.`
                    : evidenciaTallerUltima.estado === "pendiente"
                      ? "Tu evidencia sigue pendiente de revisión."
                      : "Ya tienes tu evidencia del taller aprobada.",
              },
            ]
          : []),
      ]
    : [];
  const tallerTieneFalta = requisitosTaller.some((r) => r.nivel === "pendiente");

  return (
    <PantallaPublica ancho="lg">
      <PortalNav />

      <VeredictoConstancia
        titulo="Constancia del evento"
        elegible={e.elegible}
        tieneFalta={eventoTieneFalta}
        requisitos={requisitosEvento}
      />

      {p.tallerId && elegTaller ? (
        <VeredictoConstancia
          className="mt-4"
          titulo={taller ? `Constancia de taller: ${taller.nombre}` : "Constancia de taller"}
          elegible={elegTaller.elegible}
          tieneFalta={tallerTieneFalta}
          requisitos={requisitosTaller}
          icono={GraduationCap}
        />
      ) : null}

      {e.nombre_en_revision || p.nombreEnRevision ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-estado-discrepancia-bg p-3 text-sm text-estado-discrepancia">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Tu nombre está en revisión. Apareces señalado en el listado para que la institución no
          elabore tu documento con el nombre equivocado. Soporte se pondrá en contacto contigo.
        </p>
      ) : null}

      {/*
        El sistema no genera el documento: solo dice si cumples. La constancia
        la elabora la institución a partir del listado de elegibles.
      */}
      <p className="mx-auto mt-6 max-w-md rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">
        El sistema no emite el documento: solo dice si cumples. La institución elabora las
        constancias con el listado de quienes sí cumplen, y te avisará cómo recogerla.
      </p>
    </PantallaPublica>
  );
}

function VeredictoConstancia({
  titulo,
  elegible,
  tieneFalta,
  requisitos,
  icono: Icono = Award,
  className,
}: {
  titulo: string;
  elegible: boolean;
  tieneFalta: boolean;
  requisitos: RequisitoVista[];
  icono?: typeof Award;
  className?: string;
}) {
  const encabezado = elegible
    ? "Cumples los requisitos"
    : tieneFalta
      ? "Te falta completar algo"
      : "Se confirma conforme avance el evento";

  return (
    <section className={cn("rounded-lg border border-border bg-card p-6 text-center", className)}>
      <Icono
        className={cn(
          "mx-auto size-9",
          elegible
            ? "text-estado-pagado"
            : tieneFalta
              ? "text-estado-cancelado"
              : "text-muted-foreground",
        )}
        aria-hidden
      />
      <h2 className="mt-2 text-base font-bold">{titulo}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{encabezado}</p>
      <ul className="mx-auto mt-4 grid max-w-md gap-2 text-left">
        {requisitos.map((r) => (
          <FilaRequisito key={r.texto} r={r} />
        ))}
      </ul>
    </section>
  );
}

function FilaRequisito({ r }: { r: RequisitoVista }) {
  const Icono =
    r.nivel === "cumplido" ? CheckCircle2 : r.nivel === "pendiente" ? AlertTriangle : Clock;
  const clase =
    r.nivel === "cumplido"
      ? "text-estado-pagado"
      : r.nivel === "pendiente"
        ? "text-estado-cancelado"
        : "text-muted-foreground";
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-start gap-2">
        <Icono className={cn("mt-0.5 size-4 shrink-0", clase)} aria-hidden />
        <span className={r.nivel === "futuro" ? "text-muted-foreground" : ""}>{r.texto}</span>
      </div>
      {r.nivel !== "cumplido" ? (
        <p className="mt-1 pl-6 text-xs text-muted-foreground">{r.comoSeResuelve}</p>
      ) : null}
    </li>
  );
}
