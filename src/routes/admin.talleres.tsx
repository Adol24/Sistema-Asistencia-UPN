import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useEstadoEvento } from "@/lib/estado-evento";
import { moneda } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia, TallerBase } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/talleres")({
  head: () =>
    meta(
      "Talleres — Administración del Encuentro",
      "Alta, edición y baja de los talleres del Encuentro, con cupo ocupado derivado de las inscripciones.",
    ),
  component: AdminTalleres,
});

function AdminTalleres() {
  const {
    participantes,
    talleres,
    guardarTaller,
    liberarInscripcionesFueraDeDia,
    eliminarTaller,
    registrarBitacora,
  } = useEstadoEvento();
  const [editando, setEditando] = useState<TallerBase | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const inscritos = (id: string) => participantes.filter((p) => p.tallerId === id).length;

  const nuevo = (): TallerBase => ({
    id: `T${String(talleres.length + 1).padStart(2, "0")}`,
    nombre: "",
    ponente: "",
    descripcion: "",
    dias: [1],
    horario: "10:00 a 13:00 hrs",
    lugar: "",
    cupoTotal: 25,
    ocupadosPrevios: 0,
    costo: 300,
    activo: true,
  });

  return (
    <PantallaPanel
      area="admin"
      titulo="Talleres"
      descripcion="El cupo ocupado se calcula de las inscripciones; no se edita a mano."
      nav={navAdmin}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
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
                    {t.ponente} · Día {t.dias.join(" y ")} · {t.horario} · {t.lugar} ·{" "}
                    {moneda(t.costo)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex items-center gap-1 text-sm font-bold",
                      libres <= 0 && "text-estado-cancelado",
                      libres > 0 && libres < 5 && "text-estado-discrepancia",
                    )}
                    title="Cupo ocupado: inscritos previos más los del prototipo"
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
              <p className="mt-1 text-xs text-muted-foreground">
                {delPrototipo} inscritos del prototipo · {t.cupoOcupado - delPrototipo} inscritos
                fuera del conjunto simulado
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
          inscritosDetalle={participantes
            .filter((p) => p.tallerId === editando.id)
            .map((p) => ({ folio: p.folio, nombre: p.nombre, dia: p.dia }))}
          existe={talleres.some((x) => x.id === editando.id)}
          onCerrar={() => setEditando(null)}
          onGuardar={(t, liberar) => {
            const editado = talleres.some((x) => x.id === t.id);
            guardarTaller(t);
            // El guardado va primero: liberar mira los días ya nuevos.
            const liberados = liberar ? liberarInscripcionesFueraDeDia(t.id) : 0;
            registrarBitacora(
              editado ? "Editó taller" : "Creó taller",
              `${t.id} — ${t.nombre} · cupo ${t.cupoTotal} · ${moneda(t.costo)} · días ${t.dias.join(" y ")}${
                liberados ? ` · ${liberados} inscripciones liberadas` : ""
              }`,
            );
            toast.success(
              liberados
                ? `Taller ${t.id} guardado. Se liberaron ${liberados} inscripciones que quedaban fuera de sus días.`
                : `Taller ${t.id} guardado.`,
            );
            setEditando(null);
          }}
        />
      ) : null}

      <AlertDialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el taller {borrando}?</AlertDialogTitle>
            <AlertDialogDescription>
              {borrando && inscritos(borrando) > 0
                ? `Hay ${inscritos(borrando)} participantes inscritos. Quedarán sin taller y su pago de taller no tendrá a qué corresponder.`
                : "No hay participantes del prototipo inscritos en este taller."}{" "}
              La acción no se puede deshacer desde esta pantalla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = borrando!;
                eliminarTaller(id);
                registrarBitacora("Eliminó taller", id);
                toast.success(`Taller ${id} eliminado.`);
                setBorrando(null);
              }}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PantallaPanel>
  );
}

function FormularioTaller({
  inicial,
  inscritos,
  inscritosDetalle,
  existe,
  onCerrar,
  onGuardar,
}: {
  inicial: TallerBase;
  inscritos: number;
  inscritosDetalle: { folio: string; nombre: string; dia: Dia }[];
  existe: boolean;
  onCerrar: () => void;
  onGuardar: (t: TallerBase, liberar: boolean) => void;
}) {
  const [b, setB] = useState<TallerBase>(inicial);
  const [liberar, setLiberar] = useState(true);
  const set = (patch: Partial<TallerBase>) => setB({ ...b, ...patch });

  const ocupado = b.ocupadosPrevios + inscritos;
  // Reducir el cupo por debajo del ocupado deja fuera a gente que ya pagó.
  const cupoInsuficiente = b.cupoTotal < ocupado;
  // Quitar un día puede dejar inscritos en días que ya no se imparten.
  const fueraDeDia = inscritosDetalle.filter((p) => !b.dias.includes(p.dia));

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
            <div>
              <Label htmlFor="t-cupo">Cupo total</Label>
              <Input
                id="t-cupo"
                type="number"
                min={1}
                value={b.cupoTotal}
                onChange={(e) => set({ cupoTotal: Number(e.target.value) })}
                className="mt-1 h-11"
                aria-invalid={cupoInsuficiente}
              />
            </div>
            <div>
              <Label htmlFor="t-costo">Costo</Label>
              <Input
                id="t-costo"
                type="number"
                min={0}
                value={b.costo}
                onChange={(e) => set({ costo: Number(e.target.value) })}
                className="mt-1 h-11"
              />
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold">Cupo ocupado: {ocupado}</p>
            <p className="text-muted-foreground">
              {inscritos} inscritos del prototipo más {b.ocupadosPrevios} previos. Es un valor
              derivado: no se edita aquí.
            </p>
          </div>

          {fueraDeDia.length > 0 ? (
            <div className="rounded-md border-2 border-estado-cancelado/40 bg-estado-cancelado-bg p-3">
              <p className="flex items-start gap-2 text-sm font-bold text-estado-cancelado">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {fueraDeDia.length}{" "}
                {fueraDeDia.length === 1 ? "inscrito quedaría" : "inscritos quedarían"} en un día
                que este taller ya no se imparte
              </p>
              <ul className="mt-2 grid gap-0.5 text-xs text-estado-cancelado">
                {fueraDeDia.slice(0, 5).map((p) => (
                  <li key={p.folio}>
                    {p.folio} · {p.nombre} · asiste el día {p.dia}
                  </li>
                ))}
                {fueraDeDia.length > 5 ? <li>… y {fueraDeDia.length - 5} más</li> : null}
              </ul>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md bg-card p-2 text-sm">
                <Checkbox
                  checked={liberar}
                  onCheckedChange={(v) => setLiberar(!!v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Liberar esas inscripciones al guardar.</span> Si
                  no lo haces, quedarán apuntando a un taller que no se imparte su día. Quien ya
                  pagó el taller necesitará devolución o reinscripción en uno de su día.
                </span>
              </label>
            </div>
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
              disabled={cupoInsuficiente || !b.nombre.trim() || b.dias.length === 0}
              onClick={() => onGuardar(b, liberar && fueraDeDia.length > 0)}
            >
              Guardar taller
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
