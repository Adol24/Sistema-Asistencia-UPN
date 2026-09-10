export type Perfil = "alumno" | "docente" | "externo";

export type EstadoPago =
  "pre_registrado" | "comprobante_recibido" | "pagado" | "discrepancia" | "expirado" | "cancelado";

export type EstadoEvidencia = "pendiente" | "aprobada" | "rechazada" | "no_entregada";

export type Semaforo = "verde" | "amarillo" | "rojo";

export type Dia = 1 | 2 | 3;

export interface Participante {
  id: string;
  folio: string;
  matricula?: string | undefined;
  nombre: string;
  perfil: Perfil;
  correo: string;
  celular: string;
  institucion: string;
  /**
   * Datos académicos que entrega Servicios Escolares en el padrón. El alumno no
   * los captura: solo verifica que su nombre esté bien escrito.
   */
  nivel?: string | undefined;
  programa?: string | undefined;
  /** Semestre en licenciatura, módulo en maestría. El nivel dice cómo llamarlo. */
  avance?: number | undefined;
  grupo?: string | undefined;
  /**
   * El plantel donde estudia. **No confundir con `sede`**: uno lo entrega la
   * universidad y el otro lo asigna la organización al repartir los días.
   */
  plantel?: string | undefined;
  dia: Dia;
  /** El lugar del evento al que le toca asistir, derivado de su día. */
  lugar: string;
  estadoPagoEvento: EstadoPago;
  tallerId?: string | undefined;
  estadoPagoTaller?: EstadoPago | undefined;
  nombreEnRevision: boolean;
  montoEsperadoEvento: number;
  montoEsperadoTaller?: number | undefined;
  referenciaEvento?: string | undefined;
  creadoEn: string;
}

/**
 * Una fila del padrón que entrega Servicios Escolares. Trae el **nombre completo
 * en una sola columna**, sin separar nombres de apellidos, y los datos
 * académicos: nivel, programa, avance, grupo y plantel. Lo único que no trae es
 * el correo, que el alumno declara y se verifica con un código.
 *
 * `dia` tampoco viene en el archivo: lo asigna la organización al repartir a los
 * alumnos entre los tres días. Es opcional porque un alta reciente todavía no
 * tiene día, y esa espera es un estado real que hay que poder ver.
 */
export interface AlumnoPadron {
  matricula: string;
  nombre: string;
  nivel: string;
  programa: string;
  /** Semestre en licenciatura, módulo en maestría. El nivel dice cómo llamarlo. */
  avance: number;
  /** No todos los programas manejan grupo. */
  grupo?: string | undefined;
  /** Dónde estudia. Distinto de la sede del evento. */
  plantel: string;
  dia?: Dia | undefined;
}

/** Datos fijos de un taller, tal como se escriben en `talleres-base.ts`. */
export interface TallerBase {
  id: string;
  nombre: string;
  ponente: string;
  descripcion: string;
  dias: Dia[];
  horario: string;
  lugar: string;
  cupoTotal: number;
  /** Inscritos que no forman parte del conjunto simulado de 60 participantes. */
  ocupadosPrevios: number;
  costo: number;
  /** Un taller inactivo deja de ofrecerse en el catálogo público. */
  activo: boolean;
}

/** Taller con su cupo ocupado ya calculado. Es lo que consume la interfaz. */
export interface Taller extends Omit<TallerBase, "ocupadosPrevios"> {
  cupoOcupado: number;
}

export interface Asistencia {
  id: string;
  folio: string;
  nombre: string;
  dia: Dia;
  tipo: "entrada" | "salida" | "taller";
  hora: string;
  punto: string;
  capturista: string;
  cierreAutomatico?: boolean | undefined;
  /** Momento del escaneo en ms. Solo lo traen las asistencias capturadas en la sesión. */
  ts?: number | undefined;
  /**
   * Excepción autorizada por un supervisor, típicamente un pase en día
   * equivocado. Es registro de auditoría: viaja con la asistencia, no solo con
   * el historial de la sesión de captura.
   */
  autorizacion?: { nota: string; autorizadoPor: string; en: string } | undefined;
}

export interface Evidencia {
  id: string;
  folio: string;
  matricula: string;
  nombre: string;
  dia: Dia;
  subidaEn: string;
  estado: EstadoEvidencia;
  motivoRechazo?: string | undefined;
  revisor?: string | undefined;
  hash: string;
  imagen: string;
  intentos: number;
}

export type RolInterno =
  "administrador" | "servicios_financieros" | "capturista" | "revisor_evidencias" | "soporte";

export interface UsuarioInterno {
  id: string;
  nombre: string;
  correo: string;
  rol: RolInterno;
  activo: boolean;
  ultimoAcceso: string;
}

export interface CasoSoporte {
  id: string;
  folio: string;
  nombre: string;
  asunto: string;
  detalle: string;
  estado: "abierto" | "en_proceso" | "resuelto";
  /**
   * De dónde llegó el caso. Los cuatro valores del enum `canal_caso`.
   *
   * `portal` faltaba, y era el único que se usaba de verdad:
   * `fn_abrir_caso_nombre` —la única vía por la que se crea un caso hoy— lo
   * inserta con ese valor. La pantalla de soporte buscaba su icono en una tabla
   * de tres entradas y reventaba al pintar el primero.
   */
  canal: "whatsapp" | "correo" | "ventanilla" | "portal";
  creadoEn: string;
  atiende?: string | undefined;
}
