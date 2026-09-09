import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  CreditCard,
  GraduationCap,
  Info,
  LifeBuoy,
  Plus,
  Save,
  ScrollText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { soloDigitos } from "@/lib/campos";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEstadoEvento } from "@/lib/estado-evento";
import { simularLatencia } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { ConfiguracionEvento } from "@/lib/configuracion";

export const Route = createFileRoute("/admin/configuracion")({
  head: () =>
    meta(
      "Configuración del evento — Administración",
      "Fechas, lugares, cuotas, datos bancarios, fechas límite, WhatsApp de soporte y textos legales del Encuentro.",
    ),
  component: Configuracion,
});

function Configuracion() {
  const { configuracion, actualizarConfiguracion, registrarBitacora } = useEstadoEvento();
  const [b, setB] = useState<ConfiguracionEvento>(configuracion);
  const [guardando, setGuardando] = useState(false);

  const set = (patch: Partial<ConfiguracionEvento>) => setB({ ...b, ...patch });
  const setBanco = (patch: Partial<ConfiguracionEvento["banco"]>) =>
    setB({ ...b, banco: { ...b.banco, ...patch } });
  const setNivel = (i: number, patch: Partial<ConfiguracionEvento["catalogoAcademico"][number]>) =>
    setB((prev) => ({
      ...prev,
      catalogoAcademico: prev.catalogoAcademico.map((n, k) => (k === i ? { ...n, ...patch } : n)),
    }));

  const setVentanilla = (patch: Partial<ConfiguracionEvento["ventanilla"]>) =>
    setB({ ...b, ventanilla: { ...b.ventanilla, ...patch } });

  const cambios = JSON.stringify(b) !== JSON.stringify(configuracion);

  const guardar = async () => {
    setGuardando(true);
    await simularLatencia();
    // Los renglones vacíos del catálogo se descartan al guardar, no al escribir:
    // borrar una línea mientras se edita no debe hacer saltar el cursor.
    const limpio: ConfiguracionEvento = {
      ...b,
      catalogoAcademico: b.catalogoAcademico.map((n) => ({
        ...n,
        programas: n.programas.map((x) => x.trim()).filter(Boolean),
      })),
    };
    actualizarConfiguracion(limpio);
    setB(limpio);
    const campos: string[] = [];
    if (b.cuotaEvento !== configuracion.cuotaEvento)
      campos.push(`cuota ${configuracion.cuotaEvento} → ${b.cuotaEvento}`);
    if (b.fechaLimite !== configuracion.fechaLimite) campos.push("fecha límite");
    if (b.horasValidacion !== configuracion.horasValidacion) campos.push("horas de validación");
    if (JSON.stringify(b.catalogoAcademico) !== JSON.stringify(configuracion.catalogoAcademico))
      campos.push("catálogo académico");
    if (b.dominioInstitucional !== configuracion.dominioInstitucional)
      campos.push("dominio institucional");
    if (JSON.stringify(b.banco) !== JSON.stringify(configuracion.banco))
      campos.push("datos bancarios");
    if (b.whatsappSoporte !== configuracion.whatsappSoporte) campos.push("WhatsApp de soporte");
    registrarBitacora(
      "Editó la configuración del evento",
      campos.length ? campos.join(", ") : "Cambios generales",
    );
    setGuardando(false);
    toast.success("Configuración guardada. Las pantallas públicas ya la usan.");
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Configuración del evento"
      descripcion="Estos valores alimentan las pantallas públicas: el cambio se ve sin recargar."
      nav={navAdmin}
      acciones={
        <Button className="h-11" disabled={!cambios || guardando} onClick={() => void guardar()}>
          <Save className="size-4" /> {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
      }
    >
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          Al guardar, comprueba el efecto en{" "}
          <Link to="/pago" className="font-semibold text-primary underline">
            instrucciones de pago
          </Link>
          ,{" "}
          <Link to="/talleres" className="font-semibold text-primary underline">
            catálogo de talleres
          </Link>{" "}
          y el botón de soporte de{" "}
          <Link to="/alumno" className="font-semibold text-primary underline">
            identificación de alumno
          </Link>
          .
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Identidad y fechas" icono={<Building2 className="size-4" aria-hidden />}>
          <Campo
            id="nombre"
            etiqueta="Nombre del evento"
            valor={b.nombre}
            onChange={(v) => set({ nombre: v })}
          />
          <Campo
            id="subtitulo"
            etiqueta="Subtítulo"
            valor={b.subtitulo}
            onChange={(v) => set({ subtitulo: v })}
          />
          <Campo
            id="fechas"
            etiqueta="Fechas"
            valor={b.fechas}
            onChange={(v) => set({ fechas: v })}
          />
          <Campo
            id="horario"
            etiqueta="Horario general (uso interno: no se publica)"
            valor={b.horario}
            onChange={(v) => set({ horario: v })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo
              id="entrada"
              etiqueta="Registro de entrada"
              valor={b.registroEntrada}
              onChange={(v) => set({ registroEntrada: v })}
            />
            <Campo
              id="salida"
              etiqueta="Registro de salida"
              valor={b.registroSalida}
              onChange={(v) => set({ registroSalida: v })}
            />
          </div>
        </Seccion>

        <Seccion titulo="Sedes por día" icono={<Building2 className="size-4" aria-hidden />}>
          {b.dias.map((d, i) => (
            <div
              key={d.dia}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <Campo
                id={`fecha-${d.dia}`}
                etiqueta={`${d.etiqueta} — fecha`}
                valor={d.fecha}
                onChange={(v) =>
                  set({ dias: b.dias.map((x, k) => (k === i ? { ...x, fecha: v } : x)) })
                }
              />
              <Campo
                id={`sede-${d.dia}`}
                etiqueta="Lugar"
                valor={d.sede}
                onChange={(v) =>
                  set({ dias: b.dias.map((x, k) => (k === i ? { ...x, sede: v } : x)) })
                }
              />
            </div>
          ))}
        </Seccion>

        <Seccion
          titulo="Cuotas y fechas límite"
          icono={<CreditCard className="size-4" aria-hidden />}
        >
          <div>
            <Label htmlFor="cuota">Cuota del evento (MXN)</Label>
            <Input
              id="cuota"
              type="number"
              min={0}
              value={b.cuotaEvento}
              onChange={(e) => set({ cuotaEvento: Number(e.target.value) })}
              className="mt-1 h-11"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Es el monto que Servicios Financieros espera y el que aparece en las instrucciones de
              pago.
            </p>
          </div>
          <Campo
            id="limite"
            etiqueta="Fecha límite de entrega de vouchers"
            valor={b.fechaLimite}
            onChange={(v) => set({ fechaLimite: v })}
          />
          <div>
            <Label htmlFor="horas">Horas para validar un voucher</Label>
            <Input
              id="horas"
              inputMode="numeric"
              maxLength={2}
              value={String(b.horasValidacion)}
              onChange={(e) => {
                const n = soloDigitos(e.target.value, 2);
                set({ horasValidacion: n ? Number(n) : 0 });
              }}
              className="mt-1 h-11"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Es el plazo que se le promete al alumno: pasado ese tiempo descarga su QR del portal.
              Si ventanilla se retrasa, súbelo aquí antes de que empiecen a reclamar.
            </p>
          </div>
          <Campo
            id="v-lugar"
            etiqueta="Ventanilla — lugar"
            valor={b.ventanilla.lugar}
            onChange={(v) => setVentanilla({ lugar: v })}
          />
          <Campo
            id="v-horario"
            etiqueta="Ventanilla — horario"
            valor={b.ventanilla.horario}
            onChange={(v) => setVentanilla({ horario: v })}
          />
        </Seccion>

        <Seccion titulo="Datos bancarios" icono={<CreditCard className="size-4" aria-hidden />}>
          <Campo
            id="banco"
            etiqueta="Banco"
            valor={b.banco.banco}
            onChange={(v) => setBanco({ banco: v })}
          />
          <Campo
            id="cuenta"
            etiqueta="Número de cuenta"
            valor={b.banco.cuenta}
            onChange={(v) => setBanco({ cuenta: v })}
          />
          <Campo
            id="clabe"
            etiqueta="CLABE"
            valor={b.banco.clabe}
            onChange={(v) => setBanco({ clabe: v })}
          />
          <Campo
            id="benef"
            etiqueta="Beneficiario"
            valor={b.banco.beneficiario}
            onChange={(v) => setBanco({ beneficiario: v })}
          />
        </Seccion>

        <Seccion
          titulo="Catálogo académico"
          icono={<GraduationCap className="size-4" aria-hidden />}
        >
          <p className="text-sm text-muted-foreground">
            Los niveles, sus programas y cómo se llama su avance. Es lo que el alumno elige al
            pre-registrarse, y de aquí salen los reportes por programa. Si la universidad abre un
            doctorado, se agrega aquí y aparece en el formulario.
          </p>
          <Campo
            id="dominio"
            etiqueta="Dominio del correo institucional"
            valor={b.dominioInstitucional}
            onChange={(v) => set({ dominioInstitucional: v.trim().replace(/^@/, "") })}
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            Si lo dejas vacío se acepta cualquier correo. Hay universidades que no dan cuenta
            institucional a todos, y rechazar a quien no la tiene lo dejaría fuera del evento.
          </p>

          {b.catalogoAcademico.map((n, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Campo
                  id={`nivel-${i}`}
                  etiqueta="Nivel"
                  valor={n.nivel}
                  onChange={(v) => setNivel(i, { nivel: v })}
                />
                <Campo
                  id={`etiqueta-${i}`}
                  etiqueta="Su avance se llama"
                  valor={n.etiquetaAvance}
                  onChange={(v) => setNivel(i, { etiquetaAvance: v })}
                />
                <div>
                  <Label htmlFor={`total-${i}`}>Hasta</Label>
                  <Input
                    id={`total-${i}`}
                    inputMode="numeric"
                    maxLength={2}
                    value={String(n.totalAvance)}
                    onChange={(e) => {
                      const d = soloDigitos(e.target.value, 2);
                      setNivel(i, { totalAvance: d ? Number(d) : 0 });
                    }}
                    className="mt-1 h-11"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Label htmlFor={`programas-${i}`}>Programas, uno por renglón</Label>
                <Textarea
                  id={`programas-${i}`}
                  rows={Math.min(10, n.programas.length + 1)}
                  value={n.programas.join("\n")}
                  onChange={(e) =>
                    setNivel(i, {
                      programas: e.target.value.split("\n").map((x) => x.trimStart()),
                    })
                  }
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.programas.filter(Boolean).length} programas. Los renglones vacíos se descartan
                  al guardar.
                </p>
              </div>
              <Button
                variant="ghost"
                className="mt-3 h-10 text-destructive hover:text-destructive"
                disabled={b.catalogoAcademico.length === 1}
                onClick={() =>
                  set({ catalogoAcademico: b.catalogoAcademico.filter((_, k) => k !== i) })
                }
              >
                <Trash2 className="size-4" /> Quitar {n.nivel || "este nivel"}
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            className="h-11"
            onClick={() =>
              set({
                catalogoAcademico: [
                  ...b.catalogoAcademico,
                  { nivel: "", etiquetaAvance: "Semestre", totalAvance: 8, programas: [] },
                ],
              })
            }
          >
            <Plus className="size-4" /> Agregar un nivel
          </Button>
        </Seccion>

        <Seccion titulo="Soporte" icono={<LifeBuoy className="size-4" aria-hidden />}>
          <Campo
            id="wa"
            etiqueta="WhatsApp de soporte (con lada)"
            valor={b.whatsappSoporte}
            onChange={(v) => set({ whatsappSoporte: v })}
          />
          <Campo
            id="correo"
            etiqueta="Correo de soporte"
            valor={b.correoSoporte}
            onChange={(v) => set({ correoSoporte: v })}
          />
          <Campo
            id="horario-sop"
            etiqueta="Horario de atención"
            valor={b.horarioSoporte}
            onChange={(v) => set({ horarioSoporte: v })}
          />
        </Seccion>

        <Seccion titulo="Textos legales" icono={<ScrollText className="size-4" aria-hidden />}>
          <div>
            <Label htmlFor="aviso">Aviso de privacidad</Label>
            <Textarea
              id="aviso"
              rows={4}
              value={b.avisoPrivacidad}
              onChange={(e) => set({ avisoPrivacidad: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="terminos">Términos de participación</Label>
            <Textarea
              id="terminos"
              rows={4}
              value={b.terminos}
              onChange={(e) => set({ terminos: e.target.value })}
              className="mt-1"
            />
          </div>
        </Seccion>
      </div>
    </PantallaPanel>
  );
}

function Seccion({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        {icono}
        {titulo}
      </h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  onChange,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11"
      />
    </div>
  );
}
