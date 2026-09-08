import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { estadoDeRuta, type RutaConstruida } from "@/lib/mapa-pantallas";
import { Titulo, Texto } from "@/components/tipografia";
import { AvisoPrototipo, BotonSalir, Protegido } from "@/components/acceso";
import type { Area } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Enlace de regreso al paso anterior. Vive dentro del contenido, no en una
 * barra fija: el prototipo ya no lleva cabecera propia y el título de cada
 * pantalla lo pone la pantalla misma.
 */
function EnlaceVolver({ a }: { a: string }) {
  return (
    <Link
      to={a}
      className="-ml-3 mb-2 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted print:hidden"
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
     * `my-auto` centra la columna verticalmente cuando el contenido es corto.
     * Sin esto, un formulario de tres campos quedaba pegado al borde superior de
     * una pantalla de escritorio con medio metro de vacío debajo, que es buena
     * parte de por qué el prototipo se veía sin terminar. Con contenido largo el
     * margen automático se agota y la página vuelve a desplazarse con normalidad,
     * cosa que `justify-center` no haría: recortaría el inicio.
     */
    <div className="flex min-h-screen flex-col bg-background">
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
      <div className="min-h-screen bg-background">
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
