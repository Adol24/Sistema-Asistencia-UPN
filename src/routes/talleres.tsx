import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarRange, Clock, Info, Loader2, MapPin, User } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { EstadoVacio } from "@/components/tipografia";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { moneda } from "@/lib/formato";
import { toast } from "sonner";
import { usePrototipo } from "@/lib/prototipo";
import { hayBaseDeDatos } from "@/lib/supabase-config";
import { useEstadoEvento } from "@/lib/estado-evento";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/talleres")({
  head: () =>
    meta(
      "Catálogo de talleres — XIV Encuentro Internacional de Educación",
      "Consulta los 11 talleres del XIV Encuentro Internacional de Educación, su cupo disponible, horario y costo adicional. Puedes elegir máximo uno.",
    ),
  component: CatalogoTalleres,
});

function CatalogoTalleres() {
  const navigate = useNavigate();
  const { borrador, setBorrador } = usePrototipo();
  const { talleres: catalogo, configuracion } = useEstadoEvento();

  /*
   * El catálogo se acota al día de quien está eligiendo.
   *
   * No es cosmético: la tabla `participantes` tiene una llave foránea
   * `(taller_id, dia) -> taller_dias`, así que inscribirse a un taller que no
   * se imparte tu día es imposible en la base. Ofrecerlo igualmente solo
   * consigue que el alta falle al final del recorrido, con la persona ya
   * decidida, y con un mensaje sobre una restricción que no le dice nada.
   *
   * Sin día conocido —el prototipo sin base— se enseñan todos: es preferible a
   * una lista vacía para quien está revisando pantallas.
   */
  const dia = borrador.dia;
  const talleres = catalogo.filter(
    // Un taller inactivo deja de ofrecerse en el catálogo público.
    (t) => t.activo && (!dia || t.dias.includes(dia)),
  );
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

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
              tallerId,
            })
          : await d.preregistrarAlumno({
              matricula: borrador.matricula ?? "",
              correo: borrador.correo ?? "",
              celular: borrador.celular ?? "",
              tallerId,
            });
        setBorrador({ tallerId, folio: alta.folio, dia: alta.dia });
        // Ahora sí existe a quién colgarle la corrección de nombre.
        if (borrador.nombreCorrecto)
          await d.abrirCasoNombreRemoto(alta.id, borrador.nombreCorrecto);
      } else {
        setBorrador({ tallerId });
      }
      navigate({ to: "/pago" });
    } catch (e) {
      // El mensaje de la base es específico —matrícula fuera del padrón, taller
      // sin cupo, correo con dominio equivocado— y ayuda más que uno genérico.
      toast.error((e as Error)?.message || "No pudimos guardar tu pre-registro.");
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <PantallaPublica
      volverA="/mi-dia"
      ancho="lg"
      titulo="Elige un taller (opcional)"
      descripcion={
        dia
          ? `Estos son los talleres del día ${dia}. Puedes elegir máximo uno, con costo adicional que se paga por separado.`
          : "Puedes elegir máximo uno. Como todavía no tienes día asignado, se te dará uno en el que se imparta el taller que elijas."
      }
    >
      {seleccion ? (
        <Alert className="mb-5">
          <Info className="size-4" />
          <AlertTitle>Tu lugar queda apartado hasta el {configuracion.fechaLimite}</AlertTitle>
          <AlertDescription>Si no entregas tu comprobante antes, se libera.</AlertDescription>
        </Alert>
      ) : null}

      {talleres.length === 0 ? (
        <EstadoVacio
          icono={<Info className="size-8" aria-hidden />}
          titulo={
            dia ? `Ningún taller se imparte el día ${dia}` : "Por ahora no hay talleres disponibles"
          }
        >
          Puedes continuar sin taller; tu registro al evento no depende de esto.
        </EstadoVacio>
      ) : null}

      <ul className="grid gap-3">
        {talleres.map((t) => {
          const libres = t.cupoTotal - t.cupoOcupado;
          const lleno = libres <= 0;
          const pocos = libres > 0 && libres < 5;
          const elegido = seleccion === t.id;
          const atenuado = !!seleccion && !elegido;

          return (
            <li key={t.id}>
              <article
                className={cn(
                  "rounded-lg border bg-card p-4 transition-all",
                  lleno && "border-border bg-muted opacity-70",
                  elegido && "border-primary ring-2 ring-primary/25",
                  atenuado && !lleno && "opacity-50",
                  !lleno && !elegido && "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug">{t.nombre}</h2>
                  <span className="rounded-md border border-border px-2 py-1 text-[11px] font-bold tracking-wide">
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-semibold">{moneda(t.costo)}</p>
                    {lleno ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Cupo lleno
                      </p>
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
                    onClick={() => setSeleccion(elegido ? null : t.id)}
                  >
                    {lleno ? "Sin cupo" : elegido ? "Cambiar taller" : "Seleccionar"}
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 mt-6 grid gap-2 border-t border-border bg-background/95 py-4 backdrop-blur sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-12 text-base"
          disabled={registrando}
          onClick={() => void cerrarPreregistro(undefined)}
        >
          Continuar sin taller
        </Button>
        <Button
          className="h-12 text-base"
          disabled={!seleccion || registrando}
          onClick={() => void cerrarPreregistro(seleccion ?? undefined)}
        >
          {registrando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {registrando ? "Guardando…" : "Continuar con el taller elegido"}
        </Button>
      </div>
    </PantallaPublica>
  );
}
