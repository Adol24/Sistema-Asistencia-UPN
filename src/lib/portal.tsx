import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { hayBaseDeDatos } from "@/lib/supabase-config";
import { aParticipanteDeVista, type FilaVistaParticipante } from "@/lib/esquema";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import type { Participante } from "@/dominio/tipos";

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

const CLAVE = "portal.sesion";

/**
 * Lee y escribe la sesión en `sessionStorage`, sin reventar si no existe.
 *
 * **`sessionStorage` y no `localStorage`, y la diferencia es el punto entero.**
 * `sessionStorage` vive mientras la pestaña siga abierta: sobrevive a una
 * recarga y a navegar entre las pantallas del portal, y desaparece al cerrarla.
 * `localStorage` sobreviviría también al cierre, y eso es justo lo que no
 * queremos: un folio guardado en un teléfono prestado es una puerta abierta que
 * nadie recuerda haber dejado.
 *
 * Todo va protegido porque en navegación privada, o con las cookies bloqueadas,
 * el acceso lanza. Si no se puede guardar, el portal funciona igual que antes:
 * la recarga vuelve a pedir el folio, que es molesto pero no roto.
 */
const almacen = () => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const leerSesion = (): { folio: string; credencial: string } | null => {
  try {
    const crudo = almacen()?.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as { folio?: unknown; credencial?: unknown };
    return typeof v.folio === "string" && typeof v.credencial === "string"
      ? { folio: v.folio, credencial: v.credencial }
      : null;
  } catch {
    return null;
  }
};

const guardarSesion = (s: { folio: string; credencial: string } | null) => {
  try {
    if (s) almacen()?.setItem(CLAVE, JSON.stringify(s));
    else almacen()?.removeItem(CLAVE);
  } catch {
    /* Sin almacenamiento, la sesión vive solo en memoria. */
  }
};

/**
 * La sesión del participante en su portal.
 *
 * No hay sesión de verdad: el participante entra con folio y credencial, y esos
 * dos datos viajan en cada llamada. Se guardan en `sessionStorage`, así que
 * recargar la página no lo echa fuera pero cerrar la pestaña sí. Antes vivían
 * solo en memoria y cualquier recarga —o un giro de pantalla que reiniciara la
 * aplicación— lo devolvía a la pantalla de entrada a teclear su folio y su
 * matrícula otra vez.
 *
 * Que la base vuelva a comprobar la credencial en cada llamada es lo que hace
 * esto aceptable: lo guardado no es un permiso, son las mismas credenciales que
 * se van a verificar de nuevo. Si el folio deja de ser válido, la siguiente
 * llamada lo rechaza igual.
 *
 * Todo lo que el portal muestra viene de `fn_portal_estado`, una sola llamada
 * que la base resuelve comprobando otra vez la credencial. Las cuatro pantallas
 * del portal leen de aquí y no del estado general del evento: ese carga tablas
 * completas que un participante no puede ni debe poder leer.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Ctx["sesion"]>(leerSesion);
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
        // Se borra lo guardado: una credencial que la base ya rechaza no debe
        // sobrevivir a la siguiente recarga para volver a fallar igual.
        guardarSesion(null);
        setSesion(null);
        setDatos(null);
        setError("Tu sesión ya no es válida. Vuelve a entrar con tu folio.");
        return;
      }
      // `fn_portal_estado` devuelve una fila de `v_participantes`, no de la
      // tabla: el nivel, el programa y el plantel vienen planos, y el estado de
      // pago viene ya derivado. Aquí se decía que era una `FilaParticipante` y
      // no lo es, así que los tres primeros salían vacíos y el estado de pago
      // se quedaba clavado en `pre_registrado` aunque la persona hubiera pagado.
      const fila = crudo["participante"] as FilaVistaParticipante;
      const contacto = crudo["contacto"] as { correo?: string; celular?: string } | null;
      setDatos({
        participante: aParticipanteDeVista(
          { ...fila, correo: contacto?.correo ?? "", celular: contacto?.celular ?? "" },
          (d) => infoDia(d).lugar,
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
      abrir: (folio, credencial) => {
        const s = { folio, credencial };
        guardarSesion(s);
        setSesion(s);
      },
      cerrar: () => {
        guardarSesion(null);
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
