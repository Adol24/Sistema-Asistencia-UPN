import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { usePaginacion } from "@/lib/paginacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstadoEvento } from "@/lib/estado-evento";
import { avanceTexto } from "@/dominio/catalogos";
import { descargarCsv } from "@/lib/exportar";
import {
  elegibilidadEvento,
  nombreConstancia,
  nombreEnRevisionActivo,
  useEntornoConstancias,
} from "@/lib/elegibilidad";
import { meta } from "@/lib/seo";
import { GrupoFiltro } from "@/components/grupo-filtro";

export const Route = createFileRoute("/admin/reportes")({
  head: () =>
    meta(
      "Reportes — Administración del Encuentro",
      "Padrón, pagos, asistencia por día, ocupación de talleres, evidencias y elegibles, con vista de tabla y exportación.",
    ),
  component: Reportes,
});

type IdReporte =
  | "padron"
  | "academicos"
  | "pagos"
  | "asistencia"
  | "talleres"
  | "evidencias"
  | "elegibles"
  | "aviso";

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
    evidencias,
    talleres,
    casos,
    registrarBitacora,
    configuracion,
  } = useEstadoEvento();
  const entorno = useEntornoConstancias();
  const [activo, setActivo] = useState<IdReporte>("pagos");
  const [q, setQ] = useState("");

  // Todo sale del contexto compartido: un reporte generado después de registrar
  // pagos en la misma sesión los incluye, sin recargar.
  const reportes = useMemo<Reporte[]>(() => {
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
          "sede",
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
          "sede",
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
            avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
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
        /*
         * La constancia de que cada quien aceptó el aviso de privacidad.
         *
         * Va en su propio reporte y no como una columna de «Datos académicos»
         * porque aquel filtra por alumno, y el aviso lo aceptan los tres
         * perfiles. Y porque esto es lo que se entrega si alguna vez lo piden:
         * una lista de quién aceptó y cuándo, no una columna perdida entre el
         * semestre y el grupo.
         *
         * «No consta» no es un hueco: es quien se pre-registró antes de que el
         * aviso se enseñara. Decirlo así, en vez de dejar la celda vacía, es la
         * diferencia entre un dato que falta y un dato que no existe.
         */
        id: "aviso",
        titulo: "Aceptación del aviso de privacidad",
        nota: `${participantes.filter((p) => p.aceptoAvisoEn).length} de ${
          participantes.length
        } con fecha de aceptación registrada`,
        encabezados: ["folio", "nombre", "perfil", "correo", "acepto_el_aviso", "fecha_y_hora"],
        filas: participantes.map((p) => [
          p.folio,
          p.nombre,
          p.perfil,
          p.correo,
          p.aceptoAvisoEn ? "sí" : "no consta",
          p.aceptoAvisoEn ?? "",
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
    // `entorno` sustituye a `asistenciasDe`, `evidencias`, `getTaller` y
    // `estadoDe`: los cuatro se agrupan ahí, y el hook los memoiza, así que
    // enumerarlos aquí además sería recalcular por partida doble.
  }, [
    participantes,
    padron,
    pagos,
    asistencias,
    evidencias,
    talleres,
    entorno,
    casos,
    configuracion.catalogoAcademico,
  ]);

  const r = reportes.find((x) => x.id === activo)!;

  /*
   * El buscador mira todas las columnas del reporte activo.
   *
   * Es genérico a propósito: son siete reportes con encabezados distintos, y
   * enseñarle a cada uno cuál es su columna «buscable» los ataría a esta
   * pantalla. Recorrer la fila entera acierta con matrícula, nombre, folio,
   * referencia o clave de taller sin saber cuál es cuál.
   *
   * Con 50 filas por página, buscar un alumno entre cientos significaba pasar
   * páginas o exportar el CSV y abrirlo en Excel.
   */
  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return r.filas;
    return r.filas.filter((f) => f.some((c) => String(c).toLowerCase().includes(t)));
  }, [r.filas, q]);

  /*
   * La vista pagina; la exportación lleva lo que se está viendo, filtro
   * incluido. Se vuelve a la página 1 al cambiar de reporte o de búsqueda:
   * son otra lista, y quedarse en la página 7 de otra cosa es empezar por el
   * final.
   */
  const tramo = usePaginacion(filas, 50, `${activo}|${q}`);

  const exportar = () => {
    // Se exporta lo filtrado, no el reporte entero: quien acotó a un grupo y
    // pulsa exportar espera ese grupo, y llevarse todo pasa inadvertido hasta
    // que alguien abre el archivo.
    const n = descargarCsv(`reporte-${r.id}.csv`, r.encabezados, filas);
    registrarBitacora("Exportó un reporte", `${r.titulo} · ${n} registros`);
    toast.success(`Exportamos ${n} registros de «${r.titulo}».`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Reportes"
      acciones={
        <Button className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar {r.titulo.toLowerCase()} ({filas.length})
        </Button>
      }
    >
      <GrupoFiltro
        valor={activo}
        alElegir={setActivo}
        claseBoton="h-11 gap-2"
        opciones={reportes.map(
          (x) =>
            [
              x.id,
              <>
                {x.titulo}
                <span className="text-xs opacity-70">{x.filas.length}</span>
              </>,
            ] as const,
        )}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          placeholder="Buscar en este reporte: matrícula, nombre, folio…"
          aria-label="Buscar en el reporte"
          className="h-11 max-w-md"
        />
        {q.trim() ? (
          <span className="text-sm text-muted-foreground">
            {filas.length} de {r.filas.length}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{r.nota}</p>

      <Tabla
        className="mt-3"
        anchoMinimo="56rem"
        columnas={r.encabezados}
        claseColumnas="whitespace-nowrap font-mono text-xs"
        vacio={
          r.filas.length === 0 ? (
            <>
              <Table2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold">Este reporte no tiene registros</p>
              <p className="text-sm text-muted-foreground">
                Aparecerán en cuanto se generen datos en la sesión.
              </p>
            </>
          ) : null
        }
      >
        {tramo.visibles.map((fila, i) => (
          <Fila key={tramo.desde + i}>
            {fila.map((celda, k) => (
              <td key={k} className="px-3 py-2">
                {String(celda)}
              </td>
            ))}
          </Fila>
        ))}
      </Tabla>
      {/*
        El pie decía dos cosas que no eran ciertas.
        Contaba «de {r.filas.length}» —el reporte entero— mientras paginaba
        sobre lo filtrado, así que al buscar algo el total seguía siendo el de
        antes y las cuentas no cerraban. Y prometía que «la exportación incluye
        siempre el reporte completo» cuando `exportar` lleva justo lo filtrado,
        a propósito: quien acota a un grupo y pulsa exportar espera ese grupo.
        Las dos salían de escribir el pie a mano; ahora los números los da el
        mismo tramo que recortó las filas.
      */}
      <Paginacion
        tramo={tramo}
        nota="La exportación se lleva estas mismas, con el filtro puesto."
      />
    </PantallaPanel>
  );
}
