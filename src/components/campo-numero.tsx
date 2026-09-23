import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Un campo numérico que se puede VACIAR para escribir otro número.
 *
 * -----------------------------------------------------------------------------
 * Qué pasaba sin esto
 * -----------------------------------------------------------------------------
 * Los cuatro campos numéricos del panel —cupo del taller, costo, cupo del día y
 * cuota del evento— estaban escritos así:
 *
 *     value={b.cupoTotal}
 *     onChange={(e) => set({ cupoTotal: Number(e.target.value) })}
 *
 * Y `Number("")` es CERO. Así que al borrar el «30» para escribir otra cosa, el
 * campo no quedaba vacío: quedaba en «0». Ese cero tampoco se podía borrar —al
 * intentarlo volvía a aparecer— así que al teclear el número nuevo salía «03»,
 * «05», «07». Para poner 25 había que borrar el cero con la tecla de retroceso
 * en el momento justo, o seleccionarlo todo antes de escribir.
 *
 * -----------------------------------------------------------------------------
 * Cómo se arregla
 * -----------------------------------------------------------------------------
 * El campo guarda TEXTO mientras se escribe y solo avisa hacia arriba cuando lo
 * escrito es un número. Vaciarlo deja el campo vacío —que es lo que la persona
 * pidió— y el valor de fuera se queda en el último válido, así que guardar sin
 * haber escrito nada conserva lo que había en vez de poner un cero.
 *
 * Eso importa más de lo que parece: un cupo en cero significa un taller al que
 * ya no cabe nadie, y `cupo_total > 0` lo rechazaría la base. Poner un cero
 * accidentalmente es justo lo que no debe ser fácil.
 *
 * El `useEffect` refleja los cambios que vienen de FUERA —abrir el formulario
 * con otro taller, un descarte— sin pisar lo que se está tecleando: solo
 * reescribe el texto cuando ya no representa el mismo número.
 */
export function CampoNumero({
  id,
  valor,
  alCambiar,
  min,
  max,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  valor: number;
  alCambiar: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  "aria-invalid"?: boolean;
}) {
  const [texto, setTexto] = useState(() => String(valor));

  useEffect(() => {
    setTexto((actual) =>
      Number(actual) === valor && actual.trim() !== "" ? actual : String(valor),
    );
  }, [valor]);

  return (
    <Input
      {...(id ? { id } : {})}
      type="number"
      inputMode="numeric"
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      value={texto}
      onChange={(e) => {
        const crudo = e.target.value;
        setTexto(crudo);
        // Vacío no es cero: es «todavía no ha escrito nada». Se deja el valor
        // anterior hasta que haya un número de verdad.
        if (crudo.trim() === "") return;
        const n = Number(crudo);
        if (Number.isFinite(n)) alCambiar(n);
      }}
      {...(className ? { className } : {})}
      {...(ariaInvalid !== undefined ? { "aria-invalid": ariaInvalid } : {})}
    />
  );
}
