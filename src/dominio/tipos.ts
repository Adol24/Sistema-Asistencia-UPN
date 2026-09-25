export type Perfil = "alumno" | "docente" | "externo";

export type EstadoPago =
  "pre_registrado" | "comprobante_recibido" | "pagado" | "discrepancia" | "expirado" | "cancelado";

export type EstadoEvidencia = "pendiente" | "aprobada" | "rechazada" | "no_entregada";

/**
 * Los colores del escáner de la puerta.
 *
 * Tres son el semáforo de siempre y contestan «¿pasa o no pasa?». El azul
 * contesta otra cosa —«va SALIENDO»— y por eso no es uno de los tres: nadie lee
 * azul como permiso ni como alto, que es justo lo que lo hace servir para una
 * dimensión distinta sin estropear el código de seguridad.
 *
 * El enum `semaforo` de la base se queda en tres a propósito. La base decide la
 * dirección y la devuelve en `tipo`; con qué color se pinta una salida es cosa
 * de la pantalla, no de Postgres.
 */
export type Semaforo = "verde" | "azul" | "amarillo" | "rojo";

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
  /**
   * Cómo se cuenta depende del PROGRAMA y, si no dice nada, de su nivel. Casi
   * todas las licenciaturas van por semestre; la de Educación e Innovación
   * Pedagógica va por módulos y llega al 13. Resuelve `cuentaDeAvance`.
   */
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
  /**
   * Cuándo aceptó el aviso de privacidad, ya formateado.
   *
   * Indefinido en quien se pre-registró antes de que el aviso se enseñara. Es un
   * dato que NO tenemos, y por eso no se rellena con la fecha de alta ni con un
   * «sí»: la única respuesta honesta a «¿cuándo aceptó?» para esas filas es que
   * no consta.
   */
  aceptoAvisoEn?: string | undefined;
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
  /**
   * Cómo se cuenta depende del PROGRAMA y, si no dice nada, de su nivel. Casi
   * todas las licenciaturas van por semestre; la de Educación e Innovación
   * Pedagógica va por módulos y llega al 13. Resuelve `cuentaDeAvance`.
   */
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
  /**
   * El espacio concreto: «Aula B1», «Centro de cómputo».
   *
   * Distinto de `lugar`, que es el edificio y es el MISMO para los doce
   * talleres —«Instalaciones UPN U-212, Teziutlán»—. Quien llega a la UPN ya
   * sabe a qué edificio va; lo que le falta es a qué puerta entrar.
   *
   * Vacío significa que la organización todavía no lo repartió, no que el
   * taller no lo tenga: las pantallas se callan el renglón en vez de enseñar
   * un separador suelto.
   */
  salon: string;
  cupoTotal: number;
  /** Invitados y cortesías que no pasan por el sistema. No son participantes. */
  ocupadosPrevios: number;
  /**
   * Los lugares tomados, contados POR LA BASE.
   *
   * Antes esto lo calculaba el navegador sumando los participantes que tuviera
   * cargados, y para el aspirante eso eran CERO: `participantes` le está
   * cerrada, así que el catálogo anunciaba lugares que no existían y el botón
   * «Seleccionar» no llegaba a desactivarse nunca.
   *
   * Ahora sale de `v_talleres`, que lo cuenta donde están los datos. La misma
   * cifra que usa `fn_exigir_lugar_en_taller` para cerrar la puerta, así que la
   * pantalla y la base no pueden discrepar.
   */
  cupoOcupado: number;
  costo: number;
  /** Un taller inactivo deja de ofrecerse en el catálogo público. */
  activo: boolean;
}

/**
 * Lo que consume la interfaz. Ya no añade nada: `TallerBase` trae el cupo
 * ocupado contado por la base, así que no queda nada que derivar.
 */
export type Taller = TallerBase;

export interface Asistencia {
  id: string;
  folio: string;
  nombre: string;
  dia: Dia;
  tipo: "entrada" | "salida" | "taller";
  hora: string;
  punto: string;
  capturista: string;
  /**
   * Esta salida la puso el cierre del día, no un escaneo.
   *
   * Solo de LECTURA: desde la 62 nada la escribe. El cierre automático se quitó
   * porque la presencia la prueba la entrada —quien entró y no escaneó al irse
   * estuvo igual—, y fabricarle una salida metía un movimiento falso en el único
   * registro que dice quién pasó por la puerta. Se conserva el campo para poder
   * leer las filas que alguna base ya tenga, que en el reporte son justo las que
   * hay que saber explicar.
   */
  cierreAutomatico?: boolean | undefined;
  /** Momento del escaneo en ms. Solo lo traen las asistencias capturadas en la sesión. */
  ts?: number | undefined;
  /**
   * El uuid con el que esta fila se va a guardar —o ya se guardó— en la base.
   *
   * Lo genera el navegador al capturar, NO la base al insertar, y esa es toda
   * la diferencia: permite reintentar sin duplicar. Si la fila entró pero la
   * respuesta se perdió —la red del recinto cayéndose a mitad de la petición es
   * el caso de todos los días—, el reintento choca contra la llave primaria y
   * eso significa «ya estaba», no «falló».
   *
   * Sin esto, vaciar la cola al recuperar la red podía duplicar asistencias, y
   * un duplicado no es un renglón de más: invierte el torniquete, así que el
   * siguiente escaneo de esa persona se registra al revés.
   *
   * Opcional porque una cola guardada antes de esta versión no lo trae; esas
   * filas se envían sin id y las numera la base, como antes.
   */
  idRemoto?: string | undefined;
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
