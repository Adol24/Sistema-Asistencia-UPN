import { cn } from "@/lib/utils";

/**
 * QR decorativo determinista para el prototipo (no codifica información real).
 *
 * `size` es un máximo, no un ancho fijo: el SVG se encoge con `max-w-full` para
 * que en un teléfono de 320 px no desborde la tarjeta y provoque scroll
 * horizontal. Es la pantalla que el alumno abre en la fila de la entrada, así
 * que ocupa todo el ancho disponible hasta ese máximo.
 *
 * El código va en negro puro sobre blanco puro, sin los colores de la paleta:
 * un lector de códigos necesita el contraste máximo y no le importa la marca.
 */
export function QrFalso({
  valor,
  size = 200,
  className,
}: {
  valor: string;
  size?: number;
  className?: string;
}) {
  const n = 21;
  let h = 7;
  for (let i = 0; i < valor.length; i++) h = (h * 31 + valor.charCodeAt(i)) >>> 0;
  const celdas: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    celdas.push(((h >> 16) & 1) === 1);
  }
  const esAncla = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const anclaPintada = (r: number, c: number) => {
    const rr = r >= n - 7 ? r - (n - 7) : r;
    const cc = c >= n - 7 ? c - (n - 7) : c;
    const borde = rr === 0 || rr === 6 || cc === 0 || cc === 6;
    const centro = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
    return borde || centro;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={`Código QR del folio ${valor}`}
      className={cn(
        "h-auto max-w-full rounded-md bg-white shadow-sm ring-1 ring-border",
        className,
      )}
    >
      <rect width={n} height={n} fill="white" />
      {Array.from({ length: n * n }).map((_, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const on = esAncla(r, c) ? anclaPintada(r, c) : celdas[i];
        return on ? <rect key={i} x={c} y={r} width={1} height={1} fill="#000000" /> : null;
      })}
    </svg>
  );
}
