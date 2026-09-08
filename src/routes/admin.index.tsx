import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Asistencia } from "@/mocks/tipos";
import { createFileRoute } from "@tanstack/react-router";
import { Award, CreditCard, ImageUp, ScanLine, ShieldAlert, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Progress } from "@/components/ui/progress";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  elegibilidadEvento,
  nombreEnRevisionActivo,
  type EntornoConstancias,
} from "@/lib/elegibilidad";
import { RelojEventoControl } from "@/components/reloj-evento";
import { Indicador } from "@/components/indicador";
import { verificarMocks } from "@/mocks/verificar";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia } from "@/mocks/tipos";

export const Route = createFileRoute("/admin/")({
  head: () =>
    meta(
      "Dashboard — Administración del Encuentro",
      "Indicadores del XIV Encuentro Internacional de Educación: pre-registros, embudo de pagos, ocupación de talleres, asistencia, revisión de evidencias y constancias.",
    ),
  component: Dashboard,
});

const COLOR_PERFIL: Record<string, string> = {
  alumno: "var(--color-perfil-alumno)",
  docente: "var(--color-perfil-docente)",
  externo: "var(--color-perfil-externo)",
};

function Dashboard() {
  const {
    participantes,
    estadoDe,
    asistenciasDe,
    asistencias,
    evidencias,
    casos,
    talleres,
    getTaller,
    configuracion,
    reloj,
    usuarios,
    padron,
    anularAsistencia,
  } = useEstadoEvento();
  const infoDelDia = configuracion.dias.find((d) => d.dia === reloj.dia);
  const [anulando, setAnulando] = useState<Asistencia | null>(null);
  const [motivo, setMotivo] = useState("");

  /**
   * Los mismos invariantes de `bun run verificar-mocks`, pero sobre el estado
   * VIVO. Importar el padrón o editar un taller mueve días e inscripciones, así
   * que las reglas que se respetan al arrancar pueden romperse en marcha; esto
   * lo hace visible sin salir del panel.
   */
  const violaciones = useMemo(
    () =>
      verificarMocks({
        participantes,
        asistencias,
        evidencias,
        talleres,
        casosSoporte: casos,
        usuariosInternos: usuarios,
        alumnosPadron: padron,
      }),
    [participantes, asistencias, evidencias, talleres, casos, usuarios, padron],
  );
  // Solo importa la integridad: la cobertura describe el conjunto de arranque y
  // el histórico son consecuencias legítimas de mover a alguien de día.
  const integridad = violaciones.filter((x) => x.clase === "integridad");
  const historico = violaciones.filter((x) => x.clase === "historico");

  /**
   * Las asistencias que quedaron en un día que ya no es el del participante.
   * Se calculan aquí y no se leen de las violaciones porque hace falta el
   * registro completo, no su descripción: sin el id no se puede anular.
   */
  const desfasadas = useMemo(() => {
    const diaDe = new Map(participantes.map((p) => [p.folio, p.dia]));
    return asistencias.filter((a) => diaDe.has(a.folio) && diaDe.get(a.folio) !== a.dia);
  }, [asistencias, participantes]);

  const entorno = useMemo<EntornoConstancias>(
    () => ({
      estadoDe,
      asistenciasDe,
      evidencias,
      diasTallerDe: (id: string | undefined) => (getTaller(id)?.dias ?? []) as Dia[],
    }),
    [estadoDe, asistenciasDe, evidencias, getTaller],
  );

  // Todo se calcula del contexto compartido: un pago registrado en ventanilla,
  // un escaneo en la puerta o una evidencia aprobada mueven estos números sin
  // recargar la página.
  const datos = useMemo(() => {
    const porPerfil = (["alumno", "docente", "externo"] as const).map((perfil) => ({
      perfil,
      etiqueta: perfil[0]!.toUpperCase() + perfil.slice(1) + "s",
      total: participantes.filter((p) => p.perfil === perfil).length,
    }));

    const porDia = ([1, 2, 3] as Dia[]).map((dia) => ({
      dia,
      etiqueta: `Día ${dia}`,
      alumno: participantes.filter((p) => p.dia === dia && p.perfil === "alumno").length,
      docente: participantes.filter((p) => p.dia === dia && p.perfil === "docente").length,
      externo: participantes.filter((p) => p.dia === dia && p.perfil === "externo").length,
    }));

    const estados = participantes.map((p) => estadoDe(p).evento);
    const cuenta = (e: string) => estados.filter((x) => x === e).length;
    // El embudo es acumulado: quien pagó también entregó comprobante.
    const pagado = cuenta("pagado");
    const comprobante = pagado + cuenta("comprobante_recibido") + cuenta("discrepancia");
    const embudo = [
      { etapa: "Pre-registrado", n: participantes.length },
      { etapa: "Comprobante", n: comprobante },
      { etapa: "Pagado", n: pagado },
    ];

    const asistenciaPorDia = ([1, 2, 3] as Dia[]).map((dia) => {
      const esperados = participantes.filter(
        (p) => p.dia === dia && estadoDe(p).evento === "pagado",
      ).length;
      const entradas = asistencias.filter((a) => a.dia === dia && a.tipo === "entrada").length;
      const salidas = asistencias.filter((a) => a.dia === dia && a.tipo === "salida").length;
      return { dia, etiqueta: `Día ${dia}`, esperados, entradas, salidas };
    });

    const revisadas = evidencias.filter((e) => e.estado !== "pendiente").length;

    const elegibles = participantes.filter((p) => elegibilidadEvento(entorno, p).elegible);
    const enRevision = participantes.filter((p) => nombreEnRevisionActivo(p, casos).marcado).length;
    const delReloj = asistenciaPorDia.find((d) => d.dia === reloj.dia);

    return {
      porPerfil,
      porDia,
      embudo,
      pagado,
      porPagar: participantes.length - pagado,
      asistenciaPorDia,
      revisadas,
      elegibles: elegibles.length,
      enRevision,
      delReloj,
    };
  }, [participantes, estadoDe, asistencias, evidencias, casos, entorno, reloj.dia]);

  return (
    <PantallaPanel
      area="admin"
      titulo="Dashboard"
      descripcion={`${configuracion.nombre} · ${configuracion.fechas}`}
      nav={navAdmin}
      acciones={<RelojEventoControl />}
    >
      {/* Lo que se pregunta cada mañana, arriba de todo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          icono={<CreditCard className="size-5" aria-hidden />}
          etiqueta="Faltan por pagar"
          valor={String(datos.porPagar)}
          detalle={`de ${participantes.length} pre-registrados`}
          tono={datos.porPagar > 0 ? "alerta" : undefined}
        />
        <Indicador
          icono={<ScanLine className="size-5" aria-hidden />}
          etiqueta="Faltan por entrar hoy"
          valor={String(
            Math.max(
              0,
              (datos.asistenciaPorDia[0]?.esperados ?? 0) -
                (datos.asistenciaPorDia[0]?.entradas ?? 0),
            ),
          )}
          detalle={`Día 1 · ${datos.asistenciaPorDia[0]?.entradas ?? 0} de ${datos.asistenciaPorDia[0]?.esperados ?? 0} dentro`}
          tono="alerta"
        />
        <Indicador
          icono={<ImageUp className="size-5" aria-hidden />}
          etiqueta="Evidencias revisadas"
          valor={`${datos.revisadas} / ${evidencias.length}`}
          detalle={`${Math.round((datos.revisadas / Math.max(1, evidencias.length)) * 100)}% de la muestra`}
        />
        <Indicador
          icono={<Award className="size-5" aria-hidden />}
          etiqueta="Elegibles para constancia"
          valor={`${datos.elegibles} / ${participantes.length}`}
          detalle={
            datos.enRevision > 0
              ? `${datos.enRevision} con nombre en revisión, apartar antes de imprimir`
              : "Sin nombres en revisión"
          }
        />
      </div>

      {historico.length > 0 && integridad.length === 0 ? (
        <section className="mt-4 rounded-lg border border-estado-discrepancia/40 bg-estado-discrepancia-bg p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-estado-discrepancia">
            <ShieldAlert className="size-4" aria-hidden />
            {historico.length} registro{historico.length === 1 ? "" : "s"} quedaron en un día que ya
            no corresponde
          </h2>
          <p className="mt-1 text-sm text-estado-discrepancia">
            Alguien cambió de día asignado y sus asistencias o evidencias anteriores siguen en el
            día viejo. No es un error: la historia no se reescribe. Conviene revisarlo antes de
            cerrar el evento.
          </p>
          {desfasadas.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {desfasadas.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2 text-xs"
                >
                  <span>
                    <span className="font-semibold">{a.nombre}</span> · {a.folio} · {a.tipo} del día{" "}
                    {a.dia} a las {a.hora}
                    <span className="text-muted-foreground">
                      {" "}
                      · hoy le corresponde el día{" "}
                      {participantes.find((p) => p.folio === a.folio)?.dia}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      setAnulando(a);
                      setMotivo("");
                    }}
                  >
                    Anular
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-2 grid gap-1 text-xs text-estado-discrepancia">
              {historico.slice(0, 5).map((x, i) => (
                <li key={i}>{x.detalle}</li>
              ))}
              {historico.length > 5 ? <li>… y {historico.length - 5} más</li> : null}
            </ul>
          )}
        </section>
      ) : null}

      {integridad.length > 0 ? (
        <section className="mt-4 rounded-lg border-2 border-estado-cancelado/40 bg-estado-cancelado-bg p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-estado-cancelado">
            <ShieldAlert className="size-4" aria-hidden />
            {integridad.length} regla{integridad.length === 1 ? "" : "s"} de datos rota
            {integridad.length === 1 ? "" : "s"} en esta sesión
          </h2>
          <p className="mt-1 text-sm text-estado-cancelado">
            Son los mismos invariantes que valida <code>bun run verificar-mocks</code>, aplicados al
            estado vivo. Suelen aparecer tras importar el padrón o editar un taller.
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-estado-cancelado">
            {integridad.slice(0, 6).map((x, i) => (
              <li key={i}>
                <span className="font-mono font-semibold">[{x.invariante}]</span> {x.detalle}
              </li>
            ))}
            {integridad.length > 6 ? <li>… y {integridad.length - 6} más</li> : null}
          </ul>
        </section>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Pre-registros por perfil" nota="Reparto de los 60 participantes">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="45%" height={180}>
              <PieChart>
                <Pie
                  data={datos.porPerfil}
                  dataKey="total"
                  nameKey="etiqueta"
                  innerRadius={38}
                  outerRadius={68}
                  strokeWidth={2}
                >
                  {datos.porPerfil.map((d) => (
                    <Cell key={d.perfil} fill={COLOR_PERFIL[d.perfil]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className="grid flex-1 gap-2">
              {datos.porPerfil.map((d) => (
                <li key={d.perfil} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-sm"
                      style={{ background: COLOR_PERFIL[d.perfil] }}
                    />
                    {d.etiqueta}
                  </span>
                  <span className="font-bold">{d.total}</span>
                </li>
              ))}
            </ul>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Pre-registros por día" nota="Cada día es un grupo distinto">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={datos.porDia}>
              <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} />
              <Tooltip />
              <Bar dataKey="alumno" stackId="a" fill={COLOR_PERFIL["alumno"]} name="Alumnos" />
              <Bar dataKey="docente" stackId="a" fill={COLOR_PERFIL["docente"]} name="Docentes" />
              <Bar
                dataKey="externo"
                stackId="a"
                fill={COLOR_PERFIL["externo"]}
                name="Externos"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Tarjeta>

        <Tarjeta titulo="Embudo de pagos" nota="Pre-registrado → comprobante → pagado">
          <ul className="grid gap-3">
            {datos.embudo.map((e, i) => {
              const pct = Math.round((e.n / participantes.length) * 100);
              return (
                <li key={e.etapa}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{e.etapa}</span>
                    <span className="text-muted-foreground">
                      <span className="text-base font-bold text-foreground">{e.n}</span> · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        i === 0 && "bg-estado-pre",
                        i === 1 && "bg-estado-comprobante",
                        i === 2 && "bg-estado-pagado",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {i > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {datos.embudo[i - 1]!.n - e.n} se quedaron en el paso anterior
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Asistencia por día" nota="Entradas y salidas contra los que pagaron">
          <ul className="grid gap-3">
            {datos.asistenciaPorDia.map((d) => {
              const info = configuracion.dias.find((x) => x.dia === d.dia)!;
              const pct = d.esperados === 0 ? 0 : Math.round((d.entradas / d.esperados) * 100);
              return (
                <li key={d.dia}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {info.etiqueta} <span className="text-muted-foreground">· {info.sede}</span>
                    </span>
                    <span className="text-muted-foreground">
                      <span className="text-base font-bold text-foreground">{d.entradas}</span> de{" "}
                      {d.esperados} · {d.salidas} salidas
                    </span>
                  </div>
                  <Progress value={pct} className="mt-1 h-3" />
                </li>
              );
            })}
          </ul>
        </Tarjeta>

        <Tarjeta
          titulo="Ocupación de los 11 talleres"
          nota="Incluye a los inscritos fuera del conjunto simulado"
          className="lg:col-span-2"
        >
          {talleres.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No hay talleres registrados. Se dan de alta en la pantalla de talleres.
            </p>
          ) : null}
          <ul className="grid gap-2 sm:grid-cols-2">
            {talleres.map((t) => {
              const pct = Math.round((t.cupoOcupado / t.cupoTotal) * 100);
              const libres = t.cupoTotal - t.cupoOcupado;
              return (
                <li key={t.id} className="rounded-md border border-border p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{t.id}</span>{" "}
                      {t.nombre}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-bold",
                        libres <= 0 && "text-estado-cancelado",
                        libres > 0 && libres < 5 && "text-estado-discrepancia",
                      )}
                    >
                      {t.cupoOcupado}/{t.cupoTotal}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        libres <= 0
                          ? "bg-estado-cancelado"
                          : libres < 5
                            ? "bg-estado-discrepancia"
                            : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {libres <= 0 ? "Cupo lleno" : `${libres} lugares disponibles`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      </div>
      <AlertDialog open={!!anulando} onOpenChange={(o) => !o && setAnulando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Anular la {anulando?.tipo} de {anulando?.nombre}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Del día {anulando?.dia} a las {anulando?.hora}. El registro deja de contar para su
              asistencia y para los elegibles, pero queda en la bitácora con tu nombre y el motivo.
              Escribe por qué: sin eso, dentro de un mes nadie sabrá si fue un error o una
              corrección.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="motivo-anulacion">Motivo</Label>
            <Textarea
              id="motivo-anulacion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cambió de día por corrección del padrón; esta entrada era del día anterior."
              rows={3}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivo.trim().length < 10}
              onClick={() => {
                if (!anulando) return;
                anularAsistencia(anulando.id, motivo.trim());
                toast.success(`Anulada la ${anulando.tipo} de ${anulando.nombre}.`);
                setAnulando(null);
              }}
            >
              Anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PantallaPanel>
  );
}

function Tarjeta({
  titulo,
  nota,
  children,
  className,
}: {
  titulo: string;
  nota: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Users className="size-4 text-primary" aria-hidden />
        {titulo}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{nota}</p>
      {children}
    </section>
  );
}
