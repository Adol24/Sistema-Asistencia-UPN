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

import { exigirBase, supabase } from "@/lib/supabase";
import {
  aAlumnoPadron,
  aAsistencia,
  aFechaHora,
  aCaso,
  aCatalogo,
  aConfiguracion,
  aEvidencia,
  aPago,
  aParticipante,
  aTallerBase,
  aUsuario,
  type FilaAsistencia,
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
import type { ConfiguracionEvento } from "@/lib/configuracion";
import { fechaAIso } from "@/lib/formato";
import type { PagoRegistrado } from "@/lib/pagos-logica";

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

/**
 * Carga el estado inicial. Devuelve `null` si no hay base configurada, que es la
 * señal para que el contexto siga con los datos simulados.
 */
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
      .select("id, nivel, etiqueta_avance, total_avance, orden, programas ( nombre )"),
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
  const { configuracion, idPorClave, talleresBase } = publico;
  // `idPorClave` va de clave a id; aquí hace falta al revés, para nombrar los
  // talleres que vienen referenciados por id en participantes y asistencias.
  const claveporId = new Map(Object.entries(idPorClave).map(([clave, id]) => [id, clave]));
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
  const [participantes, estadoPago, pagos, padron, asistencias, evidencias, usuarios, casos] =
    await Promise.all([
      sb.from("participantes").select(COLS_PARTICIPANTE).order("folio"),
      /*
       * El estado derivado, que puede leer cualquier miembro del personal.
       * Sostiene el semáforo de la puerta sin enseñarle al capturista cuánto
       * pagó nadie ni con qué referencia.
       */
      sb.from("v_estado_pago").select("participante_id, concepto, estado"),
      /*
       * Los pagos completos. Solo los ve quien puede cobrarlos o auditarlos; a
       * los demás las políticas les devuelven cero filas, sin error.
       *
       * Se ordenan del más antiguo al más reciente porque `estadoDePagos`
       * recorre la lista al revés y se queda con la primera coincidencia: el
       * último pago de un concepto es el que manda, y ese orden es el que lo
       * garantiza.
       */
      sb.from("pagos").select(COLS_PAGO).order("registrado_en"),
      sb.from("padron_alumnos").select(COLS_PADRON).order("matricula"),
      sb
        .from("asistencias")
        .select(
          "id, dia, tipo, registrada_en, punto, autorizacion_motivo, autorizada_por, participantes ( folio, nombre ), capturista:capturista_id ( nombre ), supervisor:autorizada_por ( nombre )",
        )
        .is("anulada_en", null)
        .order("registrada_en"),
      sb
        .from("evidencias")
        .select(
          "id, dia, archivo_url, hash_archivo, estado, subida_en, participantes ( folio, nombre, matricula )",
        )
        .order("dia"),
      sb.from("usuarios_internos").select("*").order("nombre"),
      sb
        .from("casos_soporte")
        .select(
          "id, clave, asunto, detalle, estado, canal, creado_en, usuarios_internos ( nombre ), participantes ( folio, nombre )",
        )
        .order("creado_en", { ascending: false }),
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
  const { data: participante, error: e1 } = await sb
    .from("participantes")
    .select("id")
    .eq("folio", p.folio)
    .single();
  if (e1) throw e1;

  // `resultado` no se manda: lo decide un disparador comparando el monto contra
  // lo esperado. Enviarlo desde aquí permitiría marcar como pagada una
  // discrepancia con solo elegir mal en un desplegable.
  const { error } = await sb.from("pagos").insert({
    participante_id: participante.id,
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
    resultado: p.monto === p.montoEsperado ? "pagado" : "discrepancia",
    nota: p.nota ?? null,
  });
  if (error) throw error;
}

export async function guardarAsistencia(a: {
  folio: string;
  dia: Dia;
  tipo: Asistencia["tipo"];
  punto: string;
  autorizacionMotivo?: string | undefined;
}): Promise<void> {
  const sb = exigirBase();
  const { data: p, error: e1 } = await sb
    .from("participantes")
    .select("id")
    .eq("folio", a.folio)
    .single();
  if (e1) throw e1;

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

  const { error } = await sb.from("asistencias").insert({
    participante_id: p.id,
    dia: a.dia,
    tipo: a.tipo,
    punto: a.punto,
    capturista_id: sesion.user?.id ?? null,
    autorizacion_motivo: a.autorizacionMotivo ?? null,
  });
  if (error) throw error;
}

export async function guardarRevision(
  evidenciaId: string,
  decision: "aprobada" | "rechazada",
  motivo?: string,
): Promise<void> {
  const sb = exigirBase();
  const { data: sesion } = await sb.auth.getUser();
  const { error } = await sb.from("revisiones").insert({
    evidencia_id: evidenciaId,
    revisor_id: sesion.user?.id,
    decision,
    motivo_rechazo: motivo ?? null,
  });
  if (error) throw error;
}

export async function guardarConfiguracion(patch: Record<string, unknown>): Promise<void> {
  const sb = exigirBase();
  const { error } = await sb.from("configuracion_evento").update(patch).eq("id", 1);
  if (error) throw error;
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

/** Da de alta o actualiza un taller. */
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
  const { data, error } = await sb
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
    .single();
  if (error) throw error;

  // Los días viven en su propia tabla: se reemplazan enteros en vez de
  // calcular la diferencia, que para tres filas no compensa.
  const id = (data as { id: string }).id;
  const { error: eBorrado } = await sb.from("taller_dias").delete().eq("taller_id", id);
  if (eBorrado) throw eBorrado;
  if (t.dias.length) {
    const { error: eDias } = await sb
      .from("taller_dias")
      .insert(t.dias.map((dia) => ({ taller_id: id, dia })));
    // Se lanza en vez de callarse: un taller sin sus días no se imparte ningún
    // día, y nadie podría inscribirse. Antes este error se perdía.
    if (eDias) throw eDias;
  }
}

/** También por clave, y por la misma razón que `guardarTallerRemoto`. */
export async function eliminarTallerRemoto(clave: string): Promise<void> {
  const sb = exigirBase();
  const { data, error: eBusca } = await sb
    .from("talleres")
    .select("id")
    .eq("clave", clave)
    .maybeSingle();
  if (eBusca) throw eBusca;
  // Ya no está: no hay nada que retirar y tampoco es un fallo.
  if (!data) return;
  const id = (data as { id: string }).id;

  const { count } = await sb
    .from("participantes")
    .select("id", { count: "exact", head: true })
    .eq("taller_id", id);
  // Con inscritos no se borra, se desactiva: desactivar no es cancelar, y
  // borrarlo dejaría sus inscripciones apuntando a algo que ya no existe.
  if (count && count > 0) {
    const { error } = await sb.from("talleres").update({ activo: false }).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error: eDias } = await sb.from("taller_dias").delete().eq("taller_id", id);
  if (eDias) throw eDias;
  const { error } = await sb.from("talleres").delete().eq("id", id);
  if (error) throw error;
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
  const sb = exigirBase();
  const { error } = await sb
    .from("usuarios_internos")
    .update({ nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo })
    .eq("id", u.id);
  if (error) throw error;
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
  const sb = exigirBase();
  const { error } = await sb
    .from("evidencias")
    .update({ estado: "pendiente" })
    .eq("id", evidenciaId);
  if (error) throw error;
}

/** Dar de baja desactiva; nunca borra, o la bitácora pierde a su autor. */
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
  const { data, error: eBusca } = await sb
    .from("casos_soporte")
    .select("id")
    .eq("clave", clave)
    .maybeSingle();
  if (eBusca) throw eBusca;
  if (!data) throw new Error(`El caso ${clave} ya no existe.`);

  // Quien atiende es quien tiene la sesión abierta. Se toma de aquí y no de un
  // nombre que llegue desde la pantalla: `usuarios_internos.id` ES el id de
  // `auth.users`, así que la propia sesión ya lo dice sin poder equivocarse.
  const { data: sesion } = await sb.auth.getUser();

  const { error } = await sb
    .from("casos_soporte")
    .update({
      estado,
      resuelto_en: estado === "resuelto" ? new Date().toISOString() : null,
      ...(sesion.user?.id ? { atiende_id: sesion.user.id } : {}),
    })
    .eq("id", (data as { id: string }).id);
  if (error) throw error;
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

  const { data, error: eBusca } = await sb
    .from("participantes")
    .select("id, matricula")
    .eq("folio", folio)
    .maybeSingle();
  if (eBusca) throw eBusca;
  if (!data) throw new Error(`No encontramos el folio ${folio}.`);
  const fila = data as { id: string; matricula: string | null };

  const { error } = await sb.from("participantes").update({ nombre: limpio }).eq("id", fila.id);
  if (error) throw error;

  // El padrón solo tiene fila si es alumno; el docente y el externo no están en
  // ninguno, y ahí no hay nada más que corregir.
  if (fila.matricula) {
    const { error: ePadron } = await sb
      .from("padron_alumnos")
      .update({ nombre: limpio })
      .eq("matricula", fila.matricula);
    if (ePadron) throw ePadron;
  }
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
  const { data: p, error: eBusca } = await sb
    .from("participantes")
    .select("id")
    .eq("folio", datos.folio)
    .maybeSingle();
  if (eBusca) throw eBusca;
  if (!p) throw new Error(`No encontramos el folio ${datos.folio}.`);

  const { data, error } = await sb
    .from("casos_soporte")
    .insert({
      participante_id: (p as { id: string }).id,
      asunto: datos.asunto.trim(),
      detalle: datos.detalle.trim(),
      canal: datos.canal,
    })
    .select("clave, creado_en")
    .single();
  if (error) throw error;

  const fila = data as { clave: string; creado_en: string };
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
  const { data, error: eBusca } = await sb
    .from("casos_soporte")
    .select("id")
    .eq("clave", clave)
    .maybeSingle();
  if (eBusca) throw eBusca;
  if (!data) throw new Error(`El caso ${clave} ya no existe.`);

  const { error } = await sb
    .from("casos_soporte")
    .update({
      asunto: cambios.asunto.trim(),
      detalle: cambios.detalle.trim(),
      canal: cambios.canal,
    })
    .eq("id", (data as { id: string }).id);
  if (error) throw error;
}

export async function desactivarUsuarioRemoto(id: string): Promise<void> {
  const sb = exigirBase();
  const { error } = await sb.from("usuarios_internos").update({ activo: false }).eq("id", id);
  if (error) throw error;
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
  const { error } = await sb
    .from("asistencias")
    .update({
      anulada_en: new Date().toISOString(),
      anulada_por: sesion.user?.id ?? null,
      anulacion_motivo: motivo,
    })
    .eq("id", id);
  if (error) throw error;
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
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_padron_existe", { p_matricula: matricula });
  if (error) throw error;
  return data as { existe: boolean; ya_registrado: boolean };
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
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_padron_confirmar", {
    p_matricula: matricula,
    p_nombres: nombres,
    p_programa: programa,
  });
  if (error) throw error;
  return data as {
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
  } | null;
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
  tallerId?: string | undefined;
}) {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_preregistrar_externo", {
    p_perfil: datos.perfil,
    p_nombre: datos.nombre,
    p_correo: datos.correo,
    p_celular: datos.celular,
    p_institucion: datos.institucion,
    p_dia: datos.dia,
    p_taller: datos.tallerId ?? null,
  });
  // Se lanza el error tal cual, como en el alta de alumno: el mensaje viene de
  // un `raise exception` de la función y es específico —«ese taller no se
  // imparte el día 2»—, que ayuda más que uno genérico.
  if (error) throw error;
  return data as { id: string; folio: string; dia: Dia };
}

export async function preregistrarAlumno(datos: {
  matricula: string;
  correo: string;
  celular: string;
  tallerId?: string | undefined;
}) {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_preregistrar_alumno", {
    p_matricula: datos.matricula,
    p_correo: datos.correo,
    p_celular: datos.celular,
    p_taller: datos.tallerId ?? null,
  });
  if (error) throw error;
  return data as { id: string; folio: string; dia: Dia };
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
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_autenticar_portal", {
    p_folio: folio,
    p_credencial: credencial,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function estadoDelPortal(folio: string, credencial: string) {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_portal_estado", {
    p_folio: folio,
    p_credencial: credencial,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function abrirCasoNombreRemoto(participanteId: string, nombreCorrecto: string) {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_abrir_caso_nombre", {
    p_participante: participanteId,
    p_nombre_correcto: nombreCorrecto,
  });
  if (error) throw error;
  return data as string;
}

export async function evaluarEscaneoRemoto(entrada: string, dia: Dia, tipo: Asistencia["tipo"]) {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_evaluar_escaneo", {
    p_entrada: entrada,
    p_dia: dia,
    p_tipo: tipo,
  });
  if (error) throw error;
  return (data ?? [])[0] as
    | {
        color: "verde" | "amarillo" | "rojo";
        titulo: string;
        detalle: string;
        autorizable: boolean;
      }
    | undefined;
}

export async function repartirDiasRemoto(): Promise<number> {
  const sb = exigirBase();
  const { data, error } = await sb.rpc("fn_repartir_dias_pendientes");
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function reasignarDiaRemoto(matricula: string, dia: Dia): Promise<void> {
  const sb = exigirBase();
  const { error } = await sb.rpc("fn_reasignar_dia", { p_matricula: matricula, p_dia: dia });
  if (error) throw error;
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
 * Guarda el día que la organización asignó a un conjunto de alumnos.
 *
 * Esto faltaba por completo: repartir los días movía el estado de React y nada
 * más, así que recargar la página deshacía el trabajo de repartir dos mil
 * alumnos y nadie se enteraba hasta que un capturista veía a alguien sin día en
 * la puerta.
 *
 * Va por lotes por la misma razón que la importación: una sola petición con dos
 * mil matrículas en un `in (...)` es una URL de decenas de miles de caracteres,
 * y hay intermediarios que la cortan.
 */
export async function asignarDiaRemoto(
  matriculas: string[],
  dia: number | null,
  porLote = 200,
): Promise<void> {
  const sb = exigirBase();
  for (let i = 0; i < matriculas.length; i += porLote) {
    const { error } = await sb
      .from("padron_alumnos")
      .update({ dia })
      .in("matricula", matriculas.slice(i, i + porLote));
    if (error) throw new Error(error.message);
  }
}
