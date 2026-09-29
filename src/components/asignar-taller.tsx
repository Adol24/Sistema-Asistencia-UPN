import { useState } from "react";
import { Info, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Campo } from "@/components/tipografia";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mensajeDeError } from "@/lib/errores";
import { moneda } from "@/lib/formato";
import { sinDeposito } from "@/lib/pagos-logica";
import type { Participante, Taller } from "@/dominio/tipos";

/**
 * Asignarle un taller a alguien que ya cerró su pre-registro, o quitárselo.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe
 * ---------------------------------------------------------------------------
 * Porque hasta ahora no había forma. Quien pulsaba «Continuar sin taller» se
 * quedaba sin taller para siempre: `/talleres` se cierra en cuanto hay folio,
 * `/confirmar-nombre` no ofrece volver, y no existía NINGUNA pantalla interna
 * que lo cambiara —`fn_cambiar_taller` está revocada a todo el mundo y solo la
 * llamaban las dos altas del pre-registro—. La única respuesta que el sistema
 * podía dar era «pregunta por WhatsApp», y al otro lado del WhatsApp no había
 * tampoco nada que pulsar.
 *
 * ---------------------------------------------------------------------------
 * El depósito cierra PONER, no QUITAR
 * ---------------------------------------------------------------------------
 * Desde el 2026-09-25 el depósito es uno solo, y el concepto que la persona
 * escribe a mano en su hoja depende de si lleva taller. Así que añadirle un
 * taller a quien ya depositó no le cambia una cifra: le invalida el papel que ya
 * entregó en ventanilla, y deja el costo del taller sin cobrar. Eso sigue
 * cerrado, y lo cierra cualquier depósito.
 *
 * Quitarlo es el caso contrario, y hasta el 2026-09-29 esta pantalla lo trataba
 * igual. Quien se pre-registró con evento y taller, luego decidió venir solo al
 * evento y depositó los 500 tiene una fila de pago del evento y NINGUNA del
 * taller. Su voucher dice 500 y nada más; quitarle el taller no contradice ese
 * papel, lo confirma, y no hay cobro que perder porque ese cobro no existió. Lo
 * que sí había era un lugar apartado que nadie iba a usar y un depósito que el
 * portal le enseñaba como si no lo hubiera hecho —`estadoDelDeposito` enseña lo
 * menos avanzado de los dos conceptos—.
 *
 * Así que la baja queda abierta mientras el taller no tenga cobro propio, y es
 * `fn_asignar_taller` quien manda: esto es su reflejo, no la guardia.
 *
 * ---------------------------------------------------------------------------
 * Lo único que la base no puede comprobar
 * ---------------------------------------------------------------------------
 * Que no haya fila de pago del taller significa que nadie lo REGISTRÓ, no que
 * nadie lo depositara. Entre que la persona deposita 600 y que quien cobra
 * confirma los dos conceptos, la base ve exactamente lo mismo que en el caso de
 * arriba. Ese dato está en el voucher, en papel, y por eso la baja pide una
 * confirmación explícita en vez de ofrecerse como un botón más.
 *
 * ---------------------------------------------------------------------------
 * Los llenos se enseñan, no se esconden
 * ---------------------------------------------------------------------------
 * Un taller sin lugares aparece en la lista desactivado y diciendo que está
 * lleno. Esconderlo haría buscar en la lista lo que no está, y quien atiende
 * tiene delante a alguien que probablemente venga preguntando por ese.
 *
 * La excepción es el que la persona YA tiene: se ofrece siempre, aunque el cupo
 * esté a tope, porque su lugar ya está contado dentro de esa cuenta.
 */
export function AsignarTaller({
  participante,
  talleres,
  asignar,
  alCerrar,
}: {
  /**
   * A quién.
   *
   * No admite nulo, y por eso quien lo usa lo monta dentro de un condicional con
   * `key={folio}`: así cada persona estrena componente y el `useState` de abajo
   * puede sembrarse de las props sin un efecto que lo sincronice. Con un
   * `participante | null` y el diálogo siempre montado, la selección de la
   * persona anterior sobreviviría a la siguiente.
   */
  participante: Participante;
  /** El catálogo completo; aquí se filtran los activos. */
  talleres: Taller[];
  asignar: (folio: string, clave: string | null) => Promise<void>;
  alCerrar: () => void;
}) {
  /*
   * `""` es «sin taller», y es un valor legítimo, no el estado vacío del campo.
   *
   * Un `<select>` nativo no puede llevar `null` en un `value`, y quitar el
   * taller es justo la mitad de lo que esta pantalla hace. Se traduce a `null`
   * en el único sitio donde importa, al llamar.
   */
  const [clave, setClave] = useState(participante.tallerId ?? "");
  const [guardando, setGuardando] = useState(false);
  /** La baja sobre un depósito ya hecho no se pulsa sin haber mirado el voucher. */
  const [comprobado, setComprobado] = useState(false);

  /*
   * Las dos preguntas, y son distintas.
   *
   * `sinDeposito` sobre los DOS conceptos y no `estadoPagoEvento ===
   * "pre_registrado"`: `expirado` también significa cero filas de pago, y a esa
   * persona sí se le puede mover el taller.
   *
   * `estadoPagoTaller` indefinido es «no tiene taller», no «su taller no está
   * pagado» —`estadoDePagos` lo deja así cuando `tallerId` es nulo—, y para la
   * pregunta que aquí importa cuentan igual: ninguna de las dos es una fila de
   * pago del taller.
   */
  const sinPagoTaller =
    participante.estadoPagoTaller === undefined || sinDeposito(participante.estadoPagoTaller);
  const yaDeposito = !sinDeposito(participante.estadoPagoEvento) || !sinPagoTaller;

  const actual = participante.tallerId ?? "";
  /** Ya depositó, pero de su taller no entró un peso: la baja sigue abierta. */
  const soloQuitar = yaDeposito && actual !== "" && sinPagoTaller;
  const activos = talleres.filter((t) => t.activo);
  const elegido = talleres.find((t) => t.id === clave);
  const sinCambio = clave === actual;
  const suyo = talleres.find((t) => t.id === actual);

  const aplicar = async (destino: string | null) => {
    setGuardando(true);
    try {
      await asignar(participante.folio, destino);
      toast.success(
        destino === null
          ? `${participante.folio} se queda sin taller.`
          : `${participante.folio} queda en ${destino}. Su depósito ahora es de ${moneda(
              participante.montoEsperadoEvento + (elegido?.costo ?? 0),
            )}.`,
      );
      alCerrar();
    } catch (e) {
      // El mensaje de la base es el útil: «ese taller ya no tiene lugares»,
      // «ese folio ya tiene un depósito registrado». `mensajeDeError` traduce
      // además los códigos que no traen texto.
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => (abierto ? null : alCerrar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {soloQuitar
              ? "Quitarle el taller"
              : actual
                ? "Cambiar su taller"
                : "Asignarle un taller"}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{participante.folio}</span> ·{" "}
          {participante.nombre}
        </p>

        {soloQuitar ? (
          <>
            <Alert className="mt-4 border-primary/30">
              <Info className="size-4" />
              <AlertTitle>Ya depositó, y el taller no entró en ese depósito</AlertTitle>
              <AlertDescription>
                De su taller {actual}
                {suyo ? ` (${moneda(suyo.costo)})` : ""} no hay ningún cobro registrado, así que
                quitárselo no mueve dinero: deja el registro como quedó su depósito y devuelve su
                lugar al cupo. Cambiárselo por otro taller sí pasa por Servicios Financieros, y
                desde aquí ya no se puede.
              </AlertDescription>
            </Alert>

            {/*
             * El aviso que la base no puede dar. Ver la nota de la cabecera: sin
             * fila de pago del taller, «no lo depositó» y «todavía no se lo han
             * confirmado» se ven idénticos desde cualquier consulta.
             */}
            <Alert variant="destructive" className="mt-4">
              <TriangleAlert className="size-4" />
              <AlertTitle>Mira su voucher antes de pulsar</AlertTitle>
              <AlertDescription>
                Si depositó el taller y lo que falta es que Servicios Financieros lo confirme, esto
                se ve igual desde aquí. En ese caso no se lo quites: mándalo a confirmar el cobro. Y
                la baja no se deshace desde este panel —volver a ponérselo lo cierra el depósito que
                ya hizo—, así que se hace una vez.
              </AlertDescription>
            </Alert>

            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={comprobado}
                onCheckedChange={(v) => setComprobado(v === true)}
              />
              <span>
                Comprobé que su depósito no incluye el taller y que quiere quedarse solo con el
                evento.
              </span>
            </label>
          </>
        ) : yaDeposito ? (
          <Alert variant="destructive" className="mt-4">
            <Wallet className="size-4" />
            {actual ? (
              <>
                <AlertTitle>Su taller ya tiene un cobro registrado</AlertTitle>
                <AlertDescription>
                  El costo del taller entró con su depósito, así que quitárselo es decidir qué pasa
                  con ese dinero. Mándalo a Servicios Financieros: es donde está y quien puede
                  decidir sobre él.
                </AlertDescription>
              </>
            ) : (
              <>
                <AlertTitle>Este folio ya tiene un depósito registrado</AlertTitle>
                <AlertDescription>
                  El taller va en ese mismo depósito y su concepto ya está escrito en el voucher que
                  entregó, así que añadírselo desde aquí le invalidaría el papel y dejaría el costo
                  sin cobrar. Mándalo a Servicios Financieros: es donde está el dinero y quien puede
                  decidir sobre él.
                </AlertDescription>
              </>
            )}
          </Alert>
        ) : (
          <>
            <Campo etiqueta="Taller" className="mt-4">
              <select
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="">Sin taller</option>
                {activos.map((t) => {
                  const libres = t.cupoTotal - t.cupoOcupado;
                  // El que ya tiene se ofrece aunque esté lleno: su lugar es uno
                  // de los que esa cuenta ya incluye.
                  const lleno = libres <= 0 && t.id !== actual;
                  return (
                    <option key={t.id} value={t.id} disabled={lleno}>
                      {t.id} — {t.nombre.slice(0, 60)}
                      {lleno
                        ? " (cupo lleno)"
                        : t.id === actual
                          ? " (el que tiene)"
                          : ` (${libres} ${libres === 1 ? "lugar" : "lugares"})`}
                    </option>
                  );
                })}
              </select>
            </Campo>

            {/*
             * El monto, y no como adorno: lo que esta pantalla cambia de verdad
             * es lo que esa persona tiene que depositar. Quien atiende va a
             * decírselo en voz alta al colgar.
             */}
            <Alert className="mt-4 border-primary/30">
              <Info className="size-4" />
              <AlertTitle>
                Su depósito queda en{" "}
                {moneda(participante.montoEsperadoEvento + (elegido?.costo ?? 0))}
              </AlertTitle>
              <AlertDescription>
                {elegido
                  ? `${moneda(participante.montoEsperadoEvento)} del evento y ${moneda(
                      elegido.costo,
                    )} del taller, en un solo depósito. El concepto que escriba a mano cambia: tiene que incluir el taller.`
                  : "Solo el evento, en un solo depósito. Si tenía taller, el concepto que escriba a mano ya no lo incluye."}
              </AlertDescription>
            </Alert>
          </>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-11" onClick={alCerrar} disabled={guardando}>
            {yaDeposito && !soloQuitar ? "Cerrar" : "Cancelar"}
          </Button>
          {soloQuitar ? (
            <Button
              variant="destructive"
              className="h-11"
              onClick={() => void aplicar(null)}
              disabled={guardando || !comprobado}
            >
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {guardando ? "Quitando…" : "Quitarle el taller"}
            </Button>
          ) : yaDeposito ? null : (
            <Button
              className="h-11"
              onClick={() => void aplicar(clave === "" ? null : clave)}
              disabled={guardando || sinCambio}
            >
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {guardando ? "Guardando…" : sinCambio ? "Sin cambios" : "Guardar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
