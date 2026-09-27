import { useState } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";

import { PantallaPublica } from "@/components/layouts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { useEstadoEvento } from "@/lib/estado-evento";
import { usePortal } from "@/lib/portal";
import { usePrototipo } from "@/lib/prototipo";

/** Un único mensaje para folio inexistente y credencial que no corresponde. */
const ERROR_ACCESO = "Ese folio y ese dato no coinciden. Revísalos y vuelve a intentar.";

/**
 * Folio + matrícula, comprobados en la base, y la sesión del portal abierta.
 *
 * Vive aquí y no en `/portal` porque lo usan DOS sitios: la entrada al portal y
 * la recuperación del comprobante. Una segunda copia de esta llamada es donde se
 * cuela la diferencia que nadie nota —la que distingue folio inexistente de
 * credencial equivocada y convierte la pantalla en un buscador de folios
 * válidos, o la que se olvida de `toUpperCase`—.
 *
 * `alEntrar` es opcional a propósito: el portal navega a su línea de tiempo, y
 * el comprobante no va a ningún sitio. Se queda donde está y se dibuja solo, en
 * cuanto `PortalProvider` trae los datos.
 */
export function FormularioDeFolio({
  textoBoton,
  alEntrar,
}: {
  textoBoton: string;
  alEntrar?: (folio: string) => void;
}) {
  const { participante, setFolio } = usePrototipo();
  const { abrir } = usePortal();
  const [folio, setFolioInput] = useState("");
  const [verificacion, setVerificacion] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError("");
    if (!folio.trim() || !verificacion.trim()) {
      setError("Captura tu folio y tu matrícula o correo para entrar.");
      return;
    }
    setCargando(true);

    /*
     * La pareja folio-credencial la comprueba la base, no el navegador.
     *
     * Traerse al participante por folio y compararlo aquí obligaría a entregar
     * primero los datos de alguien a quien todavía no se le ha pedido nada: con
     * solo el folio ya se conocería su nombre y su correo. `fn_autenticar_portal`
     * compara dentro de Postgres y solo responde si los dos casan.
     *
     * El mensaje de error es uno solo para los dos casos —folio inexistente y
     * credencial que no corresponde— a propósito: distinguirlos convertiría esto
     * en un buscador de folios válidos.
     */
    const credencial = verificacion.trim();
    const clave = folio.trim().toUpperCase();
    try {
      const { autenticarPortal } = await import("@/lib/datos");
      const id = await autenticarPortal(clave, credencial);
      setCargando(false);
      if (!id) return setError(ERROR_ACCESO);
    } catch {
      setCargando(false);
      return setError("No pudimos comprobar tus datos. Inténtalo de nuevo en un momento.");
    }

    setFolio(clave);
    abrir(clave, credencial);
    alEntrar?.(clave);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void entrar();
      }}
    >
      <div className="grid gap-4">
        <div>
          <Label htmlFor="folio">Folio</Label>
          <Input
            id="folio"
            value={folio}
            onChange={(e) => setFolioInput(e.target.value)}
            {...CAMPO_MAYUSCULAS}
            placeholder={participante?.folio}
            className="mt-1 h-12 md:h-11 text-base uppercase"
          />
        </div>
        <div>
          <Label htmlFor="verif">Matrícula o correo</Label>
          <Input
            id="verif"
            value={verificacion}
            onChange={(e) => setVerificacion(e.target.value)}
            placeholder={participante?.matricula ?? participante?.correo}
            className="mt-1 h-12 md:h-11 text-base"
          />
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="size-4" />
          <AlertTitle>No pudimos entrar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="mt-5 h-12 md:h-11 w-full text-base" disabled={cargando}>
        {cargando ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Consultando…
          </>
        ) : (
          <>
            <LogIn className="size-5" /> {textoBoton}
          </>
        )}
      </Button>
    </form>
  );
}

/**
 * Lo que se enseña en lugar de un documento vacío.
 *
 * -----------------------------------------------------------------------------
 * Qué pasaba sin esto
 * -----------------------------------------------------------------------------
 * `/comprobante` y `/pago` se alimentan del borrador del pre-registro, que vive
 * en `sessionStorage` y muere con la pestaña. Y eran las dos únicas pantallas
 * del flujo público sin guardia, así que cuando la pestaña moría las dos
 * dibujaban el documento igual, con el nombre, el folio y el taller en blanco y
 * «Sin taller» donde había un taller elegido.
 *
 * La pestaña muere más de lo que parece: el navegador incrustado de WhatsApp se
 * cierra al deslizar atrás y puede cerrarse al salir a guardar la captura,
 * «abrir en el navegador» estrena pestaña, el teléfono descarta la que tiene en
 * segundo plano, y con el almacenamiento bloqueado el borrador nunca sale de la
 * memoria y cualquier recarga lo vacía.
 *
 * -----------------------------------------------------------------------------
 * Por qué no sirve `RequiereBorrador`
 * -----------------------------------------------------------------------------
 * Manda a `/bienvenida`, o sea a empezar de nuevo un registro que ya está hecho.
 * Para los pasos de en medio eso es correcto; para el comprobante es perder el
 * folio que se venía a buscar.
 *
 * Aquí se pide lo que la persona sí tiene —su folio y su matrícula— y el
 * documento se rehace desde la base. El folio no se puede adivinar, así que
 * quien tampoco lo tenga necesita una salida, y es la única que este sistema
 * puede sostener: a dónde preguntar.
 */
export function RecuperarPorFolio({
  titulo,
  explicacion,
  textoBoton,
}: {
  titulo: string;
  /**
   * Qué se quedó en la pestaña, escrito por cada pantalla.
   *
   * Es una frase entera y no el nombre del documento porque una plantilla con un
   * hueco obliga a que todo concuerde con ella: «tu comprobante» y «tus
   * instrucciones» no caben en la misma. Dos frases completas se leen mejor que
   * una armada a la fuerza.
   */
  explicacion: string;
  textoBoton: string;
}) {
  const { configuracion: evento } = useEstadoEvento();
  const wa = evento.whatsappSoporte
    ? `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
        "Hola, me registré y no tengo mi folio a la mano.",
      )}`
    : null;

  return (
    <PantallaPublica titulo={titulo} ancho="lg">
      <div className="rounded-lg border border-border bg-card p-5 lg:p-6">
        <p className="text-pretty text-sm">
          Tu registro está hecho y no se perdió nada. {explicacion} Escribe tu folio y tu matrícula
          y lo traemos de vuelta.
        </p>
        <div className="mt-5">
          <FormularioDeFolio textoBoton={textoBoton} />
        </div>
      </div>
      {wa ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          ¿No tienes tu folio a la mano?{" "}
          <a href={wa} className="font-semibold text-primary underline">
            Escríbenos por WhatsApp
          </a>{" "}
          con tu nombre completo y tu matrícula, y te lo buscamos.
        </p>
      ) : null}
    </PantallaPublica>
  );
}
