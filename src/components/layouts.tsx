import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Check, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Titulo, Texto, Rotulo } from "@/components/tipografia";
import { AvisoPrototipo, Protegido } from "@/components/acceso";
import { ArmazonPanel } from "@/components/armazon-panel";
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
  /*
   * -------------------------------------------------------------------------
   * Y por encima de 1024 no pasaba nada más.
   * -------------------------------------------------------------------------
   * Estos topes se detenían todos en `lg:`, que es el ancho de una laptop. De
   * ahí en adelante la página no volvía a cambiar: en un monitor de 1920 la
   * portada seguía midiendo los mismos 1024 y dejaba 448 píxeles de nada a cada
   * lado, como una tarjeta flotando en medio de la pantalla. En uno de 2560,
   * 768 a cada lado. `2xl:` no aparecía ni una vez en todo el proyecto.
   *
   * El panel ya había pasado por esto y lo resolvió subiendo a `max-w-[110rem]`
   * —ver `armazon-panel.tsx`—. Lo público se quedó sin ese arreglo.
   *
   * Lo que NO se toca, y es la mitad de la decisión:
   *
   * - **`md` no crece.** Son los formularios. Su tope es la suma exacta de riel
   *   (16rem) + hueco (3.5rem) + el campo de siempre (36rem), así que cualquier
   *   píxel de más se lo queda la columna del formulario, y un campo de texto
   *   ancho se llena peor: rompe la relación entre la etiqueta y su control. El
   *   ancho que le sobra a la ventana no es un hueco que tapar.
   *
   * - **`lg` tampoco.** Es el portal —estado, evidencias, constancia, código—,
   *   y ahí el contenido es de leer. Estirarlo alarga el renglón más allá de
   *   donde el ojo lo sigue de vuelta sin perderse.
   *
   * Crecen los dos que son COMPOSICIONES y no lecturas: la portada, que reparte
   * título y opciones en dos columnas, y las pantallas de `xl` —comprobante e
   * instrucciones de pago—, que ya se dibujan a dos columnas de por sí.
   */
  const contenedor = cn(
    ancho === "md" && (riel ? "max-w-xl lg:max-w-4xl" : "max-w-xl"),
    ancho === "lg" && (riel ? "max-w-3xl lg:max-w-[68rem]" : "max-w-3xl lg:max-w-4xl"),
    ancho === "xl" &&
      (riel
        ? "max-w-3xl lg:max-w-[78rem] 2xl:max-w-[88rem]"
        : // La portada sube en dos escalones y se detiene en 84rem. Más allá,
          // las dos columnas se alejan tanto que el título y los botones dejan
          // de leerse como una sola composición y pasan a ser dos islas.
          "max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[84rem]"),
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
       *
       * -----------------------------------------------------------------------
       * Y anclarlo arriba dejaba media pantalla vacía debajo.
       * -----------------------------------------------------------------------
       * En un monitor grande, «Escribe tu matrícula» ocupaba el tercio superior
       * y de ahí al pie no había nada: unos 400 píxeles de vacío. El arreglo de
       * entonces cambió un defecto por el otro, porque los dos son el mismo
       * hecho visto al derecho y al revés —el contenido no llena la ventana— y
       * ni pegarlo arriba ni pegarlo al centro lo cambia.
       *
       * Lo que sí cambió desde aquella decisión es que el riel existe. La
       * tarjeta «flotaba en medio de la nada» cuando era lo único que había;
       * ahora a su lado hay una columna con el evento, los cuatro pasos y el
       * enlace a soporte, y ese bloque pesa lo suficiente para sostener el
       * centro de la pantalla en vez de perderse en él.
       *
       * `lg:content-center` y no volver a `my-auto`, que es lo que se retiró:
       * `align-content` reparte el hueco SOBRANTE entre arriba y abajo sin tocar
       * la caja, así que `lg:grow` sigue mandando el pie al fondo y el relleno
       * de `lg:py-14` sigue donde estaba. Cuando el contenido es largo —el pago,
       * el comprobante— no hay sobrante y esto no hace absolutamente nada.
       *
       * El riel además mantiene la altura del bloque casi constante entre un
       * paso y el siguiente, así que centrar no hace saltar el contenido al
       * avanzar por el flujo, que era el otro motivo para anclarlo arriba.
       */}
      <div
        className={cn(
          "mx-auto w-full px-4 py-8 max-lg:alto:my-auto sm:py-12 md:px-8 md:py-10 lg:py-14",
          // Anclado arriba en el flujo; centrado en la portada. `grow` es lo
          // que manda el pie hasta abajo cuando no hay margen que lo empuje.
          riel ? "lg:grow lg:content-center" : "lg:my-auto",
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
  ancho,
  children,
}: {
  titulo: string;
  descripcion?: string;
  /** Zona interna a la que pertenece la pantalla. Decide quién puede entrar
   *  y, desde el rediseño, también qué barra lateral se dibuja: eran dos
   *  atributos diciendo lo mismo y uno de los dos podía olvidarse. */
  area: Area;
  acciones?: ReactNode;
  /** Ver `ArmazonPanel`: `lectura` para formularios, `completo` para datos. */
  ancho?: "completo" | "lectura";
  children: ReactNode;
}) {
  return (
    <Protegido area={area}>
      <AvisoPrototipo />
      <ArmazonPanel
        area={area}
        titulo={titulo}
        descripcion={descripcion}
        acciones={acciones}
        {...(ancho ? { ancho } : {})}
      >
        {children}
      </ArmazonPanel>
    </Protegido>
  );
}
