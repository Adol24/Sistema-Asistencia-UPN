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

/** Largo de los campos numéricos que tienen uno solo. */
export const LARGO = {
  celular: 10,
} as const;

/**
 * La matrícula va de ocho a once dígitos, y los cuatro largos son reales.
 *
 * Las de once son las que emite Servicios Escolares hoy y las de ocho vienen de
 * la numeración anterior, pero entre esas dos también hay padrón: existen
 * matrículas vigentes de nueve y de diez dígitos. Una regla de «ocho u once» no
 * rechazaba un error de captura, rechazaba a esos alumnos.
 *
 * Y rechazarlos no es cosmético. La matrícula es la llave del padrón, y sin fila
 * en el padrón no hay pre-registro, ni pago, ni constancia: el alumno existe en
 * la universidad y no existe aquí.
 *
 * Lo que se pierde al abrir el rango está asumido. Con ocho u once exactos, un
 * dígito de más al teclear una de ocho no pasaba; ahora entra como una matrícula
 * de nueve. Se acepta a sabiendas, porque dejar fuera a quien existe es peor que
 * dejar pasar un error que la mesa puede corregir con el documento delante.
 */
export const LARGOS_MATRICULA = [8, 9, 10, 11] as const;

/**
 * Cómo se nombran esos largos dentro de una frase.
 *
 * Va pegado a `LARGOS_MATRICULA` a propósito. Los cuatro son contiguos, así que
 * se dicen como un rango en vez de enumerarlos —«entre 8 y 11 dígitos»—, y esa
 * forma no se deduce de la lista. Si algún día dejaran de ser contiguos, las dos
 * líneas se editan de una sola mirada.
 */
export const LARGOS_MATRICULA_EN_TEXTO = "entre 8 y 11";

/** El tope del campo: el mayor de los largos válidos. */
export const MAX_MATRICULA = Math.max(...LARGOS_MATRICULA);

/**
 * ¿Es una matrícula completa? Solo dígitos, y uno de los largos válidos.
 *
 * La usan el formulario del alumno, la importación del padrón y el alta en mesa,
 * que es la razón de que viva aquí: la base tiene la misma regla en un `check`, y
 * cuatro copias de la misma regla son cuatro oportunidades de que una se quede
 * atrás. Ya pasó: el alta en mesa llevaba la suya escrita a mano.
 */
export const esMatricula = (valor: string): boolean =>
  /^[0-9]+$/.test(valor) && (LARGOS_MATRICULA as readonly number[]).includes(valor.length);

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
