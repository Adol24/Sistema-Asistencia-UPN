import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useEstadoEvento } from "@/lib/estado-evento";
import { guardarJSON, leerJSON } from "@/lib/almacen-sesion";
import type { Participante } from "@/dominio/tipos";

interface Borrador {
  perfil?: Participante["perfil"] | undefined;
  matricula?: string | undefined;
  nombre?: string | undefined;
  correo?: string | undefined;
  celular?: string | undefined;
  /** Solo la capturan el docente y el externo; el alumno la hereda del padrón. */
  institucion?: string | undefined;
  /** Datos académicos que vienen del padrón. El alumno no los captura. */
  nivel?: string | undefined;
  programa?: string | undefined;
  avance?: number | undefined;
  grupo?: string | undefined;
  plantel?: string | undefined;
  dia?: 1 | 2 | 3 | undefined;
  tallerId?: string | undefined;
  nombreEnRevision?: boolean | undefined;
  /**
   * El nombre corregido, si el alumno dijo que el suyo está mal.
   *
   * Viaja en el borrador porque `casos_soporte.participante_id` es obligatorio:
   * el caso no puede abrirse en la pantalla de confirmación, donde el
   * participante todavía no existe. Se abre al cerrar el pre-registro, que es
   * cuando hay a quién colgárselo.
   */
  nombreCorrecto?: string | undefined;
  /**
   * Si aceptó el aviso de privacidad. Se marca en la pantalla donde teclea sus
   * datos y viaja hasta el alta, que es dónde se sella la fecha: entre las dos
   * hay dos pantallas más —el día y el taller— y el dato tiene que cruzarlas.
   */
  aceptoAviso?: boolean | undefined;
  /** El folio que devuelve la base al crear el pre-registro. Antes no existía:
   *  las pantallas de pago y comprobante enseñaban el del participante de
   *  contexto, o sea el de otra persona. */
  folio?: string | undefined;
  /**
   * Esta persona ya tenía un pre-registro ANTES de empezar esta vuelta.
   *
   * Lo dice `fn_padron_confirmar` en la misma ficha que entrega el expediente,
   * o sea DESPUÉS del reto de identidad. `fn_padron_existe` también lo
   * devuelve, desde `/alumno`, y ahí se ignora a propósito: ver el comentario
   * de esa pantalla.
   *
   * Viaja en el borrador porque quien lo necesita está dos pantallas más
   * adelante. `/talleres` tiene que dejar de tratar «continuar sin taller»
   * como algo inocuo cuando esta persona quizá ya tenga uno apartado.
   */
  yaRegistrado?: boolean | undefined;
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
  /**
   * ¿Ya se intentó recuperar el borrador de la pestaña?
   *
   * Lo necesita cualquier pantalla que quiera REDIRIGIR cuando el borrador está
   * vacío: el primer dibujo siempre lo está —la recuperación ocurre en un
   * efecto, ver abajo— así que decidir antes de esto echaría a quien sí venía
   * con sus datos, solo por llegar un fotograma antes.
   */
  recuperado: boolean;
  setBorrador: (b: Borrador) => void;
  reset: () => void;
}

const PrototipoCtx = createContext<Ctx | null>(null);

const CLAVE = "preregistro.borrador";

/**
 * El borrador, recuperado de la pestaña.
 *
 * Vivía solo en memoria, y eso rompía la pantalla que más importa del flujo:
 * recargar `/pago` —o volver a ella desde el historial— borraba el folio, que
 * es justo lo que esa pantalla llama «la llave del portal» y advierte de no
 * perder. Se enseñaba el rótulo «Tu folio» con nada debajo.
 *
 * Solo se comprueba que sea un objeto. Validar los quince campos uno a uno
 * sería pelearse con un dato que escribimos nosotros mismos, y lo que importa
 * —que el folio y la matrícula sean de quien dice— lo vuelve a comprobar la
 * base en cada llamada, no este `JSON.parse`.
 */
const leerBorrador = (): Borrador => {
  const v = leerJSON<Borrador>(CLAVE);
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
};

export function PrototipoProvider({ children }: { children: ReactNode }) {
  // La lista viene del contexto, no del mock: si la importación del padrón movió
  // a alguien de día, el participante de prueba lo refleja sin recargar.
  const { participantes } = useEstadoEvento();
  const [folio, setFolio] = useState<string | null>(null);
  const [borrador, setBorradorState] = useState<Borrador>({});
  const [recuperado, setRecuperado] = useState(false);

  /*
   * Se recupera en un efecto y no como estado inicial, aunque `portal.tsx` lo
   * haga de la otra forma.
   *
   * El estado inicial se calcula también en el servidor, donde no hay
   * `sessionStorage`: sale vacío. Si el cliente arrancara con el borrador ya
   * dentro, su primer dibujo no coincidiría con el HTML que acaba de recibir y
   * React tiraría la página para rehacerla. Recuperarlo después cuesta un
   * fotograma con el folio en blanco y no cuesta ningún parpadeo.
   *
   * Antes aquí decía que ninguna pantalla del flujo redirige con el borrador
   * vacío, y que si alguna llegara a hacerlo esto tendría que esperar a la
   * recuperación antes de decidir. Ya llegó: `RequiereBorrador` redirige, y por
   * eso ahora se publica `recuperado`. Decidir antes de que esto corra echaría
   * a quien sí venía con sus datos por llegar un fotograma antes.
   */
  useEffect(() => {
    const guardado = leerBorrador();
    if (Object.keys(guardado).length > 0) setBorradorState(guardado);
    setRecuperado(true);
  }, []);

  /*
   * Solo escribe cuando hay algo. Vaciar el almacén es cosa de `reset`, no de
   * cualquier estado vacío: el primer dibujo también está vacío, y borrar
   * desde aquí se llevaría por delante lo que el efecto de arriba iba a leer.
   */
  useEffect(() => {
    if (Object.keys(borrador).length > 0) guardarJSON(CLAVE, borrador);
  }, [borrador]);

  const value = useMemo<Ctx>(
    () => ({
      participante: participantes.find((p) => p.folio === folio) ?? null,
      setFolio,
      borrador,
      recuperado,
      setBorrador: (b) => setBorradorState((prev) => ({ ...prev, ...b })),
      reset: () => {
        guardarJSON(CLAVE, null);
        setBorradorState({});
      },
    }),
    [folio, borrador, recuperado, participantes],
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
