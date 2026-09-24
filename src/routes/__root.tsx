import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { PrototipoProvider } from "../lib/prototipo";
import { EstadoEventoProvider } from "../lib/estado-evento";
import { SesionProvider } from "../lib/sesion";
import { PortalProvider } from "../lib/portal";
import { useAltoTeclado } from "../lib/teclado";
import { useTrabajadorDeServicio } from "../lib/trabajador-de-servicio";
import { useSelloDeVersion } from "../lib/sello-de-version";
import { Toaster } from "../components/ui/sonner";
import { pantallaPendienteDe } from "../lib/mapa-pantallas";

function NotFoundComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pendiente = pantallaPendienteDe(pathname);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        {pendiente ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Esta pantalla aún no se construye
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              «{pendiente.label}» forma parte del prototipo planeado, pero todavía no está
              implementada.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Esa dirección no existe en el prototipo
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No hay ninguna pantalla en{" "}
              <span className="font-mono text-foreground">{pathname}</span>. Revisa que la dirección
              esté bien escrita.
            </p>
          </>
        )}
        <div className="mt-6">
          <Link
            to="/bienvenida"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta pantalla del prototipo no pudo dibujarse
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El error ocurrió al renderizar la vista, no al guardar datos: el prototipo no guarda nada
          y el estado se reinicia al recargar. Puedes reintentar sin perder nada.
        </p>
        <p className="mt-3 rounded-md bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
          {error.message || "Error sin mensaje"}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <a
            href="/bienvenida"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * El origen del sitio: «https://…», sin ruta.
 *
 * Hace falta para las etiquetas que lee WhatsApp —o Telegram, o Slack— al pegar
 * el enlace: la imagen de la tarjeta tiene que ir en URL absoluta, y no hay
 * dominio que escribir aquí a mano. El Worker se publica con el nombre que le
 * derive Cloudflare y mañana puede colgar de un dominio propio; cualquier
 * dirección fija sería una que caduca sin avisar y sin romper nada visible.
 *
 * Se saca de la petición, que es lo único que siempre dice la verdad. En el
 * navegador no hay petición que mirar, así que se usa la barra de direcciones;
 * `createIsomorphicFn` es lo que deja escribir las dos mitades sin que el
 * código del servidor acabe en el paquete del cliente.
 *
 * Si algo falla se devuelve cadena vacía y las URLs quedan relativas. No es lo
 * ideal —hay lectores que no las resuelven— pero es preferible a tumbar la
 * carga de la página por una etiqueta de vista previa.
 */
const origenDelSitio = createIsomorphicFn()
  .server(() => {
    try {
      return new URL(getRequest().url).origin;
    } catch {
      return "";
    }
  })
  .client(() => window.location.origin);

/** La tarjeta que se ve al pegar el enlace. La dibuja `bun run generar-iconos`. */
const TARJETA = "/og-encuentro.png";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      /*
       * `viewport-fit=cover` deja que la página se dibuje bajo el notch y la
       * barra de gestos; sin él, el navegador reserva unas franjas y la
       * interfaz nunca llega al borde. A cambio obliga a respetar las
       * `env(safe-area-inset-*)`, que es lo que hacen las utilidades
       * `pt-seguro` / `pb-seguro` de `styles.css`.
       */
      /*
       * `interactive-widget=resizes-content` hace que el teclado del teléfono
       * encoja la maqueta, no solo el área visible. Sin él, la página sigue
       * midiendo la pantalla completa: el contenido centrado no se mueve, no hay
       * nada que desplazar, y el botón de un formulario corto queda debajo del
       * teclado, fuera de alcance.
       */
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { name: "theme-color", content: "#0047BB" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "XIV Encuentro Internacional de Educación" },
      {
        name: "description",
        content:
          "Prototipo de interfaz del sistema de registro, pagos, asistencia y elegibilidad para constancia del XIV Encuentro Internacional de Educación.",
      },
      { property: "og:title", content: "XIV Encuentro Internacional de Educación" },
      {
        property: "og:description",
        content:
          "Registro, pagos, asistencia y elegibilidad para constancia del XIV Encuentro Internacional de Educación.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "XIV Encuentro Internacional de Educación" },
      { property: "og:locale", content: "es_MX" },
      /*
       * La imagen de la tarjeta, y sus medidas.
       *
       * Sin `og:image` el chat enseñaba lo primero que encontraba —el icono de
       * la aplicación—, y eso era un cuadro azul con un cuadrito dentro: el ojo
       * de código QR que se dibujó cuando el logotipo todavía no existía. El
       * logotipo estaba en la portada y en el menú desde hace semanas, y era lo
       * único que no aparecía justo donde el enlace se comparte.
       *
       * El ancho y el alto van declarados porque con ellos el chat reserva el
       * hueco y pinta la tarjeta grande de entrada; sin ellos, algunos lectores
       * esperan a descargar la imagen y mientras tanto la enseñan pequeña, o no
       * la enseñan.
       */
      { property: "og:image", content: `${loaderData?.origen ?? ""}${TARJETA}` },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "Logotipo del XIV Encuentro Internacional de Educación: tres manos con lápices alrededor del mundo",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${loaderData?.origen ?? ""}${TARJETA}` },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Hasta el 2026-09-24 esto apuntaba a un archivo que no existía: el
      // navegador lo pide solo, y era un 404 en cada carga. Ahora lo dibuja
      // `generar-iconos` con el logotipo, en 32 y 48.
      { rel: "icon", href: "/favicon.ico", sizes: "32x32 48x48" },
      { rel: "icon", href: "/icons/icono-192.png", type: "image/png", sizes: "192x192" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // iOS ignora el manifiesto para el icono: usa este y solo acepta PNG.
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  /*
   * Lo público se resuelve antes de pintar.
   *
   * El nombre del evento y las fechas llegaban con la consulta del cliente, así
   * que la portada aparecía un instante sin título. Pedirlo en el `loader` hace
   * que el HTML salga ya completo.
   *
   * Si falla —sin base, o la base caída— se devuelve nulo y la aplicación sigue
   * su camino habitual: el cliente lo reintenta y, mientras, la configuración
   * está vacía. Una portada sin título es mejor que una pantalla de error.
   */
  loader: async () => {
    /*
     * El origen se resuelve aquí y no en `head` porque `head` corre también en
     * el navegador al cambiar de ruta, y ahí no hay petición: lo que vale es lo
     * que el servidor puso en el HTML, que es lo único que lee un robot de
     * vista previa.
     */
    const origen = origenDelSitio();
    try {
      const { cargarPublico } = await import("@/lib/datos");
      return { publico: await cargarPublico(), origen };
    } catch {
      return { publico: null, origen };
    }
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { publico } = Route.useLoaderData();
  // Publica `--teclado` para que las pantallas con formulario dejen sitio.
  useAltoTeclado();
  useTrabajadorDeServicio();
  useSelloDeVersion();

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        El orden importa: `PrototipoProvider` resuelve el participante de prueba
        contra la lista del contexto, que puede haber cambiado en la sesión.
      */}
      <SesionProvider>
        <EstadoEventoProvider inicial={publico}>
          <PrototipoProvider>
            <PortalProvider>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
              <Toaster position="top-center" richColors />
            </PortalProvider>
          </PrototipoProvider>
        </EstadoEventoProvider>
      </SesionProvider>
    </QueryClientProvider>
  );
}
