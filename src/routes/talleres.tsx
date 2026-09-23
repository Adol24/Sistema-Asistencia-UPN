import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarRange, Clock, Info, Loader2, MapPin, User } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { RequiereBorrador } from "@/components/requiere-borrador";
import { EstadoVacio, Rotulo } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fechaLimiteTexto, moneda } from "@/lib/formato";
import { toast } from "sonner";
import { usePrototipo } from "@/lib/prototipo";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { useEstadoEvento } from "@/lib/estado-evento";
import { mensajeDeError } from "@/lib/supabase";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/talleres")({
  head: () =>
    meta(
      "Catálogo de talleres — XIV Encuentro Internacional de Educación",
      "Consulta los 11 talleres del XIV Encuentro Internacional de Educación, su cupo disponible, horario y costo adicional. Puedes elegir máximo uno.",
    ),
  component: CatalogoTalleresProtegido,
});

/*
 * El paso no se dibuja sin haber pasado por los anteriores. Ver
 * `RequiereBorrador`: sin esto la ruta era alcanzable escribiendo la URL, y con
 * el borrador vacío enseñaba un estado que no corresponde a nadie.
 */
function CatalogoTalleresProtegido() {
  return (
    <RequiereBorrador>
      <CatalogoTalleres />
    </RequiereBorrador>
  );
}

function CatalogoTalleres() {
  const navigate = useNavigate();
  const { borrador, setBorrador } = usePrototipo();
  const { talleres: catalogo, configuracion } = useEstadoEvento();

  /*
   * El catálogo entero, para todo el mundo.
   *
   * Antes se acotaba al día de quien elegía, y tenía que ser así: la llave
   * foránea `(taller_id, dia) -> taller_dias` hacía imposible en la base
   * inscribirse a un taller de otro día, así que ofrecerlo solo conseguía que
   * el alta muriera al final del recorrido. El resultado era que a los del día
   * 3 —seiscientas personas— no se les ofrecía NINGUNO, y a los del día 2 se
   * les escondían los seis del día 1.
   *
   * La migración 60 quitó esa llave. Los talleres se imparten en la UPN U-212,
   * que no es la sede del Encuentro: tu día dice a qué sede vas, no a qué
   * taller entras. Quien va el día 3 al Teatro Victoria puede tomar un taller
   * la tarde del día 1 en la UPN.
   *
   * Lo único que se sigue filtrando es `activo`: un taller dado de baja deja de
   * ofrecerse, y conserva a sus inscritos.
   */
  const dia = borrador.dia;
  const talleres = catalogo.filter((t) => t.activo);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  /*
   * «Continuar sin taller» deja de ser inocuo para quien ya está registrado.
   *
   * El alta es reentrante —devuelve su folio de siempre, no duplica—, pero de
   * camino llama a `fn_cambiar_taller` con lo que se elija AHORA. Y con nada
   * elegido eso es `fn_cambiar_taller(id, null)`, que le quita el taller que
   * tuviera y libera su lugar. Quien volvió solo a mirar perdía su inscripción
   * al taller por pulsar el botón que parecía el de salir.
   *
   * No se puede saber desde aquí si tenía uno: la ficha del padrón no trae el
   * taller. Así que en vez de afirmarlo se pide confirmar, y el aviso está
   * redactado en condicional porque esa es la verdad de lo que se sabe.
   *
   * Lo único que lo frena en la base es tener ya un pago del taller.
   */
  const [confirmarSinTaller, setConfirmarSinTaller] = useState(false);
  /*
   * El cerrojo del doble clic, y hace falta uno aparte del estado.
   *
   * `disabled={registrando}` no llega a tiempo: entre la pulsación y el
   * redibujado que apaga los botones hay una ventana, y ahí caben dos clics de
   * quien ve que no pasa nada y vuelve a pulsar. Dos llamadas al alta a la vez
   * es justo la carrera que duplicaba el pre-registro del docente y del
   * externo, donde la base no tenía ningún índice que la detuviera.
   *
   * Un `ref` se actualiza en el acto, en la misma pulsación, así que la segunda
   * se encuentra el cerrojo echado. La base también lo cierra por su lado
   * —`20260917140000`— porque dos pestañas no comparten este ref; esto evita
   * que la carrera se produzca, y aquello que importe si se produce.
   */
  const enviando = useRef(false);

  /*
   * Aquí se cierra el pre-registro: es el último paso donde se conocen los
   * cuatro datos que la base necesita —matrícula, correo, celular y taller—.
   *
   * `fn_preregistrar_alumno` crea al participante y devuelve el folio de
   * verdad. Antes no se creaba nada: el pre-registro vivía en memoria y las
   * pantallas de pago y comprobante enseñaban el folio del participante de
   * contexto, o sea el de otra persona.
   */
  const cerrarPreregistro = async (tallerId: string | undefined) => {
    if (enviando.current) return;
    enviando.current = true;
    setRegistrando(true);
    try {
      if (hayBaseDeDatos) {
        const d = await import("@/lib/datos");
        /*
         * Dos altas distintas, no dos variantes de la misma.
         *
         * La del alumno parte de su matrícula y hereda del padrón el día y lo
         * académico. El docente y el externo no están en ningún padrón: traen
         * el nombre y la institución que declararon, y el día que ELIGIERON.
         *
         * Antes solo existía la primera, así que un docente llegaba hasta aquí
         * y el alta reventaba con «esa matrícula no está en el padrón» —porque
         * mandaba una cadena vacía—. No quedaba registrado.
         */
        const externo = borrador.perfil === "docente" || borrador.perfil === "externo";
        const alta = externo
          ? await d.preregistrarExterno({
              perfil: borrador.perfil as "docente" | "externo",
              nombre: borrador.nombre ?? "",
              correo: borrador.correo ?? "",
              celular: borrador.celular ?? "",
              institucion: borrador.institucion ?? "",
              dia: borrador.dia ?? 1,
              aceptoAviso: borrador.aceptoAviso === true,
              tallerId,
            })
          : await d.preregistrarAlumno({
              matricula: borrador.matricula ?? "",
              correo: borrador.correo ?? "",
              celular: borrador.celular ?? "",
              aceptoAviso: borrador.aceptoAviso === true,
              tallerId,
            });
        setBorrador({ tallerId, folio: alta.folio, dia: alta.dia });
        /*
         * El caso de nombre se abre APARTE, y su fallo no puede detener nada.
         *
         * Esto iba dentro del mismo `try` y antes del `navigate`, así que si la
         * llamada fallaba —el teléfono perdiendo la red justo ahí es el caso
         * típico— el `catch` mostraba «algo salió mal» y NO navegaba. Pero el
         * participante ya existía y ya tenía folio: esa persona cerraba la
         * pestaña creyendo que no había quedado registrada, y con la pestaña se
         * iba el `sessionStorage` y su única forma de volver a ver su folio.
         *
         * Quedaba inscrita y sin saberlo, que es peor que no quedar inscrita.
         *
         * La corrección del nombre es accesoria: se puede reabrir desde soporte,
         * y `fn_abrir_caso_nombre` es idempotente —actualiza el caso abierto en
         * vez de duplicarlo—, así que reintentarla es seguro. El folio no es
         * accesorio.
         */
        if (borrador.nombreCorrecto)
          void d.abrirCasoNombreRemoto(alta.id, borrador.nombreCorrecto).catch((e: unknown) => {
            console.error("No se pudo abrir el caso de corrección de nombre", e);
            toast.warning(
              "Tu registro quedó hecho. La corrección de tu nombre no se pudo enviar: escríbenos a soporte.",
            );
          });
      } else {
        setBorrador({ tallerId });
      }
      navigate({ to: "/pago" });
    } catch (e) {
      // El mensaje de la base es específico —matrícula fuera del padrón, taller
      // sin cupo, correo con dominio equivocado— y ayuda más que uno genérico.
      // `mensajeDeError` traduce además los códigos que no son un texto: la
      // violación de unicidad o el permiso que falta salían tal cual.
      toast.error(mensajeDeError(e));
    } finally {
      // Se suelta el cerrojo para que un fallo se pueda reintentar. En el camino
      // bueno ya se navegó a /pago y este componente se fue, así que solo
      // importa cuando el alta devolvió error.
      enviando.current = false;
      setRegistrando(false);
    }
  };

  /*
   * No hay taller que ofrecerle, y eso no es un fallo.
   *
   * Ya no depende del día de nadie: ahora solo ocurre si la organización tiene
   * todos los talleres dados de baja, o si la base no respondió. Pedir que se
   * elija y no ofrecer nada se lee como un error del sistema, y quien lo lee
   * así se detiene a averiguar qué hizo mal en lugar de seguir.
   */
  const sinTalleres = talleres.length === 0;

  return (
    <PantallaPublica
      ancho="xl"
      titulo={sinTalleres ? "Por ahora no hay talleres" : "Elige un taller (opcional)"}
      descripcion={
        sinTalleres
          ? "Continúa: tu registro al Encuentro no depende de esto."
          : "Puedes elegir máximo uno, de cualquier día, con costo adicional que se paga por separado. Los talleres son en la UPN U-212 por la tarde, así que el día del taller que elijas no tiene que ser el día que te toca en el Encuentro."
      }
    >
      {seleccion ? (
        <Alert className="mb-5">
          <Info className="size-4" />
          <AlertTitle>
            Tu lugar queda apartado hasta el {fechaLimiteTexto(configuracion.fechaLimite)}
          </AlertTitle>
          <AlertDescription>Si no entregas tu comprobante antes, se libera.</AlertDescription>
        </Alert>
      ) : null}

      {sinTalleres ? (
        <EstadoVacio
          icono={<Info className="size-8" aria-hidden />}
          titulo="Por ahora no hay talleres disponibles"
        >
          No tienes que hacer nada al respecto. Pulsa continuar y termina tu registro.
        </EstadoVacio>
      ) : null}

      {/*
       * Dos columnas desde `lg:`, no tres. A 896 píxeles tres columnas dejan
       * tarjetas de 290, y ahí el nombre real de un taller —llegan a 155
       * caracteres— se parte en seis renglones y el pie de precio y botón se
       * amontona. Dos columnas dan 440, que es donde la ficha sigue leyendose de
       * un vistazo.
       */}
      <ul className="grid gap-3 lg:grid-cols-2">
        {talleres.map((t) => {
          const libres = t.cupoTotal - t.cupoOcupado;
          const lleno = libres <= 0;
          const pocos = libres > 0 && libres < 5;
          const elegido = seleccion === t.id;
          const atenuado = !!seleccion && !elegido;
          /*
           * Este taller cae un día que no es el suyo, y hay que decírselo.
           *
           * Es legítimo elegirlo —para eso se quitó el filtro— pero significa
           * venir una tarde de más, a otra sede. Enterarse al llegar al
           * Encuentro sería enterarse tarde, así que la ficha lo dice antes de
           * que pulse. No lo desactiva: es información, no un impedimento.
           */
          const otroDia = !!dia && !t.dias.includes(dia);

          return (
            <li key={t.id}>
              <article
                className={cn(
                  "rounded-lg border bg-card p-4 lg:p-5 transition-all",
                  // En rejilla, dos tarjetas contiguas con descripciones de
                  // distinto largo quedaban de alturas distintas y el borde
                  // inferior se veía escalonado. Estirarlas y empujar el pie
                  // con `mt-auto` alinea precio y botón en toda la fila.
                  "lg:flex lg:h-full lg:flex-col",
                  lleno && "border-border bg-muted opacity-70",
                  elegido && "border-primary ring-2 ring-primary/25",
                  atenuado && !lleno && "opacity-50",
                  !lleno && !elegido && "border-border",
                )}
              >
                {/*
                 * Igual que en /admin/talleres: el título crece y la insignia
                 * no. Los nombres reales llegan a 155 caracteres y sin `flex-1`
                 * + `min-w-0` el título empujaba la insignia al renglón de
                 * abajo, separándola de lo que califica.
                 */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug">
                    {t.nombre}
                  </h2>
                  <span className="shrink-0 whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] font-bold tracking-wide">
                    {t.dias.length === 1 ? "1 DÍA" : "2 DÍAS"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.descripcion}</p>

                <dl className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <User className="size-4" aria-hidden /> {t.ponente}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarRange className="size-4" aria-hidden /> Día {t.dias.join(" y ")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="size-4" aria-hidden /> {t.horario}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden /> {t.lugar}
                  </div>
                </dl>

                {otroDia ? (
                  <p className="mt-3 flex items-start gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      Se imparte el día {t.dias.join(" y ")} y a ti te toca el día {dia} en el
                      Encuentro. Puedes tomarlo: vendrás también esa tarde a {t.lugar}.
                    </span>
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 lg:mt-auto lg:pt-4">
                  <div className="text-sm">
                    <p className="font-semibold">{moneda(t.costo)}</p>
                    {lleno ? (
                      <Rotulo>Cupo lleno</Rotulo>
                    ) : (
                      <p
                        className={cn(
                          "text-xs",
                          pocos
                            ? "font-semibold text-estado-discrepancia"
                            : "text-muted-foreground",
                        )}
                      >
                        {libres} {libres === 1 ? "lugar disponible" : "lugares disponibles"}
                        {pocos ? " — ¡últimos lugares!" : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={elegido ? "secondary" : "default"}
                    disabled={lleno}
                    className="h-11"
                    onClick={() => {
                      setSeleccion(elegido ? null : t.id);
                      setConfirmarSinTaller(false);
                    }}
                  >
                    {lleno ? "Sin cupo" : elegido ? "Cambiar taller" : "Seleccionar"}
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {confirmarSinTaller ? (
        <Alert variant="destructive" className="mt-6">
          <Info className="size-4" />
          <AlertTitle>Si ya tenías un taller, esto lo cancela</AlertTitle>
          <AlertDescription>
            Tu pre-registro al Encuentro no se toca y tu folio es el mismo. Pero seguir sin elegir
            taller deja tu inscripción sin ninguno y libera el lugar que tuvieras apartado. Si solo
            venías a mirar, vuelve al inicio: nada cambia hasta que pulses.
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
       * Sin talleres queda un solo botón, y deja de llamarse «continuar SIN
       * taller»: nombrar una elección que no se ofreció hace dudar de si uno se
       * perdió un paso. Y el segundo botón desaparece en vez de quedarse
       * desactivado para siempre, que es ruido con aspecto de algo que falta.
       */}
      <div
        className={cn(
          "sticky bottom-0 mt-6 grid gap-2 border-t border-border bg-background/95 py-4 backdrop-blur",
          sinTalleres ? "" : "sm:grid-cols-2",
        )}
      >
        <Button
          variant={sinTalleres ? "default" : "outline"}
          className="h-12 md:h-11 text-base"
          disabled={registrando}
          onClick={() => {
            // Un paso de confirmación, y solo para quien tiene algo que perder.
            if (borrador.yaRegistrado && !sinTalleres && !confirmarSinTaller) {
              setConfirmarSinTaller(true);
              return;
            }
            void cerrarPreregistro(undefined);
          }}
        >
          {sinTalleres
            ? "Continuar"
            : confirmarSinTaller
              ? "Sí, quiero quedarme sin taller"
              : "Continuar sin taller"}
        </Button>
        {sinTalleres ? null : (
          <Button
            className="h-12 md:h-11 text-base"
            disabled={!seleccion || registrando}
            onClick={() => void cerrarPreregistro(seleccion ?? undefined)}
          >
            {registrando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {registrando ? "Guardando…" : "Continuar con el taller elegido"}
          </Button>
        )}
      </div>
    </PantallaPublica>
  );
}
