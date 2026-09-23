import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { usePrototipo } from "@/lib/prototipo";

/**
 * Impide entrar a un paso del pre-registro sin haber pasado por los anteriores.
 *
 * -----------------------------------------------------------------------------
 * Qué pasaba sin esto
 * -----------------------------------------------------------------------------
 * Ninguna ruta del flujo tenía guardia, así que todas eran alcanzables
 * escribiendo la URL, y con el borrador vacío.
 *
 * El caso que hace daño no es el de quien juega con la barra de direcciones: es
 * el de quien recarga la página a mitad del recorrido, o abre el enlace que le
 * pasaron por WhatsApp. En `/talleres` con el borrador vacío el catálogo se
 * enseña ENTERO —el filtro es `(!dia || t.dias.includes(dia))`, y sin día pasa
 * todo—, así que se le ofrecen talleres de días que no son el suyo; elige uno,
 * pulsa continuar, y el alta muere al final del recorrido con «Ese taller no se
 * imparte el día 2, que es el que te toca».
 *
 * Y si pulsa «Continuar sin taller», el alta sale con matrícula vacía y la base
 * contesta «Hay que aceptar el aviso de privacidad», que no significa nada para
 * quien nunca vio un aviso.
 *
 * -----------------------------------------------------------------------------
 * Por qué espera antes de decidir
 * -----------------------------------------------------------------------------
 * El borrador se recupera de la pestaña en un efecto, no como estado inicial
 * —el estado inicial se calcula también en el servidor, donde no hay
 * `sessionStorage`, y arrancar con él puesto haría que React tirase la página
 * para rehacerla—. O sea que el PRIMER dibujo siempre tiene el borrador vacío.
 *
 * Decidir ahí echaría a todo el mundo, incluido quien sí traía sus datos, por
 * llegar un fotograma antes. Por eso se espera a `recuperado`, que es
 * exactamente lo que el comentario de `prototipo.tsx` decía que haría falta el
 * día que alguna pantalla redirigiera.
 *
 * -----------------------------------------------------------------------------
 * Qué exige, y por qué tan poco
 * -----------------------------------------------------------------------------
 * Solo que la persona haya elegido su camino: matrícula si entró como alumno,
 * perfil si entró como docente o externo. No se pide más a propósito — una
 * guardia que exija de más echa a quien viene por un camino legítimo que nadie
 * previó, y eso es peor que el problema que resuelve.
 */
export function RequiereBorrador({ children }: { children: React.ReactNode }) {
  const { borrador, recuperado } = usePrototipo();
  const navigate = useNavigate();

  const identificado = Boolean(borrador.matricula || borrador.perfil);

  useEffect(() => {
    if (recuperado && !identificado) void navigate({ to: "/bienvenida", replace: true });
  }, [recuperado, identificado, navigate]);

  // Mientras se recupera no se dibuja nada: enseñar el paso y quitarlo medio
  // segundo después es más desconcertante que un instante en blanco.
  if (!recuperado || !identificado) return null;
  return <>{children}</>;
}
