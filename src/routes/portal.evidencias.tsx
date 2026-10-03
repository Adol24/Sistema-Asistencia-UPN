import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Lock,
  MonitorSmartphone,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPublica } from "@/components/layouts";
import { EstadoVacio } from "@/components/tipografia";
import { PortalNav } from "@/components/portal-nav";
import { EstadoEvidenciaBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { usePortal, useParticipanteDelPortal } from "@/lib/portal";
import type { Participante } from "@/dominio/tipos";
import { EsperaDelPortal } from "@/components/acceso";
import { useEstadoEvento } from "@/lib/estado-evento";
import { hoyIso, isoAFecha } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { Dia, EstadoEvidencia } from "@/dominio/tipos";

export const Route = createFileRoute("/portal/evidencias")({
  head: () =>
    meta(
      "Mis evidencias — XIV Encuentro Internacional de Educación",
      "Sube y consulta tus evidencias por día: presencial, pendiente de revisión, aprobada, rechazada o fuera de la ventana horaria.",
    ),
  component: MisEvidencias,
});

type Tarjeta =
  | {
      // Solo la entrada. La salida no se escanea —la cierra el sistema al
      // terminar el día—, así que enseñársela al participante solo podía
      // confundir: o le mostraba una hora que nadie capturó, o le avisaba de un
      // «sin registro de salida» que no significa nada malo.
      tipo: "presencial";
      entrada?: string | undefined;
    }
  | { tipo: "bloqueada"; texto: string }
  | { tipo: "disponible" }
  | {
      tipo: "estado";
      estado: EstadoEvidencia;
      motivo?: string;
      subidaEn?: string;
      revisor?: string | undefined;
      revisadaEn?: string | undefined;
    };

/*
 * Se parte en dos porque la comprobación tiene que ocurrir DESPUÉS de todos los
 * hooks: un `return` temprano en medio los llamaría en distinto orden según el
 * caso, que es lo que React no permite. El de fuera decide; el de dentro dibuja,
 * y recibe un participante que ya no puede ser nulo.
 */
function MisEvidencias() {
  const p = useParticipanteDelPortal();
  const { cargando, error } = usePortal();
  if (!p) return <EsperaDelPortal cargando={cargando} error={error} />;
  return <MisEvidenciasContenido p={p} />;
}

function MisEvidenciasContenido({ p }: { p: Participante }) {
  const { infoDia } = useEstadoEvento();
  /*
   * Sus evidencias salen del PORTAL, no del almacén del personal.
   *
   * Esta pantalla leía `useEstadoEvento().evidencias`, que es la lista que
   * carga una sesión interna y que para un aspirante llega SIEMPRE vacía. El
   * efecto era que su entrega desaparecía al recargar —la tarjeta volvía a
   * «Subir evidencia» como si no existiera— y que **el motivo de un rechazo no
   * le llegaba nunca**, aunque el revisor lo hubiera escrito.
   *
   * El dato estaba descargado desde el principio: `fn_portal_estado` lo
   * devuelve y `DatosPortal.evidencias` lo guarda con su `motivo_rechazo`. No
   * lo leía nadie. Lo mismo con las asistencias, que son las que ponen la hora
   * de entrada en la tarjeta de su día presencial.
   */
  const { datos } = usePortal();
  const mias = datos?.evidencias ?? [];
  const entradaDe = (dia: Dia) =>
    datos?.asistencias.find((a) => a.dia === dia && a.tipo === "entrada")?.hora;

  if (p.perfil !== "alumno") {
    return (
      <PantallaPublica titulo="Mis evidencias" ancho="lg">
        <PortalNav />
        <EstadoVacio
          icono={<ImageIcon className="size-8" aria-hidden />}
          titulo="Las evidencias solo aplican para alumnos"
        >
          Tu perfil no requiere subir evidencias de los días en línea.
        </EstadoVacio>
      </PantallaPublica>
    );
  }

  const tarjetaDe = (dia: Dia): Tarjeta => {
    if (dia === p.dia) {
      // La hora sale del registro de la puerta, no se inventa: es el mismo que
      // produce la app de captura, incluidos los cierres automáticos.
      return { tipo: "presencial", entrada: entradaDe(dia) };
    }

    const ev = mias.find((e) => e.dia === dia);
    /*
     * `no_entregada` NO es un estado que enseñar: es la fila que reserva el
     * paso 1 de la subida cuando el archivo todavía no llegó. Si la subida se
     * cortó a medias, lo que esa persona necesita es el botón para reintentar,
     * no un rótulo. Antes esa rama decía «Venció el plazo», que era falso.
     */
    if (ev && ev.estado !== "no_entregada")
      return {
        tipo: "estado",
        estado: ev.estado as EstadoEvidencia,
        ...(ev.motivo_rechazo ? { motivo: ev.motivo_rechazo } : {}),
      };

    /*
     * La evidencia de un día se habilita ESE día.
     *
     * Aquí había un `if (dia === 3)` con un literal —«Podrás subirla el 16/10
     * de 8:00 a 16:00 hrs»— y ninguna comprobación de fecha detrás: nunca se
     * abría. Como el alumno entrega los DOS días que no le tocan, eso dejaba
     * a los del día 1 y los del día 2 con una sola evidencia posible de las
     * dos que exige `v_elegibles`: sin constancia, y sin forma de saber por
     * qué. Solo los del día 3 podían completar.
     *
     * Ahora la fecha sale de `dias_evento` y la comparación es entre cadenas
     * AAAA-MM-DD: `new Date("2026-10-17")` se interpreta en UTC y en México
     * abriría el día anterior a las 18:00.
     *
     * Se abre el mismo día y no al terminarlo porque la foto es de la sesión
     * en línea, que ocurre DURANTE ese día. Y no se vuelve a cerrar: quien no
     * pudo subirla esa tarde tiene que poder hacerlo después, que es de lo que
     * depende su constancia.
     */
    const fecha = infoDia(dia).fecha;
    if (fecha && hoyIso() < fecha)
      return {
        tipo: "bloqueada",
        texto: `Podrás subirla el ${isoAFecha(fecha)}, que es el día de esa sesión.`,
      };

    return { tipo: "disponible" };
  };

  return (
    <PantallaPublica
      titulo="Mis evidencias"
      descripcion="Sube una foto por cada día en el que participaste en línea. Tienes máximo 3 intentos por día."
      ancho="lg"
    >
      <PortalNav />

      <ul className="grid gap-3">
        {([1, 2, 3] as Dia[]).map((dia) => {
          const info = infoDia(dia);
          const t = tarjetaDe(dia);

          return (
            <li key={dia} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
                <p className="text-sm font-bold">
                  {info.etiqueta} — {isoAFecha(info.fecha)}
                </p>
              </div>
              <div className="p-4">
                {t.tipo === "presencial" ? (
                  <div className="grid gap-2">
                    <span className="inline-flex w-fit items-center gap-2 rounded-md bg-perfil-alumno-bg px-2 py-1 text-xs font-bold text-perfil-alumno">
                      <MonitorSmartphone className="size-3.5" /> PRESENCIAL
                    </span>
                    {t.entrada ? (
                      <p className="flex flex-wrap gap-4 text-sm">
                        <span className="flex items-center gap-1 text-estado-pagado">
                          <CheckCircle2 className="size-4" /> Entrada {t.entrada}
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="size-4" /> Todavía no hay registro de entrada para este
                        día.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Este día asististe en persona, no necesitas subir evidencia. Al salir no hay
                      que registrar nada.
                    </p>
                  </div>
                ) : null}

                {t.tipo === "bloqueada" ? (
                  <div className="flex items-start gap-3 rounded-md bg-muted p-3 text-sm">
                    <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-semibold">Fuera de la ventana horaria</p>
                      <p className="text-muted-foreground">{t.texto}</p>
                    </div>
                  </div>
                ) : null}

                {t.tipo === "estado" ? (
                  <div className="grid gap-2">
                    <EstadoEvidenciaBadge estado={t.estado} className="w-fit" />
                    {t.subidaEn ? (
                      <p className="text-xs text-muted-foreground">Subida el {t.subidaEn}</p>
                    ) : null}
                    {t.revisor ? (
                      <p className="text-xs text-muted-foreground">
                        Revisada por {t.revisor}
                        {t.revisadaEn ? ` el ${t.revisadaEn}` : ""}
                      </p>
                    ) : null}
                    {t.estado === "rechazada" ? (
                      <>
                        <p className="rounded-md bg-estado-cancelado-bg p-3 text-sm text-estado-cancelado">
                          Motivo: {t.motivo ?? "Imagen ilegible o muy oscura"}
                        </p>
                        <SubirEvidencia dia={dia} etiqueta="Volver a subir evidencia" />
                      </>
                    ) : null}
                  </div>
                ) : null}

                {t.tipo === "disponible" ? (
                  <SubirEvidencia dia={dia} etiqueta="Subir evidencia" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </PantallaPublica>
  );
}

function SubirEvidencia({ dia, etiqueta }: { dia: number; etiqueta: string }) {
  const { sesion, refrescar } = usePortal();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  /*
   * Esto no subía nada, y lo decía en verde.
   *
   * Era una barra de progreso animada, `simularLatencia()` —un `setTimeout`— y
   * un «Tu evidencia quedó en revisión». No se enviaba ningún archivo, no se
   * calculaba ninguna huella y no se escribía ninguna fila: recargar la página
   * devolvía la tarjeta a «Subir evidencia». Y como de la evidencia aprobada
   * depende la constancia, el alumno se iba creyendo que había entregado y al
   * cierre del evento no era elegible.
   *
   * Ahora sube de verdad, en los tres pasos de la migración 52, y el progreso
   * marca dónde va: pedir sitio, subir, confirmar. Lo que no se puede es
   * inventar un porcentaje intermedio —`supabase-js` no informa del avance de
   * la subida— así que se mueve por pasos y no por bytes, que es lo honesto.
   */
  const subir = async () => {
    if (!archivo || !sesion) return;
    setSubiendo(true);
    setProgreso(10);
    try {
      const { subirEvidenciaRemota } = await import("@/lib/datos");
      setProgreso(40);
      await subirEvidenciaRemota(sesion.folio, sesion.credencial, dia, archivo);
      setProgreso(100);
      toast.success("Tu evidencia quedó en revisión.");
      // Los intentos y el estado los lleva la base: se vuelven a pedir en vez
      // de suponerlos aquí, que es como el contador acabó viviendo en memoria.
      refrescar();
    } catch (e) {
      setProgreso(0);
      const { mensajeDeError } = await import("@/lib/supabase");
      toast.error(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  };

  /*
   * Aquí había un «Ya usaste tus 3 intentos» que decidía un contador de
   * memoria: arrancaba en cero y se reiniciaba en cada recarga, así que ni
   * frenaba a quien ya los había gastado ni le decía la verdad a nadie.
   *
   * El tope lo lleva la base —`evidencias.intentos`, que comprueba
   * `fn_evidencia_preparar`— y el cuarto intento vuelve con su mensaje exacto:
   * «Ya usaste tus 3 intentos del día N». Enseñar eso cuando ocurre es más
   * honesto que adivinarlo antes; el portal todavía no descarga el contador.
   */

  return (
    <div className="grid gap-3">
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted/40 p-4 text-center text-sm hover:bg-muted">
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Toca para elegir una foto</span>
        <span className="text-xs text-muted-foreground">JPG o PNG, máximo 5 MB</span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            // Sin archivo no hay nada que subir. Antes, no elegir ninguno
            // ponía una imagen de relleno y dejaba «subir» igualmente, que es
            // coherente con que la subida fuera simulada y no con que suba.
            const f = e.target.files?.[0] ?? null;
            setArchivo(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
      {preview ? (
        <img
          src={preview}
          alt="Vista previa de tu evidencia"
          className="h-48 w-full rounded-md object-cover"
        />
      ) : null}
      {subiendo || progreso === 100 ? <Progress value={progreso} className="h-2" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* La regla, no un contador: el que había mentía en cada recarga. */}
        <p className="text-xs text-muted-foreground">Máximo 3 intentos por día</p>
        <Button className="h-11" disabled={!preview || subiendo} onClick={() => void subir()}>
          {subiendo ? "Subiendo…" : etiqueta}
        </Button>
      </div>
    </div>
  );
}
