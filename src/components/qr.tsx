import { useMemo } from "react";
import { encode, QrCodeDataType } from "uqr";

import { cn } from "@/lib/utils";

/**
 * El código QR del participante. Escanea de verdad.
 *
 * Lo que había era decorativo: una retícula de 21×21 con celdas seudoaleatorias
 * a partir del folio. Se veía como un QR y ningún lector podía leerlo, que en
 * una pantalla cuyo único trabajo es abrirle la puerta a alguien es lo mismo que
 * no tener nada.
 *
 * Ahora se codifica con `uqr` —92 KB, sin dependencias— y se dibuja aquí, para
 * poder darle carácter sin romper lo que un lector necesita.
 *
 * Lo que NO se toca, porque es lo que hace que funcione:
 *
 * - **Zona tranquila de 4 módulos.** Es el error más común: recortarla para que
 *   el código «se vea más grande». Sin ese margen en blanco, muchos lectores no
 *   encuentran el símbolo.
 * - **Contraste.** Los módulos van en tinta casi negra sobre blanco puro. La
 *   marca entra por los ojos localizadores, que no llevan datos, y por el marco;
 *   teñir los datos de azul baja el contraste justo donde se mide.
 * - **Corrección de errores alta (H).** Recupera hasta un 30 % del símbolo, que
 *   es lo que permite poner el escudo en el centro y sobrevivir a una pantalla
 *   rayada o con brillo.
 * - **Módulos cuadrados, no redondos.** Redondearlos está de moda y se lee peor
 *   a distancia y con poca luz. Esto se escanea en la fila de una entrada.
 */

/** Cuánto ocupa el hueco central, como proporción del símbolo. */
const HUECO = 0.24;

/**
 * El hueco más grande que cabe sin tocar un ojo localizador.
 *
 * No es una precaución teórica: con el 24 % fijo, un símbolo de versión 1 —el
 * que sale de un folio corto— metía la esquina del hueco dentro del ojo
 * superior izquierdo. Tapar un ojo no lo arregla la corrección de errores: sin
 * él, el lector no encuentra el símbolo y no hay nada que corregir.
 *
 * Se encoge hasta que quede limpio, en vez de fijar un número que habría que
 * revisar cada vez que cambie el largo de los folios.
 */
function huecoSeguro(qr: ReturnType<typeof encode>, deseado: number): number {
  const n = qr.size;
  for (let lado = deseado; lado >= 3; lado--) {
    const desde = Math.floor((n - lado) / 2);
    let limpio = true;
    for (let f = desde; f < desde + lado && limpio; f++)
      for (let c = desde; c < desde + lado; c++)
        if (qr.types[f]?.[c] === QrCodeDataType.Position) {
          limpio = false;
          break;
        }
    if (limpio) return lado;
  }
  return 0;
}

export function CodigoQR({
  valor,
  size = 240,
  etiqueta,
  className,
}: {
  valor: string;
  size?: number;
  /** Texto corto en el centro. Se omite si el símbolo es muy pequeño. */
  etiqueta?: string;
  className?: string;
}) {
  const qr = useMemo(() => encode(valor, { ecc: "H", border: 4 }), [valor]);
  const n = qr.size;

  // El hueco central solo se abre si cabe sin comerse los ojos localizadores.
  const hueco = etiqueta && size >= 180 ? huecoSeguro(qr, Math.round(n * HUECO)) : 0;
  const desde = Math.floor((n - hueco) / 2);
  const hasta = desde + hueco;
  const enElHueco = (f: number, c: number) =>
    hueco > 0 && f >= desde && f < hasta && c >= desde && c < hasta;

  const datos: string[] = [];
  const ojos: string[] = [];

  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!qr.data[f]?.[c]) continue;
      if (enElHueco(f, c)) continue;
      const tipo = qr.types[f]?.[c];
      // Los ojos se dibujan aparte para poder darles el color institucional sin
      // tocar el contraste de los módulos que sí llevan información.
      (tipo === QrCodeDataType.Position ? ojos : datos).push(`M${c} ${f}h1v1h-1z`);
    }
  }

  return (
    <div
      className={cn(
        "inline-block rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/10",
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${n} ${n}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Código QR del folio ${valor}`}
        className="h-auto max-w-full"
      >
        <rect width={n} height={n} fill="#FFFFFF" />
        <path d={datos.join("")} fill="#0B1220" />
        <path d={ojos.join("")} fill="#0047BB" />
        {hueco > 0 ? (
          <>
            <rect
              x={desde}
              y={desde}
              width={hueco}
              height={hueco}
              rx={1}
              fill="#FFFFFF"
              stroke="#0047BB"
              strokeWidth={0.35}
            />
            <text
              x={n / 2}
              y={n / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#0047BB"
              fontSize={hueco * 0.42}
              fontWeight="800"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
            >
              {etiqueta}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
