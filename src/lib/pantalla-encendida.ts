import { useEffect } from "react";

/**
 * Impide que la pantalla se atenúe o se apague mientras está activo.
 *
 * Es la mejora que más pesa en que un QR escanee. Medido contra lo demás, el
 * brillo es el primer factor y por mucho: un teléfono en ahorro de batería, o
 * con el brillo automático bajo, falla donde el mismo teléfono al máximo lee al
 * instante. Y en una fila pasa siempre lo mismo: el alumno abre su pase, avanza
 * dos metros, y para cuando llega la pantalla ya se atenuó.
 *
 * El bloqueo se pierde al cambiar de aplicación o bloquear el teléfono, así que
 * se vuelve a pedir cuando la pestaña se hace visible. Sin eso, funciona la
 * primera vez y no la segunda, que es peor que no funcionar nunca: nadie
 * desconfía de lo que nunca ha andado.
 *
 * Si el navegador no lo admite —Safari lo incorporó tarde— no pasa nada: no hay
 * nada que avisar porque no hay nada que la persona pueda hacer al respecto.
 */
export function usePantallaEncendida(activo: boolean): void {
  useEffect(() => {
    if (!activo || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let bloqueo: WakeLockSentinel | null = null;
    let vigente = true;

    const pedir = async () => {
      try {
        bloqueo = await navigator.wakeLock.request("screen");
        if (!vigente) {
          void bloqueo.release();
          bloqueo = null;
        }
      } catch {
        // Lo rechaza el navegador si la pestaña no está visible o si el sistema
        // está en ahorro de energía. Es un intento de mejora, no un requisito.
      }
    };

    const alVolver = () => {
      if (document.visibilityState === "visible" && !bloqueo?.released) void pedir();
    };

    void pedir();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", alVolver);
      void bloqueo?.release();
    };
  }, [activo]);
}
