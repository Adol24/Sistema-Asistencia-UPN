/**
 * Pone el trabajador de servicio en marcha.
 *
 * Es lo que permite que la aplicación ABRA SIN RED, y ese es el motivo por el
 * que sigue aquí. Importa en la puerta: si a un capturista se le cae la
 * conexión y recarga la pantalla, sin esto no le carga nada. La cola de
 * escaneos pendientes no depende de él —vive en `localStorage`, ver
 * `cola-pendientes.ts`—, pero la aplicación cargando sí.
 *
 * Vivía en `components/instalar.tsx`, junto al cartel que invitaba a instalar
 * la aplicación. Ese cartel se quitó, y lo que quedaba era un archivo en
 * `components/` que no exporta ningún componente y que se llama «instalar»
 * cuando lo único que hace es registrar el trabajador. Se mudó con el nombre
 * de lo que hace.
 */

import { useEffect } from "react";

export function useTrabajadorDeServicio(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return; // en desarrollo estorba: sirve archivos viejos
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin trabajador la aplicación funciona igual, solo que sin modo sin red.
    });
  }, []);
}
