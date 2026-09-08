import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { estadoDeRuta, type RutaConstruida } from "@/lib/mapa-pantallas";
import { Titulo, Texto } from "@/components/tipografia";
import { AvisoPrototipo, BotonSalir, Protegido } from "@/components/acceso";
import type { Area } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Enlace de regreso al paso anterior.
 *
 * No se dibuja en teléfonos. Ahí el sistema ya tiene su propio gesto o botón de
 * retroceso, y repetirlo en pantalla gasta la altura que más escasea sin añadir
 * nada. En escritorio se conserva: el botón del navegador está más lejos del
 * ojo y de la mano, y aquí sobra el espacio.
 */
function EnlaceVolver({ a }: { a: string }) {
  return (
    <Link
      to={a}
      className="-ml-3 mb-2 hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted sm:inline-flex print:hidden"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Volver
    </Link>
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
  ancho?: "md" | "lg";
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
    <div className="flex min-h-svh flex-col bg-background pb-seguro">
      <main
        className={cn(
          "mx-auto my-auto w-full px-4 py-8 sm:py-12",
          ancho === "md" ? "max-w-xl" : "max-w-3xl",
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
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            className="flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
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
