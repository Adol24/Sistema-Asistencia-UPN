/**
 * Cuándo puede pre-registrarse cada grupo, del lado del navegador.
 *
 * Las ventanas existen desde la migración 44 y hasta aquí solo se podían tocar
 * escribiendo SQL: la única fecha que cierra el pre-registro del evento vivía
 * sembrada dentro de un archivo de migración. Cambiar el día en que abre el
 * registro de séptimo semestre —que es una decisión de la organización, y de las
 * que se mueven— exigía a alguien con acceso al editor de Supabase.
 *
 * **Esto no decide nada.** La puerta es `trg_ventana_preregistro`, un disparador
 * sobre `participantes` que vuelve a comprobar la ventana justo antes de
 * insertar. Lo de aquí es la pantalla que deja verlas y corregirlas.
 *
 * Dos reglas heredadas de la migración, y las dos importan al editar:
 *
 * - **Sin ninguna ventana, el pre-registro está abierto para todos.** Borrar la
 *   última no cierra nada: lo abre. Es lo contrario de lo que sugiere una lista
 *   vacía, y por eso la pantalla lo dice con todas sus letras.
 * - **Una ventana sin programas no admite a nadie.** Se ve cargada y rechaza a
 *   todo el mundo con «todavía no se anuncia la fecha de tu grupo». Es el error
 *   más fácil de cometer aquí, así que bloquea el guardado en vez de avisarse.
 */

import { useCallback, useEffect, useState } from "react";

import { hayBaseDeDatos } from "@/lib/supabase-config";

/**
 * Una generación concreta de un programa concreto.
 *
 * El avance es exacto y no un rango, igual que en la tabla: la invitación es a
 * quienes van en el 7 —o en el 13—, no a quienes van por el 7 o más.
 *
 * `null` mientras nadie lo ha escrito, y no 0: un 0 sería «avance cero», que la
 * base rechaza; `null` es «falta llenarlo», que es lo que la pantalla necesita
 * poder decir.
 */
export interface CohorteVentana {
  programaId: string;
  avance: number | null;
}

/**
 * Los perfiles que no salen de ningún padrón.
 *
 * `alumno` no está, y es a propósito: la base lo prohíbe con
 * `check (perfil <> 'alumno')` en `ventana_perfiles`. Al alumno se le invita por
 * generación —programa más avance— y admitirlo también en bloque daría dos
 * formas de decir lo mismo con reglas distintas.
 */
export type PerfilSinPadron = "docente" | "externo";

/** Cómo se nombra cada perfil en la pantalla y en los avisos. */
export const PERFILES_SIN_PADRON: { perfil: PerfilSinPadron; nombre: string }[] = [
  { perfil: "docente", nombre: "Docentes" },
  { perfil: "externo", nombre: "Participantes externos" },
];

/** Un tramo de tiempo y la lista de a quién deja pasar. */
export interface VentanaPreregistro {
  /** El uuid de la base. Vacío en una ventana que todavía no se ha guardado. */
  id: string;
  /**
   * Lo que lee quien llega fuera de plazo, ya redactado: «El registro de
   * séptimo semestre y de los módulos 9 y 13 abre el 25/09/2026». La fecha la
   * pone la base al final, así que esto tiene que poder leerse seguido de «abre
   * el…» sin sonar raro.
   *
   * Los números son los que trae el alumno en su lista, no los del documento
   * administrativo: es contra los suyos contra los que compara para saber si el
   * aviso habla de él.
   */
  etiqueta: string;
  /** ISO completo con zona, tal como viaja un `timestamptz`. */
  abre: string;
  cierra: string;
  cohortes: CohorteVentana[];
  /**
   * Docentes y externos, que entran por lo que son y no por una generación.
   *
   * Va aparte de `cohortes` porque **cada audiencia se mide con las ventanas que
   * hablan de ella**: una ventana solo de docentes no debe cerrarle la puerta a
   * ningún alumno, ni al revés. Ver el interruptor por audiencia en la
   * migración 49.
   */
  perfiles: PerfilSinPadron[];
}

/**
 * Un programa del catálogo con su id y su avance ya resuelto.
 *
 * La etiqueta y el tope llegan resueltos —manda el programa y el nivel suple,
 * la precedencia de `cuentaDeAvance`— porque aquí solo sirven para enseñarlos y
 * para comprobar que el avance que se escribe existe en ese programa.
 */
export interface ProgramaDeVentana {
  id: string;
  nombre: string;
  nivel: string;
  etiquetaAvance: string;
  totalAvance: number;
}

/** En qué momento está una ventana respecto de ahora. */
export type EstadoVentana = "pendiente" | "abierta" | "cerrada";

export function estadoDeVentana(v: VentanaPreregistro, ahora = Date.now()): EstadoVentana {
  const abre = new Date(v.abre).getTime();
  const cierra = new Date(v.cierra).getTime();
  if (ahora < abre) return "pendiente";
  return ahora > cierra ? "cerrada" : "abierta";
}

/** Una ventana recién creada, todavía sin nada escrito. */
export const ventanaNueva = (): VentanaPreregistro => ({
  id: "",
  etiqueta: "",
  abre: "",
  cierra: "",
  cohortes: [],
  perfiles: [],
});

/**
 * Lo que impide guardar esta ventana, con nombre de persona.
 *
 * Una lista vacía es «se puede guardar». Se comprueba aquí y no solo en la base
 * porque la base contesta en su idioma —`check_violation`, `null value in
 * column`— y, sobre todo, porque el error caro no lo detecta ninguna
 * restricción: una ventana sin programas es perfectamente válida para
 * PostgreSQL y rechaza a todo el mundo.
 */
export function problemasDeVentana(
  v: VentanaPreregistro,
  programas: ProgramaDeVentana[],
): string[] {
  const problemas: string[] = [];
  const nombre = v.etiqueta.trim() || "la ventana sin texto";

  if (!v.etiqueta.trim())
    problemas.push("Falta el texto de la ventana: es lo que lee quien llega fuera de plazo.");

  const abre = new Date(v.abre).getTime();
  const cierra = new Date(v.cierra).getTime();
  if (!v.abre || Number.isNaN(abre)) problemas.push(`«${nombre}» no tiene fecha de apertura.`);
  if (!v.cierra || Number.isNaN(cierra)) problemas.push(`«${nombre}» no tiene fecha de cierre.`);
  // La base trae el mismo `check (cierra > abre)`, pero enterarse allí obliga a
  // mandar el resto y volver. Se dice antes de salir de la pantalla.
  if (!Number.isNaN(abre) && !Number.isNaN(cierra) && cierra <= abre)
    problemas.push(`«${nombre}» cierra antes de abrir.`);

  // Ni programas ni perfiles: la ventana se ve cargada y no deja pasar a nadie.
  // Basta con uno de los dos, porque una ventana puede ser solo de docentes o
  // solo de una generación de alumnos; lo que no puede es estar vacía.
  if (!v.cohortes.length && !v.perfiles.length)
    problemas.push(
      `«${nombre}» no admite a nadie: sin programas ni perfiles declarados rechaza a todo el mundo.`,
    );

  const porId = new Map(programas.map((p) => [p.id, p]));
  for (const c of v.cohortes) {
    const p = porId.get(c.programaId);
    // Un programa que ya no está en el catálogo no se comenta: lo borró el
    // catálogo académico y `on delete cascade` se llevará su cohorte.
    if (!p) continue;
    if (c.avance === null) problemas.push(`Falta el avance de ${p.nombre} en «${nombre}».`);
    else if (c.avance < 1 || c.avance > p.totalAvance)
      problemas.push(
        `${p.etiquetaAvance} ${c.avance} no existe en ${p.nombre}, que llega al ${p.totalAvance}: no entraría nadie por ahí.`,
      );
  }

  return problemas;
}

/**
 * Los programas que ninguna ventana menciona.
 *
 * No es un error —los demás grupos entran después, en fechas que todavía no se
 * anuncian— pero sí es lo que hay que poder ver antes de irse de la pantalla:
 * sus alumnos reciben «todavía no se anuncia la fecha de registro para tu
 * grupo», y eso conviene que sea a propósito y no un olvido.
 */
export function programasSinVentana(
  ventanas: VentanaPreregistro[],
  programas: ProgramaDeVentana[],
): ProgramaDeVentana[] {
  const mencionados = new Set(ventanas.flatMap((v) => v.cohortes.map((c) => c.programaId)));
  return programas.filter((p) => !mencionados.has(p.id));
}

/**
 * Los perfiles sin padrón a los que ninguna ventana deja entrar todavía.
 *
 * **Lista vacía mientras ninguna ventana mencione perfil alguno**, y esa
 * excepción es la regla entera, no un caso borde. El interruptor de la
 * migración 49 va por audiencia: mientras `ventana_perfiles` esté vacía,
 * docentes y externos entran cuando quieran, igual que hasta la migración 48.
 * Avisar ahí de que «se quedan fuera» sería decir lo contrario de lo que pasa.
 *
 * En cuanto UNA ventana nombra a un perfil, la puerta se cierra para el otro si
 * nadie lo nombró, y entonces sí hay que poder verlo antes de salir de la
 * pantalla: que sea una decisión y no un olvido.
 */
export function perfilesSinVentana(
  ventanas: VentanaPreregistro[],
): { perfil: PerfilSinPadron; nombre: string }[] {
  const mencionados = new Set(ventanas.flatMap((v) => v.perfiles));
  if (!mencionados.size) return [];
  return PERFILES_SIN_PADRON.filter((p) => !mencionados.has(p.perfil));
}

/** Lo que carga el hook, y en qué estado está. */
export interface Ventanas {
  ventanas: VentanaPreregistro[];
  programas: ProgramaDeVentana[];
  cargando: boolean;
  /** El fallo de la base ya en castellano, o cadena vacía si todo fue bien. */
  error: string;
  /**
   * Sin base configurada —el modo prototipo— aquí no hay nada que enseñar.
   *
   * Se distingue de «cargó y no hay ninguna» a propósito: esa frase significa
   * que el pre-registro está abierto para todos, y decírsela a quien está
   * mirando una demostración sin base sería afirmar algo que no se ha
   * comprobado.
   */
  sinBase: boolean;
  /** Vuelve a pedirlas. Se usa después de guardar, para ver lo que quedó. */
  recargar: () => void;
}

/**
 * Las ventanas y el catálogo de programas, pedidos al montar.
 *
 * Van juntos porque no sirve el uno sin el otro: una ventana guarda ids de
 * programa y la pantalla tiene que enseñar nombres. Y van aparte de
 * `cargarPublico` —que es lo que se pediría por parecido— porque esa tiene
 * media hora de caché y la piden también las pantallas del alumno, que no
 * necesitan ni una cosa ni la otra: lo suyo lo contesta la base con
 * `fn_ventana_de_matricula`.
 *
 * A diferencia del aforo, aquí un fallo SÍ se cuenta. Esta es la pantalla donde
 * se editan: callarse y enseñar una lista vacía diría «no hay ninguna ventana»,
 * que es justo lo contrario de lo que estaría pasando, y guardar sobre esa
 * lista vacía borraría las que hay.
 */
export function useVentanas(): Ventanas {
  const [ventanas, setVentanas] = useState<VentanaPreregistro[]>([]);
  const [programas, setProgramas] = useState<ProgramaDeVentana[]>([]);
  const [cargando, setCargando] = useState(hayBaseDeDatos);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vivo = true;
    setCargando(true);

    void (async () => {
      try {
        const d = await import("@/lib/datos");
        const [v, p] = await Promise.all([d.cargarVentanas(), d.programasDeVentana()]);
        if (!vivo) return;
        setVentanas(v);
        setProgramas(p);
        setError("");
      } catch (e: unknown) {
        const { mensajeDeError } = await import("@/lib/supabase");
        if (vivo) setError(mensajeDeError(e));
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [intento]);

  return { ventanas, programas, cargando, error, sinBase: !hayBaseDeDatos, recargar };
}
