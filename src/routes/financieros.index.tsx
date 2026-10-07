import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  ChartColumn,
  Check,
  CheckCircle2,
  Download,
  Info,
  QrCode,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { CamaraQR } from "@/components/camara-qr";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { Button } from "@/components/ui/button";
import { SelloEnVivo } from "@/components/sello-en-vivo";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EstadoPagoBadge } from "@/components/estado-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { desglosar, sumaDelDesglose } from "@/lib/desglose";
import { descargarCsv } from "@/lib/exportar";
import { alumnosPendientes, montoPendienteDe } from "@/lib/pendientes";
import { fechaHora, hora, hoyIso, isoAFecha, moneda } from "@/lib/formato";
import { usePaginacion } from "@/lib/paginacion";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  alCorriente,
  faltaDe,
  indexarPagos,
  resuelto,
  resultadoDe,
  yaPago,
} from "@/lib/pagos-logica";
import { avanceTexto } from "@/dominio/catalogos";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { EstadoPago, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/financieros/")({
  head: () =>
    meta(
      "Ventanilla — Servicios Financieros",
      "La lista de participantes con su estado de pago y un botón para confirmar el cobro de cada concepto.",
    ),
  component: Ventanilla,
});

/*
 * Cuántas filas se pintan de una vez.
 *
 * Diez y no doscientas, y con páginas en vez de un recorte. El recorte anterior
 * escondía a quien quedaba fuera detrás de una nota al pie; ahora la lista
 * entera es alcanzable, y diez renglones caben en la pantalla de la ventanilla
 * sin desplazar, que es donde se pulsa el botón de confirmar.
 */
const POR_PAGINA = 10;

/**
 * Un nombre reducido a lo que decide si es el mismo nombre: sin acentos, sin
 * mayúsculas y sin espacios de más.
 *
 * Se queda en esta pantalla y no en un módulo compartido a propósito. El
 * proyecto ya tiene esta normalización en `catalogos.ts` y en
 * `padron-importacion.ts`, y las dos comparan otra cosa —nombres de programa y
 * columnas de un archivo— contra un catálogo cerrado. Aquí se agrupan nombres de
 * personas, que es una comparación con otras consecuencias, y darles una sola
 * implementación las ataría: afinar una para nombres compuestos cambiaría en
 * silencio qué programa reconoce el importador del padrón.
 */
const claveDeNombre = (nombre: string) =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

type Filtro = "todos" | "por_cobrar" | "pagados" | "prorroga";

/*
 * «Sin adeudo» y no «Pagados», y el rótulo cambió porque la regla cambió.
 *
 * El filtro pregunta por `alCorriente`, que desde el 2026-09-29 también es cierto
 * del maestro exento: ese no pagó nada y no debe nada. Con el rótulo anterior, la
 * lista «Pagados» contenía gente que nunca depositó, y quien la usara para cuadrar
 * la caja no encontraría sus depósitos. La insignia de cada renglón sí dice
 * «Exento», pero el rótulo del filtro es lo que se lee primero.
 *
 * La clave interna se queda en `pagados`: es un valor de estado, no un texto.
 */
const ETIQUETA: Record<Filtro, string> = {
  todos: "Todos",
  por_cobrar: "Por cobrar",
  pagados: "Sin adeudo",
  /*
   * Quiénes tienen plazo para completar, hayan abonado o no.
   *
   * Es la lista que hay que llamar antes de que venza: esa gente NO entra al
   * evento mientras deba, y a diferencia del resto de los morosos se le
   * prometió algo. Filtra por el permiso y no por el estado a propósito —quien
   * ya completó también sale—, porque lo que se revisa en esta pantalla es a
   * quién se le dio plazo y cómo va, no solo quién sigue debiendo.
   */
  prorroga: "Con prórroga",
};

function Ventanilla() {
  const navigate = useNavigate();
  const { setFolio } = usePrototipo();
  const {
    estadoDe,
    getParticipante,
    participantes,
    cargandoDatos,
    registrarPago,
    registrarBitacora,
    pagos,
    recargar,
    cargadoEn,
    enVivo,
    configuracion,
  } = useEstadoEvento();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [camara, setCamara] = useState(false);
  /** Folio leído por la cámara, o null. Se guarda el folio y no la persona para
   *  que la tarjeta se repinte sola al confirmar un pago desde ella. */
  const [escaneado, setEscaneado] = useState<string | null>(null);
  /** Lo que se leyó cuando no corresponde a ningún pre-registro. */
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null);
  /**
   * Conceptos ya confirmados en esta sesión, para que un doble clic no registre
   * dos pagos.
   *
   * Va en una referencia y no en estado a propósito. El estado se lee del
   * render anterior: dos clics seguidos dentro del mismo ciclo verían los dos
   * que no hay nada en curso y cobrarían dos veces. Y no hay red debajo —la
   * tabla `pagos` no tiene restricción de unicidad por participante y concepto,
   * porque una corrección se registra precisamente como un pago más—, así que
   * este guardia es el único que hay.
   */
  const confirmados = useRef<Set<string>>(new Set());

  useEffect(() => {
    ref.current?.focus();
  }, []);

  /*
   * Tras cada carga se olvida qué se confirmó en esta sesión.
   *
   * El guardia contra el doble clic es una lista en memoria, y los datos que
   * acaban de llegar ya dicen quién pagó. Si un cobro no llegó a guardarse, su
   * botón vuelve a aparecer, y con el guardia puesto sería imposible pulsarlo.
   */
  useEffect(() => {
    if (!cargandoDatos) confirmados.current.clear();
  }, [cargandoDatos]);

  const escaneadoP = escaneado ? getParticipante(escaneado) : undefined;

  /** Cuándo y por dónde se registró lo último que pagó, para poder decirlo. */
  const ultimoPagoTexto = (folio: string) => {
    const suyos = pagos.filter((g) => g.folio === folio);
    const ultimo = suyos[suyos.length - 1];
    if (!ultimo) return "";
    const via = ultimo.origen === "ventanilla" ? "en ventanilla" : "por la carga del banco";
    return `El último cobro se registró ${via} el ${ultimo.fechaDeposito}.`;
  };

  /*
   * `alCorriente` viene de `pagos-logica` y eso resuelve dos cosas de golpe.
   *
   * Estaba escrita dos veces en este mismo archivo: una para la tarjeta del
   * escaneo y otra DENTRO del memo, porque una función creada en cada render
   * cambia de identidad y meterla en las dependencias recalcularía la lista
   * entera cada vez. Una función de módulo no cambia de identidad, así que
   * sirve para las dos sin duplicarse ni ensuciar las dependencias.
   *
   * Y la regla deja de vivir en una pantalla: es la misma que decide quién
   * aparece en conciliación y a quién detiene la puerta.
   */
  const lista = useMemo(() => {
    const base = q.trim() ? buscarEnParticipantes(participantes, q) : participantes;
    if (filtro === "todos") return base;
    if (filtro === "prorroga") return base.filter((p) => Boolean(p.prorrogaHasta));
    return base.filter((p) => alCorriente(estadoDe(p)) === (filtro === "pagados"));
  }, [participantes, q, filtro, estadoDe]);

  /*
   * La clave lleva el filtro y la búsqueda: acotar devuelve a la página 1, que
   * es lo que se espera. No lleva la lista misma a propósito —confirmar un
   * cobro genera un arreglo nuevo, y ahí saltar al principio sería perder el
   * sitio a media fila. Ver `usePaginacion`.
   */
  const tramo = usePaginacion(lista, POR_PAGINA, `${q}|${filtro}`);

  /*
   * Lo depositado por persona y concepto, de una sola pasada.
   *
   * Hace falta para cobrar el SALDO y no la cuota: quien abonó 250 de 500 con
   * una prórroga tiene que poder entregar 250, y un botón que ofreciera 500 le
   * cobraría 750 en total y dejaría su depósito en discrepancia. Se calcula una
   * vez por cambio de la lista de pagos y no una por fila, que es el mismo
   * cuello de botella que ya documentó `indexarPagos`.
   */
  const indicePagos = useMemo(() => indexarPagos(pagos), [pagos]);

  /*
   * Quiénes ya pagaron, un renglón por nombre.
   *
   * Sale de `participantes` y no de `lista`: es la lista de pagados del evento,
   * no de lo que haya en el buscador. Así el número del botón no cambia al
   * teclear, que es lo que delata que la descarga no depende del filtro.
   *
   * Un nombre puede venir dos veces —quien se pre-registró dos veces tiene dos
   * folios—, y ahí los dos folios se juntan en el mismo renglón en vez de
   * quedarse uno fuera: si resultan ser dos personas distintas con el mismo
   * nombre, el archivo lo enseña en la columna de folios y nadie desaparece.
   */
  const pagados = useMemo(() => {
    const porNombre = new Map<string, { nombre: string; folios: string[]; matriculas: string[] }>();
    for (const p of participantes) {
      if (!yaPago(estadoDe(p))) continue;
      const clave = claveDeNombre(p.nombre);
      const suyo = porNombre.get(clave);
      if (suyo) {
        suyo.folios.push(p.folio);
        if (p.matricula) suyo.matriculas.push(p.matricula);
      } else {
        porNombre.set(clave, {
          nombre: p.nombre,
          folios: [p.folio],
          matriculas: p.matricula ? [p.matricula] : [],
        });
      }
    }
    // Por nombre y no por folio: el archivo se lee buscando a alguien.
    return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [participantes, estadoDe]);

  /**
   * Descarga la lista de quienes ya pagaron, un nombre por renglón.
   *
   * En CSV con BOM, que es lo que abre Excel de doble clic sin romper la Ñ de
   * MUÑOZ; es el mismo formato de las demás descargas del panel. Ver
   * `lib/exportar.ts`.
   */
  const descargarPagados = () => {
    // El botón ya viene apagado con la lista vacía; esto solo evita que una
    // llamada futura escriba un archivo con encabezados y ni una fila.
    if (pagados.length === 0) return;
    const n = descargarCsv(
      "pagados.csv",
      ["nombre", "folio", "matricula", "pre_registros"],
      pagados.map((f) => [
        f.nombre,
        f.folios.join(" · "),
        f.matriculas.join(" · "),
        f.folios.length,
      ]),
    );
    registrarBitacora("Descargó la lista de pagados", `${n} nombres`);
    toast.success(`Descargamos ${n} nombres.`);
  };

  /*
   * Quién falta por pagar y cuánto vive en `lib/pendientes.ts`, compartido con
   * la hoja de gráficas en `/financieros/pendientes`: la misma lista y el
   * mismo monto, para que las dos pantallas no puedan contar cosas distintas.
   */
  const pendientesDePago = useMemo(
    () => alumnosPendientes(participantes, estadoDe),
    [participantes, estadoDe],
  );

  /**
   * El mismo adeudo, contado por sede, licenciatura y módulo o semestre.
   *
   * Reutiliza `desglosar` —la misma cuenta que la hoja de avance— sobre la
   * lista YA filtrada a quien debe, así que `total` en cada corte es
   * directamente cuántos alumnos faltan ahí, sin importar qué estado traigan.
   *
   * Lo único que se usa de cada grupo es `partes` y `total`. Sus columnas de
   * pagados, exentos y faltan NO se leen, y es a propósito: `desglosar` las
   * calcula mirando solo el estado del EVENTO —ver el tercer argumento—, y
   * `pendientesDePago` entra por deber el evento O el taller. Quien tiene el
   * evento pagado y solo el taller pendiente —Elia, en las pruebas— cuenta ahí
   * como «pagada» para esas tres columnas aunque siga debiendo, así que no son
   * una segunda fuente de verdad sobre el adeudo: la fuente es la lista de
   * entrada, y `total` es lo único que de verdad la refleja.
   */
  const resumenPendientes = useMemo(
    () =>
      desglosar(
        pendientesDePago,
        (p) => [
          p.plantel ?? "",
          p.programa ?? "",
          avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
        ],
        (p) => estadoDe(p).evento,
        "etiqueta",
      ),
    [pendientesDePago, configuracion.catalogoAcademico, estadoDe],
  );

  /**
   * Descarga el detalle: un alumno por renglón, con cuánto le falta.
   *
   * El monto pendiente suma lo que debe del evento y lo que debe del taller,
   * como un solo número. Por dentro siguen siendo dos conceptos —ver
   * `faltaDe`—, pero quien paga en ventanilla entrega un depósito, no dos, y
   * este archivo habla en esos términos.
   */
  const descargarPendientes = () => {
    if (pendientesDePago.length === 0) return;
    const n = descargarCsv(
      "faltan-por-pagar.csv",
      [
        "folio",
        "matricula",
        "nombre",
        "nivel",
        "licenciatura",
        "modulo_o_semestre",
        "grupo",
        "sede",
        "correo",
        "celular",
        "estado_evento",
        "estado_taller",
        "monto_pendiente",
      ],
      pendientesDePago.map((p) => {
        const estado = estadoDe(p);
        return [
          p.folio,
          p.matricula ?? "",
          p.nombre,
          p.nivel ?? "",
          p.programa ?? "",
          avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
          p.grupo ?? "",
          p.plantel ?? "",
          p.correo,
          p.celular,
          estado.evento,
          p.tallerId ? (estado.taller ?? "") : "sin taller",
          montoPendienteDe(indicePagos, p).toFixed(2),
        ];
      }),
    );
    registrarBitacora("Descargó quiénes faltan por pagar", `${n} alumnos`);
    toast.success(`Exportamos ${n} alumnos que faltan por pagar.`);
  };

  /** Descarga el resumen: cuántos faltan en cada sede, licenciatura y módulo o semestre. */
  const descargarResumenPendientes = () => {
    if (resumenPendientes.length === 0) return;
    const total = sumaDelDesglose(resumenPendientes).total;
    const n = descargarCsv(
      "faltan-por-pagar-por-grupo.csv",
      ["sede", "licenciatura", "modulo_o_semestre", "alumnos_que_faltan"],
      [...resumenPendientes.map((g) => [...g.partes, g.total]), ["TOTAL", "", "", total]],
    );
    registrarBitacora("Descargó el resumen de pendientes por grupo", `${n} filas`);
    toast.success(`Exportamos el resumen de pendientes: ${n} filas.`);
  };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQ("");
        setFiltro("todos");
        ref.current?.focus();
      }
      if (e.key === "F2") {
        e.preventDefault();
        setCamara(true);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  /**
   * Confirma el cobro de un concepto desde la propia lista.
   *
   * El importe registrado es el esperado, no uno capturado: quien cobra tiene
   * el comprobante delante y confirma que coincide. Si no coincidiera, no
   * pulsa. Por eso el botón enseña la cantidad —confirmar a ciegas y confirmar
   * $650 no son el mismo gesto—, y por eso el registro nunca puede quedar en
   * discrepancia por esta vía.
   *
   * La fecha es la de hoy, que es cuando se atiende la ventanilla. Para un
   * depósito de otro día, la carga masiva del banco trae la suya.
   */
  const confirmar = (
    p: Participante,
    concepto: "evento" | "taller",
    /** Lo que entrega hoy: la cuota entera, o el saldo si ya abonó. */
    monto: number,
    /** La cuota del concepto, que es contra lo que se compara. */
    montoEsperado: number,
  ) => {
    // El importe entra en la clave del guardia: dos clics seguidos sobre el
    // mismo botón siguen siendo uno solo, y un segundo abono por otra cantidad
    // —que con una prórroga es legítimo— ya no queda bloqueado por el primero.
    const clave = `${p.folio}:${concepto}:${monto}`;
    if (confirmados.current.has(clave)) return;
    confirmados.current.add(clave);
    registrarPago({
      folio: p.folio,
      concepto,
      monto,
      montoEsperado,
      fechaDeposito: isoAFecha(hoyIso()),
      // La misma cuenta que hace la base al guardar: un saldo que cierra la
      // cuota no es «pagado» en su fila —no coincide con lo esperado— sino otro
      // abono, y lo que completa el concepto es la suma. Ver `fn_resultado_pago`.
      resultado: resultadoDe(monto, montoEsperado, Boolean(p.prorrogaHasta)),
      origen: "ventanilla",
    });
    registrarBitacora(
      "Confirmó un pago en ventanilla",
      `${p.folio} · ${concepto} · ${moneda(monto)}`,
    );
    toast.success(`${p.nombre}: ${concepto} cobrado.`);
  };

  const abrirFicha = (p: Participante) => {
    setFolio(p.folio);
    void navigate({ to: "/financieros/ficha" });
  };

  return (
    <PantallaPanel
      area="financieros"
      titulo="Servicios Financieros"
      descripcion="Atiende la fila: busca a la persona y confirma su pago."
    >
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
        <Input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtra por folio, matrícula, nombre o correo"
          className="h-14 text-lg"
          aria-label="Filtrar participantes"
        />
        <Button
          type="button"
          variant="outline"
          className="h-14 px-6 text-base"
          onClick={() => setCamara(true)}
        >
          <QrCode className="size-5" /> Escanear QR
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(Object.keys(ETIQUETA) as Filtro[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFiltro(v)}
            aria-pressed={filtro === v}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filtro === v
                ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border bg-card hover:bg-muted hover:text-foreground",
            )}
          >
            {ETIQUETA[v]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {cargandoDatos ? "Cargando…" : `${lista.length} de ${participantes.length} participantes`}
        </span>
        {/*
          Se dice si la pantalla está escuchando de verdad o no. «En vivo»
          cuando nadie lo comprobó es peor que no decir nada: quien atiende
          dejaría de actualizar creyendo que no hace falta.
        */}
        <SelloEnVivo />
        {/*
          El número va en el botón porque es el dato que se quiere antes de
          pulsarlo —cuántos llevan pagado— y porque no se mueve al teclear en el
          filtro: eso dice sin explicarlo que la descarga es la lista entera.
        */}
        <Button
          variant="outline"
          size="sm"
          onClick={descargarPagados}
          disabled={cargandoDatos || pagados.length === 0}
          title="Un nombre por renglón, sin repetirse. Se abre en Excel."
        >
          <Download className="size-4" /> Pagados ({pagados.length})
        </Button>
        {/*
          Dos descargas y no una, porque son dos preguntas distintas: quiénes
          son —el detalle, para llamarles o perseguirlos— y cuántos son en cada
          sede, licenciatura y módulo o semestre —el resumen, para repartir el
          trabajo de cobro—. Solo alumnos: ver por qué en `pendientesDePago`.
        */}
        <Button
          variant="outline"
          size="sm"
          onClick={descargarPendientes}
          disabled={cargandoDatos || pendientesDePago.length === 0}
          title="Un alumno por renglón: sede, licenciatura, módulo o semestre y cuánto le falta. Se abre en Excel."
        >
          <Download className="size-4" /> Faltan por pagar ({pendientesDePago.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={descargarResumenPendientes}
          disabled={cargandoDatos || resumenPendientes.length === 0}
          title="Cuántos alumnos faltan por pagar en cada sede, licenciatura y módulo o semestre."
        >
          <Download className="size-4" /> Resumen por grupo ({resumenPendientes.length})
        </Button>
        {/*
          La hoja con gráficas, aparte de las dos descargas. Es un enlace y no
          una tercera descarga porque el archivo lo genera el navegador —
          `Ctrl+P` → «Guardar como PDF»—, igual que `/admin/avance` y
          `/admin/leip`: ver la cabecera de `financieros.pendientes.tsx`.
        */}
        <Button asChild variant="secondary" size="sm">
          <Link to="/financieros/pendientes">
            <ChartColumn className="size-4" /> Hoja con gráficas
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={recargar} disabled={cargandoDatos}>
          <RefreshCw className={cn("size-4", cargandoDatos && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Atajos: <kbd className="rounded border border-border px-1">Esc</kbd> limpiar ·{" "}
        <kbd className="rounded border border-border px-1">F2</kbd> escanear · toca el nombre para
        ver su ficha
        {/*
          Se dice de cuándo son los datos. La lista es una foto, y quien atiende
          tiene derecho a saber si es de hace un minuto o de hace tres horas
          antes de decirle a alguien que su folio no existe.
        */}
        {/* Con la escucha puesta la hora sobra y solo distrae: los datos son
            de hace un instante siempre. Se enseña justo cuando deja de serlo. */}
        {!enVivo && cargadoEn ? ` · datos de las ${hora(new Date(cargadoEn))}` : ""}
      </p>

      <div className="mt-6">
        {cargandoDatos ? (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="mt-2 h-4 w-40" />
              </div>
            ))}
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-semibold">
              {participantes.length === 0
                ? "Todavía no hay participantes"
                : "Sin coincidencias para ese filtro"}
            </p>
            <p className="text-sm text-muted-foreground">
              {participantes.length === 0
                ? "Nadie se ha pre-registrado, o esta cuenta no puede leer la lista."
                : "Revisa el folio completo (por ejemplo PRE-00842), busca por apellido o cambia el filtro."}
            </p>
          </div>
        ) : (
          <>
            <Tabla anchoMinimo="46rem" columnas={["Participante", "Evento", "Taller"]}>
              {tramo.visibles.map((p) => {
                const estado = estadoDe(p);
                // Lo que falta, que con un abono de por medio no es la cuota.
                const faltaEvento = faltaDe(indicePagos, p.folio, "evento", p.montoEsperadoEvento);
                const faltaTaller = faltaDe(
                  indicePagos,
                  p.folio,
                  "taller",
                  p.montoEsperadoTaller ?? 0,
                );
                return (
                  <Fila key={p.folio} className="align-middle">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => abrirFicha(p)}
                        className="text-left hover:underline"
                      >
                        <span className="font-semibold">{p.nombre}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {p.folio}
                          {p.matricula ? ` · ${p.matricula}` : ""}
                        </span>
                        {/*
                          El plazo, en la fila y no solo en la ficha: quien
                          atiende tiene que saber que a esta persona se le
                          prometió algo ANTES de decirle que no puede entrar.
                        */}
                        {p.prorrogaHasta ? (
                          <span className="block text-xs font-semibold text-estado-comprobante">
                            Prórroga al {fechaHora(new Date(p.prorrogaHasta))}
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Celda
                        estado={estado.evento}
                        monto={faltaEvento}
                        onConfirmar={() =>
                          confirmar(p, "evento", faltaEvento, p.montoEsperadoEvento)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {p.tallerId && estado.taller ? (
                        <Celda
                          estado={estado.taller}
                          monto={faltaTaller}
                          onConfirmar={() =>
                            confirmar(p, "taller", faltaTaller, p.montoEsperadoTaller ?? 0)
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin taller</span>
                      )}
                    </td>
                  </Fila>
                );
              })}
            </Tabla>
            {/*
              Cuántas se están viendo de cuántas, y el paso a la siguiente. Antes
              aquí había una nota diciendo que la lista venía recortada: se leía
              como «ya no hay más», y en ventanilla eso es dar por atendido a
              quien nadie llegó a ver.
            */}
            {/* La sugerencia de acotar solo aparece si hay más de una página: con
                ocho resultados delante, pedir que filtre más sobra. */}
            <Paginacion
              tramo={tramo}
              nota={tramo.totalPaginas > 1 ? "Escribe en el filtro para acotar." : undefined}
            />
          </>
        )}
      </div>

      <Dialog
        open={camara}
        onOpenChange={(abierto) => {
          setCamara(abierto);
          if (!abierto) setNoEncontrado(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Escanea el código del participante</DialogTitle>
          {/*
            La cámara solo se monta con el diálogo abierto: montarla siempre la
            dejaría encendida durante toda la jornada de ventanilla, calentando
            el equipo sin que nadie la esté mirando.

            El escaneo nunca confirma por sí solo. Abre la tarjeta de esa
            persona con su estado, y ahí se decide: quien cobra tiene que ver a
            quién le está cobrando antes de pulsar.
          */}
          {noEncontrado ? (
            <Alert variant="destructive">
              <Ban className="size-4" />
              <AlertTitle>Ese código no corresponde a nadie</AlertTitle>
              <AlertDescription>
                Se leyó <span className="font-mono">{noEncontrado}</span>, y no hay ningún
                pre-registro con ese folio <strong>en los datos que tiene esta pantalla</strong>. Si
                acaba de registrarse, actualiza y vuelve a escanear. Si sigue sin aparecer, puede
                ser el código de otro evento o un pre-registro sin terminar: búscalo por nombre o
                matrícula antes de cobrarle.
              </AlertDescription>
              {/*
                La salida más probable va aquí mismo. La lista es una foto del
                momento en que se inició sesión, así que el motivo número uno de
                este aviso es alguien que se pre-registró hace cinco minutos.
              */}
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={recargar}
                disabled={cargandoDatos}
              >
                <RefreshCw className={cn("size-4", cargandoDatos && "animate-spin")} />
                Actualizar y volver a intentar
              </Button>
            </Alert>
          ) : null}
          {camara ? (
            <CamaraQR
              onLeer={(valor) => {
                const leido = valor.trim().toUpperCase();
                if (!getParticipante(leido)) {
                  // El diálogo se queda abierto a propósito: lo normal tras un
                  // código que no cuadra es volver a intentarlo, no reabrir la
                  // cámara desde cero.
                  setNoEncontrado(leido || "(vacío)");
                  return;
                }
                setNoEncontrado(null);
                setCamara(false);
                setEscaneado(leido);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/*
        El resultado del escaneo, con lo que quien cobra necesita saber antes de
        tocar nada: a quién leyó, si ya pagó y cuándo. Antes el escaneo solo
        filtraba la lista y no decía nada de eso.
      */}
      <Dialog open={escaneado !== null} onOpenChange={(a) => !a && setEscaneado(null)}>
        <DialogContent>
          {escaneadoP ? (
            <>
              <DialogTitle>{escaneadoP.nombre}</DialogTitle>
              <p className="-mt-2 font-mono text-xs text-muted-foreground">
                {escaneadoP.folio}
                {escaneadoP.matricula ? ` · ${escaneadoP.matricula}` : ""}
              </p>

              {alCorriente(estadoDe(escaneadoP)) ? (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>Ya está pagado</AlertTitle>
                  <AlertDescription>
                    No hay nada que cobrarle. {ultimoPagoTexto(escaneadoP.folio)}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle>Tiene un cobro pendiente</AlertTitle>
                  <AlertDescription>
                    Verifica su comprobante y confirma el concepto que corresponda.
                  </AlertDescription>
                </Alert>
              )}

              <dl className="grid gap-3">
                <ConceptoEscaneado
                  titulo="Evento"
                  estado={estadoDe(escaneadoP).evento}
                  monto={faltaDe(
                    indicePagos,
                    escaneadoP.folio,
                    "evento",
                    escaneadoP.montoEsperadoEvento,
                  )}
                  onConfirmar={() =>
                    confirmar(
                      escaneadoP,
                      "evento",
                      faltaDe(
                        indicePagos,
                        escaneadoP.folio,
                        "evento",
                        escaneadoP.montoEsperadoEvento,
                      ),
                      escaneadoP.montoEsperadoEvento,
                    )
                  }
                />
                {escaneadoP.tallerId && estadoDe(escaneadoP).taller ? (
                  <ConceptoEscaneado
                    titulo="Taller"
                    estado={estadoDe(escaneadoP).taller!}
                    monto={faltaDe(
                      indicePagos,
                      escaneadoP.folio,
                      "taller",
                      escaneadoP.montoEsperadoTaller ?? 0,
                    )}
                    onConfirmar={() =>
                      confirmar(
                        escaneadoP,
                        "taller",
                        faltaDe(
                          indicePagos,
                          escaneadoP.folio,
                          "taller",
                          escaneadoP.montoEsperadoTaller ?? 0,
                        ),
                        escaneadoP.montoEsperadoTaller ?? 0,
                      )
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No eligió taller.</p>
                )}
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => abrirFicha(escaneadoP)}>
                  Ver su ficha
                </Button>
                <Button variant="outline" onClick={() => setEscaneado(null)}>
                  Cerrar
                </Button>
                <Button
                  onClick={() => {
                    setEscaneado(null);
                    setCamara(true);
                  }}
                >
                  <QrCode className="size-4" /> Escanear otro
                </Button>
              </div>
            </>
          ) : (
            /* Solo se llega aquí si la lista se recargó bajo los pies —cambio de
               sesión— y el folio leído ya no está. Sin esta rama el diálogo se
               quedaría vacío y sin botón para salir. */
            <>
              <DialogTitle>Ese participante ya no está en la lista</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Vuelve a escanear su código o búscalo por nombre.
              </p>
              <Button variant="outline" onClick={() => setEscaneado(null)}>
                Cerrar
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PantallaPanel>
  );
}

/**
 * Una celda de concepto: o el estado en que quedó, o el botón para confirmarlo.
 *
 * El botón lleva el importe escrito. Confirmar a ciegas y confirmar $650 no son
 * el mismo gesto, y esta pantalla registra un cobro con un solo clic.
 *
 * @param monto Lo que se va a cobrar AHORA, que con un abono de por medio es el
 *   saldo y no la cuota. El rótulo cambia con el estado para que quien atiende
 *   sepa cuál de las dos cosas está pulsando.
 */
function Celda({
  estado,
  monto,
  onConfirmar,
}: {
  estado: EstadoPago;
  monto: number;
  onConfirmar: () => void;
}) {
  // Ya resuelto: no hay nada que confirmar. La discrepancia se arregla desde la
  // ficha o con la carga masiva, no volviendo a pulsar aquí.
  if (resuelto(estado)) return <EstadoPagoBadge estado={estado} />;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" className="h-9" onClick={onConfirmar}>
        <Check className="size-4" />
        {estado === "parcial"
          ? `Cobrar los ${moneda(monto)} que faltan`
          : `Confirmar ${moneda(monto)}`}
      </Button>
      <EstadoPagoBadge estado={estado} />
    </div>
  );
}

/**
 * Un concepto dentro de la tarjeta del escaneo: qué se le cobra, en qué estado
 * está y —si procede— el botón para confirmarlo.
 *
 * Repite la decisión de la tabla a propósito: el importe va escrito en el
 * botón. Es el único dato que quien cobra tiene que contrastar contra el
 * comprobante que tiene en la mano.
 */
function ConceptoEscaneado({
  titulo,
  estado,
  monto,
  onConfirmar,
}: {
  titulo: string;
  estado: EstadoPago;
  monto: number;
  onConfirmar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
      <div>
        <dt className="text-sm font-semibold">{titulo}</dt>
        <dd className="text-xs text-muted-foreground">{moneda(monto)}</dd>
      </div>
      {resuelto(estado) ? (
        <EstadoPagoBadge estado={estado} />
      ) : (
        <Button size="sm" className="h-9" onClick={onConfirmar}>
          <Check className="size-4" />
          {estado === "parcial"
            ? `Cobrar los ${moneda(monto)} que faltan`
            : `Confirmar ${moneda(monto)}`}
        </Button>
      )}
    </div>
  );
}
