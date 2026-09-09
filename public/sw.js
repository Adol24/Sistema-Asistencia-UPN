/*
 * Trabajador de servicio.
 *
 * Tiene dos trabajos y conviene no confundirlos: hacer la aplicación instalable,
 * y que abra aunque no haya red. Lo que NO hace es servir datos viejos.
 *
 * La estrategia va por tipo de petición, porque no todas se equivocan igual:
 *
 * - Los archivos de `/assets/` llevan un hash del contenido en el nombre. Si el
 *   nombre coincide, el contenido coincide: se sirven de caché sin preguntar y
 *   nunca quedan obsoletos, porque un cambio genera otro nombre.
 * - Todo lo demás va a la red primero. Un capturista con la red intermitente
 *   necesita la versión de ahora, no la de esta mañana; solo si la red falla se
 *   echa mano de lo guardado.
 * - Las llamadas a Supabase no se tocan. Guardar respuestas de datos sería
 *   servir asistencias o pagos desactualizados, que es peor que un error.
 */
const VERSION = "v1";
const CACHE = `encuentro-${VERSION}`;
const ESENCIALES = ["/", "/manifest.webmanifest", "/icons/icono-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // `catch` porque una sola URL que falle abortaría toda la instalación, y
      // quedarse sin trabajador por un icono no compensa.
      .then((c) => c.addAll(ESENCIALES).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Solo lo servido desde este mismo origen: la base de datos queda fuera.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copia = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copia));
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        void caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match("/"))),
  );
});
