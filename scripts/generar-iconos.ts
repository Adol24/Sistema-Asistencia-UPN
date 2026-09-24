import { deflateSync, inflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dibuja las imágenes de marca: los iconos de la aplicación instalable, el
 * favicon y la tarjeta que se ve al pegar el enlace en un chat.
 *
 *     bun run generar-iconos
 *
 * Todas salen del mismo archivo, `public/logo-encuentro.png`, para que no haya
 * dos verdades. Se generan en vez de guardarse a mano porque un PNG en git no
 * se puede revisar —nadie ve en un diff que alguien cambió el color— y porque
 * cambiar el motivo debe ser editar una línea y volver a correr esto, no
 * rehacer seis imágenes en seis tamaños.
 *
 * Qué había antes
 * ---------------
 * El motivo era un ojo localizador de código QR dibujado con aritmética, en
 * azul institucional. Se escribió cuando el logotipo no existía, y este mismo
 * archivo dejó anotado que al llegar el logotipo se cambiaría aquí.
 *
 * Llegó, y el precio de no cambiarlo se vio fuera: al pegar el enlace del sitio
 * en un chat, la tarjeta salía con un cuadro azul con un cuadrito dentro. El
 * logotipo estaba en la web y en el menú, y era lo único que no aparecía
 * justo donde el enlace se comparte.
 *
 * Los dos tratamientos, y por qué son dos
 * ---------------------------------------
 * El logotipo es trazo oscuro sobre transparente. En la web se pinta tal cual
 * y en modo oscuro se invierte (`dark:invert` en `layouts.tsx`). Aquí:
 *
 * - **Los iconos** van en azul institucional con el trazo en BLANCO. Un icono
 *   de aplicación se ve sobre el fondo de pantalla de cada quien, y uno blanco
 *   desaparece contra el papel tapiz claro. El azul es además lo que la gente
 *   ya tiene en su pantalla de inicio desde la primera versión.
 * - **La tarjeta del enlace** va en blanco con el trazo oscuro, que es
 *   exactamente lo que se ve al abrir el sitio. Quien reconoce la miniatura
 *   tiene que reconocer la página al entrar.
 */

const AZUL: Pixel = [0x00, 0x47, 0xbb];
const BLANCO: Pixel = [0xff, 0xff, 0xff];

type Pixel = [number, number, number];

interface Imagen {
  ancho: number;
  alto: number;
  /** RGBA sin premultiplicar, ocho bits por canal. */
  datos: Uint8Array;
}

// --------------------------------------------------------------- escribir ---

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
 * Un `.ico` con varios tamaños dentro.
 *
 * El formato admite PNG incrustado desde Windows Vista, así que cada tamaño es
 * uno de los PNG de arriba tal cual y no hay que escribir un BMP con su máscara
 * al revés. Se escribe el archivo —en vez de apuntar el `<link rel="icon">` a
 * un PNG— porque el navegador pide `/favicon.ico` por su cuenta aunque nadie se
 * lo diga, y hasta hoy eso era un 404 en cada carga.
 */
function ico(imagenes: { lado: number; png: Buffer }[]): Buffer {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  let desplazamiento = 6 + imagenes.length * 16;
  const entradas: Buffer[] = [];
  for (const img of imagenes) {
    const e = Buffer.alloc(16);
    // 0 significa 256: el lado va en un solo byte.
    e[0] = img.lado >= 256 ? 0 : img.lado;
    e[1] = img.lado >= 256 ? 0 : img.lado;
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32BE(0, 8);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += img.png.length;
    entradas.push(e);
  }

  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.png)]);
}

// ------------------------------------------------------------------ leer ---

/**
 * Lee un PNG de ocho bits sin entrelazar y lo devuelve en RGBA.
 *
 * Es lo justo para el logotipo —que es escala de grises con alfa— y para
 * cualquier otro que se ponga en su sitio mañana. Lo que no entiende lo dice
 * con el número delante en vez de devolver píxeles equivocados: una imagen
 * silenciosamente mal decodificada se convertiría en seis iconos mal dibujados.
 */
function leerPng(ruta: string): Imagen {
  const buf = readFileSync(ruta);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${ruta} no es un PNG`);

  let ancho = 0;
  let alto = 0;
  let profundidad = 0;
  let tipoColor = 0;
  const idat: Buffer[] = [];

  for (let i = 8; i + 8 <= buf.length;) {
    const largo = buf.readUInt32BE(i);
    const tipo = buf.toString("ascii", i + 4, i + 8);
    const datos = buf.subarray(i + 8, i + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      profundidad = datos[8]!;
      tipoColor = datos[9]!;
      if (datos[12] !== 0) throw new Error(`${ruta} está entrelazado y esto no lo deshace`);
    } else if (tipo === "IDAT") idat.push(Buffer.from(datos));
    else if (tipo === "IEND") break;
    i += 12 + largo;
  }

  const canales = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipoColor as 0 | 2 | 4 | 6];
  if (profundidad !== 8 || !canales)
    throw new Error(
      `${ruta}: profundidad ${profundidad} y tipo de color ${tipoColor}. ` +
        `Esto solo lee ocho bits por canal, sin paleta.`,
    );

  const crudo = inflateSync(Buffer.concat(idat));
  const anchoLinea = ancho * canales;
  const plano = new Uint8Array(alto * anchoLinea);

  /*
   * Deshacer el filtro por líneas.
   *
   * Cada línea del PNG viene con un byte que dice contra qué se restó: el
   * píxel de la izquierda, el de arriba, la media de los dos o el predictor de
   * Paeth. Sin esto la imagen sale como un degradado de ruido, que es el
   * síntoma por el que se reconoce que este bucle falta.
   */
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (anchoLinea + 1)]!;
    const inicio = y * (anchoLinea + 1) + 1;
    for (let x = 0; x < anchoLinea; x++) {
      const izq = x >= canales ? plano[y * anchoLinea + x - canales]! : 0;
      const arr = y > 0 ? plano[(y - 1) * anchoLinea + x]! : 0;
      const diag = x >= canales && y > 0 ? plano[(y - 1) * anchoLinea + x - canales]! : 0;
      const v = crudo[inicio + x]!;
      let r: number;
      switch (filtro) {
        case 0:
          r = v;
          break;
        case 1:
          r = v + izq;
          break;
        case 2:
          r = v + arr;
          break;
        case 3:
          r = v + ((izq + arr) >> 1);
          break;
        case 4:
          r = v + paeth(izq, arr, diag);
          break;
        default:
          throw new Error(`${ruta}: filtro ${filtro} desconocido en la línea ${y}`);
      }
      plano[y * anchoLinea + x] = r & 0xff;
    }
  }

  const datos = new Uint8Array(ancho * alto * 4);
  for (let p = 0; p < ancho * alto; p++) {
    const o = p * canales;
    const d = p * 4;
    if (canales === 1) {
      datos[d] = datos[d + 1] = datos[d + 2] = plano[o]!;
      datos[d + 3] = 255;
    } else if (canales === 2) {
      datos[d] = datos[d + 1] = datos[d + 2] = plano[o]!;
      datos[d + 3] = plano[o + 1]!;
    } else {
      datos[d] = plano[o]!;
      datos[d + 1] = plano[o + 1]!;
      datos[d + 2] = plano[o + 2]!;
      datos[d + 3] = canales === 4 ? plano[o + 3]! : 255;
    }
  }

  return { ancho, alto, datos };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// ---------------------------------------------------------------- dibujar ---

/**
 * El logotipo reducido a una rejilla, promediando por áreas.
 *
 * Se promedia el rectángulo entero de origen que le toca a cada píxel de
 * destino, y no se toma el más cercano: el logotipo es trazo fino, y a 32
 * píxeles quedarse con un píxel de cada dieciséis borra líneas enteras y deja
 * un mordisco de ruido. El color se promedia PREMULTIPLICADO por el alfa —si
 * no, los píxeles transparentes del borde arrastran su color hacia la media y
 * el trazo sale con halo.
 */
function escalar(origen: Imagen, ancho: number, alto: number): Imagen {
  const datos = new Uint8Array(ancho * alto * 4);
  const escalaX = origen.ancho / ancho;
  const escalaY = origen.alto / alto;

  for (let y = 0; y < alto; y++) {
    const y0 = Math.floor(y * escalaY);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * escalaY));
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.floor(x * escalaX);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * escalaX));

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      let n = 0;
      for (let sy = y0; sy < Math.min(y1, origen.alto); sy++)
        for (let sx = x0; sx < Math.min(x1, origen.ancho); sx++) {
          const o = (sy * origen.ancho + sx) * 4;
          const a = origen.datos[o + 3]! / 255;
          sr += origen.datos[o]! * a;
          sg += origen.datos[o + 1]! * a;
          sb += origen.datos[o + 2]! * a;
          sa += a;
          n++;
        }

      const d = (y * ancho + x) * 4;
      if (sa > 0) {
        datos[d] = Math.round(sr / sa);
        datos[d + 1] = Math.round(sg / sa);
        datos[d + 2] = Math.round(sb / sa);
      }
      datos[d + 3] = Math.round((sa / Math.max(1, n)) * 255);
    }
  }

  return { ancho, alto, datos };
}

/**
 * El logotipo puesto sobre un lienzo de color.
 *
 * @param tinta `null` conserva el color del logotipo —trazo oscuro, que es como
 *   se ve en la web—; un color lo usa como tinta y se queda solo con la forma,
 *   que es lo que hace falta para dibujarlo en blanco sobre azul.
 */
function lienzo(
  ancho: number,
  alto: number,
  fondo: Pixel,
  logo: Imagen,
  caja: { x: number; y: number; ancho: number; alto: number },
  tinta: Pixel | null,
  pie?: { color: Pixel; alto: number },
): Buffer {
  const puesto = escalar(logo, caja.ancho, caja.alto);
  return png(ancho, alto, (x, y) => {
    if (pie && y >= alto - pie.alto) return pie.color;

    const lx = x - caja.x;
    const ly = y - caja.y;
    if (lx < 0 || ly < 0 || lx >= caja.ancho || ly >= caja.alto) return fondo;

    const o = (ly * caja.ancho + lx) * 4;
    const a = puesto.datos[o + 3]! / 255;
    if (a === 0) return fondo;

    const trazo: Pixel = tinta ?? [puesto.datos[o]!, puesto.datos[o + 1]!, puesto.datos[o + 2]!];
    return [
      Math.round(fondo[0] * (1 - a) + trazo[0] * a),
      Math.round(fondo[1] * (1 - a) + trazo[1] * a),
      Math.round(fondo[2] * (1 - a) + trazo[2] * a),
    ];
  });
}

/** El logotipo centrado en un cuadrado, dejando libre `margen` por cada lado. */
function icono(logo: Imagen, lado: number, margen: number): Buffer {
  const disponible = Math.round(lado * (1 - margen * 2));
  const escala = Math.min(disponible / logo.ancho, disponible / logo.alto);
  const ancho = Math.round(logo.ancho * escala);
  const alto = Math.round(logo.alto * escala);
  return lienzo(
    lado,
    lado,
    AZUL,
    logo,
    { x: Math.round((lado - ancho) / 2), y: Math.round((lado - alto) / 2), ancho, alto },
    BLANCO,
  );
}

const proyecto = join(dirname(fileURLToPath(import.meta.url)), "..");
const raiz = join(proyecto, "public");

/*
 * Se dibuja desde el ORIGINAL, no desde el que sirve la web.
 *
 * `public/logo-encuentro.png` es un derivado con pérdida de 512 px pensado para
 * que la página pese poco. Partir de él para una tarjeta de 1200 sería ampliar
 * una reducción, y el trazo fino es lo que peor lo lleva. El original
 * —1458x1291, en `docs/marca/`— existe justo para esto; ver `docs/marca/LEEME.md`.
 *
 * Si no estuviera se sigue con el derivado, porque un icono algo más blando es
 * mejor que quedarse sin iconos.
 */
const original = join(proyecto, "docs", "marca", "logo-encuentro-original.png");
const logo = existsSync(original) ? leerPng(original) : leerPng(join(raiz, "logo-encuentro.png"));
console.log(`Logotipo: ${logo.ancho}x${logo.alto}\n`);

mkdirSync(join(raiz, "icons"), { recursive: true });

const iconos: [string, number, number][] = [
  // [archivo, lado, margen]
  ["icono-192.png", 192, 0.12],
  ["icono-512.png", 512, 0.12],
  // Android recorta este en círculo: el motivo va más pequeño para sobrevivir.
  ["icono-maskable-512.png", 512, 0.24],
  // iOS no acepta SVG y siempre recorta en cuadrado redondeado.
  ["apple-touch-icon.png", 180, 0.12],
];

for (const [archivo, lado, margen] of iconos) {
  writeFileSync(join(raiz, "icons", archivo), icono(logo, lado, margen));
  console.log(`  icons/${archivo}  ${lado}x${lado}`);
}

/*
 * El favicon, en dos tamaños dentro del mismo archivo.
 *
 * 32 es el de la pestaña y 48 el que usa Windows al anclar el sitio. Van los
 * dos porque dejar que el navegador reduzca el de 48 a 32 da un resultado peor
 * que reducirlo aquí promediando áreas.
 */
writeFileSync(
  join(raiz, "favicon.ico"),
  ico([32, 48].map((lado) => ({ lado, png: icono(logo, lado, 0.06) }))),
);
console.log("  favicon.ico  32x32 y 48x48");

/*
 * La tarjeta del enlace.
 *
 * 1200x630 es la medida que esperan WhatsApp, Telegram, Slack y las demás: la
 * recortan a 1.91:1 y a menos resolución la vuelven borrosa. Sin texto, porque
 * aquí no hay con qué componer tipografía y el título y la descripción los pone
 * el propio chat desde las etiquetas de la página. Lo que la tarjeta aporta es
 * reconocerse de un vistazo.
 *
 * El logotipo va algo por encima del centro: la franja azul del pie pesa, y
 * centrado contra el lienzo entero el conjunto se ve caído. Se centra contra lo
 * que queda por encima de la franja, y aun así diez píxeles más arriba.
 */
const CARTA = { ancho: 1200, alto: 630 };
const FRANJA = 20;
const altoLogo = 470;
const anchoLogo = Math.round((logo.ancho / logo.alto) * altoLogo);

writeFileSync(
  join(raiz, "og-encuentro.png"),
  lienzo(
    CARTA.ancho,
    CARTA.alto,
    BLANCO,
    logo,
    {
      x: Math.round((CARTA.ancho - anchoLogo) / 2),
      y: Math.round((CARTA.alto - FRANJA - altoLogo) / 2) - 10,
      ancho: anchoLogo,
      alto: altoLogo,
    },
    null,
    { color: AZUL, alto: FRANJA },
  ),
);
console.log(`  og-encuentro.png  ${CARTA.ancho}x${CARTA.alto}`);
