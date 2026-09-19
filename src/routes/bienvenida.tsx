import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, GraduationCap, UserPlus } from "lucide-react";
import { PantallaPublica } from "@/components/layouts";
import { PASOS_DEL_FLUJO } from "@/lib/flujo-publico";
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

  return (
    <PantallaPublica ancho="xl" variante="portada">
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
      {/*
       * Asimétrica a propósito. Con dos mitades iguales el nombre del encuentro
       * —cuarenta caracteres— se partía en tres renglones en una columna de 420
       * mientras al lado sobraba sitio: dos botones no necesitan tanto. La
       * proporción de abajo le da al título el ancho para caber en dos.
       */}
      <div className="md:grid md:grid-cols-2 md:items-center md:gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        {/*
         * La portada no lleva tarjeta. Encerrar el título del evento en un
         * recuadro lo convertía en un widget más, del mismo peso visual que las
         * dos opciones de abajo; sin recuadro, el título es el fondo de la
         * pantalla y las opciones son lo único accionable. Es la misma
         * información con una jerarquía distinta.
         */}
        <header className="text-center md:text-left">
          {/*
           * El logotipo oficial del Encuentro.
           *
           * `alt=""` y `aria-hidden` porque es decorativo: el nombre del evento
           * va justo debajo, como `h1` y en texto. Describirlo otra vez en el
           * alternativo haría que un lector de pantalla anunciara el encuentro
           * dos veces seguidas.
           *
           * **No baja de 96 px, y es por el dibujo, no por gusto.** Son tres
           * puños alrededor de un globo trazados a línea fina: a 28 px —el
           * hueco que tiene la barra superior— no se distingue ninguna de las
           * tres formas y queda un borrón gris que parece un fallo de carga. A
           * 64 se empieza a leer y a 128 se entiende. Por eso vive en la
           * portada, que es donde hay sitio, y la barra conserva su icono, que
           * sí está dibujado para tamaños pequeños.
           *
           * `width`/`height` con las medidas reales del archivo: sin ellas el
           * navegador no reserva el hueco y la portada entera salta hacia abajo
           * cuando el logotipo termina de cargar.
           *
           * `dark:invert` está de más hoy —nada enciende la clase `dark`— y
           * cuesta una palabra. El trazo es de un solo gris oscuro sobre
           * transparente, así que invertirlo lo deja claro sobre oscuro sin
           * tocar el recorte. El día que se encienda el tema oscuro, el
           * logotipo no desaparece.
           */}
          <img
            src="/logo-encuentro.png"
            alt=""
            aria-hidden
            width={512}
            height={453}
            className="mx-auto mb-6 h-24 w-auto dark:invert md:mx-0 lg:h-32"
          />
          <Rotulo className="text-primary">Pre-registro</Rotulo>
          <h1 className="mt-3 text-balance text-2xl font-bold leading-[1.15] tracking-tight sm:text-3xl lg:text-[2.6rem]">
            {evento.nombre}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted-foreground md:mx-0">
            {evento.subtitulo}
          </p>
          {/*
           * Solo las fechas. El horario también estuvo aquí y se quitó: el campo
           * guarda los dos tramos del día y en un renglón quedaba como «8:00 a
           * 9:00 hrs a 13:00 a 14:00 hrs», que no se entiende; y aun bien
           * escrito, la hora exacta no está cerrada. Prometer una hora en la
           * portada es lo que hace que alguien llegue cuando no debe.
           */}
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
            {evento.fechas}
          </p>
        </header>

        <div>
          <nav aria-label="Tipo de participante" className="mt-10 grid gap-3 md:mt-0 lg:gap-4">
            <OpcionRegistro
              a="/alumno"
              icono={<GraduationCap className="size-6 shrink-0 lg:size-7" aria-hidden />}
              titulo="Soy alumno de la universidad"
              detalle="Te identificas con tu matrícula"
              destacada
            />
            <OpcionRegistro
              a="/registro"
              icono={<UserPlus className="size-6 shrink-0 text-primary lg:size-7" aria-hidden />}
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

      {/*
       * Los cuatro pasos, a lo ancho y debajo de todo.
       *
       * En una laptop la portada terminaba a un tercio de la altura y dejaba el
       * resto en blanco hasta el pie. El hueco no se llena estirando lo que ya
       * había —dos botones de sesenta píxeles no crecen sin volverse pancartas—
       * sino con lo que la pantalla callaba: cuánto es esto. Quien duda antes de
       * empezar duda por el tiempo que le va a costar, y aquí ve que son cuatro
       * pasos antes de tocar nada.
       *
       * `hidden md:block`: en el teléfono la portada ya se lee de un vistazo y
       * esto solo añadiría recorrido.
       */}
      <section className="mt-14 hidden border-t border-border pt-8 md:block">
        <Rotulo>Cómo funciona</Rotulo>
        <ol className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PASOS_DEL_FLUJO.map((paso, i) => (
            <li key={paso.titulo} className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary"
              >
                {i + 1}
              </span>
              <span className="text-sm font-medium leading-snug">{paso.titulo}</span>
            </li>
          ))}
        </ol>
      </section>
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
          ? "group flex min-h-[4.5rem] items-center gap-4 rounded-lg bg-primary px-5 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 lg:min-h-[5.5rem] lg:gap-5 lg:px-6"
          : "group flex min-h-[4.5rem] items-center gap-4 rounded-lg border border-border bg-card px-5 text-left shadow-sm transition-colors hover:bg-muted lg:min-h-[5.5rem] lg:gap-5 lg:px-6"
      }
    >
      {icono}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug lg:text-lg">{titulo}</span>
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
