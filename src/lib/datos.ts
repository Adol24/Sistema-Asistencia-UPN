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
  aCaso,
  aCatalogo,
  aConfiguracion,
  aEvidencia,
  aParticipante,
  aTallerBase,
  aUsuario,
  type FilaAsistencia,
  type FilaCaso,
  type FilaConfiguracion,
  type FilaDia,
  type FilaEvidencia,
  type FilaNivel,
  type FilaPadron,
  type FilaParticipante,
  type FilaTaller,
  type FilaUsuario,
} from "@/lib/esquema";
import type {
  AlumnoPadron,
  Asistencia,
  CasoSoporte,
  Dia,
  Evidencia,
  Participante,
  TallerBase,
  UsuarioInterno,
} from "@/mocks/tipos";
import type { ConfiguracionEvento } from "@/mocks/evento";

/** Todo lo que el contexto necesita para arrancar. */
export interface Instantanea {
  configuracion: ConfiguracionEvento;
  talleresBase: TallerBase[];
  /** De la clave corta (`T01`) al uuid de la base, para poder escribir después. */
  idPorClave: Record<string, string>;
  participantes: Participante[];
  padron: AlumnoPadron[];
  asistencias: Asistencia[];
  evidencias: Evidencia[];
  usuarios: UsuarioInterno[];
  casos: CasoSoporte[];
}

const COLS_PARTICIPANTE = `
  id, folio, perfil, matricula, nombre, nombre_en_revision, correo, celular,
  institucion, avance, grupo, dia, taller_id, monto_esperado_evento,
  monto_esperado_taller, creado_en,
  niveles_academicos ( nivel ), programas ( nombre ), planteles ( nombre )
`;

/**
 * Carga el estado inicial. Devuelve `null` si no hay base configurada, que es la
 * señal para que el contexto siga con los datos simulados.
 */
export async function cargarTodo(): Promise<Instantanea | null> {
  if (!supabase) return null;
  const sb = supabase;

  const [cfg, dias, niveles, talleres] = await Promise.all([
    sb.from("configuracion_evento").select("*").eq("id", 1).single(),
    sb.from("dias_evento").select("*").order("dia"),
    sb
      .from("niveles_academicos")
      .select("id, nivel, etiqueta_avance, total_avance, orden, programas ( nombre )"),
    sb.from("talleres").select("*, taller_dias ( dia )").order("clave"),
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
  const claveporId = new Map(filasTaller.map((t) => [t.id, t.clave]));
  const sedePorDia = (d: Dia) =>
    configuracion.dias.find((x) => x.dia === d)?.sede ?? configuracion.dias[0]!.sede;

  // Lo del personal solo llega si quien pregunta tiene permiso: las políticas
  // devuelven cero filas en vez de un error, así que un participante anónimo
  // recibe listas vacías y las pantallas internas simplemente no tienen qué
  // mostrar. Es el comportamiento correcto, no un fallo que ocultar.
  const [participantes, padron, asistencias, evidencias, usuarios, casos] = await Promise.all([
    sb.from("participantes").select(COLS_PARTICIPANTE).order("folio"),
    sb
      .from("padron_alumnos")
      .select(
        "matricula, nombre, avance, grupo, dia, niveles_academicos ( nivel ), programas ( nombre ), planteles ( nombre )",
      )
      .order("matricula"),
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

  const errorDatos = participantes.error ?? padron.error ?? asistencias.error ?? evidencias.error;
  if (errorDatos) throw errorDatos;

  return {
    configuracion,
    talleresBase: filasTaller.map(aTallerBase),
    idPorClave,
    participantes: ((participantes.data ?? []) as unknown as FilaParticipante[]).map((p) =>
      aParticipante(p, sedePorDia),
    ),
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
  referencia: string;
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
    referencia: p.referencia,
    fecha_deposito: p.fechaDeposito,
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

export async function anotarEnBitacora(accion: string, detalle: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("bitacora").insert({ accion, detalle });
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
    ya_registrado: boolean;
  } | null;
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
