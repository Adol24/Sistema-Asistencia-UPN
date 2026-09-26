import { useState } from "react";
import { Info, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Campo } from "@/components/tipografia";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
 * El depósito lo cierra, y se dice ANTES de ofrecer el formulario
 * ---------------------------------------------------------------------------
 * Desde el 2026-09-25 el depósito es uno solo, y el concepto que la persona
 * escribe a mano en su hoja depende de si lleva taller. Así que añadirle un
 * taller a quien ya depositó no le cambia una cifra: le invalida el papel que ya
 * entregó en ventanilla, y deja el costo del taller sin cobrar.
 *
 * `fn_asignar_taller` lo rechaza, así que esto no es la guardia —la guardia está
 * en la base—. Es no hacer perder el tiempo: un formulario que se puede llenar y
 * que al enviarse contesta «no se puede» invita a intentarlo otra vez creyendo
 * que fue un fallo. Se enseña el motivo y a dónde ir, y no se dibuja el selector.
 *
 * La pregunta se hace con `sinDeposito` sobre los DOS conceptos y no con
 * `estadoPagoEvento === "pre_registrado"`: `expirado` también significa cero
 * filas de pago, y a esa persona sí se le puede asignar.
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

  const yaDeposito =
    !sinDeposito(participante.estadoPagoEvento) ||
    (participante.estadoPagoTaller !== undefined && !sinDeposito(participante.estadoPagoTaller));

  const actual = participante.tallerId ?? "";
  const activos = talleres.filter((t) => t.activo);
  const elegido = talleres.find((t) => t.id === clave);
  const sinCambio = clave === actual;

  const guardar = async () => {
    setGuardando(true);
    try {
      await asignar(participante.folio, clave === "" ? null : clave);
      toast.success(
        clave === ""
          ? `${participante.folio} se queda sin taller.`
          : `${participante.folio} queda en ${clave}. Su depósito ahora es de ${moneda(
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
          <DialogTitle>{actual ? "Cambiar su taller" : "Asignarle un taller"}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{participante.folio}</span> ·{" "}
          {participante.nombre}
        </p>

        {yaDeposito ? (
          <Alert variant="destructive" className="mt-4">
            <Wallet className="size-4" />
            <AlertTitle>Este folio ya tiene un depósito registrado</AlertTitle>
            <AlertDescription>
              El taller va en ese mismo depósito y su concepto ya está escrito en el voucher que
              entregó, así que desde aquí ya no se toca. Mándalo a Servicios Financieros: es donde
              está el dinero y quien puede decidir sobre él.
            </AlertDescription>
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
            {yaDeposito ? "Cerrar" : "Cancelar"}
          </Button>
          {yaDeposito ? null : (
            <Button
              className="h-11"
              onClick={() => void guardar()}
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
