/**
 * Si hay base de datos configurada, y nada más.
 *
 * Vive separado de `supabase.ts` por una razón de peso, literalmente: ese módulo
 * llama a `createClient` al cargarse, así que **importar de él arrastra el SDK
 * entero de Supabase** —unos 700 KB de fuente— al paquete de quien lo importe.
 * `estado-evento` solo necesitaba este booleano y con él se llevaba el SDK a
 * todas las pantallas, incluidas las que un alumno abre desde el teléfono con
 * datos móviles y que nunca tocan la base.
 *
 * Estas dos variables viajan al navegador, y para ellas es correcto: la URL es
 * pública y la clave anónima no da permisos por sí sola, porque queda sujeta a
 * las políticas de seguridad a nivel de fila. La clave de servicio nunca debe
 * aparecer aquí.
 */
export const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
export const clave = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const hayBaseDeDatos = Boolean(url && clave);
