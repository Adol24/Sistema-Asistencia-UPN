/**
 * Catálogo académico que el alumno declara en su pre-registro.
 *
 * Servicios Escolares entrega el padrón con el nombre completo y la matrícula,
 * nada más. El nivel, el programa, el avance y el grupo los captura el propio
 * alumno, así que tienen que existir como catálogo: en un campo libre, cuarenta
 * alumnos escriben la misma carrera de cuarenta maneras y el reporte por
 * programa deja de servir.
 *
 * Es **dato editable, no una constante**. Vive en la configuración del evento y
 * se administra desde `/admin/configuracion`, igual que la cuota o la fecha
 * límite: qué niveles imparte la universidad y cómo se llama su avance es algo
 * que cambia, y no debería requerir tocar código.
 */

/**
 * Un programa del catálogo, con la excepción que pueda traer.
 *
 * Casi todos se cuentan como diga su nivel, y por eso los dos campos son
 * opcionales: `undefined` significa «lo que diga mi nivel», no «sin dato». Que
 * la excepción se vea como excepción importa —copiar la etiqueta y el tope a los
 * nueve programas dejaría de distinguir cuál de ellos es el raro—.
 *
 * La que existe hoy es la **Licenciatura en Educación e Innovación Pedagógica**,
 * que se cuenta por módulos y llega al 13 siendo licenciatura.
 */
export interface ProgramaAcademico {
  nombre: string;
  /** «Módulo» cuando este programa no se cuenta como su nivel. */
  etiquetaAvance?: string | undefined;
  /** Su propio tope, cuando no es el del nivel. */
  totalAvance?: number | undefined;
}

/** Un nivel educativo con su catálogo de programas y su forma de contar avance. */
export interface NivelAcademico {
  /** «Licenciatura», «Maestría», «Doctorado»… */
  nivel: string;
  /** Cómo se cuenta el avance aquí, salvo que un programa diga otra cosa. */
  etiquetaAvance: string;
  /** Hasta dónde llega ese avance, salvo que un programa diga otra cosa. */
  totalAvance: number;
  programas: ProgramaAcademico[];
}

/*
 * Aquí vivía el catálogo académico escrito a mano.
 *
 * Se retiró con el resto de los datos inventados: los niveles y sus programas
 * son de la universidad y viven en `niveles_academicos` y `programas`, donde
 * administración los edita. Un catálogo de arranque en el código volvía a
 * introducir el problema que se acaba de quitar —dos fuentes para el mismo dato,
 * y ninguna forma de saber cuál se está viendo—.
 */

/** El nivel con ese nombre, o undefined si ya no está en el catálogo. */
export const buscarNivel = (catalogo: NivelAcademico[], nivel?: string) =>
  nivel ? catalogo.find((n) => n.nivel === nivel) : undefined;

/**
 * Compara dos nombres del catálogo ignorando acentos, mayúsculas y espacios de
 * más.
 *
 * El padrón llega de Servicios Escolares en mayúsculas y sin garantía de
 * acentos: «LICENCIATURA EN EDUCACIÓN E INNOVACIÓN PEDAGÓGICA» tiene que
 * encontrar a «Licenciatura en Educación e Innovación Pedagógica». Si no
 * coincidiera, el programa parecería no tener excepción y su alumno de módulo 13
 * se rechazaría como si fuera semestre 13.
 */
const mismoNombre = (a: string, b: string) => {
  const limpio = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  return limpio(a) === limpio(b);
};

/** El programa con ese nombre dentro de un nivel, o undefined. */
export const buscarPrograma = (n: NivelAcademico | undefined, programa?: string) =>
  n && programa ? n.programas.find((p) => mismoNombre(p.nombre, programa)) : undefined;

/**
 * Cómo se cuenta el avance de alguien: su etiqueta y su tope.
 *
 * Manda el programa y, si no dice nada, el nivel. Esa precedencia está en un
 * solo sitio a propósito: la comparte la pantalla que lo pinta, el importador
 * que valida el archivo y el disparador de la base, y si cada uno la resolviera
 * a su manera acabarían discrepando.
 */
export const cuentaDeAvance = (
  catalogo: NivelAcademico[],
  nivel?: string,
  programa?: string,
): { etiqueta: string; total: number } | undefined => {
  const n = buscarNivel(catalogo, nivel);
  if (!n) return undefined;
  const p = buscarPrograma(n, programa);
  return {
    etiqueta: p?.etiquetaAvance ?? n.etiquetaAvance,
    total: p?.totalAvance ?? n.totalAvance,
  };
};

/**
 * Cómo se lee el avance de alguien: «Semestre 6», «Módulo 13». Devuelve cadena
 * vacía si falta el dato o si su nivel ya no existe, para que quien lo pinte no
 * tenga que comprobarlo.
 *
 * El programa es opcional por compatibilidad con quien todavía no lo tenga a
 * mano, pero sin él la excepción no se puede aplicar: un alumno de Innovación
 * Pedagógica saldría como «Semestre 13». Pásalo siempre que exista.
 */
export const avanceTexto = (
  catalogo: NivelAcademico[],
  nivel?: string,
  avance?: number,
  programa?: string,
): string => {
  const cuenta = cuentaDeAvance(catalogo, nivel, programa);
  return cuenta && avance ? `${cuenta.etiqueta} ${avance}` : "";
};
