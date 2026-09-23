import type { ConfiguracionEvento } from "@/lib/configuracion";
import type { Modo, ResultadoEscaneo, SesionCaptura } from "@/lib/escaneo";
import type { PagoRegistrado } from "@/lib/pagos-logica";
import type { RelojEvento } from "@/lib/reloj";
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

/*
 * El contrato del estado del evento: todo lo que una pantalla puede pedirle al
 * sistema, con su firma y su porqué.
 *
 * Vive aparte de `estado-evento.tsx` porque son dos cosas distintas y se leen en
 * momentos distintos. Aquí está QUÉ ofrece el sistema —y es la respuesta a «¿de
 * dónde saco los talleres?», «¿cómo se anula una asistencia?»—; allá está CÓMO
 * se cumple, que solo hace falta cuando algo se rompe. Juntas eran 2 000 líneas
 * en las que había que bajar por la implementación para encontrar un nombre.
 *
 * Son puros tipos: este archivo no ejecuta nada.
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

/** Decisión de revisión tomada en esta sesión sobre una evidencia. */
export interface RevisionSesion {
  estado: Extract<EstadoEvidencia, "aprobada" | "rechazada">;
  motivo?: string | undefined;
  revisor: string;
  en: string;
}

export interface Ctx {
  // --- Pagos ---
  pagos: PagoRegistrado[];
  /** Estado de pago efectivo, con los pagos de la sesión aplicados. */
  estadoDe: (p: Participante) => { evento: EstadoPago; taller: EstadoPago | undefined };
  registrarPago: (p: Omit<PagoRegistrado, "id" | "registradoEn">) => PagoRegistrado;
  /**
   * Aplica una carga masiva y ESPERA a que la base conteste por cada fila.
   *
   * Devuelve lo que de verdad quedó guardado y lo que no. Antes devolvía las
   * filas optimistas al instante y la pantalla anunciaba «Se aplicaron 300
   * pagos» con el número de filas intentadas: los rechazos llegaban después
   * como avisos sueltos que se apilaban y caducaban, así que quien cerraba la
   * pantalla creía tener trescientos cobros y la base tenía doscientos sesenta.
   */
  registrarLote: (
    ps: Omit<PagoRegistrado, "id" | "registradoEn">[],
  ) => Promise<{ guardados: PagoRegistrado[]; fallidos: string[] }>;

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
  escanear: (entrada: string, opciones?: OpcionesEscaneo) => Promise<ResultadoEscaneo>;
  /**
   * Evalúa sin registrar nada.
   *
   * Existe porque la admisión es en dos tiempos: se escanea, se enseñan el
   * nombre y la matrícula, quien captura los compara con la credencial física
   * y solo entonces confirma. Entre esos dos momentos no puede haber ninguna
   * asistencia escrita, porque la persona todavía puede resultar no ser quien
   * el QR dice.
   */
  evaluar: (entrada: string, opciones?: OpcionesEscaneo) => Promise<ResultadoEscaneo>;
  /** Registra un resultado ya evaluado, y confirmado si tocaba confirmarlo. */
  registrar: (r: ResultadoEscaneo, opciones?: OpcionesEscaneo) => void;
  /**
   * Anota que quien captura descartó el escaneo al mirar la credencial.
   *
   * No registra asistencia, pero sí deja rastro: un QR que no corresponde a
   * quien lo trae es justo lo que este paso existe para encontrar, y perderlo
   * sería quedarse sin saber que ocurrió.
   */
  descartarEscaneo: (r: ResultadoEscaneo, motivo: string) => void;
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
  repartoPorDia: () => { dia: Dia; total: number; cupo: number; libres: number }[];
  /** Los del padrón que todavía no tienen día. */
  sinDiaAsignado: () => AlumnoPadron[];
  /**
   * Reparte día a quienes no lo tienen, equilibrando los tres **sin pasar del
   * aforo de ninguno**. Devuelve cuántos quedaron en cada uno y cuántos no
   * cupieron en ninguno.
   *
   * `sinLugar > 0` no es un fallo de esta función: es el evento lleno, y la
   * única salida es ampliar un aforo o mover gente a mano.
   */
  repartirDiasPendientes: () => {
    asignados: number;
    sinLugar: number;
    porDia: { dia: Dia; total: number; cupo: number; libres: number }[];
  };
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

/** Lo que un escaneo puede traer además del código. */
export interface OpcionesEscaneo {
  autorizado?: boolean;
  nota?: string;
  autorizadoPor?: string;
  /**
   * Para este escaneo, manda este modo y no el de la sesión.
   *
   * Lo usa el pase de lista de taller, que hasta ahora llamaba a `escanear` sin
   * decir nada: el modo seguía siendo `"puerta"` —el valor por omisión de la
   * sesión— y esa pantalla no ofrece dónde cambiarlo. Marcar a los treinta
   * inscritos de un taller les registraba a todos una SALIDA del recinto, y el
   * segundo toque una entrada. Cero asistencias de taller y sesenta movimientos
   * de puerta inventados.
   *
   * Va como opción del escaneo y no cambiando `sesion.modo` a propósito: la
   * sesión la comparten todas las pantallas de captura, y dejarla en «taller»
   * al salir de esta invertiría el registro de todos los que pasaran después
   * por la puerta. Es justo el defecto contra el que avisa el encabezado de
   * `escaneo.ts`.
   */
  modo?: Modo;
}
