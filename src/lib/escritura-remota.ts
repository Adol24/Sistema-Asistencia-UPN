/**
 * El puente entre lo que se ve y lo que se guarda.
 *
 * Vivía dentro de `estado-evento.tsx`, y ahí no era del contexto: era su propia
 * pieza. El contexto lo usa dieciocho veces y nunca necesita saber cómo está
 * hecho, así que separarlo quita ochenta líneas de un archivo que ya pasaba de
 * dos mil y deja este asunto —escribir sin esperar— donde se puede leer entero
 * de una vez.
 */

import { hayBaseDeDatos } from "@/lib/supabase-config";
import type { ConfiguracionEvento } from "@/lib/configuracion";

/**
 * Acceso a la capa de datos, cargada bajo demanda.
 *
 * `@/lib/datos` arrastra el SDK de Supabase. Importarlo de forma estática metía
 * ese peso en el paquete que descarga **cualquier** visitante, incluido el
 * alumno que solo abre su QR desde el teléfono y nunca escribe en la base. Con
 * el import dinámico, el SDK se descarga la primera vez que hace falta y solo
 * si hay base configurada.
 */
export type ModuloDatos = typeof import("@/lib/datos");

/**
 * Campo de la configuración -> columna de su tabla.
 *
 * Era una escalera de ocho `if (patch.x !== undefined)` idénticos salvo por el
 * nombre. Como dato en una tabla, añadir un campo es una línea y no hay ninguna
 * rama que leer: la correspondencia se ve de un vistazo y no puede
 * desincronizarse a mitad de la escalera.
 *
 * Solo están los campos planos. Los días y el catálogo académico viven en
 * tablas aparte y se editan por su cuenta.
 */
const COLUMNA = {
  nombre: "nombre",
  subtitulo: "subtitulo",
  fechas: "fechas",
  cuotaEvento: "cuota_evento",
  horasValidacion: "horas_validacion",
  dominioInstitucional: "dominio_institucional",
  correoSoporte: "correo_soporte",
  whatsappSoporte: "whatsapp_soporte",
} as const satisfies Partial<Record<keyof ConfiguracionEvento, string>>;

/** Sin dominio configurado es cadena vacía en la app y NULL en la tabla. */
const valorDeColumna = (campo: string, valor: unknown) =>
  campo === "dominioInstitucional" ? valor || null : valor;

export function columnasDeConfiguracion(
  patch: Partial<ConfiguracionEvento>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([campo, valor]) => valor !== undefined && campo in COLUMNA)
      .map(([campo, valor]) => [
        COLUMNA[campo as keyof typeof COLUMNA],
        valorDeColumna(campo, valor),
      ]),
  );
}

/**
 * Avisa en pantalla de una escritura que la base rechazó.
 *
 * Se importa el aviso al vuelo en vez de arriba porque este módulo lo cargan
 * todas las pantallas, incluidas las del participante en el teléfono, y una
 * escritura fallida es la excepción: no vale la pena que el paquete de la
 * portada arrastre la librería de avisos por un caso que casi nunca ocurre.
 */
export function avisarFallo(mensaje: string): void {
  void import("sonner").then(({ toast }) => toast.error(mensaje));
}

/**
 * Escribe en la base sin que nadie espere el resultado.
 *
 * Reúne en un sitio el patrón que estaba copiado cuatro veces —escribir sin
 * esperar y registrar el fallo en consola—, que es la forma correcta aquí: la
 * pantalla ya se actualizó de manera optimista y la escritura no debe bloquear
 * a quien está atendiendo una fila.
 *
 * @param alFallar Se llama si la base rechazó la escritura, para poder deshacer
 *   lo que ya se había pintado.
 */
export function escribir(
  descripcion: string,
  accion: (datos: ModuloDatos) => Promise<unknown>,
  alFallar?: (e: unknown) => void,
): void {
  if (!hayBaseDeDatos) return;
  void import("@/lib/datos").then(accion).catch((e: unknown) => {
    console.error(`No se pudo guardar ${descripcion}`, e);
    alFallar?.(e);
  });
}
