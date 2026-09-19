/**
 * El aforo de cada día, del lado del navegador.
 *
 * **Esto no decide nada.** La regla vive en `fn_preregistrar_alumno` y
 * `fn_preregistrar_externo`, que cuentan otra vez con el día bajo candado justo
 * antes de insertar. Lo de aquí es cortesía: enseñar cuántos lugares quedan y
 * no dejar elegir un día que ya se llenó, para que nadie recorra el formulario
 * entero y choque al final.
 *
 * De esa separación sale la regla de este archivo: **ante la duda, no estorbar**.
 * Si la consulta falla, si la base no está configurada o si el aforo todavía no
 * se ha cargado, los días se ofrecen todos. Bloquear por un dato que no se pudo
 * leer dejaría a la gente fuera de un evento que sí tiene sitio, y el error caro
 * —meter a 701 personas en un salón de 700— ya lo cierra la base.
 */

import { useEffect, useState } from "react";

import type { CupoDia } from "@/lib/datos";
import type { Dia } from "@/dominio/tipos";
import { hayBaseDeDatos } from "@/lib/supabase";

export type { CupoDia };

/** Lo que devuelve el hook mientras el aforo viaja, y cuando ya llegó. */
export interface Aforo {
  /** Vacío hasta que la consulta responde. Vacío también si falló. */
  porDia: Map<Dia, CupoDia>;
  /** Para no anunciar «quedan 0 lugares» mientras todavía se está contando. */
  cargando: boolean;
}

/**
 * ¿Se puede elegir este día?
 *
 * Un día del que no sabemos nada —sin aforo cargado— se puede elegir. Ver la
 * cabecera: la base es la que cierra.
 */
export function diaDisponible(aforo: Aforo, dia: Dia): boolean {
  const c = aforo.porDia.get(dia);
  return c ? !c.lleno : true;
}

/**
 * Cuántos lugares quedan, o `null` si no lo sabemos.
 *
 * `null` y no `0`: son cosas distintas y la pantalla las dice distinto. Un 0
 * anuncia que el día se llenó; un «no lo sabemos» no anuncia nada.
 */
export function lugaresLibres(aforo: Aforo, dia: Dia): number | null {
  return aforo.porDia.get(dia)?.disponibles ?? null;
}

/**
 * El aforo de los tres días, pedido una vez al montar.
 *
 * No se refresca solo. El pre-registro no es una subasta: entre que alguien
 * abre «elige tu día» y pulsa continuar pasan segundos, y en ese rato el
 * contador no va a moverse lo suficiente como para justificar una suscripción
 * en tiempo real. Si se movió, la base lo dice al confirmar.
 */
export function useAforo(): Aforo {
  const [porDia, setPorDia] = useState<Map<Dia, CupoDia>>(new Map());
  const [cargando, setCargando] = useState(hayBaseDeDatos);

  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vivo = true;

    void (async () => {
      try {
        const { cupoPorDia } = await import("@/lib/datos");
        const filas = await cupoPorDia();
        if (vivo) setPorDia(new Map(filas.map((c) => [c.dia, c])));
      } catch {
        // Se traga a propósito. Un aforo que no se pudo leer deja la pantalla
        // como estaba antes de que el aforo existiera, que es una pantalla que
        // funciona. Avisar aquí sería alarmar por algo que la base resuelve.
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  return { porDia, cargando };
}
