/**
 * Traducir el error de la base a algo que se pueda enseñar en pantalla.
 *
 * **Vive aparte de `supabase.ts` a propósito, y el motivo es de peso.**
 * `supabase.ts` importa el SDK —210 KB, 54 comprimidos—, así que cualquier
 * archivo que le pida `mensajeDeError` con un `import` normal se lleva el SDK
 * entero en su trozo del bundle, aunque no vaya a hablar con la base.
 *
 * Eso le pasaba a `/talleres`, que es una pantalla PÚBLICA por la que pasan
 * todos los alumnos: importaba esta función de tres líneas y arrastraba el SDK
 * con ella. Las demás pantallas ya lo esquivaban con `await import(...)` dentro
 * del `catch`, que funciona pero obliga a acordarse.
 *
 * Aquí no hace falta acordarse de nada: este módulo no importa nada, así que
 * traerlo no trae nada más.
 *
 * `supabase.ts` la vuelve a exportar para no romper a quien ya la pedía allí.
 */
export function mensajeDeError(e: unknown): string {
  const err = e as { code?: string; message?: string; details?: string } | null;
  if (!err) return "Algo salió mal.";

  /*
   * Los códigos que importan son los que produce el propio esquema: la
   * referencia bancaria duplicada es una violación de unicidad, y el mensaje
   * crudo de PostgreSQL —«duplicate key value violates unique constraint
   * "uq_referencia"»— no le dice nada a quien está en ventanilla.
   */
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
