/**
 * Exportación a CSV, sin React.
 *
 * El formato está pensado para quien elabora los documentos, no para consulta en
 * pantalla. Dos cuidados que no son opcionales:
 *
 * 1. **BOM UTF-8.** Sin él, Excel en Windows abre el archivo como ANSI y la Ñ de
 *    MUÑOZ se convierte en basura. El sistema conserva la Ñ en todo el recorrido
 *    y sería absurdo perderla en el último paso.
 * 2. **Comillas.** Cualquier campo con coma, comilla o salto de línea se encierra
 *    y sus comillas se duplican, para que una fila no se parta en dos columnas.
 */

/** Escapa un valor para CSV. */
export function celda(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Arma el contenido CSV a partir de encabezados y filas. */
export function construirCsv(encabezados: string[], filas: unknown[][]): string {
  return [encabezados.map(celda).join(","), ...filas.map((f) => f.map(celda).join(","))].join(
    "\r\n",
  );
}

/**
 * Descarga un CSV en el navegador.
 *
 * El BOM inicial (U+FEFF) es lo que hace que Excel respete los acentos y
 * la Ñ al abrir el archivo con doble clic.
 */
export function descargarCsv(nombre: string, encabezados: string[], filas: unknown[][]): number {
  const contenido = "﻿" + construirCsv(encabezados, filas);
  if (typeof window === "undefined") return filas.length;
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".csv") ? nombre : `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return filas.length;
}
