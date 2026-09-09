import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { navAdmin } from "@/components/nav-admin";
import { Button } from "@/components/ui/button";
import { useEstadoEvento } from "@/lib/estado-evento";
import { avanceTexto } from "@/dominio/catalogos";
import { descargarCsv } from "@/lib/exportar";
import { elegibilidadEvento, nombreConstancia, nombreEnRevisionActivo } from "@/lib/elegibilidad";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/reportes")({
  head: () =>
    meta(
      "Reportes — Administración del Encuentro",
      "Padrón, pagos, asistencia por día, ocupación de talleres, evidencias y elegibles, con vista de tabla y exportación.",
    ),
  component: Reportes,
});

type IdReporte =
  "padron" | "academicos" | "pagos" | "asistencia" | "talleres" | "evidencias" | "elegibles";

interface Reporte {
  id: IdReporte;
  titulo: string;
  nota: string;
  encabezados: string[];
  filas: unknown[][];
}

function Reportes() {
  const {
    participantes,
    padron,
    pagos,
    asistencias,
    asistenciasDe,
    evidencias,
    talleres,
    getTaller,
    estadoDe,
    casos,
    registrarBitacora,
    configuracion,
  } = useEstadoEvento();
  const [activo, setActivo] = useState<IdReporte>("pagos");
  const [pagina, setPagina] = useState(1);

  // Todo sale del contexto compartido: un reporte generado después de registrar
  // pagos en la misma sesión los incluye, sin recargar.
  const reportes = useMemo<Reporte[]>(() => {
    const entorno = {
      estadoDe,
      asistenciasDe,
      evidencias,
      diasTallerDe: (id: string | undefined) => (getTaller(id)?.dias ?? []) as Dia[],
    };

    return [
      {
        id: "padron",
        titulo: "Padrón de alumnos",
        nota: `${padron.length} alumnos, tal como los entrega Servicios Escolares`,
        encabezados: [
          "matricula",
          "nombre",
          "nivel",
          "programa",
          "avance",
          "grupo",
          "plantel",
          "dia_evento",
        ],
        filas: padron.map((a) => [
          a.matricula,
          a.nombre,
          a.nivel,
          a.programa,
          a.avance,
          a.grupo ?? "",
          a.plantel,
          a.dia ?? "sin asignar",
        ]),
      },
      {
        id: "academicos",
        titulo: "Datos académicos declarados",
        nota: "Lo que entrega Servicios Escolares, junto al contacto que declara el alumno",
        encabezados: [
          "matricula",
          "nombre",
          "nivel",
          "programa",
          "avance",
          "grupo",
          "plantel",
          "correo",
          "celular",
        ],
        filas: participantes
          .filter((p) => p.perfil === "alumno")
          .map((p) => [
            p.matricula ?? "",
            p.nombre,
            p.nivel ?? "",
            p.programa ?? "",
            avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance),
            p.grupo ?? "",
            p.plantel ?? "",
            p.correo,
            p.celular,
          ]),
      },
      {
        id: "pagos",
        titulo: "Pagos registrados",
        nota: `${pagos.length} pagos, incluidos los de esta sesión`,
        encabezados: [
          "folio",
          "concepto",
          "monto",
          "monto_esperado",
          "referencia",
          "fecha_deposito",
          "resultado",
          "origen",
          "nota",
        ],
        filas: pagos.map((p) => [
          p.folio,
          p.concepto,
          p.monto.toFixed(2),
          p.montoEsperado.toFixed(2),
          p.referencia,
          p.fechaDeposito,
          p.resultado,
          p.origen,
          p.nota ?? "",
        ]),
      },
      {
        id: "asistencia",
        titulo: "Asistencia por día",
        nota: `${asistencias.length} registros de entrada, salida y taller`,
        encabezados: [
          "folio",
          "nombre",
          "dia",
          "tipo",
          "hora",
          "punto",
          "capturista",
          "cierre_automatico",
          "autorizacion",
        ],
        filas: asistencias.map((a) => [
          a.folio,
          a.nombre,
          a.dia,
          a.tipo,
          a.hora,
          a.punto,
          a.capturista,
          a.cierreAutomatico ? "SI" : "NO",
          a.autorizacion ? `${a.autorizacion.autorizadoPor}: ${a.autorizacion.nota}` : "",
        ]),
      },
      {
        id: "talleres",
        titulo: "Ocupación de talleres",
        nota: `${talleres.length} talleres`,
        encabezados: [
          "id",
          "nombre",
          "ponente",
          "dias",
          "cupo_total",
          "cupo_ocupado",
          "disponibles",
          "costo",
          "activo",
        ],
        filas: talleres.map((t) => [
          t.id,
          t.nombre,
          t.ponente,
          t.dias.join(" y "),
          t.cupoTotal,
          t.cupoOcupado,
          Math.max(0, t.cupoTotal - t.cupoOcupado),
          t.costo.toFixed(2),
          t.activo ? "SI" : "NO",
        ]),
      },
      {
        id: "evidencias",
        titulo: "Evidencias",
        nota: `${evidencias.length} evidencias, con las decisiones de esta sesión aplicadas`,
        encabezados: [
          "id",
          "folio",
          "matricula",
          "nombre",
          "dia",
          "subida_en",
          "estado",
          "motivo_rechazo",
          "revisor",
        ],
        filas: evidencias.map((e) => [
          e.id,
          e.folio,
          e.matricula,
          e.nombre,
          e.dia,
          e.subidaEn,
          e.estado,
          e.motivoRechazo ?? "",
          e.revisor ?? "",
        ]),
      },
      {
        id: "elegibles",
        titulo: "Elegibles para constancia",
        nota: "Nombre ya normalizado para imprimir, con la marca de nombre en revisión",
        encabezados: [
          "nombre_constancia",
          "folio",
          "matricula",
          "perfil",
          "nivel",
          "programa",
          "dia",
          "lugar",
          "elegible",
          "nombre_en_revision",
          "requisito_faltante",
        ],
        filas: participantes.map((p) => {
          const e = elegibilidadEvento(entorno, p);
          const marca = nombreEnRevisionActivo(p, casos);
          return [
            nombreConstancia(p.nombre),
            p.folio,
            p.matricula ?? "",
            p.perfil,
            p.nivel ?? "",
            p.programa ?? "",
            p.dia,
            p.lugar,
            e.elegible ? "SI" : "NO",
            marca.marcado ? "SI — REVISAR ANTES DE IMPRIMIR" : "NO",
            e.faltante?.comoSeResuelve ?? "",
          ];
        }),
      },
    ];
  }, [
    participantes,
    padron,
    pagos,
    asistencias,
    asistenciasDe,
    evidencias,
    talleres,
    getTaller,
    estadoDe,
    casos,
    configuracion.catalogoAcademico,
  ]);

  const r = reportes.find((x) => x.id === activo)!;

  // La vista pagina; la exportación siempre lleva el reporte completo.
  const POR_PAGINA = 50;
  const totalPaginas = Math.max(1, Math.ceil(r.filas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const desde = (paginaActual - 1) * POR_PAGINA;
  const visibles = r.filas.slice(desde, desde + POR_PAGINA);

  const exportar = () => {
    const n = descargarCsv(`reporte-${r.id}.csv`, r.encabezados, r.filas);
    registrarBitacora("Exportó un reporte", `${r.titulo} · ${n} registros`);
    toast.success(`Exportamos ${n} registros de «${r.titulo}».`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Reportes"
      descripcion="Se calculan del estado de la sesión: lo que registres hoy aparece aquí sin recargar."
      nav={navAdmin}
      acciones={
        <Button className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar {r.titulo.toLowerCase()} ({r.filas.length})
        </Button>
      }
    >
      <div className="flex flex-wrap gap-1">
        {reportes.map((x) => (
          <button
            key={x.id}
            onClick={() => {
              setActivo(x.id);
              setPagina(1);
            }}
            aria-pressed={activo === x.id}
            className={cn(
              "flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium",
              activo === x.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            {x.titulo}
            <span className="text-xs opacity-70">{x.filas.length}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{r.nota}</p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              {r.encabezados.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila, i) => (
              <tr key={desde + i} className="border-b border-border last:border-0">
                {fila.map((celda, k) => (
                  <td key={k} className="px-3 py-2">
                    {String(celda)}
                  </td>
                ))}
              </tr>
            ))}
            {r.filas.length === 0 ? (
              <tr>
                <td colSpan={r.encabezados.length} className="px-3 py-12 text-center">
                  <Table2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-3 text-sm font-semibold">Este reporte no tiene registros</p>
                  <p className="text-sm text-muted-foreground">
                    Aparecerán en cuanto se generen datos en la sesión.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {r.filas.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Mostrando {desde + 1}–{Math.min(desde + POR_PAGINA, r.filas.length)} de {r.filas.length}
            . La exportación incluye siempre el reporte completo.
          </p>
          {totalPaginas > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                className="h-10"
                disabled={paginaActual === 1}
                onClick={() => setPagina(paginaActual - 1)}
              >
                <ChevronLeft className="size-4" /> Anterior
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                Página {paginaActual} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                className="h-10"
                disabled={paginaActual === totalPaginas}
                onClick={() => setPagina(paginaActual + 1)}
              >
                Siguiente <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </PantallaPanel>
  );
}
