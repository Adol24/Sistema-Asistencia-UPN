import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Campo } from "@/components/tipografia";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LARGOS_MATRICULA_EN_TEXTO, esMatricula } from "@/lib/campos";
import { buscarNivel, cuentaDeAvance, type NivelAcademico } from "@/dominio/catalogos";
import type { AlumnoPadron } from "@/dominio/tipos";

/**
 * El alta de un alumno que falta del padrón, con lo que declara en la mesa.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe esta pantalla
 * ---------------------------------------------------------------------------
 * `/admin/padron` importa archivos, y eso cubre lo normal: Servicios Escolares
 * entrega la lista y entra de una vez. Lo que no cubre es a quien no está en
 * ese archivo todavía —de nuevo ingreso, o un alumno de semestre avanzado que
 * el padrón de la unidad no trae—. Sin fila en `padron_alumnos` no hay
 * pre-registro posible: `participantes.matricula` apunta ahí con una llave
 * foránea, y `chk_alumno_completo` exige nivel, programa, avance y plantel.
 *
 * Se captura en mesa y no en un formulario público a propósito. La vía pública
 * tiene un techo que ninguna implementación arregla: **no se puede autenticar a
 * alguien de quien el sistema no tiene ningún dato previo.** Cualquiera puede
 * teclear un número de ocho a once dígitos, y si acierta con la matrícula real
 * de otro alumno, ese alumno queda fuera y nada en la base puede distinguir
 * quién es quién. En mesa el techo no desaparece, pero lo que se declara lo
 * teclea alguien con nombre y queda en la bitácora.
 *
 * ---------------------------------------------------------------------------
 * Nivel, programa y avance: listas y catálogo, no texto libre
 * ---------------------------------------------------------------------------
 * - **Nivel y programa son listas**, no texto: `programa_id` y `nivel_id` son
 *   llaves foráneas obligatorias al catálogo académico de `/admin/configuracion`,
 *   así que un texto libre no se podría guardar. Y si se pudiera, «LEIP»,
 *   «L.E.I.P.» y el nombre completo serían tres programas distintos que ningún
 *   reporte podría agrupar.
 * - **El avance SÍ se pregunta**, con la etiqueta que le toque («Semestre» o
 *   «Módulo», según `cuentaDeAvance`) y limitado al tope de su programa o
 *   nivel. Antes esta pantalla era solo para nuevo ingreso y lo fijaba en 1 sin
 *   preguntarlo; generalizarla a cualquier alumno que falte del padrón —no
 *   solo a los de primer semestre— significa que ya no hay un único avance
 *   seguro que adivinar.
 * - **El grupo es opcional** y se queda en blanco sin disculpas: puede que
 *   todavía no se lo hayan asignado, y un grupo inventado es peor que ninguno.
 *
 * La base vuelve a validar el tope de avance (`trg_padron_avance`) y el
 * programa (`fn_padron_alta_asistida`): esto es un adelanto para avisar
 * mientras se teclea, no la regla.
 */
export function AltaDeUnAlumno({
  catalogo,
  sedes,
  onCerrar,
  onAlta,
}: {
  /** El catálogo académico completo —todos los niveles y sus programas—, el mismo que usa `/admin/configuracion`. */
  catalogo: NivelAcademico[];
  sedes: string[];
  onCerrar: () => void;
  onAlta: (d: {
    matricula: string;
    nombre: string;
    programa: string;
    plantel: string;
    avance: number;
    grupo?: string | undefined;
  }) => Promise<AlumnoPadron>;
}) {
  const [matricula, setMatricula] = useState("");
  const [nombre, setNombre] = useState("");
  const [nivel, setNivel] = useState(catalogo[0]?.nivel ?? "");
  const [programa, setPrograma] = useState(catalogo[0]?.programas[0]?.nombre ?? "");
  const [plantel, setPlantel] = useState(sedes[0] ?? "");
  const [avance, setAvance] = useState(1);
  const [grupo, setGrupo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const programasDelNivel = buscarNivel(catalogo, nivel)?.programas ?? [];

  /*
   * Cambiar de nivel reinicia el programa al primero de la lista nueva: el que
   * estuviera elegido puede ni existir en el otro nivel, y una maestría
   * seleccionada mientras el desplegable todavía enseña licenciaturas es una
   * combinación que la llave compuesta rechazaría después.
   */
  const alCambiarNivel = (v: string) => {
    setNivel(v);
    setPrograma(buscarNivel(catalogo, v)?.programas[0]?.nombre ?? "");
  };

  // Misma precedencia que `avanceTexto`: manda el programa y, si no dice
  // nada, el nivel. Es la única excepción hoy (LEIP, que cuenta por módulos).
  const cuenta = cuentaDeAvance(catalogo, nivel, programa);

  /*
   * Las comprobaciones que se pueden hacer sin preguntar a la base.
   *
   * Son las mismas que la base exige —el largo de la matrícula, al menos dos
   * palabras en el nombre, y el avance dentro de su tope— escritas aquí para
   * poder avisar mientras se teclea en vez de al pulsar. La base sigue siendo
   * la que manda: estas son un adelanto, no la regla, y por eso el mensaje de
   * un rechazo suyo se enseña tal cual.
   *
   * El largo se pregunta a `esMatricula` y no a una copia local. Aquí había una
   * escrita a mano —`/^([0-9]{8}|[0-9]{11})$/`— y al abrir el rango a nueve y
   * diez dígitos se quedó atrás: esta pantalla rechazaba matrículas que la base
   * ya aceptaba.
   */
  const matriculaOk = esMatricula(matricula.trim());
  const nombreOk = nombre.trim().split(/\s+/).filter(Boolean).length >= 2;
  const avanceOk = avance >= 1 && (!cuenta || avance <= cuenta.total);
  const completo = matriculaOk && nombreOk && !!programa && !!plantel && avanceOk;

  const guardar = async () => {
    setGuardando(true);
    try {
      const fila = await onAlta({
        matricula: matricula.trim(),
        nombre,
        programa,
        plantel,
        avance,
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
      // está registrada» de «ese programa no está en el catálogo» de «el avance
      // está fuera de rango», y las cuatro llevan a cosas distintas.
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
          <DialogTitle>Dar de alta a un alumno</DialogTitle>
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
                  Lleva {LARGOS_MATRICULA_EN_TEXTO} dígitos, sin letras ni espacios.
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

          <Campo etiqueta="Nivel">
            <select
              value={nivel}
              onChange={(e) => alCambiarNivel(e.target.value)}
              className={claseSelect}
            >
              {catalogo.map((n) => (
                <option key={n.nivel} value={n.nivel}>
                  {n.nivel}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Licenciatura o maestría">
            <select
              value={programa}
              onChange={(e) => setPrograma(e.target.value)}
              className={claseSelect}
            >
              {programasDelNivel.map((p) => (
                <option key={p.nombre} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta={cuenta?.etiqueta ?? "Avance"}
            ayuda={
              !avanceOk ? (
                <span className="text-xs text-estado-cancelado">
                  {avance < 1
                    ? "Debe ser 1 o más."
                    : `${cuenta?.etiqueta ?? "El avance"} llega hasta ${cuenta?.total}.`}
                </span>
              ) : null
            }
          >
            <Input
              type="number"
              min={1}
              max={cuenta?.total}
              value={avance}
              onChange={(e) => setAvance(Number(e.target.value))}
              inputMode="numeric"
              className="mt-1 h-11"
            />
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
