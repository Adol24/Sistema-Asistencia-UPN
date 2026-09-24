import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Campo } from "@/components/tipografia";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AlumnoPadron } from "@/dominio/tipos";

/**
 * El alta de un alumno de nuevo ingreso, con lo que declara en la mesa.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe esta pantalla
 * ---------------------------------------------------------------------------
 * `/admin/padron` importa archivos, y eso cubre lo normal: Servicios Escolares
 * entrega la lista y entra de una vez. Lo que no cubre es a los de nuevo
 * ingreso, cuyo padrón la unidad todavía no tiene y que se pre-registran el 27
 * y el 28. Sin fila en `padron_alumnos` no hay pre-registro posible:
 * `participantes.matricula` apunta ahí con una llave foránea, y
 * `chk_alumno_completo` exige nivel, programa, avance y plantel.
 *
 * Se captura en mesa y no en un formulario público a propósito. La vía pública
 * tiene un techo que ninguna implementación arregla: **no se puede autenticar a
 * alguien de quien el sistema no tiene ningún dato previo.** Cualquiera puede
 * teclear un número de ocho u once dígitos, y si acierta con la matrícula real
 * de un alumno de primero, ese alumno queda fuera y nada en la base puede
 * distinguir quién es quién. En mesa el techo no desaparece, pero lo que se
 * declara lo teclea alguien con nombre y queda en la bitácora.
 *
 * ---------------------------------------------------------------------------
 * Tres campos y medio, no seis
 * ---------------------------------------------------------------------------
 * La lista larga era nombre, licenciatura, sede, semestre, grupo y matrícula.
 * Cada recorte tiene su motivo:
 *
 * - **El semestre NO se pregunta.** Son todos de nuevo ingreso, así que el
 *   avance es 1. Es el único dato seguro de esta población, y preguntarlo abre
 *   la puerta a equivocarse en lo que no hacía falta preguntar. Además la
 *   palabra sería la equivocada para la licenciatura modular, que cuenta por
 *   módulos y no por semestres.
 * - **La licenciatura y la sede son listas, no texto libre.** No es preferencia
 *   de forma: `programa_id`, `nivel_id` y `plantel_id` son llaves foráneas
 *   obligatorias a los catálogos, así que un texto libre no se puede guardar. Y
 *   si se pudiera, «LEIP», «L.E.I.P.» y el nombre completo serían tres
 *   programas distintos que ningún reporte podría agrupar.
 * - **El grupo es opcional** y se queda en blanco sin disculpas: a los de nuevo
 *   ingreso puede que todavía no se lo hayan asignado, y un grupo inventado es
 *   peor que ninguno.
 *
 * El nivel no aparece porque la base lo deriva del programa por la llave
 * compuesta `(programa_id, nivel_id)`. Ofrecerlo permitiría mandar una
 * combinación que la llave rechazaría después, con un error sobre una
 * restricción que no le dice nada a quien está capturando.
 */
export function AltaDeUnAlumno({
  licenciaturas,
  sedes,
  onCerrar,
  onAlta,
}: {
  /** Nombres de las licenciaturas del catálogo. Solo licenciaturas: esta puerta
   *  es para nuevo ingreso, y la base rechaza cualquier otro nivel. */
  licenciaturas: string[];
  sedes: string[];
  onCerrar: () => void;
  onAlta: (d: {
    matricula: string;
    nombre: string;
    programa: string;
    plantel: string;
    grupo?: string | undefined;
  }) => Promise<AlumnoPadron>;
}) {
  const [matricula, setMatricula] = useState("");
  const [nombre, setNombre] = useState("");
  const [programa, setPrograma] = useState(licenciaturas[0] ?? "");
  const [plantel, setPlantel] = useState(sedes[0] ?? "");
  const [grupo, setGrupo] = useState("");
  const [guardando, setGuardando] = useState(false);

  /*
   * Las dos comprobaciones que se pueden hacer sin preguntar a la base.
   *
   * Son las mismas que la base exige —8 u 11 dígitos, y al menos dos palabras
   * en el nombre— escritas aquí para poder avisar mientras se teclea en vez de
   * al pulsar. La base sigue siendo la que manda: estas son un adelanto, no la
   * regla, y por eso el mensaje de un rechazo suyo se enseña tal cual.
   */
  const matriculaOk = /^([0-9]{8}|[0-9]{11})$/.test(matricula.trim());
  const nombreOk = nombre.trim().split(/\s+/).filter(Boolean).length >= 2;
  const completo = matriculaOk && nombreOk && !!programa && !!plantel;

  const guardar = async () => {
    setGuardando(true);
    try {
      const fila = await onAlta({
        matricula: matricula.trim(),
        nombre,
        programa,
        plantel,
        ...(grupo.trim() ? { grupo: grupo.trim() } : {}),
      });
      /*
       * Se enseña el nombre QUE GUARDÓ LA BASE, no el que se tecleó.
       *
       * Vuelve en mayúsculas y sin acentos, y esa es la versión que se va a
       * imprimir en su constancia. Que quien capturó lo vea ahora es la única
       * oportunidad de detectar que escribió «MUNOZ» donde iba «MUÑOZ» —la Ñ se
       * conserva a propósito— sin esperar al día del evento.
       */
      toast.success(`${fila.matricula} — ${fila.nombre} quedó en el padrón.`);
      onCerrar();
    } catch (e) {
      // El motivo de la base, tal cual: distingue «ya está en el padrón» de «ya
      // está registrada» de «esa licenciatura no está en el catálogo», y las
      // tres llevan a cosas distintas.
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const claseSelect = "mt-1 h-11 w-full rounded-md border border-border bg-card px-3 text-sm";

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alta de un alumno de nuevo ingreso</DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Estos datos los declara el alumno, no Servicios Escolares</AlertTitle>
          <AlertDescription>
            La fila queda marcada para contrastarla cuando llegue el padrón real. Teclea lo que
            traiga en su credencial o en su comprobante de inscripción, no de memoria.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          <Campo
            etiqueta="Matrícula"
            ayuda={
              matricula && !matriculaOk ? (
                <span className="text-xs text-estado-cancelado">
                  Lleva 8 u 11 dígitos, sin letras ni espacios.
                </span>
              ) : null
            }
          >
            <Input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="mt-1 h-11 font-mono"
            />
          </Campo>

          <Campo
            etiqueta="Nombre completo"
            ayuda={
              nombre && !nombreOk ? (
                <span className="text-xs text-estado-cancelado">
                  Falta el nombre completo: al menos nombre y un apellido.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Se guarda en MAYÚSCULAS y sin acentos, conservando la Ñ. Así se imprime.
                </span>
              )
            }
          >
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="off"
              className="mt-1 h-11"
            />
          </Campo>

          <Campo etiqueta="Licenciatura">
            <select
              value={programa}
              onChange={(e) => setPrograma(e.target.value)}
              className={claseSelect}
            >
              {licenciaturas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Sede donde estudia">
            <select
              value={plantel}
              onChange={(e) => setPlantel(e.target.value)}
              className={claseSelect}
            >
              {sedes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Grupo (opcional)"
            ayuda={
              <span className="text-xs text-muted-foreground">
                Déjalo en blanco si todavía no se lo han asignado.
              </span>
            }
          >
            <Input
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              autoComplete="off"
              className="mt-1 h-11"
            />
          </Campo>

          {/*
            Se dice que el semestre NO se pregunta. Sin esta línea, quien captura
            busca el campo y concluye que la pantalla está incompleta.
          */}
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            No se pregunta el semestre: al ser de nuevo ingreso queda en el primero, y el sistema lo
            sabe. Tampoco el nivel, que sale de la licenciatura.
          </p>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-11" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button className="h-11" disabled={!completo || guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {guardando ? "Guardando…" : "Dar de alta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
