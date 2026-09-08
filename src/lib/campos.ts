/**
 * Filtros de entrada para los campos que solo admiten números.
 *
 * La regla es una sola y vale para todos: **un campo numérico no acepta una
 * letra para después reprocharla**. Se descarta lo que no corresponde en el
 * momento de escribirlo —y de pegarlo—, y el mensaje de error queda reservado
 * para lo único que puede fallar de verdad, que es la cantidad de dígitos.
 *
 * Vive aquí y no en cada pantalla porque el mismo filtro hace falta en la
 * matrícula, en el celular y en el código de verificación, y tres copias son
 * tres oportunidades de que una se quede atrás.
 */

/** Solo dígitos, recortado al máximo que acepta el campo. */
export const soloDigitos = (valor: string, maximo: number): string =>
  valor.replace(/\D/g, "").slice(0, maximo);

/** Largo de los campos numéricos del sistema, en un solo lugar. */
export const LARGO = {
  matricula: 11,
  celular: 10,
} as const;

/**
 * Un importe en pesos: dígitos y **un** punto decimal, con dos decimales como
 * máximo. No se recorta a una longitud fija porque los montos no la tienen; lo
 * que se impide es escribir algo que no sea un número.
 */
export const soloImporte = (valor: string): string => {
  const limpio = valor.replace(/[^\d.]/g, "");
  const [entera, ...resto] = limpio.split(".");
  if (resto.length === 0) return entera ?? "";
  return `${entera}.${resto.join("").slice(0, 2)}`;
};

/**
 * «Te faltan 3 dígitos: el celular son 10.» Decir cuántos faltan es más útil
 * que repetir el formato, que el propio campo ya garantiza.
 */
export const faltanDigitos = (valor: string, largo: number, campo: string): string | undefined => {
  if (valor.length === largo) return undefined;
  const faltan = largo - valor.length;
  return `Te ${faltan === 1 ? "falta 1 dígito" : `faltan ${faltan} dígitos`}: ${campo} son ${largo}.`;
};
