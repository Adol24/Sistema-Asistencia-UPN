import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FiltroSemaforo, ZonaDeArchivo } from "@/components/zona-archivo";
import { Campo } from "@/components/tipografia";
import { useImportador } from "@/lib/importador";
import type { OrigenTabla } from "@/lib/csv";
import { AlertTriangle, CheckCircle2, Download, CalendarDays, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { usePaginacion } from "@/lib/paginacion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { useEstadoEvento } from "@/lib/estado-evento";
import { simularLatencia } from "@/lib/formato";
import { descargarCsv } from "@/lib/exportar";
import { analizarPadron, COLUMNAS_PADRON, type FilaPadron } from "@/lib/padron-importacion";
import { avanceTexto, cuentaDeAvance } from "@/dominio/catalogos";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Cuántas filas se pintan por página, en las dos tablas de esta pantalla.
 *
 * Antes la vista previa las pintaba todas —un padrón de Servicios Escolares
 * trae miles— y la lista del reparto cortaba en las primeras cien con un
 * aviso, así que a quien estuviera en el alumno 101 no había forma de llegar
 * salvo acotando los filtros hasta dar con él. Diez por página es lo que se
 * abarca de una mirada sin desplazar la pantalla, y ahora no queda nadie
 * fuera: están todos, repartidos.
 */
const POR_PAGINA = 10;

/** Los dos trabajos de esta pantalla. Ver el comentario de las pestañas. */
type Pestana = "importar" | "reparto";

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
  /*
   * Arranca en «importar» porque es el nombre de la pantalla y a lo que se
   * entra desde el menú. Al reparto se llega después de aplicar un archivo, y
   * para eso está el botón del aviso: llevar ahí de entrada obligaría a volver
   * a la pestaña que sí se venía a usar.
   */
  const [pestana, setPestana] = useState<Pestana>("importar");

  // Mismo flujo que la carga masiva de pagos: soltar, analizar, filtrar,
  // confirmar y aplicar. Lo único propio es qué analiza y qué columnas pinta.
  const analizar = useCallback(
    (origen: OrigenTabla) =>
      analizarPadron({
        origen,
        padronActual: padron,
        participantes,
        catalogo: configuracion.catalogoAcademico,
        sedes,
        estadoDe: (p) => ({ evento: estadoDe(p).evento }),
      }),
    [padron, participantes, configuracion.catalogoAcademico, sedes, estadoDe],
  );
  const imp = useImportador<FilaPadron>(analizar);
  const { filas, leyendo, archivo, confirmando, aplicando, resumen, visibles, filtro, hoja } = imp;
  /*
   * La vista previa se pagina, y vuelve al principio al cambiar de semáforo,
   * de pestaña o de archivo: ahí sí se está mirando otra lista. Pulsar «error»
   * y caer en la página 7 de las tres que hay sería empezar por el final.
   */
  const tramoPrevio = usePaginacion(
    visibles,
    POR_PAGINA,
    `${filtro}|${archivo ?? ""}|${hoja ?? ""}`,
  );
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
    // `sinLugar` se avisa como error y no como éxito con nota al pie: es gente
    // que se queda fuera del evento, y pide una decisión de la organización.
    if (r.sinLugar > 0)
      toast.error(
        r.asignados === 0
          ? `Nadie se pudo repartir: los tres días llegaron a su aforo y ${r.sinLugar} alumnos siguen sin día.`
          : `${r.asignados} quedaron repartidos, pero ${r.sinLugar} no caben en ningún día. Amplía un aforo o reubícalos a mano.`,
      );
    else
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
  /*
   * El avance es el quinto filtro y el que faltaba.
   *
   * Los otros cuatro describen de dónde viene el alumno; este describe por
   * dónde va, y es el que se usa para las preguntas que no son de logística:
   * cuántos de octavo quedan sin día, si los de primero de una sede entera ya
   * están puestos. Sin él había que exportar el padrón a Excel para contestar
   * algo que la pantalla ya tenía delante.
   */
  const [fAvance, setFAvance] = useState("todos");
  /*
   * Arranca en «todos», no en «sin día».
   *
   * Antes empezaba filtrando a los pendientes porque era lo único accionable:
   * no había lista, solo un contador, y ver «0 alumnos coinciden» era la única
   * señal de que el reparto estaba completo. Ahora que la tabla existe, la
   * pregunta más frecuente es la contraria —a quién le tocó qué día— y llegar a
   * una pantalla vacía cuando todo está asignado escondía justamente eso. Los
   * pendientes siguen a un clic, y su botón de reparto no depende del filtro.
   */
  const [fDia, setFDia] = useState("todos");
  const grupos = useMemo(
    () => [...new Set(padron.map((a) => a.grupo).filter((g): g is string => !!g))].sort(),
    [padron],
  );

  /*
   * Los avances que existen, sacados del padrón y no de un rango inventado.
   *
   * No se puede ofrecer «de 1 a 8»: la licenciatura modular llega al 13 y las
   * maestrías tampoco cuentan igual. Ofrecer un rango fijo significaría o
   * esconder el módulo 13 o listar semestres que nadie cursa. Los que hay son
   * los que hay.
   */
  const avances = useMemo(
    () => [...new Set(padron.map((a) => a.avance))].sort((x, y) => x - y),
    [padron],
  );

  /*
   * Cómo se llama el avance cuando el filtro de programa lo deja claro.
   *
   * Con un programa elegido el rótulo puede decir «Módulo» o «Semestre», que
   * es la palabra que esa persona tiene en la cabeza. Sin programa conviven
   * los dos en la misma lista y la única palabra honesta es la genérica: decir
   * «Semestre 13» de alguien que cursa un módulo sería inventarlo.
   */
  const etiquetaAvance = useMemo(() => {
    if (fPrograma === "todos") return "Avance";
    const nivel = configuracion.catalogoAcademico.find((n) =>
      n.programas.some((x) => x.nombre === fPrograma),
    );
    return (
      cuentaDeAvance(configuracion.catalogoAcademico, nivel?.nivel, fPrograma)?.etiqueta ?? "Avance"
    );
  }, [configuracion.catalogoAcademico, fPrograma]);

  /*
   * Lo que la asignación en bloque mueve es exactamente lo que se está viendo.
   * Por eso el conjunto sale de un solo sitio: si algún modo de acotar la lista
   * no entrara aquí, se acotaría la vista, se pulsaría «día 2» y se movería a
   * gente que no estaba en pantalla.
   *
   * Aquí hubo además una búsqueda libre por matrícula, nombre o grupo. Se
   * retiró: los cinco desplegables ya llegan hasta el grupo de una sede, y lo
   * que quedaba debajo era buscar a UNA persona para reasignarla sola, que es
   * el botón de día de su propia fila. Un campo de texto sobre una lista que ya
   * se acota por cinco vías es un sexto modo de llegar al mismo sitio.
   */
  const seleccion = useMemo(() => {
    return padron.filter(
      (a) =>
        (fSede === "todas" || a.plantel === fSede) &&
        (fPrograma === "todos" || a.programa === fPrograma) &&
        (fGrupo === "todos" || a.grupo === fGrupo) &&
        (fAvance === "todos" || a.avance === Number(fAvance)) &&
        (fDia === "todos" || (fDia === "sin-dia" ? !a.dia : a.dia === Number(fDia))),
    );
  }, [padron, fSede, fPrograma, fGrupo, fAvance, fDia]);

  /*
   * Los filtros devuelven a la página 1; reasignarle el día a un alumno no.
   * Corregir a alguien de la página 9 y aparecer en la 1 obligaría a volver a
   * bajar por cada corrección, que es justo lo que se está haciendo aquí.
   */
  const tramoReparto = usePaginacion(
    seleccion,
    POR_PAGINA,
    `${fSede}|${fPrograma}|${fGrupo}|${fAvance}|${fDia}`,
  );

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
            {/*
              El aviso lleva al reparto en vez de decir dónde está.
              Decía «lo reparte la organización, abajo» cuando las dos cosas
              iban en la misma columna. Ahora el reparto es la otra pestaña, y
              un aviso que nombra un sitio al que hay que llegar por tu cuenta
              es un aviso que se pospone.
            */}
            {aplicado.sinDia > 0 ? (
              <span className="flex flex-wrap items-center gap-3 rounded-md bg-estado-discrepancia-bg p-3 text-estado-discrepancia">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">
                    {aplicado.sinDia} quedaron sin día asignado.
                  </span>{" "}
                  El archivo de Servicios Escolares no trae el día: lo asigna la organización.
                  Mientras tanto, a quien se pre-registre le toca el día que va más vacío.
                </span>
                <Button
                  variant="outline"
                  className="h-10 shrink-0 bg-card"
                  onClick={() => setPestana("reparto")}
                >
                  <CalendarDays className="size-4" /> Repartir los días
                </Button>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
        Dos tareas, dos pestañas.
        Esta pantalla se llama «Importación del padrón» y abría con el reparto
        por días: lo primero que se veía era un tablero de aforos y filtros que
        no tiene nada que ver con subir un archivo, y la zona de soltarlo
        quedaba debajo, fuera de la primera pantalla. Son dos trabajos
        distintos sobre los mismos datos —traer el padrón, y repartirlo entre
        los tres días— y encadenarlos en una columna obligaba a bajar por el
        que no se venía a hacer.

        Con un archivo a medio revisar no hay pestañas: ahí se está en una
        tarea concreta, con cambios sin aplicar, y ofrecer una salida lateral
        solo da ocasión de perderlos.
      */}
      {filas || leyendo ? null : (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
          <TabsList className="mb-5">
            <TabsTrigger value="importar" className="gap-2">
              <Upload className="size-4" aria-hidden /> Importar archivo
            </TabsTrigger>
            <TabsTrigger value="reparto" className="gap-2">
              <CalendarDays className="size-4" aria-hidden /> Padrón y reparto
              {/*
                El pendiente se rotula en la pestaña porque es la única forma
                de enterarse sin abrirla, y es justo lo que caduca: un alumno
                sin día que llega al evento no tiene dónde presentarse.
              */}
              {pendientes.length > 0 ? (
                <span className="rounded-full bg-estado-discrepancia px-2 py-0.5 text-[11px] font-bold leading-none text-white">
                  {pendientes.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="importar">
            {/*
             * Aquí vivía un bloque de «columnas requeridas» con la lista de las seis, un
             * párrafo explicando qué valida cada una y un enlace a un CSV de ejemplo
             * con siete errores a propósito.
             *
             * Tenía sentido cuando el importador exigía el encabezado exacto y había
             * que decirle a alguien cómo escribirlo. Ya no: el archivo llega de
             * Servicios Escolares tal como ellos lo generan, con sus propios nombres
             * de columna, y el importador los reconoce. Quien sube el padrón no
             * redacta el encabezado y no puede hacer nada con esa lista.
             *
             * Y si algo no casa, la vista previa lo dice fila por fila con el valor
             * que trae y lo que se esperaba, que es cuando la explicación sirve de
             * algo. Un texto que se lee antes del problema compite con la zona de
             * soltar el archivo, que es lo único que hay que hacer en esta pantalla.
             */}
            <ZonaDeArchivo importador={imp} titulo="el padrón de Servicios Escolares" />
          </TabsContent>

          <TabsContent value="reparto">
            {/*
              Sin encabezado ni párrafo de entrada: lo primero es el aforo.
              Aquí había un «Reparto por días» con su icono y debajo un párrafo
              explicando que el día lo asigna la organización. Los dos hacían
              falta cuando esto era una tarjeta más dentro de una columna larga
              y había que decir dónde empezaba. Ya no: la pestaña se llama
              igual, y el párrafo explicaba la pantalla a quien ya la abrió a
              propósito. Gastaban los dos primeros renglones, que es donde se
              mira cuánta gente cabe cada día.
            */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {/*
                El reparto se enseña contra el aforo y no a secas. «Día 3: 612» no
                dice nada por sí solo; «612 de 600» dice que hay doce personas a
                las que se les va a negar el pre-registro, y eso es accionable hoy
                y no el 17 de octubre.
              */}
              {repartoPorDia().map(({ dia, total, cupo, libres }) => {
                const rebasado = cupo > 0 && total > cupo;
                return (
                  <div
                    key={dia}
                    className={cn(
                      "rounded-lg border p-3",
                      rebasado
                        ? "border-estado-discrepancia/40 bg-estado-discrepancia-bg"
                        : "border-border bg-muted/40",
                    )}
                  >
                    <p className="text-xs text-muted-foreground">
                      Día {dia} · {infoDia(dia).lugar}
                    </p>
                    <p className="text-2xl font-extrabold tabular-nums">
                      {total}
                      {cupo > 0 ? (
                        <span className="text-base font-semibold text-muted-foreground">
                          {" "}
                          / {cupo}
                        </span>
                      ) : null}
                    </p>
                    {cupo > 0 ? (
                      <p
                        className={cn(
                          "text-xs",
                          rebasado ? "font-semibold text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {rebasado
                          ? `${total - cupo} de más: no van a caber`
                          : `${libres} lugares libres`}
                      </p>
                    ) : null}
                  </div>
                );
              })}
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

            {/*
              El reparto rápido va antes de la lista, no después.
              Es la única acción de aquí que NO depende de los filtros —cada
              pendiente cae en el día que va más vacío— así que colgaba al final
              de una tabla filtrada dando a entender lo contrario. Arriba, junto
              al aforo que va a mover, se lee por lo que es: la salida rápida
              antes de ponerse a repartir a mano.
            */}
            {pendientes.length > 0 ? (
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
            ) : (
              <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Los {padron.length} alumnos del padrón tienen día asignado.
              </p>
            )}

            {/*
              Los filtros van DENTRO de la caja de la tabla y pegados a ella.
              Estaban en una tarjeta aparte con los tres botones de asignar
              justo debajo, y la tabla empezaba después de todo eso. Con la
              acción de escritura metida entre el filtro y su resultado, los
              desplegables se leían como parte del asignador y no como lo que
              acota la lista: se podía tener el padrón entero delante sin ver
              que era filtrable. Lo que acota una tabla se pone encima de esa
              tabla y sin nada en medio.
            */}
            <section className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <h3 className="text-sm font-semibold">El padrón</h3>
                  <p className="text-sm">
                    <span className="text-xl font-extrabold tabular-nums">{seleccion.length}</span>{" "}
                    <span className="text-muted-foreground">
                      {seleccion.length === 1 ? "alumno" : "alumnos"} de {padron.length}
                    </span>
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <FiltroSelect etiqueta="Sede" valor={fSede} alCambiar={setFSede} todos="todas">
                    {sedes.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </FiltroSelect>
                  <FiltroSelect
                    etiqueta="Programa"
                    valor={fPrograma}
                    alCambiar={setFPrograma}
                    todos="todos"
                  >
                    {configuracion.catalogoAcademico.flatMap((n) =>
                      n.programas.map((x) => (
                        <option key={x.nombre} value={x.nombre}>
                          {x.nombre}
                        </option>
                      )),
                    )}
                  </FiltroSelect>
                  <FiltroSelect etiqueta="Grupo" valor={fGrupo} alCambiar={setFGrupo} todos="todos">
                    {grupos.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </FiltroSelect>
                  <FiltroSelect
                    etiqueta={etiquetaAvance}
                    valor={fAvance}
                    alCambiar={setFAvance}
                    todos="todos"
                  >
                    {avances.map((x) => (
                      <option key={x} value={String(x)}>
                        {etiquetaAvance === "Avance" ? x : `${etiquetaAvance} ${x}`}
                      </option>
                    ))}
                  </FiltroSelect>
                  <FiltroSelect
                    etiqueta="Día asignado"
                    valor={fDia}
                    alCambiar={setFDia}
                    todos="todos"
                  >
                    <option value="sin-dia">Sin día</option>
                    {([1, 2, 3] as const).map((d) => (
                      <option key={d} value={String(d)}>
                        Día {d}
                      </option>
                    ))}
                  </FiltroSelect>
                </div>
              </div>

              {seleccion.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  Ningún alumno coincide con estos filtros.
                </p>
              ) : (
                <>
                  <Tabla
                    className="rounded-none border-0"
                    anchoMinimo="62rem"
                    columnas={["Alumno", "Programa", "Avance", "Grupo · sede", "Día", "Cambiar a"]}
                  >
                    {tramoReparto.visibles.map((a) => (
                      <Fila key={a.matricula} className="align-middle">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{a.nombre}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {a.matricula}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{a.programa}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {avanceTexto(
                            configuracion.catalogoAcademico,
                            a.nivel,
                            a.avance,
                            a.programa,
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {a.grupo ?? "sin grupo"} · {a.plantel}
                        </td>
                        <td className="px-3 py-2">
                          {a.dia ? (
                            <span className="whitespace-nowrap rounded-full border border-border px-2 py-1 text-xs font-semibold">
                              Día {a.dia} · {infoDia(a.dia).lugar}
                            </span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full border border-estado-discrepancia/40 px-2 py-1 text-xs font-semibold text-estado-discrepancia">
                              Sin día
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex gap-1">
                            {([1, 2, 3] as const).map((d) => (
                              <button
                                key={d}
                                type="button"
                                // El día que ya tiene no se ofrece: pulsarlo no
                                // haría nada y ocupa el sitio de los que sí.
                                disabled={a.dia === d}
                                onClick={() => {
                                  reasignarDia(a.matricula, d);
                                  toast.success(`${a.nombre} queda en el día ${d}.`);
                                }}
                                className="h-9 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-30"
                              >
                                {d}
                              </button>
                            ))}
                          </span>
                        </td>
                      </Fila>
                    ))}
                  </Tabla>
                  <div className="border-t border-border px-4 pb-3">
                    <Paginacion tramo={tramoReparto} />
                  </div>
                </>
              )}

              {/*
                La asignación en bloque, debajo de la tabla y nombrando a
                cuántos toca. Arriba se leía como el dueño de los filtros;
                aquí se lee como lo que es: lo que le pasa a lo que se está
                viendo. El número va en el propio rótulo porque es la única
                cifra que importa antes de pulsar.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border bg-muted/30 p-4">
                <p className="min-w-0 text-sm">
                  <span className="font-semibold">
                    Asignar día a{" "}
                    {seleccion.length === 1 ? "este alumno" : `estos ${seleccion.length}`}
                  </span>
                  {seleccion.some((a) => a.dia) ? (
                    <span className="block text-xs text-estado-discrepancia">
                      {seleccion.filter((a) => a.dia).length} ya tenían día. Se les cambia, y a
                      quien tuviera un taller que no se imparte el día nuevo se le libera la
                      inscripción.
                    </span>
                  ) : null}
                </p>
                <span className="flex flex-wrap gap-2 sm:ml-auto">
                  {([1, 2, 3] as const).map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      className="h-11 bg-card"
                      disabled={seleccion.length === 0}
                      onClick={() => asignarASeleccion(d)}
                    >
                      <CalendarDays className="size-4" /> Al día {d} · {infoDia(d).lugar}
                    </Button>
                  ))}
                </span>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}

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
                      .map((f) => [f.n, ...COLUMNAS_PADRON.map((c) => f.datos[c]), f.motivo]),
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

          {/*
            Sin «Estado», «Día» ni «Resultado».
            El semáforo y el motivo salían en cada fila y empujaban la tabla a
            68rem de ancho mínimo: en un monitor normal se leía de lado. El
            color sigue filtrándose arriba, el conteo está en el aviso y el
            motivo viaja completo en «Descargar errores». El día nunca fue del
            archivo —lo reparte la organización más abajo— así que la columna
            decía «—» en todas las altas.
          */}
          <Tabla
            anchoMinimo="48rem"
            columnas={["#", "Matrícula", "Nombre completo", "Programa", "Avance", "Grupo", "Sede"]}
            vacio={
              visibles.length === 0 ? (
                <span className="text-muted-foreground">Ninguna fila con ese resultado.</span>
              ) : null
            }
          >
            {tramoPrevio.visibles.map((f) => (
              <Fila key={f.n}>
                <td className="px-3 py-2 text-muted-foreground">{f.n}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.datos.matricula}</td>
                <td className="px-3 py-2">{f.datos.nombre}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{f.datos.programa}</td>
                {/*
                  La palabra va en la celda y no en el encabezado.
                  Un archivo mixto trae en la misma tabla a la licenciatura
                  modular y a las que van por semestre —por eso se acepta el
                  encabezado «semestre/modulo»—, así que un rótulo único
                  obligaría a decidir cuál de los dos aplica en cada fila. Así
                  cada fila lo dice sola.

                  La fila válida enseña lo que el sistema entendió, no lo que
                  venía escrito: eso es lo que se está revisando. «TERCER
                  SEMESTRE» se lee «Semestre 3», y ahí se ve que el ordinal se
                  interpretó bien. La que murió con error no tiene nada
                  interpretado, así que enseña su texto tal cual, que es lo que
                  hay que corregir.
                */}
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {(f.alumno &&
                    avanceTexto(
                      configuracion.catalogoAcademico,
                      f.alumno.nivel,
                      f.alumno.avance,
                      f.alumno.programa,
                    )) ||
                    f.datos.avance ||
                    "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{f.datos.grupo || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{f.datos.sede}</td>
              </Fila>
            ))}
          </Tabla>
          <Paginacion
            tramo={tramoPrevio}
            nota="Se aplican y se descargan todas las que pasan el filtro, no solo las de esta página."
          />
        </>
      ) : null}

      <DialogoConfirmar
        abierto={confirmando}
        alCerrar={() => imp.setConfirmando(false)}
        titulo={`¿Aplicar ${resumen.aplicables} registros al padrón?`}
        descripcion={
          <>
            Se darán de alta o se actualizarán {resumen.aplicables} alumnos. Las {resumen.error}{" "}
            filas con error se omiten.
            {altasNuevas.length > 0
              ? ` ${altasNuevas.length} altas quedarán esperando a que se les asigne día.`
              : ""}{" "}
            La acción no se puede deshacer desde esta pantalla.
          </>
        }
        confirmar={`Sí, aplicar ${resumen.aplicables}`}
        alConfirmar={() => void aplicar()}
      />
    </PantallaPanel>
  );
}

/**
 * Un filtro de selección: el campo etiquetado más su opción de «todos».
 *
 * Se llamaba `Campo`, que es el nombre del componente compartido, y por eso
 * chocaban. Este no es un campo cualquiera: es el desplegable de filtrar, con
 * su opción de no filtrar incluida. El nombre ahora lo dice.
 */
function FiltroSelect({
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
    <Campo etiqueta={etiqueta}>
      <select
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
      >
        <option value={todos}>{todos === "todas" ? "Todas" : "Todos"}</option>
        {children}
      </select>
    </Campo>
  );
}
