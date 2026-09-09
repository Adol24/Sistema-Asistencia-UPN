import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, MapPin, ScanLine, TimerOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PantallaCaptura, SelectorModo } from "@/components/captura-shell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { PUNTOS_CAPTURA, useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia } from "@/dominio/tipos";

export const Route = createFileRoute("/captura/")({
  head: () =>
    meta(
      "Configuración de sesión — Captura de asistencia",
      "Elige día, modo y punto de captura antes de empezar a escanear asistencia en el XIV Encuentro Internacional de Educación.",
    ),
  component: ConfiguracionSesion,
});

function ConfiguracionSesion() {
  const navigate = useNavigate();
  const {
    sesion,
    setSesion,
    ejecutarCierreAutomatico,
    configuracion: evento,
    infoDia,
    usuarios,
  } = useEstadoEvento();
  // El personal sale de `usuarios_internos`, no de una lista fija en el código.
  const capturistas = usuarios.filter((u) => u.rol === "capturista" && u.activo);
  const dia = infoDia(sesion.dia);

  return (
    <PantallaCaptura titulo="Configuración de sesión">
      <p className="text-sm text-muted-foreground">
        Configura la sesión antes de empezar. El modo se puede cambiar después, sin salir del
        escáner.
      </p>

      <section className="mt-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4 text-primary" aria-hidden /> Día
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([1, 2, 3] as Dia[]).map((d) => {
            const info = infoDia(d);
            return (
              <button
                key={d}
                onClick={() => setSesion({ dia: d })}
                aria-pressed={sesion.dia === d}
                className={cn(
                  "min-h-20 rounded-lg border px-2 text-center transition-colors",
                  sesion.dia === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="block text-xl font-extrabold">{d}</span>
                <span className="block text-[11px] leading-tight opacity-80">{info.sede}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {dia.etiqueta} — {dia.fecha} · Entrada: {evento.registroEntrada} · Salida:{" "}
          {evento.registroSalida.toLowerCase()}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ScanLine className="size-4 text-primary" aria-hidden /> Modo
        </h2>
        <div className="mt-2">
          <SelectorModo />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MapPin className="size-4 text-primary" aria-hidden /> Punto de captura
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PUNTOS_CAPTURA.map((punto) => (
            <button
              key={punto}
              onClick={() => setSesion({ punto })}
              aria-pressed={sesion.punto === punto}
              className={cn(
                "min-h-14 rounded-lg border px-3 text-sm font-semibold transition-colors",
                sesion.punto === punto
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              {punto}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <UserRound className="size-4 text-primary" aria-hidden /> Capturista
        </h2>
        <div className="mt-2 grid gap-2">
          {capturistas.map((u) => {
            const nombre = u.nombre.split(" ").slice(0, 2).join(" ");
            return (
              <button
                key={u.id}
                onClick={() => setSesion({ capturista: nombre })}
                aria-pressed={sesion.capturista === nombre}
                className={cn(
                  "flex min-h-14 items-center justify-between rounded-lg border px-4 text-sm font-semibold transition-colors",
                  sesion.capturista === nombre
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {nombre}
                {!u.activo ? (
                  <span className="text-xs font-normal opacity-70">inactivo</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <Button
        className="mt-8 h-14 w-full text-base font-bold"
        onClick={() => navigate({ to: "/captura/escaneo" })}
      >
        <ScanLine className="size-5" /> Comenzar a escanear
      </Button>

      <section className="mt-8 rounded-lg border border-dashed border-border bg-muted/40 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <TimerOff className="size-4 text-muted-foreground" aria-hidden /> Cierre del día
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Al terminar el horario, quien entró y no registró salida recibe una salida marcada como
          cierre automático. El prototipo no tiene reloj de evento, así que se dispara a mano para
          poder evaluarlo.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="mt-3 h-12 w-full">
              Ejecutar cierre automático del día {sesion.dia}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar el día {sesion.dia}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se registrará salida automática a todo participante del día {sesion.dia} que tenga
                entrada y no tenga salida. Quedará marcada como cierre automático, distinguible de
                una salida escaneada. No se puede deshacer desde esta pantalla.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const n = ejecutarCierreAutomatico(sesion.dia);
                  toast.success(
                    n === 0
                      ? `No quedaba nadie sin salida en el día ${sesion.dia}.`
                      : `Se cerraron ${n} asistencias del día ${sesion.dia}.`,
                  );
                }}
              >
                Sí, cerrar el día
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </PantallaCaptura>
  );
}
