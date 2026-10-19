import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LogIn, LogOut, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Buscador } from "@/components/buscador";
import { EstadoVacio, Tarjeta } from "@/components/tipografia";
import { PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { AnularAsistenciaDialogo, type AsistenciaParaAnular } from "@/components/anular-asistencia";
import { useEstadoEvento } from "@/lib/estado-evento";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { movimientosDe } from "@/lib/escaneo";
import { diaRealDeHoy, isoAMomentoLocal, momentoLocalAIso } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { Asistencia, Dia, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/asistencias")({
  head: () =>
    meta(
      "Asistencias — Administración del Encuentro",
      "Entrada, salida y reintegro de cada alumno, día por día. Anular deja que su siguiente escaneo se trate como el primero.",
    ),
  component: Asistencias,
});

const DIAS: Dia[] = [1, 2, 3];

/** La etiqueta de un movimiento, por su posición y su tipo. Ver `movimientosDe`. */
function etiquetaDe(indice: number, m: Asistencia): { texto: string; icono: typeof LogIn } {
  if (indice === 0) return { texto: "Entrada", icono: LogIn };
  if (m.tipo === "salida") return { texto: "Salida", icono: LogOut };
  return { texto: "Reintegro", icono: RotateCcw };
}

/** Lo que hace falta para corregir la hora de un movimiento ya escrito. */
interface CorrigiendoInfo {
  id: string;
  tipo: string;
  nombre: string;
  folio: string;
  dia: number;
  hora: string;
  ts?: number | undefined;
}

/** Lo que hace falta para agregar una entrada o salida que nunca llegó a la base. */
interface AgregandoPuertaInfo {
  participanteId: string;
  folio: string;
  nombre: string;
  dia: Dia;
}

/** Lo que hace falta para agregar el pase de lista de un taller. */
interface AgregandoTallerInfo {
  participanteId: string;
  folio: string;
  nombre: string;
  tallerId: string;
  tallerNombre: string;
  dias: Dia[];
}

function Asistencias() {
  const {
    participantes,
    asistencias,
    configuracion,
    anularAsistencia,
    registrarBitacora,
    getTaller,
    recargar,
  } = useEstadoEvento();
  const [q, setQ] = useState("");
  const [anulando, setAnulando] = useState<AsistenciaParaAnular | null>(null);
  const [motivoAnular, setMotivoAnular] = useState("");

  const [corrigiendo, setCorrigiendo] = useState<CorrigiendoInfo | null>(null);
  const [momentoCorreccion, setMomentoCorreccion] = useState("");
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);

  const [agregandoPuerta, setAgregandoPuerta] = useState<AgregandoPuertaInfo | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState<"entrada" | "salida">("entrada");
  const [momentoNuevo, setMomentoNuevo] = useState("");
  const [motivoNuevo, setMotivoNuevo] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [agregandoTaller, setAgregandoTaller] = useState<AgregandoTallerInfo | null>(null);
  const [diaTallerNuevo, setDiaTallerNuevo] = useState<Dia | null>(null);
  const [momentoTaller, setMomentoTaller] = useState("");
  const [motivoTaller, setMotivoTaller] = useState("");
  const [guardandoTaller, setGuardandoTaller] = useState(false);

  /*
   * El día que de verdad está corriendo, no el asignado a nadie.
   *
   * Anular es irreversible para efectos prácticos —el siguiente escaneo de esa
   * persona se trata como si fuera el primero del día—, así que solo tiene
   * sentido ofrecerlo sobre el día que está en curso. Reescribir un día ya
   * cerrado desde aquí sería tocar historia que el torniquete ya no puede
   * volver a comprobar contra nada.
   *
   * Corregir la hora o agregar un movimiento que falta es distinto: sirve
   * justo para reponer un día que ya pasó, así que esos dos SÍ funcionan
   * sobre cualquier día, no solo sobre `hoy`.
   */
  const hoy = diaRealDeHoy(configuracion.dias);

  const encontrados = useMemo(() => buscarEnParticipantes(participantes, q), [participantes, q]);

  const abrirAnular = (a: Asistencia) => {
    setAnulando(a);
    setMotivoAnular("");
  };

  const abrirCorregir = (p: Participante, a: Asistencia) => {
    setCorrigiendo({
      id: a.id,
      tipo: a.tipo,
      nombre: p.nombre,
      folio: p.folio,
      dia: a.dia,
      hora: a.hora,
      ts: a.ts,
    });
    setMomentoCorreccion(isoAMomentoLocal(new Date(a.ts ?? Date.now()).toISOString()));
    setMotivoCorreccion("");
  };

  const confirmarCorregir = async () => {
    if (!corrigiendo || guardandoCorreccion) return;
    setGuardandoCorreccion(true);
    try {
      const { corregirHoraAsistenciaRemota } = await import("@/lib/datos");
      const nuevaIso = momentoLocalAIso(momentoCorreccion);
      await corregirHoraAsistenciaRemota(corrigiendo.id, nuevaIso, motivoCorreccion.trim());
      registrarBitacora(
        "Corrigió la hora de una asistencia",
        `${corrigiendo.folio} · ${corrigiendo.nombre} · ${corrigiendo.tipo} del día ${corrigiendo.dia}: de las ${corrigiendo.hora} a ${isoAMomentoLocal(nuevaIso).replace("T", " ")} · motivo: ${motivoCorreccion.trim()}`,
      );
      toast.success(`Hora corregida — ${corrigiendo.nombre}`);
      setCorrigiendo(null);
      recargar();
    } catch (e) {
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  const abrirAgregarPuerta = (p: Participante, dia: Dia, ultimoMovimiento?: Asistencia) => {
    setAgregandoPuerta({ participanteId: p.id, folio: p.folio, nombre: p.nombre, dia });
    // La dirección alterna siempre: si lo último fue una entrada, lo que
    // falta es su salida, y viceversa. Sin movimientos todavía, es la
    // primera entrada del día.
    setTipoNuevo(ultimoMovimiento?.tipo === "entrada" ? "salida" : "entrada");
    setMomentoNuevo(isoAMomentoLocal(new Date().toISOString()));
    setMotivoNuevo("");
  };

  const confirmarAgregarPuerta = async () => {
    if (!agregandoPuerta || guardandoNuevo) return;
    setGuardandoNuevo(true);
    try {
      const { agregarAsistenciaRemota } = await import("@/lib/datos");
      await agregarAsistenciaRemota({
        participanteId: agregandoPuerta.participanteId,
        dia: agregandoPuerta.dia,
        tipo: tipoNuevo,
        horaIso: momentoLocalAIso(momentoNuevo),
        motivo: motivoNuevo.trim(),
      });
      registrarBitacora(
        "Agregó una asistencia a mano",
        `${agregandoPuerta.folio} · ${agregandoPuerta.nombre} · ${tipoNuevo} del día ${agregandoPuerta.dia} · motivo: ${motivoNuevo.trim()}`,
      );
      toast.success(`Asistencia agregada — ${agregandoPuerta.nombre}`);
      setAgregandoPuerta(null);
      recargar();
    } catch (e) {
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setGuardandoNuevo(false);
    }
  };

  const abrirAgregarTaller = (p: Participante) => {
    if (!p.tallerId) return;
    const t = getTaller(p.tallerId);
    const dias = t?.dias ?? [];
    setAgregandoTaller({
      participanteId: p.id,
      folio: p.folio,
      nombre: p.nombre,
      tallerId: p.tallerId,
      tallerNombre: t?.nombre ?? p.tallerId,
      dias,
    });
    setDiaTallerNuevo(dias[0] ?? null);
    setMomentoTaller(isoAMomentoLocal(new Date().toISOString()));
    setMotivoTaller("");
  };

  const confirmarAgregarTaller = async () => {
    if (!agregandoTaller || !diaTallerNuevo || guardandoTaller) return;
    setGuardandoTaller(true);
    try {
      const { agregarAsistenciaRemota } = await import("@/lib/datos");
      await agregarAsistenciaRemota({
        participanteId: agregandoTaller.participanteId,
        dia: diaTallerNuevo,
        tipo: "taller",
        horaIso: momentoLocalAIso(momentoTaller),
        motivo: motivoTaller.trim(),
        tallerId: agregandoTaller.tallerId,
      });
      registrarBitacora(
        "Agregó un pase de taller a mano",
        `${agregandoTaller.folio} · ${agregandoTaller.nombre} · ${agregandoTaller.tallerNombre} del día ${diaTallerNuevo} · motivo: ${motivoTaller.trim()}`,
      );
      toast.success(`Pase de taller agregado — ${agregandoTaller.nombre}`);
      setAgregandoTaller(null);
      recargar();
    } catch (e) {
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setGuardandoTaller(false);
    }
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Asistencias"
      descripcion="Entrada, salida y reintegro de cada alumno, día por día."
    >
      <Buscador
        className="max-w-md"
        valor={q}
        alCambiar={setQ}
        marcador="Nombre, folio o matrícula"
        etiqueta="Buscar un participante"
      />

      {hoy === null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Hoy no es ninguno de los tres días del evento: por ahora no se puede anular nada. Corregir
          una hora o agregar un movimiento que falta sigue funcionando sobre cualquier día.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {q.trim() === "" ? (
          <EstadoVacio icono={<Search className="size-8" aria-hidden />} titulo="Busca a alguien">
            Escribe un nombre, folio o matrícula para ver su historial.
          </EstadoVacio>
        ) : encontrados.length === 0 ? (
          <EstadoVacio icono={<Search className="size-8" aria-hidden />} titulo="Nadie coincide">
            Prueba con otro nombre, folio o matrícula.
          </EstadoVacio>
        ) : (
          encontrados.map((p) => (
            <FichaDeAsistencia
              key={p.id}
              p={p}
              asistencias={asistencias}
              hoy={hoy}
              dias={configuracion.dias}
              getTaller={getTaller}
              onAnular={abrirAnular}
              onCorregir={abrirCorregir}
              onAgregarPuerta={abrirAgregarPuerta}
              onAgregarTaller={abrirAgregarTaller}
            />
          ))
        )}
      </div>

      <AnularAsistenciaDialogo
        anulando={anulando}
        motivo={motivoAnular}
        onMotivo={setMotivoAnular}
        onCerrar={() => setAnulando(null)}
        onConfirmar={() => {
          if (!anulando) return;
          anularAsistencia(anulando.id, motivoAnular.trim());
          toast.success(`Anulada la ${anulando.tipo} de ${anulando.nombre}.`);
          setAnulando(null);
        }}
      />

      <DialogoConfirmar
        abierto={!!corrigiendo}
        alCerrar={() => setCorrigiendo(null)}
        titulo={
          <>
            Corregir la hora de {corrigiendo?.tipo} de {corrigiendo?.nombre}
          </>
        }
        descripcion={
          <>
            Del día {corrigiendo?.dia}, hoy registrada a las {corrigiendo?.hora}. El cambio queda en
            la bitácora con tu nombre y el motivo.
          </>
        }
        confirmar={guardandoCorreccion ? "Guardando…" : "Guardar"}
        deshabilitado={
          !momentoCorreccion || motivoCorreccion.trim().length < 10 || guardandoCorreccion
        }
        alConfirmar={() => void confirmarCorregir()}
      >
        <div className="grid gap-3">
          <div>
            <Label htmlFor="momento-correccion">Fecha y hora correctas</Label>
            <Input
              id="momento-correccion"
              type="datetime-local"
              value={momentoCorreccion}
              onChange={(e) => setMomentoCorreccion(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="motivo-correccion">Motivo</Label>
            <Textarea
              id="motivo-correccion"
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              placeholder="El escaneo real fue a las 8:10; quedó mal capturado por la app."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </DialogoConfirmar>

      <DialogoConfirmar
        abierto={!!agregandoPuerta}
        alCerrar={() => setAgregandoPuerta(null)}
        titulo={<>Agregar un movimiento de {agregandoPuerta?.nombre}</>}
        descripcion={
          <>
            Del día {agregandoPuerta?.dia}. Salta la regla de «solo hoy registra asistencia»: por
            eso el motivo es obligatorio y queda en la bitácora.
          </>
        }
        confirmar={guardandoNuevo ? "Guardando…" : "Agregar"}
        deshabilitado={!momentoNuevo || motivoNuevo.trim().length < 10 || guardandoNuevo}
        alConfirmar={() => void confirmarAgregarPuerta()}
      >
        <div className="grid gap-3">
          <div>
            <Label htmlFor="tipo-nuevo">Movimiento</Label>
            <select
              id="tipo-nuevo"
              value={tipoNuevo}
              onChange={(e) => setTipoNuevo(e.target.value as "entrada" | "salida")}
              className="mt-1 h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div>
            <Label htmlFor="momento-nuevo">Fecha y hora</Label>
            <Input
              id="momento-nuevo"
              type="datetime-local"
              value={momentoNuevo}
              onChange={(e) => setMomentoNuevo(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="motivo-nuevo">Motivo</Label>
            <Textarea
              id="motivo-nuevo"
              value={motivoNuevo}
              onChange={(e) => setMotivoNuevo(e.target.value)}
              placeholder="Entró por la puerta de SUTERM; el escáner se quedó sin batería y nunca se guardó."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </DialogoConfirmar>

      <DialogoConfirmar
        abierto={!!agregandoTaller}
        alCerrar={() => setAgregandoTaller(null)}
        titulo={<>Agregar el pase de taller de {agregandoTaller?.nombre}</>}
        descripcion={<>{agregandoTaller?.tallerNombre}. El motivo queda en la bitácora.</>}
        confirmar={guardandoTaller ? "Guardando…" : "Agregar"}
        deshabilitado={
          !diaTallerNuevo || !momentoTaller || motivoTaller.trim().length < 10 || guardandoTaller
        }
        alConfirmar={() => void confirmarAgregarTaller()}
      >
        <div className="grid gap-3">
          {agregandoTaller && agregandoTaller.dias.length > 1 ? (
            <div>
              <Label htmlFor="dia-taller-nuevo">Día del taller</Label>
              <select
                id="dia-taller-nuevo"
                value={String(diaTallerNuevo ?? "")}
                onChange={(e) => setDiaTallerNuevo(Number(e.target.value) as Dia)}
                className="mt-1 h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {agregandoTaller.dias.map((d) => (
                  <option key={d} value={d}>
                    Día {d}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="momento-taller">Fecha y hora</Label>
            <Input
              id="momento-taller"
              type="datetime-local"
              value={momentoTaller}
              onChange={(e) => setMomentoTaller(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="motivo-taller">Motivo</Label>
            <Textarea
              id="motivo-taller"
              value={motivoTaller}
              onChange={(e) => setMotivoTaller(e.target.value)}
              placeholder="El pase de lista en papel lo tiene; nunca se capturó en la app del taller."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </DialogoConfirmar>
    </PantallaPanel>
  );
}

/** El historial de una persona, los tres días y su taller si tiene. */
function FichaDeAsistencia({
  p,
  asistencias,
  hoy,
  dias,
  getTaller,
  onAnular,
  onCorregir,
  onAgregarPuerta,
  onAgregarTaller,
}: {
  p: Participante;
  asistencias: Asistencia[];
  hoy: Dia | null;
  dias: { dia: Dia; etiqueta: string; fecha: string }[];
  getTaller: (id?: string) => { nombre: string; dias: Dia[] } | undefined;
  onAnular: (a: Asistencia) => void;
  onCorregir: (p: Participante, a: Asistencia) => void;
  onAgregarPuerta: (p: Participante, dia: Dia, ultimoMovimiento?: Asistencia) => void;
  onAgregarTaller: (p: Participante) => void;
}) {
  const taller = p.tallerId ? getTaller(p.tallerId) : undefined;
  const paseDeTaller = asistencias.find((a) => a.folio === p.folio && a.tipo === "taller");

  return (
    <Tarjeta padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{p.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {p.folio}
            {p.matricula ? ` · ${p.matricula}` : ""}
          </p>
        </div>
        <PerfilBadge perfil={p.perfil} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {DIAS.map((dia) => {
          const info = dias.find((d) => d.dia === dia);
          const movs = movimientosDe(asistencias, p.folio, dia);
          return (
            <div key={dia} className="rounded-md border border-border p-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {info?.etiqueta ?? `Día ${dia}`}
              </p>
              {movs.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Sin movimientos</p>
              ) : (
                <ul className="mt-1 grid gap-1">
                  {movs.map((m, i) => {
                    const { texto, icono: Icono } = etiquetaDe(i, m);
                    const puedeAnular = dia === hoy;
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <Icono className="size-3.5 text-muted-foreground" aria-hidden />
                          {texto} {m.hora}
                        </span>
                        <span className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => onCorregir(p, m)}
                            title="Corregir la hora"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {puedeAnular ? (
                            <Button
                              variant="outline"
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => onAnular(m)}
                              title="Anular"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button
                variant="outline"
                className="mt-2 h-7 w-full px-2 text-xs"
                onClick={() => onAgregarPuerta(p, dia, movs[movs.length - 1])}
              >
                <Plus className="size-3.5" aria-hidden /> Agregar movimiento
              </Button>
            </div>
          );
        })}
      </div>

      {p.tallerId ? (
        <div className="mt-3 rounded-md border border-dashed border-border p-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Taller{taller ? ` — ${taller.nombre}` : ""}
          </p>
          {paseDeTaller ? (
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span>
                Día {paseDeTaller.dia} · {paseDeTaller.hora}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  variant="outline"
                  className="h-7 px-2"
                  onClick={() => onCorregir(p, paseDeTaller)}
                  title="Corregir la hora"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
                {hoy !== null ? (
                  <Button
                    variant="outline"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => onAnular(paseDeTaller)}
                    title="Anular"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Sin pase de lista</span>
              <Button variant="outline" className="h-7 px-2" onClick={() => onAgregarTaller(p)}>
                <Plus className="size-3.5" aria-hidden /> Agregar
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Tarjeta>
  );
}
