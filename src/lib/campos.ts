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

/**
 * Propiedades de un campo que se captura en mayúsculas.
 *
 * El nombre en el padrón va en mayúsculas y sin acentos, así que los campos que
 * lo capturan deben verse igual. Lo que NO se puede hacer es convertir el valor
 * en `onChange`, aunque sea lo primero que se le ocurre a cualquiera:
 *
 * Los teclados de teléfono escriben por composición. Mientras se teclea una
 * palabra, el teclado mantiene una región «en curso» que sigue siendo suya, y la
 * confirma al pulsar espacio. Si entre medias el campo reescribe el valor —de
 * «diego» a «DIEGO»—, lo que el teclado tiene apuntado deja de coincidir con lo
 * que hay en el campo, y al confirmar borra la palabra entera. El resultado es
 * el que se ve: se escribe un nombre, se pulsa espacio y desaparece.
 *
 * La solución es no tocar el valor. Se muestra en mayúsculas con CSS
 * —`uppercase` es solo apariencia, el valor real no cambia— y se convierte donde
 * se usa: al comparar o al guardar. `autoCapitalize` hace que el teclado escriba
 * en mayúsculas por su cuenta, que es la vía que no pelea con nadie, y quitar
 * autocorrección evita que proponga cambios sobre un nombre propio.
 */
export const CAMPO_MAYUSCULAS = {
  autoCapitalize: "characters",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;
