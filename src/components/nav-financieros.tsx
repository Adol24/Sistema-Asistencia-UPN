import { NavPanel } from "@/components/layouts";
import type { RutaConstruida } from "@/lib/mapa-pantallas";

export const navFinancieros = (
  <NavPanel
    items={
      [
        { to: "/financieros", label: "Lista" },
        { to: "/financieros/ficha", label: "Ficha y pago" },
        { to: "/financieros/carga-masiva", label: "Carga masiva" },
        { to: "/financieros/conciliacion", label: "Conciliación" },
      ] satisfies { to: RutaConstruida; label: string }[]
    }
  />
);

// `navAdmin` y `navCaptura` se retiraron: declaraban 14 destinos de módulos que
// todavía no existen, duplicando la lista que ya vive en `src/lib/mapa-pantallas.ts`
// y arriesgando que ambas se desincronizaran. Cuando se construyan esos módulos,
// su barra se arma igual que esta, y `NavPanel` ya atenúa sola lo que siga pendiente.
