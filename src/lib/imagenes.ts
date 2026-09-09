/**
 * Imágenes de relleno para las vistas previas de comprobante.
 *
 * No son datos de nadie: son marcadores que ocupan el lugar de la foto que el
 * participante sube y que, en producción, vive en el almacenamiento de Supabase.
 * Se separan de los datos simulados justamente para dejar clara la diferencia:
 * un voucher inventado se puede confundir con uno real, un rectángulo gris que
 * dice VOUCHER no.
 *
 * Cuando se conecte la subida de evidencias, esto se sustituye por la URL
 * firmada del archivo y este módulo desaparece.
 */
const marcador = (texto: string, fondo: string) =>
  `https://placehold.co/800x1000/${fondo}/f1f5f9?text=${encodeURIComponent(texto)}`;

export const IMAGEN_VOUCHER = marcador("VOUCHER", "334155");
export const IMAGEN_VOUCHER_OK = marcador("VOUCHER LEGIBLE", "334155");
export const IMAGEN_VOUCHER_MAL = marcador("VOUCHER BORROSO", "7f1d1d");
