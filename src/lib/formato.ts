export const moneda = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);

export const fechaHora = (d: Date = new Date()) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const hora = (d: Date = new Date()) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Simula latencia de red del prototipo (600–900 ms). */
export const simularLatencia = () =>
  new Promise<void>((r) => setTimeout(r, 600 + Math.floor(Math.random() * 300)));

/** Formatea minutos desde medianoche como HH:mm. Lo usa el reloj simulado del evento. */
export const comoHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

/**
 * Convierte el AAAA-MM-DD de un `<input type="date">` al DD/MM/AAAA que usa toda
 * la aplicación.
 *
 * El campo nativo se conserva a propósito: abre el calendario del dispositivo,
 * evita errores de captura y es lo que la gente espera al escribir una fecha. Lo
 * que no puede pasar es que ese valor viaje tal cual a los datos, porque la
 * carga masiva sí produce DD/MM/AAAA y los reportes acabarían mezclando dos
 * formatos en la misma columna.
 */
export const isoAFecha = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
