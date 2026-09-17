/**
 * Guardar cosas que deben sobrevivir a una recarga, pero no al cierre.
 *
 * **`sessionStorage` y no `localStorage`, y la diferencia es el punto entero.**
 * `sessionStorage` vive mientras la pestaña siga abierta: sobrevive a una
 * recarga, a un giro de pantalla que reinicie la aplicación y a navegar entre
 * pantallas, y desaparece al cerrarla. `localStorage` sobreviviría también al
 * cierre, y eso es justo lo que no queremos: un folio guardado en un teléfono
 * prestado es una puerta abierta que nadie recuerda haber dejado.
 *
 * Todo va protegido porque en navegación privada, o con las cookies bloqueadas,
 * el acceso lanza. Si no se puede guardar, el flujo funciona como funcionaba
 * antes: la recarga pierde lo que hubiera, que es molesto pero no roto.
 *
 * Estaba escrito a mano en `portal.tsx`, y el pre-registro necesitaba lo mismo.
 * Una segunda copia del mismo `try`/`catch` es donde se cuela la diferencia que
 * nadie nota: la que olvida el `catch`, o la que usa `localStorage`.
 */
const almacen = () => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export function leerJSON<T>(clave: string): T | null {
  try {
    const crudo = almacen()?.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

/** Con `null` o `undefined` borra la clave, en vez de guardar la palabra. */
export function guardarJSON(clave: string, valor: unknown) {
  try {
    if (valor === null || valor === undefined) almacen()?.removeItem(clave);
    else almacen()?.setItem(clave, JSON.stringify(valor));
  } catch {
    /* Sin almacenamiento, lo que haya vive solo en memoria. */
  }
}
