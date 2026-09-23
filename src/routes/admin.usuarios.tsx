import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Info, Pencil, Plus, ShieldCheck, UserCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Tabla } from "@/components/tabla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { ETIQUETA_ROL } from "@/lib/roles";
import { useEstadoEvento } from "@/lib/estado-evento";
import { useSesion } from "@/lib/sesion";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { RolInterno, UsuarioInterno } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/usuarios")({
  head: () =>
    meta(
      "Usuarios y roles — Administración del Encuentro",
      "Alta, baja y asignación de los cinco roles internos, con el detalle de qué puede hacer cada uno.",
    ),
  component: AdminUsuarios,
});

/**
 * Qué concede cada rol. Se muestra junto al selector porque quien asigna
 * permisos necesita saber qué está entregando: «capturista» no dice nada por sí
 * solo, «puede registrar asistencia y deshacer el último escaneo» sí.
 */
const PERMISOS: Record<RolInterno, string[]> = {
  administrador: [
    "Ver el dashboard y el monitoreo en vivo",
    "Editar talleres y la configuración del evento",
    "Importar el padrón y gestionar usuarios",
    "Ver la bitácora y exportar reportes",
  ],
  servicios_financieros: [
    "Buscar participantes y ver su ficha",
    "Registrar pagos de evento y taller",
    "Aplicar cargas masivas de pagos",
    "Ver la conciliación y exportarla",
  ],
  capturista: [
    "Abrir sesión de captura y escanear asistencia",
    "Cambiar de modo entrada o taller",
    "Pasar lista en talleres",
    "Deshacer el último escaneo de su sesión",
  ],
  revisor_evidencias: [
    "Ver la cola de evidencias que le toca",
    "Aprobar y rechazar con motivo",
    "Deshacer su última decisión",
    "Consultar los criterios de aprobación",
  ],
  soporte: [
    "Ver y atender la bandeja de casos",
    "Cambiar el estado de un caso",
    "Resolver casos de nombre en revisión, lo que quita la marca del listado de elegibles",
  ],
};

const ROLES = Object.keys(PERMISOS) as RolInterno[];

function AdminUsuarios() {
  const { usuarios, guardarUsuario, registrarBitacora } = useEstadoEvento();
  const { persona } = useSesion();

  /*
   * Los dos candados que faltaban en esta pantalla.
   *
   * `usuarios_admin` es la ÚNICA política que permite escribir en
   * `usuarios_internos`, y exige rol `admin`. Así que el único administrador
   * activo podía cambiarse el rol a «Capturista» para ver qué se ve desde ahí,
   * o darse de baja por error, y el cambio llegaba a la base sin problema —es
   * un `update` sobre una fila que existe—. A partir de ese momento nadie podía
   * entrar a `/admin`, nadie podía editar `usuarios_internos`, y no había forma
   * de revertirlo sin abrir el editor SQL de Supabase.
   *
   * Se comprueban aquí, en la pantalla, porque la decisión es de la pantalla:
   * la base no puede saber que un `update` legítimo es el que deja el sistema
   * sin dueño. Lo ideal sería además un disparador; esto cierra el camino real.
   */
  const administradoresActivos = usuarios.filter(
    (u) => u.rol === "administrador" && u.activo,
  ).length;

  /** Lo que impide tocar a este usuario, o cadena vacía si se puede. */
  const bloqueo = (u: UsuarioInterno, quitandoleElMando: boolean): string => {
    if (persona && u.id === persona.id)
      return "No puedes cambiar tu propio rol ni darte de baja: pídeselo a otra persona de administración.";
    if (quitandoleElMando && u.rol === "administrador" && u.activo && administradoresActivos <= 1)
      return "Es el único administrador activo. Sin él nadie podría volver a entrar a esta pantalla.";
    return "";
  };
  const [editando, setEditando] = useState<UsuarioInterno | null>(null);
  const [borrando, setBorrando] = useState<UsuarioInterno | null>(null);
  const [rolMostrado, setRolMostrado] = useState<RolInterno>("administrador");

  const nuevo = (): UsuarioInterno => ({
    id: `U${String(usuarios.length + 1).padStart(2, "0")}`,
    nombre: "",
    correo: "",
    rol: "capturista",
    activo: true,
    ultimoAcceso: "—",
  });

  return (
    <PantallaPanel
      area="admin"
      titulo="Usuarios y roles"
      acciones={
        <Button className="h-11" onClick={() => setEditando(nuevo())}>
          <Plus className="size-4" /> Nuevo usuario
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Tabla
          anchoMinimo="42rem"
          columnas={["Usuario", "Correo", "Rol", "Estado", "Último acceso", ""]}
          vacio={
            usuarios.length === 0 ? (
              <>
                <p className="text-sm font-semibold">No hay usuarios internos</p>
                <p className="text-sm text-muted-foreground">
                  Crea el primero con «Nuevo usuario».
                </p>
              </>
            ) : null
          }
        >
          {usuarios.map((u) => (
            <Fila key={u.id}>
              <td className="px-3 py-2 font-medium">{u.nombre}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{u.correo}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => setRolMostrado(u.rol)}
                  className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold hover:bg-muted"
                  title="Ver qué puede hacer este rol"
                >
                  {ETIQUETA_ROL[u.rol]}
                </button>
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-bold",
                    u.activo
                      ? "bg-estado-pagado-bg text-estado-pagado"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {u.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{u.ultimoAcceso}</td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button variant="outline" className="h-9" onClick={() => setEditando(u)}>
                    <Pencil className="size-4" />
                    <span className="sr-only">Editar {u.nombre}</span>
                  </Button>
                  <Button variant="outline" className="h-9" onClick={() => setBorrando(u)}>
                    {u.activo ? <UserMinus className="size-4" /> : <UserCheck className="size-4" />}
                    <span className="sr-only">
                      {u.activo ? "Dar de baja" : "Reactivar"} {u.nombre}
                    </span>
                  </Button>
                </div>
              </td>
            </Fila>
          ))}
        </Tabla>

        <aside className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-primary" aria-hidden /> Qué puede hacer cada rol
          </h2>
          <div className="mt-3 grid gap-1">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRolMostrado(r)}
                aria-pressed={rolMostrado === r}
                className={cn(
                  "flex min-h-10 items-center justify-between rounded-md border px-3 text-sm font-medium",
                  rolMostrado === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {ETIQUETA_ROL[r]}
                <span className="text-xs opacity-70">
                  {usuarios.filter((u) => u.rol === r).length}
                </span>
              </button>
            ))}
          </div>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm text-muted-foreground">
            {PERMISOS[rolMostrado].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </aside>
      </div>

      {editando ? (
        <FormularioUsuario
          key={editando.id}
          inicial={editando}
          existe={usuarios.some((u) => u.id === editando.id)}
          onCerrar={() => setEditando(null)}
          onGuardar={(crudo) => {
            // Se convierte al guardar, no al teclear: ver `CAMPO_MAYUSCULAS`.
            const u = { ...crudo, nombre: crudo.nombre.trim().toUpperCase() };
            const editado = usuarios.some((x) => x.id === u.id);
            /*
             * Quitarle el mando se comprueba sobre lo que había, no sobre lo
             * que se acaba de teclear: lo que importa es si esta edición DEJA de
             * haber administradores, y eso solo ocurre si el de antes lo era y
             * el de ahora ya no —por cambio de rol o por desactivación—.
             */
            const antes = usuarios.find((x) => x.id === u.id);
            const pierdeElMando =
              !!antes &&
              antes.rol === "administrador" &&
              antes.activo &&
              (u.rol !== "administrador" || !u.activo);
            const motivo = editado ? bloqueo(antes ?? u, pierdeElMando) : "";
            if (motivo && pierdeElMando) {
              toast.error(motivo);
              return;
            }
            guardarUsuario(u);
            registrarBitacora(
              editado ? "Editó usuario interno" : "Dio de alta un usuario interno",
              `${u.nombre} · ${ETIQUETA_ROL[u.rol]} · ${u.activo ? "activo" : "inactivo"}`,
            );
            toast.success(`Usuario ${u.nombre} guardado.`);
            setEditando(null);
          }}
        />
      ) : null}

      <DialogoConfirmar
        abierto={!!borrando}
        alCerrar={() => setBorrando(null)}
        titulo={
          <>
            {borrando?.activo ? "¿Dar de baja a" : "¿Reactivar a"} {borrando?.nombre}?
          </>
        }
        descripcion={
          borrando?.activo
            ? `Perderá el acceso al panel de ${borrando ? ETIQUETA_ROL[borrando.rol] : ""}, pero el registro se conserva: sus entradas de bitácora siguen teniendo autor. Se desactiva, no se borra.`
            : "Volverá a tener acceso con el mismo rol y su histórico intacto."
        }
        confirmar={borrando?.activo ? "Sí, desactivar" : "Sí, reactivar"}
        alConfirmar={() => {
          const u = borrando!;
          // Dar de baja al único administrador activo, o a uno mismo, deja el
          // sistema sin quien pueda volver a entrar aquí.
          const motivo = u.activo ? bloqueo(u, true) : "";
          if (motivo) {
            toast.error(motivo);
            setBorrando(null);
            return;
          }
          // Desactivar, nunca borrar: un usuario eliminado deja huérfanas sus
          // entradas de bitácora, que es lo contrario de para lo que sirve una
          // bitácora.
          guardarUsuario({ ...u, activo: !u.activo });
          registrarBitacora(
            u.activo ? "Dio de baja a un usuario interno" : "Reactivó a un usuario interno",
            `${u.nombre} · ${ETIQUETA_ROL[u.rol]} · el histórico se conserva`,
          );
          toast.success(
            u.activo
              ? `${u.nombre} quedó inactivo. Su histórico se conserva.`
              : `${u.nombre} reactivado.`,
          );
          setBorrando(null);
        }}
      />
    </PantallaPanel>
  );
}

function FormularioUsuario({
  inicial,
  existe,
  onCerrar,
  onGuardar,
}: {
  inicial: UsuarioInterno;
  existe: boolean;
  onCerrar: () => void;
  onGuardar: (u: UsuarioInterno) => void;
}) {
  const [u, setU] = useState<UsuarioInterno>(inicial);
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.correo.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existe ? `Editar ${u.nombre || u.id}` : "Nuevo usuario interno"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {/*
            La condición previa, dicha ANTES y no al fallar.

            Una fila del personal no existe sin su cuenta de acceso
            —`usuarios_internos.id` referencia `auth.users`— y crear una cuenta
            exige la clave de servicio, que un navegador no tiene ni debe tener.
            Así que esta pantalla no crea cuentas: les da su rol.

            Esto antes no se decía porque el alta no daba de alta a nadie: hacía
            un `update` sobre un identificador inventado, no encontraba ninguna
            fila, y anunciaba que había guardado.
          */}
          {!existe ? (
            <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Esta persona necesita <strong>tener ya su cuenta de acceso</strong>. Si todavía no
                la tiene, invítala por correo desde Supabase Auth y vuelve aquí a darle su rol.
              </span>
            </p>
          ) : null}
          <div>
            <Label htmlFor="u-nombre">Nombre completo</Label>
            <Input
              id="u-nombre"
              value={u.nombre}
              onChange={(e) => setU({ ...u, nombre: e.target.value })}
              {...CAMPO_MAYUSCULAS}
              className="mt-1 h-11 uppercase"
              placeholder="SOFIA RAMIREZ BAÑUELOS"
            />
          </div>
          <div>
            <Label htmlFor="u-correo">Correo institucional</Label>
            <Input
              id="u-correo"
              type="email"
              value={u.correo}
              onChange={(e) => setU({ ...u, correo: e.target.value.toLowerCase() })}
              className="mt-1 h-11"
              aria-invalid={u.correo.length > 0 && !correoValido}
            />
            {u.correo.length > 0 && !correoValido ? (
              <p className="mt-1 text-xs font-medium text-destructive">
                Ese correo no tiene un formato válido.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="u-rol">Rol</Label>
            <select
              id="u-rol"
              value={u.rol}
              onChange={(e) => setU({ ...u, rol: e.target.value as RolInterno })}
              className="mt-1 h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </select>
            <div className="mt-2 rounded-md bg-muted p-3">
              <p className="text-xs font-semibold">Con este rol podrá:</p>
              <ul className="mt-1 grid list-disc gap-1 pl-5 text-xs text-muted-foreground">
                {PERMISOS[u.rol].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-3">
            <Checkbox checked={u.activo} onCheckedChange={(v) => setU({ ...u, activo: !!v })} />
            <span className="text-sm font-medium">Activo — puede entrar al sistema</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              className="h-11"
              disabled={!u.nombre.trim() || !correoValido}
              onClick={() => onGuardar(u)}
            >
              Guardar usuario
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
