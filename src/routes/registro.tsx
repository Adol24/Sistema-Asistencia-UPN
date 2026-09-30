import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Loader2, ShieldAlert } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { AvisoDePrivacidad } from "@/components/aviso-privacidad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CAMPO_MAYUSCULAS, LARGO, faltanDigitos, soloDigitos } from "@/lib/campos";
import { moneda, simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { useEstadoEvento } from "@/lib/estado-evento";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { meta } from "@/lib/seo";
import { opcion } from "@/lib/estilos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registro")({
  head: () =>
    meta(
      "Registro de docente o externo — XIV Encuentro Internacional de Educación",
      "Llena tus datos como docente o participante externo para pre-registrarte al XIV Encuentro Internacional de Educación.",
    ),
  component: RegistroExterno,
});

/**
 * La institución de un docente no se teclea: **es** la UPN U-212.
 *
 * Desde el 2026-09-29 el perfil `docente` significa «profesor de la UPN U-212» —es
 * quien entra gratis y quien tiene los 5 lugares reservados en cada aula—, así que
 * un docente que escribiera otra universidad sería una contradicción que nadie
 * comprueba nunca. Quien da clase en otra institución es `externo`.
 *
 * `UPN U-212` y no «UPN 212»: es la grafía que usa el resto del sistema —los doce
 * talleres y las tres sedes— y un valor único hace que el listado de docentes se
 * pueda agrupar de verdad en vez de tener veinte formas de escribir lo mismo.
 */
const INSTITUCION_DOCENTE = "UPN U-212";

interface Campos {
  nombres: string;
  paterno: string;
  materno: string;
  correo: string;
  celular: string;
  institucion: string;
}

function RegistroExterno() {
  const navigate = useNavigate();
  const { borrador, setBorrador, reset } = usePrototipo();
  const { configuracion: evento } = useEstadoEvento();
  const [perfil, setPerfil] = useState<"docente" | "externo">("docente");
  /*
   * La pregunta que la organización pidió hacerle al maestro el 2026-09-29: el
   * evento y el taller le salen gratis, y la constancia se paga.
   *
   * Arranca en `null` y **no** en `true` ni en `false`, y eso es deliberado. Un
   * valor inicial cualquiera es una respuesta que esa persona no dio: `true` le
   * cobra 500 sin haberle preguntado, y `false` la deja fuera del listado de
   * constancias sin que se entere hasta que las repartan. Nulo obliga a
   * contestar, y `enviar` no deja pasar sin respuesta.
   *
   * Solo aplica al docente. Si cambia a «externo» se limpia: dejar la respuesta
   * puesta haría que volver a «docente» pareciera contestado cuando no lo está.
   */
  const [quiereConstancia, setQuiereConstancia] = useState<boolean | null>(null);
  const [errorConstancia, setErrorConstancia] = useState("");
  const [c, setC] = useState<Campos>({
    nombres: "",
    paterno: "",
    materno: "",
    correo: "",
    celular: "",
    institucion: "",
  });
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({});
  const [cargando, setCargando] = useState(false);
  const dominioAlumnos = evento.dominioInstitucional.trim().toLowerCase();
  const [aceptoAviso, setAceptoAviso] = useState(false);
  const [errorAviso, setErrorAviso] = useState("");
  // Revisar antes de continuar. Sustituye a la verificación por código: atrapa el
  // error de dedo, que es lo común, sin depender de que un correo llegue.
  const [porConfirmar, setPorConfirmar] = useState<{ nombre: string; correo: string } | null>(null);

  /*
   * La ventana de su perfil, preguntada al elegirlo y no al enviar.
   *
   * Es el mismo trato que recibe el alumno en `confirmar-nombre`: enterarse de
   * que su registro abre el 3 de octubre DESPUÉS de teclear nombre, apellidos,
   * correo, celular e institución es la diferencia entre una fecha y un portazo.
   *
   * Esto **no es la puerta**. La puerta es `trg_ventana_preregistro`, que vuelve
   * a comprobarlo justo antes de insertar; esto es el aviso. Por eso un fallo
   * aquí se calla y deja continuar: si la consulta no responde, quien decide es
   * la base, y bloquear el formulario por no haber podido preguntar dejaría
   * fuera a gente que sí puede pasar.
   */
  const [fueraDeVentana, setFueraDeVentana] = useState("");
  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vivo = true;
    void (async () => {
      try {
        const { ventanaDePerfilRemota } = await import("@/lib/datos");
        const motivo = await ventanaDePerfilRemota(perfil);
        if (vivo) setFueraDeVentana(motivo ?? "");
      } catch {
        if (vivo) setFueraDeVentana("");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [perfil]);

  // El celular es el único campo numérico del formulario: filtra los dígitos al
  // escribirlos, en vez de aceptar una letra y reprocharla al enviar.
  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC((prev) => ({
      ...prev,
      [k]: k === "celular" ? soloDigitos(e.target.value, LARGO.celular) : e.target.value,
    }));

  const enviar = async () => {
    const e: Partial<Record<keyof Campos, string>> = {};
    if (!c.nombres.trim()) e.nombres = "Escribe tu nombre o nombres.";
    if (!c.paterno.trim()) e.paterno = "Escribe tu apellido paterno.";
    /*
     * El apellido materno era opcional y no debía serlo.
     *
     * El alumno no elige su nombre: llega del padrón completo. Quien se registra
     * por su cuenta lo escribe, y si aquí falta un apellido el nombre queda
     * incompleto en el listado de elegibles que la universidad usa para elaborar
     * los documentos. Corregirlo después significa un caso de soporte y volver a
     * emitir.
     */
    if (!c.materno.trim()) e.materno = "Escribe tu apellido materno.";
    const correoLimpio = c.correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio))
      e.correo = "Ese correo no tiene un formato válido.";
    /*
     * Un alumno no se inscribe por aquí, y se le dice ANTES de que llene el
     * formulario entero.
     *
     * La regla de verdad vive en `fn_preregistrar_externo` —que además mira si
     * ese correo ya está registrado como alumno, cosa que desde el navegador no
     * se puede ver porque `participantes` está cerrada—. Esto solo adelanta el
     * caso reconocible: si el dominio de alumnos está configurado y el correo es
     * de ahí, se para aquí en vez de al final del recorrido.
     *
     * Con `dominioInstitucional` vacío esta comprobación no hace nada, igual que
     * su gemela en la base.
     */
    else if (dominioAlumnos && correoLimpio.endsWith(`@${dominioAlumnos}`))
      e.correo = "correo-de-alumno";
    if (!c.celular) e.celular = "Escribe tu celular.";
    else {
      const falta = faltanDigitos(c.celular, LARGO.celular, "el celular");
      if (falta) e.celular = falta;
    }
    // Al docente no se le pide: su institución es la unidad, y el campo es de
    // lectura. Exigírsela sería pedirle que llene algo que no puede escribir.
    if (perfil !== "docente" && !c.institucion.trim())
      e.institucion = "Escribe tu institución de procedencia.";
    setErrores(e);
    if (Object.keys(e).length) return;

    /*
     * La constancia va ANTES del aviso porque está más arriba en la pantalla:
     * el orden de las quejas sigue el orden de lectura, y saltárselo manda a esa
     * persona al final del formulario por algo que tiene que corregir al
     * principio.
     */
    if (perfil === "docente" && quiereConstancia === null) {
      setErrorConstancia("Contesta si quieres constancia: de eso depende si pagas.");
      return;
    }
    setErrorConstancia("");

    // Después de los campos: si algo de arriba falla, eso es lo que hay que
    // arreglar primero. El aviso está justo encima del botón, a la vista.
    if (!aceptoAviso) {
      setErrorAviso("Para continuar hay que aceptar el aviso de privacidad.");
      return;
    }
    setErrorAviso("");

    setPorConfirmar({
      // Se convierte aquí, no al teclear: ver `CAMPO_MAYUSCULAS`.
      nombre: [c.nombres, c.paterno, c.materno].map((x) => x.trim().toUpperCase()).join(" "),
      correo: correoLimpio,
    });
  };

  const confirmar = async () => {
    setCargando(true);
    await simularLatencia();
    setCargando(false);
    /*
     * Van los cuatro datos, no solo los dos que se enseñan en la confirmación.
     *
     * El celular y la institución se quedaban aquí: la pantalla de confirmar
     * solo repasa nombre y correo, que es lo que se teclea mal, y el borrador
     * heredaba justo eso. Cuando el alta pasó a existir de verdad para este
     * perfil, los dos campos llegaban vacíos y la base rechazaba el registro
     * por falta de institución.
     */
    /*
     * Mismo caso que en `/alumno`, comparando por correo porque el docente y el
     * externo no tienen matrícula: si el borrador guardado es de otra persona,
     * se vacía antes de mezclar. Ver el comentario de allá.
     */
    if (borrador.correo && borrador.correo !== porConfirmar!.correo) reset();
    setBorrador({
      perfil,
      ...porConfirmar!,
      celular: c.celular.trim(),
      institucion: perfil === "docente" ? INSTITUCION_DOCENTE : c.institucion.trim(),
      aceptoAviso: true,
      /*
       * El externo no contesta esta pregunta y paga igual que antes, así que
       * viaja `true`: es lo que la base espera de él y lo que `chk_exento_solo_
       * docente` le exige. `quiereConstancia` solo puede ser nulo aquí si el
       * perfil es externo —`enviar` no deja pasar a un docente sin respuesta—.
       */
      quiereConstancia: perfil === "docente" ? quiereConstancia === true : true,
    });
    navigate({ to: "/mi-dia" });
  };

  if (porConfirmar) {
    return (
      <PantallaPublica
        titulo="Confirma tus datos"
        descripcion="Así quedará tu registro. No podrás editarlo después."
      >
        <section className="rounded-lg border-2 border-primary/25 bg-card px-5 py-8">
          <p className="text-balance text-center text-2xl font-extrabold leading-snug tracking-tight">
            {porConfirmar.nombre}
          </p>
          <p className="mt-6 rounded-md bg-muted p-3 text-center text-sm">
            <span className="text-muted-foreground">Correo: </span>
            <span className="break-all font-semibold">{porConfirmar.correo}</span>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            El nombre es con el que quedas registrado, y el correo es por donde soporte te contacta.
            Revísalos bien.
          </p>
          {/*
            Aquí sí va el importe, y solo aquí.

            Es la segunda pantalla: a esta no se llega curioseando, hay que
            haber elegido el perfil de docente y llenado el formulario entero.
            Quien la ve es quien va a pagar, y tiene que saber cuánto ANTES de
            que se guarde nada —«Corregirlos» lo devuelve a cambiar la
            respuesta—. En la primera pantalla la cifra solo servía para que la
            leyera quien no iba a pagarla.

            El importe sale de `cuotaDocente`, la cuota propia del maestro desde
            el 2026-09-30, que NO es `cuotaEvento`.
          */}
          {perfil === "docente" ? (
            <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-center text-sm">
              {quiereConstancia ? (
                <>
                  <span className="font-semibold">
                    Con constancia pagas {moneda(evento.cuotaDocente)} en total
                  </span>
                  , con el taller que elijas incluido. Es el único pago, y lo depositas después.
                </>
              ) : (
                <>
                  <span className="font-semibold">Sin constancia no pagas nada.</span> Entras al
                  Encuentro y al taller, no llevas voucher y no recibes constancia.
                </>
              )}
            </p>
          ) : null}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-12 md:h-11 text-base"
              onClick={() => setPorConfirmar(null)}
            >
              Corregirlos
            </Button>
            <Button
              className="h-12 md:h-11 text-base"
              disabled={cargando}
              onClick={() => void confirmar()}
            >
              {cargando ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Guardando…
                </>
              ) : (
                "Sí, continuar"
              )}
            </Button>
          </div>
        </section>
      </PantallaPublica>
    );
  }

  return (
    <PantallaPublica titulo="Registro de docente o externo">
      <Alert className="mb-4">
        <AlertTriangle className="size-4" />
        <AlertTitle>Escribe tu nombre en MAYÚSCULAS y sin acentos</AlertTitle>
        <AlertDescription>Verifica bien tus datos: así quedará tu registro.</AlertDescription>
      </Alert>

      <form
        className="rounded-lg border border-border bg-card p-5 lg:p-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <p className="text-sm font-semibold">Tipo de participante</p>
        {/*
         * Los botones dejan de ser una palabra, y esto arregla más que el aviso.
         *
         * Decían «Docente» y «Externo», a secas. Desde el 2026-09-29 el perfil
         * decide dinero —el docente entra gratis— y lugares —los 5 reservados de
         * cada aula son suyos—, y con esos rótulos un profesor de otra universidad
         * pulsa «Docente» **de buena fe**: es docente, es cierto. Se lleva un
         * lugar reservado y la exención sin habérselo propuesto.
         *
         * El aviso de abajo disuade a quien quiere colarse; el rótulo evita el
         * error de quien no. Nombrar la unidad es lo que hace que el botón
         * pregunte lo que de verdad se está preguntando.
         */}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                valor: "docente",
                titulo: "Docente de la UPN U-212",
                detalle: "Doy clase en esta unidad.",
              },
              {
                valor: "externo",
                titulo: "Externo",
                detalle: "Cualquier otra institución, o público en general.",
              },
            ] as const
          ).map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={perfil === o.valor}
              onClick={() => {
                setPerfil(o.valor);
                setQuiereConstancia(null);
                setErrorConstancia("");
              }}
              className={cn("min-h-12 rounded-md border p-3 text-left", opcion(perfil === o.valor))}
            >
              <span className="block text-sm font-semibold">{o.titulo}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs leading-snug",
                  perfil === o.valor ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {o.detalle}
              </span>
            </button>
          ))}
        </div>

        {/*
         * Va justo debajo del selector de perfil porque es lo que acaba de
         * cambiar: la ventana depende de ese botón, y el aviso tiene que
         * aparecer donde estaba mirando quien lo pulsó. Debajo del formulario
         * —o arriba del todo, con el otro aviso— se leería como una advertencia
         * general y no como la respuesta a «soy docente».
         */}
        {fueraDeVentana ? (
          <Alert className="mt-4 border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg">
            <CalendarClock className="size-4" />
            <AlertTitle>Todavía no es tu turno</AlertTitle>
            <AlertDescription>
              {fueraDeVentana} Mientras tanto no se puede completar este registro.
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
         * Lo que se le dice al docente, y es lo único que sostiene los 5 lugares.
         *
         * No hay forma técnica de comprobar quién da clase en la UPN: el dominio
         * institucional está vacío en producción y la única barrera real es que el
         * correo no sea de un alumno ya registrado, que un Gmail cualquiera
         * esquiva. Así que la organización decidió el 2026-09-29 comprarlo con
         * aviso y con consecuencia.
         *
         * **La consecuencia va escrita, no insinuada.** Una advertencia que no
         * dice qué pasa no disuade a nadie, y es además lo que hace defendible
         * retirarle el lugar tres semanas después: se le dijo.
         *
         * Va aquí y no al final del formulario porque es lo que acaba de elegir.
         * Y debajo del aviso de ventana porque ese bloquea el registro entero: lo
         * primero que hay que leer es si hoy es su turno.
         */}
        {perfil === "docente" ? (
          <Alert className="mt-4 border-2 border-estado-discrepancia/40 bg-estado-discrepancia-bg">
            <ShieldAlert className="size-4" />
            <AlertTitle>Vamos a validar que seas docente de la UPN U-212</AlertTitle>
            <AlertDescription>
              Lo comprobamos con la universidad antes del evento. Si no eres docente de esta unidad,
              tu registro se cancela y pierdes tu lugar. Si das clase en otra institución, entra
              como <span className="font-semibold">Externo</span>.
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
         * La pregunta de la constancia, solo para el docente.
         *
         * Va aquí y no al final del formulario porque es lo único de esta
         * pantalla que decide cuánto paga esa persona: leerla después de teclear
         * seis campos convierte «¿quieres constancia?» en un trámite más, y no en
         * la decisión que es.
         *
         * Las dos opciones dicen la consecuencia, no solo «sí» y «no». Un
         * maestro que elige «no» y luego descubre que no hay constancia para él
         * es un caso de soporte que llega el día que se reparten, cuando ya no
         * se puede hacer nada. Aquí sí se puede.
         *
         * **Pero el importe ya no se enseña aquí, y es a propósito.** Esta
         * pantalla la comparten el docente y el externo —el selector de perfil
         * está justo arriba—, así que cualquiera que pulse «Docente» por
         * curiosidad leía cuánto paga el maestro y lo comparaba con lo suyo. La
         * cifra no es un secreto, pero enseñársela a quien no le toca solo
         * produce el agravio; a quien sí le toca se la decimos entera en la
         * pantalla de confirmación, que es donde decide de verdad y a la que no
         * se llega mirando.
         */}
        {perfil === "docente" ? (
          <fieldset className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4">
            <legend className="px-1 text-sm font-semibold">¿Quieres constancia?</legend>
            <p className="text-sm text-muted-foreground">
              Para los maestros el Encuentro y el taller son gratis. La constancia sí se paga.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    valor: true,
                    titulo: "Sí, quiero constancia",
                    detalle:
                      "Tiene un costo, con el taller que elijas incluido. Te decimos cuánto antes de guardar tu registro.",
                  },
                  {
                    valor: false,
                    titulo: "No, solo voy a asistir",
                    detalle: "Entras gratis y no tienes que llevar voucher. No recibes constancia.",
                  },
                ] as const
              ).map((o) => (
                <button
                  key={String(o.valor)}
                  type="button"
                  aria-pressed={quiereConstancia === o.valor}
                  onClick={() => {
                    setQuiereConstancia(o.valor);
                    setErrorConstancia("");
                  }}
                  className={cn(
                    "rounded-md border p-3 text-left",
                    opcion(quiereConstancia === o.valor),
                  )}
                >
                  <span className="block text-sm font-semibold">{o.titulo}</span>
                  <span
                    className={cn(
                      "mt-1 block text-xs leading-snug",
                      quiereConstancia === o.valor
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {o.detalle}
                  </span>
                </button>
              ))}
            </div>
            {errorConstancia ? (
              <p className="mt-2 text-sm font-semibold text-estado-discrepancia">
                {errorConstancia}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {/*
         * Seis campos cortos, en dos columnas a partir de 768.
         *
         * Apilados eran seis renglones y el formulario medía más que la
         * ventana: en un monitor de 1920 —que es ancho y BAJO— el aviso de
         * privacidad salía cortado y el botón «Continuar» no llegaba a verse.
         * Había que desplazar para encontrar el final de un formulario de seis
         * campos, con media pantalla vacía a los lados.
         *
         * Son seis exactos, así que en dos columnas salen tres renglones justos,
         * sin huecos: nombres|paterno, materno|correo, celular|institución. El
         * orden no cambia —se lee de izquierda a derecha y hacia abajo, igual
         * que en papel— así que el recorrido con el tabulador sigue siendo el
         * mismo.
         *
         * Lo que NO se hace es ensanchar los campos: a 1280 cada columna mide
         * unos 348 px, menos que los 520 de cuando iban apilados. Un celular de
         * diez dígitos en 520 px era el síntoma de que el ancho sobrante se
         * estaba repartiendo mal.
         */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {(
            [
              ["nombres", "Nombre(s)", "JUAN CARLOS"],
              ["paterno", "Apellido paterno", "PEREZ"],
              ["materno", "Apellido materno", "MUÑOZ"],
              ["correo", "Correo electrónico", "correo@dominio.com"],
              ["celular", "Celular (10 dígitos)", "8112345678"],
              ["institucion", "Institución de procedencia", "UNIVERSIDAD DEL VALLE"],
            ] as [keyof Campos, string, string][]
          ).map(([k, label, ph]) => (
            <div key={k}>
              <Label htmlFor={k}>
                {k === "institucion" && perfil === "docente" ? "Institución" : label}
              </Label>
              {/*
               * El campo se queda —no se quita— y esa es la razón de que siga
               * habiendo seis.
               *
               * La rejilla de dos columnas funciona porque son SEIS exactos: tres
               * renglones justos, sin huecos. Quitarle uno al docente dejaría un
               * hueco, y este dato hay que enseñárselo de todos modos: es lo que
               * va a quedar registrado de él.
               *
               * `readOnly` y no `disabled`: un campo deshabilitado se salta con el
               * tabulador y se pinta como si no existiera, y esto sí existe y sí
               * se lee.
               */}
              <Input
                id={k}
                value={k === "institucion" && perfil === "docente" ? INSTITUCION_DOCENTE : c[k]}
                onChange={set(k)}
                readOnly={k === "institucion" && perfil === "docente"}
                placeholder={ph}
                className={cn(
                  "mt-1 h-12 md:h-11 text-base",
                  k !== "correo" && "uppercase",
                  k === "institucion" &&
                    perfil === "docente" &&
                    "bg-muted text-muted-foreground cursor-default",
                )}
                {...(k === "correo" || k === "celular" ? {} : CAMPO_MAYUSCULAS)}
                aria-invalid={!!errores[k]}
                {...(k === "celular"
                  ? { inputMode: "numeric" as const, autoComplete: "tel", maxLength: LARGO.celular }
                  : {})}
              />
              {/*
               * El caso del correo de alumno no se puede decir con una cadena:
               * necesita el enlace a su propio camino. Rechazar a alguien sin
               * enseñarle por dónde sí es lo que convierte un error en un
               * mensaje a soporte.
               */}
              {errores[k] === "correo-de-alumno" ? (
                <p className="mt-1 text-xs font-medium text-destructive">
                  Ese correo es una cuenta de alumno. Entra por{" "}
                  <Link to="/alumno" className="underline underline-offset-2">
                    «Soy alumno de la universidad»
                  </Link>{" "}
                  con tu matrícula.
                </p>
              ) : errores[k] ? (
                <p className="mt-1 text-xs font-medium text-destructive">{errores[k]}</p>
              ) : k === "celular" && c.celular.length > 0 && c.celular.length < LARGO.celular ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.celular.length} de {LARGO.celular} dígitos
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <AvisoDePrivacidad
          className="mt-5"
          aceptado={aceptoAviso}
          onAceptar={(v) => {
            setAceptoAviso(v);
            if (v) setErrorAviso("");
          }}
          error={errorAviso || undefined}
        />

        {/*
         * Bloquea el envío, pero no es lo que cierra la puerta: quien la cierra
         * es el disparador de la base. Esto le ahorra a la persona llenarlo
         * entero para que se lo rechacen al final.
         */}
        <Button
          type="submit"
          className="mt-5 h-12 md:h-11 w-full text-base"
          disabled={cargando || !!fueraDeVentana}
        >
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Enviando código de verificación…
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </form>
    </PantallaPublica>
  );
}
