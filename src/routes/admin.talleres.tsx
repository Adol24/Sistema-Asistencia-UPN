import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoNumero } from "@/components/campo-numero";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { PerfilBadge } from "@/components/estado-badges";
import { useEstadoEvento } from "@/lib/estado-evento";
import { isoAMomentoLocal, momentoLocalAIso, moneda, sitioDelTaller } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia, Participante, TallerBase } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/talleres")({
  head: () =>
    meta(
      "Talleres — Administración del Encuentro",
      "Alta, edición y baja de los talleres del Encuentro, con cupo ocupado derivado de las inscripciones.",
    ),
  component: AdminTalleres,
});

type FiltroAsistenciaTaller = "todos" | "asistio" | "no_asistio";

/** A quién se le va a marcar la asistencia de su taller a mano. */
interface MarcandoInfo {
  participanteId: string;
  folio: string;
  nombre: string;
  tallerId: string;
  tallerNombre: string;
  dias: Dia[];
}

function AdminTalleres() {
  const {
    participantes,
    talleres,
    asistencias,
    guardarTaller,
    eliminarTaller,
    registrarBitacora,
    recargar,
  } = useEstadoEvento();
  const [editando, setEditando] = useState<TallerBase | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  // Cuál taller tiene abierta la lista de inscritos, por clave. Uno a la vez:
  // ver a los setenta de T12 y a los veinticinco de T01 de golpe no ayuda a
  // encontrar a nadie.
  const [verInscritos, setVerInscritos] = useState<string | null>(null);
  const [filtroAsistencia, setFiltroAsistencia] = useState<FiltroAsistenciaTaller>("todos");

  const [marcando, setMarcando] = useState<MarcandoInfo | null>(null);
  const [diaMarcar, setDiaMarcar] = useState<Dia | null>(null);
  const [momentoMarcar, setMomentoMarcar] = useState("");
  const [motivoMarcar, setMotivoMarcar] = useState("");
  const [guardandoMarcar, setGuardandoMarcar] = useState(false);

  // El pase de lista del taller es su propia asistencia (tipo "taller"), no
  // el pre-registro: inscrito es «eligió este taller», asistió es «lo escanearon ahí».
  const asistioAlTaller = (p: Participante) =>
    asistencias.some((a) => a.folio === p.folio && a.tipo === "taller");

  const inscritosDe = (id: string) =>
    participantes
      .filter((p) => p.tallerId === id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const inscritos = (id: string) => inscritosDe(id).length;

  const abrirMarcar = (p: Participante, t: TallerBase) => {
    setMarcando({
      participanteId: p.id,
      folio: p.folio,
      nombre: p.nombre,
      tallerId: t.id,
      tallerNombre: t.nombre,
      dias: t.dias,
    });
    setDiaMarcar(t.dias[0] ?? null);
    setMomentoMarcar(isoAMomentoLocal(new Date().toISOString()));
    setMotivoMarcar("");
  };

  const confirmarMarcar = async () => {
    if (!marcando || !diaMarcar || guardandoMarcar) return;
    setGuardandoMarcar(true);
    try {
      const { agregarAsistenciaRemota } = await import("@/lib/datos");
      await agregarAsistenciaRemota({
        participanteId: marcando.participanteId,
        dia: diaMarcar,
        tipo: "taller",
        horaIso: momentoLocalAIso(momentoMarcar),
        motivo: motivoMarcar.trim(),
        tallerId: marcando.tallerId,
      });
      registrarBitacora(
        "Marcó asistencia a un taller",
        `${marcando.folio} · ${marcando.nombre} · ${marcando.tallerNombre} del día ${diaMarcar} · motivo: ${motivoMarcar.trim()}`,
      );
      toast.success(`Asistencia marcada — ${marcando.nombre}`);
      setMarcando(null);
      recargar();
    } catch (e) {
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setGuardandoMarcar(false);
    }
  };

  /*
   * La clave sale del MÁXIMO tomado, no de cuántos hay.
   *
   * Contando filas, en cuanto la numeración tiene un hueco —y aquí ya lo tuvo:
   * la migración 45 documenta que T01 a T04 se borraron desde este mismo
   * panel— la clave propuesta choca con una existente. Y con el `upsert` de
   * antes, eso convertía un alta en una SOBREESCRITURA silenciosa: el T12 real,
   * con sus setenta inscritos, se quedaba con el nombre, el ponente y el precio
   * del taller nuevo.
   *
   * Desde la migración 57 un alta es un `insert` y la clave repetida rebota,
   * así que esto ya no puede destruir nada. Pero proponer una clave que se sabe
   * tomada es hacerle perder el tiempo a quien la va a teclear igual.
   */
  const siguienteClave = () => {
    const usadas = talleres
      .map((t) => Number(t.id.replace(/\D/g, "")))
      .filter((n) => Number.isFinite(n));
    return `T${String(Math.max(0, ...usadas) + 1).padStart(2, "0")}`;
  };

  const nuevo = (): TallerBase => {
    // Se nombra el cupo para poder repetirlo en los dos contadores sin escribir
    // el número tres veces: un taller sin nadie dentro tiene libre todo su cupo,
    // y ponerles cero haría que el objeto dijera «lleno».
    const cupoTotal = 25;
    return {
      id: siguienteClave(),
      nombre: "",
      ponente: "",
      descripcion: "",
      dias: [1],
      horario: "10:00 a 13:00 hrs",
      lugar: "",
      salon: "",
      cupoTotal,
      ocupadosPrevios: 0,
      // Un taller que todavía no existe no tiene a nadie dentro. El valor real
      // lo trae `v_talleres` en cuanto se guarda.
      cupoOcupado: 0,
      /*
       * Sin partir, que es el valor seguro para un taller nuevo.
       *
       * `null` significa «un solo cupo para todos», como funcionaron los doce hasta
       * el 2026-09-29. Poner aquí un número reservaría lugares para docentes en un
       * taller del que nadie ha dicho que los tenga; quien los quiera los declara,
       * y entonces la reserva existe a propósito.
       */
      cupoNoDocentes: null,
      libresNoDocentes: cupoTotal,
      libresDocentes: cupoTotal,
      costo: 300,
      activo: true,
    };
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Talleres"
      descripcion="El cupo ocupado se calcula de las inscripciones; no se edita a mano."
      acciones={
        <Button className="h-11" onClick={() => setEditando(nuevo())}>
          <Plus className="size-4" /> Nuevo taller
        </Button>
      }
    >
      {talleres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-semibold">No hay talleres registrados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea el primero con «Nuevo taller». El catálogo público queda vacío hasta entonces.
          </p>
        </div>
      ) : null}

      <ul className="grid gap-2">
        {talleres.map((t) => {
          const libres = t.cupoTotal - t.cupoOcupado;
          const delPrototipo = inscritos(t.id);
          return (
            <li key={t.id} className="rounded-lg border border-border bg-card p-4">
              {/*
               * El texto crece y los controles no.
               *
               * `flex-1` sobre el texto y `shrink-0` sobre los botones, porque
               * los nombres reales llegan a 155 caracteres —«Diseño de proyectos
               * comunitarios de investigación etnomatemática para…»— y sin esto
               * el título empujaba al contador y a los botones al renglón de
               * abajo. `min-w-0` es lo que deja que el título parta en varias
               * líneas en vez de estirar la fila.
               */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{t.id}</span>
                    <span className="text-base font-semibold">{t.nombre}</span>
                    {!t.activo ? (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                        Inactivo
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.ponente} · Día {t.dias.join(" y ")} · {t.horario} · {sitioDelTaller(t)} ·{" "}
                    {moneda(t.costo)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex items-center gap-1 whitespace-nowrap text-sm font-bold",
                      libres <= 0 && "text-estado-cancelado",
                      libres > 0 && libres < 5 && "text-estado-discrepancia",
                    )}
                    title="Cupo ocupado: los pre-registrados a este taller más los inscritos previos"
                  >
                    <Users className="size-4" aria-hidden />
                    {t.cupoOcupado}/{t.cupoTotal}
                  </span>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() =>
                      setEditando({ ...t, ocupadosPrevios: t.cupoOcupado - delPrototipo })
                    }
                  >
                    <Pencil className="size-4" /> Editar
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => setBorrando(t.id)}>
                    <Trash2 className="size-4" />
                    <span className="sr-only">Eliminar {t.id}</span>
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.descripcion}</p>
              {delPrototipo > 0 ? (
                <Button
                  variant="outline"
                  className="mt-2 h-9"
                  onClick={() => {
                    const abriendo = verInscritos !== t.id;
                    setVerInscritos(abriendo ? t.id : null);
                    // El filtro no sobrevive de un taller a otro: dejarlo puesto
                    // haría parecer vacío a T05 solo porque T01 se cerró en
                    // «no asistieron».
                    if (abriendo) setFiltroAsistencia("todos");
                  }}
                >
                  {verInscritos === t.id ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {verInscritos === t.id ? "Ocultar" : "Ver"} inscritos ({delPrototipo})
                </Button>
              ) : null}
              {verInscritos === t.id
                ? (() => {
                    const todos = inscritosDe(t.id);
                    const asistieron = todos.filter(asistioAlTaller);
                    const visibles =
                      filtroAsistencia === "asistio"
                        ? asistieron
                        : filtroAsistencia === "no_asistio"
                          ? todos.filter((p) => !asistioAlTaller(p))
                          : todos;
                    return (
                      <div className="mt-2 rounded-md border border-border bg-muted/30 p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              ["todos", `Todos (${todos.length})`],
                              ["asistio", `Asistieron (${asistieron.length})`],
                              ["no_asistio", `No asistieron (${todos.length - asistieron.length})`],
                            ] as [FiltroAsistenciaTaller, string][]
                          ).map(([valor, texto]) => (
                            <button
                              key={valor}
                              onClick={() => setFiltroAsistencia(valor)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-semibold",
                                filtroAsistencia === valor
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {texto}
                            </button>
                          ))}
                        </div>
                        <ul className="mt-2 grid gap-1">
                          {visibles.map((p) => {
                            const asistio = asistioAlTaller(p);
                            return (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-2 py-1 text-sm"
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {asistio ? (
                                    <CheckCircle2
                                      className="size-3.5 shrink-0 text-estado-pagado"
                                      aria-hidden
                                    />
                                  ) : (
                                    <Circle
                                      className="size-3.5 shrink-0 text-muted-foreground"
                                      aria-hidden
                                    />
                                  )}
                                  <span className="truncate">
                                    {p.nombre}
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                      {p.folio}
                                      {p.matricula ? ` · ${p.matricula}` : ""}
                                    </span>
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <PerfilBadge perfil={p.perfil} />
                                  {!asistio ? (
                                    <Button
                                      variant="outline"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => abrirMarcar(p, t)}
                                    >
                                      Marcar asistencia
                                    </Button>
                                  ) : null}
                                </span>
                              </li>
                            );
                          })}
                          {visibles.length === 0 ? (
                            <li className="px-2 py-1 text-xs text-muted-foreground">
                              Nadie en este filtro.
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    );
                  })()
                : null}
              {/*
               * Los dos orígenes del cupo ocupado, nombrados como lo que son.
               *
               * Decía «inscritos del prototipo» y «fuera del conjunto simulado», que
               * era cierto cuando los participantes eran inventados. Hoy los
               * primeros son gente que se pre-registró y los segundos son
               * invitados y cortesías que no pasan por el sistema; llamarlos
               * «simulados» en un panel en producción hace dudar de si el número
               * de al lado es real.
               */}
              <p className="mt-1 text-xs text-muted-foreground">
                {delPrototipo} pre-registrados · {t.cupoOcupado - delPrototipo} inscritos previos
                (invitados y cortesías)
              </p>
            </li>
          );
        })}
      </ul>

      {editando ? (
        <FormularioTaller
          key={editando.id}
          inicial={editando}
          inscritos={inscritos(editando.id)}
          existe={talleres.some((x) => x.id === editando.id)}
          onCerrar={() => setEditando(null)}
          onGuardar={(t) => {
            const editado = talleres.some((x) => x.id === t.id);
            /*
             * Ya no hay nada que liberar al cambiarle los días a un taller.
             *
             * Hubo dos versiones de esto: una que contaba sin escribir —el
             * mensaje decía un número inventado— y otra que liberaba dentro de
             * `fn_guardar_taller`, porque la llave foránea `(taller_id, dia)`
             * impedía quitar un día que alguien seguía usando. La migración 60
             * quitó la llave: quitarle el día 2 a un taller ya no invalida a
             * nadie, porque sus inscritos no dependían de ese día.
             */
            guardarTaller(t);
            registrarBitacora(
              editado ? "Editó taller" : "Creó taller",
              `${t.id} — ${t.nombre} · cupo ${t.cupoTotal} · ${moneda(t.costo)} · días ${t.dias.join(" y ")}`,
            );
            /*
             * El acuse, que al mover la liberación a la base se quedó sin
             * reponer: la pantalla cerraba el diálogo y no decía nada, así que
             * no había forma de distinguir «guardado» de «no pasó nada».
             *
             * Dice el cupo, porque el cupo es justo lo que se viene a cambiar y
             * lo que conviene poder contrastar con lo que quedó en la lista. Si
             * la base rechaza, `guardarTaller` avisa aparte y con su motivo.
             */
            toast.success(`Taller ${t.id} guardado · cupo ${t.cupoTotal}.`);
            setEditando(null);
          }}
        />
      ) : null}

      <DialogoConfirmar
        abierto={!!borrando}
        alCerrar={() => setBorrando(null)}
        titulo={`¿Eliminar el taller ${borrando}?`}
        descripcion={
          <>
            {borrando && inscritos(borrando) > 0
              ? `Hay ${inscritos(borrando)} participantes inscritos. Quedarán sin taller y su pago de taller no tendrá a qué corresponder.`
              : "Nadie se ha pre-registrado a este taller."}{" "}
            La acción no se puede deshacer desde esta pantalla.
          </>
        }
        confirmar="Sí, eliminar"
        alConfirmar={() => {
          const id = borrando!;
          eliminarTaller(id);
          registrarBitacora("Eliminó taller", id);
          toast.success(`Taller ${id} eliminado.`);
          setBorrando(null);
        }}
      />

      <DialogoConfirmar
        abierto={!!marcando}
        alCerrar={() => setMarcando(null)}
        titulo={<>Marcar asistencia de {marcando?.nombre}</>}
        descripcion={
          <>
            {marcando?.tallerNombre}. Para cuando sí fue pero no pasó por el registro: queda en la
            bitácora con tu nombre y el motivo.
          </>
        }
        confirmar={guardandoMarcar ? "Guardando…" : "Marcar"}
        deshabilitado={
          !diaMarcar || !momentoMarcar || motivoMarcar.trim().length < 10 || guardandoMarcar
        }
        alConfirmar={() => void confirmarMarcar()}
      >
        <div className="grid gap-3">
          {marcando && marcando.dias.length > 1 ? (
            <div>
              <Label htmlFor="dia-marcar">Día del taller</Label>
              <select
                id="dia-marcar"
                value={String(diaMarcar ?? "")}
                onChange={(e) => setDiaMarcar(Number(e.target.value) as Dia)}
                className="mt-1 h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {marcando.dias.map((d) => (
                  <option key={d} value={d}>
                    Día {d}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="momento-marcar">Fecha y hora</Label>
            <Input
              id="momento-marcar"
              type="datetime-local"
              value={momentoMarcar}
              onChange={(e) => setMomentoMarcar(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="motivo-marcar">Motivo</Label>
            <Textarea
              id="motivo-marcar"
              value={motivoMarcar}
              onChange={(e) => setMotivoMarcar(e.target.value)}
              placeholder="Sí asistió al taller; el pase de lista no se capturó ese día."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </DialogoConfirmar>
    </PantallaPanel>
  );
}

function FormularioTaller({
  inicial,
  inscritos,
  existe,
  onCerrar,
  onGuardar,
}: {
  inicial: TallerBase;
  inscritos: number;
  existe: boolean;
  onCerrar: () => void;
  onGuardar: (t: TallerBase) => void;
}) {
  const [b, setB] = useState<TallerBase>(inicial);
  const set = (patch: Partial<TallerBase>) => setB({ ...b, ...patch });

  const ocupado = b.ocupadosPrevios + inscritos;
  // Reducir el cupo por debajo del ocupado deja fuera a gente que ya pagó.
  const cupoInsuficiente = b.cupoTotal < ocupado;
  /*
   * La reserva del docente no se edita: se RESTA. Ver `TallerBase.cupoNoDocentes`.
   *
   * Si se guardaran los tres números —total, tope de alumnos y reserva— se
   * pueden dejar sin cuadrar desde esta misma pantalla, y entonces el aula
   * admite 36. Con dos, la resta no puede contradecirlos.
   */
  const reservaDocentes = b.cupoNoDocentes === null ? null : b.cupoTotal - b.cupoNoDocentes;
  // El tope del alumno no puede pasar del aula: la resta saldría negativa y el
  // guardia de la base admitiría a cualquiera. `chk_cupo_no_docentes` lo repite.
  const topeExcedido = b.cupoNoDocentes !== null && b.cupoNoDocentes > b.cupoTotal;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existe ? `Editar taller ${b.id}` : `Nuevo taller ${b.id}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="t-nombre">Nombre</Label>
            <Input
              id="t-nombre"
              value={b.nombre}
              onChange={(e) => set({ nombre: e.target.value })}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="t-ponente">Ponente</Label>
            <Input
              id="t-ponente"
              value={b.ponente}
              onChange={(e) => set({ ponente: e.target.value })}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="t-desc">Descripción</Label>
            <Textarea
              id="t-desc"
              value={b.descripcion}
              onChange={(e) => set({ descripcion: e.target.value })}
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Días</Label>
            <div className="mt-1 flex gap-2">
              {([1, 2, 3] as Dia[]).map((d) => (
                <label
                  key={d}
                  className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border"
                >
                  <Checkbox
                    checked={b.dias.includes(d)}
                    onCheckedChange={(v) =>
                      set({
                        dias: v ? ([...b.dias, d].sort() as Dia[]) : b.dias.filter((x) => x !== d),
                      })
                    }
                  />
                  Día {d}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="t-horario">Horario</Label>
              <Input
                id="t-horario"
                value={b.horario}
                onChange={(e) => set({ horario: e.target.value })}
                className="mt-1 h-11"
              />
            </div>
            <div>
              <Label htmlFor="t-lugar">Lugar</Label>
              <Input
                id="t-lugar"
                value={b.lugar}
                onChange={(e) => set({ lugar: e.target.value })}
                className="mt-1 h-11"
              />
            </div>
            {/*
             * El salón se edita aquí, y esa es la razón de que sea columna.
             *
             * El aula es lo que se mueve a última hora —un taller que crece, un
             * proyector que no sirve— y cambiarla tiene que costar diez segundos
             * desde esta pantalla, no una migración y un despliegue.
             *
             * La ayuda dice el formato con un ejemplo de cada clase: los que
             * llevan la palabra «Aula» y los que no la llevan porque no son
             * aulas. Se guarda tal cual se escribe: las pantallas lo imprimen
             * sin anteponerle nada, así que un «B1» suelto saldría «B1».
             */}
            <div>
              <Label htmlFor="t-salon">Salón</Label>
              <Input
                id="t-salon"
                value={b.salon}
                onChange={(e) => set({ salon: e.target.value })}
                placeholder="Aula B1"
                className="mt-1 h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Como se va a leer: «Aula B1», «Centro de cómputo». Vacío si todavía no se reparte.
              </p>
            </div>
            <div>
              <Label htmlFor="t-cupo">Cupo total</Label>
              <CampoNumero
                id="t-cupo"
                min={1}
                valor={b.cupoTotal}
                alCambiar={(cupoTotal) => set({ cupoTotal })}
                className="mt-1 h-11"
                aria-invalid={cupoInsuficiente}
              />
            </div>
            {/*
             * El tope de alumnos y externos, que es lo que hace la reserva.
             *
             * Vacío significa «sin partir»: un solo cupo para todos, como los doce
             * talleres hasta el 2026-09-29 y como siguen T04 y T12. Se deja vacío
             * y no en cero a propósito: cero querría decir «ningún alumno», que es
             * otra cosa y no es lo que nadie quiere pedir aquí.
             */}
            <div>
              <Label htmlFor="t-tope">Tope de alumnos</Label>
              <Input
                id="t-tope"
                inputMode="numeric"
                value={b.cupoNoDocentes === null ? "" : String(b.cupoNoDocentes)}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  set({ cupoNoDocentes: v === "" ? null : Number(v) });
                }}
                placeholder="sin partir"
                className="mt-1 h-11"
                aria-invalid={topeExcedido}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {b.cupoNoDocentes === null
                  ? "Vacío: un solo cupo para todos, sin lugares reservados."
                  : reservaDocentes === 0
                    ? "Reserva de 0: este taller es solo para alumnos."
                    : `Deja ${reservaDocentes} ${reservaDocentes === 1 ? "lugar" : "lugares"} reservados solo para docentes. El externo cuenta dentro del tope.`}
              </p>
            </div>
            <div>
              <Label htmlFor="t-costo">Costo</Label>
              <CampoNumero
                id="t-costo"
                min={0}
                valor={b.costo}
                alCambiar={(costo) => set({ costo })}
                className="mt-1 h-11"
              />
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold">Cupo ocupado: {ocupado}</p>
            <p className="text-muted-foreground">
              {inscritos} pre-registrados más {b.ocupadosPrevios} inscritos previos. Es un valor
              derivado: no se edita aquí.
            </p>
          </div>

          {topeExcedido ? (
            <p className="flex items-start gap-2 rounded-md border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg p-3 text-sm text-estado-discrepancia">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-bold">
                  El tope de alumnos ({b.cupoNoDocentes}) no puede pasar del cupo del aula (
                  {b.cupoTotal}).
                </span>{" "}
                La reserva del docente sale de la resta, y en negativo la base rechaza guardar.
              </span>
            </p>
          ) : null}

          {cupoInsuficiente ? (
            <p className="flex items-start gap-2 rounded-md border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg p-3 text-sm text-estado-discrepancia">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-bold">
                  El cupo quedaría por debajo de los {ocupado} ya inscritos.
                </span>{" "}
                Eso deja fuera a {ocupado - b.cupoTotal} personas que ya pagaron. Súbelo o resuelve
                antes las inscripciones.
              </span>
            </p>
          ) : null}

          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-3">
            <Checkbox checked={b.activo} onCheckedChange={(v) => set({ activo: !!v })} />
            <span className="text-sm font-medium">Activo — visible en el catálogo público</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              className="h-11"
              disabled={cupoInsuficiente || topeExcedido || !b.nombre.trim() || b.dias.length === 0}
              onClick={() => onGuardar(b)}
            >
              Guardar taller
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
