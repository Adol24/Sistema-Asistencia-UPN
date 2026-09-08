import { cn } from "@/lib/utils";

/** QR decorativo determinista para el prototipo (no codifica información real). */
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
      className={cn("rounded-md bg-card p-0 shadow-sm ring-1 ring-border", className)}
    >
      <rect width={n} height={n} fill="white" />
      {Array.from({ length: n * n }).map((_, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const on = esAncla(r, c) ? anclaPintada(r, c) : celdas[i];
        return on ? <rect key={i} x={c} y={r} width={1} height={1} fill="#0f172a" /> : null;
      })}
    </svg>
  );
}
