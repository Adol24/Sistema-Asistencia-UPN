import { useRef } from "react";

/**
 * Antirrebote para un campo que puede llenar un lector físico.
 *
 * Un lector USB o Bluetooth tipo pistola no habla con la app: le "teclea" el
 * código y un Intro al campo enfocado. Si queda apuntando al mismo código
 * —o alguien lo dispara dos veces por error—, manda varias lecturas
 * idénticas seguidas; sin esto, cada una dispara una acción.
 *
 * Devuelve una función que dice si ESTA lectura hay que ignorarla por ser
 * la misma que la anterior dentro de la ventana, y de paso actualiza cuál
 * fue la última.
 */
export function useAntirreboteManual(ventanaMs = 5000) {
  const ultimo = useRef<{ valor: string; en: number }>({ valor: "", en: 0 });

  return (valor: string): boolean => {
    const ahora = Date.now();
    if (valor === ultimo.current.valor && ahora - ultimo.current.en < ventanaMs) return true;
    ultimo.current = { valor, en: ahora };
    return false;
  };
}
