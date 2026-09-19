import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Check, Lock, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { estadoDeRuta, type RutaConstruida } from "@/lib/mapa-pantallas";
import { Titulo, Texto, Rotulo } from "@/components/tipografia";
import { AvisoPrototipo, BotonSalir, Protegido } from "@/components/acceso";
import { ENLACE_NAV } from "@/lib/estilos";
import { PASOS_DEL_FLUJO } from "@/lib/flujo-publico";
import { useEstadoEvento } from "@/lib/estado-evento";
import type { Area } from "@/lib/roles";
import { cn } from "@/lib/utils";

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
function BarraPublica({ contenedor }: { contenedor: string }) {
  const { configuracion: evento } = useEstadoEvento();

  return (
    <header className="hidden border-b border-border bg-card md:block print:hidden">
      {/*
       * La barra ocupa todo el ancho, pero lo de dentro se alinea con el
       * contenido de la página, no con la ventana. Con un contenedor propio y
       * más ancho, la marca quedaba a la izquierda de donde empieza el texto y
       * el enlace a la derecha de donde acaba: dos bordes que no coinciden con
       * nada, que es lo que hace que una página se vea armada a ojo.
       */}
      <div className={cn("mx-auto flex w-full items-center gap-4 px-8 py-3", contenedor)}>
        <Link to="/bienvenida" className="flex min-w-0 items-center gap-3">
          {/*
           * El logotipo oficial, y la barra creció para que quepa.
           *
           * Aquí había el icono de la aplicación instalable —el ojo localizador
           * de QR, un cuadro azul— a 28 px. Cambiarlo por el logotipo a ese
           * mismo tamaño no servía: son tres puños alrededor de un globo
           * trazados a línea fina, y a 28 px no se distingue ninguna de las tres
           * formas. Habría sido cambiar un cuadro azul que al menos se veía por
           * un borrón gris.
           *
           * Así que lo que cambia no es solo la imagen: el hueco pasa de 28 px a
           * 36, y a 40 de `lg:` en adelante. Medido en `docs/marca/LEEME.md`.
           *
           * 36 y 40, y no 40 y 48 como estuvo un rato: a esos el logotipo se
           * leía mejor, pero pesaba más que el nombre del encuentro que lleva al
           * lado, y esto es una barra de utilidad, no una cabecera de marca.
           * Aquí el logotipo acompaña; el que tiene que destacar es el nombre.
           *
           * Por debajo de 36 no se baja: a 28 —lo que había— no se distingue
           * ninguna de las tres formas.
           *
           * Sin `rounded-md`: eso redondeaba las esquinas del cuadro azul. El
           * logotipo es trazo sobre transparente, no tiene caja que redondear.
           */}
          <img
            src="/logo-encuentro.png"
            alt=""
            aria-hidden
            width={512}
            height={453}
            className="h-9 w-auto shrink-0 dark:invert lg:h-10"
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

function PiePublico({ contenedor }: { contenedor: string }) {
  const { configuracion: evento } = useEstadoEvento();
  const wa = evento.whatsappSoporte
    ? `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
        "Hola, necesito ayuda con mi pre-registro.",
      )}`
    : null;

  return (
    <footer className="hidden border-t border-border md:block print:hidden">
      <div
        className={cn(
          "mx-auto flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-8 py-5 text-xs text-muted-foreground",
          contenedor,
        )}
      >
        {evento.nombre ? <span className="truncate">{evento.nombre}</span> : null}
        {evento.horarioSoporte ? <span>Soporte: {evento.horarioSoporte}</span> : null}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 font-medium text-foreground hover:underline lg:hidden"
          >
            <MessageCircle className="size-3.5 shrink-0" aria-hidden />
            Escribir a soporte
          </a>
        ) : null}
      </div>
    </footer>
  );
}

/**
 * La columna de contexto que acompaña a la pantalla en escritorio.
 *
 * Esto es lo que faltaba, y no era ancho. Una pantalla de 1366 píxeles con un
 * formulario de 512 centrado no se arregla estirando el formulario —un campo
 * de texto ancho se llena peor— sino dándole con qué convivir. Sin nada al
 * lado, el ojo lee la página entera como un teléfono ampliado, por muy bien
 * dimensionada que esté la tarjeta.
 *
 * Y lo que se pone al lado no es relleno: es lo que la persona pregunta cuando
 * se detiene a media captura —en qué evento me estoy metiendo, cuántos pasos
 * faltan, a quién le escribo si algo falla—. En el teléfono esas tres cosas
 * no caben y se resuelven avanzando; en una pantalla ancha caben, y esconderlas
 * es desperdiciar la única ventaja que tiene.
 *
 * `hidden lg:block`: por debajo de 1024 no existe. El teléfono no cambia.
 */
function RielPublico() {
  const ruta = useRouterState({ select: (e) => e.location.pathname });
  const { configuracion: evento } = useEstadoEvento();
  const enPortal = ruta.startsWith("/portal");
  const actual = PASOS_DEL_FLUJO.findIndex((p) => p.rutas.includes(ruta));
  const wa = evento.whatsappSoporte
    ? `https://wa.me/${evento.whatsappSoporte}?text=${encodeURIComponent(
        "Hola, necesito ayuda con mi pre-registro.",
      )}`
    : null;

  return (
    <aside className="hidden lg:block lg:sticky lg:top-14 lg:self-start print:hidden">
      <Rotulo className="text-primary">{enPortal ? "Tu portal" : "Pre-registro"}</Rotulo>
      {evento.nombre ? (
        <p className="mt-2 text-balance text-lg font-bold leading-snug tracking-tight">
          {evento.nombre}
        </p>
      ) : null}
      {evento.fechas ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {evento.fechas}
        </p>
      ) : null}

      {/*
       * Los pasos solo aparecen dentro del flujo. En el portal —que se visita
       * después, y en desorden— una barra de progreso mentiría: ahí ya no se
       * avanza en línea recta.
       */}
      {actual >= 0 ? (
        <ol className="mt-8 grid gap-3" aria-label="Pasos del pre-registro">
          {PASOS_DEL_FLUJO.map((paso, i) => {
            const hecho = i < actual;
            const esActual = i === actual;
            return (
              <li key={paso.titulo} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    hecho && "bg-estado-pagado text-white",
                    esActual && "bg-primary text-primary-foreground",
                    !hecho && !esActual && "border border-border text-muted-foreground",
                  )}
                >
                  {hecho ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    esActual ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {paso.titulo}
                </span>
                {esActual ? <span className="sr-only">(paso actual)</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {wa ? (
        <div className="mt-8 border-t border-border pt-5">
          <p className="text-sm font-semibold">¿Algo no cuadra?</p>
          {evento.horarioSoporte ? (
            <p className="mt-1 text-xs text-muted-foreground">{evento.horarioSoporte}</p>
          ) : null}
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            Escribir a soporte
          </a>
        </div>
      ) : null}
    </aside>
  );
}

export function PantallaPublica({
  titulo,
  descripcion,
  children,
  ancho = "md",
  variante = "flujo",
}: {
  titulo?: string;
  descripcion?: string;
  children: ReactNode;
  ancho?: "md" | "lg" | "xl";
  /**
   * `flujo` es un paso del pre-registro: lleva riel y se ancla arriba, porque
   * lo que importa es empezar a leer en cuanto carga.
   *
   * `portada` es la entrada. No lleva riel —sería decir dos veces el nombre
   * del encuentro— y se centra a lo alto: una portada anclada arriba deja
   * medio metro de nada debajo, que es exactamente lo que no debe hacer la
   * primera pantalla que alguien ve.
   */
  variante?: "flujo" | "portada";
}) {
  const riel = variante === "flujo";
  /*
   * El contenedor lo comparten la barra, el contenido y el pie, para que los
   * tres empiecen y acaben en la misma vertical.
   */
  const contenedor = cn(
    ancho === "md" && (riel ? "max-w-xl lg:max-w-4xl" : "max-w-xl"),
    ancho === "lg" && (riel ? "max-w-3xl lg:max-w-[68rem]" : "max-w-3xl lg:max-w-4xl"),
    ancho === "xl" && (riel ? "max-w-3xl lg:max-w-[78rem]" : "max-w-3xl lg:max-w-5xl"),
  );

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
      <BarraPublica contenedor={contenedor} />
      {/*
       * El ancho del CONTENIDO no cambia; lo que crece es la composición.
       *
       * `md` son los formularios, y ahí lo ancho es PEOR: un campo de texto de
       * mil píxeles rompe la relación entre la etiqueta y su control, y estira la
       * línea de lectura más allá de donde el ojo sigue el renglón. El
       * formulario se queda en 576, igual que en el teléfono. Lo que se añade a
       * partir de 1024 es el riel de al lado, y los topes de abajo son la suma:
       * 16rem de riel + 3.5rem de hueco + el contenido de siempre.
       *
       * `max-lg:alto:my-auto` y no `alto:my-auto` a secas: el centrado vertical
       * es correcto en un teléfono, donde el formulario es toda la pantalla,
       * y es lo que hacía flotar la tarjeta en medio de la nada en una
       * computadora. De 1024 en adelante el contenido se ancla arriba y es
       * `lg:grow` —no el margen— lo que manda el pie hasta abajo.
       */}
      <div
        className={cn(
          "mx-auto w-full px-4 py-8 max-lg:alto:my-auto sm:py-12 md:px-8 md:py-10 lg:py-14",
          // Anclado arriba en el flujo; centrado en la portada. `grow` es lo
          // que manda el pie hasta abajo cuando no hay margen que lo empuje.
          riel ? "lg:grow" : "lg:my-auto",
          contenedor,
          riel && "lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-14",
        )}
      >
        {riel ? <RielPublico /> : null}
        <main className="min-w-0">
          {titulo ? (
            <header className="mb-6">
              <Titulo className="lg:text-3xl">{titulo}</Titulo>
              {descripcion ? <Texto className="mt-2">{descripcion}</Texto> : null}
            </header>
          ) : null}
          {children}
        </main>
      </div>
      <PiePublico contenedor={contenedor} />
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
