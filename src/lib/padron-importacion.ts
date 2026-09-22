/**
 * Lectura y análisis del archivo de importación del padrón, sin React.
 *
 * Misma mecánica que la carga masiva de pagos: la función es pura, devuelve el
 * diagnóstico fila por fila y NO aplica nada. La pantalla solo escribe cuando el
 * usuario confirma.
 *
 * La diferencia de fondo con los pagos es que aquí una fila puede tocar a alguien
 * que ya está registrado: cambiarle el día asignado a quien ya pagó tiene
 * consecuencias operativas —viene otro día, su taller puede no impartirse— así
 * que eso se marca en ámbar aunque el dato sea válido.
 */

import { leerOrigen, type OrigenTabla } from "@/lib/csv";
import { LARGOS_MATRICULA_EN_TEXTO, esMatricula } from "@/lib/campos";
import type { AlumnoPadron, Participante } from "@/dominio/tipos";
import type { NivelAcademico } from "@/dominio/catalogos";

/**
 * Lo que el archivo de Servicios Escolares tiene que traer. El nombre viene
 * completo en una sola columna, sin separar nombres de apellidos, y `grupo`
 * puede ir vacío porque no todos los programas lo manejan.
 *
 * No trae el correo —lo declara el alumno y se verifica con un código— **ni el
 * día**, que no lo asigna la universidad sino la organización, repartiendo a los
 * alumnos entre los tres días desde `/admin/padron`.
 */
export const COLUMNAS_PADRON = [
  "matricula",
  "nombre",
  "programa",
  "avance",
  "grupo",
  "sede",
] as const;

/**
 * Nombres alternativos que puede traer una columna.
 *
 * El archivo lo genera Servicios Escolares, no este sistema, y su encabezado no
 * se puede imponer. La columna de la sede llegó llamándose «plantel» en el
 * prototipo y «sede» en el uso real; aceptar los dos evita que un archivo
 * correcto se rechace entero por una palabra del encabezado.
 */
const SINONIMOS: Record<string, string[]> = {
  matricula: ["boleta", "no. de control", "numero de control"],
  nombre: ["nombre del alumno", "nombre completo", "alumno"],
  // El encabezado del avance dice cómo se cuenta ESE archivo: la hoja de la
  // licenciatura modular se titula «Modulo» y la de las demás «Semestre». Se
  // aceptan los dos y el genérico con el que llegan las hojas mixtas.
  avance: ["modulo", "módulo", "semestre", "cuatrimestre", "semestre/modulo", "semestre/módulo"],
  sede: ["plantel", "unidad", "subsede"],
  // El día no es una de las columnas obligatorias. Aparece cuando lo que se
  // sube es la exportación de esta misma pantalla. Ver `COLUMNA_DIA`.
  dia: ["día", "dia asignado", "día asignado", "dia del evento", "día del evento"],
};

/**
 * La columna del día se lee, pero no se aplica.
 *
 * Vive fuera de `COLUMNAS_PADRON` porque es **opcional**: el archivo de
 * Servicios Escolares no la trae —el día no lo asigna la universidad, lo reparte
 * la organización— y exigirla rechazaría el archivo con el que empieza todo.
 *
 * Se lee de todas formas, y esa es la razón de que exista esta constante. La
 * exportación del padrón sí escribe el día, así que quien reimporte ese archivo
 * lo traerá, y es previsible que lo haya editado esperando mover a alguien. Si
 * la columna se ignorara en silencio, la pantalla diría «listo» sobre un cambio
 * que no ocurrió: la fila avisa de que el día no se toca y de dónde sí se mueve.
 *
 * No se aplica porque el día vive en dos tablas —`padron_alumnos.dia` y
 * `participantes.dia`— y moverlo exige la misma operación que usa el reparto,
 * que además libera el taller de quien se quede con uno que su día nuevo no
 * imparte. La importación escribe el padrón con un `upsert` directo: por ahí, un
 * día nuevo dejaría al participante en el suyo viejo y la puerta le diría DÍA
 * EQUIVOCADO.
 */
export const COLUMNA_DIA = "dia";

/**
 * Los ordinales con los que el padrón escribe el avance.
 *
 * Tres de las cinco hojas del archivo oficial no traen un número sino la
 * palabra: «TERCER», «QUINTO». `soloNumero` las dejaba en blanco y la fila
 * moría con «avance inválido: ""», que no le dice a nadie qué arreglar.
 *
 * Llega al 13 porque ese es el tope de la licenciatura modular y de las
 * maestrías. Se aceptan las dos formas de los que cambian —«tercer» y
 * «tercero»— porque las dos se escriben.
 */
const ORDINALES: Record<string, number> = {
  primer: 1,
  primero: 1,
  segundo: 2,
  tercer: 3,
  tercero: 3,
  cuarto: 4,
  quinto: 5,
  sexto: 6,
  septimo: 7,
  octavo: 8,
  noveno: 9,
  decimo: 10,
  undecimo: 11,
  decimoprimero: 11,
  duodecimo: 12,
  decimosegundo: 12,
  decimotercero: 13,
};

/**
 * Compara dos textos ignorando acentos, mayúsculas y espacios de más.
 *
 * El archivo lo teclean personas: «Maestria en educacion basica» y «Maestría en
 * Educación Básica» son el mismo programa, y rechazar la fila por los acentos
 * castigaría una diferencia que no significa nada.
 */
const igual = (a: string, b: string) =>
  a.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase() ===
  b.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * El número de un avance escrito como texto.
 *
 * El archivo trae «Semestre 1» o «Modulo 5», no un número suelto. La palabra que
 * lo acompaña ya la sabe el catálogo —es la etiqueta del nivel— y repetirla en
 * cada celda solo da ocasión de que no coincida.
 */
const soloNumero = (v: string | undefined) => {
  const texto = (v ?? "").trim();
  const digitos = texto.replace(/[^\d]/g, "");
  if (digitos) return digitos;

  // Sin dígitos, puede ser el ordinal escrito. Se normaliza igual que los demás
  // nombres del archivo —sin acentos, sin mayúsculas— y se le quita la palabra
  // que a veces lo acompaña: «TERCER SEMESTRE» es «tercer».
  const palabras = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/);
  for (const palabra of palabras) {
    const n = ORDINALES[palabra];
    if (n) return String(n);
  }
  return "";
};

/**
 * Quita la palabra que precede a un valor: «Grupo A» -> «A».
 *
 * La expresión se arma con `String.raw` porque dentro de una plantilla normal
 * `\s` se convierte en una simple «s» antes de llegar al constructor, y la
 * expresión deja de ser la que está escrita. Funcionaba por casualidad —el
 * `trim()` final se comía el espacio que `\s` debía absorber— hasta que un valor
 * viniera como «Grupo: A».
 */
const sinEtiqueta = (v: string | undefined, etiqueta: string) =>
  (v ?? "")
    .trim()
    .replace(new RegExp(String.raw`^${etiqueta}\s*[:.\-]?\s*`, "i"), "")
    .trim();

/** El nombre con el que la columna aparece en ESTE archivo, si aparece. */
const columnaDe = (encabezado: string[], columna: string): string | undefined =>
  [columna, ...(SINONIMOS[columna] ?? [])].find((n) => encabezado.includes(n));

export type SemaforoPadron = "listo" | "advertencia" | "error";

/** Una de las seis columnas que el padrón necesita, por su nombre interno. */
export type ColumnaPadron = (typeof COLUMNAS_PADRON)[number];

export interface FilaPadron {
  n: number;
  /** Las celdas tal como venían, bajo el encabezado literal del archivo. */
  crudo: Record<string, string>;
  /**
   * Las mismas celdas, pero buscadas por el nombre interno de la columna y no
   * por el que traiga el archivo.
   *
   * Existe porque el sinónimo se resolvía aquí dentro y la pantalla lo volvía a
   * resolver a mano, mal: leía `crudo["avance"]` y un archivo cuyo encabezado
   * dice «Modulo» —el de la licenciatura modular, que es una hoja entera—
   * enseñaba la columna del avance en blanco aunque la fila se validara bien.
   * El mismo agujero dejaba en blanco la matrícula de un archivo con «BOLETA» y
   * la sede de uno con «UNIDAD», y se llevaba esas columnas vacías al CSV de
   * errores.
   *
   * Resolver el encabezado es trabajo de quien ya leyó el encabezado. La
   * pantalla pinta lo que hay aquí y no vuelve a adivinar.
   */
  datos: Record<ColumnaPadron, string>;
  semaforo: SemaforoPadron;
  motivo: string;
  alumno?: AlumnoPadron | undefined;
}

export interface EntradaAnalisisPadron {
  /** El CSV completo, o las celdas de una hoja de Excel ya leída. */
  origen: OrigenTabla;
  padronActual: AlumnoPadron[];
  participantes: Participante[];
  /** Contra qué se validan el nivel, el programa y el avance de cada fila. */
  catalogo: NivelAcademico[];
  /**
   * Las sedes que existen. Se validan aquí y no solo al guardar porque esta
   * pantalla es una vista previa: enseñar una fila en verde y que la base la
   * rechace después convierte la previsualización en una promesa que no cumple.
   */
  sedes: string[];
  /** Estado de pago efectivo, para saber si el cambio afecta a alguien que ya pagó. */
  estadoDe: (p: Participante) => { evento: string };
}

export function analizarPadron(e: EntradaAnalisisPadron): FilaPadron[] {
  const { encabezado, filas } = leerOrigen(e.origen);
  const faltantes = COLUMNAS_PADRON.filter((c) => !columnaDe(encabezado, c));
  if (faltantes.length)
    throw new Error(`Al archivo le faltan estas columnas: ${faltantes.join(", ")}.`);

  const porMatriculaActual = new Map(e.padronActual.map((a) => [a.matricula, a]));
  const participantePorMatricula = new Map(
    e.participantes.filter((p) => p.matricula).map((p) => [p.matricula!, p]),
  );
  const vistas = new Map<string, number>();

  /*
   * Con qué nombre aparece cada columna en ESTE archivo.
   *
   * Se resuelve una vez, fuera del recorrido, y **para las seis**. Antes solo la
   * sede pasaba por aquí y las otras cinco se leían por su nombre literal
   * (`crudo["matricula"]`), así que sus sinónimos estaban declarados pero no se
   * usaban: un archivo con la columna «BOLETA» pasaba la comprobación de
   * columnas faltantes y después daba matrícula vacía en las mil filas.
   */
  const nombreDeColumna = Object.fromEntries(
    COLUMNAS_PADRON.map((c) => [c, columnaDe(encabezado, c) ?? c]),
  ) as Record<(typeof COLUMNAS_PADRON)[number], string>;

  // Opcional, y por eso aparte de las obligatorias: puede no venir.
  const columnaDia = columnaDe(encabezado, COLUMNA_DIA);

  return filas.map((base) => {
    const { n, crudo } = base;
    const celda = (columna: ColumnaPadron) => crudo[nombreDeColumna[columna]] ?? "";
    // Se arma una vez y viaja en la fila, incluidas las que mueren con error:
    // son justo las que hay que poder mirar para saber qué corregir.
    const datos = Object.fromEntries(COLUMNAS_PADRON.map((c) => [c, celda(c)])) as Record<
      ColumnaPadron,
      string
    >;
    const error = (motivo: string): FilaPadron => ({ ...base, datos, semaforo: "error", motivo });

    const matricula = celda("matricula").trim();
    // El archivo llega con el nombre tal como lo escribió Servicios Escolares
    // —«Matias Santos Ramos»— y la base lo quiere en mayúsculas. Se convierte
    // aquí en vez de rechazar la fila: es una diferencia de forma, no un dato
    // que falte, y devolverle a alguien dos mil filas por eso sería absurdo.
    const nombre = celda("nombre").trim().toUpperCase();
    const programa = celda("programa").trim();
    const avanceTxt = soloNumero(celda("avance"));
    const grupo = sinEtiqueta(celda("grupo"), "grupo").toUpperCase();
    const plantel = celda("sede").trim();

    if (!esMatricula(matricula))
      return error(
        `Matrícula con formato inválido: "${celda("matricula")}". Se esperan ${LARGOS_MATRICULA_EN_TEXTO} dígitos, sin letras.`,
      );
    if (!nombre) return error("Falta el nombre.");
    if (nombre.trim().split(/\s+/).length < 2)
      return error(`El nombre viene incompleto: "${nombre}". Se espera el nombre completo.`);

    // El catálogo académico es la única fuente de niveles y programas válidos.
    // Sin esta comprobación, un archivo con un programa mal escrito llega hasta
    // el reporte por programa y lo parte en dos.
    /*
     * El nivel se deduce del programa, no se pide aparte.
     *
     * En el archivo real ambos van en la misma celda: «Licenciatura en
     * Administración Educativa». Pedir una columna `nivel` obligaba a Servicios
     * Escolares a añadir un dato que ya está ahí, y a mantener dos celdas que
     * pueden contradecirse. Si viene la columna se acepta, pero manda el
     * catálogo: es él quien sabe a qué nivel pertenece cada programa.
     */
    const nivel = e.catalogo.find((n) => n.programas.some((p) => igual(p.nombre, programa)));
    if (!nivel)
      return error(
        `Programa desconocido: "${programa}". El catálogo tiene ${e.catalogo
          .flatMap((n) => n.programas.map((p) => p.nombre))
          .join(", ")}.`,
      );
    // Se guarda el nombre del catálogo, no el del archivo: así una fila escrita
    // «Maestria en educacion basica» no crea una segunda versión del programa en
    // los reportes.
    const programaDelCatalogo = nivel.programas.find((p) => igual(p.nombre, programa))!;
    const programaCanonico = programaDelCatalogo.nombre;
    /*
     * El tope y la etiqueta los manda el programa cuando los declara.
     *
     * La Licenciatura en Educación e Innovación Pedagógica se cuenta por módulos
     * y llega al 13 siendo licenciatura. Con la regla anterior —el nivel manda—
     * sus 293 alumnos se rechazaban con «Semestre 13, en Licenciatura va de 1 a
     * 8», y no había forma de cargarlos sin subirle el tope a las otras cinco
     * licenciaturas, que sí van por semestre.
     */
    const etiquetaAvance = programaDelCatalogo.etiquetaAvance ?? nivel.etiquetaAvance;
    const topeAvance = programaDelCatalogo.totalAvance ?? nivel.totalAvance;
    const avance = Number(avanceTxt);
    if (!/^\d+$/.test(avanceTxt) || avance < 1 || avance > topeAvance)
      return error(
        // Se nombra el programa y no el nivel cuando el tope es suyo: decir «en
        // Licenciatura va de 1 a 13» sería falso para las otras cinco.
        `${etiquetaAvance} inválido: "${avanceTxt}". En ${
          programaDelCatalogo.totalAvance ? programaCanonico : nivel.nivel
        } va de 1 a ${topeAvance}.`,
      );
    if (!plantel) return error("Falta la sede.");
    const sedeCanonica = e.sedes.find((x) => igual(x, plantel));
    if (!sedeCanonica)
      return error(`Sede desconocida: "${plantel}". Las que existen: ${e.sedes.join(", ")}.`);

    const repetida = vistas.get(matricula);
    if (repetida)
      return error(`Matrícula repetida dentro del archivo (ya venía en la fila ${repetida}).`);
    vistas.set(matricula, n);

    const existente = porMatriculaActual.get(matricula);
    const participante = participantePorMatricula.get(matricula);

    /*
     * Qué día pide el archivo, si trae la columna.
     *
     * Se compara con el que ya está guardado para no dar la lata: reimportar la
     * exportación sin tocarla es lo más normal del mundo, y ahí el día del
     * archivo y el de la base coinciden, así que no hay nada que avisar.
     */
    const diaEnArchivo = columnaDia ? soloNumero(crudo[columnaDia]) : "";
    const diaPide = diaEnArchivo ? Number(diaEnArchivo) : undefined;
    const diaDiscrepa = diaPide !== undefined && diaPide !== existente?.dia;
    const avisoDelDia = !diaDiscrepa
      ? ""
      : existente?.dia
        ? ` El archivo pide el día ${diaPide} y aquí tiene el ${existente.dia}: la importación NO mueve días, conserva el ${existente.dia}. Para moverlo usa la pestaña «Reparto», que también cambia al participante y libera su taller si el día nuevo no lo imparte.`
        : ` El archivo pide el día ${diaPide}, y la importación NO asigna días: sigue sin día. Se asignan desde la pestaña «Reparto».`;
    // El día no viaja en el archivo: quien ya lo tenía asignado lo conserva, y
    // el alta nueva entra sin día hasta que la organización lo reparta.
    const alumno: AlumnoPadron = {
      matricula,
      nombre,
      nivel: nivel.nivel,
      programa: programaCanonico,
      avance,
      ...(grupo ? { grupo } : {}),
      plantel: sedeCanonica,
      dia: existente?.dia,
    };

    // Advertencias: el dato es válido pero tiene consecuencias operativas.
    if (existente && existente.nombre !== nombre) {
      const pagado = participante && e.estadoDe(participante).evento === "pagado";
      return {
        ...base,
        datos,
        semaforo: "advertencia",
        motivo:
          (pagado
            ? `Cambia el nombre de "${existente.nombre}" a "${nombre}" y YA PAGÓ: su constancia sale con el nombre nuevo, confírmalo antes de aplicar.`
            : `Cambia el nombre de "${existente.nombre}" a "${nombre}". Revisa que no sea un error de captura.`) +
          avisoDelDia,
        alumno,
      };
    }
    if (existente)
      return {
        ...base,
        datos,
        // Un día distinto al guardado sale en ámbar y no en verde: es un cambio
        // que quien subió el archivo espera y que no va a ocurrir, y eso no se
        // puede decir con la misma luz que «todo en orden».
        semaforo: diaDiscrepa ? "advertencia" : "listo",
        motivo:
          (existente.dia
            ? `Actualiza un registro existente. Conserva su día ${existente.dia}.`
            : "Actualiza un registro existente, que sigue sin día asignado.") + avisoDelDia,
        alumno,
      };
    return {
      ...base,
      datos,
      semaforo: "advertencia",
      motivo: "Alta nueva. Queda sin día asignado hasta que se reparta." + avisoDelDia,
      alumno,
    };
  });
}
