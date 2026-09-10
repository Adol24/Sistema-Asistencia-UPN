import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FiltroSemaforo, ZonaDeArchivo } from "@/components/zona-archivo";
import { useImportador } from "@/lib/importador";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  CalendarDays,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { SemaforoFilaBadge } from "@/components/estado-badges";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEstadoEvento } from "@/lib/estado-evento";
import { simularLatencia } from "@/lib/formato";
import { descargarCsv } from "@/lib/exportar";
import {
  analizarPadron,
  COLUMNAS_PADRON,
  resumirPadron,
  type FilaPadron,
  type SemaforoPadron,
} from "@/lib/padron-importacion";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/padron")({
  head: () =>
    meta(
      "Importación del padrón — Administración del Encuentro",
      "Carga del padrón de alumnos con vista previa obligatoria, semáforo por fila y confirmación antes de aplicar.",
    ),
  component: ImportacionPadron,
});

function ImportacionPadron() {
  const {
    participantes,
    padron,
    aplicarPadron,
    guardarPadron,
    sedes,
    estadoDe,
    registrarBitacora,
    repartoPorDia,
    sinDiaAsignado,
    repartirDiasPendientes,
    reasignarDia,
    asignarDiaAVarios,
    infoDia,
    configuracion,
  } = useEstadoEvento();
  // Lo que la base rechazó: se enseña, no se esconde en la consola.
  const [rechazados, setRechazados] = useState<{ matricula: string; motivo: string }[]>([]);
  const [aplicado, setAplicado] = useState<{
    registros: number;
    altas: number;
    actualizaciones: number;
    sinDia: number;
  } | null>(null);
  const [repartiendo, setRepartiendo] = useState(false);

  // Mismo flujo que la carga masiva de pagos: soltar, analizar, filtrar,
  // confirmar y aplicar. Lo único propio es qué analiza y qué columnas pinta.
  const analizar = useCallback(
    (texto: string) =>
      analizarPadron({
        texto,
        padronActual: padron,
        participantes,
        catalogo: configuracion.catalogoAcademico,
        sedes,
        estadoDe: (p) => ({ evento: estadoDe(p).evento }),
      }),
    [padron, participantes, configuracion.catalogoAcademico, sedes, estadoDe],
  );
  const imp = useImportador<FilaPadron>(analizar);
  const { filas, leyendo, archivo, confirmando, aplicando, resumen, visibles } = imp;
  const pendientes = sinDiaAsignado();

  const altasNuevas = useMemo(
    () => (filas ?? []).filter((f) => f.alumno && !f.alumno.dia),
    [filas],
  );

  const aplicar = () =>
    imp.aplicar(async (filasAplicables) => {
      const aAplicar = filasAplicables.filter((f) => f.alumno).map((f) => f.alumno!);

      /*
       * Primero se guarda y después se actualiza la pantalla.
       *
       * Al revés, un rechazo de la base dejaría la pantalla diciendo que todo se
       * aplicó mientras la tabla se queda sin esas filas: exactamente el fallo
       * que este cambio viene a corregir.
       */
      const guardado = await guardarPadron(aAplicar);
      setRechazados(guardado.rechazados);
      if (guardado.rechazados.length)
        toast.error(
          `La base rechazó ${guardado.rechazados.length} de ${aAplicar.length}. Revisa el detalle abajo.`,
        );

      const r = aplicarPadron(aAplicar);
      registrarBitacora(
        "Importó el padrón de alumnos",
        `${archivo ?? "archivo"} · ${r.registros} registros · ${r.altas} altas · ${r.actualizaciones} actualizaciones · ${r.sinDia} sin día asignado`,
      );
      setAplicado(r);
      toast.success(
        r.sinDia > 0
          ? `Se aplicaron ${r.registros} registros. ${r.sinDia} quedaron sin día: reparte abajo.`
          : `Se aplicaron ${r.registros} registros al padrón.`,
      );
    });

  const repartir = async () => {
    setRepartiendo(true);
    await simularLatencia();
    const r = repartirDiasPendientes();
    setRepartiendo(false);
    toast.success(
      r.asignados === 0
        ? "Nadie estaba esperando día."
        : `${r.asignados} alumnos quedaron repartidos entre los tres días.`,
    );
  };

  // ------------------------------------------------- filtro del reparto ---
  // El día no se reparte alumno por alumno ni al azar: una sede viaja junta
  // desde su municipio, así que partirla en tres días obligaría a tres viajes
  // al mismo pueblo. Se filtra por sede, programa o grupo y se le da el día al
  // conjunto entero.
  const [fSede, setFSede] = useState("todas");
  const [fPrograma, setFPrograma] = useState("todos");
  const [fGrupo, setFGrupo] = useState("todos");
  const [fDia, setFDia] = useState("sin-dia");
  /** Búsqueda libre por matrícula o nombre, para dar con una persona concreta. */
  const [q, setQ] = useState("");

  const grupos = useMemo(
    () => [...new Set(padron.map((a) => a.grupo).filter((g): g is string => !!g))].sort(),
    [padron],
  );

  /*
   * La búsqueda es un filtro más, no algo aparte, y eso importa: lo que la
   * asignación en bloque mueve es exactamente lo que se está viendo. Si buscar
   * dejara la selección intacta, se buscaría a una persona, se pulsaría «día 2»
   * y se movería a todo el grupo sin darse cuenta.
   */
  const seleccion = useMemo(() => {
    const t = q.trim().toLowerCase();
    return padron.filter(
      (a) =>
        (fSede === "todas" || a.plantel === fSede) &&
        (fPrograma === "todos" || a.programa === fPrograma) &&
        (fGrupo === "todos" || a.grupo === fGrupo) &&
        (fDia === "todos" || (fDia === "sin-dia" ? !a.dia : a.dia === Number(fDia))) &&
        (!t ||
          a.matricula.toLowerCase().includes(t) ||
          a.nombre.toLowerCase().includes(t) ||
          (a.grupo ?? "").toLowerCase().includes(t)),
    );
  }, [padron, fSede, fPrograma, fGrupo, fDia, q]);

  const asignarASeleccion = (dia: 1 | 2 | 3) => {
    const r = asignarDiaAVarios(
      seleccion.map((a) => a.matricula),
      dia,
    );
    registrarBitacora(
      "Asignó día a un conjunto del padrón",
      `${seleccion.length} alumnos al día ${dia}` +
        ` (sede ${fSede}, programa ${fPrograma}, grupo ${fGrupo})`,
    );
    toast.success(
      `${seleccion.length} alumnos quedaron en el día ${dia}.` +
        (r.talleresLiberados
          ? ` A ${r.talleresLiberados} se les liberó el taller porque no se imparte ese día.`
          : ""),
    );
  };

  /**
   * La fila de ejemplo de la plantilla, armada con el catálogo de verdad.
   *
   * Antes iba escrita a mano —«Licenciatura en Psicología», «Campus Norte»— y
   * eran datos del prototipo que ya no existen. Quien descargaba la plantilla y
   * la llenaba siguiendo el ejemplo obtenía un archivo rechazado entero, y la
   * culpa parecía suya. Una plantilla que enseña valores inválidos es peor que
   * no dar plantilla.
   *
   * Además la fila tenía siete valores para seis columnas, así que cada dato
   * caía una casilla corrido.
   */
  const ejemplo = useMemo(() => {
    const nivel = configuracion.catalogoAcademico[0];
    return [
      [
        "20262100037",
        "MATIAS SANTOS RAMOS",
        nivel?.programas[0] ?? "",
        `${nivel?.etiquetaAvance ?? "Semestre"} 1`,
        "Grupo A",
        sedes[0] ?? "",
      ],
    ];
  }, [configuracion.catalogoAcademico, sedes]);

  return (
    <PantallaPanel
      area="admin"
      titulo="Importación del padrón"
      descripcion="Nada cambia hasta que confirmas. Primero revisas la vista previa, después aplicas."
      nav={navAdmin}
      acciones={
        <Button
          variant="outline"
          className="h-11"
          onClick={() => descargarCsv("plantilla-padron.csv", [...COLUMNAS_PADRON], ejemplo)}
        >
          <Download className="size-4" /> Descargar plantilla
        </Button>
      }
    >
      {rechazados.length > 0 ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" />
          <AlertTitle>La base rechazó {rechazados.length} filas</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Esas matrículas NO quedaron guardadas. Suele ser un nombre de programa o de plantel
              que no está en el catálogo; corrígelo en el archivo o dalo de alta en configuración y
              vuelve a importar.
            </p>
            <ul className="grid gap-1 text-xs">
              {rechazados.slice(0, 10).map((r) => (
                <li key={r.matricula}>
                  <span className="font-mono">{r.matricula}</span> — {r.motivo}
                </li>
              ))}
              {rechazados.length > 10 ? <li>… y {rechazados.length - 10} más</li> : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {aplicado !== null ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Se aplicaron {aplicado.registros} registros</AlertTitle>
          <AlertDescription className="grid gap-2">
            <span>
              {aplicado.altas} altas y {aplicado.actualizaciones} actualizaciones. El padrón tiene
              ahora {padron.length} alumnos y la identificación pública ya usa estos datos.
            </span>
            {aplicado.sinDia > 0 ? (
              <span className="rounded-md bg-estado-discrepancia-bg p-2 text-estado-discrepancia">
                <span className="font-semibold">{aplicado.sinDia} quedaron sin día asignado.</span>{" "}
                El archivo de Servicios Escolares no trae el día: lo reparte la organización, abajo.
                Mientras tanto, si uno de ellos se pre-registra, el sistema le asigna el día que va
                más vacío.
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {!filas && !leyendo ? (
        <section className="mb-4 rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            Reparto por días
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El día no lo entrega Servicios Escolares: lo asigna la organización. Aquí se ve cómo
            está repartido el padrón y se asigna día a quien todavía no tiene.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {repartoPorDia().map(({ dia, total }) => (
              <div key={dia} className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Día {dia} · {infoDia(dia).lugar}
                </p>
                <p className="text-2xl font-extrabold tabular-nums">{total}</p>
              </div>
            ))}
            <div
              className={cn(
                "rounded-lg border p-3",
                pendientes.length > 0
                  ? "border-estado-discrepancia/40 bg-estado-discrepancia-bg"
                  : "border-border bg-muted/40",
              )}
            >
              <p className="text-xs text-muted-foreground">Sin día</p>
              <p
                className={cn(
                  "text-2xl font-extrabold tabular-nums",
                  pendientes.length > 0 && "text-estado-discrepancia",
                )}
              >
                {pendientes.length}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">Asignar día a un conjunto</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Una sede viaja junta desde su municipio, así que se reparte por sede, por programa o
              por grupo, no alumno por alumno. Filtra y dale el día al conjunto entero.
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              <Campo etiqueta="Sede" valor={fSede} alCambiar={setFSede} todos="todas">
                {sedes.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Campo>
              <Campo etiqueta="Programa" valor={fPrograma} alCambiar={setFPrograma} todos="todos">
                {configuracion.catalogoAcademico.flatMap((n) =>
                  n.programas.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  )),
                )}
              </Campo>
              <Campo etiqueta="Grupo" valor={fGrupo} alCambiar={setFGrupo} todos="todos">
                {grupos.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Campo>
              <Campo etiqueta="Día actual" valor={fDia} alCambiar={setFDia} todos="todos">
                <option value="sin-dia">Sin día</option>
                {([1, 2, 3] as const).map((d) => (
                  <option key={d} value={String(d)}>
                    Día {d}
                  </option>
                ))}
              </Campo>
            </div>

            <div className="mt-3">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por matrícula, nombre o grupo"
                aria-label="Buscar en el padrón"
                className="h-11"
              />
              {q.trim() ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  La búsqueda acota la selección: lo que asignes abajo se aplica solo a estos.
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <p className="text-sm">
                <span className="text-2xl font-extrabold tabular-nums">{seleccion.length}</span>{" "}
                <span className="text-muted-foreground">
                  {seleccion.length === 1 ? "alumno coincide" : "alumnos coinciden"}
                </span>
              </p>
              <span className="flex flex-wrap gap-2 sm:ml-auto">
                {([1, 2, 3] as const).map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    className="h-11"
                    disabled={seleccion.length === 0}
                    onClick={() => asignarASeleccion(d)}
                  >
                    <CalendarDays className="size-4" /> Al día {d} · {infoDia(d).lugar}
                  </Button>
                ))}
              </span>
            </div>
            {seleccion.length > 0 && seleccion.some((a) => a.dia) ? (
              <p className="mt-2 text-xs text-estado-discrepancia">
                {seleccion.filter((a) => a.dia).length} de estos ya tenían día. Se les cambia, y a
                quien tuviera un taller que no se imparte el día nuevo se le libera la inscripción.
              </p>
            ) : null}
          </div>

          {pendientes.length > 0 ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button className="h-11" disabled={repartiendo} onClick={() => void repartir()}>
                  {repartiendo ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Repartiendo…
                    </>
                  ) : (
                    <>
                      <CalendarDays className="size-4" /> Repartir los {pendientes.length}{" "}
                      pendientes
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Salida rápida: cada uno cae en el día que va más vacío, sin mirar de qué sede
                  viene. Para repartir por sede usa el filtro de arriba.
                </p>
              </div>

              <ul className="mt-3 grid gap-2">
                {pendientes.slice(0, 12).map((a) => (
                  <li
                    key={a.matricula}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold">{a.nombre}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">{a.matricula}</span>
                    </span>
                    <span className="flex gap-1">
                      {([1, 2, 3] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            reasignarDia(a.matricula, d);
                            toast.success(`${a.nombre} queda en el día ${d}.`);
                          }}
                          className="h-10 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted"
                        >
                          Día {d}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
                {pendientes.length > 12 ? (
                  <li className="text-xs text-muted-foreground">
                    … y {pendientes.length - 12} más. Con estos volúmenes conviene repartirlos de
                    golpe.
                  </li>
                ) : null}
              </ul>
            </>
          ) : (
            <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Los {padron.length} alumnos del padrón tienen día asignado.
            </p>
          )}
        </section>
      ) : null}

      {!filas && !leyendo ? (
        <>
          <ZonaDeArchivo importador={imp} titulo="el padrón de Servicios Escolares" />

          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Columnas requeridas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              El padrón actual tiene {padron.length} alumnos. Una matrícula que ya exista se
              actualiza; una nueva se da de alta. El nombre va completo en una sola columna, y el
              nivel, el programa y el avance se validan contra el catálogo académico. El{" "}
              <span className="font-semibold">plantel</span> es dónde estudia, no el lugar del
              evento: esa la asigna la organización al repartir los días.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {COLUMNAS_PADRON.map((c) => (
                <li
                  key={c}
                  className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs"
                >
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Para probar hay un archivo de ejemplo:{" "}
              <a
                href="/ejemplos/padron-mixto.csv"
                download
                className="font-semibold text-primary underline"
              >
                padron-mixto.csv
              </a>{" "}
              — dispara altas nuevas sin día, actualizaciones, un cambio de nombre de alguien que ya
              pagó y siete errores distintos, incluidos un nivel que no existe, un programa que no
              es de su nivel y un avance fuera de rango.
            </p>
          </section>
        </>
      ) : null}

      {leyendo ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin" /> Revisando {archivo}…
          </p>
          <div className="mt-4 grid gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : null}

      {filas ? (
        <>
          <Alert className="mb-4">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {resumen.listo} registros listos, {resumen.advertencia} con advertencia,{" "}
              {resumen.error} con error
            </AlertTitle>
            <AlertDescription>
              Vista previa de {archivo}. Todavía no se ha modificado el padrón: los cambios se
              aplican solo cuando confirmas.
            </AlertDescription>
          </Alert>

          {altasNuevas.length > 0 ? (
            <Alert className="mb-4">
              <AlertTriangle className="size-4" />
              <AlertTitle>{altasNuevas.length} altas quedarán sin día asignado</AlertTitle>
              <AlertDescription>
                El archivo no trae el día, y estas matrículas no estaban en el padrón, así que nadie
                se lo ha asignado todavía. Al aplicar, repártelos desde el tablero de abajo. Si
                alguno se pre-registra antes, el sistema le asigna el día que va más vacío.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              <FiltroSemaforo importador={imp} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-11"
                disabled={resumen.error === 0}
                onClick={() =>
                  descargarCsv(
                    "errores-padron.csv",
                    ["fila", ...COLUMNAS_PADRON, "motivo"],
                    filas
                      .filter((f) => f.semaforo === "error")
                      .map((f) => [f.n, ...COLUMNAS_PADRON.map((c) => f.crudo[c] ?? ""), f.motivo]),
                  )
                }
              >
                <Download className="size-4" /> Descargar errores
              </Button>
              <Button variant="outline" className="h-11" onClick={imp.limpiar}>
                Cancelar
              </Button>
              <Button
                className="h-11"
                disabled={resumen.aplicables === 0 || aplicando}
                onClick={() => imp.setConfirmando(true)}
              >
                {aplicando ? <Loader2 className="size-4 animate-spin" /> : null}
                Aplicar solo los válidos ({resumen.aplicables})
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[68rem] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  {[
                    "#",
                    "Estado",
                    "Matrícula",
                    "Nombre completo",
                    "Programa",
                    "Avance",
                    "Grupo",
                    "Sede",
                    "Día",
                    "Resultado",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.n} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{f.n}</td>
                    <td className="px-3 py-2">
                      <SemaforoFilaBadge estado={f.semaforo} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{f.crudo["matricula"]}</td>
                    <td className="px-3 py-2">{f.crudo["nombre"]}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {f.crudo["programa"]}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.crudo["avance"]}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {f.crudo["grupo"] || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {f.crudo["sede"] ?? f.crudo["plantel"]}
                    </td>
                    <td className="px-3 py-2">{f.alumno?.dia ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.motivo}</td>
                  </tr>
                ))}
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                      Ninguna fila con ese resultado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <AlertDialog open={confirmando} onOpenChange={imp.setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar {resumen.aplicables} registros al padrón?</AlertDialogTitle>
            <AlertDialogDescription>
              Se darán de alta o se actualizarán {resumen.aplicables} alumnos. Las {resumen.error}{" "}
              filas con error se omiten.
              {altasNuevas.length > 0
                ? ` ${altasNuevas.length} altas quedarán esperando a que se les asigne día.`
                : ""}{" "}
              La acción no se puede deshacer desde esta pantalla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void aplicar()}>
              Sí, aplicar {resumen.aplicables}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PantallaPanel>
  );
}

/**
 * Un select del filtro. Existe para no repetir cuatro veces la misma etiqueta,
 * el mismo alto de toque y la misma opción «todos».
 */
function Campo({
  etiqueta,
  valor,
  alCambiar,
  todos,
  children,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  /** El valor que significa «sin filtrar»; cambia de género según la etiqueta. */
  todos: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {etiqueta}
      </span>
      <select
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="h-11 max-w-56 rounded-md border border-input bg-card px-2 text-sm"
      >
        <option value={todos}>{todos === "todas" ? "Todas" : "Todos"}</option>
        {children}
      </select>
    </label>
  );
}
