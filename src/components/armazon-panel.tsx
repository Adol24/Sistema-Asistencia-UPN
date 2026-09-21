import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BotonSalir } from "@/components/acceso";
import { NAVEGACION_PANEL, type GrupoPanel } from "@/lib/navegacion-panel";
import { ETIQUETA_AREA, ETIQUETA_ROL, type Area } from "@/lib/roles";
import { useSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

/*
 * El armazón de las zonas internas: barra lateral fija y contenido al lado.
 *
 * Antes era una hilera de pestañas arriba. Con diez destinos no cabían en
 * 1366 píxeles, así que la barra se partía en dos renglones y el contenido
 * empezaba más abajo en unas pantallas que en otras. Una navegación que cambia
 * de alto según la palabra más larga no es una navegación: es lo que quedó.
 *
 * En vertical el ancho deja de competir. Los diez destinos caben sin abreviar
 * —«Configuración» ya no tiene que llamarse «Config.»—, se agrupan por zona, y
 * el sitio donde se busca está siempre en el mismo píxel, se entre por donde se
 * entre. Lo horizontal, que es lo escaso en una tabla de padrón, se lo queda
 * entero el contenido.
 *
 * Por debajo de 1024 la barra no cabe al lado y se guarda tras un botón, que es
 * lo que hace cualquier panel: el teléfono no es el sitio donde se administra
 * un padrón de cinco mil alumnos, pero tiene que poder abrirse.
 */

/** Los enlaces de una zona, en columna y agrupados. */
function Enlaces({ grupos, alNavegar }: { grupos: GrupoPanel[]; alNavegar?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {grupos.map((grupo, i) => (
        <div key={grupo.titulo || `grupo-${i}`} className={cn(i > 0 && "mt-6")}>
          {grupo.titulo ? (
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {grupo.titulo}
            </p>
          ) : null}
          <ul className="grid gap-0.5">
            {grupo.enlaces.map(({ to, label, icono: Icono }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={alNavegar}
                  /*
                   * `activeOptions.exact` solo en el índice de la zona.
                   *
                   * Sin esto «/admin» se considera activo estando en
                   * «/admin/padron» —es su prefijo— y se encendían dos
                   * renglones a la vez, que es peor que no encender ninguno:
                   * dice que estás en dos sitios.
                   */
                  activeOptions={{ exact: to === "/admin" || to === "/financieros" }}
                  activeProps={{
                    className: "bg-primary text-primary-foreground hover:bg-primary/90",
                    "aria-current": "page",
                  }}
                  inactiveProps={{
                    className: "text-muted-foreground hover:bg-muted hover:text-foreground",
                  }}
                  className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors"
                >
                  <Icono className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** El encabezado de la barra: el logotipo y en qué zona se está. */
function Marca({ area }: { area: Area }) {
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-border px-5">
      <img
        src="/logo-encuentro.png"
        alt=""
        aria-hidden
        width={512}
        height={453}
        className="h-8 w-auto shrink-0 dark:invert"
      />
      <span className="min-w-0 text-sm font-bold leading-tight tracking-tight">
        {ETIQUETA_AREA[area]}
      </span>
    </div>
  );
}

/**
 * El pie de la barra: quién está dentro y por dónde se sale.
 *
 * El nombre no es adorno. Estas pantallas se abren en equipos compartidos de
 * una oficina, y saber con qué cuenta se está escribiendo antes de aplicar dos
 * mil altas es parte de poder aplicarlas.
 */
function Cuenta() {
  const { persona } = useSesion();
  if (!persona) return null;
  return (
    <div className="border-t border-border px-5 py-3">
      <p className="truncate text-sm font-semibold">{persona.nombre}</p>
      <p className="truncate text-xs text-muted-foreground">{ETIQUETA_ROL[persona.rol]}</p>
    </div>
  );
}

export function ArmazonPanel({
  area,
  titulo,
  descripcion,
  acciones,
  ancho = "completo",
  children,
}: {
  area: Area;
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  /**
   * Cuánto ancho se queda el contenido.
   *
   * `completo` es lo que pide una tabla, un tablero o una lista: ahí el ancho
   * es dato que cabe, y recortarlo fue el defecto que este rediseño vino a
   * corregir.
   *
   * `lectura` es lo que pide un formulario. Un campo de texto de mil quinientos
   * píxeles no se llena mejor: se llena peor, porque la etiqueta queda a un
   * palmo de su control y el renglón se alarga más allá de donde el ojo lo
   * sigue de vuelta. Dar ancho a todo por igual es el mismo error que quitarlo
   * a todo por igual.
   */
  ancho?: "completo" | "lectura";
  children: ReactNode;
}) {
  const grupos = NAVEGACION_PANEL[area] ?? [];
  const [abierta, setAbierta] = useState(false);
  /*
   * Plegada enseña solo los iconos y devuelve 12rem al contenido.
   *
   * No se guarda entre pantallas a propósito: es un gesto para mirar una tabla
   * ancha, no una preferencia. Que la barra apareciera plegada al día siguiente
   * —sin recordar haberla plegado— dejaría una columna de iconos sin nombre de
   * la que hay que adivinar cuál es cuál.
   */
  const [plegada, setPlegada] = useState(false);
  const ruta = useRouterState({ select: (e) => e.location.pathname });

  return (
    <div className="flex min-h-svh bg-background">
      {/* La barra fija de escritorio. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 lg:flex print:hidden",
          plegada ? "w-[4.5rem]" : "w-64",
        )}
      >
        {plegada ? (
          <div className="flex min-h-16 items-center justify-center border-b border-border">
            <img
              src="/logo-encuentro.png"
              alt={ETIQUETA_AREA[area]}
              width={512}
              height={453}
              className="h-8 w-auto dark:invert"
            />
          </div>
        ) : (
          <Marca area={area} />
        )}

        {plegada ? (
          <nav className="flex-1 overflow-y-auto px-2 py-4">
            <ul className="grid gap-1">
              {grupos
                .flatMap((g) => g.enlaces)
                .map(({ to, label, icono: Icono }) => {
                  const activo =
                    to === "/admin" || to === "/financieros" ? ruta === to : ruta.startsWith(to);
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        title={label}
                        aria-label={label}
                        {...(activo ? { "aria-current": "page" as const } : {})}
                        className={cn(
                          "flex h-10 items-center justify-center rounded-md transition-colors",
                          activo
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icono className="size-4" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </nav>
        ) : (
          <Enlaces grupos={grupos} />
        )}

        {plegada ? null : <Cuenta />}
        <div
          className={cn(
            "flex items-center gap-1 border-t border-border p-2",
            plegada && "flex-col",
          )}
        >
          <button
            type="button"
            onClick={() => setPlegada((v) => !v)}
            title={plegada ? "Desplegar la barra" : "Plegar la barra"}
            aria-label={plegada ? "Desplegar la barra" : "Plegar la barra"}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {plegada ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
          <BotonSalir className={plegada ? "!px-0 size-10 justify-center" : ""} />
        </div>
      </aside>

      {/* La misma barra, guardada, para teléfono y tableta. */}
      <Sheet open={abierta} onOpenChange={setAbierta}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navegación de {ETIQUETA_AREA[area]}</SheetTitle>
          <div className="flex h-full flex-col">
            <Marca area={area} />
            <Enlaces grupos={grupos} alNavegar={() => setAbierta(false)} />
            <Cuenta />
            <div className="border-t border-border p-2">
              <BotonSalir />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* La cabecera con el botón de la barra solo existe donde la barra no cabe. */}
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setAbierta(true)}
            aria-label="Abrir la navegación"
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-bold tracking-tight">{ETIQUETA_AREA[area]}</span>
        </header>

        {/*
          El contenido se queda con el ancho que hay.
          Estaba en `max-w-6xl` centrado: en un monitor de 1600 sobraban más de
          400 píxeles repartidos a los lados mientras la tabla del padrón, con
          diez columnas, se desplazaba en horizontal dentro de su caja. El tope
          se mantiene, pero en 110rem, que es donde una línea de texto sí se
          vuelve incómoda de seguir; hasta ahí manda el contenido.
        */}
        <main
          className={cn(
            "mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
            ancho === "completo" ? "max-w-[110rem]" : "max-w-5xl",
          )}
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight lg:text-[1.75rem]">{titulo}</h1>
              {descripcion ? (
                <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{descripcion}</p>
              ) : null}
            </div>
            {acciones ? <div className="flex flex-wrap gap-2">{acciones}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
