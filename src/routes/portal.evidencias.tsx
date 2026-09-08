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

import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { hora, simularLatencia } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { Dia, EstadoEvidencia } from "@/mocks/tipos";

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
      tipo: "presencial";
      entrada?: string | undefined;
      salida?: string | undefined;
      cierreAutomatico?: boolean | undefined;
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

function MisEvidencias() {
  const { participante: p } = usePrototipo();
  const { asistenciasDe, evidencias: evidenciasCtx, revisiones, infoDia } = useEstadoEvento();
  const mias = evidenciasCtx.filter((e) => e.folio === p.folio);
  const [subidas, setSubidas] = useState<Record<number, { estado: EstadoEvidencia; hora: string }>>(
    {},
  );
  const [intentos, setIntentos] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });

  if (p.perfil !== "alumno") {
    return (
      <PantallaPublica titulo="Mis evidencias" volverA="/portal" ancho="lg">
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
    const subida = subidas[dia];
    if (subida) return { tipo: "estado", estado: subida.estado, subidaEn: subida.hora };
    if (dia === p.dia) {
      // Las horas salen de asistencias.ts, no se inventan: es el mismo registro
      // que produce la app de captura, incluidos los cierres automáticos.
      const delDia = asistenciasDe(p.folio, dia);
      const entrada = delDia.find((a) => a.tipo === "entrada");
      const salida = delDia.find((a) => a.tipo === "salida");
      return {
        tipo: "presencial",
        entrada: entrada?.hora,
        salida: salida?.hora,
        cierreAutomatico: salida?.cierreAutomatico,
      };
    }
    const ev = mias.find((e) => e.dia === dia);
    if (ev)
      return {
        tipo: "estado",
        estado: ev.estado,
        motivo: ev.motivoRechazo,
        subidaEn: ev.subidaEn,
        revisor: ev.revisor,
        revisadaEn: revisiones[ev.id]?.en,
      };
    if (dia === 3)
      return { tipo: "bloqueada", texto: "Podrás subirla el 16/10 de 8:00 a 16:00 hrs" };
    return { tipo: "disponible" };
  };

  return (
    <PantallaPublica
      titulo="Mis evidencias"
      descripcion="Sube una foto por cada día en el que participaste en línea. Tienes máximo 3 intentos por día."
      volverA="/portal"
      ancho="lg"
    >
      <PortalNav />

      <ul className="grid gap-3">
        {([1, 2, 3] as Dia[]).map((dia) => {
          const info = infoDia(dia);
          const t = tarjetaDe(dia);
          const usados = intentos[dia] ?? 0;
          const restantes = 3 - usados;

          return (
            <li key={dia} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
                <p className="text-sm font-bold">
                  {info.etiqueta} — {info.fecha}
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
                        {t.salida && !t.cierreAutomatico ? (
                          <span className="flex items-center gap-1 text-estado-pagado">
                            <CheckCircle2 className="size-4" /> Salida {t.salida}
                          </span>
                        ) : null}
                        {t.salida && t.cierreAutomatico ? (
                          <span className="flex items-center gap-1 text-estado-discrepancia">
                            <Clock className="size-4" /> Salida {t.salida} — cierre automático
                          </span>
                        ) : null}
                        {!t.salida ? (
                          <span className="flex items-center gap-1 text-estado-discrepancia">
                            <Clock className="size-4" /> Sin registro de salida
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="size-4" /> Todavía no hay registro de entrada para este
                        día.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t.cierreAutomatico
                        ? "Tu salida no se escaneó: el sistema la cerró automáticamente al terminar el horario. Este día asististe en la sede, no necesitas subir evidencia."
                        : "Este día asististe en la sede, no necesitas subir evidencia."}
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
                        <SubirEvidencia
                          restantes={restantes}
                          onSubida={(estado) => {
                            setIntentos((prev) => ({ ...prev, [dia]: usados + 1 }));
                            setSubidas((prev) => ({ ...prev, [dia]: { estado, hora: hora() } }));
                          }}
                          etiqueta="Volver a subir evidencia"
                        />
                      </>
                    ) : null}
                    {t.estado === "no_entregada" ? (
                      <p className="text-sm text-muted-foreground">
                        Venció el plazo para subir la evidencia de este día.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {t.tipo === "disponible" ? (
                  <SubirEvidencia
                    restantes={restantes}
                    onSubida={(estado) => {
                      setIntentos((prev) => ({ ...prev, [dia]: usados + 1 }));
                      setSubidas((prev) => ({ ...prev, [dia]: { estado, hora: hora() } }));
                    }}
                    etiqueta="Subir evidencia"
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </PantallaPublica>
  );
}

function SubirEvidencia({
  restantes,
  onSubida,
  etiqueta,
}: {
  restantes: number;
  onSubida: (estado: EstadoEvidencia) => void;
  etiqueta: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [subiendo, setSubiendo] = useState(false);

  const subir = async () => {
    setSubiendo(true);
    setProgreso(15);
    const t = setInterval(() => setProgreso((p) => Math.min(p + 20, 95)), 150);
    await simularLatencia();
    clearInterval(t);
    setProgreso(100);
    setSubiendo(false);
    onSubida("pendiente");
    toast.success("Tu evidencia quedó en revisión.");
  };

  if (restantes <= 0)
    return (
      <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        Ya usaste tus 3 intentos de este día. Contacta a soporte si necesitas ayuda.
      </p>
    );

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
            const f = e.target.files?.[0];
            if (f) setPreview(URL.createObjectURL(f));
            else setPreview("https://placehold.co/600x800/334155/f8fafc?text=EVIDENCIA");
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
        <p className="text-xs text-muted-foreground">Intentos restantes: {restantes} de 3</p>
        <Button className="h-11" disabled={!preview || subiendo} onClick={() => void subir()}>
          {subiendo ? "Subiendo…" : etiqueta}
        </Button>
      </div>
    </div>
  );
}
