/**
 * El depósito, que ahora es UNO SOLO.
 *
 * Hasta el 2026-09-25 el evento y el taller se depositaban por separado y el
 * alumno llegaba a ventanilla con dos vouchers. Ya no: hace un único depósito
 * por el total y presenta un único voucher, con un concepto que depende de si
 * lleva taller o no.
 *
 * Esto vive aparte de `pagos-logica.ts` a propósito, aunque hable de lo mismo.
 * Allí «concepto» es el tipo `Concepto`, que vale `"evento"` o `"taller"` y
 * nombra las dos filas que Servicios Financieros sigue llevando por dentro.
 * Aquí «concepto» es la FRASE que el alumno escribe a mano en la hoja donde
 * pega su voucher. Son dos cosas distintas con el mismo nombre, y mezclarlas en
 * un archivo es cómo se acaba pasando una donde se esperaba la otra.
 *
 * Que por dentro sigan siendo dos filas y por fuera un solo depósito no es un
 * descuido: es el alcance que se decidió. El alumno deposita una vez; la
 * ventanilla, al recibir ese voucher, confirma los dos conceptos.
 */

import type { Perfil } from "@/dominio/tipos";

/**
 * Lo que el alumno escribe debajo de su voucher cuando solo paga el evento.
 *
 * Es texto literal y revisado: la ventanilla lo compara contra lo que espera
 * recibir. No se arma concatenando el nombre del evento ni ninguna otra cosa de
 * la configuración —«Curso de Formación Continua» no es como se llama el
 * encuentro, y «(XIV EIE)» son sus siglas, no su título—, así que derivarlo
 * produciría una frase que suena parecida y que en ventanilla está mal.
 */
const CONCEPTO_SOLO_EVENTO = "Cuota de recuperación Curso de Formación Continua (XIV EIE)";

/** El mismo, cuando además lleva taller. Un solo depósito cubre los dos. */
const CONCEPTO_CON_TALLER =
  "Cuota de recuperación Curso de Formación Continua y Taller de Formación Continua (XIV EIE)";

export interface Deposito {
  /** Lo que se deposita, de una sola vez. */
  total: number;
  /** La cuota del evento, para poder enseñar de dónde sale el total. */
  cuotaEvento: number;
  /** Lo que suma el taller, o `null` si no eligió ninguno. */
  costoTaller: number | null;
  /** La frase que va escrita a mano en la hoja. */
  concepto: string;
  /** Si el total se compone de dos cosas y conviene desglosarlo. */
  llevaTaller: boolean;
}

/**
 * El depósito de una persona, según lleve taller o no.
 *
 * Toma los importes en vez de leerlos del contexto para poder comprobarse sin
 * montar la aplicación, y porque las dos pantallas que lo usan —`/pago` y
 * `/comprobante`— ya tienen la configuración y el taller a mano.
 *
 * `costoTaller` se acepta como `null` y también como `undefined`: el taller
 * llega de `getTaller(...)`, que devuelve `undefined` cuando no hay ninguno, y
 * obligar a cada pantalla a traducirlo era pedir que una se olvidara.
 */
export function depositoDe(cuotaEvento: number, costoTaller?: number | null): Deposito {
  const taller = costoTaller ?? null;
  const llevaTaller = taller !== null;
  return {
    total: cuotaEvento + (taller ?? 0),
    cuotaEvento,
    costoTaller: taller,
    concepto: llevaTaller ? CONCEPTO_CON_TALLER : CONCEPTO_SOLO_EVENTO,
    llevaTaller,
  };
}

/**
 * El depósito de una persona, que desde el 2026-09-30 depende de quién es.
 *
 * Esta es la que llaman las pantallas. `depositoDe` sigue siendo la de abajo:
 * toma dos cifras y no sabe de perfiles, que es lo que la hace comprobable sin
 * montar nada. Aquí se decide CUÁLES son esas dos cifras.
 *
 * Por qué hacía falta
 * -------------------
 * Hasta hoy había un solo precio y las tres pantallas —`/pago`,
 * `/comprobante` y `/portal/estado`— podían leerlo de la configuración global.
 * El maestro que no quería constancia no rompía eso porque su cero no se
 * imprime: esas pantallas lo detectan antes y enseñan otra cosa. Un TERCER
 * precio sí hay que imprimirlo, y con la cuota global las tres habrían dicho
 * 500 mientras la base esperaba 250.
 *
 * Lo que NO hace
 * --------------
 * No sabe de la exención. Al maestro que respondió «no quiero constancia» esta
 * función le devolvería su cuota igual que a cualquiera, y está bien: quien
 * decide que a esa persona no se le enseña ningún importe es la pantalla, con
 * la misma pregunta que ya usa para su insignia. Meter aquí la exención sería
 * la cuarta copia de esa regla.
 */
export function depositoDePersona(
  evento: { cuotaEvento: number; cuotaDocente: number },
  perfil: Perfil,
  costoTaller?: number | null,
): Deposito {
  return depositoDe(cuotaDe(evento, perfil), costoTallerDe(perfil, costoTaller));
}

/**
 * La cuota que le toca a esta persona.
 *
 * El externo NO es docente aquí, y es deliberado: `cuota_docente` es del
 * profesor de la UPN U-212. Un profesor de otra institución entra como externo
 * y paga la cuota general. La misma línea la trazan `fn_preregistrar_externo` y
 * `fn_exigir_lugar_en_taller`.
 */
export function cuotaDe(
  evento: { cuotaEvento: number; cuotaDocente: number },
  perfil: Perfil,
): number {
  return perfil === "docente" ? evento.cuotaDocente : evento.cuotaEvento;
}

/**
 * Lo que le suma el taller, que al maestro no le suma nada.
 *
 * Devuelve CERO y no nulo para el docente con taller, y la diferencia importa:
 * nulo significa «no lleva taller» y cambia el concepto que escribe a mano en
 * la hoja del banco. El maestro sí lleva taller —ocupa su lugar y va a la lista
 * de asistencia—, lo que pasa es que ya lo pagó dentro de su cuota. Un cero
 * conserva el concepto largo, que es el que describe lo que va a recibir.
 *
 * Es la misma regla que `fn_cambiar_taller` escribe en `monto_esperado_taller`,
 * y por eso el cero de aquí y el de allá son el mismo cero.
 */
export function costoTallerDe(perfil: Perfil, costo?: number | null): number | null {
  if (costo === null || costo === undefined) return null;
  return perfil === "docente" ? 0 : costo;
}
