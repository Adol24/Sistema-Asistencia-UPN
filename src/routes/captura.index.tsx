import { useEffect } from "react";
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

import { useEstadoEvento } from "@/lib/estado-evento";
import { useSesion } from "@/lib/sesion";
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
    puntosDelDia,
    usuarios,
  } = useEstadoEvento();
  const { persona, modoPrototipo } = useSesion();
  // El personal sale de `usuarios_internos`, no de una lista fija en el código.
  const capturistas = usuarios.filter((u) => u.rol === "capturista" && u.activo);
  const dia = infoDia(sesion.dia);

  /*
   * Quién captura no se elige: es quien inició sesión.
   *
   * Antes había aquí una lista de capturistas para escoger, y eso podía
   * contradecir a la base. La asistencia se firma en `asistencias.capturista_id`
   * con el usuario autenticado, así que alguien que entrara como Ana y pulsara
   * «Mario» dejaba la bitácora local diciendo Mario y la tabla diciendo Ana,
   * para el mismo escaneo. Y con tres personas dadas de alta con el mismo
   * nombre, los tres botones se encendían a la vez: se comparaban por texto.
   *
   * En modo prototipo no hay sesión que valga, así que ahí sigue la lista.
   */
  const nombreCorto = (n: string) => n.split(" ").slice(0, 2).join(" ");
  const soyYo = persona ? nombreCorto(persona.nombre) : null;
  useEffect(() => {
    if (soyYo && sesion.capturista !== soyYo) setSesion({ capturista: soyYo });
  }, [soyYo, sesion.capturista, setSesion]);

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
                <span className="block text-[11px] leading-tight opacity-80">{info.lugar}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {dia.etiqueta} — {dia.fecha} · Registro de entrada: {evento.registroEntrada}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ScanLine className="size-4 text-primary" aria-hidden /> Modo
        </h2>
        <div className="mt-2">
          <SelectorModo />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          En PUERTA no eliges dirección: el sistema mira el último movimiento de esa persona y sabe
          si está entrando o saliendo. Sirve igual para recibir por la mañana que para el receso.
        </p>
        <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Solo se escanea al cruzar a la calle.
          </span>{" "}
          Los baños, las escaleras y los pasillos están dentro del recinto: ir al baño no es salir y
          ahí no se registra nada. Lo que cuenta es la puerta por la que alguien se va.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MapPin className="size-4 text-primary" aria-hidden /> Punto de captura
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Los de la sede del día {sesion.dia}. Se configuran en Configuración del evento.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {puntosDelDia(sesion.dia).map((punto) => (
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
        {persona ? (
          <div className="mt-2 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm font-bold">{persona.nombre}</p>
            <p className="text-xs text-muted-foreground">{persona.correo}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Cada escaneo queda firmado contigo. Si te relevan, el siguiente turno inicia sesión
              con su cuenta.
            </p>
          </div>
        ) : (
          <div className="mt-2 grid gap-2">
            {capturistas.map((u) => {
              const nombre = nombreCorto(u.nombre);
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
                  <span className="min-w-0 truncate">{nombre}</span>
                  {/* El correo distingue a dos personas con el mismo nombre. */}
                  <span className="ml-2 shrink-0 text-xs font-normal opacity-70">{u.correo}</span>
                </button>
              );
            })}
            {modoPrototipo ? (
              <p className="text-xs text-muted-foreground">
                Modo prototipo: no hay sesión iniciada, así que aquí se elige a mano.
              </p>
            ) : null}
          </div>
        )}
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
          Marca la salida de quien siga dentro del recinto. A quien ya se fue no lo toca, y no
          decide constancias. Se dispara a mano porque el prototipo no tiene reloj de evento.
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
                Se registrará la salida de todo participante del día {sesion.dia} que siga dentro
                del recinto. A quien ya había salido no se le toca. Queda marcada como cierre
                automático. No cambia quién es elegible para constancia. No se puede deshacer desde
                esta pantalla.
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
