import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import {
  avisarFallo,
  avisarLogro,
  columnasDeConfiguracion,
  escribir,
} from "@/lib/escritura-remota";
import { useRelojEvento } from "@/lib/reloj";
import { useSesion } from "@/lib/sesion";
import { rolHaciaBase } from "@/lib/roles";
import type { Publico } from "@/lib/datos";
import { CONFIGURACION_VACIA, type ConfiguracionEvento } from "@/lib/configuracion";
import type {
  AlumnoPadron,
  Asistencia,
  CasoSoporte,
  Dia,
  Evidencia,
  Participante,
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
import { asistenciaDe, evaluarEscaneo, type SesionCaptura } from "@/lib/escaneo";
import { fechaHora, hora as horaActual } from "@/lib/formato";
import { guardarCola, leerCola } from "@/lib/cola-pendientes";
import { aplicarRevisiones } from "@/lib/revision";
import type { Ctx, EntradaBitacora, EscaneoHistorial, RevisionSesion } from "@/lib/contrato-estado";

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

  const { reloj, setReloj } = useRelojEvento(configuracion);

  /*
   * Los avisos que le esperan a alguien en su portal, y una advertencia.
   *
   * `agregarAviso` estaba aquí y se fue con la migración 60: su ÚNICO productor
   * era la liberación del taller al cambiar de día, que ya no ocurre. Así que
   * este mapa no lo llena nadie y la sección de avisos de `/portal/estado` sale
   * siempre vacía.
   *
   * Y eso destapa algo que ya estaba: la tabla `avisos_participante` de la base
   * SÍ tiene filas —las que dejaron las liberaciones hasta hoy— y nunca se han
   * leído a este estado. `tiempo-real` escucha esa tabla, pero `cargarTodo` no
   * la trae. O sea que los avisos guardados no se han enseñado nunca, y eso es
   * anterior a este cambio y sigue pendiente.
   */
  const [avisos, setAvisos] = useState<Record<string, string[]>>({});
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

  /** Cuándo terminó la última carga, en milisegundos. Para poder decirlo. */
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);

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
   *
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
        setBitacoraBase(datos.bitacora);
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
  /*
   * Lo que la bitácora ya tenía anotado antes de abrir esta pestaña.
   *
   * Faltaba, y con ella faltaba la pantalla entera: lo que se anotaba sí se
   * guardaba en la base —y ahí sigue, sin política de borrado— pero nadie lo
   * volvía a leer nunca. La vista se alimentaba solo de `bitacoraSesion`, que
   * arranca vacía en cada carga, así que recargar dejaba la bitácora en blanco
   * y preguntarle quién cobró un pago ayer no tenía respuesta. Un registro de
   * auditoría que solo enseña lo que acabas de hacer delante no audita nada.
   */
  const [bitacoraBase, setBitacoraBase] = useState<EntradaBitacora[]>([]);
  const bitacoraDeVista = useMemo(
    () => [...bitacoraSesion, ...bitacoraBase],
    [bitacoraSesion, bitacoraBase],
  );
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
            origen: pago.origen,
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
    async (entradas) => {
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
      /*
       * Se ESPERA a que terminen, y ese es el cambio.
       *
       * Antes se lanzaban sin esperar y la pantalla anunciaba «Se aplicaron 300
       * pagos» con el número de filas INTENTADAS. Los rechazos llegaban después,
       * uno a uno, como avisos rojos que se apilaban y caducaban. Quien cerraba
       * la pantalla creía tener trescientos cobros; la base tenía doscientos
       * sesenta, y la diferencia eran justo los casos que había que revisar.
       *
       * Trescientas peticiones en paralelo tampoco: se mandan de veinte en
       * veinte. El lote entero de golpe satura la conexión y hace que empiecen a
       * expirar peticiones que habrían entrado, que es convertir un problema de
       * red en pagos perdidos.
       */
      const fallidos: string[] = [];
      const LOTE = 20;
      for (let i = 0; i < nuevos.length; i += LOTE) {
        await Promise.all(
          nuevos.slice(i, i + LOTE).map(async (pago) => {
            if (!hayBaseDeDatos) return;
            try {
              const d = await import("@/lib/datos");
              await d.guardarPago({
                folio: pago.folio,
                concepto: pago.concepto,
                monto: pago.monto,
                montoEsperado: pago.montoEsperado,
                referencia: pago.referencia,
                fechaDeposito: pago.fechaDeposito,
                nota: pago.nota,
                // La carga masiva se identifica como tal: sin esto, al recargar
                // los doscientos sesenta pagos del banco decían «ventanilla».
                origen: pago.origen,
              });
            } catch (e) {
              console.error(`No se pudo guardar el pago de ${pago.folio}`, e);
              // Se retira de la sesión: un pago que la base rechazó no puede
              // seguir contando en los totales de la pantalla.
              setPagosSesion((prev) => prev.filter((g) => g.id !== pago.id));
              fallidos.push(pago.folio);
            }
          }),
        );
      }
      return { guardados: nuevos.filter((p) => !fallidos.includes(p.folio)), fallidos };
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
      setBitacoraSesion((prev) => [
        {
          id: `BS-${String(prev.length + 1).padStart(4, "0")}`,
          fecha: fechaHora(),
          usuario: usuario ?? usuarioActual,
          accion,
          detalle,
          deLaSesion: true,
        },
        ...prev,
      ]);
      /*
       * La bitácora existe para poder responder «quién hizo esto». Vivía solo en
       * memoria, así que la respuesta se perdía al recargar y el registro no
       * servía para lo único que se le pide.
       */
      // No se revierte: la acción que se está anotando YA ocurrió, y borrar su
      // renglón de la pantalla no la deshace. Lo que hace falta es que quien la
      // hizo sepa que no quedó constancia de quién, que es para lo único que
      // existe la bitácora.
      escribir(
        "la bitácora",
        (d) => d.anotarEnBitacora(accion, detalle, usuario),
        () => avisarFallo(`«${accion}» se hizo, pero no quedó registrada en la bitácora.`),
      );
      // `usuarioActual` va en las dependencias porque ya no es una constante: sale
      // de la sesión. Sin él, el callback se quedaría con el valor del primer
      // render —cuando todavía no había nadie dentro— y la bitácora seguiría
      // firmando como «Sin sesión» después de entrar.
    },
    [usuarioActual],
  );

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

  /*
   * Vaciar la cola contra la base, que es lo que la cola nunca hizo.
   *
   * ---------------------------------------------------------------------------
   * Lo que pasaba antes
   * ---------------------------------------------------------------------------
   * `guardarAsistencia` solo se llamaba dentro de `if (enLinea)`. Lo capturado
   * sin red iba a `enCola`, se persistía en `localStorage` y **ningún camino lo
   * enviaba después**. El oyente de `online` solo hacía `setEnLinea(true)`, y
   * «Reconectar» movía la cola a «sincronizadas» y la borraba del
   * almacenamiento sin escribir una sola fila.
   *
   * O sea: se caía el wifi, se escaneaban ochenta personas, volvía la red, el
   * contador de pendientes desaparecía —solo se pinta con `!enLinea`— y esas
   * ochenta asistencias no existían en ningún sitio. La pantalla decía lo
   * contrario en los dos momentos: primero «23 pendientes, se sincronizan al
   * volver la red» y después nada, como si ya estuvieran.
   *
   * ---------------------------------------------------------------------------
   * Cómo se vacía
   * ---------------------------------------------------------------------------
   * Una por una y en orden, y cada una sale de la cola **solo cuando la base lo
   * confirma**. Si una falla se para el vaciado y el resto se queda: casi
   * siempre el motivo es que la red volvió a irse, y seguir intentando las
   * otras setenta y nueve solo alarga la espera para el mismo resultado.
   *
   * El cerrojo es un `ref` y no un estado porque tiene que cerrarse en el acto:
   * entre el `online` del navegador, el botón de «Reconectar» y el efecto de
   * montaje puede haber tres llamadas en el mismo instante, y dos vaciados a la
   * vez mandarían cada fila dos veces. Que además sea idempotente —ver
   * `idRemoto`— es el segundo cinturón, no el primero.
   */
  const vaciando = useRef(false);
  const colaRef = useRef(enCola);
  colaRef.current = enCola;

  const vaciarCola = useCallback(async (): Promise<void> => {
    if (!hayBaseDeDatos || vaciando.current) return;
    const pendientes = colaRef.current;
    if (pendientes.length === 0) return;

    vaciando.current = true;
    let guardadas = 0;
    try {
      const d = await import("@/lib/datos");
      for (const a of pendientes) {
        try {
          await d.guardarAsistencia({
            folio: a.folio,
            dia: a.dia,
            tipo: a.tipo,
            punto: a.punto,
            autorizacionMotivo: a.autorizacion?.nota,
            idRemoto: a.idRemoto,
          });
        } catch (e) {
          console.error("No se pudo sincronizar una asistencia de la cola", e);
          avisarFallo(
            `Quedan ${pendientes.length - guardadas} asistencias sin sincronizar. NO cierres la pestaña: se reintentan solas al volver la red.`,
          );
          break;
        }
        // Solo después del acuse: la fila sale de la cola y pasa a capturada.
        guardadas++;
        setEnCola((prev) => prev.filter((x) => x.id !== a.id));
        setCapturadas((prev) => [...prev, a]);
        setHistorial((prev) =>
          prev.map((h) => (h.asistencia?.id === a.id ? { ...h, pendiente: false } : h)),
        );
      }
    } finally {
      vaciando.current = false;
    }

    if (guardadas > 0)
      avisarLogro(
        `${guardadas} ${guardadas === 1 ? "asistencia sincronizada" : "asistencias sincronizadas"}.`,
      );
  }, []);

  /*
   * Se dispara al recuperar la red y también al montar: si la pestaña se cerró
   * con la cola llena, al abrirla otra vez `enLinea` arranca en `true` y nadie
   * volvería a mirarla. Ese era el camino por el que una cola guardada podía
   * quedarse en `localStorage` para siempre, invisible, porque el contador de
   * pendientes solo se pinta sin conexión.
   */
  useEffect(() => {
    if (enLinea) void vaciarCola();
  }, [enLinea, vaciarCola]);

  const anularAsistencia = useCallback<Ctx["anularAsistencia"]>(
    (id, motivo, usuario) => {
      const a = [...asistenciasBase, ...capturadas].find((x) => x.id === id);
      setAnuladas((prev) => ({ ...prev, [id]: motivo }));
      // Se marca anulada, no se borra: un registro que desaparece no deja ver
      // que hubo una corrección, que es justo lo que alguien querría revisar.
      escribir(
        "la anulación",
        (d) => d.anularAsistenciaRemota(id, motivo),
        () => {
          // Se despinta: una asistencia que sigue contando para la constancia y
          // para el aforo no puede verse tachada en la pantalla de quien creyó
          // haberla corregido.
          setAnuladas((prev) => {
            const copia = { ...prev };
            delete copia[id];
            return copia;
          });
          avisarFallo(
            `No se pudo anular la asistencia${a ? ` de ${a.nombre}` : ""}. Sigue contando: vuelve a intentarlo.`,
          );
        },
      );
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

  /*
   * Evaluar y registrar están separados a propósito.
   *
   * Antes eran un solo paso: escanear escribía. Eso deja de valer en cuanto la
   * admisión exige comprobar la credencial, porque entre leer el código y
   * saber que esa persona es quien el código dice pasan unos segundos en los
   * que no puede haber nada escrito. `escanear` sigue existiendo como la
   * composición de los dos, y es lo que usa el pase de lista de taller: ahí la
   * verificación ya está hecha, porque marcar una casilla obliga a leer el
   * nombre.
   */
  /**
   * Los días en que se imparte un taller.
   *
   * Sale de `talleresBase` y no de `talleres` porque solo hacen falta los días,
   * que no dependen del cupo ocupado; `talleres` se calcula bastante más abajo y
   * traerlo hasta aquí obligaría a mover todo lo que hay en medio.
   */
  const diasDelTaller = useCallback(
    (id: string): Dia[] => talleresBase.find((t) => t.id === id)?.dias ?? [],
    [talleresBase],
  );

  const evaluar = useCallback<Ctx["evaluar"]>(
    async (entrada, opciones) => {
      const ahora = Date.now();
      // Lo que ya está en cola también cuenta para no duplicar registros.
      const conocidas = [...asistencias, ...enCola];
      // El modo de ESTE escaneo, que puede no ser el de la sesión: ver
      // `OpcionesEscaneo.modo`. Se arma una sesión efectiva en vez de tocar la
      // compartida, para no dejar el modo cambiado al salir de la pantalla.
      const suSesion = opciones?.modo ? { ...sesion, modo: opciones.modo } : sesion;
      let resultado = evaluarEscaneo({
        entrada,
        sesion: suSesion,
        participantes,
        asistencias: conocidas,
        estadoDe,
        ahora,
        diasDelTaller,
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
          const remoto = await evaluarEscaneoRemoto(entrada.trim(), suSesion.dia, suSesion.modo);
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

      return resultado;
    },
    [asistencias, enCola, sesion, estadoDe, enLinea, enVivo, participantes, diasDelTaller],
  );

  const registrar = useCallback<Ctx["registrar"]>(
    (resultado, opciones) => {
      const ahora = Date.now();
      const n = contadorEscaneos + 1;
      setContadorEscaneos(n);
      const h = horaActual(new Date(ahora));

      let asistencia: Asistencia | undefined;
      if (resultado.registra) {
        // Mismo modo efectivo que en `evaluar`: si aquí se leyera el de la
        // sesión, el pase de lista evaluaría como taller y registraría puerta.
        const suSesion = opciones?.modo ? { ...sesion, modo: opciones.modo } : sesion;
        asistencia = asistenciaDe(resultado, suSesion, ahora, h, n);
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
          escribir(
            "la asistencia",
            (d) =>
              d.guardarAsistencia({
                folio: asistencia!.folio,
                dia: asistencia!.dia,
                tipo: asistencia!.tipo,
                punto: asistencia!.punto,
                autorizacionMotivo: asistencia!.autorizacion?.nota,
                idRemoto: asistencia!.idRemoto,
              }),
            () => {
              /*
               * El fallo más caro de todo el sistema, y era el más callado.
               *
               * La pantalla ya pintó VERDE y ya sonó el pitido de «correcto»
               * cuando esto se entera. El caso típico no es quedarse sin red
               * —eso lo detecta `navigator.onLine` y la captura se va a la
               * cola— sino la red del recinto degradada sin llegar a caerse,
               * con setecientos teléfonos encima: las peticiones expiran y el
               * capturista sigue viendo verde en cada persona.
               *
               * Ahora SÍ se reencola, que es lo que no se podía hacer mientras
               * la cola no tenía quien la vaciara: la fila vuelve a lo
               * pendiente, se reintenta sola, y como lleva su propio `idRemoto`
               * el reintento no puede duplicarla aunque la primera hubiera
               * entrado sin que llegara la respuesta.
               *
               * NO se despinta del historial: la persona ya entró, y borrarla
               * le quitaría al capturista el único dato que le queda. Queda
               * marcada como pendiente, que es lo que de verdad es.
               */
              setEnCola((prev) =>
                prev.some((x) => x.id === asistencia!.id) ? prev : [...prev, asistencia!],
              );
              setCapturadas((prev) => prev.filter((x) => x.id !== asistencia!.id));
              setHistorial((prev) =>
                prev.map((h) =>
                  h.asistencia?.id === asistencia!.id ? { ...h, pendiente: true } : h,
                ),
              );
              avisarFallo(
                `La ${asistencia!.tipo} de ${asistencia!.nombre} (${asistencia!.folio}) quedó PENDIENTE. Se reintenta sola.`,
              );
            },
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
    [sesion, contadorEscaneos, enLinea, registrarBitacora],
  );

  const descartarEscaneo = useCallback<Ctx["descartarEscaneo"]>(
    (resultado, motivo) => {
      const n = contadorEscaneos + 1;
      setContadorEscaneos(n);
      registrarBitacora(
        "Escaneo descartado al verificar",
        `${resultado.participante?.folio ?? resultado.entradaCruda} · ${motivo} · día ${sesion.dia} · ${sesion.punto}`,
        sesion.capturista,
      );
      setHistorial((prev) => [
        {
          id: `H-${String(n).padStart(4, "0")}`,
          resultado: {
            ...resultado,
            color: "rojo",
            titulo: "DESCARTADO EN LA PUERTA",
            motivo,
            accion: "PASAR A MESA DE INCIDENCIAS",
            registra: false,
          },
          sesion,
          hora: horaActual(),
          pendiente: false,
        },
        ...prev,
      ]);
    },
    [contadorEscaneos, registrarBitacora, sesion],
  );

  const escanear = useCallback<Ctx["escanear"]>(
    async (entrada, opciones) => {
      const r = await evaluar(entrada, opciones);
      registrar(r, opciones);
      return r;
    },
    [evaluar, registrar],
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
    escribir(
      "la revisión",
      (d) => d.guardarRevision(id, estado, motivo),
      () => {
        /*
         * Se despinta la decisión, y aquí sí es lo correcto: un revisor al que
         * se le venció el token puede pasar cuarenta minutos pulsando A y R
         * viendo cómo todo se marca en verde, y al recargar encontrarse las
         * cuatrocientas evidencias otra vez en «pendiente». Devolverla a la cola
         * en el momento le cuesta un clic; descubrirlo al final le cuesta la
         * tanda entera.
         */
        setRevisiones((prev) => {
          const copia = { ...prev };
          delete copia[id];
          return copia;
        });
        setOrdenRevision((prev) => prev.filter((x) => x !== id));
        avisarFallo("No se pudo guardar la revisión. Vuelve a decidir esa evidencia.");
      },
    );
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
    escribir(
      "el deshacer de la revisión",
      (d) => d.deshacerRevisionRemota(id),
      () =>
        // No se rehace la decisión en pantalla: el revisor ya está mirando otra
        // cosa y volver a marcarla sola sería más desconcertante que decírselo.
        avisarFallo("No se pudo deshacer esa revisión: en la base sigue como estaba."),
    );
    return id;
  }, [ordenRevision]);

  // ------------------------------------------------------- configuración ---
  const actualizarConfiguracion = useCallback<Ctx["actualizarConfiguracion"]>((patch) => {
    setConfiguracion((prev) => ({ ...prev, ...patch }));
    const columnas = columnasDeConfiguracion(patch);
    if (Object.keys(columnas).length)
      escribir(
        "la configuración",
        (d) => d.guardarConfiguracion(columnas).then(() => d.olvidarPublico()),
        () =>
          /*
           * Aquí viven la CLABE, la cuota y la fecha límite. La pantalla ya dijo
           * «Configuración guardada. Las pantallas públicas ya la usan», así que
           * quien corrigió la cuenta bancaria se va tranquilo mientras los
           * depósitos siguen yendo a la vieja.
           *
           * No se revierte el borrador: quien acaba de teclear la CLABE buena no
           * quiere verla desaparecer, quiere poder volver a darle a guardar. Se
           * le nombran los campos para que sepa cuáles no llegaron.
           */
          avisarFallo(
            `NO se guardó la configuración (${Object.keys(columnas).join(", ")}). Vuelve a guardar.`,
          ),
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

    /*
     * El catálogo académico también tiene tablas propias.
     *
     * Hasta que la licenciatura modular obligó a distinguir el tope de un
     * programa del de su nivel, esto se editaba en pantalla y no se guardaba:
     * la pantalla lo advertía, y cambiarlo de verdad era escribir una
     * migración. Un tope que depende del plan de estudios no puede vivir así.
     *
     * Lo que la base no deja borrar —un programa con alumnos en el padrón— se
     * avisa nombrándolo. Es lo mismo que hace la importación con las filas que
     * rechaza: un borrado que no ocurre y no se dice es peor que uno que falla.
     */
    const catalogo = patch.catalogoAcademico;
    if (catalogo)
      escribir(
        "el catálogo académico",
        async (d) => {
          const rechazos = await d.guardarCatalogo(catalogo);
          d.olvidarPublico();
          for (const r of rechazos) avisarFallo(`No se pudo quitar ${r.que}: ${r.motivo}`);
        },
        () => avisarFallo("No se pudo guardar el catálogo académico."),
      );
  }, []);

  // ------------------------------------------------------------ talleres ---
  /*
   * El cupo ocupado ya no se cuenta aquí: llega contado desde `v_talleres`.
   *
   * Aquí había un memo que recorría los participantes para sumarlos por taller,
   * y ese cálculo era el problema, no su coste. Para el ASPIRANTE —que es quien
   * mira el catálogo antes de elegir— `participantes` está cerrada por las
   * políticas, así que la lista llegaba vacía y la suma daba siempre cero: el
   * catálogo anunciaba «30 lugares disponibles» con doscientos inscritos y el
   * botón «Seleccionar» no se desactivaba nunca.
   *
   * Contarlo en la base lo arregla para los dos lados a la vez, y de paso quita
   * el riesgo de que las dos cuentas discrepen: es la MISMA cifra que usa
   * `fn_exigir_lugar_en_taller` para cerrar la puerta.
   */
  const talleres = talleresBase;

  const getTaller = useCallback<Ctx["getTaller"]>(
    (id) => talleres.find((t) => t.id === id),
    [talleres],
  );

  const guardarTaller = useCallback<Ctx["guardarTaller"]>((t) => {
    let esAlta = false;
    setTalleresBase((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      esAlta = i === -1;
      if (i === -1) return [...prev, t];
      return prev.map((x) => (x.id === t.id ? t : x));
    });
    // `TallerBase.id` ES la clave corta (`T01`), no el uuid de la base: así lo
    // arma `aTallerBase` y así lo llama el personal. Se pasa con su nombre para
    // que la frontera con la base no vuelva a confundir una cosa con la otra.
    escribir(
      "el taller",
      /*
       * Una sola llamada: el taller y sus días pasan o no pasan juntos.
       *
       * Antes eran tres peticiones, y la del medio liberaba a quien quedaba
       * fuera de los días nuevos. Eso existía por la llave foránea
       * `(taller_id, dia)`, que impedía borrar una fila de `taller_dias`
       * mientras alguien siguiera inscrito con ese día. La migración 60 quitó
       * la llave, así que no hay a quién liberar ni orden que respetar: los días
       * se reescriben y las inscripciones se quedan donde están.
       */
      async (d) => {
        await d.guardarTallerRemoto({ ...t, clave: t.id, crear: esAlta });
        d.olvidarPublico();
      },
      (e) => {
        /*
         * El MOTIVO de la base, en pantalla y no solo en la consola.
         *
         * Aquí se decía «NO se guardó el taller T01. Quedó como estaba», y eso
         * es cierto y no sirve de nada: quien lo lee no sabe si le falta un
         * permiso, si la clave está tomada, si el cupo quedó por debajo de los
         * inscritos o si se cayó la red. El motivo bueno lo da la base —«Solo
         * administración puede editar los talleres», «No existe ningún taller
         * con la clave T01», «Un taller sin días no se imparte ningún día»— y
         * se estaba tirando.
         *
         * `mensajeDeError` traduce además los códigos que no son texto: una
         * violación de unicidad o un permiso que falta salían en crudo.
         */
        void import("@/lib/supabase").then(({ mensajeDeError }) =>
          avisarFallo(
            `${esAlta ? "NO se creó" : "NO se guardó"} el taller ${t.id}: ${mensajeDeError(e)}`,
          ),
        );
      },
    );
  }, []);

  /*
   * `liberarInscripcionesFueraDeDia` vivía aquí, y se fue con la migración 60.
   *
   * Liberaba la inscripción de quien quedaba con un taller fuera de su día,
   * porque la llave foránea `(taller_id, dia)` hacía que esa combinación fuera
   * imposible de guardar. Sin la llave no hay nada que liberar: un inscrito
   * cuyo taller cae otro día es un caso legítimo —va al Encuentro su día y al
   * taller la tarde en que se imparta—, no una fila que haya que arreglar.
   *
   * Quitarla no es limpieza: dejarla haría lo contrario de la regla nueva,
   * arrancándole el taller a quien acaba de elegirlo a propósito.
   */

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
    // Se guarda lo que había para poder devolverlo si la base rechaza.
    let previo: UsuarioInterno | undefined;
    let esAlta = false;
    setUsuarios((prev) => {
      const i = prev.findIndex((x) => x.id === u.id);
      previo = prev[i];
      esAlta = i === -1;
      if (i === -1) return [...prev, u];
      return prev.map((x) => (x.id === u.id ? u : x));
    });
    escribir(
      "el usuario",
      /*
       * Alta y edición son dos operaciones distintas, y confundirlas era el
       * defecto: el alta hacía un `update` sobre un identificador inventado
       * —`U01` sobre una columna `uuid`— que no podía encontrar ninguna fila.
       *
       * El alta busca a la persona por su CORREO entre las cuentas de Auth que
       * ya existen, porque `usuarios_internos.id` las referencia y una cuenta no
       * se crea desde el navegador. La edición sigue yendo por identificador,
       * que para alguien que ya está es lo correcto.
       */
      async (d) => {
        if (esAlta) {
          const id = await d.altaUsuarioRemota({
            correo: u.correo,
            nombre: u.nombre,
            rol: rolHaciaBase(u.rol),
          });
          // El identificador bueno es el de su cuenta, no el que inventó la
          // pantalla: sin esto, editarla después volvería a no encontrar nada.
          setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, id } : x)));
          return;
        }
        await d.guardarUsuarioRemoto({ ...u, rol: rolHaciaBase(u.rol) });
      },
      () => {
        /*
         * Esta pantalla decide quién entra y con qué rol, así que una escritura
         * que se pierde en silencio deja a alguien creyendo que dio de alta a un
         * revisor que nunca podrá entrar, o que le cambió el rol a alguien que
         * sigue con el anterior.
         */
        setUsuarios((prev) =>
          previo
            ? prev.map((x) => (x.id === u.id ? previo! : x))
            : prev.filter((x) => x.id !== u.id),
        );
        /*
         * El motivo más probable de un alta fallida es que esa persona todavía
         * no tenga cuenta de acceso, y eso tiene un paso concreto que dar. Se
         * nombra aquí en vez de dejar un «vuelve a intentarlo» que invita a
         * repetir lo mismo con el mismo resultado; el mensaje exacto de la base
         * llega igual por el aviso de `escribir`.
         */
        avisarFallo(
          esAlta
            ? `NO se dio de alta a ${u.nombre}. Si no tiene cuenta, invítala antes por correo desde Supabase Auth.`
            : `NO se guardó ${u.nombre}. Quedó como estaba: vuelve a intentarlo.`,
        );
      },
    );
  }, []);

  const eliminarUsuario = useCallback<Ctx["eliminarUsuario"]>((id) => {
    let previo: UsuarioInterno | undefined;
    setUsuarios((prev) => {
      previo = prev.find((u) => u.id === id);
      return prev.filter((u) => u.id !== id);
    });
    // Desactiva, no borra: sin la fila, cada entrada de bitácora que esa persona
    // firmó se quedaría sin autor.
    escribir(
      "la baja del usuario",
      (d) => d.desactivarUsuarioRemoto(id),
      () => {
        /*
         * El peor de los nueve silencios, porque es de seguridad: la fila
         * desaparecía de la pantalla y `usuarios_internos.activo` seguía en
         * `true`. Esa persona conservaba su sesión, su rol y su capacidad de
         * registrar asistencias, y quien la dio de baja creía lo contrario.
         */
        if (previo) setUsuarios((prev) => [...prev, previo!]);
        avisarFallo(
          `NO se dio de baja a ${previo?.nombre ?? id}: SIGUE CON ACCESO. Vuelve a intentarlo.`,
        );
      },
    );
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

  // --------------------------------------------------- reparto de días ---
  /**
   * Asigna un día a un conjunto de alumnos, con todo lo que eso arrastra.
   *
   * Es la función de fondo: mover a alguien de día no es cambiar un número,
   * cambia el lugar al que tiene que ir. Esa cadena vive en un solo sitio para
   * que la usen igual el cambio de una persona y el de una sede entera.
   *
   * Lo que ya NO arrastra es el taller. Hasta la migración 60 le arrancaba la
   * inscripción a quien cambiaba a un día en que su taller no se impartía,
   * porque la llave foránea `(taller_id, dia)` no admitía esa fila. Ahora el
   * taller es independiente del día del evento, así que mover a alguien del día
   * 1 al 3 le conserva su taller: irá al Encuentro el 3 y al taller la tarde
   * del 1, en la UPN.
   *
   * Trabaja sobre el conjunto completo en una sola pasada en vez de llamarse a
   * sí misma por alumno: con dos mil matrículas, una actualización de estado
   * por cabeza recorre la lista dos mil veces y la pantalla se congela.
   */
  const asignarDiaAVarios = useCallback<Ctx["asignarDiaAVarios"]>(
    (matriculas, dia) => {
      const conjunto = new Set(matriculas);
      if (!conjunto.size) return { movidos: 0 };

      setPadron((prev) => prev.map((a) => (conjunto.has(a.matricula) ? { ...a, dia } : a)));

      const lugar = infoDia(dia).lugar;
      const ajustes: Record<string, Partial<Participante>> = {};
      let movidos = 0;

      for (const p of participantes) {
        if (!p.matricula || !conjunto.has(p.matricula) || p.dia === dia) continue;
        movidos += 1;
        // El día y la sede del Encuentro, y nada más. El taller se queda.
        ajustes[p.folio] = { dia, lugar };
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
      return { movidos };
    },
    [participantes, infoDia],
  );

  const reasignarDia = useCallback<Ctx["reasignarDia"]>(
    (matricula, dia) => {
      const p = participantes.find((x) => x.matricula === matricula);
      asignarDiaAVarios([matricula], dia);
      // `movido` dice si esa persona tenía registro de participante, no si el
      // día cambió: sin registro no hay a quién avisar.
      return { movido: !!p };
    },
    [participantes, asignarDiaAVarios],
  );

  const repartoPorDia = useCallback<Ctx["repartoPorDia"]>(
    () =>
      ([1, 2, 3] as Dia[]).map((dia) => {
        const total = padron.filter((a) => a.dia === dia).length;
        const cupo = infoDia(dia).cupo;
        return { dia, total, cupo, libres: Math.max(cupo - total, 0) };
      }),
    [padron, infoDia],
  );

  const sinDiaAsignado = useCallback<Ctx["sinDiaAsignado"]>(
    () => padron.filter((a) => !a.dia),
    [padron],
  );

  /**
   * Se reparte uno por uno al día que vaya proporcionalmente más vacío, y
   * ninguno pasa de su aforo.
   *
   * **Proporcionalmente, no «el que tenga menos gente»**, que es lo que hacía
   * antes. Daba igual mientras las tres sedes admitían lo mismo; dejó de darlo
   * cuando el día 3 pasó al Teatro Victoria, que admite 600 frente a los 700 del
   * salón SUTERM. Repartir al de menos gente habría mandado a todo el mundo al
   * día 3 hasta empatar con los otros dos, y el día 3 se habría llenado primero
   * siendo el más pequeño. Mirando el porcentaje de ocupación, los tres se
   * llenan a la vez.
   *
   * Quien no cabe en ninguno se queda sin día, y se devuelve contado en
   * `sinLugar`. Antes esto no podía pasar y por eso no existía: el reparto no
   * tenía techo. Ahora puede, y la alternativa —dejarlo en un día que ya está
   * lleno— sería peor: le prometería un lugar que el pre-registro le va a negar
   * después, cuando ya nadie pueda hacer nada.
   */
  const repartirDiasPendientes = useCallback<Ctx["repartirDiasPendientes"]>(() => {
    const pendientes = padron.filter((a) => !a.dia);
    const conteo = new Map<Dia, number>(
      ([1, 2, 3] as Dia[]).map((d) => [d, padron.filter((a) => a.dia === d).length]),
    );
    const cupos = new Map<Dia, number>(([1, 2, 3] as Dia[]).map((d) => [d, infoDia(d).cupo]));

    /*
     * Un aforo en 0 es «todavía no cargado», no «no cabe nadie». Pasa con
     * `CONFIGURACION_VACIA`, antes de que la base responda.
     *
     * Con techos desconocidos NO se reparte a medias: se vuelve al reparto por
     * conteo, sin tope, que es exactamente lo que hacía esta función antes de
     * que el aforo existiera. Tomar el 0 al pie de la letra habría dejado a todo
     * el padrón «sin lugar» y habría hecho parecer que el evento está agotado
     * cuando lo único que pasa es que la configuración no ha llegado.
     */
    const hayAforo = ([1, 2, 3] as Dia[]).every((d) => cupos.get(d)! > 0);

    const asignaciones = new Map<string, Dia>();
    let sinLugar = 0;
    for (const a of pendientes) {
      const conSitio = hayAforo
        ? ([1, 2, 3] as Dia[]).filter((d) => conteo.get(d)! < cupos.get(d)!)
        : ([1, 2, 3] as Dia[]);
      if (conSitio.length === 0) {
        sinLugar++;
        continue;
      }
      const carga = (d: Dia) => (hayAforo ? conteo.get(d)! / cupos.get(d)! : conteo.get(d)!);
      const dia = conSitio.reduce((mejor, d) => (carga(d) < carga(mejor) ? d : mejor));
      conteo.set(dia, conteo.get(dia)! + 1);
      asignaciones.set(a.matricula, dia);
    }
    if (asignaciones.size) {
      setPadron((prev) =>
        prev.map((a) =>
          asignaciones.has(a.matricula) ? { ...a, dia: asignaciones.get(a.matricula)! } : a,
        ),
      );
      escribir(
        `el reparto de ${asignaciones.size} días`,
        async (d) => {
          // Se agrupa por día para no mandar una petición por alumno: son tres
          // actualizaciones en vez de dos mil.
          for (const dia of [1, 2, 3] as Dia[]) {
            const suyas = [...asignaciones].filter(([, x]) => x === dia).map(([m]) => m);
            if (suyas.length) await d.asignarDiaRemoto(suyas, dia);
          }
        },
        () =>
          /*
           * Las tres escrituras van en secuencia, así que un fallo a mitad deja
           * el día 1 repartido y los otros dos no. Revertir en pantalla sería
           * mentir en la otra dirección —parte del reparto SÍ se aplicó— así
           * que lo honesto es decir que quedó a medias y pedir que se recargue
           * para ver lo que de verdad hay.
           */
          avisarFallo(
            `El reparto de ${asignaciones.size} días quedó A MEDIAS. Recarga para ver cuáles se aplicaron.`,
          ),
      );
      registrarBitacora(
        "Repartió los días del padrón",
        `${asignaciones.size} alumnos sin día quedaron repartidos: ${([1, 2, 3] as Dia[])
          .map((d) => `día ${d} ${conteo.get(d)}/${cupos.get(d)}`)
          .join(", ")}` +
          (sinLugar > 0 ? `. ${sinLugar} se quedaron sin día: los tres llegaron a su aforo` : ""),
      );
    }
    // El aforo se agotó y no se movió a nadie: no hay reparto que anotar, pero
    // sí una decisión que alguien tiene que tomar, y la bitácora es donde se
    // busca después qué pasó ese día.
    if (asignaciones.size === 0 && sinLugar > 0)
      registrarBitacora(
        "No pudo repartir los días del padrón",
        `${sinLugar} alumnos siguen sin día: los tres días llegaron a su aforo (${(
          [1, 2, 3] as Dia[]
        )
          .map((d) => `día ${d} ${conteo.get(d)}/${cupos.get(d)}`)
          .join(", ")})`,
      );
    return {
      asignados: asignaciones.size,
      sinLugar,
      porDia: ([1, 2, 3] as Dia[]).map((dia) => {
        const total = conteo.get(dia)!;
        const cupo = cupos.get(dia)!;
        return { dia, total, cupo, libres: Math.max(cupo - total, 0) };
      }),
    };
  }, [padron, registrarBitacora, infoDia]);

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

  // --------------------------------------------------------------- red ---
  /*
   * Escribía tres estados DENTRO de los actualizadores de otros dos.
   *
   * Un actualizador tiene que ser puro: React lo vuelve a ejecutar cuando le
   * conviene —en desarrollo lo hace siempre, a propósito—, y cada repetición
   * volvía a meter la cola entera en las asistencias capturadas. Recuperar la
   * red podía duplicar lo que se había registrado sin ella, que es justo lo que
   * la cola existe para evitar.
   *
   * La cola se lee de su propio estado, no del actualizador, y las tres
   * escrituras quedan una detrás de otra. React las agrupa en la misma pintura.
   */
  const alternarConexion = useCallback(() => {
    const volviendo = !enLinea;
    setEnLinea(volviendo);
    /*
     * Aquí estaba el peor de los dos caminos: esto movía la cola a «capturadas»,
     * marcaba el historial como sincronizado y la vaciaba —borrándola también de
     * `localStorage`, por el efecto de persistencia— SIN escribir nada. Pulsar
     * «Reconectar» destruía lo pendiente y dejaba la pantalla afirmando que se
     * había guardado.
     *
     * Ahora solo cambia el interruptor. Quien sincroniza es `vaciarCola`, que ya
     * corre con el efecto de `enLinea` y saca cada fila de la cola únicamente
     * cuando la base acusa recibo.
     */
  }, [enLinea]);

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
      evaluar,
      registrar,
      descartarEscaneo,
      deshacerUltimo,
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
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
      asignarDiaAVarios,
      /*
       * Lo de esta sesión primero y lo ya anotado debajo, que es el orden en
       * que se busca: se entra a la bitácora a comprobar lo que se acaba de
       * hacer, o a buscar hacia atrás. Las dos mitades van juntas en una sola
       * lista para que los filtros y la exportación las alcancen por igual;
       * la columna de origen las distingue.
       *
       * No se deduplica: la anotación que este navegador acaba de escribir en
       * la base no vuelve hasta la siguiente carga, y cuando vuelva ya no
       * estará la copia de sesión.
       */
      bitacora: bitacoraDeVista,
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
      evaluar,
      registrar,
      descartarEscaneo,
      deshacerUltimo,
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
      repartoPorDia,
      sinDiaAsignado,
      repartirDiasPendientes,
      reasignarDia,
      asignarDiaAVarios,
      bitacoraDeVista,
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
