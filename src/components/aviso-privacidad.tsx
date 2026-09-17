import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEstadoEvento } from "@/lib/estado-evento";
import { cn } from "@/lib/utils";

/**
 * El aviso de privacidad, y la casilla con la que se acepta.
 *
 * Vive en un componente y no en cada formulario porque los datos de contacto se
 * capturan en DOS pantallas —`/completar-datos` para el alumno, `/registro`
 * para el docente y el externo— y el consentimiento tiene que pedirse igual en
 * las dos. Escrito dos veces, la segunda copia se queda atrás el día que el
 * texto o la redacción cambien, y entonces la mitad de la gente acepta una cosa
 * distinta de la otra mitad.
 *
 * Va aquí y no al final del recorrido a propósito: el aviso se da ANTES de
 * recoger el dato, que es de lo poco que la ley no deja a interpretación. En la
 * pantalla de talleres llegaría cuando el correo y el celular ya están escritos.
 *
 * El texto sale de `configuracion_evento.aviso_privacidad`, que se edita desde
 * `/admin/configuracion`. No se escribe aquí: quien lo redacta es la
 * universidad, y un texto legal metido en el código solo se puede cambiar
 * desplegando.
 */
export function AvisoDePrivacidad({
  aceptado,
  onAceptar,
  error,
  className,
}: {
  aceptado: boolean;
  onAceptar: (v: boolean) => void;
  /** El reproche, si intentó continuar sin marcarla. */
  error?: string | undefined;
  className?: string;
}) {
  const { configuracion: evento } = useEstadoEvento();
  const [abierto, setAbierto] = useState(false);
  const texto = evento.avisoPrivacidad.trim();

  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        error ? "border-destructive bg-destructive/5" : "border-border bg-muted/40",
        className,
      )}
    >
      {/*
       * La casilla NO viene marcada. Un consentimiento premarcado no es un
       * consentimiento: es una casilla que alguien no llegó a desmarcar.
       */}
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={aceptado}
          onCheckedChange={(v) => onAceptar(v === true)}
          className="mt-0.5"
          aria-describedby="resumen-aviso"
        />
        <span className="text-sm font-medium leading-snug">
          He leído y acepto el aviso de privacidad
        </span>
      </label>

      <p id="resumen-aviso" className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {/*
         * El resumen se escribe aquí y el texto completo viene de la base. No es
         * una duplicación: son dos cosas distintas. Esto es lo que se lee de
         * pasada —tres renglones que dicen para qué son los datos—, y el de
         * abajo es el documento. Sin el resumen, nadie abre el diálogo y la
         * casilla se marca a ciegas; sin el documento, no hay aviso.
         */}
        Tus datos se usan solo para tu registro, tu asistencia y tu constancia. No se comparten con
        terceros.
      </p>

      {texto ? (
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary underline underline-offset-2"
            >
              Leer el aviso completo
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[80svh] overflow-y-auto sm:max-w-lg">
            <DialogTitle className="text-base">Aviso de privacidad</DialogTitle>
            <DialogDescription className="sr-only">
              Cómo se usan los datos que proporcionas en tu pre-registro.
            </DialogDescription>
            {/*
             * `whitespace-pre-line` respeta los saltos de línea que quien lo
             * redactó escribió en el panel. Sin esto, un aviso de cinco párrafos
             * llega como un solo bloque y no hay quien lo lea.
             */}
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {texto}
            </p>
          </DialogContent>
        </Dialog>
      ) : null}

      {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}
    </section>
  );
}
