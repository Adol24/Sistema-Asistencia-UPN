/**
 * La capa que habla con Supabase.
 *
 * Las pantallas no la usan directamente: el contexto compartido carga de aquí al
 * arrancar y escribe de vuelta en cada cambio. Esa fue la razón de que el estado
 * viviera en un solo lugar desde el principio, y es lo que permite conectar la
 * base sin tocar las 33 pantallas.
 *
 * **Se carga todo de una vez.** Con 60 participantes es correcto y mantiene la
 * interfaz síncrona que ya usan las pantallas. Con 2 500 no lo será: habrá que
 * paginar y pasar a consultas por módulo. Está anotado como pendiente en el
 * informe, y es el primer límite que se va a topar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { exigirBase, supabase } from "@/lib/supabase";
import {
  aAlumnoPadron,
  aAsistencia,
  aFechaHora,
  aCaso,
  aEntradaBitacora,
  aCatalogo,
  aConfiguracion,
  aEvidencia,
  aPago,
  aParticipante,
  aTallerBase,
  aUsuario,
  type FilaAsistencia,
  type FilaBitacora,
  type FilaCaso,
  type FilaConfiguracion,
  type FilaDia,
  type FilaEstadoPago,
  type FilaEvidencia,
  type FilaNivel,
  type FilaPadron,
  type FilaPago,
  type FilaParticipante,
  type FilaTaller,
  type FilaUsuario,
} from "@/lib/esquema";
import type {
  AlumnoPadron,
  Asistencia,
  CasoSoporte,
  Dia,
  EstadoPago,
  Evidencia,
  Participante,
  TallerBase,
  UsuarioInterno,
} from "@/dominio/tipos";
import type { ConfiguracionEvento, DiaEvento } from "@/lib/configuracion";
import type { NivelAcademico } from "@/dominio/catalogos";
// Solo los tipos: `@/lib/ventanas` arrastra React, y este módulo lo carga
// también el servidor para pintar lo público antes de que haya navegador.
import type { PerfilSinPadron, ProgramaDeVentana, VentanaPreregistro } from "@/lib/ventanas";
import type { Modo } from "@/lib/escaneo";
import { fechaAIso } from "@/lib/formato";
import { resultadoDe, type PagoRegistrado } from "@/lib/pagos-logica";
import type { EntradaBitacora } from "@/lib/contrato-estado";

/** Todo lo que el contexto necesita para arrancar. */
export interface Instantanea {
  configuracion: ConfiguracionEvento;
  sedes: string[];
  talleresBase: TallerBase[];
  /** De la clave corta (`T01`) al uuid de la base, para poder escribir después. */
  idPorClave: Record<string, string>;
  participantes: Participante[];
  /**
   * Los pagos ya registrados. Llegan vacíos para quien no puede leerlos
   * —`pagos_lectura` es de administración, financieros y soporte—, y eso es
   * correcto: el estado que necesita la puerta viaja aparte, ya derivado, en
   * cada participante.
   */
  pagos: PagoRegistrado[];
  padron: AlumnoPadron[];
  asistencias: Asistencia[];
  evidencias: Evidencia[];
  usuarios: UsuarioInterno[];
  casos: CasoSoporte[];
  /**
   * Lo ya anotado en la bitácora.
   *
   * Llega vacía para quien no puede leerla —`bitacora_lectura` es de
   * administración y soporte—, igual que los pagos. Se pide un tope de
   * registros y no la tabla entera: en un evento de cinco mil personas esto
   * crece por miles y la pantalla lo que necesita es lo reciente.
   */
  bitacora: EntradaBitacora[];
}

/*
 * El nivel se pide DENTRO de `programas`, y no es un capricho de estilo.
 *
 * PostgREST solo sabe enlazar dos tablas si hay una llave foránea que las una.
 * `participantes.nivel_id` no tiene la suya: la única que existe es la
 * compuesta `(programa_id, nivel_id) -> programas (id, nivel_id)`. Pedir
 * `niveles_academicos ( nivel )` al mismo nivel que las demás columnas era, por
 * tanto, imposible de resolver, y la respuesta completa se perdía:
 *
 *   [PGRST200] Could not find a relationship between 'participantes'
 *              and 'niveles_academicos' in the schema cache
 *
 * Un embed que no resuelve no devuelve esa columna vacía: **tumba la consulta
 * entera**. Por eso Servicios Financieros abría sin un solo participante aunque
 * la sesión, el rol y las políticas estuvieran bien. Comprobado contra el
 * proyecto real, no deducido.
 *
 * `programas` sí enlaza con `niveles_academicos` por su propia `nivel_id`, así
 * que el nivel se alcanza en dos saltos y la consulta vuelve a resolver.
 */
const COLS_PARTICIPANTE = `
  id, folio, perfil, matricula, nombre, nombre_en_revision, correo, celular,
  institucion, avance, grupo, dia, taller_id, monto_esperado_evento,
  monto_esperado_taller, creado_en,
  programas ( nombre, niveles_academicos ( nivel ) ), planteles ( nombre )
`;

/**
 * El pago guarda `participante_id`, pero todo lo demás en la aplicación habla
 * de folios. La llave foránea a `participantes` existe y es simple, así que el
 * folio se trae en la misma consulta en vez de cruzarlo después a mano.
 */
const COLS_PAGO = `
  id, concepto, monto, monto_esperado, referencia, fecha_deposito,
  resultado, origen, nota, registrado_en, participantes ( folio )
`;

/** El padrón arrastra exactamente el mismo enlace, y el mismo arreglo. */
const COLS_PADRON = `
  matricula, nombre, avance, grupo, dia,
  programas ( nombre, niveles_academicos ( nivel ) ), planteles ( nombre )
`;

/** Lo que cualquiera puede leer: el evento, sus días, el catálogo y los talleres. */
export interface Publico {
  configuracion: ConfiguracionEvento;
  /** Las sedes donde estudian los alumnos, para validar el padrón al importar. */
  sedes: string[];
  talleresBase: ReturnType<typeof aTallerBase>[];
  idPorClave: Record<string, string>;
}

/**
 * Carga solo lo público.
 *
 * Se separa de `cargarTodo` para poder pedirla en el servidor, antes de pintar.
 * El nombre del evento y las fechas llegaban después de la primera pintura, así
 * que la portada aparecía un instante sin título y luego se rellenaba. Con esto
 * el HTML sale ya completo.
 *
 * Son exactamente las tablas que el rol anónimo puede leer, así que esta llamada
 * no falla por permisos ni para un visitante sin sesión.
 */
/*
 * Caché de lo público, con vida corta.
 *
 * Ahora que esto se pide en el servidor antes de pintar, se consultaría la base
 * en CADA visita para un dato que cambia dos veces en la vida del evento. Medido
 * en desarrollo, la portada tardaba cerca de un segundo por ese viaje.
 *
 * Se guarda por proceso, no por persona: es información pública e idéntica para
 * todo el mundo, así que no hay nada de nadie que se pueda filtrar aquí. Y medio
 * minuto es poco para que a alguien le moleste ver el nombre del evento
 * desactualizado, y suficiente para que una ráfaga de visitas no se convierta en
 * una ráfaga de consultas.
 */
const VIDA_CACHE = 30_000;
let cachePublico: { en: number; valor: Publico } | null = null;

/** Se llama al editar la configuración, para que el cambio se vea sin esperar. */
export function olvidarPublico(): void {
  cachePublico = null;
}

export async function cargarPublico(): Promise<Publico | null> {
  if (!supabase) return null;
  const sb = supabase;

  if (cachePublico && Date.now() - cachePublico.en < VIDA_CACHE) return cachePublico.valor;

  const [cfg, dias, niveles, talleres, sedes] = await Promise.all([
    sb.from("configuracion_evento").select("*").eq("id", 1).single(),
    sb.from("dias_evento").select("*").order("dia"),
    sb
      .from("niveles_academicos")
      .select(
        "id, nivel, etiqueta_avance, total_avance, orden, programas ( nombre, etiqueta_avance, total_avance )",
      ),
    sb.from("talleres").select("*, taller_dias ( dia )").order("clave"),
    sb.from("planteles").select("nombre").order("nombre"),
  ]);

  const error = cfg.error ?? dias.error ?? niveles.error ?? talleres.error;
  if (error) throw error;

  const configuracion = aConfiguracion(
    cfg.data as unknown as FilaConfiguracion,
    (dias.data ?? []) as unknown as FilaDia[],
    aCatalogo((niveles.data ?? []) as unknown as FilaNivel[]),
  );

  const filasTaller = (talleres.data ?? []) as unknown as FilaTaller[];
  const idPorClave: Record<string, string> = {};
  for (const t of filasTaller) idPorClave[t.clave] = t.id;

  const valor: Publico = {
    configuracion,
    sedes: ((sedes.data ?? []) as { nombre: string }[]).map((p) => p.nombre),
    talleresBase: filasTaller.map(aTallerBase),
    idPorClave,
  };
  cachePublico = { en: Date.now(), valor };
  return valor;
}

/**
 * Cuántas filas trae PostgREST de una vez, y el tope que se pide por tramo.
 *
 * Mil es el `max-rows` con el que viene un proyecto de Supabase. Pedir tramos de
 * ese tamaño hace que la última página venga corta justo cuando se acabó la
 * tabla, que es la señal con la que `porTramos` sabe parar.
 */
const TRAMO = 1000;

/**
 * Techo de tramos por consulta. Existe solo para que un servidor que ignorara
 * `range` no deje al navegador pidiendo páginas para siempre contra la base de
 * producción. Cien tramos son cien mil filas: muy por encima de cualquier tabla
 * de este evento, y muy por debajo de un bucle infinito.
 */
const MAX_TRAMOS = 100;

/**
 * Filas, o el error que tumbó la consulta. La forma en que PostgREST contesta a
 * una LECTURA; `Respuesta`, más abajo, es la de una escritura.
 */
interface RespuestaLectura {
  data: unknown[] | null;
  error: { message: string; code?: string; hint?: string } | null;
}

/**
 * Trae una tabla COMPLETA, por tramos.
 *
 * PostgREST no devuelve todo lo que se le pide: tiene un tope de filas por
 * respuesta y lo aplica **en silencio**. No es un error, y la respuesta no trae
 * ninguna señal de que falte algo — llegan mil filas y parecen la tabla entera.
 *
 * Ese silencio costó un fallo de los que no se ven hasta que los datos crecen.
 * `padron_alumnos` se pedía de un tirón, y un padrón de Servicios Escolares trae
 * miles: la aplicación solo conocía a los mil primeros por matrícula. El
 * importador, que reconoce a quien ya está cargado buscándolo en esa lista, daba
 * por **alta nueva** a todos los demás, así que volver a subir el mismo archivo
 * no los detectaba como ya cargados. Y el reparto de días contaba su aforo sobre
 * ese mismo padrón recortado.
 *
 * Quien llama tiene que ordenar por algo **único y estable**. No es un detalle
 * de estilo: paginar sobre un orden con empates deja filas repetidas en un tramo
 * y omitidas en el siguiente, y eso es peor que traer de menos, porque no se
 * nota. Por eso las consultas que ordenan por una fecha añaden `id` detrás.
 */
async function porTramos(pedir: (desde: number, hasta: number) => PromiseLike<RespuestaLectura>) {
  const todo: unknown[] = [];
  for (let tramo = 0; tramo < MAX_TRAMOS; tramo++) {
    const desde = tramo * TRAMO;
    const r = await pedir(desde, desde + TRAMO - 1);
    if (r.error) return { data: null, error: r.error };
    const lote = r.data ?? [];
    todo.push(...lote);
    // Un tramo corto es el final de la tabla. Uno exacto puede no serlo, así que
    // se pide el siguiente aunque venga vacío.
    if (lote.length < TRAMO) return { data: todo, error: null };
  }
  console.error(
    `Una consulta pasó de ${MAX_TRAMOS * TRAMO} filas y se cortó ahí. Las pantallas que la usen estarán incompletas.`,
  );
  return { data: todo, error: null };
}

/**
 * @param conSesion Si quien pregunta ya se identificó como personal interno.
 *   Solo cambia cómo se REPORTA el fallo de las tablas del personal, nunca lo
 *   que se pide: sin sesión el 401 es lo esperado y callarlo es correcto; con
 *   sesión significa que a esa cuenta le falta permiso o su fila en
 *   `usuarios_internos`, y eso tiene que verse aunque nadie abra las
 *   herramientas de desarrollo.
 */
export async function cargarTodo(conSesion = false): Promise<Instantanea | null> {
  if (!supabase) return null;
  const sb = supabase;

  const publico = await cargarPublico();
  if (!publico) return null;
  const { configuracion } = publico;
  const lugarPorDia = (d: Dia) =>
    configuracion.dias.find((x) => x.dia === d)?.lugar ?? configuracion.dias[0]!.lugar;

  /*
   * Lo del personal solo llega si quien pregunta tiene permiso.
   *
   * Aquí decía que las políticas devuelven cero filas en vez de un error, y no
   * es verdad: sin permiso de SELECT sobre la tabla, PostgREST responde 401
   * antes de que ninguna política se evalúe. Comprobado contra el proyecto real
   * con la clave publicable: las seis tablas del personal dan 401.
   *
   * La diferencia importaba mucho más de lo que parecía. Un solo error tumbaba
   * la carga entera, así que un visitante anónimo se quedaba SIN la
   * configuración del evento —que sí puede leer— y las pantallas públicas salían
   * sin nombre ni fechas.
   *
   * Ahora se piden aparte y su fallo no arrastra al resto: quien no tiene
   * permiso recibe listas vacías, que es lo que ya se decía que pasaba.
   */
  const [
    participantes,
    estadoPago,
    pagos,
    padron,
    asistencias,
    evidencias,
    usuarios,
    casos,
    talleresConSesion,
    bitacora,
  ] = await Promise.all([
    porTramos((desde, hasta) =>
      sb.from("participantes").select(COLS_PARTICIPANTE).order("folio").range(desde, hasta),
    ),
    /*
     * El estado derivado, que puede leer cualquier miembro del personal.
     * Sostiene el semáforo de la puerta sin enseñarle al capturista cuánto
     * pagó nadie ni con qué referencia.
     */
    porTramos((desde, hasta) =>
      sb
        .from("v_estado_pago")
        .select("participante_id, concepto, estado")
        // La vista tiene una fila por participante y concepto, así que las dos
        // columnas juntas son su clave y dan el orden estable que el tramo pide.
        .order("participante_id")
        .order("concepto")
        .range(desde, hasta),
    ),
    /*
     * Los pagos completos. Solo los ve quien puede cobrarlos o auditarlos; a
     * los demás las políticas les devuelven cero filas, sin error.
     *
     * Se ordenan del más antiguo al más reciente porque `estadoDePagos`
     * recorre la lista al revés y se queda con la primera coincidencia: el
     * último pago de un concepto es el que manda, y ese orden es el que lo
     * garantiza.
     */
    porTramos((desde, hasta) =>
      sb
        .from("pagos")
        .select(COLS_PAGO)
        // `id` detrás de la fecha: dos pagos del mismo instante empatan, y un
        // empate al paginar repite filas en un tramo y las pierde en el otro.
        .order("registrado_en")
        .order("id")
        .range(desde, hasta),
    ),
    porTramos((desde, hasta) =>
      sb.from("padron_alumnos").select(COLS_PADRON).order("matricula").range(desde, hasta),
    ),
    porTramos((desde, hasta) =>
      sb
        .from("asistencias")
        .select(
          "id, dia, tipo, registrada_en, punto, autorizacion_motivo, autorizada_por, participantes ( folio, nombre ), capturista:capturista_id ( nombre ), supervisor:autorizada_por ( nombre )",
        )
        .is("anulada_en", null)
        // `id` detrás de la fecha: dos registros del mismo instante empatan, y
        // un empate al paginar repite filas en un tramo y las pierde en el otro.
        .order("registrada_en")
        .order("id")
        .range(desde, hasta),
    ),
    porTramos((desde, hasta) =>
      sb
        .from("evidencias")
        .select(
          "id, dia, archivo_url, hash_archivo, estado, subida_en, participantes ( folio, nombre, matricula )",
        )
        // Por día hay miles de empates: sin `id` detrás, paginar sobre `dia`
        // devolvería unas evidencias dos veces y otras ninguna.
        .order("dia")
        .order("id")
        .range(desde, hasta),
    ),
    // `usuarios_internos` y `casos_soporte` se piden enteros a propósito: son
    // decenas de filas, no miles, y no alimentan ningún recuento que se falsee
    // si faltara una. La bitácora ya tiene su propio tope, más abajo.
    sb.from("usuarios_internos").select("*").order("nombre"),
    sb
      .from("casos_soporte")
      .select(
        "id, clave, asunto, detalle, estado, canal, creado_en, usuarios_internos ( nombre ), participantes ( folio, nombre )",
      )
      .order("creado_en", { ascending: false }),
    /*
     * Los talleres se vuelven a pedir aquí, con la sesión puesta, en vez de
     * heredarlos de `cargarPublico`.
     *
     * **Este era el fallo que dejó cuatro talleres apagados sin forma de
     * encenderlos.** `talleres_lectura` es `using (activo or
     * es_interno_activo())`, así que un taller inactivo solo se ve con sesión.
     * Y `cargarPublico` se pide también desde el servidor, antes de pintar,
     * donde no hay sesión de nadie —y su resultado se guarda en caché medio
     * minuto—: el panel recibía la lista que ve un anónimo.
     *
     * De ahí que `/admin/talleres` no listara T01 a T04 y que su distintivo de
     * «Inactivo» fuera código muerto: para que se pintara, tenía que llegar un
     * taller inactivo, y nunca llegaba ninguno. Quien los apagó desde el panel
     * los perdió de vista en el mismo clic.
     */
    sb.from("talleres").select("*, taller_dias ( dia )").order("clave"),
    /*
     * Lo ya anotado en la bitácora, de lo más reciente hacia atrás.
     *
     * Se pide con tope. La bitácora no se poda —no tiene política de DELETE, es
     * inmutable a propósito— así que en un evento de cinco mil personas crece
     * por miles de filas, y traerlas todas para pintar una tabla que pagina de
     * diez sería pagar el histórico entero en cada carga. Lo que la pantalla
     * contesta es «quién hizo esto», y eso se pregunta sobre lo reciente.
     */
    sb
      .from("bitacora")
      .select("id, accion, detalle, ocurrido_en, usuario_texto, usuarios_internos ( nombre )")
      .order("ocurrido_en", { ascending: false })
      .limit(500),
  ]);

  // No se lanza: sin sesión de personal estas consultas fallan por diseño, y lo
  // público ya se cargó arriba. Solo lo público es imprescindible.
  // Los pagos y el estado derivado entran en la comprobación aunque las
  // políticas nunca los hagan fallar por rol —filtran filas, no dan error—,
  // porque lo que sí puede romperlos es un enlace mal escrito, y ese fallo ya
  // pasó inadvertido una vez.
  const sinPermiso =
    participantes.error ??
    estadoPago.error ??
    pagos.error ??
    padron.error ??
    asistencias.error ??
    evidencias.error;
  if (sinPermiso && conSesion)
    console.error(
      "Hay sesión pero las tablas del personal responden sin permiso; las pantallas internas saldrán vacías.",
      sinPermiso.message,
    );
  else if (sinPermiso && import.meta.env.DEV)
    console.info("Sin permiso para las tablas del personal; se cargan vacías.", sinPermiso.message);

  /*
   * El estado derivado, indexado por participante y concepto. Se arma antes de
   * mapear a los participantes porque cada uno lo consulta una vez, y recorrer
   * la lista entera por cada participante sería cuadrático.
   */
  const porParticipante = new Map<string, EstadoPago>();
  for (const e of (estadoPago.data ?? []) as unknown as FilaEstadoPago[])
    porParticipante.set(`${e.participante_id}:${e.concepto}`, e.estado);
  const estadoDeriva = (id: string, concepto: "evento" | "taller") =>
    porParticipante.get(`${id}:${concepto}`);

  /*
   * Con sesión mandan los talleres recién pedidos, que incluyen los inactivos.
   * Sin ella —o si esa consulta falló— se cae a los del caché público, que son
   * los activos: es lo mismo que ve un visitante, y es lo correcto ahí.
   */
  const filasTaller = (talleresConSesion.data ?? []) as unknown as FilaTaller[];
  const talleresBase = filasTaller.length ? filasTaller.map(aTallerBase) : publico.talleresBase;
  const idPorClave = filasTaller.length
    ? Object.fromEntries(filasTaller.map((t) => [t.clave, t.id]))
    : publico.idPorClave;

  return {
    configuracion,
    sedes: publico.sedes,
    talleresBase,
    idPorClave,
    participantes: ((participantes.data ?? []) as unknown as FilaParticipante[]).map((p) =>
      aParticipante(p, lugarPorDia, estadoDeriva),
    ),
    pagos: ((pagos.data ?? []) as unknown as FilaPago[]).map(aPago),
    padron: ((padron.data ?? []) as unknown as FilaPadron[]).map(aAlumnoPadron),
    asistencias: ((asistencias.data ?? []) as unknown as FilaAsistencia[]).map(aAsistencia),
    evidencias: ((evidencias.data ?? []) as unknown as FilaEvidencia[]).map((e) =>
      // La vista no trae intentos ni el motivo del último rechazo; se completan
      // con lo que la pantalla de revisión necesita y la base sí guarda aparte.
      aEvidencia({ ...e, intentos: 1, motivo_rechazo: null, revisor: null }),
    ),
    usuarios: ((usuarios.data ?? []) as unknown as FilaUsuario[]).map(aUsuario),
    casos: ((casos.data ?? []) as unknown as FilaCaso[]).map(aCaso),
    bitacora: ((bitacora.data ?? []) as unknown as FilaBitacora[]).map(aEntradaBitacora),
  };
}

// ============================================================== escrituras ===

/**
 * Cada escritura devuelve una promesa que el contexto **no espera**: la pantalla
 * ya se actualizó en memoria, y la base confirma después. Es lo que mantiene el
 * escaneo instantáneo en la puerta, que era un requisito desde el principio.
 *
 * A cambio, un fallo de red no revierte lo que se ve. Está anotado: hace falta
 * una cola de reintento como la que ya existe para los escaneos sin conexión.
 */

/** Lo que responde PostgREST: los datos, o el motivo por el que no hay. */
type Respuesta = { error: { message: string } | null };

/**
 * Ejecuta una escritura y lanza si la base la rechazó.
 *
 * `const { error } = await …; if (error) throw error;` estaba veintisiete veces
 * en este archivo, una por escritura. Repetido tantas veces deja de leerse, y
 * omitirlo no se nota desde la pantalla: la escritura falla en silencio y lo
 * que se ve —que se actualizó en memoria antes de escribir— sigue enseñando lo
 * que no se guardó. Ya pasó dos veces, con los días de un taller y con el
 * estado de un caso. Con la comprobación en un solo sitio, saltársela deja de
 * ser posible.
 */
async function exigir(consulta: PromiseLike<Respuesta>): Promise<void> {
  const { error } = await consulta;
  if (error) throw error;
}

/** Igual que `exigir`, para cuando además hace falta lo que devolvió. */
async function datosDe<T>(consulta: PromiseLike<Respuesta & { data: unknown }>): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw error;
  return data as T;
}

/**
 * Llama a una función de la base.
 *
 * Las del portal eran todas el mismo bloque de cuatro líneas con otro nombre
 * dentro. Lo único que cambia de una a otra es la función, sus parámetros y la
 * forma de la respuesta, y eso es justo lo que queda a la vista al escribirlas
 * así.
 */
async function llamar<T>(funcion: string, parametros?: Record<string, unknown>): Promise<T> {
  return datosDe<T>(exigirBase().rpc(funcion, parametros));
}

/**
 * Traduce un identificador de la aplicacion al uuid de la base.
 *
 * **Esta funcion existe por un fallo que aparecio tres veces.** La aplicacion
 * nombra las cosas como las nombra la gente: el folio `PRE-00842`, la clave
 * `T01` del taller, el `CS-001` del caso. La base las nombra con uuid. Cada
 * escritura tenia que traducir, cada una lo escribia a mano, y tres de ellas se
 * saltaron el paso: mandaron el nombre corto donde iba el uuid y PostgreSQL
 * respondio `22P02 invalid input syntax for type uuid`, que moria en un
 * `console.error` que nadie tiene abierto.
 *
 * Con la traduccion en un solo sitio, saltarsela deja de ser posible: no hay
 * ningun `.eq("id", ...)` suelto donde equivocarse.
 *
 * @param noExiste Que decir si no aparece. En un mensaje que va a leer alguien
 *   en ventanilla, «no encontramos el folio PRE-00842» sirve; el codigo de
 *   PostgREST no.
 */
async function idDe(
  sb: SupabaseClient,
  tabla: string,
  columna: string,
  valor: string,
  noExiste: string,
): Promise<string> {
  const fila = await datosDe<{ id: string } | null>(
    sb.from(tabla).select("id").eq(columna, valor).maybeSingle(),
  );
  if (!fila) throw new Error(noExiste);
  return fila.id;
}

export async function guardarPago(p: {
  folio: string;
  concepto: "evento" | "taller";
  monto: number;
  montoEsperado: number;
  referencia?: string | undefined;
  fechaDeposito: string;
  nota?: string | undefined;
}): Promise<void> {
  const sb = exigirBase();
  const participanteId = await idDelFolio(sb, p.folio);

  // `resultado` no se manda: lo decide un disparador comparando el monto contra
  // lo esperado. Enviarlo desde aquí permitiría marcar como pagada una
  // discrepancia con solo elegir mal en un desplegable.
  await exigir(
    sb.from("pagos").insert({
      participante_id: participanteId,
      concepto: p.concepto,
      monto: p.monto,
      monto_esperado: p.montoEsperado,
      // Nula en ventanilla: la columna dejó de ser obligatoria porque quien cobra
      // verifica el voucher en mano. La restricción de unicidad sigue puesta y
      // sigue protegiendo la carga masiva del banco, porque en PostgreSQL dos
      // nulos no chocan entre sí.
      referencia: p.referencia?.trim() || null,
      // A ISO antes de escribir: la columna es `date` y PostgreSQL la lee con
      // DateStyle MDY, así que DD/MM/AAAA entraba con el mes y el día cambiados.
      fecha_deposito: fechaAIso(p.fechaDeposito),
      resultado: resultadoDe(p.monto, p.montoEsperado),
      nota: p.nota ?? null,
    }),
  );
}

export async function guardarAsistencia(a: {
  folio: string;
  dia: Dia;
  tipo: Asistencia["tipo"];
  punto: string;
  autorizacionMotivo?: string | undefined;
}): Promise<void> {
  const sb = exigirBase();
  const participanteId = await idDelFolio(sb, a.folio);

  /*
   * Cada escaneo se firma con quien lo hizo.
   *
   * `asistencias.capturista_id` existía desde el principio pero este insert no
   * lo enviaba, así que la columna quedaba en NULL: la tabla podía decir que
   * alguien entró, pero no quién lo registró. Con tres personas turnándose en
   * un punto de captura, eso convierte cualquier registro dudoso en un caso sin
   * responsable. `guardarRevision`, veinte líneas más abajo, ya lo hacía bien;
   * aquí solo faltaba aplicarlo.
   */
  const { data: sesion } = await sb.auth.getUser();

  await exigir(
    sb.from("asistencias").insert({
      participante_id: participanteId,
      dia: a.dia,
      tipo: a.tipo,
      punto: a.punto,
      capturista_id: sesion.user?.id ?? null,
      autorizacion_motivo: a.autorizacionMotivo ?? null,
    }),
  );
}

export async function guardarRevision(
  evidenciaId: string,
  decision: "aprobada" | "rechazada",
  motivo?: string,
): Promise<void> {
  const sb = exigirBase();
  const { data: sesion } = await sb.auth.getUser();
  await exigir(
    sb.from("revisiones").insert({
      evidencia_id: evidenciaId,
      revisor_id: sesion.user?.id,
      decision,
      motivo_rechazo: motivo ?? null,
    }),
  );
}

/**
 * Guarda un día del evento.
 *
 * Los días viven en `dias_evento`, no en `configuracion_evento`, así que no
 * entran por `guardarConfiguracion`. Editarlos no salía de la pantalla: el
 * cambio se veía, se recargaba y volvía lo de antes. Con la fecha y el lugar era
 * un defecto discreto; con los puntos de captura es uno que se descubre el día
 * del evento, con la sede montada y los nombres equivocados en los teléfonos.
 */
export async function guardarDia(d: DiaEvento): Promise<void> {
  const sb = exigirBase();
  await exigir(
    sb
      .from("dias_evento")
      // `sede` en la base es `lugar` en la aplicación. Ver `FilaDia`.
      .update({
        etiqueta: d.etiqueta,
        fecha: d.fecha,
        sede: d.lugar,
        puntos: d.puntos,
        cupo: d.cupo,
      })
      .eq("dia", d.dia),
  );
}

/** Los lugares de un día, tal como los cuenta `v_cupo_dia`. */
export interface CupoDia {
  dia: Dia;
  sede: string;
  cupo: number;
  ocupados: number;
  disponibles: number;
  lleno: boolean;
}

/**
 * Cuántos lugares quedan en cada día, ahora mismo.
 *
 * **Deliberadamente fuera de `cargarPublico`**, que es lo que se pediría por
 * parecido. Esa tiene media hora de caché por proceso —bien para el nombre del
 * evento, que cambia dos veces en la vida— y aquí eso significaría anunciar
 * «quedan 3 lugares» durante treinta segundos después de que se acabaran.
 *
 * Lo que sale de aquí es para enseñar, no para decidir: quien decide es
 * `fn_preregistrar_alumno` / `fn_preregistrar_externo`, que vuelven a contar
 * con el día bajo candado. Por eso esta llamada puede fallar sin consecuencias
 * —la pantalla simplemente no anuncia lugares— y por eso no vale la pena
 * bloquear el flujo esperándola.
 */
export async function cupoPorDia(): Promise<CupoDia[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("v_cupo_dia").select("*").order("dia");
  if (error) throw error;
  return ((data ?? []) as unknown as CupoDia[]).map((c) => ({
    ...c,
    // `count()` de PostgreSQL llega como `bigint`, y PostgREST lo serializa a
    // número; se normaliza igual por si alguna versión lo manda como texto.
    ocupados: Number(c.ocupados),
    disponibles: Number(c.disponibles),
    cupo: Number(c.cupo),
  }));
}

export async function guardarConfiguracion(patch: Record<string, unknown>): Promise<void> {
  await exigir(exigirBase().from("configuracion_evento").update(patch).eq("id", 1));
}

/** Lo que la base no dejó borrar del catálogo, y por qué. */
export interface RechazoCatalogo {
  que: string;
  motivo: string;
}

/**
 * Guarda el catálogo académico: los niveles y sus programas.
 *
 * Viven en dos tablas propias, así que no entran por `guardarConfiguracion`.
 * Hasta aquí `/admin/configuracion` los dejaba editar y avisaba de que no se
 * guardaban; cambiarlos era escribir una migración. Con la excepción de la
 * licenciatura modular eso dejó de ser aceptable: el tope de un programa es un
 * dato de la universidad y cambia cuando cambia un plan de estudios.
 *
 * **Lo que se borra no se borra a la fuerza.** `padron_alumnos` apunta a
 * `programas` con `on delete restrict`, así que quitar un programa que tiene
 * alumnos lo rechaza la base —y hace bien: borrarlo dejaría sin programa a
 * gente que está inscrita—. Esos rechazos se devuelven para poder enseñarlos,
 * porque un borrado que no ocurre y no se dice es el mismo defecto silencioso
 * que este cambio viene a cerrar.
 */
export async function guardarCatalogo(catalogo: NivelAcademico[]): Promise<RechazoCatalogo[]> {
  const sb = exigirBase();
  const rechazos: RechazoCatalogo[] = [];

  /*
   * El `orden` sale de la posición en la pantalla, no se pide aparte.
   *
   * Es lo que decide cómo se listan los niveles en el pre-registro, y pedirlo
   * como número suelto obliga a renumerar a mano al mover uno de sitio.
   */
  const filasNivel = catalogo
    .filter((n) => n.nivel.trim())
    .map((n, i) => ({
      nivel: n.nivel.trim(),
      etiqueta_avance: n.etiquetaAvance.trim(),
      total_avance: n.totalAvance,
      orden: i,
    }));

  // `upsert` sobre `nivel`, que es único: así un nivel que ya existía conserva
  // su id y los programas que cuelgan de él no se quedan huérfanos. Volver a
  // insertarlo les rompería la llave foránea.
  const niveles = await datosDe<{ id: string; nivel: string }[]>(
    sb.from("niveles_academicos").upsert(filasNivel, { onConflict: "nivel" }).select("id, nivel"),
  );
  const idDeNivel = new Map(niveles.map((n) => [n.nivel, n.id]));

  const filasPrograma = catalogo.flatMap((n) =>
    n.programas
      .filter((p) => p.nombre.trim())
      .map((p) => ({
        nivel_id: idDeNivel.get(n.nivel.trim())!,
        nombre: p.nombre.trim(),
        // Vacío en la pantalla es NULL en la tabla, y NULL significa «como mi
        // nivel». Guardar la etiqueta del nivel copiada convertiría la herencia
        // en una copia que se queda vieja en cuanto el nivel cambie.
        etiqueta_avance: p.etiquetaAvance?.trim() || null,
        total_avance: p.totalAvance ?? null,
      }))
      .filter((p) => p.nivel_id),
  );

  const programas = await datosDe<{ id: string }[]>(
    sb
      .from("programas")
      .upsert(filasPrograma, { onConflict: "nivel_id,nombre" })
      .select("id, nivel_id, nombre"),
  );

  // ----------------------------------------------------- lo que sobra ---
  // Se borra al final y uno por uno, no en bloque: un borrado en bloque que la
  // llave foránea rechaza se cae entero, y entonces un solo programa con
  // alumnos impediría quitar los otros cuatro que sí se podían quitar.
  const vivos = new Set(programas.map((p) => p.id));
  const todos = await datosDe<{ id: string; nombre: string }[]>(
    sb.from("programas").select("id, nombre"),
  );
  for (const p of todos) {
    if (vivos.has(p.id)) continue;
    const { error } = await sb.from("programas").delete().eq("id", p.id);
    if (error)
      rechazos.push({
        que: `el programa «${p.nombre}»`,
        motivo: "tiene alumnos en el padrón. Quítalos o reasígnalos antes de borrarlo.",
      });
  }

  const nivelesVivos = new Set(niveles.map((n) => n.id));
  const todosNiveles = await datosDe<{ id: string; nivel: string }[]>(
    sb.from("niveles_academicos").select("id, nivel"),
  );
  for (const n of todosNiveles) {
    if (nivelesVivos.has(n.id)) continue;
    const { error } = await sb.from("niveles_academicos").delete().eq("id", n.id);
    if (error)
      rechazos.push({
        que: `el nivel «${n.nivel}»`,
        motivo: "todavía tiene programas colgando. Quítalos primero.",
      });
  }

  return rechazos;
}

// ------------------------------- cuándo puede registrarse cada grupo ---

/**
 * El catálogo de programas con su id, que el catálogo académico no lleva.
 *
 * `NivelAcademico` identifica a sus programas por nombre, y para la mayoría de
 * las pantallas eso basta. Aquí no: `ventana_cohortes` apunta a `programas` por
 * llave foránea, y el nombre no es único en la tabla —lo único es `(nivel_id,
 * nombre)`—, así que resolverlo por nombre sería inventarse una clave que la
 * base no garantiza.
 *
 * El avance sale ya resuelto con la misma precedencia que estrenó la 43: manda
 * el programa y el nivel suple.
 */
export async function programasDeVentana(): Promise<ProgramaDeVentana[]> {
  const filas = await datosDe<
    {
      id: string;
      nombre: string;
      etiqueta_avance: string | null;
      total_avance: number | null;
      niveles_academicos: {
        nivel: string;
        etiqueta_avance: string;
        total_avance: number;
        orden: number;
      } | null;
    }[]
  >(
    exigirBase()
      .from("programas")
      .select(
        "id, nombre, etiqueta_avance, total_avance, niveles_academicos ( nivel, etiqueta_avance, total_avance, orden )",
      )
      .order("nombre"),
  );

  return (
    filas
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        nivel: p.niveles_academicos?.nivel ?? "",
        etiquetaAvance: p.etiqueta_avance ?? p.niveles_academicos?.etiqueta_avance ?? "Avance",
        totalAvance: p.total_avance ?? p.niveles_academicos?.total_avance ?? 1,
        orden: p.niveles_academicos?.orden ?? 0,
      }))
      // Por nivel y luego por nombre: es el mismo orden en el que el pre-registro
      // los ofrece, y así la lista de la pantalla se parece a la que ve el alumno.
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map(({ orden: _orden, ...p }) => p)
  );
}

export async function cargarVentanas(): Promise<VentanaPreregistro[]> {
  const filas = await datosDe<
    {
      id: string;
      etiqueta: string;
      abre: string;
      cierra: string;
      ventana_cohortes: { programa_id: string; avance: number }[];
      ventana_perfiles: { perfil: PerfilSinPadron }[];
    }[]
  >(
    exigirBase()
      .from("ventanas_preregistro")
      .select(
        "id, etiqueta, abre, cierra, ventana_cohortes ( programa_id, avance ), ventana_perfiles ( perfil )",
      )
      .order("abre"),
  );

  return filas.map((v) => ({
    id: v.id,
    etiqueta: v.etiqueta,
    abre: v.abre,
    cierra: v.cierra,
    cohortes: v.ventana_cohortes.map((c) => ({ programaId: c.programa_id, avance: c.avance })),
    // `check (perfil <> 'alumno')` en la base garantiza que aquí solo llegan
    // los dos que `PerfilSinPadron` admite.
    perfiles: v.ventana_perfiles.map((p) => p.perfil),
  }));
}

/**
 * Guarda las ventanas tal como quedaron en pantalla.
 *
 * **Se manda la lista entera, no lo que cambió.** Son tres o cuatro filas con
 * una decena de cohortes cada una: calcular la diferencia costaría más código
 * del que ahorra, y una diferencia mal calculada aquí deja fuera del evento a
 * una generación entera.
 *
 * Los cohortes se reemplazan enteros por ventana, como `taller_dias`: la tabla
 * no tiene más columnas que su propia clave, así que no hay nada que conservar
 * en una fila que se vuelve a insertar igual.
 *
 * El borrado de las ventanas que sobran va **al final** a propósito. Si algo se
 * cae a mitad, lo que queda es de más y no de menos: una ventana vieja que
 * todavía cierra la puerta es un estorbo que se ve y se corrige; una ventana
 * que desapareció abre el pre-registro a todo el mundo y no lo delata nada.
 */
export async function guardarVentanas(ventanas: VentanaPreregistro[]): Promise<void> {
  const sb = exigirBase();
  const vivas: string[] = [];

  for (const v of ventanas) {
    const fila = { etiqueta: v.etiqueta.trim(), abre: v.abre, cierra: v.cierra };
    // Sin id es una ventana que nunca se guardó. No hay `upsert` por etiqueta
    // porque la etiqueta no es única —ni debería serlo: es una frase que se
    // corrige— así que el alta y la modificación son dos caminos distintos.
    const guardada = await datosDe<{ id: string }>(
      v.id
        ? sb.from("ventanas_preregistro").update(fila).eq("id", v.id).select("id").single()
        : sb.from("ventanas_preregistro").insert(fila).select("id").single(),
    );

    vivas.push(guardada.id);
    await exigir(sb.from("ventana_cohortes").delete().eq("ventana_id", guardada.id));
    if (v.cohortes.length)
      await exigir(
        sb.from("ventana_cohortes").insert(
          v.cohortes.map((c) => ({
            ventana_id: guardada.id,
            programa_id: c.programaId,
            avance: c.avance,
          })),
        ),
      );

    // Los perfiles se reemplazan igual que los cohortes y por lo mismo: la
    // tabla no tiene más columnas que su propia clave, así que no hay nada que
    // conservar en una fila que se vuelve a insertar idéntica.
    await exigir(sb.from("ventana_perfiles").delete().eq("ventana_id", guardada.id));
    if (v.perfiles.length)
      await exigir(
        sb
          .from("ventana_perfiles")
          .insert(v.perfiles.map((perfil) => ({ ventana_id: guardada.id, perfil }))),
      );
  }

  const todas = await datosDe<{ id: string }[]>(sb.from("ventanas_preregistro").select("id"));
  const sobran = todas.map((v) => v.id).filter((id) => !vivas.includes(id));
  if (sobran.length) await exigir(sb.from("ventanas_preregistro").delete().in("id", sobran));
}

/**
 * Deja constancia de una acción del personal.
 *
 * `usuario_id` sale de la sesión, no de un texto: la bitácora existe para poder
 * responder «quién hizo esto», y un nombre escrito a mano no responde nada. El
 * `usuario_texto` queda para lo que no hace una persona —el pre-registro en
 * línea, un cierre automático—, que si no aparecería sin autor.
 */
export async function anotarEnBitacora(
  accion: string,
  detalle: string,
  usuarioTexto?: string,
): Promise<void> {
  const sb = exigirBase();
  const { data: sesion } = await sb.auth.getUser();
  await sb.from("bitacora").insert({
    accion,
    detalle,
    usuario_id: sesion.user?.id ?? null,
    usuario_texto: sesion.user?.id ? null : (usuarioTexto ?? "Sistema"),
  });
}

/**
 * Guarda un taller identificándolo por su CLAVE, no por su uuid.
 *
 * Toda la aplicación llama a los talleres `T01`, `T02`… —es lo que el personal
 * dice de viva voz y lo que sale en los reportes—, así que `TallerBase.id` es
 * la clave corta y no la llave primaria. Esta función recibía ese valor y lo
 * usaba como uuid:
 *
 *   .eq("id", "T01")  →  [22P02] invalid input syntax for type uuid: "T01"
 *
 * PostgreSQL rechazaba la consulta, el error moría en la consola y el taller
 * no se guardaba nunca. En pantalla parecía guardado, porque la lista se
 * actualiza en memoria antes de escribir.
 *
 * Se resuelve con `upsert` sobre la clave, que es `unique`: sirve igual para el
 * taller nuevo y para el que ya existía, y devuelve el uuid que hace falta para
 * sus días.
 */
export async function guardarTallerRemoto(t: {
  /** `T01`, `T02`… La usa el personal para referirse a un taller de viva voz. */
  clave: string;
  nombre: string;
  descripcion: string;
  ponente: string;
  costo: number;
  cupoTotal: number;
  dias: number[];
  horario: string;
  lugar: string;
  activo: boolean;
}): Promise<void> {
  const sb = exigirBase();
  const creado = await datosDe<{ id: string }>(
    sb
      .from("talleres")
      .upsert(
        {
          clave: t.clave,
          nombre: t.nombre,
          descripcion: t.descripcion,
          ponente: t.ponente,
          costo: t.costo,
          cupo_total: t.cupoTotal,
          horario: t.horario,
          lugar: t.lugar,
          activo: t.activo,
        },
        { onConflict: "clave" },
      )
      .select("id")
      .single(),
  );

  // Los días viven en su propia tabla: se reemplazan enteros en vez de
  // calcular la diferencia, que para tres filas no compensa.
  const id = creado.id;
  await exigir(sb.from("taller_dias").delete().eq("taller_id", id));
  // El alta de los días se lanza en vez de callarse: un taller sin sus días no
  // se imparte ningún día, y nadie podría inscribirse. Antes este error se
  // perdía.
  if (t.dias.length)
    await exigir(sb.from("taller_dias").insert(t.dias.map((dia) => ({ taller_id: id, dia }))));
}

/** También por clave, y por la misma razón que `guardarTallerRemoto`. */
export async function eliminarTallerRemoto(clave: string): Promise<void> {
  const sb = exigirBase();
  // Ya no está: no hay nada que retirar y tampoco es un fallo, así que este
  // es el único sitio donde la ausencia no se convierte en error.
  const fila = await datosDe<{ id: string } | null>(
    sb.from("talleres").select("id").eq("clave", clave).maybeSingle(),
  );
  if (!fila) return;
  const id = fila.id;

  const { count } = await sb
    .from("participantes")
    .select("id", { count: "exact", head: true })
    .eq("taller_id", id);
  // Con inscritos no se borra, se desactiva: desactivar no es cancelar, y
  // borrarlo dejaría sus inscripciones apuntando a algo que ya no existe.
  if (count && count > 0) {
    await exigir(sb.from("talleres").update({ activo: false }).eq("id", id));
    return;
  }
  await exigir(sb.from("taller_dias").delete().eq("taller_id", id));
  await exigir(sb.from("talleres").delete().eq("id", id));
}

/**
 * Actualiza a una persona del personal.
 *
 * Solo modifica: el alta necesita antes una cuenta en Supabase Auth, y crearla
 * exige la clave de servicio, que nunca debe llegar al navegador. Se hace desde
 * el panel de Supabase y aquí se completan su nombre y su rol.
 */
export async function guardarUsuarioRemoto(u: {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
}): Promise<void> {
  await exigir(
    exigirBase()
      .from("usuarios_internos")
      .update({ nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo })
      .eq("id", u.id),
  );
}

/**
 * Deshace la última revisión: devuelve la evidencia a pendiente.
 *
 * No borra la fila de `revisiones`. El esquema lo dice en sus propias palabras
 * —«una revisión no se edita ni se borra: se agrega otra»— y tiene razón: el
 * historial es lo que permite explicar por qué cambió una decisión. Además el
 * disparador que aplica el estado solo actúa al insertar, así que borrar la fila
 * dejaría la evidencia con la decisión puesta y sin nada que la explique.
 *
 * Queda un límite conocido: el rastro de que hubo un «deshacer» vive en la
 * bitácora, no en `revisiones`. Anotarlo ahí necesitaría una columna nueva.
 */
export async function deshacerRevisionRemota(evidenciaId: string): Promise<void> {
  await exigir(
    exigirBase().from("evidencias").update({ estado: "pendiente" }).eq("id", evidenciaId),
  );
}

/**
 * Cambia el estado de un caso de soporte.
 *
 * Se identifica por su CLAVE (`CS-001`), no por el uuid, por la misma razón
 * que los talleres: `aCaso` construye `CasoSoporte.id` con la clave, que es lo
 * que el personal se dice por teléfono y lo que sale en pantalla.
 *
 * Antes esto no existía. Cambiar un caso a «en proceso» o «resuelto» solo movía
 * la lista en memoria, así que al recargar volvía a estar abierto y el módulo
 * de soporte parecía no funcionar: nada de lo que se hacía en él duraba.
 *
 * `resuelto_en` no es opcional. La tabla tiene
 * `chk_resuelto_con_fecha`, que exige fecha cuando el estado es «resuelto» y la
 * prohíbe cuando no lo es; mandar solo el estado hace que la base rechace la
 * escritura entera.
 */
export async function cambiarEstadoCasoRemoto(
  clave: string,
  estado: "abierto" | "en_proceso" | "resuelto",
): Promise<void> {
  const sb = exigirBase();
  const id = await idDe(sb, "casos_soporte", "clave", clave, `El caso ${clave} ya no existe.`);

  // Quien atiende es quien tiene la sesión abierta. Se toma de aquí y no de un
  // nombre que llegue desde la pantalla: `usuarios_internos.id` ES el id de
  // `auth.users`, así que la propia sesión ya lo dice sin poder equivocarse.
  const { data: sesion } = await sb.auth.getUser();

  await exigir(
    sb
      .from("casos_soporte")
      .update({
        estado,
        resuelto_en: estado === "resuelto" ? new Date().toISOString() : null,
        ...(sesion.user?.id ? { atiende_id: sesion.user.id } : {}),
      })
      .eq("id", id),
  );
}

/**
 * Corrige el nombre de un participante.
 *
 * Es la pieza que faltaba en la cadena del nombre mal escrito. El alumno lo
 * reportaba al pre-registrarse, se abría su caso y quedaba marcado en el
 * listado de elegibles, pero nadie podía escribir el nombre correcto: resolver
 * el caso solo quitaba la marca, y el documento se habría impreso igual de mal.
 *
 * Se corrige en los dos sitios. `participantes.nombre` es el que sale en la
 * constancia; `padron_alumnos.nombre` es el origen del error y de él salen los
 * reportes, así que dejarlo mal haría que las dos listas se contradijeran justo
 * en la persona por la que alguien preguntó.
 *
 * En mayúsculas porque las dos tablas lo exigen —`nombre = upper(nombre)`— y
 * porque el padrón además pide al menos dos palabras. Se normaliza aquí en vez
 * de confiar en el formulario, que es lo mismo que no comprobarlo.
 *
 * NO toca `nombre_en_revision`: esa marca la mantiene el disparador
 * `trg_caso_marca_nombre` a partir de los casos abiertos. Ponerla a mano
 * garantizaría que un día la marca y su caso digan cosas distintas.
 */
export async function corregirNombreRemoto(folio: string, nombre: string): Promise<void> {
  const sb = exigirBase();
  const limpio = nombre.trim().replace(/\s+/g, " ").toUpperCase();
  if (limpio.split(" ").length < 2) {
    throw new Error("Escribe el nombre completo, con apellidos.");
  }

  const fila = await datosDe<{ id: string; matricula: string | null } | null>(
    sb.from("participantes").select("id, matricula").eq("folio", folio).maybeSingle(),
  );
  if (!fila) throw new Error(`No encontramos el folio ${folio}.`);

  await exigir(sb.from("participantes").update({ nombre: limpio }).eq("id", fila.id));

  // El padrón solo tiene fila si es alumno; el docente y el externo no están en
  // ninguno, y ahí no hay nada más que corregir.
  if (fila.matricula)
    await exigir(
      sb.from("padron_alumnos").update({ nombre: limpio }).eq("matricula", fila.matricula),
    );
}

/**
 * Abre un caso desde el panel de soporte.
 *
 * Hasta ahora los casos solo nacían de una vía: el alumno reportando que su
 * nombre está mal, por `fn_abrir_caso_nombre`. Quien llamaba por WhatsApp o
 * llegaba a ventanilla no podía quedar registrado, aunque el enum `canal_caso`
 * tiene esos valores justo para eso.
 *
 * Va por inserción directa y no por una función `security definer` como la del
 * portal: quien abre el caso aquí ya tiene sesión, y `casos_escritura` —de
 * administración y soporte— es exactamente la comprobación que hace falta.
 * Meter una función en medio saltaría esa política en vez de apoyarse en ella.
 *
 * **No es optimista, y aquí eso es lo correcto.** La clave `CS-004` la genera
 * una secuencia de la base; inventarla en el navegador chocaría con la que el
 * siguiente caso reciba de verdad. Se espera la respuesta —quien está llenando
 * un formulario puede esperar 200 ms— y se devuelve la clave real.
 */
export async function abrirCasoRemoto(datos: {
  folio: string;
  asunto: string;
  detalle: string;
  canal: string;
}): Promise<{ clave: string; creadoEn: string }> {
  const sb = exigirBase();
  const participanteId = await idDelFolio(sb, datos.folio);

  const fila = await datosDe<{ clave: string; creado_en: string }>(
    sb
      .from("casos_soporte")
      .insert({
        participante_id: participanteId,
        asunto: datos.asunto.trim(),
        detalle: datos.detalle.trim(),
        canal: datos.canal,
      })
      .select("clave, creado_en")
      .single(),
  );
  return { clave: fila.clave, creadoEn: aFechaHora(fila.creado_en) };
}

/**
 * Corrige el contenido de un caso: asunto, detalle y canal.
 *
 * Por clave, como el cambio de estado y por la misma razón. El estado no se
 * toca aquí: lo mueve `cambiarEstadoCasoRemoto`, que además tiene que cuadrar
 * `resuelto_en` con `chk_resuelto_con_fecha`. Mezclar las dos cosas obligaría a
 * repetir esa regla en dos sitios.
 */
export async function guardarCasoRemoto(
  clave: string,
  cambios: { asunto: string; detalle: string; canal: string },
): Promise<void> {
  const sb = exigirBase();
  const id = await idDe(sb, "casos_soporte", "clave", clave, `El caso ${clave} ya no existe.`);

  await exigir(
    sb
      .from("casos_soporte")
      .update({
        asunto: cambios.asunto.trim(),
        detalle: cambios.detalle.trim(),
        canal: cambios.canal,
      })
      .eq("id", id),
  );
}

export async function desactivarUsuarioRemoto(id: string): Promise<void> {
  await exigir(exigirBase().from("usuarios_internos").update({ activo: false }).eq("id", id));
}

/**
 * Anula una asistencia registrada por error.
 *
 * Se marca, no se borra: un registro que desaparece no deja ver que hubo una
 * corrección, y eso es justo lo que alguien querría revisar después.
 */
export async function anularAsistenciaRemota(id: string, motivo: string): Promise<void> {
  const sb = exigirBase();
  const { data: sesion } = await sb.auth.getUser();
  await exigir(
    sb
      .from("asistencias")
      .update({
        anulada_en: new Date().toISOString(),
        anulada_por: sesion.user?.id ?? null,
        anulacion_motivo: motivo,
      })
      .eq("id", id),
  );
}

// =================================================== funciones del portal ===
// El participante no tiene sesión, así que su único camino son estas llamadas.

/**
 * ¿Está esta matrícula en el padrón? Sin datos personales.
 *
 * Es lo único que el pre-registro necesita antes de comprobar la identidad. La
 * función que sí devuelve el expediente exige el reto, porque la clave
 * publicable viaja en el paquete y cualquiera puede llamar a la API por su
 * cuenta: una comprobación que solo vive en el navegador no es una
 * comprobación.
 */
export async function existeEnPadronRemoto(matricula: string) {
  return llamar<{ existe: boolean; ya_registrado: boolean }>("fn_padron_existe", {
    p_matricula: matricula,
  });
}

/**
 * El expediente del padrón, a cambio de demostrar que ya se sabe de quién es.
 *
 * Devuelve `null` tanto si el reto falla como si la matrícula no existe: si se
 * distinguieran, la diferencia sería un buscador de matrículas válidas.
 */
export async function confirmarEnPadronRemoto(
  matricula: string,
  nombres: string,
  programa: string,
) {
  return llamar<{
    matricula: string;
    nombre: string;
    nivel: string;
    programa: string;
    avance: number;
    etiqueta_avance: string;
    grupo: string | null;
    plantel: string;
    /**
     * El día que le repartió Servicios Escolares, o `null` si todavía no se ha
     * repartido. Sin él, la pantalla no puede acotar el catálogo de talleres
     * y el alta acababa chocando con la llave foránea `(taller_id, dia)`.
     */
    dia: number | null;
    ya_registrado: boolean;
  } | null>("fn_padron_confirmar", {
    p_matricula: matricula,
    p_nombres: nombres,
    p_programa: programa,
  });
}

/**
 * Si a esta matrícula todavía no le toca pre-registrarse, la frase que hay que
 * enseñarle. `null` cuando puede continuar.
 *
 * Se pregunta en cuanto confirma su identidad y no al enviar el formulario. La
 * regla de verdad vive en un disparador de `participantes` —esto no es la
 * puerta, es el aviso—, pero enterarse al final, después de teclear correo,
 * celular y elegir taller, es la diferencia entre una fecha y un portazo.
 *
 * Una matrícula que no está en el padrón devuelve `null`, no un error: quien la
 * rechaza es el alta, con su propio mensaje, y contestar aquí convertiría esto
 * en el enumerador del padrón que ya se cerró una vez.
 */
export async function ventanaDeMatriculaRemota(matricula: string): Promise<string | null> {
  return llamar<string | null>("fn_ventana_de_matricula", { p_matricula: matricula });
}

/**
 * Lo mismo para quien no está en ningún padrón.
 *
 * El docente y el externo no tienen matrícula que preguntar: lo único que los
 * identifica antes de llenar nada es el perfil que acaban de elegir en el
 * formulario, y basta, porque la ventana los invita por eso.
 *
 * Devuelve `null` cuando pueden pasar. Esto tampoco es la puerta —la puerta es
 * `trg_ventana_preregistro`— sino el aviso que evita que alguien teclee nombre,
 * apellidos, correo, celular e institución para encontrarse un portazo al final.
 */
export async function ventanaDePerfilRemota(perfil: PerfilSinPadron): Promise<string | null> {
  return llamar<string | null>("fn_motivo_fuera_de_ventana_perfil", { p_perfil: perfil });
}

/**
 * El uuid del taller a partir de su clave, o `null` si no eligió ninguno.
 *
 * **Tercera vez que este identificador se manda sin traducir.** `TallerBase.id`
 * es la clave corta —`T01`—, porque es como lo llama el personal y como sale en
 * los reportes; `aTallerBase` lo construye así. Pero `participantes.taller_id`
 * es un uuid, y las dos funciones de alta lo recibían tal cual:
 *
 *   invalid input syntax for type uuid: "T01"
 *
 * Reventaba justo al final del pre-registro, cuando el alumno elegía taller y
 * pulsaba continuar. Con el catálogo sin taller pasaba inadvertido, porque
 * `p_taller` iba nulo y no había nada que convertir.
 *
 * Se traduce aquí, en la frontera, que es donde vive el resto de traducciones.
 */
/**
 * El uuid de un participante a partir de su folio.
 *
 * Es la traducción que más veces hace falta: el pago, la asistencia y el caso
 * de soporte se abren todos contra un folio. Los tres escribían la misma
 * llamada de seis líneas con el mismo mensaje de «no encontramos».
 */
const idDelFolio = (sb: SupabaseClient, folio: string) =>
  idDe(sb, "participantes", "folio", folio, `No encontramos el folio ${folio}.`);

async function uuidDelTaller(
  sb: SupabaseClient,
  clave: string | undefined,
): Promise<string | null> {
  if (!clave) return null;
  return idDe(sb, "talleres", "clave", clave, `El taller ${clave} ya no está disponible.`);
}

/**
 * Alta de un docente o un visitante externo.
 *
 * Va aparte de `preregistrarAlumno` porque son altas distintas, no variantes de
 * la misma: aquella parte de una matrícula del padrón y hereda de ahí el día y
 * lo académico; esta no tiene padrón del que heredar, así que recibe el nombre
 * y la institución que la persona declara, y **el día que ella eligió**.
 */
export async function preregistrarExterno(datos: {
  perfil: "docente" | "externo";
  nombre: string;
  correo: string;
  celular: string;
  institucion: string;
  dia: number;
  aceptoAviso: boolean;
  tallerId?: string | undefined;
}) {
  const sb = exigirBase();
  // El error sube tal cual, como en el alta de alumno: el mensaje viene de un
  // `raise exception` de la función y es específico —«ese taller no se imparte
  // el día 2»—, que ayuda más que uno genérico.
  return llamar<{ id: string; folio: string; dia: Dia }>("fn_preregistrar_externo", {
    p_perfil: datos.perfil,
    p_nombre: datos.nombre,
    p_correo: datos.correo,
    p_celular: datos.celular,
    p_institucion: datos.institucion,
    p_dia: datos.dia,
    p_acepto_aviso: datos.aceptoAviso,
    p_taller: await uuidDelTaller(sb, datos.tallerId),
  });
}

export async function preregistrarAlumno(datos: {
  matricula: string;
  correo: string;
  celular: string;
  /**
   * Obligatorio, sin valor por defecto, igual que en la base. `fn_preregistrar_
   * alumno` rechaza el alta si no llega en `true`: la casilla de la pantalla
   * gobierna un botón, y esto gobierna la fila.
   */
  aceptoAviso: boolean;
  tallerId?: string | undefined;
}) {
  const sb = exigirBase();
  return llamar<{ id: string; folio: string; dia: Dia }>("fn_preregistrar_alumno", {
    p_matricula: datos.matricula,
    p_correo: datos.correo,
    p_celular: datos.celular,
    p_acepto_aviso: datos.aceptoAviso,
    p_taller: await uuidDelTaller(sb, datos.tallerId),
  });
}

/**
 * ¿Este folio va con esta credencial?
 *
 * `fn_autenticar_portal` compara dentro de Postgres y devuelve el identificador
 * del participante, o nulo. La comprobación no puede vivir en el navegador: ahí
 * haría falta traerse antes al participante, que es justo lo que no se quiere
 * entregar a quien todavía no ha demostrado ser su dueño.
 */
export async function autenticarPortal(folio: string, credencial: string) {
  const id = await llamar<string | null>("fn_autenticar_portal", {
    p_folio: folio,
    p_credencial: credencial,
  });
  return id ?? null;
}

export async function estadoDelPortal(folio: string, credencial: string) {
  return llamar<Record<string, unknown>>("fn_portal_estado", {
    p_folio: folio,
    p_credencial: credencial,
  });
}

export async function abrirCasoNombreRemoto(participanteId: string, nombreCorrecto: string) {
  return llamar<string>("fn_abrir_caso_nombre", {
    p_participante: participanteId,
    p_nombre_correcto: nombreCorrecto,
  });
}

/**
 * Pregunta a la base qué hacer con este escaneo.
 *
 * Recibe el MODO del punto de captura, no el tipo. La dirección —entrada o
 * salida— la decide la base y vuelve en `tipo`, porque esta consulta existe
 * justo para cuando la escucha en vivo no está disponible: en ese momento la
 * copia local de este teléfono puede estar atrasada respecto de los otros siete
 * puntos, y sería ella quien se equivoque de dirección.
 */
export async function evaluarEscaneoRemoto(entrada: string, dia: Dia, modo: Modo) {
  const filas = await llamar<
    {
      color: "verde" | "amarillo" | "rojo";
      titulo: string;
      detalle: string;
      autorizable: boolean;
      tipo: Asistencia["tipo"];
    }[]
  >("fn_evaluar_escaneo", { p_entrada: entrada, p_dia: dia, p_modo: modo });
  return (filas ?? [])[0];
}

/** Lo que ocurrió al guardar el padrón. Se enseña tal cual en la pantalla. */
export interface ResultadoPadron {
  guardados: number;
  rechazados: { matricula: string; motivo: string }[];
}

/**
 * Guarda el padrón importado.
 *
 * Es la puerta de entrada de todos los datos del sistema: sin padrón no hay
 * alumnos que se pre-registren, y sin pre-registros no hay folios, pagos,
 * asistencias ni evidencias. La pantalla hacía todo el trabajo difícil —leer el
 * archivo, validar, avisar de errores, repartir días— y le faltaba justo el
 * último paso, así que al recargar no quedaba nada.
 *
 * Dos cosas que el archivo no trae resueltas:
 *
 * 1. **El archivo trae texto y la tabla guarda identificadores.** «Licenciatura
 *    en Pedagogía» y «Campus Central» tienen que resolverse contra `programas`,
 *    `niveles_academicos` y `planteles`. Se cargan los tres catálogos una vez y
 *    se resuelve en memoria: hacerlo fila por fila serían miles de consultas.
 * 2. **Un nombre que no está en el catálogo no se inventa.** Se rechaza esa fila
 *    y se dice cuál y por qué. Crear el programa sobre la marcha metería en el
 *    catálogo oficial cualquier errata del archivo.
 *
 * Se sube por lotes para que un archivo de miles de filas no viaje en una sola
 * petición, y el fallo de un lote no tumba los demás: se informa y se sigue.
 */
export async function guardarPadronRemoto(
  filas: AlumnoPadron[],
  porLote = 200,
): Promise<ResultadoPadron> {
  const sb = exigirBase();
  const rechazados: ResultadoPadron["rechazados"] = [];

  const [niveles, programas, planteles] = await Promise.all([
    sb.from("niveles_academicos").select("id, nivel"),
    sb.from("programas").select("id, nombre, nivel_id"),
    sb.from("planteles").select("id, nombre"),
  ]);

  // Se compara sin acentos ni mayúsculas: el archivo viene de otro sistema y
  // rechazar «PEDAGOGÍA» frente a «Pedagogía» sería castigar una diferencia que
  // no significa nada.
  const clave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

  const idNivel = new Map(
    ((niveles.data ?? []) as { id: string; nivel: string }[]).map((n) => [clave(n.nivel), n.id]),
  );
  const idPrograma = new Map(
    ((programas.data ?? []) as { id: string; nombre: string; nivel_id: string }[]).map((p) => [
      clave(p.nombre),
      p,
    ]),
  );
  const idPlantel = new Map(
    ((planteles.data ?? []) as { id: string; nombre: string }[]).map((p) => [
      clave(p.nombre),
      p.id,
    ]),
  );

  const listas: Record<string, unknown>[] = [];
  for (const a of filas) {
    const nivel = idNivel.get(clave(a.nivel));
    const programa = idPrograma.get(clave(a.programa));
    const plantel = idPlantel.get(clave(a.plantel));

    if (!nivel) {
      rechazados.push({ matricula: a.matricula, motivo: `Nivel desconocido: "${a.nivel}".` });
      continue;
    }
    if (!programa) {
      rechazados.push({ matricula: a.matricula, motivo: `Programa desconocido: "${a.programa}".` });
      continue;
    }
    if (programa.nivel_id !== nivel) {
      rechazados.push({
        matricula: a.matricula,
        motivo: `"${a.programa}" no pertenece a ${a.nivel}.`,
      });
      continue;
    }
    if (!plantel) {
      rechazados.push({ matricula: a.matricula, motivo: `Plantel desconocido: "${a.plantel}".` });
      continue;
    }

    listas.push({
      matricula: a.matricula,
      nombre: a.nombre,
      nivel_id: nivel,
      programa_id: programa.id,
      avance: a.avance,
      grupo: a.grupo ?? null,
      plantel_id: plantel,
      dia: a.dia ?? null,
    });
  }

  let guardados = 0;
  for (let i = 0; i < listas.length; i += porLote) {
    const lote = listas.slice(i, i + porLote);
    // `upsert` por matrícula: reimportar el archivo actualiza en vez de fallar,
    // que es lo que pasa de verdad cuando Servicios Escolares manda una versión
    // corregida.
    const { error } = await sb.from("padron_alumnos").upsert(lote, { onConflict: "matricula" });
    if (error) {
      for (const f of lote)
        rechazados.push({ matricula: String(f["matricula"]), motivo: error.message });
      continue;
    }
    guardados += lote.length;
  }

  return { guardados, rechazados };
}

/**
 * Mueve de día a un conjunto de alumnos.
 *
 * **Escribía solo el padrón, y ese era el fallo.** El día vive en dos sitios:
 * `padron_alumnos.dia` es el que reparte Servicios Escolares, y
 * `participantes.dia` es al que de verdad va a asistir esa persona. El escáner
 * de la puerta decide con el segundo.
 *
 * Reasignar a alguien desde Administración se veía correcto en pantalla —la
 * aplicación lo movía en memoria— pero en la base el participante seguía en su
 * día viejo. Al escanear su código, la puerta respondía DÍA EQUIVOCADO a quien
 * acababa de ser reasignado, y al recargar la pantalla el cambio desaparecía.
 *
 * Ahora lo hace `fn_asignar_dia_a_varios`, que mueve los dos y libera la
 * inscripción de quien se quede con un taller que su día nuevo no imparte.
 * Tiene que ser una sola operación en la base: el día y el taller se cambian en
 * la misma sentencia porque la llave foránea `(taller_id, dia)` no admite ni un
 * instante con el día nuevo y el taller viejo.
 *
 * @returns Las matrículas cuya inscripción a un taller se liberó, con su clave.
 */
export async function asignarDiaRemoto(
  matriculas: string[],
  dia: number | null,
  porLote = 200,
): Promise<{ matricula: string; taller: string }[]> {
  const liberados: { matricula: string; taller: string }[] = [];
  // Se sigue troceando: un arreglo de miles de matrículas en un solo parámetro
  // hace una petición enorme, y el tamaño de lote ya estaba elegido.
  for (let i = 0; i < matriculas.length; i += porLote) {
    const movidos = await llamar<{ matricula: string; taller_liberado: string }[]>(
      "fn_asignar_dia_a_varios",
      { p_matriculas: matriculas.slice(i, i + porLote), p_dia: dia },
    );
    for (const f of movidos ?? [])
      liberados.push({ matricula: f.matricula, taller: f.taller_liberado });
  }
  return liberados;
}
