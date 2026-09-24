import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarClock,
  CreditCard,
  GraduationCap,
  Info,
  LifeBuoy,
  Plus,
  Save,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { soloDigitos } from "@/lib/campos";
import { useAforo } from "@/lib/cupo";
import { camposSinGuardar } from "@/lib/escritura-remota";
import { PantallaPanel } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CampoNumero } from "@/components/campo-numero";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  fechaAIso,
  fechaLimiteTexto,
  isoAMomentoLocal,
  momentoLocalAIso,
  simularLatencia,
} from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  estadoDeVentana,
  perfilesSinVentana,
  problemasDeVentana,
  programasSinVentana,
  useVentanas,
  ventanaNueva,
  PERFILES_SIN_PADRON,
  type PerfilSinPadron,
  type ProgramaDeVentana,
  type VentanaPreregistro,
} from "@/lib/ventanas";
import type { ConfiguracionEvento } from "@/lib/configuracion";
import type { Dia } from "@/dominio/tipos";
import type { ProgramaAcademico } from "@/dominio/catalogos";

export const Route = createFileRoute("/admin/configuracion")({
  head: () =>
    meta(
      "Configuración del evento — Administración",
      "Fechas, lugares, cuotas, datos bancarios, fechas límite, ventanas de pre-registro, WhatsApp de soporte y textos legales del Encuentro.",
    ),
  component: Configuracion,
});

function Configuracion() {
  const { configuracion, actualizarConfiguracion, registrarBitacora } = useEstadoEvento();
  const [b, setB] = useState<ConfiguracionEvento>(configuracion);
  const [guardando, setGuardando] = useState(false);
  const aforo = useAforo();

  /*
   * Las ventanas de pre-registro viven en sus propias tablas y no en
   * `ConfiguracionEvento`, así que traen su propio borrador.
   *
   * No entran por el contexto compartido —que es por donde va todo lo demás de
   * esta pantalla— porque nadie más las necesita: el alumno que llega fuera de
   * plazo recibe su frase ya redactada de `fn_ventana_de_matricula`, y meterlas
   * en el estado global obligaría a cargarlas en cada visita a la portada para
   * que las leyera una sola pantalla del panel.
   */
  const ventanasRemotas = useVentanas();
  const [ventanas, setVentanas] = useState<VentanaPreregistro[]>([]);
  // Se copian cuando llegan, y cuando vuelven a llegar después de guardar. La
  // lista remota es un array nuevo en cada carga, así que esto no se dispara
  // mientras se edita.
  useEffect(() => setVentanas(ventanasRemotas.ventanas), [ventanasRemotas.ventanas]);

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

  /**
   * Un programa dentro de un nivel. `undefined` en la etiqueta o en el tope
   * significa «como mi nivel», así que el patch los borra en vez de guardar
   * cadena vacía o cero: un 0 se leería como «llega hasta cero».
   */
  const setPrograma = (i: number, j: number, patch: Partial<ProgramaAcademico>) =>
    setB((prev) => ({
      ...prev,
      catalogoAcademico: prev.catalogoAcademico.map((n, k) =>
        k === i
          ? { ...n, programas: n.programas.map((p, m) => (m === j ? { ...p, ...patch } : p)) }
          : n,
      ),
    }));

  const setVentanilla = (patch: Partial<ConfiguracionEvento["ventanilla"]>) =>
    setB({ ...b, ventanilla: { ...b.ventanilla, ...patch } });

  const cambiosVentanas = JSON.stringify(ventanas) !== JSON.stringify(ventanasRemotas.ventanas);
  const cambios = JSON.stringify(b) !== JSON.stringify(configuracion) || cambiosVentanas;

  const guardar = async () => {
    /*
     * Las ventanas se comprueban ANTES de escribir nada.
     *
     * No es orden arbitrario: si se guardara primero la configuración y las
     * ventanas se rechazaran después, la pantalla quedaría a medio guardar y el
     * aviso tendría que explicar qué parte sí y qué parte no. Comprobar lo
     * bloqueante al principio deja el guardado en todo o nada.
     */
    const problemas = ventanas.flatMap((v) => problemasDeVentana(v, ventanasRemotas.programas));
    if (problemas.length) {
      toast.error("No se guardó nada: revisa las ventanas de pre-registro.", {
        description: problemas.slice(0, 3).join(" "),
        duration: 10000,
      });
      return;
    }

    setGuardando(true);
    await simularLatencia();

    if (cambiosVentanas) {
      try {
        const { guardarVentanas } = await import("@/lib/datos");
        await guardarVentanas(ventanas);
        registrarBitacora(
          "Editó las ventanas de pre-registro",
          ventanas.length
            ? ventanas.map((v) => `«${v.etiqueta.trim()}»`).join(", ")
            : "no queda ninguna: el pre-registro quedó abierto para todos",
        );
        ventanasRemotas.recargar();
      } catch (e: unknown) {
        const { mensajeDeError } = await import("@/lib/supabase");
        setGuardando(false);
        toast.error("No se pudieron guardar las ventanas de pre-registro.", {
          description: `${mensajeDeError(e)} No se guardó nada más.`,
          duration: 10000,
        });
        return;
      }
    }
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
        programas: n.programas
          .map((p) => ({ ...p, nombre: p.nombre.trim() }))
          .filter((p) => p.nombre),
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
    // Solo si de verdad cambió algo de la configuración. Las ventanas ya dejaron
    // su propia anotación más arriba, y sin esta guarda tocar una fecha de
    // pre-registro escribiría además un «Editó la configuración del evento ·
    // Cambios generales» que no ocurrió.
    if (JSON.stringify(limpio) !== JSON.stringify(configuracion))
      registrarBitacora(
        "Editó la configuración del evento",
        campos.length ? campos.join(", ") : "Cambios generales",
      );
    setGuardando(false);

    /*
     * El aviso dice lo que pasó, no lo que se esperaba que pasara.
     *
     * Aquí había un `toast.success` incondicional: «Configuración guardada. Las
     * pantallas públicas ya la usan.» Se disparaba igual cuando la capa de
     * escritura descartaba el campo por no tener columna, que era el caso de
     * trece de los veintitrés campos de esta pantalla. Un descarte silencioso y
     * un guardado correcto se veían exactamente igual, y por eso duró tanto.
     *
     * Se comparan los campos CAMBIADOS, no todos: preguntar por el parche
     * completo haría que el aviso nombrara el catálogo académico cada vez que
     * alguien corrige el teléfono de soporte.
     */
    const cambiados: Partial<ConfiguracionEvento> = {};
    for (const campo of Object.keys(limpio) as (keyof ConfiguracionEvento)[])
      if (JSON.stringify(limpio[campo]) !== JSON.stringify(configuracion[campo]))
        (cambiados[campo] as unknown) = limpio[campo];

    const sinGuardar = camposSinGuardar(cambiados);
    if (sinGuardar.length)
      toast.warning(`Se guardó todo menos ${sinGuardar.join(" y ")}.`, {
        description:
          "Ese cambio no se conserva: todavía no hay dónde escribirlo. Se pierde al recargar.",
        duration: 8000,
      });
    // Quedarse sin ninguna ventana no es un guardado más: ABRE el pre-registro
    // para todo el mundo. Se dice aparte y con el aviso de advertencia, porque
    // una lista vacía en pantalla sugiere justo lo contrario.
    else if (cambiosVentanas && !ventanas.length)
      toast.warning("Ya no queda ninguna ventana: el pre-registro está abierto para todos.", {
        description: "Cualquier alumno del padrón puede registrarse desde ahora mismo.",
        duration: 10000,
      });
    else if (cambiosVentanas)
      toast.success("Guardado. Las ventanas de pre-registro ya están en vigor.");
    else toast.success("Configuración guardada. Las pantallas públicas ya la usan.");
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Configuración del evento"
      descripcion="Estos valores alimentan las pantallas públicas: el cambio se ve sin recargar."
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

      {/*
        Dos columnas independientes, no una rejilla de dos.
        Con `grid-cols-2` cada renglón se alinea al alto de la tarjeta más
        grande, y aquí una sección va de veinte líneas a ciento cuarenta: el
        catálogo académico dejaba media pantalla en blanco al lado de «Datos
        bancarios». Dos pilas que crecen por su cuenta no tienen renglones que
        alinear, así que no queda hueco que rellenar.

        El reparto es por sentido y no por tamaño: a la izquierda el evento
        —qué es, dónde, cuándo y cuánto cuesta— y a la derecha los catálogos y
        la letra pequeña. Que además queden parejas de alto es casualidad
        afortunada, no el criterio.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
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
            {/*
              Aquí había un campo «Horario general». Se quitó: `horario` es
              DERIVADO —la base guarda los dos tramos de registro y el horario se
              arma juntándolos al leer—, así que no hay columna que escribir y
              editarlo no hacía nada. Los dos tramos se editan justo abajo, que es
              donde el dato existe de verdad.
            */}
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
                  <CampoNumero
                    id={`cupo-${d.dia}`}
                    min={1}
                    valor={d.cupo}
                    alCambiar={(cupo) =>
                      set({ dias: b.dias.map((x, k) => (k === i ? { ...x, cupo } : x)) })
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
                      Ya hay {ocupadosDe(d.dia)} personas pre-registradas ese día. Si guardas{" "}
                      {d.cupo}, {ocupadosDe(d.dia)! - d.cupo} se quedan sin lugar y hay que
                      reubicarlas a mano.
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
              <CampoNumero
                id="cuota"
                min={0}
                valor={b.cuotaEvento}
                alCambiar={(cuotaEvento) => set({ cuotaEvento })}
                className="mt-1 h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Es el monto que Servicios Financieros espera y el que aparece en las instrucciones
                de pago.
              </p>
            </div>
            {/*
              Fecha Y hora, y contra el valor crudo de la base.
              Era un campo de texto sobre «viernes, 9 de octubre» —la frase que
              esta pantalla recibía ya formateada—, así que no había nada que
              guardar aunque el mapa de columnas lo hubiera admitido.
              La hora se pide porque el vencimiento la tiene (18:00). Con un campo
              de solo fecha, tocarlo lo habría movido a las 00:00 de ese día:
              siete horas antes, dejando fuera a quien llegó a tiempo.
            */}
            <div>
              <Label htmlFor="limite">Fecha y hora límite de entrega de vouchers</Label>
              <Input
                id="limite"
                type="datetime-local"
                value={isoAMomentoLocal(b.fechaLimite)}
                onChange={(e) => set({ fechaLimite: momentoLocalAIso(e.target.value) })}
                className="mt-1 h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Al participante se le anuncia solo el día: «antes del{" "}
                {fechaLimiteTexto(b.fechaLimite) || "…"}». La hora manda para el corte.
              </p>
            </div>
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
                Es el plazo que se le promete al alumno: pasado ese tiempo descarga su QR del
                portal.
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
        </div>

        <div className="grid content-start gap-4">
          <Seccion
            titulo="Catálogo académico"
            icono={<GraduationCap className="size-4" aria-hidden />}
          >
            {/*
              Aquí estaba el dominio del correo institucional, y se retira.
              En la UPN nadie tiene cuenta institucional, así que el campo
              existía para dejarse vacío siempre: una casilla que solo se puede
              contestar de una manera no es una decisión, es un trámite. Encima
              vivía dentro del catálogo académico, con el que no tiene nada que
              ver, porque no había dónde ponerlo.

              No se toca nada más. La columna sigue en la base, y la
              comprobación de `completar-datos` sigue en pie —es `if (dominio
              && ...)`, inerte mientras esté vacío— igual que la de
              `fn_preregistrar_alumno`, que es la que manda. Si algún día la
              universidad da cuentas, el campo vuelve aquí y todo lo demás ya
              está puesto.
            */}
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
                  <Label>Programas</Label>
                  <p className="mb-2 mt-1 text-xs text-muted-foreground">
                    Los dos campos de la derecha solo se llenan cuando el programa{" "}
                    <strong>no</strong> se cuenta como su nivel. Vacíos heredan «{n.etiquetaAvance}»
                    hasta {n.totalAvance}.
                  </p>
                  <div className="grid gap-2">
                    {n.programas.map((p, j) => (
                      <div key={j} className="grid gap-2 sm:grid-cols-[1fr_9rem_5rem_auto]">
                        <Input
                          aria-label={`Nombre del programa ${j + 1} de ${n.nivel}`}
                          value={p.nombre}
                          onChange={(e) =>
                            setPrograma(i, j, { nombre: e.target.value.trimStart() })
                          }
                          className="h-11"
                        />
                        <Input
                          aria-label={`Cómo se cuenta el avance de ${p.nombre || "este programa"}`}
                          placeholder={n.etiquetaAvance}
                          value={p.etiquetaAvance ?? ""}
                          onChange={(e) =>
                            setPrograma(i, j, {
                              etiquetaAvance: e.target.value.trim() || undefined,
                            })
                          }
                          className="h-11"
                        />
                        <Input
                          aria-label={`Hasta qué avance llega ${p.nombre || "este programa"}`}
                          inputMode="numeric"
                          maxLength={2}
                          placeholder={String(n.totalAvance)}
                          value={p.totalAvance ? String(p.totalAvance) : ""}
                          onChange={(e) => {
                            const d = soloDigitos(e.target.value, 2);
                            setPrograma(i, j, { totalAvance: d ? Number(d) : undefined });
                          }}
                          className="h-11"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${p.nombre || "este programa"}`}
                          className="h-11 w-11 text-destructive hover:text-destructive"
                          onClick={() =>
                            setNivel(i, { programas: n.programas.filter((_, k) => k !== j) })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="mt-2 h-10"
                    onClick={() => setNivel(i, { programas: [...n.programas, { nombre: "" }] })}
                  >
                    <Plus className="size-4" /> Agregar un programa
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.programas.filter((p) => p.nombre.trim()).length} programas. Los que se queden
                    sin nombre se descartan al guardar.
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

          <Seccion
            titulo="Datos bancarios"
            icono={<CreditCard className="size-4" aria-hidden />}
            pares
          >
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
              id="benef"
              etiqueta="Beneficiario"
              valor={b.banco.beneficiario}
              onChange={(v) => setBanco({ beneficiario: v })}
            />
          </Seccion>

          <Seccion titulo="Soporte" icono={<LifeBuoy className="size-4" aria-hidden />} pares>
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
      </div>

      {/*
        A lo ancho, y debajo de las dos columnas.

        No cabe en ninguna de ellas: una sola ventana enseña los nueve programas
        del catálogo con su casilla y su avance, así que en media pantalla los
        nombres largos —«Maestría en Didácticas de Lenguas y Culturas
        Indoamericanas»— se parten en tres renglones y la lista deja de poder
        recorrerse de un vistazo.
      */}
      <div className="mt-4">
        <SeccionVentanas
          ventanas={ventanas}
          programas={ventanasRemotas.programas}
          cargando={ventanasRemotas.cargando}
          error={ventanasRemotas.error}
          sinBase={ventanasRemotas.sinBase}
          cambiar={setVentanas}
        />
      </div>
    </PantallaPanel>
  );
}

/**
 * Cuándo se puede pre-registrar cada grupo.
 *
 * Es la única parte de esta pantalla que puede dejar a una generación entera
 * fuera del evento sin que nada falle, así que se escribe al revés que el
 * resto: en vez de guardar lo que se teclee y avisar después, no deja guardar
 * lo que no admite a nadie y enseña en todo momento a quién está dejando fuera.
 */
function SeccionVentanas({
  ventanas,
  programas,
  cargando,
  error,
  sinBase,
  cambiar,
}: {
  ventanas: VentanaPreregistro[];
  programas: ProgramaDeVentana[];
  cargando: boolean;
  error: string;
  sinBase: boolean;
  cambiar: (v: VentanaPreregistro[]) => void;
}) {
  const sinVentana = programasSinVentana(ventanas, programas);
  const sinVentanaPerfil = perfilesSinVentana(ventanas);

  const setVentana = (i: number, patch: Partial<VentanaPreregistro>) =>
    cambiar(ventanas.map((v, k) => (k === i ? { ...v, ...patch } : v)));

  const alternar = (i: number, programaId: string) => {
    const v = ventanas[i]!;
    const dentro = v.cohortes.some((c) => c.programaId === programaId);
    setVentana(i, {
      cohortes: dentro
        ? v.cohortes.filter((c) => c.programaId !== programaId)
        : // Entra sin avance a propósito. Poner uno por omisión sería inventar
          // la regla que la migración 44 se negó a inventar: la organización
          // invitó al 7 de las licenciaturas —el penúltimo— y al 13 de las
          // modulares —el último—, y no hay forma de deducir cuál toca.
          [...v.cohortes, { programaId, avance: null }],
    });
  };

  const setAvance = (i: number, programaId: string, avance: number | null) =>
    setVentana(i, {
      cohortes: ventanas[i]!.cohortes.map((c) =>
        c.programaId === programaId ? { ...c, avance } : c,
      ),
    });

  const alternarPerfil = (i: number, perfil: PerfilSinPadron) => {
    const v = ventanas[i]!;
    setVentana(i, {
      perfiles: v.perfiles.includes(perfil)
        ? v.perfiles.filter((p) => p !== perfil)
        : [...v.perfiles, perfil],
    });
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <CalendarClock className="size-4" aria-hidden />
        Ventanas de pre-registro
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Qué grupo puede registrarse y en qué días —alumnos por generación, docentes y externos por
        perfil—. El texto de cada ventana es el que lee quien llega fuera de plazo, con la fecha
        detrás: «… abre el 25/09/2026».
      </p>

      {sinBase ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Sin base configurada no hay ventanas que enseñar. Esto se edita contra el proyecto real.
        </p>
      ) : error ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>
            No se pudieron leer las ventanas: {error} <strong>No guardes desde aquí</strong> hasta
            que carguen: se mandaría una lista vacía y borraría las que haya.
          </span>
        </p>
      ) : cargando ? (
        <p className="mt-3 text-sm text-muted-foreground">Cargando las ventanas…</p>
      ) : (
        <>
          {/*
            El interruptor, dicho donde se toma la decisión.
            Una lista vacía parece «cerrado» y significa lo contrario.
          */}
          {!ventanas.length && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                Sin ninguna ventana, el pre-registro está <strong>abierto para todos</strong>:
                cualquier alumno del padrón, docente o externo puede registrarse hoy. Agrega una
                para limitarlo por fechas.
              </span>
            </p>
          )}

          <div className="mt-3 grid gap-4">
            {ventanas.map((v, i) => {
              const estado = estadoDeVentana(v);
              const problemas = problemasDeVentana(v, programas);
              return (
                <div key={v.id || `nueva-${i}`} className="rounded-lg border border-border p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_14rem_14rem]">
                    <div>
                      <Label htmlFor={`vent-${i}`}>Lo que lee quien llega fuera de plazo</Label>
                      <Input
                        id={`vent-${i}`}
                        value={v.etiqueta}
                        placeholder="El registro de séptimo semestre y de los módulos 9 y 13"
                        onChange={(e) => setVentana(i, { etiqueta: e.target.value })}
                        className="mt-1 h-11"
                      />
                    </div>
                    {/*
                      Fecha Y hora, y en la hora de este equipo. Es el mismo trato
                      que la fecha límite de los vouchers: un campo de solo fecha
                      movería la apertura a las 00:00 sin decirlo.
                    */}
                    <div>
                      <Label htmlFor={`abre-${i}`}>Abre</Label>
                      <Input
                        id={`abre-${i}`}
                        type="datetime-local"
                        value={isoAMomentoLocal(v.abre)}
                        onChange={(e) => setVentana(i, { abre: momentoLocalAIso(e.target.value) })}
                        className="mt-1 h-11"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`cierra-${i}`}>Cierra</Label>
                      <Input
                        id={`cierra-${i}`}
                        type="datetime-local"
                        value={isoAMomentoLocal(v.cierra)}
                        onChange={(e) =>
                          setVentana(i, { cierra: momentoLocalAIso(e.target.value) })
                        }
                        className="mt-1 h-11"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-xs">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-semibold",
                        estado === "abierta"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {estado === "abierta"
                        ? "Abierta ahora"
                        : estado === "pendiente"
                          ? "Todavía no abre"
                          : "Ya cerró"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {v.cohortes.length} programa{v.cohortes.length === 1 ? "" : "s"} y{" "}
                      {v.perfiles.length} perfil{v.perfiles.length === 1 ? "" : "es"} declarado
                      {v.cohortes.length + v.perfiles.length === 1 ? "" : "s"}.
                    </span>
                  </p>

                  {/*
                    Docentes y externos van ARRIBA de los programas, y no al
                    final como un añadido. Son dos casillas contra nueve, y
                    puestas debajo se perdían: quien entra a esta pantalla a
                    poner las fechas de los docentes tiene que encontrarlas sin
                    recorrer el catálogo académico entero.
                  */}
                  <div className="mt-3">
                    <Label>Quiénes entran</Label>
                    <p className="mb-2 mt-1 text-xs text-muted-foreground">
                      Una ventana puede ser de programas, de perfiles o de los dos. Lo que no puede
                      es quedarse vacía: así no admite a nadie.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PERFILES_SIN_PADRON.map((p) => {
                        const dentro = v.perfiles.includes(p.perfil);
                        return (
                          <div
                            key={p.perfil}
                            className={cn(
                              "flex items-center gap-2 rounded-md border p-2",
                              dentro ? "border-primary/50 bg-primary/5" : "border-border",
                            )}
                          >
                            <Checkbox
                              id={`v${i}-perfil-${p.perfil}`}
                              checked={dentro}
                              onCheckedChange={() => alternarPerfil(i, p.perfil)}
                            />
                            <label
                              htmlFor={`v${i}-perfil-${p.perfil}`}
                              className="min-w-0 flex-1 cursor-pointer text-xs leading-tight"
                            >
                              <span className="block font-medium">{p.nombre}</span>
                              <span className="text-muted-foreground">
                                Sin padrón: entran por perfil, no por generación
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mb-2 mt-3 text-xs text-muted-foreground">
                      Los alumnos se marcan programa por programa y con el avance exacto: la
                      invitación es a una generación, no a «del 7 en adelante». Sin avance, la
                      ventana no se guarda.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {programas.map((p) => {
                        const cohorte = v.cohortes.find((c) => c.programaId === p.id);
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "flex items-center gap-2 rounded-md border p-2",
                              cohorte ? "border-primary/50 bg-primary/5" : "border-border",
                            )}
                          >
                            <Checkbox
                              id={`v${i}-p${p.id}`}
                              checked={Boolean(cohorte)}
                              onCheckedChange={() => alternar(i, p.id)}
                            />
                            <label
                              htmlFor={`v${i}-p${p.id}`}
                              className="min-w-0 flex-1 cursor-pointer text-xs leading-tight"
                            >
                              <span className="block font-medium">{p.nombre}</span>
                              <span className="text-muted-foreground">
                                {p.nivel} · {p.etiquetaAvance.toLowerCase()} 1 a {p.totalAvance}
                              </span>
                            </label>
                            {cohorte && (
                              <Input
                                aria-label={`${p.etiquetaAvance} invitado de ${p.nombre}`}
                                inputMode="numeric"
                                maxLength={2}
                                placeholder={`1–${p.totalAvance}`}
                                value={cohorte.avance === null ? "" : String(cohorte.avance)}
                                onChange={(e) => {
                                  const d = soloDigitos(e.target.value, 2);
                                  setAvance(i, p.id, d ? Number(d) : null);
                                }}
                                className="h-9 w-16 shrink-0 text-center"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {problemas.length > 0 && (
                    <ul className="mt-3 grid gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                      {problemas.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <TriangleAlert
                            className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                            aria-hidden
                          />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    variant="ghost"
                    className="mt-3 h-10 text-destructive hover:text-destructive"
                    onClick={() => cambiar(ventanas.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="size-4" /> Quitar {v.etiqueta.trim() || "esta ventana"}
                  </Button>
                </div>
              );
            })}
          </div>

          <Button
            variant="outline"
            className="mt-3 h-11"
            onClick={() => cambiar([...ventanas, ventanaNueva()])}
          >
            <Plus className="size-4" /> Agregar una ventana
          </Button>

          {/*
            A quién no ha invitado nadie todavía.

            No es un error: la organización abre primero a séptimo semestre y a
            los módulos 9 y 13, y anuncia el resto después. Pero es lo que hay que ver antes de
            cerrar la pantalla, porque sus alumnos reciben «todavía no se anuncia
            la fecha de registro para tu grupo» y eso tiene que ser una decisión.
          */}
          {ventanas.length > 0 && sinVentana.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin ventana todavía: {sinVentana.map((p) => p.nombre).join(", ")}. A sus alumnos se
              les dirá que la fecha de su grupo aún no se anuncia.
            </p>
          )}

          {/*
            Los perfiles se avisan aparte y con otras palabras, porque su
            interruptor es otro: mientras NINGUNA ventana nombre un perfil,
            docentes y externos entran cuando quieran —`perfilesSinVentana`
            devuelve una lista vacía y esto no aparece—. En cuanto una ventana
            nombra a uno, el que nadie nombró se queda fuera, y eso sí hay que
            verlo antes de salir de la pantalla.
          */}
          {sinVentanaPerfil.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sin ventana todavía: {sinVentanaPerfil.map((p) => p.nombre).join(", ")}. Como alguna
              ventana ya nombra un perfil, a estos se les dirá que su fecha aún no se anuncia.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Seccion({
  titulo,
  icono,
  pares,
  children,
}: {
  titulo: string;
  icono: React.ReactNode;
  /**
   * Pone los campos de dos en dos cuando la tarjeta tiene sitio.
   *
   * Es lo que se hace con el ancho que sobra, y no ensanchar el campo. Una
   * cuenta son once dígitos y un horario cabe en cinco palabras: estirarlos a
   * media pantalla no los hace más fáciles de llenar, solo aleja la etiqueta
   * de su control y deja la mitad derecha en blanco. Dos por renglón usan el
   * mismo espacio enseñando el doble.
   *
   * No lo llevan las secciones cuyos campos son largos de verdad —los textos
   * legales, el catálogo académico— ni las que ya arman su propia rejilla.
   */
  pares?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        {icono}
        {titulo}
      </h2>
      <div className={cn("mt-3 grid gap-3", pares && "sm:grid-cols-2")}>{children}</div>
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
