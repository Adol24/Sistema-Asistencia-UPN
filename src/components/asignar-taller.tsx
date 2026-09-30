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

  /*
   * Al maestro el taller no le cuesta, y el catálogo no lo sabe.
   *
   * `fn_cambiar_taller` escribe `monto_esperado_taller` en CERO para todo
   * docente desde el 2026-09-30 —antes solo para el exento—, por mucho que el
   * taller cueste cien. Sumar aquí el costo del catálogo le diría a quien
   * atiende una cifra que la base no va a esperarle nunca, y mandaría al banco
   * a alguien con un importe que ventanilla va a rechazar.
   *
   * Son DOS preguntas y no una, porque son dos hechos distintos:
   *
   *   · `noPagaCuota` es la exención de ayer: quien respondió que no quiere
   *     constancia no debe nada, ni del evento ni del taller. Se lee de
   *     `monto_esperado_evento` —la MISMA columna que `fn_sincronizar_exencion`
   *     pone en cero— y no de una derivación: `quiere_constancia` no llega al
   *     cliente, `Participante` no la trae.
   *   · `esDocente` es la cuota de hoy: el maestro que SÍ quiere constancia
   *     paga `cuota_docente`, que ya incluye el taller. Ese tiene
   *     `monto_esperado_evento` en 250, así que la primera pregunta no lo ve.
   */
  const noPagaCuota = participante.montoEsperadoEvento === 0;
  const esDocente = participante.perfil === "docente";
  const costoDelTaller = (t: Taller | undefined) =>
    noPagaCuota || esDocente ? 0 : (t?.costo ?? 0);

  /*
   * Lo que la base tiene apuntado de SU taller, no lo que cuesta en el catálogo.
   *
   * Son la misma cifra para casi todo el mundo y distintas justo para el exento,
   * que es quien tiene un taller de cien apuntado en cero.
   */
  const suyo = talleres.find((t) => t.id === actual);
  const costoApuntado = participante.montoEsperadoTaller ?? costoDelTaller(suyo);

  const aplicar = async (destino: string | null) => {
    setGuardando(true);
    try {
      await asignar(participante.folio, destino);
      toast.success(
        destino === null
          ? `${participante.folio} se queda sin taller.`
          : `${participante.folio} queda en ${destino}. Su depósito ahora es de ${moneda(
              participante.montoEsperadoEvento + costoDelTaller(elegido),
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
                De su taller {actual} ({moneda(costoApuntado)}) no hay ningún cobro registrado, así
                que quitárselo no mueve dinero: deja el registro como quedó su depósito y devuelve
                su lugar al cupo. Cambiárselo por otro taller sí pasa por Servicios Financieros, y
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
                  /*
                   * Los lugares libres DE ESTA PERSONA, no los del aula.
                   *
                   * Desde el 2026-09-29 cada aula tiene 35 lugares de los que 30
                   * son definitivos de los alumnos: los 5 de arriba solo los puede
                   * ocupar un docente. Aquí sí se sabe de quién es la ficha, así
                   * que se pregunta por el contador que le toca; con un solo
                   * número, quien atiende le ofrecería a un alumno un lugar que la
                   * base va a rechazar al guardar.
                   *
                   * El externo no es docente: los 5 son del profesor de la UPN
                   * U-212. Misma línea que `fn_exigir_lugar_en_taller`.
                   */
                  const libres =
                    participante.perfil === "docente" ? t.libresDocentes : t.libresNoDocentes;
                  // El que ya tiene se ofrece aunque esté lleno: su lugar es uno
                  // de los que esa cuenta ya incluye.
                  const lleno = libres <= 0 && t.id !== actual;
                  // Reserva cero es una regla, no un taller lleno: es T10, donde no
                  // hay cinco máquinas de sobra. A quien atiende hay que decirle
                  // cuál de las dos cosas es, porque la respuesta al de enfrente
                  // cambia: «vuelve mañana» o «ese no es para ti».
                  const soloAlumnos =
                    participante.perfil === "docente" &&
                    t.cupoNoDocentes !== null &&
                    t.cupoTotal - t.cupoNoDocentes === 0 &&
                    t.id !== actual;
                  return (
                    <option key={t.id} value={t.id} disabled={lleno}>
                      {t.id} — {t.nombre.slice(0, 60)}
                      {soloAlumnos
                        ? " (solo para alumnos)"
                        : lleno
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
                {noPagaCuota
                  ? "No tiene nada que depositar"
                  : `Su depósito queda en ${moneda(
                      participante.montoEsperadoEvento + costoDelTaller(elegido),
                    )}`}
              </AlertTitle>
              <AlertDescription>
                {noPagaCuota
                  ? elegido
                    ? `Está exento de la cuota, y el taller va con ella: ${elegido.id} tampoco le cuesta. Sigue sin depósito que hacer y sin voucher que entregar.`
                    : "Está exento de la cuota. Sin depósito que hacer y sin voucher que entregar."
                  : elegido
                    ? esDocente
                      ? `Su cuota de maestro ya incluye el taller, así que ${elegido.id} no le suma nada: sigue depositando ${moneda(
                          participante.montoEsperadoEvento,
                        )}. El concepto que escriba a mano sí cambia: tiene que incluir el taller.`
                      : `${moneda(participante.montoEsperadoEvento)} del evento y ${moneda(
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
