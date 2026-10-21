import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck,
  Download,
  GraduationCap,
  HandCoins,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { Buscador } from "@/components/buscador";
import { Campo, Cifra, EstadoVacio, Rotulo, Tarjeta } from "@/components/tipografia";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { useEstadoEvento } from "@/lib/estado-evento";
import { folioDeEjemplo } from "@/lib/busqueda";
import { useEntornoConstancias } from "@/lib/elegibilidad";
import {
  construirPanorama,
  resumenGeneral,
  resumenPorDia,
  resumenPorPrograma,
  type FilaPanorama,
} from "@/lib/panorama";
import { descargarCsv } from "@/lib/exportar";
import { usePaginacion } from "@/lib/paginacion";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia, EstadoPago, Participante, Perfil } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/panorama")({
  head: () =>
    meta(
      "Panorama — Administración del Encuentro",
      "Quién asistió de verdad, quién pagó, quién subió evidencia y quién sigue debiendo, cruzado por licenciatura, maestría, grupo y día.",
    ),
  component: Panorama,
});

/** Los valores distintos de un campo entre los participantes, en orden. Vive fuera del componente por la misma razón que en `/admin/alumnos`: para poder entrar en un `useMemo` sin volverse su dependencia. */
const unicosDe = (participantes: Participante[], dame: (p: Participante) => string | undefined) =>
  [...new Set(participantes.map(dame).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

type FiltroAsistencia = "todos" | "asistio" | "no_asistio";
type FiltroTaller = "todos" | "completo" | "incompleto" | "sin_taller";
type FiltroBandera =
  | "todos"
  | "pago_sin_asistir"
  | "preinscrito_sin_pagar"
  | "asistio_sin_pago"
  | "taller_pagado_sin_completar";

const ESTADOS_PAGO: { valor: "todos" | EstadoPago; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "pre_registrado", etiqueta: "Pre-registrado" },
  { valor: "comprobante_recibido", etiqueta: "Comprobante recibido" },
  { valor: "parcial", etiqueta: "Abonó a cuenta" },
  { valor: "pagado", etiqueta: "Pagado" },
  { valor: "exento", etiqueta: "Exento" },
  { valor: "discrepancia", etiqueta: "Discrepancia" },
  { valor: "expirado", etiqueta: "Expirado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

function Panorama() {
  const { participantes, talleres, configuracion, registrarBitacora } = useEstadoEvento();
  const entorno = useEntornoConstancias();
  const ejemplo = folioDeEjemplo(participantes);

  /*
   * El cruce completo se calcula una sola vez sobre TODA la lista, igual que
   * `/admin/elegibles`: las tarjetas y las dos tablas resumen hablan siempre
   * del total, y solo la tabla de detalle de abajo se recorta con los filtros.
   */
  const filas = useMemo(
    () => construirPanorama(entorno, participantes, talleres, configuracion.catalogoAcademico),
    [entorno, participantes, talleres, configuracion.catalogoAcademico],
  );

  const general = useMemo(() => resumenGeneral(filas), [filas]);
  const porPrograma = useMemo(() => resumenPorPrograma(filas), [filas]);
  const porDia = useMemo(
    () => resumenPorDia(filas, configuracion.dias),
    [filas, configuracion.dias],
  );

  const [q, setQ] = useState("");
  const [perfil, setPerfil] = useState<"todos" | Perfil>("todos");
  const [nivel, setNivel] = useState("todos");
  const [programa, setPrograma] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  const [dia, setDia] = useState<"todos" | Dia>("todos");
  const [asistencia, setAsistencia] = useState<FiltroAsistencia>("todos");
  const [pago, setPago] = useState<"todos" | EstadoPago>("todos");
  const [taller, setTaller] = useState<FiltroTaller>("todos");
  const [bandera, setBandera] = useState<FiltroBandera>("todos");

  const niveles = useMemo(() => unicosDe(participantes, (p) => p.nivel), [participantes]);
  /*
   * El desplegable de programa se acota al nivel elegido: ofrecer una maestría
   * mientras se filtra por "Licenciatura" solo puede devolver cero resultados.
   */
  const programas = useMemo(
    () =>
      unicosDe(
        nivel === "todos" ? participantes : participantes.filter((p) => p.nivel === nivel),
        (p) => p.programa,
      ),
    [participantes, nivel],
  );
  const grupos = useMemo(() => unicosDe(participantes, (p) => p.grupo), [participantes]);

  const filtrando =
    q.trim() !== "" ||
    perfil !== "todos" ||
    nivel !== "todos" ||
    programa !== "todos" ||
    grupo !== "todos" ||
    dia !== "todos" ||
    asistencia !== "todos" ||
    pago !== "todos" ||
    taller !== "todos" ||
    bandera !== "todos";

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => {
      const { p } = f;
      if (perfil !== "todos" && p.perfil !== perfil) return false;
      if (nivel !== "todos" && p.nivel !== nivel) return false;
      if (programa !== "todos" && p.programa !== programa) return false;
      if (grupo !== "todos" && p.grupo !== grupo) return false;
      if (dia !== "todos" && p.dia !== dia) return false;
      if (asistencia === "asistio" && !f.asistioSuDia) return false;
      if (asistencia === "no_asistio" && f.asistioSuDia) return false;
      if (pago !== "todos" && f.estadoPagoEvento !== pago) return false;
      if (taller === "sin_taller" && p.tallerId) return false;
      if (
        taller === "completo" &&
        (!p.tallerId || f.diasTaller.length === 0 || f.diasTallerAsistidos !== f.diasTaller.length)
      )
        return false;
      if (
        taller === "incompleto" &&
        (!p.tallerId || f.diasTaller.length === 0 || f.diasTallerAsistidos === f.diasTaller.length)
      )
        return false;
      if (bandera === "pago_sin_asistir" && !f.pagoSinAsistencia) return false;
      if (bandera === "preinscrito_sin_pagar" && !f.preinscritoSinPagar) return false;
      if (bandera === "asistio_sin_pago" && !f.asistioSinPagoConfirmado) return false;
      if (bandera === "taller_pagado_sin_completar" && !f.tallerPagadoSinCompletar) return false;
      if (!t) return true;
      return (
        p.nombre.toLowerCase().includes(t) ||
        (p.matricula ?? "").toLowerCase().includes(t) ||
        p.folio.toLowerCase().includes(t)
      );
    });
  }, [filas, q, perfil, nivel, programa, grupo, dia, asistencia, pago, taller, bandera]);

  const tramo = usePaginacion(
    visibles,
    50,
    `${q}|${perfil}|${nivel}|${programa}|${grupo}|${dia}|${asistencia}|${pago}|${taller}|${bandera}`,
  );

  const limpiar = () => {
    setQ("");
    setPerfil("todos");
    setNivel("todos");
    setPrograma("todos");
    setGrupo("todos");
    setDia("todos");
    setAsistencia("todos");
    setPago("todos");
    setTaller("todos");
    setBandera("todos");
  };

  const exportar = () => {
    const n = descargarCsv(
      "panorama.csv",
      [
        "folio",
        "matricula",
        "nombre",
        "perfil",
        "nivel",
        "programa",
        "avance",
        "grupo",
        "plantel",
        "dia",
        "asistio_su_dia",
        "dias_asistidos",
        "hora_entrada_evento",
        "hora_salida_evento",
        "estado_pago_evento",
        "evidencias_evento_aprobadas",
        "taller",
        "hora_entrada_taller",
        "dias_taller_asistidos_de",
        "estado_pago_taller",
        "evidencia_taller_aprobada",
        "elegible_evento",
        "elegible_taller",
        "pago_sin_asistencia",
        "preinscrito_sin_pagar",
        "asistio_sin_pago_confirmado",
      ],
      visibles.map((f) => [
        f.p.folio,
        f.p.matricula ?? "",
        f.p.nombre,
        f.p.perfil,
        f.p.nivel ?? "",
        f.p.programa ?? "",
        f.avance,
        f.p.grupo ?? "",
        f.p.plantel ?? "",
        String(f.p.dia),
        f.asistioSuDia ? "SI" : "NO",
        f.diasAsistidos.join("/"),
        f.horaEntradaEvento ?? "",
        f.horaSalidaEvento ?? "",
        f.estadoPagoEvento,
        String(f.evidenciasEventoAprobadas),
        f.tallerNombre ?? "",
        f.horaEntradaTaller ?? "",
        f.p.tallerId ? `${f.diasTallerAsistidos}/${f.diasTaller.length}` : "",
        f.estadoPagoTaller ?? "",
        f.p.tallerId ? (f.evidenciaTallerAprobada ? "SI" : "NO") : "",
        f.elegibleEvento ? "SI" : "NO",
        f.elegibleTaller === null ? "" : f.elegibleTaller ? "SI" : "NO",
        f.pagoSinAsistencia ? "SI" : "NO",
        f.preinscritoSinPagar ? "SI" : "NO",
        f.asistioSinPagoConfirmado ? "SI" : "NO",
      ]),
    );
    registrarBitacora("Exportó el panorama", `${n} participantes, con el filtro puesto`);
    toast.success(`Exportamos ${n} participantes.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Panorama"
      descripcion="El cruce completo por participante: asistencia real, pago, evidencia y datos académicos, para decidir con la cifra exacta y no con la impresión de la fila."
      acciones={
        <Button variant="outline" className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar ({visibles.length})
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaKpi
          icono={UserCheck}
          etiqueta="Pre-registrados"
          valor={general.total}
          pie="total de participantes"
        />
        <TarjetaKpi
          icono={CalendarCheck}
          etiqueta="Asistieron de verdad"
          valor={general.asistieronEvento}
          pie={`${general.pctAsistencia}% de los pre-registrados, el día que les tocaba`}
        />
        <TarjetaKpi
          icono={Wallet}
          etiqueta="Pagaron el evento"
          valor={general.pagadosEvento}
          pie={
            general.total > 0
              ? `${Math.round((general.pagadosEvento / general.total) * 100)}% de los pre-registrados`
              : "sin pre-registros"
          }
        />
        <TarjetaKpi
          icono={GraduationCap}
          etiqueta="Taller completo"
          valor={general.tallerCompletaron}
          pie={`de ${general.conTaller} con taller asignado`}
        />
        <TarjetaKpi
          icono={AlertTriangle}
          etiqueta="Pagaron y no asistieron"
          valor={general.pagoSinAsistencia}
          pie="su depósito está confirmado, pero no llegaron el día que les tocaba"
          alerta={general.pagoSinAsistencia > 0}
        />
        <TarjetaKpi
          icono={HandCoins}
          etiqueta="Preinscritos sin pagar"
          valor={general.preinscritosSinPagar}
          pie="su depósito del evento todavía no se reconoce"
          alerta={general.preinscritosSinPagar > 0}
        />
        <TarjetaKpi
          icono={AlertTriangle}
          etiqueta="Asistieron sin pago confirmado"
          valor={general.asistioSinPagoConfirmado}
          pie="entraron el día que les tocaba sin depósito reconocido: revisar en ventanilla"
          alerta={general.asistioSinPagoConfirmado > 0}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tarjeta padding="sm">
          <Rotulo>Por licenciatura y maestría</Rotulo>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-2 font-semibold">Nivel</th>
                  <th className="py-1.5 pr-2 font-semibold">Programa</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Preinscritos</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Pagados</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Asistieron</th>
                  <th className="py-1.5 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {porPrograma.map((r) => (
                  <tr
                    key={`${r.nivel}|${r.programa}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-1.5 pr-2">{r.nivel}</td>
                    <td className="py-1.5 pr-2">{r.programa}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.preinscritos}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.pagados}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {r.asistieron}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.pctAsistencia}%</td>
                  </tr>
                ))}
                {porPrograma.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground">
                      Todavía no hay nadie que contar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta padding="sm">
          <Rotulo>Por día del evento</Rotulo>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-2 font-semibold">Día</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Asignados</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Asistieron</th>
                  <th className="py-1.5 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((r) => (
                  <tr key={r.dia} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-2">{r.etiqueta}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.asignados}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {r.asistieron}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.pctAsistencia}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <Buscador
          className="w-full max-w-xs"
          valor={q}
          alCambiar={setQ}
          marcador="Nombre, folio o matrícula"
          etiqueta="Buscar un participante"
        />
        <Selector
          etiqueta="Perfil"
          valor={perfil}
          onChange={(v) => setPerfil(v as typeof perfil)}
          opciones={[
            ["todos", "Todos"],
            ["alumno", "Alumnos"],
            ["docente", "Docentes"],
            ["externo", "Externos"],
          ]}
        />
        <Selector
          etiqueta="Nivel"
          valor={nivel}
          onChange={(v) => {
            setNivel(v);
            setPrograma("todos");
          }}
          opciones={[["todos", "Todos"], ...niveles.map((x): [string, string] => [x, x])]}
        />
        <Selector
          etiqueta="Licenciatura / maestría"
          valor={programa}
          onChange={setPrograma}
          opciones={[["todos", "Todas"], ...programas.map((x): [string, string] => [x, x])]}
        />
        <Selector
          etiqueta="Grupo"
          valor={grupo}
          onChange={setGrupo}
          opciones={[["todos", "Todos"], ...grupos.map((x): [string, string] => [x, x])]}
        />
        <Selector
          etiqueta="Día"
          valor={String(dia)}
          onChange={(v) => setDia(v === "todos" ? "todos" : (Number(v) as Dia))}
          opciones={[
            ["todos", "Todos"],
            ["1", "Día 1"],
            ["2", "Día 2"],
            ["3", "Día 3"],
          ]}
        />
        <Selector
          etiqueta="Asistencia"
          valor={asistencia}
          onChange={(v) => setAsistencia(v as FiltroAsistencia)}
          opciones={[
            ["todos", "Todos"],
            ["asistio", "Asistió"],
            ["no_asistio", "No asistió"],
          ]}
        />
        <Selector
          etiqueta="Pago del evento"
          valor={pago}
          onChange={(v) => setPago(v as typeof pago)}
          opciones={ESTADOS_PAGO.map((e): [string, string] => [e.valor, e.etiqueta])}
        />
        <Selector
          etiqueta="Taller"
          valor={taller}
          onChange={(v) => setTaller(v as FiltroTaller)}
          opciones={[
            ["todos", "Todos"],
            ["completo", "Completó asistencia"],
            ["incompleto", "Asistencia incompleta"],
            ["sin_taller", "Sin taller"],
          ]}
        />
        <Selector
          etiqueta="Alertas"
          valor={bandera}
          onChange={(v) => setBandera(v as FiltroBandera)}
          opciones={[
            ["todos", "Todas"],
            ["pago_sin_asistir", "Pagó y no asistió"],
            ["preinscrito_sin_pagar", "Preinscrito sin pagar"],
            ["asistio_sin_pago", "Asistió sin pago confirmado"],
            ["taller_pagado_sin_completar", "Taller pagado sin completar"],
          ]}
        />
        {filtrando ? (
          <Button variant="outline" className="h-11" onClick={limpiar}>
            <X className="size-4" /> Limpiar filtros
          </Button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          {visibles.length} de {filas.length}
        </p>
      </div>

      <Tabla
        className="mt-3"
        anchoMinimo="110rem"
        columnas={[
          "Nombre",
          "Matrícula",
          "Licenciatura / maestría",
          "Avance",
          "Grupo",
          "Día",
          "Asistió",
          "Pago evento",
          "Taller",
          "Asistió taller",
          "Pago taller",
          "Evidencias",
          "Elegible",
          "Alertas",
        ]}
        vacio={
          visibles.length === 0 ? (
            <EstadoVacio titulo="Nadie coincide con estos filtros">
              {filas.length === 0
                ? "Todavía no hay nadie pre-registrado."
                : `Prueba con menos filtros${ejemplo ? `, o busca por folio, por ejemplo ${ejemplo}` : ""}.`}
            </EstadoVacio>
          ) : null
        }
      >
        {tramo.visibles.map((f) => (
          <FilaDetalle key={f.p.folio} f={f} />
        ))}
      </Tabla>
      <Paginacion
        tramo={tramo}
        nota="La exportación se lleva estos mismos, con el filtro puesto."
      />
    </PantallaPanel>
  );
}

function TarjetaKpi({
  icono: Icono,
  etiqueta,
  valor,
  pie,
  alerta = false,
}: {
  icono: typeof AlertTriangle;
  etiqueta: string;
  valor: number;
  pie: string;
  alerta?: boolean;
}) {
  return (
    <Tarjeta
      padding="sm"
      className={alerta && valor > 0 ? "border-estado-discrepancia/40" : undefined}
    >
      <div className="flex items-center gap-2">
        <Icono
          className={cn(
            "size-4",
            alerta && valor > 0 ? "text-estado-discrepancia" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <Rotulo>{etiqueta}</Rotulo>
      </div>
      <Cifra className={alerta && valor > 0 ? "text-estado-discrepancia" : undefined}>
        {valor}
      </Cifra>
      <p className="text-xs text-muted-foreground">{pie}</p>
    </Tarjeta>
  );
}

function Chip({ ok, textoSi, textoNo }: { ok: boolean; textoSi: string; textoNo: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        ok ? "bg-estado-pagado-bg text-estado-pagado" : "bg-muted text-muted-foreground",
      )}
    >
      {ok ? textoSi : textoNo}
    </span>
  );
}

function FilaDetalle({ f }: { f: FilaPanorama }) {
  const { p } = f;
  const alertas: string[] = [];
  if (f.pagoSinAsistencia) alertas.push("Pagó y no asistió");
  if (f.preinscritoSinPagar) alertas.push("Sin pago");
  if (f.asistioSinPagoConfirmado) alertas.push("Asistió sin pago");
  if (f.tallerPagadoSinCompletar) alertas.push("Taller incompleto");

  return (
    <Fila>
      <td className="px-3 py-2">
        <span className="font-medium">{p.nombre}</span>
        <PerfilBadge perfil={p.perfil} className="ml-2" />
        {p.nombreEnRevision ? (
          <span className="ml-2 text-xs font-semibold text-estado-discrepancia">en revisión</span>
        ) : null}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{p.matricula ?? "—"}</td>
      <td className="px-3 py-2">{p.programa ?? "—"}</td>
      <td className="px-3 py-2">{f.avance || "—"}</td>
      <td className="px-3 py-2">{p.grupo ?? "—"}</td>
      <td className="px-3 py-2 text-center">{p.dia}</td>
      <td className="px-3 py-2">
        <Chip ok={f.asistioSuDia} textoSi="Sí" textoNo="No" />
      </td>
      <td className="px-3 py-2">
        <EstadoPagoBadge estado={f.estadoPagoEvento} />
      </td>
      <td className="px-3 py-2">{f.tallerNombre ?? "—"}</td>
      <td className="px-3 py-2 text-center tabular-nums">
        {p.tallerId ? `${f.diasTallerAsistidos}/${f.diasTaller.length}` : "—"}
      </td>
      <td className="px-3 py-2">
        {f.estadoPagoTaller ? <EstadoPagoBadge estado={f.estadoPagoTaller} /> : "—"}
      </td>
      <td className="px-3 py-2 text-xs">
        {p.perfil === "alumno" ? (
          <>
            Evento {f.evidenciasEventoAprobadas}/2
            {p.tallerId ? <>, taller {f.evidenciaTallerAprobada ? "sí" : "no"}</> : null}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <Chip ok={f.elegibleEvento} textoSi="Evento sí" textoNo="Evento no" />
          {f.elegibleTaller !== null ? (
            <Chip ok={f.elegibleTaller} textoSi="Taller sí" textoNo="Taller no" />
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2">
        {alertas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {alertas.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-md bg-estado-discrepancia-bg px-2 py-0.5 text-xs font-semibold text-estado-discrepancia"
              >
                {a}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </Fila>
  );
}

function Selector({
  etiqueta,
  valor,
  onChange,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: [string, string][];
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-md border border-input bg-card px-2 text-sm"
      >
        {opciones.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Campo>
  );
}
