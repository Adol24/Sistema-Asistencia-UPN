/**
 * Comprime una foto en el navegador antes de subirla.
 *
 * El bucket `evidencias` vive en el plan gratis de Supabase (1 GB), y una foto
 * de cámara sin tocar pesa de 3 a 8 MB. Con ~1,500 alumnos confirmados y dos
 * evidencias cada uno, eso se iba a los 10-15 GB en el peor caso — muy por
 * encima del límite—. Un recibo de depósito es texto y números a tamaño de
 * tarjeta: no necesita la resolución de una cámara de celular para leerse, así
 * que se reescala y se reencoda como JPEG antes de mandarla.
 *
 * Reencodar a JPEG tiene un efecto colateral útil: un iPhone entrega HEIC por
 * omisión, y el bucket lo rechaza —`allowed_mime_types` solo admite jpeg, png
 * y webp, ver `20260922220000_la_evidencia_se_sube_de_verdad.sql`—. Al pasar
 * por el canvas, cualquier formato que el navegador sepa decodificar sale
 * como JPEG, así que esto de paso arregla la subida desde un iPhone sin que
 * nadie tenga que cambiarle nada a su cámara.
 */

const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.82;

/**
 * Comprime `archivo` a JPEG, con el lado más largo acotado a `LADO_MAXIMO`.
 *
 * Si el navegador no puede decodificarlo —un formato exótico, uno sin soporte
 * de `createImageBitmap`, o cualquier otro tropiezo— devuelve el archivo
 * ORIGINAL tal cual: una foto grande que sí sube es mejor que un error que no
 * deja subir nada, y `subirEvidenciaRemota` sigue teniendo su propio tope de
 * tamaño como última defensa.
 */
export async function comprimirImagen(archivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;

    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG),
    );
    if (!blob) return archivo;

    // Si la versión comprimida sale más pesada que la original —pasa con
    // capturas de pantalla o fotos que ya venían muy comprimidas—, se manda
    // la original: comprimir no debe poder empeorar las cosas.
    if (blob.size >= archivo.size) return archivo;

    const nombre = `${archivo.name.replace(/\.\w+$/, "")}.jpg`;
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

/** El peso de un archivo en una forma legible: «320 KB», «1.4 MB». */
export function pesoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
