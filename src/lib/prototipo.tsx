import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useEstadoEvento } from "@/lib/estado-evento";
import type { Participante } from "@/dominio/tipos";

interface Borrador {
  perfil?: Participante["perfil"] | undefined;
  matricula?: string | undefined;
  nombre?: string | undefined;
  correo?: string | undefined;
  celular?: string | undefined;
  /** Datos académicos que vienen del padrón. El alumno no los captura. */
  nivel?: string | undefined;
  programa?: string | undefined;
  avance?: number | undefined;
  grupo?: string | undefined;
  plantel?: string | undefined;
  dia?: 1 | 2 | 3 | undefined;
  tallerId?: string | undefined;
  nombreEnRevision?: boolean | undefined;
  /** El folio que devuelve la base al crear el pre-registro. Antes no existía:
   *  las pantallas de pago y comprobante enseñaban el del participante de
   *  contexto, o sea el de otra persona. */
  folio?: string | undefined;
}

interface Ctx {
  /**
   * Quien está usando el flujo, o `null` si todavía no hay nadie.
   *
   * Antes nunca era nulo porque siempre había una lista de ejemplo detrás:
   * `participantes[0]!`. Sin datos simulados, la lista empieza vacía y esa
   * afirmación se cae al arrancar. Hacerlo nulo obliga a cada pantalla a decidir
   * qué enseña cuando no hay nadie, que es una pregunta que siempre existió y
   * que los datos de ejemplo ocultaban.
   */
  participante: Participante | null;
  setFolio: (folio: string) => void;
  borrador: Borrador;
  setBorrador: (b: Borrador) => void;
  reset: () => void;
}

const PrototipoCtx = createContext<Ctx | null>(null);

export function PrototipoProvider({ children }: { children: ReactNode }) {
  // La lista viene del contexto, no del mock: si la importación del padrón movió
  // a alguien de día, el participante de prueba lo refleja sin recargar.
  const { participantes } = useEstadoEvento();
  const [folio, setFolio] = useState<string | null>(null);
  const [borrador, setBorradorState] = useState<Borrador>({});

  const value = useMemo<Ctx>(
    () => ({
      participante: participantes.find((p) => p.folio === folio) ?? null,
      setFolio,
      borrador,
      setBorrador: (b) => setBorradorState((prev) => ({ ...prev, ...b })),
      reset: () => setBorradorState({}),
    }),
    [folio, borrador, participantes],
  );

  return <PrototipoCtx.Provider value={value}>{children}</PrototipoCtx.Provider>;
}

// Se conserva el hook junto a su proveedor: es la convención de React para un
// contexto y mantiene `PrototipoCtx` privado del módulo. Separarlo solo para
// callar la regla obligaría a tres archivos y a tocar los ~10 sitios que
// importan `usePrototipo`, a cambio de una mejora de Fast Refresh en desarrollo.
// eslint-disable-next-line react-refresh/only-export-components
export function usePrototipo() {
  const ctx = useContext(PrototipoCtx);
  if (!ctx) throw new Error("usePrototipo debe usarse dentro de PrototipoProvider");
  return ctx;
}
