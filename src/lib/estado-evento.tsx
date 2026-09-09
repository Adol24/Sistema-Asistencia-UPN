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
import { rolHaciaBase } from "@/lib/roles";
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
  buscarReferenciaEn,
  diagnosticarPago,
  estadoDePagos,
  pagosIniciales,
  type Concepto,
  type Diagnostico,
  type PagoRegistrado,
} from "@/lib/pagos-logica";
import {
  asistenciaDe,
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

function escribir(descripcion: string, accion: (datos: ModuloDatos) => Promise<unknown>): void {
  if (!hayBaseDeDatos) return;
  void import("@/lib/datos")
    .then(accion)
    .catch((e: unknown) => console.error(`No se pudo guardar ${descripcion}`, e));
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
  buscarReferencia: (referencia: string, ignorarId?: string) => PagoRegistrado | undefined;
  diagnosticar: (e: { referencia: string; monto: string; montoEsperado: number }) => Diagnostico;
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
  escanear: (
    entrada: string,
    opciones?: { autorizado?: boolean; nota?: string; autorizadoPor?: string },
  ) => ResultadoEscaneo;
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

  configuracion: ConfiguracionEvento;
  actualizarConfiguracion: (patch: Partial<ConfiguracionEvento>) => void;
  /**
   * El día tal como está configurado ahora. Existe aquí y no en el mock porque
   * administración puede cambiar la fecha y la sede de un día, y una pantalla
   * que lea el mock seguiría mostrando la sede vieja.
   */
  infoDia: (dia: Dia) => ConfiguracionEvento["dias"][number];

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

const PUNTOS = ["Puerta A", "Puerta B", "Vestíbulo", "Registro Taller"];
export const PUNTOS_CAPTURA = PUNTOS;

export function EstadoEventoProvider({ children }: { children: ReactNode }) {
  const [pagos, setPagos] = useState<PagoRegistrado[]>(() => pagosIniciales());
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
  const [configuracion, setConfiguracion] = useState<ConfiguracionEvento>(CONFIGURACION_VACIA);

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
  const [talleresBase, setTalleresBase] = useState<TallerBase[]>([]);
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
  const [idPorClave, setIdPorClave] = useState<Record<string, string>>({});
  const [conectado, setConectado] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(hayBaseDeDatos);

  /**
   * Carga inicial desde Supabase. Si no hay base configurada, o si la carga
   * falla, se queda con los datos simulados: un prototipo que se cae en blanco
   * porque falta una llave no le sirve a quien iba a revisar pantallas.
   */
  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vigente = true;

    void import("@/lib/datos")
      .then((m) => m.cargarTodo())
      .then((datos) => {
        if (!vigente || !datos) return;
        setConfiguracion(datos.configuracion);
        setTalleresBase(datos.talleresBase);
        setIdPorClave(datos.idPorClave);
        setParticipantesBase(datos.participantes);
        setPadron(datos.padron);
        setAsistenciasBase(datos.asistencias);
        setEvidenciasBase(datos.evidencias);
        // Las tablas del personal devuelven cero filas a quien no tiene permiso,
        // en vez de un error. Se conservan las simuladas para que las pantallas
        // internas no queden vacías cuando las mira alguien sin sesión.
        if (datos.usuarios.length) setUsuarios(datos.usuarios);
        if (datos.casos.length) setCasos(datos.casos);
        setConectado(true);
      })
      .catch((e: unknown) => {
        console.error("No se pudo cargar de la base; se usan los datos simulados.", e);
      })
      .finally(() => {
        if (vigente) setCargandoDatos(false);
      });

    return () => {
      vigente = false;
    };
  }, []);
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
  const [reloj, setRelojState] = useState<RelojEvento>({ dia: 1, minutos: 8 * 60 + 30 });

  const [enLinea, setEnLinea] = useState(true);
  const [sesion, setSesionState] = useState<SesionCaptura>({
    dia: 1,
    modo: "entrada",
    punto: PUNTOS[0]!,
    capturista: "MARIO CANTU",
  });

  // ---------------------------------------------------------------- pagos ---
  const buscarReferencia = useCallback<Ctx["buscarReferencia"]>(
    (referencia, ignorarId) => buscarReferenciaEn(pagos, referencia, ignorarId),
    [pagos],
  );

  const diagnosticar = useCallback<Ctx["diagnosticar"]>(
    (entrada) => diagnosticarPago(pagos, entrada),
    [pagos],
  );

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
      setPagos((prev) => [...prev, pago]);

      // Se escribe sin esperar: la pantalla ya se actualizó. Si la base rechaza
      // —una referencia duplicada que dos ventanillas capturaron a la vez— el
      // error queda en consola y hay que recargar. Es el límite conocido de
      // escribir de forma optimista, y está anotado.
      escribir("el pago", (d) =>
        d.guardarPago({
          folio: pago.folio,
          concepto: pago.concepto,
          monto: pago.monto,
          montoEsperado: pago.montoEsperado,
          referencia: pago.referencia,
          fechaDeposito: pago.fechaDeposito,
          nota: pago.nota,
        }),
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
      setPagos((prev) => [...prev, ...nuevos]);
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
        escribir(`el pago de ${pago.folio}`, (d) =>
          d.guardarPago({
            folio: pago.folio,
            concepto: pago.concepto,
            monto: pago.monto,
            montoEsperado: pago.montoEsperado,
            referencia: pago.referencia,
            fechaDeposito: pago.fechaDeposito,
            nota: pago.nota,
          }),
        ),
      );
      return nuevos;
    },
    [contadorPagos],
  );

  const estadoDe = useCallback<Ctx["estadoDe"]>((p) => estadoDePagos(pagos, p), [pagos]);

  // -------------------------------------------------------- participantes ---
  const participantes = useMemo<Participante[]>(
    () =>
      participantesBase.map((p) => {
        const ajuste = ajustesParticipante[p.folio];
        return ajuste ? { ...p, ...ajuste } : p;
      }),
    [participantesBase, ajustesParticipante],
  );

  const getParticipante = useCallback<Ctx["getParticipante"]>(
    (folio) => participantes.find((p) => p.folio === folio),
    [participantes],
  );

  // ----------------------------------------------------------- bitácora ---
  // Registra lo que pasa en la sesión, no solo lo sembrado en los mocks: sin eso
  // no se puede aclarar ninguna inconformidad, que es para lo que sirve.
  const usuarioActual = "SOFIA RAMIREZ BAÑUELOS";

  const registrarBitacora = useCallback<Ctx["registrarBitacora"]>((accion, detalle, usuario) => {
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
  }, []);

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

  const asistenciasDe = useCallback<Ctx["asistenciasDe"]>(
    (folio, dia) =>
      asistencias.filter((a) => a.folio === folio && (dia === undefined || a.dia === dia)),
    [asistencias],
  );

  const escanear = useCallback<Ctx["escanear"]>(
    (entrada, opciones) => {
      const ahora = Date.now();
      // Lo que ya está en cola también cuenta para no duplicar registros.
      const conocidas = [...asistencias, ...enCola];
      const resultado = evaluarEscaneo({
        entrada,
        sesion,
        participantes,
        asistencias: conocidas,
        estadoDe,
        ahora,
        ...(opciones?.autorizado !== undefined ? { autorizado: opciones.autorizado } : {}),
      });

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
        asistencia ? `Registró ${sesion.modo}` : `Escaneo rechazado (${resultado.color})`,
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
      const delDia = [...asistenciasBase, ...capturadas].filter((a) => a.dia === dia);
      const conEntrada = new Set(delDia.filter((a) => a.tipo === "entrada").map((a) => a.folio));
      const conSalida = new Set(delDia.filter((a) => a.tipo === "salida").map((a) => a.folio));
      const sinSalida = [...conEntrada].filter((f) => !conSalida.has(f));
      if (sinSalida.length === 0) return 0;

      const cierres: Asistencia[] = sinSalida.map((folio, k) => {
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
      escribir("la configuración", (d) => d.guardarConfiguracion(columnas));
  }, []);

  // ------------------------------------------------------------ talleres ---
  // `cupoOcupado` es derivado: nunca se escribe a mano.
  const talleres = useMemo<Taller[]>(
    () =>
      talleresBase.map(({ ocupadosPrevios, ...t }) => ({
        ...t,
        cupoOcupado: ocupadosPrevios + participantes.filter((p) => p.tallerId === t.id).length,
      })),
    [talleresBase, participantes],
  );

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
    escribir("el taller", (d) => d.guardarTallerRemoto(t));
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
    escribir("el retiro del taller", (d) => d.eliminarTallerRemoto(id));
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
        canal: "ventanilla",
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
    setCasos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, estado, ...(atiende ? { atiende } : {}) } : c)),
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
  const reasignarDia = useCallback<Ctx["reasignarDia"]>(
    (matricula, dia) => {
      const p = participantes.find((x) => x.matricula === matricula);
      setPadron((prev) => prev.map((a) => (a.matricula === matricula ? { ...a, dia } : a)));
      if (!p || p.dia === dia) return { movido: !!p, tallerLiberado: undefined };

      const ajuste: Partial<Participante> = { dia, sede: infoDia(dia).sede };
      const t = talleres.find((x) => x.id === p.tallerId);
      let tallerLiberado: string | undefined;
      // Si su taller no se imparte el día nuevo, la inscripción se libera:
      // mantenerla rompería `taller-vs-dia` y lo dejaría con un pago sin a qué
      // corresponder.
      if (t && !t.dias.includes(dia)) {
        ajuste.tallerId = undefined;
        ajuste.estadoPagoTaller = undefined;
        ajuste.montoEsperadoTaller = undefined;
        tallerLiberado = t.id;
        agregarAviso(
          p.folio,
          `Cambiaste al día ${dia} y el taller «${t.nombre}» no se imparte ese día, así que tu inscripción se liberó. Puedes elegir otro taller; si ya lo habías pagado, acude a Servicios Financieros.`,
        );
      }
      setAjustesParticipante((prev) => ({
        ...prev,
        [p.folio]: { ...(prev[p.folio] ?? {}), ...ajuste },
      }));
      return { movido: true, tallerLiberado };
    },
    [participantes, talleres, infoDia, agregarAviso],
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

    return { registros: filas.length, altas, actualizaciones, sinDia };
  }, []);

  // --------------------------------------------------------------- reloj ---
  const setReloj = useCallback<Ctx["setReloj"]>(
    (r) => setRelojState((prev) => ({ ...prev, ...r })),
    [],
  );

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
    (s) => setSesionState((prev) => ({ ...prev, ...s })),
    [],
  );

  const value = useMemo<Ctx>(
    () => ({
      pagos,
      estadoDe,
      buscarReferencia,
      diagnosticar,
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
      configuracion,
      actualizarConfiguracion,
      infoDia,
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
      casoDeNombreAbierto,
      participantes,
      getParticipante,
      padron,
      aplicarPadron,
      diaDe,
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
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
      buscarReferencia,
      diagnosticar,
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
      configuracion,
      actualizarConfiguracion,
      infoDia,
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
      casoDeNombreAbierto,
      participantes,
      getParticipante,
      padron,
      aplicarPadron,
      diaDe,
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
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
