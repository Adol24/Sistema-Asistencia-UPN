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
import { useAforo } from "@/lib/cupo";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEstadoEvento } from "@/lib/estado-evento";
import { fechaAIso, simularLatencia } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { ConfiguracionEvento } from "@/lib/configuracion";
import type { Dia } from "@/dominio/tipos";

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
  const aforo = useAforo();

  /**
   * Cuánta gente hay ya pre-registrada ese día, o `null` si no se pudo contar.
   *
   * `null` y no `0`: con 0 el aviso de «te quedas corto» no saltaría nunca y
   * nadie sabría que no llegó a comprobarse.
   */
  const ocupadosDe = (dia: number): number | null => aforo.porDia.get(dia as Dia)?.ocupados ?? null;

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
      // Los días sin tocar conservan lo que hubiera en la base. Si venía en el
      // formato de lectura, se normaliza aquí: la columna es de tipo `date` y
      // el reloj del evento la compara contra hoy en AAAA-MM-DD.
      dias: b.dias.map((d) => ({ ...d, fecha: fechaAIso(d.fecha) })),
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
    // El aforo se nombra uno por uno y con los dos valores. Es el dato que más
    // cara sale de cambiar sin que nadie se entere: deja gente fuera del evento.
    for (const d of b.dias) {
      const antes = configuracion.dias.find((x) => x.dia === d.dia)?.cupo;
      if (antes !== undefined && antes !== d.cupo)
        campos.push(`aforo del día ${d.dia} ${antes} → ${d.cupo}`);
    }
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
            {/*
              No dice «registro de salida» porque no se registra ninguna: es la
              hora a la que termina el día, y solo se publica como horario.
            */}
            <Campo
              id="salida"
              etiqueta="Término del día (no se escanea salida)"
              valor={b.registroSalida}
              onChange={(v) => set({ registroSalida: v })}
            />
          </div>
        </Seccion>

        <Seccion titulo="Lugares por día" icono={<Building2 className="size-4" aria-hidden />}>
          {b.dias.map((d, i) => (
            <div
              key={d.dia}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              {/*
                La fecha se elige en el calendario del dispositivo y no se
                escribe a mano. La columna es de tipo `date` y el reloj del
                evento la compara contra el día de hoy, así que tiene que ser
                AAAA-MM-DD exacto: un «15/10/2026» tecleado se guardaba como el
                9 de octubre o reventaba, y el error no se ve hasta que la
                puerta no reconoce el día. `fechaAIso` rescata lo que ya
                estuviera guardado en el formato de lectura.
              */}
              <Campo
                id={`fecha-${d.dia}`}
                etiqueta={`${d.etiqueta} — fecha`}
                tipo="date"
                valor={fechaAIso(d.fecha)}
                onChange={(v) =>
                  set({ dias: b.dias.map((x, k) => (k === i ? { ...x, fecha: v } : x)) })
                }
              />
              <Campo
                id={`lugar-${d.dia}`}
                etiqueta="Lugar"
                valor={d.lugar}
                onChange={(v) =>
                  set({ dias: b.dias.map((x, k) => (k === i ? { ...x, lugar: v } : x)) })
                }
              />
              {/*
                El aforo va pegado al lugar, no en una sección aparte, porque es
                una propiedad del edificio: el día 3 admite 600 y no 700 porque
                es otro sitio. Separarlos hacía fácil cambiar la sede y dejar el
                aforo de la anterior.
              */}
              <div className="sm:col-span-2">
                <Label htmlFor={`cupo-${d.dia}`}>Aforo — cuánta gente cabe</Label>
                <Input
                  id={`cupo-${d.dia}`}
                  type="number"
                  min={1}
                  value={d.cupo}
                  onChange={(e) =>
                    set({
                      dias: b.dias.map((x, k) =>
                        k === i ? { ...x, cupo: Number(e.target.value) } : x,
                      ),
                    })
                  }
                  className="mt-1 h-11"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Ocupa lugar quien se pre-registró, haya pagado o no. Al llegar al tope, ese día
                  deja de ofrecerse y el pre-registro lo rechaza.
                </p>
                {/*
                  Bajar el aforo por debajo de los que ya entraron no se
                  prohíbe: una sede se puede reducir de verdad, y el sistema no
                  es quién para negarlo. Lo que no puede es dejar que pase en
                  silencio, porque a esa gente ya se le confirmó su lugar.
                */}
                {ocupadosDe(d.dia) !== null && d.cupo < ocupadosDe(d.dia)! ? (
                  <p className="mt-1 text-xs font-semibold text-destructive">
                    Ya hay {ocupadosDe(d.dia)} personas pre-registradas ese día. Si guardas {d.cupo}
                    , {ocupadosDe(d.dia)! - d.cupo} se quedan sin lugar y hay que reubicarlas a
                    mano.
                  </p>
                ) : null}
              </div>
              {/*
                Los puntos se escriben con el nombre que tienen en esa sede. Van
                por día porque no es el mismo sitio, y un reporte que dice
                «Puerta A» es un reporte que nadie sabe traducir a un lugar real.
              */}
              <div className="sm:col-span-2">
                <Campo
                  id={`puntos-${d.dia}`}
                  etiqueta="Puntos de captura, separados por comas"
                  valor={d.puntos.join(", ")}
                  onChange={(v) =>
                    set({
                      dias: b.dias.map((x, k) =>
                        k === i
                          ? {
                              ...x,
                              puntos: v
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : x,
                      ),
                    })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Uno por cada capturista, con el nombre de esa sede. Incluye la mesa de
                  incidencias: ahí se registra la entrada de quien salió en rojo y resultó estar
                  bien. En blanco, la aplicación usa nombres genéricos.
                </p>
              </div>
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
  tipo,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  /** `date` abre el calendario del dispositivo y escribe siempre AAAA-MM-DD. */
  tipo?: "text" | "date";
}) {
  return (
    <div>
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        type={tipo ?? "text"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11"
      />
    </div>
  );
}
