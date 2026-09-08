import { Ban, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Importador, FilaConSemaforo } from "@/lib/importador";

/**
 * Donde se suelta el archivo. Idéntica en la importación del padrón y en la
 * carga masiva de pagos, salvo el texto: lo único que cambia entre las dos es
 * qué se está subiendo.
 *
 * Acepta arrastrar y también el botón, porque no todos arrastran: en una
 * ventanilla con un ratón viejo, el arrastre falla y el botón no.
 */
export function ZonaDeArchivo<F extends FilaConSemaforo>({
  importador,
  titulo,
}: {
  importador: Importador<F>;
  /** «el archivo de pagos», «el padrón de Servicios Escolares». */
  titulo: string;
}) {
  const { arrastrando, setArrastrando, cargar, inputRef, errorArchivo } = importador;

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void cargar(f);
        }}
        className={cn(
          "flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          arrastrando ? "border-primary bg-secondary" : "border-border bg-card",
        )}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-base font-semibold">Arrastra aquí {titulo}</p>
        <p className="text-sm text-muted-foreground">o selecciónalo desde tu equipo</p>
        <Button className="mt-2 h-11" onClick={() => inputRef.current?.click()}>
          <FileSpreadsheet className="size-4" /> Elegir archivo
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void cargar(f);
          }}
        />
      </div>

      {errorArchivo ? (
        <Alert variant="destructive" className="mt-4">
          <Ban className="size-4" />
          <AlertTitle>No pudimos leer ese archivo</AlertTitle>
          <AlertDescription>{errorArchivo}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

/**
 * Los cuatro filtros de la vista previa, con su conteo. El número va dentro del
 * botón y no aparte porque es la razón de pulsarlo: «11 con error» es lo que
 * hace que alguien mire esas once.
 */
export function FiltroSemaforo<F extends FilaConSemaforo>({
  importador,
}: {
  importador: Importador<F>;
}) {
  const { filtro, setFiltro, resumen, filas } = importador;
  const opciones = [
    ["todas", `Todas (${filas?.length ?? 0})`],
    ["listo", `🟢 Listos (${resumen.listo})`],
    ["advertencia", `🟡 Advertencias (${resumen.advertencia})`],
    ["error", `🔴 Errores (${resumen.error})`],
  ] as const;

  return (
    <div className="flex flex-wrap gap-1">
      {opciones.map(([valor, etiqueta]) => (
        <button
          key={valor}
          type="button"
          onClick={() => setFiltro(valor as "todas" | F["semaforo"])}
          aria-pressed={filtro === valor}
          className={cn(
            "flex h-10 items-center rounded-md border px-3 text-sm font-medium",
            filtro === valor
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
