import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEstadoEvento } from "@/lib/estado-evento";
import { LARGO, faltanDigitos, soloDigitos } from "@/lib/campos";
import { simularLatencia } from "@/lib/formato";
import { usePrototipo } from "@/lib/prototipo";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/completar-datos")({
  head: () =>
    meta(
      "Tus datos de contacto — XIV Encuentro Internacional de Educación",
      "Captura tu correo y tu celular para terminar el pre-registro al XIV Encuentro Internacional de Educación.",
    ),
  component: DatosDeContacto,
});

type Errores = Partial<Record<"correo" | "celular", string>>;

function DatosDeContacto() {
  const navigate = useNavigate();
  const { borrador, participante, setBorrador } = usePrototipo();
  const { configuracion: evento } = useEstadoEvento();

  const [correo, setCorreo] = useState("");
  const [celular, setCelular] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [cargando, setCargando] = useState(false);
  // Confirmar la dirección atrapa el error de dedo, que es lo común, sin bloquear
  // a nadie ni depender de que un correo llegue.
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const refCorreo = useRef<HTMLInputElement>(null);
  const refCelular = useRef<HTMLInputElement>(null);

  /*
   * Aquí NO se muestran los datos académicos del padrón —programa, nivel,
   * avance, grupo, plantel—.
   *
   * A esta pantalla se llega escribiendo una matrícula, sin ninguna
   * comprobación de que quien la escribe sea su dueño. Mostrar el expediente
   * académico convertía el pre-registro en un buscador público del padrón:
   * tecleando matrículas al azar se obtenía el programa y el plantel de
   * cualquier alumno. El sistema sigue usando esos datos internamente —viajan
   * en el borrador y aparecen en el comprobante y en los paneles con acceso
   * controlado—, pero no se publican en el flujo abierto.
   *
   * El nombre sí se muestra, en la pantalla anterior, porque confirmarlo es el
   * propósito de ese paso; ver `confirmar-nombre`.
   */

  const dominio = evento.dominioInstitucional;

  const continuar = async () => {
    const e: Errores = {};
    const correoLimpio = correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio))
      e.correo = "Ese correo no tiene un formato válido.";
    else if (dominio && !correoLimpio.endsWith(`@${dominio}`))
      e.correo = `Usa tu correo institucional, el que termina en @${dominio}.`;

    if (!celular) e.celular = "Escribe tu celular.";
    else {
      // `faltanDigitos` devuelve undefined cuando está completo, y asignarlo
      // igual dejaría la clave presente: el formulario no volvería a enviarse.
      const falta = faltanDigitos(celular, LARGO.celular, "el celular");
      if (falta) e.celular = falta;
    }

    setErrores(e);
    // Llevar el foco al primer campo que falla: en móvil, con el botón abajo, un
    // error arriba queda fuera de la pantalla y parece que no pasó nada.
    if (e.correo) return refCorreo.current?.focus();
    if (e.celular) return refCelular.current?.focus();

    setPorConfirmar(correoLimpio);
  };

  const confirmar = async () => {
    setCargando(true);
    await simularLatencia();
    setCargando(false);
    setBorrador({ correo: porConfirmar!, celular });
    navigate({ to: "/mi-dia" });
  };

  if (porConfirmar) {
    return (
      <PantallaPublica
        volverA="/confirmar-nombre"
        titulo="¿Es correcto tu correo?"
        descripcion="Es por donde soporte te contacta si algo hace falta. Revísalo bien: una letra de más y no te llega nada."
      >
        <section className="rounded-lg border-2 border-primary/25 bg-card px-5 py-8 text-center">
          <p className="break-all text-lg font-bold">{porConfirmar}</p>
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-12 text-base"
              onClick={() => {
                setPorConfirmar(null);
                refCorreo.current?.focus();
              }}
            >
              Corregirlo
            </Button>
            <Button className="h-12 text-base" disabled={cargando} onClick={() => void confirmar()}>
              {cargando ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  Sí, continuar <ArrowRight className="size-5" />
                </>
              )}
            </Button>
          </div>
        </section>
      </PantallaPublica>
    );
  }

  return (
    <PantallaPublica titulo="Tus datos de contacto" volverA="/confirmar-nombre">
      <form
        className="rounded-lg border border-border bg-card p-5"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void continuar();
        }}
      >
        <h2 className="text-sm font-semibold">Necesitamos tus datos de contacto</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Son las dos vías por las que te avisamos si surge cualquier situación con tu registro.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <Label htmlFor="correo">{dominio ? "Correo institucional" : "Correo personal"}</Label>
            <Input
              ref={refCorreo}
              id="correo"
              type="email"
              autoComplete="email"
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                setErrores((x) => ({ ...x, correo: undefined }));
              }}
              placeholder={dominio ? `nombre.apellido@${dominio}` : "nombre.apellido@correo.com"}
              className="mt-1 h-12 text-base"
              aria-invalid={!!errores.correo}
              aria-describedby="ayuda-correo"
            />
            <p
              id="ayuda-correo"
              className={
                errores.correo
                  ? "mt-1 text-xs font-medium text-destructive"
                  : "mt-1 text-xs text-muted-foreground"
              }
            >
              {errores.correo ?? "Escríbelo con cuidado: una letra de más y no te llega nada."}
            </p>
          </div>

          <div>
            <Label htmlFor="celular">Celular</Label>
            <Input
              ref={refCelular}
              id="celular"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={LARGO.celular}
              value={celular}
              // Igual que la matrícula: la letra no llega a escribirse.
              onChange={(e) => {
                setCelular(soloDigitos(e.target.value, LARGO.celular));
                setErrores((x) => ({ ...x, celular: undefined }));
              }}
              placeholder="8112345678"
              className="mt-1 h-12 text-base"
              aria-invalid={!!errores.celular}
              aria-describedby="ayuda-celular"
            />
            <p
              id="ayuda-celular"
              className={
                errores.celular
                  ? "mt-1 text-xs font-medium text-destructive"
                  : "mt-1 text-xs text-muted-foreground"
              }
            >
              {errores.celular ??
                (celular.length > 0 && celular.length < LARGO.celular
                  ? `${celular.length} de ${LARGO.celular} dígitos`
                  : `${LARGO.celular} dígitos.`)}
            </p>
          </div>
        </div>

        <Button type="submit" className="mt-5 h-12 w-full text-base" disabled={cargando}>
          {cargando ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Guardando tus datos…
            </>
          ) : (
            <>
              Continuar <ArrowRight className="size-5" />
            </>
          )}
        </Button>
      </form>
    </PantallaPublica>
  );
}
