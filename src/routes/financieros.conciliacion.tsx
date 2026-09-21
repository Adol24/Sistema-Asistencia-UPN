import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Copy, Download, TimerOff, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Buscador } from "@/components/buscador";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Tabla } from "@/components/tabla";
import { Indicador } from "@/components/indicador";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";

import { fechaLimiteTexto, moneda } from "@/lib/formato";
import { folioDeEjemplo } from "@/lib/busqueda";
import { useEstadoEvento } from "@/lib/estado-evento";
import { porVencer as vencible } from "@/lib/pagos-logica";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";
import { GrupoFiltro } from "@/components/grupo-filtro";

export const Route = createFileRoute("/financieros/conciliacion")({
  head: () =>
    meta(
      "Conciliación — Servicios Financieros",
      "Total recaudado, desglose por evento y taller, discrepancias, referencias duplicadas y pre-registros por vencer.",
    ),
  component: Conciliacion,
});

type Filtro = "todos" | "pagado" | "discrepancia" | "por_vencer";

function Conciliacion() {
  const { participantes, pagos, estadoDe, configuracion: evento } = useEstadoEvento();
  const navigate = useNavigate();
  const { setFolio } = usePrototipo();
  const ejemplo = folioDeEjemplo(participantes);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  // Todos los totales se calculan de los pagos registrados; ninguno está escrito a mano.
  const cifras = useMemo(() => {
    const evento_ = pagos.filter((p) => p.concepto === "evento");
    const taller_ = pagos.filter((p) => p.concepto === "taller");
    const suma = (xs: typeof pagos) => xs.reduce((a, p) => a + p.monto, 0);

    // Solo los pagos que traen referencia entran en el conteo de duplicadas.
    // Los de ventanilla ya no la capturan, y meterlos con la cadena vacía haría
    // que todos aparecieran como duplicados unos de otros.
    const porReferencia = new Map<string, typeof pagos>();
    pagos.forEach((p) => {
      const k = p.referencia?.trim().toLowerCase();
      if (!k) return;
      porReferencia.set(k, [...(porReferencia.get(k) ?? []), p]);
    });
    const duplicadas = [...porReferencia.entries()].filter(([, g]) => g.length > 1);

    const porVencer = participantes.filter((p) => vencible(estadoDe(p).evento));

    return {
      total: suma(pagos),
      totalEvento: suma(evento_),
      totalTaller: suma(taller_),
      nEvento: evento_.length,
      nTaller: taller_.length,
      discrepancias: pagos.filter((p) => p.resultado === "discrepancia"),
      duplicadas,
      porVencer,
    };
  }, [participantes, pagos, estadoDe]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return participantes
      .map((p) => {
        const e = estadoDe(p);
        const suyos = pagos.filter((x) => x.folio === p.folio);
        return { p, estado: e, pagado: suyos.reduce((a, x) => a + x.monto, 0), n: suyos.length };
      })
      .filter((f) => {
        if (filtro === "pagado" && f.estado.evento !== "pagado") return false;
        if (
          filtro === "discrepancia" &&
          f.estado.evento !== "discrepancia" &&
          f.estado.taller !== "discrepancia"
        )
          return false;
        if (
          filtro === "por_vencer" &&
          f.estado.evento !== "pre_registrado" &&
          f.estado.evento !== "comprobante_recibido"
        )
          return false;
        if (!t) return true;
        return (
          f.p.folio.toLowerCase().includes(t) ||
          f.p.nombre.toLowerCase().includes(t) ||
          (f.p.matricula ?? "").toLowerCase().includes(t)
        );
      });
  }, [participantes, q, filtro, pagos, estadoDe]);

  const exportar = () => {
    const csv = [
      "folio,nombre,perfil,dia,estado_evento,estado_taller,pagos_registrados,total_pagado",
      ...filas.map((f) =>
        [
          participantes,
          f.p.folio,
          `"${f.p.nombre}"`,
          f.p.perfil,
          f.p.dia,
          f.estado.evento,
          f.estado.taller ?? "",
          f.n,
          f.pagado.toFixed(2),
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "conciliacion.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportamos ${filas.length} registros.`);
  };

  return (
    <PantallaPanel
      area="financieros"
      titulo="Conciliación"
      descripcion="Todo lo de esta pantalla se calcula de los pagos registrados en la sesión."
      acciones={
        <Button variant="outline" className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar ({filas.length})
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador
          icono={<Wallet className="size-5" aria-hidden />}
          etiqueta="Total recaudado"
          valor={moneda(cifras.total)}
          detalle={`${pagos.length} pagos registrados`}
          destacada
        />
        <Indicador
          etiqueta="Evento"
          valor={moneda(cifras.totalEvento)}
          detalle={`${cifras.nEvento} depósitos · cuota ${moneda(evento.cuotaEvento)}`}
        />
        <Indicador
          etiqueta="Talleres"
          valor={moneda(cifras.totalTaller)}
          detalle={`${cifras.nTaller} depósitos`}
        />
        <Indicador
          icono={<AlertTriangle className="size-5" aria-hidden />}
          etiqueta="Pagos en discrepancia"
          valor={String(cifras.discrepancias.length)}
          detalle="Monto distinto al esperado"
          tono="alerta"
        />
        <Indicador
          icono={<Copy className="size-5" aria-hidden />}
          etiqueta="Referencias duplicadas"
          valor={String(cifras.duplicadas.length)}
          detalle={
            cifras.duplicadas.length
              ? cifras.duplicadas
                  .map(([r]) => r.toUpperCase())
                  .slice(0, 2)
                  .join(", ")
              : "Ninguna detectada"
          }
          tono={cifras.duplicadas.length ? "critico" : undefined}
        />
        <Indicador
          icono={<TimerOff className="size-5" aria-hidden />}
          etiqueta="Pre-registros por vencer"
          valor={String(cifras.porVencer.length)}
          detalle={`Vencen el ${fechaLimiteTexto(evento.fechaLimite)}`}
          tono="alerta"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Buscador
          className="w-full max-w-sm"
          valor={q}
          alCambiar={setQ}
          marcador="Filtrar por folio, nombre o matrícula"
          etiqueta="Filtrar la tabla de conciliación"
        />
        <GrupoFiltro
          valor={filtro}
          alElegir={setFiltro}
          opciones={[
            ["todos", "Todos"],
            ["pagado", "Pagados"],
            ["discrepancia", "Con discrepancia"],
            ["por_vencer", "Por vencer"],
          ]}
        />
      </div>

      {/*
        La fila abre la ficha de esa persona. Antes la tabla era un callejón sin
        salida: se veía aquí a quién le faltaba pagar y había que volver a la
        lista y teclear su nombre otra vez.
      */}
      <Tabla
        className="mt-3"
        anchoMinimo="52rem"
        columnas={[
          "Folio",
          "Participante",
          "Perfil",
          "Día",
          "Evento",
          "Taller",
          "Pagos",
          "Cobrado",
        ]}
        vacio={
          filas.length === 0 ? (
            <>
              <p className="text-sm font-semibold">Sin resultados para ese filtro</p>
              <p className="text-sm text-muted-foreground">
                {ejemplo
                  ? `Prueba con el folio completo, por ejemplo ${ejemplo}, o quita `
                  : "Quita "}
                el filtro de estado.
              </p>
            </>
          ) : null
        }
      >
        {filas.map((f) => (
          <Fila
            key={f.p.folio}
            onClick={() => {
              setFolio(f.p.folio);
              void navigate({ to: "/financieros/ficha" });
            }}
            tabIndex={0}
            role="button"
            aria-label={`Abrir la ficha de ${f.p.nombre}`}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              setFolio(f.p.folio);
              void navigate({ to: "/financieros/ficha" });
            }}
            className="cursor-pointer hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <td className="px-3 py-2 font-mono text-xs">{f.p.folio}</td>
            <td className="px-3 py-2">{f.p.nombre}</td>
            <td className="px-3 py-2">
              <PerfilBadge perfil={f.p.perfil} />
            </td>
            <td className="px-3 py-2">{f.p.dia}</td>
            <td className="px-3 py-2">
              <EstadoPagoBadge estado={f.estado.evento} />
            </td>
            <td className="px-3 py-2">
              {f.estado.taller ? (
                <EstadoPagoBadge estado={f.estado.taller} />
              ) : (
                <span className="text-xs text-muted-foreground">Sin taller</span>
              )}
            </td>
            <td className="px-3 py-2 text-muted-foreground">{f.n}</td>
            <td className="px-3 py-2 font-semibold">{moneda(f.pagado)}</td>
          </Fila>
        ))}
      </Tabla>
    </PantallaPanel>
  );
}
