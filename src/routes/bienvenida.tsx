import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, GraduationCap, UserPlus } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { Rotulo, Ayuda } from "@/components/tipografia";
import { useEstadoEvento } from "@/lib/estado-evento";

import { meta } from "@/lib/seo";

export const Route = createFileRoute("/bienvenida")({
  head: () =>
    meta(
      "Bienvenida — XIV Encuentro Internacional de Educación",
      "Inicia tu pre-registro al XIV Encuentro Internacional de Educación. Elige si eres alumno de la universidad o participante externo.",
    ),
  component: Bienvenida,
});

function Bienvenida() {
  const { configuracion: evento } = useEstadoEvento();

  /*
   * La portada no lleva riel: el riel existe para decir en qué evento estás y
   * cuánto falta, y esta pantalla es exactamente eso a tamaño completo. Ponerle
   * uno al lado sería decir dos veces el nombre del encuentro.
   */
  return (
    <PantallaPublica ancho="lg" riel={false}>
      {/*
       * En el teléfono esto es una columna: el evento arriba, las dos opciones
       * debajo. De `md:` en adelante se parte en dos, y el motivo es que son dos
       * cosas distintas —qué es esto, y qué tengo que hacer— que apiladas
       * obligan a recorrer media pantalla vacía entre una y otra. Lado a lado,
       * lo accionable entra en el campo visual junto con el título, que es lo
       * que se espera de una portada en una pantalla ancha.
       *
       * `items-center` y no `items-start`: las dos columnas tienen alturas muy
       * distintas —el título puede ser de un renglón o de tres, según el año— y
       * alinearlas por arriba deja la más corta colgando.
       */}
      <div className="md:grid md:grid-cols-2 md:items-center md:gap-10 lg:gap-16">
        {/*
         * La portada no lleva tarjeta. Encerrar el título del evento en un
         * recuadro lo convertía en un widget más, del mismo peso visual que las
         * dos opciones de abajo; sin recuadro, el título es el fondo de la
         * pantalla y las opciones son lo único accionable. Es la misma
         * información con una jerarquía distinta.
         */}
        <header className="text-center md:text-left">
          <Rotulo className="text-primary">Pre-registro</Rotulo>
          <h1 className="mt-3 text-balance text-2xl font-bold leading-[1.15] tracking-tight sm:text-3xl lg:text-4xl">
            {evento.nombre}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted-foreground md:mx-0">
            {evento.subtitulo}
          </p>
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
            {evento.fechas}
          </p>
        </header>

        <div>
          <nav aria-label="Tipo de participante" className="mt-10 grid gap-3 md:mt-0">
            <OpcionRegistro
              a="/alumno"
              icono={<GraduationCap className="size-6 shrink-0" aria-hidden />}
              titulo="Soy alumno de la universidad"
              detalle="Te identificas con tu matrícula"
              destacada
            />
            <OpcionRegistro
              a="/registro"
              icono={<UserPlus className="size-6 shrink-0 text-primary" aria-hidden />}
              titulo="No soy alumno"
              detalle="Docente o participante externo"
            />
          </nav>

          <Ayuda className="mt-8 text-center md:mt-6 md:text-left">
            ¿Ya te registraste?{" "}
            <Link to="/portal" className="font-semibold text-primary underline underline-offset-2">
              Consulta tu estado en el portal
            </Link>
          </Ayuda>
        </div>
      </div>
    </PantallaPublica>
  );
}

function OpcionRegistro({
  a,
  icono,
  titulo,
  detalle,
  destacada = false,
}: {
  a: "/alumno" | "/registro";
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  destacada?: boolean;
}) {
  return (
    <Link
      to={a}
      className={
        destacada
          ? "group flex min-h-[4.5rem] items-center gap-4 rounded-lg bg-primary px-5 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          : "group flex min-h-[4.5rem] items-center gap-4 rounded-lg border border-border bg-card px-5 text-left shadow-sm transition-colors hover:bg-muted"
      }
    >
      {icono}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug">{titulo}</span>
        <span
          className={
            destacada
              ? "mt-0.5 block text-xs text-primary-foreground/80"
              : "mt-0.5 block text-xs text-muted-foreground"
          }
        >
          {detalle}
        </span>
      </span>
      <ChevronRight
        className={
          destacada
            ? "size-5 shrink-0 text-primary-foreground/60 transition-transform group-hover:translate-x-0.5"
            : "size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        }
        aria-hidden
      />
    </Link>
  );
}
