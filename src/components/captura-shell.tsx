import { Link } from "@tanstack/react-router";
import { CloudOff, History, QrCode, RefreshCw, Settings2, Users, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { useEstadoEvento } from "@/lib/estado-evento";
import type { Modo } from "@/lib/escaneo";
import { cn } from "@/lib/utils";
import { AvisoPrototipo, BotonSalir, Protegido } from "@/components/acceso";

const RUTAS = [
  { to: "/captura", label: "Sesión", icono: Settings2 },
  { to: "/captura/escaneo", label: "Escaneo", icono: QrCode },
  { to: "/captura/taller", label: "Taller", icono: Users },
  { to: "/captura/historial", label: "Historial", icono: History },
] as const;

/**
 * Indicador de conexión. Va en la barra superior de todas las pantallas de
 * captura porque es la información que decide si el capturista puede seguir o
 * tiene que avisar: un corte de red con 300 personas formadas no puede
 * descubrirse al final del día.
 */
export function BarraConexion() {
  const { enLinea, pendientes, alternarConexion, enVivo } = useEstadoEvento();
  return (
    <div
      className={cn(
        /*
         * `--espacio-seguro` NO es opcional aquí. `pt-seguro` se genera después
         * de `py-2` en la hoja de estilos, así que gana y sustituye su relleno
         * superior en lugar de sumarse. Sin la variable, en cualquier pantalla
         * sin notch —incluido todo el escritorio— `env()` vale 0 y la barra se
         * quedaba sin aire arriba. La variable restituye ese medio rem y la
         * franja del sistema se suma encima cuando existe.
         */
        "flex items-center justify-between gap-2 px-4 py-2 pt-seguro text-sm font-semibold [--espacio-seguro:0.5rem]",
        enLinea ? "bg-estado-pagado text-white" : "bg-estado-discrepancia text-white",
      )}
    >
      <span className="flex items-center gap-2">
        {enLinea ? (
          <Wifi className="size-4" aria-hidden />
        ) : (
          <CloudOff className="size-4" aria-hidden />
        )}
        {enLinea
          ? "EN LÍNEA"
          : `SIN CONEXIÓN — ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`}
        {/*
          En línea y en vivo no son lo mismo, y en la puerta la diferencia
          decide. Con red pero sin escucha, esta pantalla no se entera de que
          Servicios Financieros acaba de cobrarle a quien tiene delante, y lo
          detendría en rojo por un pago que ya existe. Se dice cuando falta.
        */}
        {enLinea && !enVivo ? (
          <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-medium">
            sin escucha en vivo
          </span>
        ) : null}
      </span>
      <button
        onClick={alternarConexion}
        title="Control de desarrollo: alterna la conexión para poder evaluar el modo sin red"
        className="flex h-8 items-center gap-1 rounded-md bg-black/20 px-2 text-xs font-medium hover:bg-black/30"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {enLinea ? "Simular caída" : "Reconectar"}
      </button>
    </div>
  );
}

/** Control de modo, siempre visible: en la puerta el personal se redistribuye. */
export function SelectorModo({ compacto = false }: { compacto?: boolean }) {
  const { sesion, setSesion } = useEstadoEvento();
  // Sin SALIDA: no se captura, la genera el cierre automático del día.
  const modos: { valor: Modo; etiqueta: string }[] = [
    { valor: "entrada", etiqueta: "ENTRADA" },
    { valor: "taller", etiqueta: "TALLER" },
  ];
  return (
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Modo de captura">
      {modos.map((m) => (
        <button
          key={m.valor}
          onClick={() => setSesion({ modo: m.valor })}
          aria-pressed={sesion.modo === m.valor}
          className={cn(
            "rounded-md border font-bold tracking-wide transition-colors",
            compacto ? "min-h-11 text-xs" : "min-h-14 text-sm",
            sesion.modo === m.valor
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          {m.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Marco de las pantallas de captura: pensado para un teléfono en una mano. */
export function PantallaCaptura({
  titulo,
  children,
  sinNav = false,
}: {
  titulo: string;
  children: ReactNode;
  sinNav?: boolean;
}) {
  return (
    /*
     * Marco de teléfono, no de escritorio reducido.
     *
     * Tres decisiones responden a cómo se usa esto: de pie, en la puerta, con el
     * teléfono en una mano.
     *
     * 1. El estado de conexión y el título quedan fijos arriba. Un corte de red
     *    con gente formada no puede descubrirse al hacer scroll.
     * 2. Las pestañas van ABAJO, no arriba: es la mitad de la pantalla que el
     *    pulgar alcanza sin recolocar la mano. Es también la convención de las
     *    apps nativas, así que nadie tiene que aprenderla.
     * 3. Ambas barras respetan la zona segura, para no quedar bajo el notch ni
     *    bajo la barra de gestos.
     */
    <Protegido area="captura">
      <div className="flex min-h-svh flex-col bg-background">
        <div className="sticky top-0 z-30">
          <AvisoPrototipo />
          <BarraConexion />
          <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
            <p className="truncate text-sm font-bold">{titulo}</p>
            <BotonSalir className="ml-auto" />
          </header>
        </div>

        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">{children}</main>

        {!sinNav ? (
          <nav
            aria-label="Secciones de captura"
            className="sticky bottom-0 z-30 mt-auto grid grid-cols-4 gap-1 border-t border-border bg-card px-2 pb-seguro pt-1 [--espacio-seguro:0.25rem]"
          >
            {RUTAS.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                activeProps={{ className: "text-primary" }}
                inactiveProps={{ className: "text-muted-foreground" }}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-semibold leading-none active:bg-muted"
              >
                <r.icono className="size-5 shrink-0" aria-hidden />
                {r.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </Protegido>
  );
}
