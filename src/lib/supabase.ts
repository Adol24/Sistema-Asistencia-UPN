import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const clave = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

export const hayBaseDeDatos = Boolean(url && clave);

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

/**
 * Convierte el error de Supabase en algo que se pueda enseñar en pantalla.
 *
 * Los códigos que importan son los que produce el propio esquema: la referencia
 * bancaria duplicada es una violación de unicidad, y el mensaje crudo de
 * PostgreSQL («duplicate key value violates unique constraint "uq_referencia"»)
 * no le dice nada a quien está en ventanilla.
 */
export function mensajeDeError(e: unknown): string {
  const err = e as { code?: string; message?: string; details?: string } | null;
  if (!err) return "Algo salió mal.";

  switch (err.code) {
    case "23505":
      return err.details?.includes("referencia")
        ? "Esa referencia bancaria ya está registrada con otro folio."
        : "Ese registro ya existe.";
    case "23503":
      return "Ese dato apunta a algo que no existe. Revisa el día, el taller o el programa.";
    case "23514":
      return err.message ?? "Ese valor no cumple una regla del sistema.";
    case "42501":
      return "Tu cuenta no tiene permiso para esta acción.";
    case "PGRST301":
    case "P0001":
      return err.message ?? "La base rechazó la operación.";
    default:
      return err.message ?? "Algo salió mal.";
  }
}
