import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Escala tipográfica del sistema.
 *
 * El problema que resuelve este archivo no era que la tipografía fuera grande,
 * sino que no había escala: convivían nueve tamaños de texto y ocho espaciados
 * verticales elegidos a mano pantalla por pantalla. Cuando cada vista decide su
 * propio tamaño, todo compite y nada jerarquiza; eso es lo que se lee como
 * «genérico».
 *
 * Los seis papeles de abajo son los únicos que debe usar una pantalla. Si algo
 * no encaja en uno, el arreglo es discutir el papel, no inventar un `text-*`
 * suelto.
 *
 * | Papel        | Tamaño         | Para qué                                  |
 * | ------------ | -------------- | ----------------------------------------- |
 * | `Rotulo`     | 11px           | Antetítulo de sección, en versalitas      |
 * | `Titulo`     | 20 / 24px      | Un solo título por pantalla               |
 * | `Subtitulo`  | 16px           | Encabezado dentro de una tarjeta          |
 * | `Texto`      | 14px           | Cuerpo. Es el tamaño por defecto de la app|
 * | `Ayuda`      | 12px           | Apoyo, notas al pie, metadatos            |
 * | `Cifra`      | 24 / 30px      | Un dato que se lee de un vistazo          |
 *
 * Aparte queda un séptimo caso que NO pasa por aquí: el texto que se lee a un
 * metro de distancia —el resultado del escaneo y el folio de pago—. Ese vive en
 * su pantalla con su propio tamaño porque responde a una distancia física, no a
 * una jerarquía de lectura.
 */

/**
 * @param como Qué etiqueta HTML usar. `p` por defecto; `span` para cuando el
 *   rótulo va dentro de un `<label>`, donde un párrafo no es válido.
 *
 * Existía desde el principio, pero solo lo usaba una pantalla: las demás
 * repetían la cadena de clases a mano, treinta y cuatro veces. La razón era
 * esta: casi siempre hace de etiqueta de un campo, y ahí tiene que ser un
 * `span`. Se le da la opción y deja de haber motivo para copiarlo.
 */
export function Rotulo({
  children,
  className,
  como: Como = "p",
}: {
  children: ReactNode;
  className?: string;
  como?: "p" | "span";
}) {
  return (
    <Como
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </Como>
  );
}

/**
 * Un campo con su etiqueta encima.
 *
 * Es la forma más repetida de toda la aplicación: un `<label>` en rejilla, el
 * rótulo, y debajo el control. Estaba escrita a mano en cada formulario, con su
 * cadena de clases completa cada vez, así que un cambio de estilo obligaba a
 * encontrar las treinta y cuatro.
 *
 * El `<label>` envuelve al control en vez de apuntarlo con `htmlFor`, que es lo
 * que evita tener que inventar un `id` único en cada uso —y que ese id se
 * repita al copiar y pegar, que rompe el clic en la etiqueta sin que se note—.
 *
 * @param ayuda Texto bajo el control: una explicación, o el error si lo hay.
 */
export function Campo({
  etiqueta,
  ayuda,
  children,
  className,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1", className)}>
      <Rotulo como="span">{etiqueta}</Rotulo>
      {children}
      {ayuda}
    </label>
  );
}

export function Titulo({
  children,
  className,
  as: Etiqueta = "h1",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Etiqueta
      className={cn("text-balance text-xl font-bold tracking-tight sm:text-2xl", className)}
    >
      {children}
    </Etiqueta>
  );
}

export function Subtitulo({
  children,
  className,
  as: Etiqueta = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Etiqueta className={cn("text-base font-semibold leading-snug", className)}>
      {children}
    </Etiqueta>
  );
}

/**
 * Párrafo de apoyo. Lleva `max-w-prose` porque una línea de más de unos 70
 * caracteres se lee peor, y las pantallas anchas la estiraban sin límite.
 */
export function Texto({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-prose text-pretty text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function Ayuda({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

export function Cifra({
  children,
  className,
  tamano = "md",
}: {
  children: ReactNode;
  className?: string;
  tamano?: "md" | "lg";
}) {
  return (
    <p
      className={cn(
        "font-extrabold tabular-nums tracking-tight",
        tamano === "md" ? "text-2xl" : "text-3xl",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * Contenedor de una sección. Existe para cortar la repetición de
 * `rounded-lg border border-border bg-card p-…`, que estaba copiada decenas de
 * veces con paddings distintos.
 *
 * Regla: una tarjeta no se anida dentro de otra. Si hace falta agrupar dentro,
 * se usa un separador o un fondo `bg-muted`, no otro borde. Los bordes anidados
 * son la razón principal de que las pantallas se vean apretadas.
 */
export function Tarjeta({
  children,
  className,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "none";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card",
        padding === "md" && "p-5",
        padding === "sm" && "p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Estado vacío: lo que ve alguien cuando una lista no tiene nada que mostrar.
 *
 * Estaba escrito a mano en una docena de pantallas con el mismo marcado y
 * diferencias accidentales —unas ponían `mt-1` entre título y explicación y
 * otras no, unas usaban `rounded-lg` y otras `rounded-md`—. Nada de eso era una
 * decisión; era la copia yéndose de las manos.
 *
 * `icono` es opcional porque dentro de una tarjeta que ya tiene su propio
 * encabezado, un icono grande compite en lugar de orientar.
 */
export function EstadoVacio({
  icono,
  titulo,
  children,
  className,
}: {
  icono?: ReactNode;
  titulo: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-card p-10 text-center",
        className,
      )}
    >
      {icono ? <div className="mb-3 flex justify-center text-muted-foreground">{icono}</div> : null}
      <p className="text-sm font-semibold">{titulo}</p>
      {children ? (
        <p className="mx-auto mt-1 max-w-prose text-pretty text-sm text-muted-foreground">
          {children}
        </p>
      ) : null}
    </div>
  );
}
