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

/**
 * El pase del participante como imagen.
 *
 * Se dibuja en un lienzo módulo a módulo en vez de rasterizar el SVG de la
 * pantalla. Convertir el SVG obligaría a incrustar la tipografía —al pasar por
 * una imagen, el navegador ya no tiene acceso a las fuentes de la página y el
 * texto saldría en cualquier otra—, y además permite componer algo distinto de
 * lo que se ve: aquí interesa el folio y el nombre debajo del código, para que
 * la imagen se explique sola en la galería del teléfono meses después.
 *
 * Sale en blanco y negro puro, sin los ojos azules de la pantalla: esta imagen
 * se lee bajo el sol en la puerta, y ahí manda el contraste.
 */
// El componente y el generador de la imagen comparten la codificación y las
// decisiones sobre contraste; separarlos obligaría a mantener dos veces el mismo
// criterio de qué hace legible un símbolo.
// eslint-disable-next-line react-refresh/only-export-components
export async function pngDelPase(
  valor: string,
  datos: { nombre: string; evento: string },
): Promise<Blob | null> {
  const qr = encode(valor, { ecc: "H", border: 4 });
  const n = qr.size;

  const modulo = 16;
  const lado = n * modulo;
  const margen = 48;
  const alturaTexto = 150;

  const lienzo = document.createElement("canvas");
  lienzo.width = lado + margen * 2;
  lienzo.height = lado + margen + alturaTexto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);

  ctx.fillStyle = "#000000";
  for (let f = 0; f < n; f++)
    for (let c = 0; c < n; c++)
      if (qr.data[f]?.[c]) ctx.fillRect(margen + c * modulo, margen + f * modulo, modulo, modulo);

  const centro = lienzo.width / 2;
  let y = margen + lado + 46;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0B1220";
  ctx.font = "bold 44px ui-monospace, 'Courier New', monospace";
  ctx.fillText(valor, centro, y);

  y += 42;
  ctx.fillStyle = "#334155";
  ctx.font = "28px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(recortar(ctx, datos.nombre, lienzo.width - margen), centro, y);

  y += 34;
  ctx.fillStyle = "#0047BB";
  ctx.font = "bold 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(recortar(ctx, datos.evento, lienzo.width - margen), centro, y);

  return new Promise((listo) => lienzo.toBlob((b) => listo(b), "image/png"));
}

/** Un nombre largo no debe salirse de la imagen ni encogerse hasta no leerse. */
function recortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let corto = texto;
  while (corto.length > 4 && ctx.measureText(`${corto}…`).width > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}
