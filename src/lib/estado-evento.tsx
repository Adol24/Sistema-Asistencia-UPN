import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { useSesion } from "@/lib/sesion";
import { rolHaciaBase } from "@/lib/roles";
import type { Publico } from "@/lib/datos";
import { CONFIGURACION_VACIA, type ConfiguracionEvento } from "@/lib/configuracion";
import type {
  AlumnoPadron,
  Asistencia,
  CasoSoporte,
  Dia,
  EstadoEvidencia,
  EstadoPago,
  Evidencia,
  Participante,
  Taller,
  TallerBase,
  UsuarioInterno,
} from "@/dominio/tipos";
import {
  estadoDePagos,
  indexarPagos,
  pagosIniciales,
  type Concepto,
  type PagoRegistrado,
} from "@/lib/pagos-logica";
import {
  asistenciaDe,
  estaDentro,
  evaluarEscaneo,
  type ResultadoEscaneo,
  type SesionCaptura,
} from "@/lib/escaneo";
import { fechaHora, hora as horaActual } from "@/lib/formato";
import { guardarCola, leerCola } from "@/lib/cola-pendientes";
import { aplicarRevisiones } from "@/lib/revision";

/**
 * Acceso a la capa de datos, cargada bajo demanda.
 *
 * `@/lib/datos` arrastra el SDK de Supabase. Importarlo de forma estática metía
 * ese peso en el paquete que descarga **cualquier** visitante, incluido el
 * alumno que solo abre su QR desde el teléfono y nunca escribe en la base. Con
 * el import dinámico, el SDK se descarga la primera vez que hace falta y solo
 * si hay base configurada.
 *
 * Además reúne en un sitio el patrón que estaba copiado cuatro veces —escribir
 * sin esperar y registrar el fallo en consola—, que es la forma correcta aquí:
 * la pantalla ya se actualizó de manera optimista y la escritura no debe
 * bloquear a quien está atendiendo una fila.
 */
type ModuloDatos = typeof import("@/lib/datos");

/**
 * Campo de la configuración -> columna de su tabla.
 *
 * Era una escalera de ocho `if (patch.x !== undefined)` idénticos salvo por el
 * nombre. Como dato en una tabla, añadir un campo es una línea y no hay ninguna
 * rama que leer: la correspondencia se ve de un vistazo y no puede
 * desincronizarse a mitad de la escalera.
 *
 * Solo están los campos planos. Los días y el catálogo académico viven en
 * tablas aparte y se editan por su cuenta.
 */
const COLUMNA = {
  nombre: "nombre",
  subtitulo: "subtitulo",
  fechas: "fechas",
  cuotaEvento: "cuota_evento",
  horasValidacion: "horas_validacion",
  dominioInstitucional: "dominio_institucional",
  correoSoporte: "correo_soporte",
  whatsappSoporte: "whatsapp_soporte",
} as const satisfies Partial<Record<keyof ConfiguracionEvento, string>>;

/** Sin dominio configurado es cadena vacía en la app y NULL en la tabla. */
const valorDeColumna = (campo: string, valor: unknown) =>
  campo === "dominioInstitucional" ? valor || null : valor;

function columnasDeConfiguracion(patch: Partial<ConfiguracionEvento>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([campo, valor]) => valor !== undefined && campo in COLUMNA)
      .map(([campo, valor]) => [
        COLUMNA[campo as keyof typeof COLUMNA],
        valorDeColumna(campo, valor),
      ]),
  );
}

/**
 * Avisa en pantalla de una escritura que la base rechazó.
 *
 * Se importa el aviso al vuelo en vez de arriba porque este módulo lo cargan
 * todas las pantallas, incluidas las del participante en el teléfono, y una
 * escritura fallida es la excepción: no vale la pena que el paquete de la
 * portada arrastre la librería de avisos por un caso que casi nunca ocurre.
 */
function avisarFallo(mensaje: string): void {
  void import("sonner").then(({ toast }) => toast.error(mensaje));
}

function escribir(
  descripcion: string,
  accion: (datos: ModuloDatos) => Promise<unknown>,
  /** Se llama si la base rechazó la escritura, para poder deshacer lo pintado. */
  alFallar?: (e: unknown) => void,
): void {
  if (!hayBaseDeDatos) return;
  void import("@/lib/datos").then(accion).catch((e: unknown) => {
    console.error(`No se pudo guardar ${descripcion}`, e);
    alFallar?.(e);
  });
}

/**
 * Estado del evento durante la sesión del prototipo: pagos registrados en
 * ventanilla y asistencias capturadas en la puerta.
 *
 * Está unificado a propósito. Los módulos se tocan: al registrar un pago en
 * Servicios Financieros, el portal de esa persona debe mostrar su QR y el
 * escáner debe dejarla pasar en verde. Si cada pantalla leyera los mocks por su
 * cuenta, esa cadena se rompería justo en la unión entre módulos, que es
 * precisamente lo que el prototipo tiene que demostrar.
 *
 * Todo vive en memoria: al recargar se reinicia.
 */

export interface EscaneoHistorial {
  id: string;
  resultado: ResultadoEscaneo;
  sesion: SesionCaptura;
  hora: string;
  /** La asistencia que generó, si la generó. */
  asistencia?: Asistencia | undefined;
  /** Quedó en cola porque no había conexión. */
  pendiente: boolean;
}

/** Una línea de la bitácora: lo sembrado en los mocks más lo de esta sesión. */
export interface EntradaBitacora {
  id: string;
  fecha: string;
  usuario: string;
  accion: string;
  detalle: string;
  /** Las de la sesión se distinguen de las históricas. */
  deLaSesion?: boolean | undefined;
}

/**
 * Reloj simulado del evento.
 *
 * El prototipo no corre el día del evento, así que el dashboard y el monitoreo
 * necesitan poder situarse: sin esto el ritmo sale en 0.3 por minuto y la
 * pantalla no transmite lo que se verá con 700 personas entrando en una hora.
 */
export interface RelojEvento {
  dia: Dia;
  /** Minutos desde medianoche. */
  minutos: number;
  /**
   * Sigue la hora real, en vez de la que alguien dejó puesta con el deslizador.
   *
   * Encendido es lo normal, y es lo que hace falta el dia del evento: el ritmo
   * de entrada se calcula contra esta hora, así que una hora congelada da un
   * ritmo falso —y más falso cuanto más avanza la jornada—. Se apaga solo
   * cuando alguien mueve el control a mano, para ensayar.
   */
  automatico: boolean;
}

/** Decisión de revisión tomada en esta sesión sobre una evidencia. */
export interface RevisionSesion {
  estado: Extract<EstadoEvidencia, "aprobada" | "rechazada">;
  motivo?: string | undefined;
  revisor: string;
  en: string;
}

interface Ctx {
  // --- Pagos ---
  pagos: PagoRegistrado[];
  /** Estado de pago efectivo, con los pagos de la sesión aplicados. */
  estadoDe: (p: Participante) => { evento: EstadoPago; taller: EstadoPago | undefined };
  registrarPago: (p: Omit<PagoRegistrado, "id" | "registradoEn">) => PagoRegistrado;
  registrarLote: (ps: Omit<PagoRegistrado, "id" | "registradoEn">[]) => PagoRegistrado[];

  // --- Asistencias ---
  /**
   * Anula una asistencia dejando constancia de quién y por qué. No se borra el
   * hecho de que ocurrió: se marca como anulada y sale de los cálculos, que es
   * lo que hace falta cuando alguien cambia de día y su entrada del día viejo ya
   * no corresponde. Borrarla sin más dejaría la bitácora sin explicación.
   */
  anularAsistencia: (id: string, motivo: string, usuario?: string) => void;

  /** Asistencias de los mocks más las capturadas y ya sincronizadas. */
  asistencias: Asistencia[];
  asistenciasDe: (folio: string, dia?: Dia) => Asistencia[];

  // --- Captura ---
  sesion: SesionCaptura;
  setSesion: (s: Partial<SesionCaptura>) => void;
  historial: EscaneoHistorial[];
  /** Evalúa y, si procede, registra. Es síncrono: en la puerta no se espera. */
  /**
   * Evalúa un escaneo y lo registra si procede.
   *
   * Es asíncrona porque, con conexión, quien decide es la base: el motor local
   * solo ve lo que este teléfono tiene cargado, y en la puerta eso significa que
   * un folio escaneado hace diez segundos en OTRO punto le sale verde. Ese es el
   * error caro —dejar pasar dos veces—, y ninguna cantidad de rapidez lo
   * compensa.
   *
   * Sin conexión decide el motor local, que es para lo que existe.
   */
  escanear: (
    entrada: string,
    opciones?: { autorizado?: boolean; nota?: string; autorizadoPor?: string },
  ) => Promise<ResultadoEscaneo>;
  deshacerUltimo: () => EscaneoHistorial | undefined;
  /** Cierra el día: salida automática a quien entró y no salió. */
  ejecutarCierreAutomatico: (dia: Dia) => number;
  /** Quita una asistencia concreta. Lo usa el pase de lista para desmarcar. */
  quitarAsistencia: (id: string) => void;

  // --- Revisión de evidencias ---
  /** Evidencias con las decisiones de esta sesión ya aplicadas. */
  evidencias: Evidencia[];
  revisiones: Record<string, RevisionSesion>;
  revisarEvidencia: (
    id: string,
    estado: RevisionSesion["estado"],
    revisor: string,
    motivo?: string,
  ) => void;
  /** Deshace la última decisión de revisión y devuelve el id afectado. */
  deshacerRevision: () => string | undefined;

  // --- Configuración del evento ---
  /**
   * Si es cierto, lo que se ve viene de Supabase. Si es falso, son los datos
   * simulados: o no hay base configurada, o la carga falló. Las pantallas no
   * cambian por esto, pero quien revisa necesita poder distinguirlo.
   */
  conectado: boolean;
  cargandoDatos: boolean;
  /** El canal de cambios está escuchando de verdad, no solo intentándolo. */
  enVivo: boolean;
  /** Cuándo terminó la última carga, en milisegundos, o null si aún no hubo. */
  cargadoEn: number | null;
  /** Vuelve a pedirlo todo a la base. La pantalla trabaja con una foto y esta
   *  es la forma de renovarla sin recargar el navegador. */
  recargar: () => void;

  configuracion: ConfiguracionEvento;
  actualizarConfiguracion: (patch: Partial<ConfiguracionEvento>) => void;
  /**
   * El día tal como está configurado ahora. Existe aquí y no en el mock porque
   * administración puede cambiar la fecha y la sede de un día, y una pantalla
   * que lea el mock seguiría mostrando la sede vieja.
   */
  infoDia: (dia: Dia) => ConfiguracionEvento["dias"][number];
  /** Los puntos de captura de ese día. Nunca vacío: cae al respaldo. */
  puntosDelDia: (dia: Dia) => string[];

  // --- Catálogo de talleres ---
  /** Talleres con el cupo ocupado ya calculado; `cupoOcupado` nunca se edita a mano. */
  talleres: Taller[];
  getTaller: (id?: string) => Taller | undefined;
  guardarTaller: (t: TallerBase) => void;
  /** Libera la inscripción de quienes quedaron con un taller fuera de su día. */
  liberarInscripcionesFueraDeDia: (tallerId: string) => number;
  eliminarTaller: (id: string) => void;

  // --- Usuarios internos ---
  usuarios: UsuarioInterno[];
  guardarUsuario: (u: UsuarioInterno) => void;
  eliminarUsuario: (id: string) => void;

  // --- Casos de soporte ---
  casos: CasoSoporte[];
  cambiarEstadoCaso: (id: string, estado: CasoSoporte["estado"], atiende?: string) => void;
  /**
   * Abre un caso desde el panel. Devuelve el creado, con la clave que puso la
   * base. Es `async` a propósito: ver `abrirCaso`.
   */
  abrirCaso: (datos: {
    folio: string;
    nombre: string;
    asunto: string;
    detalle: string;
    canal: CasoSoporte["canal"];
  }) => Promise<CasoSoporte>;
  /**
   * Escribe el nombre correcto de un participante. Es lo que cierra la cadena
   * del nombre mal escrito: sin esto, resolver el caso solo quitaba la marca.
   */
  corregirNombre: (folio: string, nombre: string) => void;
  /** Corrige el contenido de un caso. El estado va aparte, por `cambiarEstadoCaso`. */
  editarCaso: (id: string, cambios: Pick<CasoSoporte, "asunto" | "detalle" | "canal">) => void;
  /**
   * Abre el caso de un nombre mal escrito con la corrección que dio el propio
   * alumno. Antes, marcar «mi nombre aparece incorrecto» solo dejaba una marca:
   * nada llegaba a soporte salvo que la persona escribiera por WhatsApp.
   */
  abrirCasoNombre: (datos: {
    folio: string;
    nombre: string;
    nombreCorrecto: string;
  }) => CasoSoporte;
  /** ¿Ese participante tiene un caso de nombre sin resolver? */
  casoDeNombreAbierto: (folio: string) => CasoSoporte | undefined;

  // --- Avisos para el participante ---
  /**
   * Cosas que le pasaron a su registro y tiene que saber, sin que nadie se las
   * envíe: se las encuentra en su portal. Hoy solo se usa para la inscripción
   * que se libera al cambiar de día, que era el caso en el que el participante
   * se quedaba sin taller y sin explicación.
   */
  avisosDe: (folio: string) => string[];
  descartarAvisos: (folio: string) => void;

  // --- Participantes ---
  /** Participantes con los cambios de la sesión aplicados (día, sede, taller). */
  participantes: Participante[];
  getParticipante: (folio: string) => Participante | undefined;

  // --- Padrón ---
  padron: AlumnoPadron[];
  /**
   * Aplica filas al padrón y propaga el cambio de día a los participantes.
   * Devuelve qué se movió, para poder decírselo a quien opera.
   */
  // --- Reparto de días ---
  /**
   * Cuántos alumnos hay en cada día, y cuántos siguen sin asignar. El día no lo
   * entrega Servicios Escolares: lo reparte la organización, y este es el
   * tablero desde el que se hace.
   */
  repartoPorDia: () => { dia: Dia; total: number }[];
  /** Los del padrón que todavía no tienen día. */
  sinDiaAsignado: () => AlumnoPadron[];
  /**
   * Reparte día a quienes no lo tienen, equilibrando los tres. Devuelve cuántos
   * quedaron en cada uno.
   */
  repartirDiasPendientes: () => { asignados: number; porDia: { dia: Dia; total: number }[] };
  /**
   * El día de alguien del padrón. Si la organización todavía no lo repartió, se
   * le asigna aquí mismo el que va más vacío: nadie debería quedarse sin poder
   * pre-registrarse porque una tarea interna no se hizo.
   */
  diaDe: (matricula: string) => Dia;
  /**
   * Mueve a alguien a otro día con todo lo que eso arrastra: su sede, y su
   * inscripción al taller si ese taller no se imparte el día nuevo.
   */
  reasignarDia: (
    matricula: string,
    dia: Dia,
  ) => { movido: boolean; tallerLiberado?: string | undefined };
  /**
   * Asigna un día a un conjunto entero: la sede de Huehuetla, un grupo, los que
   * queden de un programa. Es como se reparte de verdad —una sede viaja junta,
   * no se parte en tres días— y devuelve a cuántos movió y a cuántos les liberó
   * el taller.
   */
  asignarDiaAVarios: (
    matriculas: string[],
    dia: Dia,
  ) => { movidos: number; talleresLiberados: number };

  /**
   * Guarda el padrón en la base y dice qué aceptó y qué no.
   *
   * Separada de `aplicarPadron` —que actualiza la pantalla— porque escribir
   * puede rechazar filas por motivos que solo la base conoce: un programa que no
   * está en el catálogo, un plantel con otro nombre. Quien importa tiene que
   * verlos, no encontrarlos en la consola.
   */
  guardarPadron: (filas: AlumnoPadron[]) => Promise<{
    guardados: number;
    rechazados: { matricula: string; motivo: string }[];
  }>;
  sedes: string[];
  aplicarPadron: (filas: AlumnoPadron[]) => {
    registros: number;
    altas: number;
    actualizaciones: number;
    /** Altas que quedaron esperando a que se les asigne día. */
    sinDia: number;
  };

  // --- Bitácora ---
  bitacora: EntradaBitacora[];
  registrarBitacora: (accion: string, detalle: string, usuario?: string) => void;
  usuarioActual: string;

  // --- Reloj simulado ---
  reloj: RelojEvento;
  setReloj: (r: Partial<RelojEvento>) => void;

  // --- Conexión ---
  enLinea: boolean;
  alternarConexion: () => void;
  pendientes: number;
}

const EstadoEventoCtx = createContext<Ctx | null>(null);

/*
 * El respaldo, para cuando un día todavía no tiene sus puntos configurados.
 *
 * Los de verdad viven en la base, por día, porque no es el mismo sitio: el salón
 * SUTERM recibe los días 1 y 2 y el 3 es en otra sede. Se llenan en
 * /admin/configuracion.
 *
 * Un punto es un LUGAR, no una persona. Varios capturistas en la misma puerta
 * comparten punto y se distinguen igual, porque cada asistencia guarda quién la
 * capturó (`asistencias.capturista_id`). Por eso la lista es corta: SUTERM tiene
 * una sola puerta a la calle, y llamarla de cuatro maneras distintas para que
 * hubiera un nombre por capturista habría inventado cuatro lugares que no
 * existen.
 *
 * La mesa de incidencias sí es un punto aparte, porque sí es otro lugar: ahí se
 * registra la entrada de quien salió en rojo y resultó estar bien. Sin ella, ese
 * caso se resuelve mandándolo de vuelta a formarse a la puerta.
 */
const PUNTOS_POR_DEFECTO = ["Acceso principal", "Mesa de incidencias", "Registro Taller"];
export const PUNTOS_CAPTURA = PUNTOS_POR_DEFECTO;

/**
 * @param inicial Lo público, ya resuelto en el servidor.
 *
 * Sin esto la primera pintura salía con la configuración vacía y el nombre del
 * evento aparecía un instante después, cuando respondía la consulta del cliente.
 * El parpadeo se nota especialmente en la portada, donde el título ES la
 * pantalla.
 */
export function EstadoEventoProvider({
  children,
  inicial,
}: {
  children: ReactNode;
  inicial?: Publico | null;
}) {
  /*
   * Los pagos llegan de dos sitios y hay que distinguirlos.
   *
   * `pagosBase` son los que ya estaban registrados en la base; `pagosSesion`,
   * los que se capturan aquí y ahora. Antes solo existían los segundos, así que
   * ventanilla abría cada mañana como si nadie hubiera pagado nunca: quien
   * depositó ayer aparecía en `pre_registrado` y el escáner de la puerta lo
   * detenía en rojo.
   *
   * El orden de la concatenación es la regla: `estadoDePagos` recorre la lista
   * al revés y se queda con la primera coincidencia, de modo que lo capturado
   * en esta sesión pesa más que lo que se leyó al entrar. Es lo correcto
   * mientras la escritura sea optimista —la pantalla se adelanta a la base—,
   * porque si no, un cobro recién hecho parpadearía de vuelta a «sin pagar».
   */
  const [pagosBase, setPagosBase] = useState<PagoRegistrado[]>([]);
  const [pagosSesion, setPagosSesion] = useState<PagoRegistrado[]>(() => pagosIniciales());
  const pagos = useMemo<PagoRegistrado[]>(
    () => [...pagosBase, ...pagosSesion],
    [pagosBase, pagosSesion],
  );
  const [contadorPagos, setContadorPagos] = useState(0);

  const [capturadas, setCapturadas] = useState<Asistencia[]>([]);
  // La cola arranca de lo que quedó guardado: es lo único que sobrevive a una recarga.
  const [enCola, setEnCola] = useState<Asistencia[]>(() => leerCola());
  const [revisiones, setRevisiones] = useState<Record<string, RevisionSesion>>({});
  const [ordenRevision, setOrdenRevision] = useState<string[]>([]);
  const [historial, setHistorial] = useState<EscaneoHistorial[]>([]);
  const [contadorEscaneos, setContadorEscaneos] = useState(0);

  /*
   * Todo arranca vacío y lo llena la base.
   *
   * Antes arrancaba con datos de ejemplo, y eso hacía invisible el peor fallo
   * posible: con la base mal configurada, o sin permisos, las pantallas se veían
   * llenas y plausibles. Nadie revisa lo que parece correcto. Vacío se nota, se
   * pregunta y se arregla.
   */
  const [configuracion, setConfiguracion] = useState<ConfiguracionEvento>(
    inicial?.configuracion ?? CONFIGURACION_VACIA,
  );

  const [avisos, setAvisos] = useState<Record<string, string[]>>({});
  const agregarAviso = useCallback((folio: string, texto: string) => {
    setAvisos((prev) => ({ ...prev, [folio]: [...(prev[folio] ?? []), texto] }));
  }, []);
  const avisosDe = useCallback<Ctx["avisosDe"]>((folio) => avisos[folio] ?? [], [avisos]);
  const descartarAvisos = useCallback<Ctx["descartarAvisos"]>((folio) => {
    setAvisos((prev) => {
      const copia = { ...prev };
      delete copia[folio];
      return copia;
    });
  }, []);

  const infoDia = useCallback<Ctx["infoDia"]>(
    (dia) => configuracion.dias.find((d) => d.dia === dia) ?? configuracion.dias[0]!,
    [configuracion.dias],
  );

  /**
   * Los puntos de captura de ese día, con el nombre real de esa sede.
   *
   * Si el día no los tiene configurados se cae al respaldo en vez de devolver
   * una lista vacía: quedarse sin ningún punto que elegir dejaría al capturista
   * sin poder abrir sesión, y eso es peor que un nombre genérico.
   */
  const puntosDelDia = useCallback<Ctx["puntosDelDia"]>(
    (dia) => {
      const suyos = infoDia(dia).puntos;
      return suyos.length > 0 ? suyos : PUNTOS_POR_DEFECTO;
    },
    [infoDia],
  );
  const [talleresBase, setTalleresBase] = useState<TallerBase[]>(inicial?.talleresBase ?? []);
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [casos, setCasos] = useState<CasoSoporte[]>([]);
  const [padron, setPadron] = useState<AlumnoPadron[]>([]);
  // Estas tres se leían directamente del módulo de datos simulados. Ahora son
  // estado para que la carga desde Supabase pueda sustituirlas sin que ninguna
  // pantalla se entere: siguen siendo arreglos, no promesas.
  const [participantesBase, setParticipantesBase] = useState<Participante[]>([]);
  const [asistenciasBase, setAsistenciasBase] = useState<Asistencia[]>([]);
  const [evidenciasBase, setEvidenciasBase] = useState<Evidencia[]>([]);
  /** De la clave corta del taller a su uuid, para poder escribir en la base. */
  const [idPorClave, setIdPorClave] = useState<Record<string, string>>(inicial?.idPorClave ?? {});
  // Las sedes donde estudian los alumnos. Se usan para validar el padrón al
  // importar, antes de aplicarlo y no después.
  const [sedes, setSedes] = useState<string[]>(inicial?.sedes ?? []);
  const [conectado, setConectado] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(hayBaseDeDatos);

  /*
   * Quién está dentro. La carga tiene que esperarlo y repetirse cuando cambia:
   * las tablas del personal se piden con la credencial de quien pregunta.
   */
  const { persona, cargando: cargandoSesion } = useSesion();
  const personaId = persona?.id ?? null;

  /**
   * Carga desde Supabase. Si no hay base configurada, o si la carga falla, se
   * queda con lo que ya hubiera: un prototipo que se cae en blanco porque falta
   * una llave no le sirve a quien iba a revisar pantallas.
   *
   * **Depende de la sesión, y esa dependencia es el punto.** Antes corría una
   * sola vez al montar, con la lista de dependencias vacía. En ese instante
   * Supabase todavía no ha restaurado el token —lo lee de `localStorage` de
   * forma asíncrona—, así que las consultas del personal salían sin credencial
   * y PostgREST las respondía con 401 antes de evaluar ninguna política. El
   * fallo se traga a propósito, porque un visitante anónimo no debe quedarse
   * sin la configuración pública por eso. El resultado era que Servicios
   * Financieros abría con cero participantes y la búsqueda por folio no
   * encontraba a nadie: estaba filtrando un arreglo vacío, no fallando.
   *
   * Volver a pedir al cambiar de persona también vacía la lista al salir, que
   * es lo correcto: los datos de la fila no deben sobrevivir al cierre de
   * sesión en la memoria del navegador.
   */
  /** Cuándo terminó la última carga, en milisegundos. Para poder decirlo. */
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);

  /**
   * @param silencioso No enciende el indicador de carga.
   *
   * Lo usan las recargas que nadie pidió —la escucha en vivo y el regreso a la
   * pestaña—. Sin esto, cada cambio ajeno cambiaría la tabla de la ventanilla
   * por un esqueleto durante medio segundo, y con varias ventanillas cobrando
   * a la vez eso es la pantalla parpadeando sola toda la jornada. La recarga
   * que sí pidió alguien conserva su indicador, porque ahí la espera se
   * entiende: la pulsó.
   */
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!hayBaseDeDatos || cargandoSesion) return;
      if (!silencioso) setCargandoDatos(true);
      try {
        const m = await import("@/lib/datos");
        // El público se cachea 30 segundos dentro de `cargarPublico`; al recargar
        // a mano hay que olvidarlo o la configuración recién cambiada no llega.
        m.olvidarPublico();
        const datos = await m.cargarTodo(personaId !== null);
        if (!datos) return;
        setConfiguracion(datos.configuracion);
        setTalleresBase(datos.talleresBase);
        setIdPorClave(datos.idPorClave);
        setSedes(datos.sedes);
        setParticipantesBase(datos.participantes);
        setPagosBase(datos.pagos);
        /*
         * De los pagos de la sesión se descartan los que ya volvieron de la base,
         * y solo esos.
         *
         * Conservarlos todos los contaría DOS VECES en los totales de
         * conciliación. Pero vaciarlos todos —que es lo que se hacía— rompe con
         * la escucha en vivo: la escritura es optimista, así que entre pintar el
         * cobro y confirmarlo hay un hueco, y en ese hueco el cambio de OTRA
         * ventanilla dispara una recarga. El cobro recién hecho desaparecería de
         * la pantalla y su botón volvería a aparecer, invitando a cobrar de nuevo.
         *
         * Se emparejan por folio, concepto, monto y fecha porque la fila de la
         * base no conserva el identificador que se inventó aquí. Dos cobros que
         * coincidieran en los cuatro serían el mismo cobro repetido, que es
         * justamente lo que no debe existir.
         */
        const huella = (g: PagoRegistrado) =>
          `${g.folio}|${g.concepto}|${g.monto}|${g.fechaDeposito}`;
        const confirmados = new Set(datos.pagos.map(huella));
        setPagosSesion((prev) => prev.filter((g) => !confirmados.has(huella(g))));
        setPadron(datos.padron);
        setAsistenciasBase(datos.asistencias);
        setEvidenciasBase(datos.evidencias);
        // Las tablas del personal devuelven cero filas a quien no tiene permiso,
        // en vez de un error. Se conservan las simuladas para que las pantallas
        // internas no queden vacías cuando las mira alguien sin sesión.
        if (datos.usuarios.length) setUsuarios(datos.usuarios);
        if (datos.casos.length) setCasos(datos.casos);
        setConectado(true);
        setCargadoEn(Date.now());
      } catch (e: unknown) {
        console.error("No se pudo cargar de la base.", e);
      } finally {
        if (!silencioso) setCargandoDatos(false);
      }
    },
    [cargandoSesion, personaId],
  );

  const recargar = useCallback(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /*
   * La escucha en vivo.
   *
   * Con ella la pantalla deja de ser una foto: un pre-registro nuevo, un cobro
   * de otra ventanilla o una asistencia de la puerta llegan sin que nadie pulse
   * nada. Solo se abre con sesión de personal: el anónimo no puede leer estas
   * tablas y suscribirlo sería abrir un canal que nunca va a recibir nada.
   *
   * `cargar` está en las dependencias, y por eso la escucha se rehace al
   * cambiar de persona. Es lo correcto: el canal lleva la credencial de quien
   * lo abrió, y Realtime decide con ella qué filas entrega.
   */
  const [enVivo, setEnVivo] = useState(false);

  useEffect(() => {
    if (!hayBaseDeDatos || cargandoSesion || personaId === null) {
      setEnVivo(false);
      return;
    }
    let escucha: { cerrar: () => void } | null = null;
    let vigente = true;

    void import("@/lib/tiempo-real")
      .then((m) => m.escucharCambios(() => void cargar(true), setEnVivo))
      .then((e) => {
        // Si el efecto se limpió mientras se abría el canal, se cierra en vez de
        // quedar colgado sin nadie que lo apague.
        if (!vigente) e.cerrar();
        else escucha = e;
      })
      .catch((e: unknown) => {
        console.error("No se pudo abrir la escucha en vivo.", e);
        setEnVivo(false);
      });

    return () => {
      vigente = false;
      escucha?.cerrar();
    };
  }, [cargar, cargandoSesion, personaId]);

  /*
   * Volver a la pestaña vuelve a pedir los datos.
   *
   * Sigue haciendo falta con la escucha en vivo puesta, y no es redundante: el
   * navegador puede dormir el WebSocket de una pestaña en segundo plano, y los
   * cambios de ese rato no se reenvían al despertar. Volver al frente es
   * exactamente el momento en que hay que ponerse al día.
   */
  useEffect(() => {
    if (!hayBaseDeDatos) return;
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar(true);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [cargar]);
  /**
   * Cambios de la sesión sobre los participantes, por folio. Hoy solo los
   * produce la importación del padrón, que es la única pantalla que puede mover
   * a alguien de día.
   */
  const [ajustesParticipante, setAjustesParticipante] = useState<
    Record<string, Partial<Participante>>
  >({});
  const [bitacoraSesion, setBitacoraSesion] = useState<EntradaBitacora[]>([]);
  const [contadorBitacora, setContadorBitacora] = useState(0);
  // Arranca en la hora pico de acceso del día 1.
  /*
   * Arranca en un valor fijo y pasa a la hora real despues de montar.
   *
   * Leer `new Date()` durante el render daría una hora en el servidor y otra en
   * el navegador, y React vería dos árboles distintos al hidratar. El valor
   * inicial es el mismo en los dos lados y el efecto de abajo lo corrige.
   */
  const [reloj, setRelojState] = useState<RelojEvento>({
    dia: 1,
    minutos: 8 * 60 + 30,
    automatico: true,
  });

  /*
   * Si hay conexión de verdad, no si alguien pulsó un botón.
   *
   * Era un interruptor manual para poder enseñar el modo sin red. Eso servía
   * para revisar pantallas y no sirve en la puerta: el capturista no va a
   * pulsarlo cuando se le caiga el wifi, y el sistema seguiría creyendo que
   * puede preguntarle a la base.
   *
   * `navigator.onLine` no es infalible —dice que hay red aunque no llegue a
   * ningún sitio—, pero acierta en el caso que importa: el wifi que se cae. Lo
   * que no acierta lo cubre el `catch` del escaneo, que ante un fallo de red
   * sigue con el motor local.
   *
   * El interruptor manual se conserva para poder probar el modo sin red sin
   * tener que desconectar el aparato.
   */
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const sincronizar = () => setEnLinea(navigator.onLine);
    sincronizar();
    window.addEventListener("online", sincronizar);
    window.addEventListener("offline", sincronizar);
    return () => {
      window.removeEventListener("online", sincronizar);
      window.removeEventListener("offline", sincronizar);
    };
  }, []);
  const [sesion, setSesionState] = useState<SesionCaptura>({
    dia: 1,
    modo: "puerta",
    punto: PUNTOS_POR_DEFECTO[0]!,
    capturista: "MARIO CANTU",
  });

  // ---------------------------------------------------------------- pagos ---
  const idPago = (n: number, concepto: Concepto) =>
    `PG-${String(n).padStart(4, "0")}-${concepto === "evento" ? "EV" : "TA"}`;

  const registrarPago = useCallback<Ctx["registrarPago"]>(
    (entrada) => {
      const n = contadorPagos + 1;
      setContadorPagos(n);
      const pago: PagoRegistrado = {
        ...entrada,
        id: idPago(n, entrada.concepto),
        registradoEn: new Date().toISOString(),
      };
      setPagosSesion((prev) => [...prev, pago]);

      /*
       * Se escribe sin esperar: la pantalla ya se actualizó y la fila no puede
       * quedarse parada mirando un indicador.
       *
       * Pero si la base rechaza —una referencia duplicada que dos ventanillas
       * capturaron a la vez, un permiso que caducó—, el cobro pintado se
       * retira. Antes se quedaba puesto y solo lo delataba un error en la
       * consola que nadie tiene abierta: la ventanilla creía haber cobrado algo
       * que la base nunca guardó, y eso solo se descubría al conciliar.
       */
      escribir(
        "el pago",
        (d) =>
          d.guardarPago({
            folio: pago.folio,
            concepto: pago.concepto,
            monto: pago.monto,
            montoEsperado: pago.montoEsperado,
            referencia: pago.referencia,
            fechaDeposito: pago.fechaDeposito,
            nota: pago.nota,
          }),
        () => {
          setPagosSesion((prev) => prev.filter((g) => g.id !== pago.id));
          avisarFallo(`No se pudo guardar el pago de ${pago.folio}. Vuelve a intentarlo.`);
        },
      );

      return pago;
    },
    [contadorPagos],
  );

  const registrarLote = useCallback<Ctx["registrarLote"]>(
    (entradas) => {
      const base = contadorPagos;
      setContadorPagos(base + entradas.length);
      const nuevos = entradas.map((e, k) => ({
        ...e,
        id: idPago(base + k + 1, e.concepto),
        registradoEn: new Date().toISOString(),
      }));
      setPagosSesion((prev) => [...prev, ...nuevos]);
      /*
       * La carga masiva es la operación que más dinero mueve de una vez y era de
       * las que no se guardaban: se aplicaba un archivo con cientos de pagos, la
       * pantalla los daba por registrados y al recargar no quedaba ninguno.
       *
       * Se escriben uno por uno y no en bloque porque cada pago tiene que
       * resolver su participante por folio, y porque una referencia duplicada
       * debe rechazar esa fila sin tumbar el resto del lote.
       */
      nuevos.forEach((pago) =>
        escribir(
          `el pago de ${pago.folio}`,
          (d) =>
            d.guardarPago({
              folio: pago.folio,
              concepto: pago.concepto,
              monto: pago.monto,
              montoEsperado: pago.montoEsperado,
              referencia: pago.referencia,
              fechaDeposito: pago.fechaDeposito,
              nota: pago.nota,
            }),
          () => {
            setPagosSesion((prev) => prev.filter((g) => g.id !== pago.id));
            avisarFallo(`No se pudo guardar el pago de ${pago.folio}.`);
          },
        ),
      );
      return nuevos;
    },
    [contadorPagos],
  );

  /*
   * El índice se arma una vez por cada cambio de la lista de pagos, no una vez
   * por consulta. `estadoDe` se llama varias veces por fila en la ventanilla y
   * en el escáner, y antes cada llamada copiaba y recorría todos los pagos.
   */
  const indicePagos = useMemo(() => indexarPagos(pagos), [pagos]);
  const estadoDe = useCallback<Ctx["estadoDe"]>(
    (p) => estadoDePagos(indicePagos, p),
    [indicePagos],
  );

  // -------------------------------------------------------- participantes ---
  const participantes = useMemo<Participante[]>(
    () =>
      participantesBase.map((p) => {
        const ajuste = ajustesParticipante[p.folio];
        return ajuste ? { ...p, ...ajuste } : p;
      }),
    [participantesBase, ajustesParticipante],
  );

  /*
   * Los participantes indexados por folio.
   *
   * `getParticipante` recorría la lista entera en cada llamada, y se llama
   * mucho: por fila de la ventanilla, en cada escaneo de la puerta, al pintar
   * cada asistencia del historial. El índice se arma una vez por cambio de la
   * lista y cada búsqueda pasa a ser inmediata.
   */
  const porFolio = useMemo(() => new Map(participantes.map((p) => [p.folio, p])), [participantes]);

  const getParticipante = useCallback<Ctx["getParticipante"]>(
    (folio) => porFolio.get(folio),
    [porFolio],
  );

  // ----------------------------------------------------------- bitácora ---
  // Registra lo que pasa en la sesión, no solo lo sembrado en los mocks: sin eso
  // no se puede aclarar ninguna inconformidad, que es para lo que sirve.
  //
  // Quien firma es quien tiene la sesión abierta. Estaba fijo a un nombre de
  // ejemplo, así que en pantalla todo lo hacía siempre la misma persona sin
  // importar quién hubiera entrado. En la base ya se firmaba bien —`anotarEnBitacora`
  // toma el id de la sesión de Auth—, de modo que lo escrito y lo mostrado se
  // contradecían, y la bitácora existe justo para que eso no pase.
  const usuarioActual = persona?.nombre ?? "Sin sesión";

  const registrarBitacora = useCallback<Ctx["registrarBitacora"]>(
    (accion, detalle, usuario) => {
      setContadorBitacora((n) => {
        const siguiente = n + 1;
        setBitacoraSesion((prev) => [
          {
            id: `BS-${String(siguiente).padStart(4, "0")}`,
            fecha: fechaHora(),
            usuario: usuario ?? usuarioActual,
            accion,
            detalle,
            deLaSesion: true,
          },
          ...prev,
        ]);
        return siguiente;
      });
      /*
       * La bitácora existe para poder responder «quién hizo esto». Vivía solo en
       * memoria, así que la respuesta se perdía al recargar y el registro no
       * servía para lo único que se le pide.
       */
      escribir("la bitácora", (d) => d.anotarEnBitacora(accion, detalle, usuario));
      // `usuarioActual` va en las dependencias porque ya no es una constante: sale
      // de la sesión. Sin él, el callback se quedaría con el valor del primer
      // render —cuando todavía no había nadie dentro— y la bitácora seguiría
      // firmando como «Sin sesión» después de entrar.
    },
    [usuarioActual],
  );

  const bitacora = useMemo<EntradaBitacora[]>(() => [...bitacoraSesion], [bitacoraSesion]);

  // ---------------------------------------------------------- asistencias ---
  // Las de los mocks, más las capturadas y sincronizadas. Las que están en cola
  // todavía no cuentan como registradas: eso es lo que significa «pendiente».
  const [anuladas, setAnuladas] = useState<Record<string, string>>({});
  const asistencias = useMemo(
    () => [...asistenciasBase, ...capturadas].filter((a) => !anuladas[a.id]),
    [asistenciasBase, capturadas, anuladas],
  );

  // La cola es lo único que se guarda fuera de memoria; ver `cola-pendientes.ts`.
  useEffect(() => {
    guardarCola(enCola);
  }, [enCola]);

  const anularAsistencia = useCallback<Ctx["anularAsistencia"]>(
    (id, motivo, usuario) => {
      const a = [...asistenciasBase, ...capturadas].find((x) => x.id === id);
      setAnuladas((prev) => ({ ...prev, [id]: motivo }));
      // Se marca anulada, no se borra: un registro que desaparece no deja ver
      // que hubo una corrección, que es justo lo que alguien querría revisar.
      escribir("la anulación", (d) => d.anularAsistenciaRemota(id, motivo));
      registrarBitacora(
        "Anuló una asistencia",
        a
          ? `${a.folio} · ${a.nombre} · ${a.tipo} del día ${a.dia} a las ${a.hora} · motivo: ${motivo}`
          : `${id} · motivo: ${motivo}`,
        usuario,
      );
    },
    [capturadas, asistenciasBase, registrarBitacora],
  );

  /*
   * Las asistencias agrupadas por folio.
   *
   * `asistenciasDe` filtraba la lista entera en cada llamada, y el listado de
   * elegibles la llama dos veces por participante: con quinientos participantes
   * y mil quinientas asistencias eso era millon y medio de comparaciones cada
   * vez que se repinta la pantalla.
   */
  const porFolioAsistencias = useMemo(() => {
    const indice = new Map<string, Asistencia[]>();
    for (const a of asistencias) {
      const suyas = indice.get(a.folio);
      if (suyas) suyas.push(a);
      else indice.set(a.folio, [a]);
    }
    return indice;
  }, [asistencias]);

  const asistenciasDe = useCallback<Ctx["asistenciasDe"]>(
    (folio, dia) => {
      const suyas = porFolioAsistencias.get(folio) ?? [];
      return dia === undefined ? suyas : suyas.filter((a) => a.dia === dia);
    },
    [porFolioAsistencias],
  );

  const escanear = useCallback<Ctx["escanear"]>(
    async (entrada, opciones) => {
      const ahora = Date.now();
      // Lo que ya está en cola también cuenta para no duplicar registros.
      const conocidas = [...asistencias, ...enCola];
      let resultado = evaluarEscaneo({
        entrada,
        sesion,
        participantes,
        asistencias: conocidas,
        estadoDe,
        ahora,
        ...(opciones?.autorizado !== undefined ? { autorizado: opciones.autorizado } : {}),
      });

      /*
       * Con conexión pero SIN escucha en vivo, la base tiene la última palabra.
       *
       * El motor local acaba de decidir con lo que este teléfono conoce, y eso
       * basta para la mayoría de los casos —y es lo único que hay sin red—. Pero
       * si alguien pasó por otro punto de captura hace un momento, aquí no
       * consta: el duplicado saldría en verde.
       *
       * Con `enVivo` esa consulta sobra, y sobra cara. Sobra porque la
       * suscripción en tiempo real ya trajo el escaneo del otro punto: el motor
       * local sabe lo mismo que la base. Y es cara porque es un viaje de red POR
       * PERSONA, y por esta puerta pasan 700 en una hora, con el wifi del
       * recinto saturado justo en ese momento. Medio segundo por cabeza no se
       * pierde: se acumula en la fila.
       *
       * Una excepción autorizada no se reevalúa: el supervisor ya decidió, y
       * dejar que la base la tumbe convertiría su autorización en un trámite sin
       * efecto.
       */
      if (hayBaseDeDatos && enLinea && !enVivo && !opciones?.autorizado) {
        try {
          const { evaluarEscaneoRemoto } = await import("@/lib/datos");
          const remoto = await evaluarEscaneoRemoto(entrada.trim(), sesion.dia, sesion.modo);
          if (remoto)
            resultado = {
              ...resultado,
              color: remoto.color,
              titulo: remoto.titulo,
              // La base llama «detalle» a lo que aquí es el motivo.
              motivo: remoto.detalle,
              autorizable: remoto.autorizable,
              // Solo se registra si la base lo aprueba; si dice rojo, no se
              // guarda nada aunque el motor local hubiera dicho que sí.
              registra: remoto.color !== "rojo" && resultado.registra,
              // Un rojo remoto siempre para la fila. En lo demás manda lo que
              // decidió el motor local: si allí era un «déjalo pasar», que la
              // base lo confirme en amarillo no lo convierte en un caso que
              // atender.
              detiene: remoto.color === "rojo" || resultado.detiene,
              // La dirección la decide la base, que ve los ocho puntos. Este
              // teléfono solo ve lo suyo, y es exactamente por eso que se le
              // está preguntando.
              tipo: remoto.tipo ?? resultado.tipo,
            };
        } catch {
          // La red falló en mitad del escaneo. Se sigue con lo local, que es
          // exactamente lo que se haría sin conexión: parar la fila por una
          // consulta caída sería peor que registrar y conciliar después.
        }
      }

      const n = contadorEscaneos + 1;
      setContadorEscaneos(n);
      const h = horaActual(new Date(ahora));

      let asistencia: Asistencia | undefined;
      if (resultado.registra) {
        asistencia = asistenciaDe(resultado, sesion, ahora, h, n);
        // La excepción autorizada viaja con la asistencia, no solo con el
        // historial de la sesión: es registro de auditoría.
        if (opciones?.autorizado && opciones.nota)
          asistencia = {
            ...asistencia,
            autorizacion: {
              nota: opciones.nota,
              autorizadoPor: opciones.autorizadoPor ?? sesion.capturista,
              en: fechaHora(new Date(ahora)),
            },
          };
        if (enLinea) {
          setCapturadas((prev) => [...prev, asistencia!]);
          // La asistencia se guarda sin esperar: en la puerta la respuesta tiene
          // que ser inmediata, y esperar a la red la volvería lenta justo donde
          // se forma la fila.
          escribir("la asistencia", (d) =>
            d.guardarAsistencia({
              folio: asistencia!.folio,
              dia: asistencia!.dia,
              tipo: asistencia!.tipo,
              punto: asistencia!.punto,
              autorizacionMotivo: asistencia!.autorizacion?.nota,
            }),
          );
        } else {
          setEnCola((prev) => [...prev, asistencia!]);
        }
      }

      // La asistencia es la acción más frecuente y la que más se cuestiona
      // después, porque de ella dependen las constancias. Si alguien reclama que
      // sí entró, la bitácora es donde se comprueba.
      registrarBitacora(
        asistencia ? `Registró ${asistencia.tipo}` : `Escaneo rechazado (${resultado.color})`,
        `${resultado.participante?.folio ?? resultado.entradaCruda} · ${resultado.titulo} · día ${sesion.dia} · ${sesion.punto}${
          asistencia?.autorizacion ? ` · excepción autorizada: ${asistencia.autorizacion.nota}` : ""
        }${!enLinea && asistencia ? " · pendiente de sincronizar" : ""}`,
        sesion.capturista,
      );

      setHistorial((prev) => [
        {
          id: `H-${String(n).padStart(4, "0")}`,
          resultado,
          sesion,
          hora: h,
          asistencia,
          pendiente: !!asistencia && !enLinea,
        },
        ...prev,
      ]);

      return resultado;
    },
    [
      asistencias,
      enCola,
      sesion,
      estadoDe,
      contadorEscaneos,
      enLinea,
      enVivo,
      registrarBitacora,
      participantes,
    ],
  );

  /*
   * Deshacer el último escaneo. Igual que `quitarAsistencia`, no toca la base a
   * propósito: es el «me equivoqué» inmediato del capturista sobre lo que acaba
   * de pasar por su pantalla, y esa fila puede seguir en la cola sin conexión.
   * Anular algo ya guardado es otra operación, con motivo y autor.
   */
  const deshacerUltimo = useCallback<Ctx["deshacerUltimo"]>(() => {
    const ultimo = historial[0];
    if (!ultimo) return undefined;
    setHistorial((prev) => prev.slice(1));
    if (ultimo.asistencia) {
      const id = ultimo.asistencia.id;
      setCapturadas((prev) => prev.filter((a) => a.id !== id));
      setEnCola((prev) => prev.filter((a) => a.id !== id));
    }
    return ultimo;
  }, [historial]);

  /*
   * Deshacer una captura recién hecha. NO escribe en la base a propósito.
   *
   * Es el «me equivoqué» inmediato del capturista sobre algo que acaba de pasar
   * por su pantalla, y en la base esa fila puede no existir todavía —la
   * escritura va sin esperar— o haber quedado en la cola sin conexión. Anular un
   * registro que sí está guardado es otra cosa y tiene su propia operación, con
   * motivo y autor.
   */
  const quitarAsistencia = useCallback<Ctx["quitarAsistencia"]>((id) => {
    setCapturadas((prev) => prev.filter((a) => a.id !== id));
    setEnCola((prev) => prev.filter((a) => a.id !== id));
    setHistorial((prev) => prev.filter((h) => h.asistencia?.id !== id));
  }, []);

  const ejecutarCierreAutomatico = useCallback<Ctx["ejecutarCierreAutomatico"]>(
    (dia) => {
      /*
       * Solo se cierra a quien sigue DENTRO.
       *
       * Antes se cerraba a todo el que tuviera entrada y no tuviera salida, y
       * eso tapaba justo lo que interesa saber: quien salió a las 11 y no
       * volvió ya tiene su salida registrada, así que si el cierre le pusiera
       * otra al final del horario quedaría indistinguible de quien aguantó la
       * jornada completa. Su último movimiento es una salida, y ahí se queda.
       *
       * El cierre existe para lo contrario: para los que sí están adentro
       * cuando termina el evento y se van todos a la vez sin escanear, que son
       * los que no podemos formar en la puerta.
       */
      const delDia = [...asistenciasBase, ...capturadas].filter((a) => a.dia === dia);
      const folios = [...new Set(delDia.map((a) => a.folio))];
      const dentro = folios.filter((f) => estaDentro(delDia, f, dia));
      if (dentro.length === 0) return 0;

      const cierres: Asistencia[] = dentro.map((folio, k) => {
        const p = participantes.find((x) => x.folio === folio);
        return {
          id: `AS-CIERRE-D${dia}-${folio}`,
          folio,
          nombre: p?.nombre ?? folio,
          dia,
          tipo: "salida",
          // La hora del cierre sale del horario configurado del evento. Si aún
          // no hay configuración, se deja en blanco antes que inventar una hora
          // que quedaría escrita en el registro de asistencia de alguien.
          hora: configuracion.horario.split(" a ")[1]?.replace(" hrs", "").trim() ?? "",
          punto: "Cierre del sistema",
          capturista: "SISTEMA",
          cierreAutomatico: true,
          ts: Date.now() + k,
        };
      });
      setCapturadas((prev) => [...prev, ...cierres]);
      return cierres.length;
    },
    [participantes, capturadas, asistenciasBase, configuracion.horario],
  );

  // ------------------------------------------------ revisión de evidencias ---
  const evidencias = useMemo<Evidencia[]>(
    () => aplicarRevisiones(evidenciasBase, revisiones),
    [evidenciasBase, revisiones],
  );

  const revisarEvidencia = useCallback<Ctx["revisarEvidencia"]>((id, estado, revisor, motivo) => {
    setRevisiones((prev) => ({
      ...prev,
      [id]: { estado, revisor, en: fechaHora(), ...(motivo ? { motivo } : {}) },
    }));
    setOrdenRevision((prev) => [...prev.filter((x) => x !== id), id]);
    // Un disparador de la base pone el estado de la evidencia a partir de esta
    // fila, así que no hace falta actualizarla aparte: la decisión y su efecto
    // no pueden separarse.
    escribir("la revisión", (d) => d.guardarRevision(id, estado, motivo));
  }, []);

  const deshacerRevision = useCallback<Ctx["deshacerRevision"]>(() => {
    const id = ordenRevision[ordenRevision.length - 1];
    if (!id) return undefined;
    setOrdenRevision((prev) => prev.slice(0, -1));
    setRevisiones((prev) => {
      const copia = { ...prev };
      delete copia[id];
      return copia;
    });
    escribir("el deshacer de la revisión", (d) => d.deshacerRevisionRemota(id));
    return id;
  }, [ordenRevision]);

  // ------------------------------------------------------- configuración ---
  const actualizarConfiguracion = useCallback<Ctx["actualizarConfiguracion"]>((patch) => {
    setConfiguracion((prev) => ({ ...prev, ...patch }));
    const columnas = columnasDeConfiguracion(patch);
    if (Object.keys(columnas).length)
      escribir("la configuración", (d) =>
        d.guardarConfiguracion(columnas).then(() => d.olvidarPublico()),
      );

    // Los días tienen tabla propia y por eso no entran en `columnasDeConfiguracion`.
    // Editarlos no salía de la pantalla: el cambio se veía, se recargaba y volvía lo
    // de antes. Con la fecha y el lugar era un defecto discreto; con los puntos de
    // captura es uno que se descubre el día del evento. Se guardan los tres, que es
    // más barato que averiguar cuál cambió.
    const dias = patch.dias;
    if (dias)
      escribir(
        "los días del evento",
        (d) => Promise.all(dias.map((x) => d.guardarDia(x))).then(() => d.olvidarPublico()),
        () => avisarFallo("No se pudieron guardar los días del evento."),
      );
  }, []);

  // ------------------------------------------------------------ talleres ---
  /*
   * `cupoOcupado` es derivado: nunca se escribe a mano.
   *
   * Se cuenta en UNA pasada por los participantes, no una por taller. Antes
   * cada taller filtraba la lista completa, así que el coste era el producto de
   * los dos: con diez talleres y quinientos participantes, cinco mil
   * comparaciones cada vez que alguien se registra o cambia de día.
   */
  const talleres = useMemo<Taller[]>(() => {
    const inscritos = new Map<string, number>();
    for (const p of participantes)
      if (p.tallerId) inscritos.set(p.tallerId, (inscritos.get(p.tallerId) ?? 0) + 1);
    return talleresBase.map(({ ocupadosPrevios, ...t }) => ({
      ...t,
      cupoOcupado: ocupadosPrevios + (inscritos.get(t.id) ?? 0),
    }));
  }, [talleresBase, participantes]);

  const getTaller = useCallback<Ctx["getTaller"]>(
    (id) => talleres.find((t) => t.id === id),
    [talleres],
  );

  const guardarTaller = useCallback<Ctx["guardarTaller"]>((t) => {
    setTalleresBase((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      return prev.map((x) => (x.id === t.id ? t : x));
    });
    // `TallerBase.id` ES la clave corta (`T01`), no el uuid de la base: así lo
    // arma `aTallerBase` y así lo llama el personal. Se pasa con su nombre para
    // que la frontera con la base no vuelva a confundir una cosa con la otra.
    escribir(
      "el taller",
      (d) => d.guardarTallerRemoto({ ...t, clave: t.id }).then(() => d.olvidarPublico()),
      () => avisarFallo(`No se pudo guardar el taller ${t.id}. Vuelve a intentarlo.`),
    );
  }, []);

  /**
   * Cambiar los días de un taller puede dejar inscritos en días que ya no se
   * imparten, lo que rompería `taller-vs-dia`. Esto los libera y devuelve
   * cuántos, para poder decírselo a quien edita.
   */
  const liberarInscripcionesFueraDeDia = useCallback<Ctx["liberarInscripcionesFueraDeDia"]>(
    (tallerId) => {
      const t = talleresBase.find((x) => x.id === tallerId);
      if (!t) return 0;
      const afectados = participantes.filter(
        (p) => p.tallerId === tallerId && !t.dias.includes(p.dia),
      );
      if (afectados.length === 0) return 0;
      for (const p of afectados)
        agregarAviso(
          p.folio,
          `Tu inscripción al taller «${t.nombre}» se liberó porque ese taller ya no se imparte el día ${p.dia}. Si pagaste el taller, acude a Servicios Financieros.`,
        );
      setAjustesParticipante((prev) => {
        const copia = { ...prev };
        for (const p of afectados)
          copia[p.folio] = {
            ...(copia[p.folio] ?? {}),
            tallerId: undefined,
            estadoPagoTaller: undefined,
            montoEsperadoTaller: undefined,
          };
        return copia;
      });
      return afectados.length;
    },
    [talleresBase, participantes, agregarAviso],
  );

  const eliminarTaller = useCallback<Ctx["eliminarTaller"]>((id) => {
    setTalleresBase((prev) => prev.filter((t) => t.id !== id));
    escribir(
      "el retiro del taller",
      (d) => d.eliminarTallerRemoto(id).then(() => d.olvidarPublico()),
      () => avisarFallo(`No se pudo retirar el taller ${id}.`),
    );
  }, []);

  // ------------------------------------------------------------ usuarios ---
  const guardarUsuario = useCallback<Ctx["guardarUsuario"]>((u) => {
    setUsuarios((prev) => {
      const i = prev.findIndex((x) => x.id === u.id);
      if (i === -1) return [...prev, u];
      return prev.map((x) => (x.id === u.id ? u : x));
    });
    escribir("el usuario", (d) => d.guardarUsuarioRemoto({ ...u, rol: rolHaciaBase(u.rol) }));
  }, []);

  const eliminarUsuario = useCallback<Ctx["eliminarUsuario"]>((id) => {
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
    // Desactiva, no borra: sin la fila, cada entrada de bitácora que esa persona
    // firmó se quedaría sin autor.
    escribir("la baja del usuario", (d) => d.desactivarUsuarioRemoto(id));
  }, []);

  // ------------------------------------------------------------- soporte ---
  const abrirCasoNombre = useCallback<Ctx["abrirCasoNombre"]>(
    ({ folio, nombre, nombreCorrecto }) => {
      const caso: CasoSoporte = {
        id: `CS-${String(casos.length + 1).padStart(3, "0")}`,
        folio,
        nombre,
        asunto: "Nombre incorrecto en el registro",
        detalle: `Dice "${nombre}" y debe decir "${nombreCorrecto}". Lo reportó el alumno al confirmar su nombre.`,
        estado: "abierto",
        // El mismo canal con el que lo va a guardar `fn_abrir_caso_nombre`.
        // Decía «ventanilla», así que la fila que se pintaba al vuelo no
        // coincidía con la que después devolvía la base.
        canal: "portal",
        creadoEn: fechaHora(),
      };
      /*
       * El caso se muestra ya para que soporte lo vea, pero se GUARDA al crear
       * el participante, en `/talleres`: `casos_soporte.participante_id` es
       * obligatorio y aquí esa persona todavía no existe en la base.
       */
      setCasos((prev) => [caso, ...prev]);
      registrarBitacora(
        "Abrió un caso de nombre",
        `${folio} · ${caso.detalle}`,
        "Pre-registro en línea",
      );
      return caso;
    },
    [casos, registrarBitacora],
  );

  const cambiarEstadoCaso = useCallback<Ctx["cambiarEstadoCaso"]>((id, estado, atiende) => {
    // Se guarda cómo estaba para poder devolverlo si la base rechaza. Sin esto,
    // un caso que no llegó a cambiar se queda en pantalla como si sí, y la
    // siguiente persona que lo mire lo dará por atendido.
    let previo: CasoSoporte | undefined;
    setCasos((prev) => {
      previo = prev.find((c) => c.id === id);
      return prev.map((c) => (c.id === id ? { ...c, estado, ...(atiende ? { atiende } : {}) } : c));
    });

    /*
     * Y ahora sí se guarda.
     *
     * Esto no estaba: cambiar un caso a «en proceso» o «resuelto» solo movía la
     * lista en memoria, así que al recargar volvía a estar abierto. Era todo el
     * módulo de soporte, porque cambiar de estado es lo único que hace.
     *
     * Va por clave —`CS-001`—, que es lo que `aCaso` pone en `id`. Escribirlo
     * como si fuera el uuid daba `22P02: invalid input syntax for type uuid`.
     */
    escribir(
      "el estado del caso",
      (d) => d.cambiarEstadoCasoRemoto(id, estado),
      () => {
        if (previo) setCasos((prev) => prev.map((c) => (c.id === id ? previo! : c)));
        avisarFallo(`No se pudo guardar el cambio del caso ${id}. Sigue como estaba.`);
      },
    );
  }, []);

  /**
   * Abre un caso desde el panel de soporte.
   *
   * Es la única escritura del contexto que **espera** a la base, en vez de
   * pintar primero y guardar después. La clave `CS-004` la genera una secuencia
   * de la base, y no hay forma honesta de adivinarla aquí: inventarla chocaría
   * con la que reciba el siguiente caso. Y a diferencia de un escaneo en la
   * puerta, quien llena este formulario puede esperar.
   */
  const abrirCaso = useCallback<Ctx["abrirCaso"]>(
    async (datos) => {
      let clave = `CS-${String(casos.length + 1).padStart(3, "0")}`;
      let creadoEn = fechaHora();
      if (hayBaseDeDatos) {
        const d = await import("@/lib/datos");
        const creado = await d.abrirCasoRemoto(datos);
        clave = creado.clave;
        creadoEn = creado.creadoEn;
      }
      const caso: CasoSoporte = {
        id: clave,
        folio: datos.folio,
        nombre: datos.nombre,
        asunto: datos.asunto.trim(),
        detalle: datos.detalle.trim(),
        estado: "abierto",
        canal: datos.canal,
        creadoEn,
      };
      setCasos((prev) => [caso, ...prev]);
      return caso;
    },
    [casos.length],
  );

  /**
   * Corrige el nombre de un participante.
   *
   * Se apoya en `ajustesParticipante`, que ya existía para los cambios de la
   * sesión sobre alguien concreto, así que la corrección se ve al instante en
   * todas las pantallas —elegibles, ventanilla, la puerta— sin esperar a que
   * vuelva de la base.
   *
   * No toca `nombreEnRevision`: esa marca la mantiene el disparador
   * `trg_caso_marca_nombre` según los casos abiertos, y se apaga sola al
   * resolver el caso. Ponerla aquí a mano garantizaría que un día la marca y su
   * caso digan cosas distintas.
   */
  const corregirNombre = useCallback<Ctx["corregirNombre"]>((folio, nombre) => {
    const limpio = nombre.trim().replace(/\s+/g, " ").toUpperCase();
    let previo: string | undefined;
    setAjustesParticipante((prev) => {
      previo = prev[folio]?.nombre;
      return { ...prev, [folio]: { ...prev[folio], nombre: limpio } };
    });
    escribir(
      "el nombre",
      (d) => d.corregirNombreRemoto(folio, limpio),
      () => {
        setAjustesParticipante((prev) => ({
          ...prev,
          [folio]: { ...prev[folio], nombre: previo },
        }));
        avisarFallo(`No se pudo guardar el nombre de ${folio}. Sigue como estaba.`);
      },
    );
  }, []);

  /**
   * Corrige lo que dice un caso.
   *
   * Quien atiende por teléfono anota lo que le cuentan y luego lo reescribe con
   * lo que averiguó, o corrige el canal cuando el caso llegó por otra vía de la
   * que se registró. Sin esto, el detalle se quedaba con la primera versión y
   * había que resolverlo y abrir otro para poder cambiarlo.
   */
  const editarCaso = useCallback<Ctx["editarCaso"]>((id, cambios) => {
    let previo: CasoSoporte | undefined;
    setCasos((prev) => {
      previo = prev.find((c) => c.id === id);
      return prev.map((c) => (c.id === id ? { ...c, ...cambios } : c));
    });
    escribir(
      "el caso",
      (d) => d.guardarCasoRemoto(id, cambios),
      () => {
        if (previo) setCasos((prev) => prev.map((c) => (c.id === id ? previo! : c)));
        avisarFallo(`No se pudo guardar el caso ${id}. Sigue como estaba.`);
      },
    );
  }, []);

  /**
   * Un caso de nombre sin resolver es lo que marca al participante en el
   * listado de elegibles. Al cerrarlo, la marca desaparece: es la cadena que
   * une el pre-registro con la entrega de constancias.
   */
  const casoDeNombreAbierto = useCallback<Ctx["casoDeNombreAbierto"]>(
    (folio) => casos.find((c) => c.folio === folio && c.estado !== "resuelto"),
    [casos],
  );

  // -------------------------------------------------------------- padrón ---
  // --------------------------------------------------- reparto de días ---
  /**
   * Mover a alguien de día no es cambiar un número: arrastra su sede y puede
   * dejarlo inscrito en un taller que ese día no se imparte. Toda esa cadena
   * vive aquí, en una sola función, para que la use tanto el reparto masivo
   * como el cambio de una persona.
   */
  /**
   * Asigna un día a un conjunto de alumnos, con todo lo que eso arrastra.
   *
   * Es la función de fondo: mover a alguien de día no es cambiar un número,
   * cambia el lugar al que tiene que ir y puede dejarlo inscrito en un taller
   * que ese día no se imparte. Esa cadena vive en un solo sitio para que la
   * usen igual el cambio de una persona y el de una sede entera.
   *
   * Trabaja sobre el conjunto completo en una sola pasada en vez de llamarse a
   * sí misma por alumno: con dos mil matrículas, una actualización de estado
   * por cabeza recorre la lista dos mil veces y la pantalla se congela.
   */
  const asignarDiaAVarios = useCallback<Ctx["asignarDiaAVarios"]>(
    (matriculas, dia) => {
      const conjunto = new Set(matriculas);
      if (!conjunto.size) return { movidos: 0, talleresLiberados: 0 };

      setPadron((prev) => prev.map((a) => (conjunto.has(a.matricula) ? { ...a, dia } : a)));

      const lugar = infoDia(dia).lugar;
      const ajustes: Record<string, Partial<Participante>> = {};
      let talleresLiberados = 0;
      let movidos = 0;

      for (const p of participantes) {
        if (!p.matricula || !conjunto.has(p.matricula) || p.dia === dia) continue;
        movidos += 1;
        const ajuste: Partial<Participante> = { dia, lugar };
        const t = talleres.find((x) => x.id === p.tallerId);
        // Si su taller no se imparte el día nuevo, la inscripción se libera:
        // mantenerla rompería `taller-vs-dia` y lo dejaría con un pago sin a
        // qué corresponder.
        if (t && !t.dias.includes(dia)) {
          ajuste.tallerId = undefined;
          ajuste.estadoPagoTaller = undefined;
          ajuste.montoEsperadoTaller = undefined;
          talleresLiberados += 1;
          agregarAviso(
            p.folio,
            `Cambiaste al día ${dia} y el taller «${t.nombre}» no se imparte ese día, así que tu inscripción se liberó. Puedes elegir otro taller; si ya lo habías pagado, acude a Servicios Financieros.`,
          );
        }
        ajustes[p.folio] = ajuste;
      }

      if (Object.keys(ajustes).length)
        setAjustesParticipante((prev) => {
          const siguiente = { ...prev };
          for (const [folio, ajuste] of Object.entries(ajustes))
            siguiente[folio] = { ...(siguiente[folio] ?? {}), ...ajuste };
          return siguiente;
        });

      /*
       * Ahora esto mueve también al participante, no solo su fila del padrón.
       *
       * Escribir solo el padrón hacía que la pantalla se viera bien —la lista se
       * acababa de mover en memoria— mientras la base dejaba al participante en
       * su día viejo. La puerta lee `participantes.dia`, así que rechazaba por
       * DÍA EQUIVOCADO a quien acababa de ser reasignado, y al recargar el
       * cambio desaparecía porque nunca se había guardado.
       */
      escribir(
        `el día de ${conjunto.size} alumnos`,
        (d) => d.asignarDiaRemoto([...conjunto], dia),
        () =>
          avisarFallo(
            `No se pudo guardar el cambio de día. Recarga para ver cómo quedó de verdad.`,
          ),
      );
      return { movidos, talleresLiberados };
    },
    [participantes, talleres, infoDia, agregarAviso],
  );

  const reasignarDia = useCallback<Ctx["reasignarDia"]>(
    (matricula, dia) => {
      const p = participantes.find((x) => x.matricula === matricula);
      const t = talleres.find((x) => x.id === p?.tallerId);
      const r = asignarDiaAVarios([matricula], dia);
      // `movido` dice si esa persona tenía registro de participante, no si el
      // día cambió: sin registro no hay a quién avisar ni taller que liberar.
      return {
        movido: !!p,
        tallerLiberado: r.talleresLiberados > 0 ? t?.id : undefined,
      };
    },
    [participantes, talleres, asignarDiaAVarios],
  );

  const diaDe = useCallback<Ctx["diaDe"]>(
    (matricula) => {
      const a = padron.find((x) => x.matricula === matricula);
      if (a?.dia) return a.dia;
      const dia = ([1, 2, 3] as Dia[]).reduce((menor, d) =>
        padron.filter((x) => x.dia === d).length < padron.filter((x) => x.dia === menor).length
          ? d
          : menor,
      );
      setPadron((prev) => prev.map((x) => (x.matricula === matricula ? { ...x, dia } : x)));
      return dia;
    },
    [padron],
  );

  const repartoPorDia = useCallback<Ctx["repartoPorDia"]>(
    () =>
      ([1, 2, 3] as Dia[]).map((dia) => ({
        dia,
        total: padron.filter((a) => a.dia === dia).length,
      })),
    [padron],
  );

  const sinDiaAsignado = useCallback<Ctx["sinDiaAsignado"]>(
    () => padron.filter((a) => !a.dia),
    [padron],
  );

  /**
   * Se reparte al día que va más vacío, uno por uno. No se reparte al azar ni en
   * bloques: con tres sedes de aforo parecido, lo que importa es que ninguna se
   * llene mientras otra queda a medias.
   */
  const repartirDiasPendientes = useCallback<Ctx["repartirDiasPendientes"]>(() => {
    const pendientes = padron.filter((a) => !a.dia);
    const conteo = new Map<Dia, number>(
      ([1, 2, 3] as Dia[]).map((d) => [d, padron.filter((a) => a.dia === d).length]),
    );
    const asignaciones = new Map<string, Dia>();
    for (const a of pendientes) {
      const dia = ([1, 2, 3] as Dia[]).reduce((menor, d) =>
        conteo.get(d)! < conteo.get(menor)! ? d : menor,
      );
      conteo.set(dia, conteo.get(dia)! + 1);
      asignaciones.set(a.matricula, dia);
    }
    if (asignaciones.size) {
      setPadron((prev) =>
        prev.map((a) =>
          asignaciones.has(a.matricula) ? { ...a, dia: asignaciones.get(a.matricula)! } : a,
        ),
      );
      escribir(`el reparto de ${asignaciones.size} días`, async (d) => {
        // Se agrupa por día para no mandar una petición por alumno: son tres
        // actualizaciones en vez de dos mil.
        for (const dia of [1, 2, 3] as Dia[]) {
          const suyas = [...asignaciones].filter(([, x]) => x === dia).map(([m]) => m);
          if (suyas.length) await d.asignarDiaRemoto(suyas, dia);
        }
      });
      registrarBitacora(
        "Repartió los días del padrón",
        `${asignaciones.size} alumnos sin día quedaron repartidos: ${([1, 2, 3] as Dia[])
          .map((d) => `día ${d} ${conteo.get(d)}`)
          .join(", ")}`,
      );
    }
    return {
      asignados: asignaciones.size,
      porDia: ([1, 2, 3] as Dia[]).map((dia) => ({ dia, total: conteo.get(dia)! })),
    };
  }, [padron, registrarBitacora]);

  /**
   * Aplica el archivo de Servicios Escolares: da de alta a quien no estaba y
   * actualiza el nombre de quien sí. **Ya no toca el día**, porque el archivo no
   * lo trae: quien entra nuevo queda esperando el reparto, y quien ya estaba
   * conserva el suyo.
   */
  const guardarPadron = useCallback<Ctx["guardarPadron"]>(async (filas) => {
    if (!hayBaseDeDatos) return { guardados: filas.length, rechazados: [] };
    const { guardarPadronRemoto } = await import("@/lib/datos");
    return guardarPadronRemoto(filas);
  }, []);

  const aplicarPadron = useCallback<Ctx["aplicarPadron"]>((filas) => {
    if (filas.length === 0) return { registros: 0, altas: 0, actualizaciones: 0, sinDia: 0 };

    let altas = 0;
    let actualizaciones = 0;
    let sinDia = 0;
    setPadron((prev) => {
      const porMatricula = new Map(prev.map((a) => [a.matricula, a]));
      for (const f of filas) {
        const antes = porMatricula.get(f.matricula);
        if (antes) actualizaciones++;
        else altas++;
        // El día nunca viene del archivo: se conserva el que ya tenía.
        const dia = antes?.dia;
        if (!dia) sinDia++;
        porMatricula.set(f.matricula, { ...f, dia });
      }
      return [...porMatricula.values()];
    });

    /*
     * Aquí faltaba lo esencial: guardarlo.
     *
     * La pantalla leía el archivo, validaba cada fila, avisaba de los errores y
     * decía «se aplicaron 2,500 registros» —y al recargar no quedaba ninguno—.
     * El padrón es la puerta de entrada de todos los datos del sistema: sin él
     * nadie puede pre-registrarse, y sin pre-registros no hay folios, pagos,
     * asistencias ni evidencias.
     */
    return { registros: filas.length, altas, actualizaciones, sinDia };
  }, []);

  // --------------------------------------------------------------- reloj ---
  /*
   * Tocar el control apaga el seguimiento de la hora real.
   *
   * Es lo que se espera: quien mueve el deslizador quiere ver otro momento, y
   * que el reloj se lo corrigiera un segundo después sería pelearse con la
   * pantalla. Para volver, `setReloj({ automatico: true })`.
   */
  const setReloj = useCallback<Ctx["setReloj"]>(
    (r) => setRelojState((prev) => ({ ...prev, automatico: false, ...r })),
    [],
  );

  /*
   * El día del evento que corresponde a hoy, o `null` si hoy no es ninguno.
   *
   * Se compara contra la fecha local, no contra UTC: a las 19:00 en México ya
   * es el día siguiente en UTC, y el monitoreo saltaría al día 2 con la jornada
   * del 1 todavía en marcha.
   */
  const diaDeHoy = useCallback((): Dia | null => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const hoy = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return (configuracion.dias.find((x) => x.fecha.slice(0, 10) === hoy)?.dia as Dia) ?? null;
  }, [configuracion.dias]);

  /*
   * Mientras siga la hora real, se pone al dia solo.
   *
   * Cada treinta segundos y no cada minuto porque el ritmo se mide en personas
   * por minuto: con un minuto de resolución el número daría saltos visibles
   * justo cuando alguien lo está mirando.
   *
   * Si hoy no es ninguno de los tres días, el día no se toca: se respeta el que
   * hubiera, que es lo útil para preparar la jornada la víspera.
   */
  useEffect(() => {
    if (!reloj.automatico) return;

    const poner = () => {
      const ahora = new Date();
      const hoy = diaDeHoy();
      setRelojState((prev) =>
        prev.automatico
          ? {
              ...prev,
              minutos: ahora.getHours() * 60 + ahora.getMinutes(),
              ...(hoy ? { dia: hoy } : {}),
            }
          : prev,
      );
    };

    poner();
    const t = setInterval(poner, 30_000);
    return () => clearInterval(t);
  }, [reloj.automatico, diaDeHoy]);

  // --------------------------------------------------------------- red ---
  const alternarConexion = useCallback(() => {
    setEnLinea((antes) => {
      const ahora = !antes;
      // Al recuperar la red, lo pendiente se sincroniza.
      if (ahora)
        setEnCola((cola) => {
          if (cola.length) {
            setCapturadas((prev) => [...prev, ...cola]);
            const ids = new Set(cola.map((a) => a.id));
            setHistorial((prev) =>
              prev.map((h) =>
                h.asistencia && ids.has(h.asistencia.id) ? { ...h, pendiente: false } : h,
              ),
            );
          }
          return [];
        });
      return ahora;
    });
  }, []);

  const setSesion = useCallback<Ctx["setSesion"]>(
    (s) =>
      setSesionState((prev) => {
        const siguiente = { ...prev, ...s };
        /*
         * Cambiar de día cambia de sede, y los puntos de una no existen en la
         * otra. Sin esto, la sesión se quedaba apuntando a un punto del día
         * anterior y los escaneos salían firmados desde un lugar que ese día no
         * existe, que es un error imposible de ver hasta leer el reporte.
         */
        const validos = puntosDelDia(siguiente.dia);
        if (!validos.includes(siguiente.punto)) siguiente.punto = validos[0]!;
        return siguiente;
      }),
    [puntosDelDia],
  );

  const value = useMemo<Ctx>(
    () => ({
      pagos,
      estadoDe,
      registrarPago,
      registrarLote,
      asistencias,
      asistenciasDe,
      anularAsistencia,
      sesion,
      setSesion,
      historial,
      escanear,
      deshacerUltimo,
      ejecutarCierreAutomatico,
      quitarAsistencia,
      evidencias,
      revisiones,
      revisarEvidencia,
      deshacerRevision,
      conectado,
      cargandoDatos,
      enVivo,
      cargadoEn,
      recargar,
      configuracion,
      actualizarConfiguracion,
      infoDia,
      puntosDelDia,
      avisosDe,
      descartarAvisos,
      talleres,
      getTaller,
      guardarTaller,
      liberarInscripcionesFueraDeDia,
      eliminarTaller,
      usuarios,
      guardarUsuario,
      eliminarUsuario,
      casos,
      abrirCasoNombre,
      cambiarEstadoCaso,
      corregirNombre,
      abrirCaso,
      editarCaso,
      casoDeNombreAbierto,
      participantes,
      getParticipante,
      padron,
      aplicarPadron,
      guardarPadron,
      sedes,
      diaDe,
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
      asignarDiaAVarios,
      bitacora,
      registrarBitacora,
      usuarioActual,
      reloj,
      setReloj,
      enLinea,
      alternarConexion,
      pendientes: enCola.length,
    }),
    [
      pagos,
      estadoDe,
      registrarPago,
      registrarLote,
      asistencias,
      asistenciasDe,
      anularAsistencia,
      sesion,
      setSesion,
      historial,
      escanear,
      deshacerUltimo,
      ejecutarCierreAutomatico,
      quitarAsistencia,
      evidencias,
      revisiones,
      revisarEvidencia,
      deshacerRevision,
      conectado,
      cargandoDatos,
      enVivo,
      cargadoEn,
      recargar,
      configuracion,
      actualizarConfiguracion,
      infoDia,
      puntosDelDia,
      avisosDe,
      descartarAvisos,
      talleres,
      getTaller,
      guardarTaller,
      liberarInscripcionesFueraDeDia,
      eliminarTaller,
      usuarios,
      guardarUsuario,
      eliminarUsuario,
      casos,
      abrirCasoNombre,
      cambiarEstadoCaso,
      corregirNombre,
      abrirCaso,
      editarCaso,
      casoDeNombreAbierto,
      participantes,
      getParticipante,
      padron,
      aplicarPadron,
      guardarPadron,
      sedes,
      diaDe,
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
      asignarDiaAVarios,
      bitacora,
      registrarBitacora,
      usuarioActual,
      reloj,
      setReloj,
      enLinea,
      alternarConexion,
      enCola.length,
    ],
  );

  return <EstadoEventoCtx.Provider value={value}>{children}</EstadoEventoCtx.Provider>;
}

// Se conserva el hook junto a su proveedor, igual que en `prototipo.tsx`.
// eslint-disable-next-line react-refresh/only-export-components
export function useEstadoEvento() {
  const ctx = useContext(EstadoEventoCtx);
  if (!ctx) throw new Error("useEstadoEvento debe usarse dentro de EstadoEventoProvider");
  return ctx;
}
