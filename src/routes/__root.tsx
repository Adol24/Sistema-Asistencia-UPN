import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      /*
       * `viewport-fit=cover` deja que la página se dibuje bajo el notch y la
       * barra de gestos; sin él, el navegador reserva unas franjas y la
       * interfaz nunca llega al borde. A cambio obliga a respetar las
       * `env(safe-area-inset-*)`, que es lo que hacen las utilidades
       * `pt-seguro` / `pb-seguro` de `styles.css`.
       */
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
      { name: "twitter:card", content: "summary_large_image" },
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
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
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

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        El orden importa: `PrototipoProvider` resuelve el participante de prueba
        contra la lista del contexto, que puede haber cambiado en la sesión.
      */}
      <SesionProvider>
        <EstadoEventoProvider>
          <PrototipoProvider>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            <Toaster position="top-center" richColors />
          </PrototipoProvider>
        </EstadoEventoProvider>
      </SesionProvider>
    </QueryClientProvider>
  );
}
