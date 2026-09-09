import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { hayBaseDeDatos } from "@/lib/supabase-config";
import { aParticipante, type FilaParticipante } from "@/lib/esquema";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import type { Participante } from "@/mocks/tipos";

/** Lo que el portal necesita de una persona, en una sola llamada. */
export interface DatosPortal {
  participante: Participante;
  asistencias: { dia: number; tipo: string; hora: string }[];
  evidencias: { dia: number; estado: string; motivo_rechazo?: string | null }[];
}

interface Ctx {
  /** Credenciales de la sesión abierta, o `null` si nadie ha entrado. */
  sesion: { folio: string; credencial: string } | null;
  datos: DatosPortal | null;
  cargando: boolean;
  error: string;
  abrir: (folio: string, credencial: string) => void;
  cerrar: () => void;
  /** Vuelve a pedir los datos. Tras subir una evidencia, por ejemplo. */
  refrescar: () => void;
}

const PortalCtx = createContext<Ctx | null>(null);

/**
 * La sesión del participante en su portal.
 *
 * No hay sesión de verdad: el participante entra con folio y credencial, y esos
 * dos datos viajan en cada llamada. Se guardan en memoria y no en el navegador
 * a propósito —cerrar la pestaña cierra la sesión—, porque un folio guardado en
 * un teléfono prestado es una puerta abierta que nadie recuerda haber dejado.
 *
 * Todo lo que el portal muestra viene de `fn_portal_estado`, una sola llamada
 * que la base resuelve comprobando otra vez la credencial. Las cuatro pantallas
 * del portal leen de aquí y no del estado general del evento: ese carga tablas
 * completas que un participante no puede ni debe poder leer.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Ctx["sesion"]>(null);
  const [datos, setDatos] = useState<DatosPortal | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const { infoDia } = useEstadoEvento();

  const cargar = useCallback(async () => {
    if (!sesion || !hayBaseDeDatos) return;
    setCargando(true);
    setError("");
    try {
      const { estadoDelPortal } = await import("@/lib/datos");
      const crudo = await estadoDelPortal(sesion.folio, sesion.credencial);
      if (!crudo) {
        setDatos(null);
        setError("Tu sesión ya no es válida. Vuelve a entrar con tu folio.");
        return;
      }
      // Se reutiliza el mismo mapeo que usa la carga del personal: la vista es
      // la misma, así que inventar aquí otra conversión sería tener dos formas
      // de leer una fila y que se desincronicen.
      const fila = crudo["participante"] as FilaParticipante;
      const contacto = crudo["contacto"] as { correo?: string; celular?: string } | null;
      setDatos({
        participante: aParticipante(
          { ...fila, correo: contacto?.correo ?? "", celular: contacto?.celular ?? "" },
          (d) => infoDia(d).sede,
        ),
        asistencias: (crudo["asistencias"] ?? []) as DatosPortal["asistencias"],
        evidencias: (crudo["evidencias"] ?? []) as DatosPortal["evidencias"],
      });
    } catch {
      setError("No pudimos cargar tus datos. Inténtalo de nuevo en un momento.");
    } finally {
      setCargando(false);
    }
  }, [sesion, infoDia]);

  useEffect(() => {
    void cargar();
  }, [cargar, intento]);

  const valor = useMemo<Ctx>(
    () => ({
      sesion,
      datos,
      cargando,
      error,
      abrir: (folio, credencial) => setSesion({ folio, credencial }),
      cerrar: () => {
        setSesion(null);
        setDatos(null);
      },
      refrescar: () => setIntento((n) => n + 1),
    }),
    [sesion, datos, cargando, error],
  );

  return <PortalCtx.Provider value={valor}>{children}</PortalCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePortal(): Ctx {
  const ctx = useContext(PortalCtx);
  if (!ctx) throw new Error("usePortal fuera de PortalProvider");
  return ctx;
}

/**
 * El participante que el portal debe mostrar.
 *
 * Con base de datos es el de la sesión: sus datos llegan de `fn_portal_estado`,
 * que los devuelve solo a quien acredita folio y credencial. Sin base es el del
 * contexto, que es lo único que hay para revisar pantallas en local.
 *
 * Devuelve `null` mientras carga o cuando nadie ha entrado, y las pantallas lo
 * distinguen: enseñar los datos de otro mientras llegan los propios sería peor
 * que enseñar un rótulo de espera.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useParticipanteDelPortal(): Participante | null {
  const { datos } = usePortal();
  const { participante } = usePrototipo();
  return hayBaseDeDatos ? (datos?.participante ?? null) : participante;
}
