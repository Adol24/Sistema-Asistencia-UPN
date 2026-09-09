import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Genera los iconos de la aplicación instalable.
 *
 * Se dibujan aquí en vez de guardarlos como binarios en el repositorio por dos
 * razones. Un PNG en git no se puede revisar: nadie ve en un diff que alguien
 * cambió el color. Y cuando llegue el logotipo de la UPN, cambiar el motivo será
 * editar este archivo y volver a correrlo, en vez de rehacer cinco imágenes a
 * mano en cinco tamaños.
 *
 * El motivo es el ojo localizador de un código QR —el cuadrado con marco que
 * todo lector busca primero— en azul institucional. Dice de qué va la aplicación
 * sin una sola palabra, que es lo único que cabe en 48 píxeles de pantalla de
 * inicio.
 *
 *   bun run scripts/generar-iconos.ts
 */

const AZUL: Pixel = [0x00, 0x47, 0xbb];
const BLANCO: Pixel = [0xff, 0xff, 0xff];

type Pixel = [number, number, number];

/** Un PNG mínimo: firma, cabecera, datos y fin. Sin dependencias. */
function png(ancho: number, alto: number, pixel: (x: number, y: number) => Pixel): Buffer {
  const filas: Buffer[] = [];
  for (let y = 0; y < alto; y++) {
    // Cada línea empieza con su byte de filtro; 0 es «sin filtro».
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) {
      const [r, g, b] = pixel(x, y);
      fila[1 + x * 3] = r;
      fila[2 + x * 3] = g;
      fila[3 + x * 3] = b;
    }
    filas.push(fila);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // color verdadero, sin alfa
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(Buffer.concat(filas))),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

function trozo(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * El ojo localizador.
 *
 * @param margen Cuánto del lienzo queda libre alrededor, en proporción. Los
 *   iconos «maskable» se recortan en círculo en Android, así que necesitan el
 *   doble de aire: sin él, el sistema corta las esquinas del marco y el motivo
 *   deja de reconocerse.
 */
function ojo(lado: number, margen: number) {
  return (x: number, y: number): Pixel => {
    const m = Math.round(lado * margen);
    const util = lado - m * 2;
    const u = (x - m) / util;
    const v = (y - m) / util;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return AZUL;

    // Proporciones del ojo real: marco de un séptimo y centro de tres séptimos.
    const enMarco = u < 1 / 7 || u >= 6 / 7 || v < 1 / 7 || v >= 6 / 7;
    const enCentro = u >= 3 / 7 && u < 4 / 7 && v >= 3 / 7 && v < 4 / 7;
    return enMarco || enCentro ? BLANCO : AZUL;
  };
}

const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(salida, { recursive: true });

const iconos: [string, number, number][] = [
  // [archivo, lado, margen]
  ["icono-192.png", 192, 0.14],
  ["icono-512.png", 512, 0.14],
  // Android recorta este en círculo: el motivo va más pequeño para sobrevivir.
  ["icono-maskable-512.png", 512, 0.26],
  // iOS no acepta SVG y siempre recorta en cuadrado redondeado.
  ["apple-touch-icon.png", 180, 0.14],
];

for (const [archivo, lado, margen] of iconos) {
  writeFileSync(join(salida, archivo), png(lado, lado, ojo(lado, margen)));
  console.log(`  ${archivo}  ${lado}x${lado}`);
}
console.log("\nIconos generados en public/icons/");
