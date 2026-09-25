import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clave, hayBaseDeDatos, url } from "@/lib/supabase-config";

export { hayBaseDeDatos };

/**
 * El cliente de Supabase.
 *
 * Puede no existir, y eso es deliberado: si faltan las variables de entorno, la
 * aplicación sigue funcionando con los datos simulados. Un prototipo que se cae
 * en blanco porque falta una llave no le sirve a nadie para revisar pantallas, y
 * hay dos públicos distintos —quien evalúa el diseño y quien opera el evento—
 * que no tienen por qué necesitar lo mismo.
 *
 * Se lee de `import.meta.env`, así que **estas dos variables viajan al
 * navegador**. Es correcto para ellas: la URL es pública y la clave anónima no
 * da permisos por sí sola, porque queda sujeta a las políticas de seguridad a
 * nivel de fila. La clave de servicio nunca debe aparecer aquí.
 */
export const supabase: SupabaseClient | null = hayBaseDeDatos
  ? createClient(url!, clave!, {
      auth: {
        // El personal interno sí mantiene sesión entre recargas; el participante
        // no tiene sesión ninguna, entra por funciones con folio y matrícula.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * El cliente, o un error claro. Se usa donde la operación no tiene sentido sin
 * base: registrar un pago sin dónde guardarlo no es un caso que valga la pena
 * degradar en silencio.
 */
export function exigirBase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "No hay conexión con la base de datos. Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env.",
    );
  }
  return supabase;
}

/*
 * `mensajeDeError` se mudó a `@/lib/errores` y aquí solo se reexporta.
 *
 * Importarla desde este archivo arrastra el SDK de Supabase al trozo de quien
 * la pida, porque este módulo lo importa arriba. A `/talleres` —pantalla
 * pública— le costaba 210 KB por una función de tres líneas.
 *
 * La reexportación se queda para no romper a los seis sitios que ya la piden
 * aquí con `await import("@/lib/supabase")`: ese camino es dinámico y no
 * arrastra nada de más.
 */
export { mensajeDeError } from "./errores";
