import { cn } from "@/lib/utils";
import type { CasoSoporte, EstadoEvidencia, EstadoPago, Perfil, Semaforo } from "@/mocks/tipos";

type EstadoCaso = CasoSoporte["estado"];
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileClock,
  ImageOff,
  ThumbsDown,
  ThumbsUp,
  TimerOff,
} from "lucide-react";

const pago: Record<EstadoPago, { texto: string; clase: string; Icono: typeof Clock }> = {
  pre_registrado: {
    texto: "Pre-registrado",
    clase: "bg-estado-pre-bg text-estado-pre border-estado-pre/30",
    Icono: Clock,
  },
  comprobante_recibido: {
    texto: "Comprobante recibido",
    clase: "bg-estado-comprobante-bg text-estado-comprobante border-estado-comprobante/30",
    Icono: FileClock,
  },
  pagado: {
    texto: "Pagado",
    clase: "bg-estado-pagado-bg text-estado-pagado border-estado-pagado/30",
    Icono: CheckCircle2,
  },
  discrepancia: {
    texto: "Discrepancia",
    clase: "bg-estado-discrepancia-bg text-estado-discrepancia border-estado-discrepancia/30",
    Icono: AlertTriangle,
  },
  expirado: {
    texto: "Expirado",
    clase: "bg-estado-expirado-bg text-estado-expirado border-estado-expirado/30",
    Icono: TimerOff,
  },
  cancelado: {
    texto: "Cancelado",
    clase: "bg-estado-cancelado-bg text-estado-cancelado border-estado-cancelado/30",
    Icono: Ban,
  },
};

const base =
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold leading-none";

export function EstadoPagoBadge({
  estado,
  etiqueta,
  className,
}: {
  estado: EstadoPago;
  etiqueta?: string;
  className?: string;
}) {
  const c = pago[estado];
  return (
    <span className={cn(base, c.clase, className)}>
      <c.Icono className="size-3.5" aria-hidden />
      {etiqueta ? `${etiqueta}: ${c.texto}` : c.texto}
    </span>
  );
}

const evidencia: Record<EstadoEvidencia, { texto: string; clase: string; Icono: typeof Clock }> = {
  pendiente: {
    texto: "Pendiente de revisión",
    clase: "bg-estado-comprobante-bg text-estado-comprobante border-estado-comprobante/30",
    Icono: Clock,
  },
  aprobada: {
    texto: "Aprobada",
    clase: "bg-estado-pagado-bg text-estado-pagado border-estado-pagado/30",
    Icono: ThumbsUp,
  },
  rechazada: {
    texto: "Rechazada",
    clase: "bg-estado-cancelado-bg text-estado-cancelado border-estado-cancelado/30",
    Icono: ThumbsDown,
  },
  no_entregada: {
    texto: "No entregada",
    clase: "bg-estado-pre-bg text-estado-pre border-estado-pre/30",
    Icono: ImageOff,
  },
};

export function EstadoEvidenciaBadge({
  estado,
  className,
}: {
  estado: EstadoEvidencia;
  className?: string;
}) {
  const c = evidencia[estado];
  return (
    <span className={cn(base, c.clase, className)}>
      <c.Icono className="size-3.5" aria-hidden />
      {c.texto}
    </span>
  );
}

const perfiles: Record<Perfil, { texto: string; clase: string }> = {
  alumno: {
    texto: "ALUMNO",
    clase: "bg-perfil-alumno-bg text-perfil-alumno border-perfil-alumno/30",
  },
  docente: {
    texto: "DOCENTE",
    clase: "bg-perfil-docente-bg text-perfil-docente border-perfil-docente/30",
  },
  externo: {
    texto: "EXTERNO",
    clase: "bg-perfil-externo-bg text-perfil-externo border-perfil-externo/30",
  },
};

export function PerfilBadge({ perfil, className }: { perfil: Perfil; className?: string }) {
  const c = perfiles[perfil];
  return <span className={cn(base, "tracking-wide", c.clase, className)}>{c.texto}</span>;
}

/**
 * Semáforo de una fila de vista previa: lo comparten la carga masiva de pagos y
 * la importación del padrón. Estaba definido por separado en cada una, con los
 * mismos colores y las mismas etiquetas.
 */
export type SemaforoFilaEstado = "listo" | "advertencia" | "error";

const semaforoFila: Record<SemaforoFilaEstado, { texto: string; clase: string }> = {
  listo: {
    texto: "Listo",
    clase: "bg-estado-pagado-bg text-estado-pagado border-estado-pagado/30",
  },
  advertencia: {
    texto: "Advertencia",
    clase: "bg-estado-discrepancia-bg text-estado-discrepancia border-estado-discrepancia/30",
  },
  error: {
    texto: "Error",
    clase: "bg-estado-cancelado-bg text-estado-cancelado border-estado-cancelado/30",
  },
};

export function SemaforoFilaBadge({
  estado,
  className,
}: {
  estado: SemaforoFilaEstado;
  className?: string;
}) {
  const c = semaforoFila[estado];
  return <span className={cn(base, c.clase, className)}>{c.texto}</span>;
}

/**
 * Estado de un caso de soporte. Mismo vocabulario de color que los estados de
 * pago: rojo lo que está abierto, ámbar lo que avanza, verde lo cerrado.
 */
const casoSoporte: Record<EstadoCaso, { texto: string; clase: string }> = {
  abierto: {
    texto: "Abierto",
    clase: "bg-estado-cancelado-bg text-estado-cancelado border-estado-cancelado/30",
  },
  en_proceso: {
    texto: "En proceso",
    clase: "bg-estado-discrepancia-bg text-estado-discrepancia border-estado-discrepancia/30",
  },
  resuelto: {
    texto: "Resuelto",
    clase: "bg-estado-pagado-bg text-estado-pagado border-estado-pagado/30",
  },
};

export function EstadoCasoBadge({ estado, className }: { estado: EstadoCaso; className?: string }) {
  const c = casoSoporte[estado];
  return <span className={cn(base, c.clase, className)}>{c.texto}</span>;
}

/**
 * Punto de color del semáforo de escaneo, para listas e historiales. Estaba
 * duplicado entre la pantalla de escaneo y la de historial.
 */
const CLASE_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-semaforo-verde",
  amarillo: "bg-semaforo-amarillo",
  rojo: "bg-semaforo-rojo",
};

export function PuntoSemaforo({ color, className }: { color: Semaforo; className?: string }) {
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full", CLASE_SEMAFORO[color], className)}
      aria-hidden
    />
  );
}
