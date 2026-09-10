/**
 * Las filas tal como salen de la base, y cómo se convierten en los tipos que ya
 * usan las pantallas.
 *
 * Se escriben a mano y no con `supabase gen types` porque el generador necesita
 * conexión al proyecto, y las pantallas ya tienen sus tipos desde el prototipo:
 * lo que hace falta no es otro juego de tipos, sino el puente entre los dos.
 *
 * Cambian los nombres: la base usa `snake_case` y llaves de tipo `uuid`; la
 * aplicación usa `camelCase` y las claves cortas que se ven en pantalla (`T01`,
 * `PRE-00801`). Traducir aquí, en un solo lugar, evita que cada pantalla tenga
 * que saber de las dos convenciones.
 */

import type {
  AlumnoPadron,
  Asistencia,
  CasoSoporte,
  Dia,
  EstadoEvidencia,
  EstadoPago,
  Evidencia,
  Participante,
  Perfil,
  RolInterno,
  TallerBase,
  UsuarioInterno,
} from "@/dominio/tipos";
import type { NivelAcademico } from "@/dominio/catalogos";
import type { ConfiguracionEvento } from "@/lib/configuracion";
import type { PagoRegistrado } from "@/lib/pagos-logica";
import { rolDesdeBase } from "@/lib/roles";

// ============================================================ filas crudas ===

export interface FilaConfiguracion {
  nombre: string;
  subtitulo: string;
  fechas: string;
  cuota_evento: number;
  fecha_limite: string;
  horas_validacion: number;
  dominio_institucional: string | null;
  registro_entrada: string;
  registro_salida: string;
  whatsapp_soporte: string;
  correo_soporte: string;
  horario_soporte: string;
  banco_nombre: string;
  banco_cuenta: string;
  banco_clabe: string;
  banco_beneficiario: string;
  ventanilla_lugar: string;
  ventanilla_horario: string;
  aviso_privacidad: string;
  terminos: string;
}

export interface FilaDia {
  dia: Dia;
  etiqueta: string;
  fecha: string;
  /**
   * En la base la columna se llama `sede`; en la aplicación, `lugar`.
   *
   * La palabra que usa la UPN es «lugar», y el código debería hablar como ellos.
   * La columna no se renombró porque de ella dependen dos vistas y, a través de
   * `v_participantes`, la función que alimenta el portal: cambiarle el nombre
   * obliga a recrear todo eso contra una base en uso, y no compensa por una
   * palabra. La traducción vive aquí, que es donde ya se traduce el resto.
   */
  sede: string;
}

export interface FilaNivel {
  id: string;
  nivel: string;
  etiqueta_avance: string;
  total_avance: number;
  orden: number;
  programas: { nombre: string }[];
}

export interface FilaTaller {
  id: string;
  clave: string;
  nombre: string;
  ponente: string;
  descripcion: string;
  horario: string;
  lugar: string;
  cupo_total: number;
  ocupados_previos: number;
  costo: number;
  activo: boolean;
  taller_dias: { dia: Dia }[];
}

/**
 * El nivel llega anidado dentro del programa porque es el único camino que
 * PostgREST puede enlazar: ni `padron_alumnos` ni `participantes` tienen llave
 * foránea propia hacia `niveles_academicos`. Ver `COLS_PARTICIPANTE`.
 */
interface ProgramaConNivel {
  nombre: string;
  niveles_academicos: { nivel: string } | null;
}

export interface FilaPadron {
  matricula: string;
  nombre: string;
  avance: number;
  grupo: string | null;
  dia: Dia | null;
  programas: ProgramaConNivel | null;
  planteles: { nombre: string } | null;
}

export interface FilaParticipante {
  id: string;
  folio: string;
  perfil: Perfil;
  matricula: string | null;
  nombre: string;
  nombre_en_revision: boolean;
  correo: string;
  celular: string;
  institucion: string;
  avance: number | null;
  grupo: string | null;
  dia: Dia;
  taller_id: string | null;
  monto_esperado_evento: number;
  monto_esperado_taller: number | null;
  creado_en: string;
  programas: ProgramaConNivel | null;
  planteles: { nombre: string } | null;
}

export interface FilaPago {
  id: string;
  concepto: "evento" | "taller";
  monto: string | number;
  monto_esperado: string | number;
  referencia: string;
  fecha_deposito: string;
  resultado: "pagado" | "discrepancia";
  origen: "ventanilla" | "carga_masiva";
  nota: string | null;
  registrado_en: string;
  participantes: { folio: string } | null;
}

/**
 * El estado derivado que publica `v_estado_pago`: una fila por participante y
 * concepto, sin montos ni referencias.
 *
 * Existe aparte de `FilaPago` porque no todo el personal puede leer los pagos
 * —`pagos_lectura` es de administración, financieros y soporte— pero el escáner
 * de la puerta sí necesita saber si alguien pagó. Esta vista da exactamente eso
 * y nada más: ni cuánto, ni con qué referencia.
 */
export interface FilaEstadoPago {
  participante_id: string;
  concepto: "evento" | "taller";
  estado: EstadoPago;
}

export interface FilaAsistencia {
  id: string;
  dia: Dia;
  tipo: Asistencia["tipo"];
  registrada_en: string;
  punto: string;
  autorizacion_motivo: string | null;
  autorizada_por: string | null;
  participantes: { folio: string; nombre: string } | null;
  capturista: { nombre: string } | null;
  supervisor: { nombre: string } | null;
}

export interface FilaEvidencia {
  id: string;
  dia: Dia;
  archivo_url: string | null;
  hash_archivo: string | null;
  estado: EstadoEvidencia;
  subida_en: string | null;
  intentos: number;
  motivo_rechazo: string | null;
  revisor: string | null;
  participantes: { folio: string; nombre: string; matricula: string | null } | null;
}

export interface FilaUsuario {
  id: string;
  nombre: string;
  correo: string;
  /** El enum de Postgres, no el de la aplicación. Ver `lib/roles.ts`. */
  rol: string;
  activo: boolean;
  ultimo_acceso: string | null;
}

export interface FilaCaso {
  id: string;
  clave: string;
  asunto: string;
  detalle: string;
  estado: CasoSoporte["estado"];
  canal: CasoSoporte["canal"];
  creado_en: string;
  usuarios_internos: { nombre: string } | null;
  participantes: { folio: string; nombre: string } | null;
}

// ================================================================ el puente ===

/** La hora en el formato que usan las pantallas: `dd/mm/aaaa hh:mm`. */
export const aFechaHora = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Solo la hora, que es lo que se ve en la puerta. */
export const aHora = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function aConfiguracion(
  f: FilaConfiguracion,
  dias: FilaDia[],
  catalogo: NivelAcademico[],
): ConfiguracionEvento {
  const limite = new Date(f.fecha_limite);
  return {
    nombre: f.nombre,
    subtitulo: f.subtitulo,
    fechas: f.fechas,
    horario: `${f.registro_entrada} a ${f.registro_salida}`,
    cuotaEvento: Number(f.cuota_evento),
    // La base guarda una fecha real; las pantallas muestran el texto que la
    // gente lee. Se arma aquí para que nadie tenga que formatearlo dos veces.
    fechaLimite: limite.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    horasValidacion: f.horas_validacion,
    dominioInstitucional: f.dominio_institucional ?? "",
    registroEntrada: f.registro_entrada,
    registroSalida: f.registro_salida,
    whatsappSoporte: f.whatsapp_soporte,
    correoSoporte: f.correo_soporte,
    horarioSoporte: f.horario_soporte,
    banco: {
      banco: f.banco_nombre,
      cuenta: f.banco_cuenta,
      clabe: f.banco_clabe,
      beneficiario: f.banco_beneficiario,
    },
    ventanilla: { lugar: f.ventanilla_lugar, horario: f.ventanilla_horario },
    dias: dias.map((d) => ({ dia: d.dia, etiqueta: d.etiqueta, fecha: d.fecha, lugar: d.sede })),
    catalogoAcademico: catalogo,
    avisoPrivacidad: f.aviso_privacidad,
    terminos: f.terminos,
  };
}

export const aCatalogo = (filas: FilaNivel[]): NivelAcademico[] =>
  [...filas]
    .sort((a, b) => a.orden - b.orden)
    .map((n) => ({
      nivel: n.nivel,
      etiquetaAvance: n.etiqueta_avance,
      totalAvance: n.total_avance,
      programas: n.programas.map((p) => p.nombre).sort((a, b) => a.localeCompare(b)),
    }));

/**
 * Los talleres llegan con su cupo ya contado por la vista `v_talleres`, así que
 * `ocupadosPrevios` se recalcula hacia atrás: las pantallas esperan la forma del
 * prototipo, donde el cupo se derivaba de los inscritos.
 */
export const aTallerBase = (f: FilaTaller): TallerBase => ({
  id: f.clave,
  nombre: f.nombre,
  ponente: f.ponente,
  descripcion: f.descripcion,
  dias: f.taller_dias.map((d) => d.dia).sort(),
  horario: f.horario,
  lugar: f.lugar,
  cupoTotal: f.cupo_total,
  ocupadosPrevios: f.ocupados_previos,
  costo: Number(f.costo),
  activo: f.activo,
});

export const aAlumnoPadron = (f: FilaPadron): AlumnoPadron => ({
  matricula: f.matricula,
  nombre: f.nombre,
  nivel: f.programas?.niveles_academicos?.nivel ?? "",
  programa: f.programas?.nombre ?? "",
  avance: f.avance,
  grupo: f.grupo ?? undefined,
  plantel: f.planteles?.nombre ?? "",
  dia: f.dia ?? undefined,
});

/**
 * `numeric` de PostgreSQL llega como cadena, no como número: el driver no lo
 * convierte porque `numeric` admite más precisión de la que aguanta un `number`
 * de JavaScript. Aquí sí conviene, porque son importes de cuatro cifras, pero
 * hay que pedirlo: sin `Number()`, `monto - montoEsperado` concatena en vez de
 * restar y toda discrepancia se calcula mal.
 */
export const aPago = (f: FilaPago): PagoRegistrado => ({
  id: f.id,
  folio: f.participantes?.folio ?? "",
  concepto: f.concepto,
  monto: Number(f.monto),
  montoEsperado: Number(f.monto_esperado),
  referencia: f.referencia,
  fechaDeposito: f.fecha_deposito,
  nota: f.nota ?? undefined,
  resultado: f.resultado,
  origen: f.origen,
  registradoEn: f.registrado_en,
});

export function aParticipante(
  f: FilaParticipante,
  lugarPorDia: (d: Dia) => string,
  /** Estado derivado por `v_estado_pago`. Ausente cuando quien pregunta no puede leerla. */
  estado?: (participanteId: string, concepto: "evento" | "taller") => EstadoPago | undefined,
): Participante {
  return {
    id: f.id,
    folio: f.folio,
    matricula: f.matricula ?? undefined,
    nombre: f.nombre,
    perfil: f.perfil,
    correo: f.correo,
    celular: f.celular,
    institucion: f.institucion,
    nivel: f.programas?.niveles_academicos?.nivel,
    programa: f.programas?.nombre,
    avance: f.avance ?? undefined,
    grupo: f.grupo ?? undefined,
    plantel: f.planteles?.nombre,
    dia: f.dia,
    lugar: lugarPorDia(f.dia),
    // El estado de pago no vive en esta fila: la base lo deriva en
    // `v_estado_pago`, y de ahí llega. Antes se fijaba a `pre_registrado` sin
    // más, así que quien había pagado ayer aparecía hoy como si no, y el
    // escáner de la puerta lo detenía en rojo.
    estadoPagoEvento: estado?.(f.id, "evento") ?? "pre_registrado",
    tallerId: f.taller_id ?? undefined,
    estadoPagoTaller: f.taller_id ? (estado?.(f.id, "taller") ?? "pre_registrado") : undefined,
    nombreEnRevision: f.nombre_en_revision,
    montoEsperadoEvento: Number(f.monto_esperado_evento),
    montoEsperadoTaller:
      f.monto_esperado_taller === null ? undefined : Number(f.monto_esperado_taller),
    creadoEn: aFechaHora(f.creado_en),
  };
}

export const aAsistencia = (f: FilaAsistencia): Asistencia => ({
  id: f.id,
  folio: f.participantes?.folio ?? "",
  nombre: f.participantes?.nombre ?? "",
  dia: f.dia,
  tipo: f.tipo,
  hora: aHora(f.registrada_en),
  punto: f.punto,
  // Sin capturista es un cierre automático: la base deja el campo vacío porque
  // no lo hizo nadie, y las pantallas ya distinguen ese caso.
  capturista: f.capturista?.nombre ?? "Cierre automático",
  ...(f.capturista ? {} : { cierreAutomatico: true }),
  ...(f.autorizacion_motivo
    ? {
        autorizacion: {
          nota: f.autorizacion_motivo,
          autorizadoPor: f.supervisor?.nombre ?? "Supervisor",
          en: aFechaHora(f.registrada_en),
        },
      }
    : {}),
});

export const aEvidencia = (f: FilaEvidencia): Evidencia => ({
  id: f.id,
  folio: f.participantes?.folio ?? "",
  matricula: f.participantes?.matricula ?? "",
  nombre: f.participantes?.nombre ?? "",
  dia: f.dia,
  estado: f.estado,
  hash: f.hash_archivo ?? "",
  // La imagen vive en Storage; la fila solo guarda su ruta.
  imagen: f.archivo_url ?? "",
  intentos: f.intentos,
  subidaEn: f.subida_en ? aFechaHora(f.subida_en) : "",
  ...(f.motivo_rechazo ? { motivoRechazo: f.motivo_rechazo } : {}),
  ...(f.revisor ? { revisor: f.revisor } : {}),
});

export const aUsuario = (f: FilaUsuario): UsuarioInterno => ({
  id: f.id,
  nombre: f.nombre,
  correo: f.correo,
  rol: rolDesdeBase(f.rol),
  activo: f.activo,
  ultimoAcceso: f.ultimo_acceso ? aFechaHora(f.ultimo_acceso) : "",
});

export const aCaso = (f: FilaCaso): CasoSoporte => ({
  id: f.clave,
  folio: f.participantes?.folio ?? "",
  nombre: f.participantes?.nombre ?? "",
  asunto: f.asunto,
  detalle: f.detalle,
  estado: f.estado,
  canal: f.canal,
  creadoEn: aFechaHora(f.creado_en),
  atiende: f.usuarios_internos?.nombre,
});
