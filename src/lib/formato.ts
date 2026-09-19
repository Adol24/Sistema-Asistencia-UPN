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

/**
 * La vuelta: DD/MM/AAAA a AAAA-MM-DD, para escribir en la base.
 *
 * Hace falta porque toda la aplicación maneja DD/MM/AAAA —es lo que se lee en
 * pantalla y lo que trae el archivo del banco—, pero la columna es de tipo
 * `date` y PostgreSQL la interpreta con `DateStyle`, que en Supabase viene en
 * `ISO, MDY`. Mandar «10/09/2026» tal cual se guardaba como 9 de OCTUBRE, y
 * «15/09/2026» reventaba con «date/time field value out of range». Un pago con
 * la fecha cambiada no se nota al registrarlo: se nota cuando hay que conciliar
 * contra el estado de cuenta del banco.
 *
 * Lo que no reconoce lo devuelve intacto, para que la base rechace un formato
 * raro en vez de que esta función se invente una fecha.
 */
export const fechaAIso = (fecha: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fecha.trim();
};

/** Hoy en AAAA-MM-DD, en la zona horaria del equipo. */
export const hoyIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * La fecha límite tal como se lee en pantalla: «viernes, 9 de octubre».
 *
 * Este formateo vivía DENTRO de `aConfiguracion`, y ahí era una trampa: la
 * configuración se quedaba con el texto y perdía la fecha. Mientras solo se
 * leyera daba igual; en cuanto `/admin/configuracion` quiso guardarla, lo único
 * que tenía para mandar a una columna `timestamptz` era «viernes, 9 de
 * octubre». Formatear al leer convierte un dato en una frase, y de una frase no
 * se vuelve.
 *
 * Ahora la configuración guarda el valor crudo de la base y el formateo ocurre
 * donde se pinta, que es el mismo trato que ya tenían las fechas de los días.
 *
 * Solo la fecha, sin la hora, y no es un olvido: el vencimiento tiene hora
 * —18:00— pero al participante se le promete un día. «Antes del viernes 9»
 * es una instrucción; «antes del viernes 9 a las 18:00» invita a llegar a las
 * 17:55 a una ventanilla con cola.
 */
export const fechaLimiteTexto = (iso: string) => {
  if (!iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
};

/**
 * De un `timestamptz` de la base al valor que espera un `<input
 * type="datetime-local">`: `AAAA-MM-DDTHH:mm`, en la hora del equipo.
 *
 * El campo es de fecha Y hora a propósito. Con uno de solo fecha, quien tocara
 * el vencimiento lo movería sin querer a las 00:00 de ese día —siete horas
 * ANTES de las 18:00 que tenía—, y adelantar un cierre sin decirlo deja fuera a
 * quien llegó a tiempo.
 */
export const isoAMomentoLocal = (iso: string) => {
  if (!iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** La vuelta, para escribir en la base. Lo que no reconoce lo devuelve intacto. */
export const momentoLocalAIso = (valor: string) => {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : d.toISOString();
};
