import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { hayBaseDeDatos } from "@/lib/supabase-config";
import { aParticipanteDeVista, type FilaVistaParticipante } from "@/lib/esquema";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePrototipo } from "@/lib/prototipo";
import { guardarJSON, leerJSON } from "@/lib/almacen-sesion";
import type { Participante } from "@/dominio/tipos";

/**
 * El veredicto de `v_elegibles`, tal como lo manda `fn_portal_estado`.
 *
 * **Hoy no lo consume ninguna pantalla, y se declara igual.** Lo leía
 * `/portal/constancia`, que se quitó: evaluaba el caso de cada alumno y dos de
 * los tres requisitos solo se cumplen durante el evento, así que en las semanas
 * previas le enseñaba tachas rojas sobre cosas que no estaban en su mano. Ver
 * `portal-nav.tsx`.
 *
 * Se conserva porque `DatosPortal` tiene que reflejar lo que la función
 * devuelve, y eso no es celo por la simetría: los avisos del portal salieron
 * vacíos durante semanas justamente porque `fn_portal_estado` mandaba un campo
 * `avisos` que este tipo no declaraba, así que el cliente lo tiraba sin que
 * nadie se enterara. Un campo declarado y sin usar se ve; uno que falta, no.
 */
export interface ElegibilidadPortal {
  elegible: boolean;
  tiene_entrada: boolean;
  tiene_salida: boolean;
  evidencias_aprobadas: number;
  estado_pago_evento: string;
  nombre_en_revision: boolean;
}

/** Lo que el portal necesita de una persona, en una sola llamada. */
export interface DatosPortal {
  participante: Participante;
  asistencias: { dia: number; tipo: string; hora: string }[];
  evidencias: { dia: number; estado: string; motivo_rechazo?: string | null }[];
  /** `null` mientras la vista no tenga fila para esa persona. */
  elegibilidad: ElegibilidadPortal | null;
  /**
   * Los cambios que alguien le hizo a su registro y todavía no ha visto.
   *
   * Vienen de `avisos_participante`, ya filtrados por `visto_en is null`. Es la
   * ÚNICA forma de que le lleguen: el mapa en memoria que los servía antes
   * perdió su productor con la migración 60 —era la liberación del taller al
   * cambiar de día, que ya no ocurre— y las filas que la tabla guardaba desde
   * el principio no se habían enseñado nunca.
   */
  avisos: { id: string; texto: string }[];
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
 * El `try`/`catch` y la elección de `sessionStorage` viven ahora en
 * `almacen-sesion`, porque el pre-registro necesita exactamente lo mismo.
 *
 * Aquí sí se comprueban los dos campos: lo que se lee son credenciales, y una
 * con la forma equivocada haría fallar la llamada más adelante, lejos de donde
 * se originó.
 */
const leerSesion = (): { folio: string; credencial: string } | null => {
  const v = leerJSON<{ folio?: unknown; credencial?: unknown }>(CLAVE);
  return v && typeof v.folio === "string" && typeof v.credencial === "string"
    ? { folio: v.folio, credencial: v.credencial }
    : null;
};

const guardarSesion = (s: { folio: string; credencial: string } | null) => guardarJSON(CLAVE, s);

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
      const { estadoDelPortal, cargarPublico } = await import("@/lib/datos");
      /*
       * El catálogo público trae `idPorClave`, y de ahí sale la traducción del
       * uuid del taller a su clave. Se pide aquí porque `fn_portal_estado`
       * devuelve una fila de `v_participantes`, que trae el uuid: sin traducir,
       * `/portal/estado` buscaba el taller por uuid en una lista indexada por
       * clave y le decía «sin taller» a quien sí tenía uno.
       *
       * No cuesta una llamada de más: `cargarPublico` tiene media hora de caché
       * y las pantallas públicas ya la tienen pedida cuando se llega aquí.
       */
      // `cargarPublico` devuelve `null` sin base configurada. Aquí no puede
      // pasar —`cargar` sale antes si `!hayBaseDeDatos`— pero el tipo lo admite
      // y un mapa vacío es la respuesta correcta a «no hay catálogo».
      const publico = await cargarPublico();
      const clavePorId = new Map(
        Object.entries(publico?.idPorClave ?? {}).map(([clave, id]) => [id, clave]),
      );
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
          (uuid) => clavePorId.get(uuid),
        ),
        asistencias: (crudo["asistencias"] ?? []) as DatosPortal["asistencias"],
        evidencias: (crudo["evidencias"] ?? []) as DatosPortal["evidencias"],
        // Se mapea aunque ninguna pantalla lo lea ya: es lo que la función
        // devuelve. Ver `ElegibilidadPortal`.
        elegibilidad: (crudo["elegibilidad"] ?? null) as DatosPortal["elegibilidad"],
        avisos: (crudo["avisos"] ?? []) as DatosPortal["avisos"],
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

  /*
   * El portal se mantiene al día preguntando, no escuchando.
   *
   * El participante no tiene sesión: es un anónimo, y las políticas le cierran
   * `participantes`, `pagos` y todo lo demás. Suscribirlo a los cambios de esas
   * tablas abriría un canal que nunca recibiría nada, porque Realtime evalúa
   * las políticas de quien escucha. Su único camino es `fn_portal_estado`, que
   * comprueba folio y credencial en cada llamada, así que aquí «tiempo real»
   * significa volver a llamarla.
   *
   * Cada TRES MINUTOS, y solo con la pestaña al frente. Con la pestaña oculta
   * no se pregunta: sería gastar batería y llamadas por una pantalla que nadie
   * mira, y al volver se refresca de inmediato, que es lo que cubre el caso de
   * quien deja el portal abierto mientras hace la fila.
   *
   * -------------------------------------------------------------------------
   * Eran 20 segundos, y ese número impedía proteger la puerta.
   * -------------------------------------------------------------------------
   * El argumento de entonces era bueno: lo que este alumno espera ver aparecer
   * es su pago confirmado en ventanilla, está de pie delante de la caja, y 20
   * segundos es más rápido que sacar el tema. Lo que no se vio es lo que ese
   * número costaba del otro lado.
   *
   * `fn_autenticar_portal` está concedida al anónimo y los folios son una
   * secuencia, así que sin tope por IP se recorren enteros hasta dar con el par
   * folio + matrícula de otra persona. Pero a tres llamadas por minuto, ningún
   * tope capaz de estorbar a un barrido dejaba pasar a quien simplemente mira
   * su propio estado: la protección era imposible mientras el refresco fuera
   * este.
   *
   * A tres minutos, una persona gasta quince llamadas largas en diez minutos y
   * el tope de la migración 51 —cuarenta— le queda holgado. Y sigue siendo más
   * rápido que preguntar en la mesa de incidencias, que es la vara real.
   */
  useEffect(() => {
    if (!sesion || !hayBaseDeDatos) return;

    const alFrente = () => document.visibilityState === "visible";
    const t = setInterval(() => {
      if (alFrente()) void cargar();
    }, 3 * 60_000);

    const alVolver = () => {
      if (alFrente()) void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sesion, cargar]);

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
