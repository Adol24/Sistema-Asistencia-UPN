import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { estadoDeRuta, type RutaConstruida } from "@/lib/mapa-pantallas";
import { Titulo, Texto } from "@/components/tipografia";
import { AvisoPrototipo, BotonSalir, Protegido } from "@/components/acceso";
import { ENLACE_NAV } from "@/lib/estilos";
import { useEstadoEvento } from "@/lib/estado-evento";
import type { Area } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Enlace de regreso al paso anterior.
 *
 * No se dibuja en teléfonos. Ahí el sistema ya tiene su propio gesto o botón de
 * retroceso, y repetirlo en pantalla gasta la altura que más escasea sin añadir
 * nada. En escritorio se conserva: el botón del navegador está más lejos del
 * ojo y de la mano, y aquí sobra el espacio.
 *
 * De `md:` en adelante cambia de forma, y esa es la mitad del arreglo de
 * escritorio. Con la página sin encabezado, este enlace era lo único que había
 * arriba de la columna: una pastilla gris flotando sobre el vacío, que se leía
 * como un botón de aplicación de teléfono. Bajo una barra de verdad ya no
 * necesita fondo propio ni área táctil de 44 píxeles —eso es para el pulgar—,
 * así que se queda en lo que es: la miga que dice de dónde vienes.
 */
function EnlaceVolver({ a }: { a: string }) {
  return (
    <Link
      to={a}
      className="-ml-3 mb-2 hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted sm:inline-flex md:mb-5 md:ml-0 md:min-h-0 md:px-0 md:hover:bg-transparent md:hover:text-foreground print:hidden"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Volver
    </Link>
  );
}

/*
 * El marco de escritorio del flujo público: la barra de arriba y el pie.
 *
 * Las dos piezas son `hidden md:…` a propósito, y no por pereza. El flujo
 * público se diseñó para el teléfono y ahí está bien: el 90 % de quien se
 * pre-registra lo hace desde uno, en la fila o en el camión, y cada franja que
 * se le añada arriba y abajo le quita altura al formulario. Lo que faltaba era
 * lo de al lado: a partir de 768 píxeles la misma columna se quedaba sola en
 * medio de la pantalla, sin marca, sin contexto y sin salida, porque **no
 * existía ningún armazón de escritorio, ni empezado** —en las quince pantallas
 * públicas no había una sola clase `md:`, `lg:` ni `xl:`—. Se veía como un
 * teléfono porque literalmente era la vista de teléfono, centrada.
 *
 * Dibujarlo solo de `md:` en adelante deja el teléfono exactamente como estaba
 * —ni un píxel de diferencia— y le da a la computadora lo que sí espera.
 */
function BarraPublica() {
  const { configuracion: evento } = useEstadoEvento();

  return (
    <header className="hidden border-b border-border bg-card md:block print:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-8 py-3">
        <Link to="/bienvenida" className="flex min-w-0 items-center gap-2.5">
          <img
            src="/icons/icono-192.png"
            alt=""
            aria-hidden
            className="size-7 shrink-0 rounded-md"
          />
          {/*
           * Sin base configurada el nombre llega vacío. Se rotula el paso en que
           * está la persona en vez de dejar la barra muda: una marca en blanco se
           * ve como un fallo de carga.
           */}
          <span className="truncate text-sm font-bold tracking-tight">
            {evento.nombre || "Pre-registro"}
          </span>
        </Link>
        <Link
          to="/portal"
          {...ENLACE_NAV}
          className="ml-auto flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors"
        >
          Consultar mi estado
        </Link>
      </div>
    </header>
  );
}

function PiePublico() {
  const { configuracion: evento } = useEstadoEvento();
  const wa = evento.whatsappSoporte
    ? `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
        "Hola, necesito ayuda con mi pre-registro.",
      )}`
    : null;

  return (
    <footer className="hidden border-t border-border md:block print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-8 py-5 text-xs text-muted-foreground">
        {evento.nombre ? <span className="truncate">{evento.nombre}</span> : null}
        {evento.horarioSoporte ? <span>Soporte: {evento.horarioSoporte}</span> : null}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
          >
            <MessageCircle className="size-3.5 shrink-0" aria-hidden />
            Escribir a soporte
          </a>
        ) : null}
      </div>
    </footer>
  );
}

export function PantallaPublica({
  titulo,
  descripcion,
  volverA,
  children,
  ancho = "md",
}: {
  titulo?: string;
  descripcion?: string;
  volverA?: string;
  children: ReactNode;
  ancho?: "md" | "lg" | "xl";
}) {
  return (
    /*
     * Dos decisiones sobre la altura, y la segunda arregla un fallo que se veía
     * como dos.
     *
     * `my-auto` centra la columna cuando el contenido es corto. Sin esto, un
     * formulario de tres campos quedaba pegado al borde superior con medio metro
     * de vacío debajo. Con contenido largo el margen se agota y la página vuelve
     * a desplazarse con normalidad, cosa que `justify-center` no haría: recorta
     * el inicio.
     *
     * `min-h-svh` y no `min-h-screen`. En un teléfono, `100vh` mide la pantalla
     * CON LA BARRA DEL NAVEGADOR OCULTA, así que el contenedor siempre era más
     * alto que lo visible: aparecía scroll en pantallas que cabían de sobra, y
     * el centrado quedaba desplazado hacia abajo porque se calculaba sobre esa
     * altura mayor. `svh` es la ventana más pequeña —la que tiene la barra a la
     * vista— y no cambia al desplazarse, así que tampoco da los saltos de `dvh`.
     *
     * La zona segura va aquí y no en `main`: en el contenedor se suma al
     * relleno, mientras que dentro competiría con `py-*` —y `sm:py-12` se genera
     * después en la hoja, así que ganaba y la franja se perdía al rotar.
     */
    /*
     * `pb-[var(--teclado,0px)]` devuelve recorrido a la página cuando el teclado
     * está abierto, que es lo que permite al navegador acercar el campo
     * enfocado. Sin él, un formulario que cabe justo en la pantalla no tiene
     * nada que desplazar y su botón se queda debajo del teclado.
     */
    <div className="flex min-h-svh flex-col bg-background pb-seguro [padding-bottom:calc(env(safe-area-inset-bottom)+var(--teclado,0px))]">
      <BarraPublica />
      {/*
       * El ancho crece por papel, no por tamaño de pantalla.
       *
       * `md` son los formularios, y ahí lo ancho es PEOR: un campo de texto de
       * mil píxeles rompe la relación entre la etiqueta y su control, y estira la
       * línea de lectura más allá de donde el ojo sigue el renglón. Se queda en
       * 576, igual que en el teléfono. Lo que cambia es lo de alrededor.
       *
       * `lg` son las pantallas que sí tienen contenido en paralelo —la rejilla
       * de talleres, el portal—, y esas sí ganan: a partir de 1024 suben a 896
       * para que quepa una columna más sin apretar.
       *
       * `xl` es para las dos que llevan barra lateral —el pago y el
       * comprobante—. Con 896 y una columna de 22rem al lado, al texto le
       * quedaban 520 píxeles y las instrucciones volvían a leerse apretadas;
       * con 1024 le quedan 648, que es la medida de un párrafo cómodo.
       */}
      <main
        className={cn(
          "mx-auto w-full px-4 py-8 alto:my-auto sm:py-12 md:px-8 md:py-10",
          ancho === "md" && "max-w-xl",
          ancho === "lg" && "max-w-3xl lg:max-w-4xl",
          ancho === "xl" && "max-w-3xl lg:max-w-5xl",
        )}
      >
        {volverA ? <EnlaceVolver a={volverA} /> : null}
        {titulo ? (
          <header className="mb-6">
            <Titulo>{titulo}</Titulo>
            {descripcion ? <Texto className="mt-2">{descripcion}</Texto> : null}
          </header>
        ) : null}
        {children}
      </main>
      <PiePublico />
    </div>
  );
}

export function PantallaPanel({
  titulo,
  descripcion,
  area,
  acciones,
  nav,
  children,
}: {
  titulo: string;
  descripcion?: string;
  /** Zona interna a la que pertenece la pantalla. Decide quién puede entrar. */
  area: Area;
  acciones?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Protegido area={area}>
      <div className="min-h-svh bg-background">
        <AvisoPrototipo />
        {nav ? (
          <div className="border-b border-border bg-card print:hidden">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
              {nav}
              <BotonSalir className="ml-auto" />
            </div>
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div>
              <Titulo>{titulo}</Titulo>
              {descripcion ? <Texto className="mt-2">{descripcion}</Texto> : null}
            </div>
            {acciones}
          </div>
          {children}
        </main>
      </div>
    </Protegido>
  );
}

/**
 * Barra de navegación de un panel. Las entradas cuya pantalla todavía no se
 * construye se dibujan atenuadas y sin comportamiento de clic, en lugar de
 * enlazar a una ruta inexistente. El estado se consulta en `mapa-pantallas`.
 */
export function NavPanel({ items }: { items: { to: RutaConstruida; label: string }[] }) {
  return (
    <>
      {items.map((i) =>
        estadoDeRuta(i.to) === "listo" ? (
          <Link
            key={i.to}
            to={i.to}
            {...ENLACE_NAV}
            className="flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors"
          >
            {i.label}
          </Link>
        ) : (
          <span
            key={i.to}
            aria-disabled="true"
            title="Esta pantalla aún no se construye"
            className="flex h-10 cursor-not-allowed items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground opacity-50"
          >
            <Lock className="size-3.5 shrink-0" aria-hidden />
            {i.label}
          </span>
        ),
      )}
    </>
  );
}
