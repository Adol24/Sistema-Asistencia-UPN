import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FiltroSemaforo, ZonaDeArchivo } from "@/components/zona-archivo";
import { useImportador } from "@/lib/importador";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { SemaforoFilaBadge } from "@/components/estado-badges";
import { navFinancieros } from "@/components/nav-financieros";
import { Button } from "@/components/ui/button";
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
import { simularLatencia } from "@/lib/formato";
import { useEstadoEvento } from "@/lib/estado-evento";
import {
  analizarArchivo,
  COLUMNAS,
  resumirFilas,
  type FilaAnalizada,
  type Semaforo,
} from "@/lib/carga-masiva";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/financieros/carga-masiva")({
  head: () =>
    meta(
      "Carga masiva — Servicios Financieros",
      "Carga por archivo de los pagos del Encuentro, con vista previa obligatoria, semáforo por fila y confirmación antes de aplicar.",
    ),
  component: CargaMasiva,
});

function CargaMasiva() {
  const { registrarLote, pagos, registrarBitacora } = useEstadoEvento();
  const [aplicado, setAplicado] = useState<number | null>(null);
  // El flujo de importar —soltar, analizar, filtrar, confirmar, aplicar— es el
  // mismo que el del padrón y vive en un solo lugar.
  const analizar = useCallback((texto: string) => analizarArchivo(texto, pagos), [pagos]);
  const imp = useImportador<FilaAnalizada>(analizar);
  const { filas, leyendo, archivo, confirmando, aplicando, resumen, visibles } = imp;

  const aplicar = () =>
    imp.aplicar((filasAplicables) => {
      const aAplicar = filasAplicables.filter((f) => f.pago).map((f) => f.pago!);
      registrarLote(aAplicar);
      registrarBitacora(
        "Aplicó una carga masiva de pagos",
        `${archivo ?? "archivo"} · ${aAplicar.length} pagos aplicados`,
      );
      setAplicado(aAplicar.length);
      toast.success(`Se aplicaron ${aAplicar.length} pagos.`);
    });

  const descargarTexto = (nombre: string, contenido: string) => {
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PantallaPanel
      titulo="Carga masiva de pagos"
      descripcion="Nada cambia de estado hasta que confirmas. Primero revisas, después aplicas."
      nav={navFinancieros}
      acciones={
        <Button
          variant="outline"
          className="h-11"
          onClick={() =>
            descargarTexto(
              "plantilla-pagos.csv",
              `${COLUMNAS.join(",")}\nPRE-00801,evento,650.00,REF900001,08/10/2026\n`,
            )
          }
        >
          <Download className="size-4" /> Descargar plantilla
        </Button>
      }
    >
      {aplicado !== null ? (
        <Alert className="mb-4">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Se aplicaron {aplicado} pagos</AlertTitle>
          <AlertDescription>
            Los estados quedaron actualizados. Puedes verlos en la conciliación o en la ficha de
            cada participante. Hay {pagos.length} pagos registrados en total.
          </AlertDescription>
        </Alert>
      ) : null}

      {!filas && !leyendo ? (
        <>
          <ZonaDeArchivo importador={imp} titulo="el archivo de pagos" />

          <section className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Columnas requeridas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              El archivo debe traer estas cinco columnas, en cualquier orden, con el encabezado en
              la primera fila. El prototipo lee archivos <code className="font-mono">.csv</code>,
              que Excel abre y exporta sin conversión.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {COLUMNAS.map((c) => (
                <li
                  key={c}
                  className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs"
                >
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Para probar hay dos archivos de ejemplo:{" "}
              <a
                href="/ejemplos/pagos-validos.csv"
                download
                className="font-semibold text-primary underline"
              >
                pagos-validos.csv
              </a>{" "}
              (todo correcto) y{" "}
              <a
                href="/ejemplos/pagos-mixtos.csv"
                download
                className="font-semibold text-primary underline"
              >
                pagos-mixtos.csv
              </a>{" "}
              (dispara los tres resultados a la vez).
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
              Esto es una vista previa de {archivo}. Todavía no se ha modificado ningún estado: los
              cambios se aplican solo cuando confirmas.
            </AlertDescription>
          </Alert>

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
                  descargarTexto(
                    "errores-carga.csv",
                    `fila,${COLUMNAS.join(",")},motivo\n` +
                      filas
                        .filter((f) => f.semaforo === "error")
                        .map(
                          (f) =>
                            `${f.n},${COLUMNAS.map((c) => f.crudo[c] ?? "").join(",")},"${f.motivo}"`,
                        )
                        .join("\n"),
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
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  {[
                    "#",
                    "Estado",
                    "Folio",
                    "Participante",
                    "Concepto",
                    "Monto",
                    "Referencia",
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
                    <td className="px-3 py-2 font-mono text-xs">{f.crudo["folio"]}</td>
                    <td className="px-3 py-2">{f.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{f.crudo["concepto"]}</td>
                    <td className="px-3 py-2">{f.crudo["monto"]}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {f.crudo["referencia_bancaria"]}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.motivo}</td>
                  </tr>
                ))}
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
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
            <AlertDialogTitle>¿Aplicar {resumen.aplicables} pagos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrarán {resumen.listo} pagos como pagado y {resumen.advertencia} como
              discrepancia. Las {resumen.error} filas con error se omiten. Esta acción cambia el
              estado de los participantes y no se puede deshacer desde esta pantalla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void aplicar()}>
              Sí, aplicar {resumen.aplicables} pagos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PantallaPanel>
  );
}
