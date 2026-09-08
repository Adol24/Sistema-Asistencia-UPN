# Estado del proyecto — Encuentro UI

> **Este documento nació como auditoría y se convirtió en el registro del proyecto.**
> Las secciones 1 y 2 reflejan el **estado final**, tras ocho tandas de trabajo.
> Las secciones 3 a 9 son la **auditoría original del 05/09/2026** y se conservan
> sin cambios como fotografía del punto de partida: describen el prototipo cuando
> estaba al 51 %, no el de hoy. La sección 10 registra tanda por tanda cómo se
> pasó de aquello a esto.
>
> **El alcance cambió durante el trabajo:** el sistema ya no genera constancias.
> Calcula quién es elegible y entrega el listado a quien elabora los documentos.
> Quedaron fuera, y se retiraron del código, la generación y vista previa de PDF,
> el folio de constancia, el QR de verificación, la página pública
> `/verificar/{folio}`, la emisión individual y masiva, y la anulación. El
> `README.md` está corregido en ese punto.

- **Última actualización:** 07/09/2026
- **Raíz:** `C:\Proyectos Desarrollo\En Producción\encuentro-ui-main`
- **Verificación:** `bun run verificar-mocks`, `bun run typecheck`, `bun run lint` y `bun run build` pasan los cuatro con código 0.
- **Para enseñar el prototipo:** `docs/RECORRIDO-DEMO.md` — guion de demostración con folios reales verificados contra los datos.

---

## 1. Resumen ejecutivo

El prototipo está completo respecto al alcance vigente: **33 de 33 pantallas construidas** y **141 de 141 elementos** exigidos por la especificación. Los seis módulos funcionan y se tocan entre sí dentro de una misma sesión: un pago registrado en ventanilla hace aparecer el QR en el portal de esa persona y la deja pasar en verde en la puerta; un escaneo en la puerta se ve en su portal y queda anotado en la bitácora; una evidencia aprobada en el panel de revisión mueve el avance del dashboard y puede volver elegible a un alumno; importar un padrón corregido mueve de día al participante y libera su taller si ya no se imparte ese día; y cerrar un caso de nombre en soporte quita la marca de ese participante en el listado de elegibles y en su exportación.

Los datos simulados dejaron de ser decorado: **46 comprobaciones, agrupadas en 18 familias**, se ejecutan en cada `bun run verificar-mocks`, y son las que impiden que una tanda futura vuelva a romper en silencio lo que ya funciona. Nacieron de errores reales cometidos durante el trabajo —días desalineados, un requisito de constancia matemáticamente inalcanzable, el escáner sin casos verdes— y cada uno falla nombrando el caso concreto. En la última tanda el verificador dejó de mirar solo los datos de arranque: **corre también sobre el estado de la sesión**, y para eso hubo que separar tres cosas que estaban mezcladas bajo la palabra «invariante» —lo que siempre debe cumplirse (`integridad`), lo que solo describe la riqueza de los datos de ejemplo (`cobertura`) y lo que es consecuencia legítima de un cambio hecho durante la sesión (`historico`)—. El dashboard muestra las primeras en rojo y las terceras como aviso, porque una asistencia que quedó en el día viejo tras mover a alguien de día no es un error: es historia, y no se reescribe.

La Ñ se conserva de punta a punta, desde el mock hasta el CSV que recibe quien imprime, con BOM para que Excel no la degrade. Y el prototipo se puede enseñar sin prepararlo: **`docs/RECORRIDO-DEMO.md`** trae el recorrido completo —del pre-registro al listado de elegibles— con los folios, referencias y nombres concretos de cada paso, todos verificados por script contra los datos.

El alcance se redujo a mitad del camino: **el sistema ya no emite constancias**. Calcula elegibilidad y entrega el listado. El código de emisión, verificación pública y anulación se retiró en lugar de dejarse desconectado, y la marca de nombre en revisión —que antes bloqueaba la impresión— pasó a señalar esos casos en el listado y en la exportación, que es lo que ahora tiene sentido.

El sistema de diseño quedó centralizado y medido, no supuesto: los 18 tokens de dominio existen en ambos modos, y los **nueve pares de badge y los tres colores del semáforo cumplen WCAG AA o mejor en claro y en oscuro**, con el contraste real calculado desde los valores `oklch` del tema. El semáforo del escáner tiene sus propios colores de texto y **no cambia con el tema**: verde, amarillo y rojo se ven idénticos siempre, porque un capturista que memorizó un color en la mañana no debe encontrarse otro por la tarde.

**El riesgo principal ya no está en el prototipo sino en lo que sigue.** Todo el estado vive en memoria y se reinicia al recargar, salvo la cola de escaneos sin conexión; eso es correcto para revisar pantallas y deja de serlo en cuanto alguien quiera usarlo. Antes de conectar lógica real conviene decidir dos cosas que el prototipo dejó abiertas a propósito: que el despliegue produce hoy un worker de servidor y no un sitio estático (`vite.config.ts`, sección 4), y que las reglas de negocio verificables —validaciones de pago, semáforo del escáner, elegibilidad, detección de anomalías— están aisladas en módulos puros justamente para que la implementación real las herede en vez de reescribirlas.

---

## 2. Semáforo general

| Módulo                             | Estado | Avance   | Observación principal                                                                                                      |
| ---------------------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Datos simulados (`/src/mocks/`)    | 🟢     | 100 %    | 8 archivos conformes; 46 comprobaciones en 18 familias, clasificadas y verificables sobre el estado de la sesión           |
| Pre-registro público (8 pantallas) | 🟢     | 100 %    | Identificación con la matrícula de 11 dígitos, datos de contacto confirmados, nombre no editable             |
| Catálogo de talleres               | 🟢     | 100 %    | Los 4 estados de tarjeta; oculta los talleres marcados como inactivos en administración                                    |
| Instrucciones de pago              | 🟢     | 100 %    | Folio grande, QR, dos depósitos, copiar, vouchers de ejemplo; cuota y fecha límite salen de la configuración               |
| Portal del participante            | 🟢     | 100 %    | Refleja pagos, asistencias y decisiones de revisión de la sesión sin recargar                                              |
| Servicios Financieros              | 🟢     | 100 %    | Búsqueda con atajos reales, ficha, las 4 validaciones de pago, carga masiva con vista previa y conciliación                |
| App de captura de asistencia       | 🟢     | 100 %    | Semáforo a pantalla completa con sonido y vibración, reingreso, cierre automático, sin conexión persistido, y a bitácora   |
| Revisión de evidencias             | 🟢     | 100 %    | Visor con zoom, 5 atajos funcionales, duplicados lado a lado, cola repartida por bloques de día                            |
| Administración                     | 🟢     | 100 %    | Dashboard con panel de integridad, monitoreo con reloj simulado, listado de elegibles y las 7 pantallas de gestión         |
| Navegación y entrega               | 🟢     | 100 %    | Índice con 33 de 33 construidas, selector flotante, cero enlaces rotos                                                     |
| Sistema de diseño                  | 🟢     | 100 %    | 18 tokens de dominio en ambos modos; badges y semáforo medidos, todos AA o mejor en claro y oscuro                         |
| **Global**                         | 🟢     | **100 %**| 141 de 141 elementos del alcance vigente, todos verificados con ruta y línea                                               |

### Cómo se calculó el porcentaje

El método no cambió desde la auditoría original: cada módulo se descompone en los elementos discretos que la especificación exige de forma literal —cada pantalla, cada estado visual, cada mensaje, cada control— y se cuenta cuántos están verificados presentes, con ruta y línea. Un elemento cuenta 1 si está implementado y funcional, 0,5 si está presente pero incompleto, y 0 si está ausente.

Lo que sí cambió es el denominador, dos veces. La auditoría partía de 140 elementos; el cambio de alcance retiró los 8 de emisión y verificación pública (PDF, folio, QR, página pública con sus tres estados, emisión individual, emisión masiva, bloqueo por nombre, anulación) y añadió los 7 del listado de elegibles y su exportación, dejándolo en 139. Después, al saberse que el padrón de Servicios Escolares no incluye correos ni programa, entraron 3 elementos que la especificación no podía prever: la pantalla de captura de datos académicos, el catálogo de niveles y programas, y la verificación de correo para alumnos, que antes no la necesitaban. El total vigente es **142**.

| Módulo                                                          | Elementos exigidos | Verificados presentes | %        |
| --------------------------------------------------------------- | ------------------ | --------------------- | -------- |
| Pre-registro público                                            | 20                 | 20                    | 100 %    |
| Catálogo de talleres                                            | 9                  | 9                     | 100 %    |
| Instrucciones de pago                                           | 14                 | 14                    | 100 %    |
| Portal del participante                                         | 17                 | 17                    | 100 %    |
| Servicios Financieros                                           | 21                 | 21                    | 100 %    |
| App de captura                                                  | 16                 | 16                    | 100 %    |
| Revisión de evidencias                                          | 13                 | 13                    | 100 %    |
| Administración (dashboard, monitoreo, elegibles y 7 de gestión) | 17                 | 17                    | 100 %    |
| Navegación y entrega                                            | 3                  | 3                     | 100 %    |
| Sistema de diseño                                               | 11                 | 11                    | 100 %    |
| **Total**                                                       | **141**            | **141**               | **100 %**|

Los datos simulados se miden aparte (8 archivos requeridos, 8 conformes = 100 %) porque son capa de datos, no de presentación.

---

> **Las secciones 3 a 9 son la auditoría original del 05/09/2026.** Describen el
> prototipo tal como estaba entonces, al 51 % y con el alcance original que
> incluía emisión de constancias. Mencionan también la herramienta con la que se
> generó el andamiaje inicial y sus archivos; **nada de eso queda en el
> proyecto** —se retiró por completo, ver la última entrada de la sección 10— y
> se conserva aquí solo porque explica de dónde salió el código. Se conservan sin cambios porque son la
> fotografía del punto de partida; para el estado de hoy, lee las secciones 1 y 2
> y el registro de cambios de la sección 10.

---

## 3. Inventario técnico

### Estructura de directorios (3 niveles) y conteo de archivos

```
encuentro-ui-main/
├── .lovable/            2 archivos   (project.json + plan de generación)
│   └── plan/            1
├── docs/                            (creado por esta auditoría)
├── public/              2 archivos   (favicon.ico, robots.txt)
└── src/                 5 archivos   (router.tsx, routeTree.gen.ts, server.ts, start.ts, styles.css)
    ├── components/      6 archivos
    │   └── ui/         46 archivos   (shadcn/ui sin modificar)
    ├── hooks/           1 archivo
    ├── lib/             7 archivos
    ├── mocks/           9 archivos
    └── routes/         18 archivos
```

### Conteo de archivos y líneas

| Métrica                                                | Valor                                             |
| ------------------------------------------------------ | ------------------------------------------------- |
| Archivos `.tsx`                                        | 72                                                |
| Archivos `.ts`                                         | 18                                                |
| Líneas totales (`.ts` + `.tsx`)                        | 8 468                                             |
| Líneas de código propio (excluye `src/components/ui/`) | 4 107                                             |
| Líneas en `src/components/ui/` (shadcn generado)       | 4 361                                             |
| Archivo más grande de código propio                    | `src/routeTree.gen.ts` (388 líneas, autogenerado) |
| Archivos de código propio > 300 líneas                 | Ninguno escrito a mano                            |

### Dependencias y scripts (`package.json`)

Nombre del paquete: `tanstack_start_ts` (nombre de plantilla, nunca se renombró al proyecto).

**Scripts:** `dev` (`vite dev`), `build` (`vite build`), `build:dev`, `preview`, `lint` (`eslint .`), `format` (`prettier --write .`). **No hay script de test ni de typecheck** — esta es la razón mecánica por la que el error de tipos existente nunca se detectó.

**Dependencias relevantes (51 en total):** React 19.2, `@tanstack/react-router` 1.170.18, `@tanstack/react-start` 1.168.32, `@tanstack/router-plugin`, `@tanstack/react-query` 5.101, Tailwind CSS 4.2 vía `@tailwindcss/vite`, 26 paquetes `@radix-ui/*`, `lucide-react`, `recharts` 2.15, `sonner`, `zod` 3.25, `react-hook-form`, `date-fns`, `cmdk`, `embla-carousel-react`, `input-otp`, `vaul`.

**Dev (17):** TypeScript 5.8, Vite 8.1.5, ESLint 9, Prettier 3.7, `nitro` 3.0-beta, `@lovable.dev/vite-tanstack-config` 2.20.

### Configuración presente

| Archivo                           | Estado                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`                  | Presente. Delega todo a `@lovable.dev/vite-tanstack-config` y redirige la entrada de servidor a `src/server.ts` (`vite.config.ts:9-13`)         |
| `tsconfig.json`                   | Presente. `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`. Configuración estricta y bien elegida                                |
| `tailwind.config.*`               | **No existe.** Correcto: Tailwind v4 define el tema en CSS (`src/styles.css:21-84`), no en JS                                                   |
| `postcss.config.*`                | No existe. Correcto para Tailwind v4 con plugin de Vite                                                                                         |
| `components.json`                 | Presente. shadcn estilo `new-york`, base `slate`, variables CSS                                                                                 |
| `eslint.config.js`, `.prettierrc` | Presentes                                                                                                                                       |
| **Alias de rutas**                | `@/*` → `./src/*`, declarado en `tsconfig.json:41-43` y resuelto por `vite-tsconfig-paths`. Usado de forma consistente en todo el código propio |

### Historial de git

**NO VERIFICABLE.** No existe carpeta `.git` en el árbol. Para determinar fecha del último commit y número de commits haría falta el repositorio original con su historial, o acceso al proyecto en Lovable (`.lovable/project.json` referencia la revisión de plantilla `tanstack_start_ts_current-71fc193425b1`, que identifica la plantilla, no el historial del proyecto).

### Mapa de rutas

Rutas realmente definidas: **16** (`src/routeTree.gen.ts:30-106`).

| Ruta                 | Archivo                               | Implementación                            |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| `/`                  | `src/routes/index.tsx`                | Real — índice de módulos                  |
| `/bienvenida`        | `src/routes/bienvenida.tsx:16`        | Real                                      |
| `/alumno`            | `src/routes/alumno.tsx:26`            | Real                                      |
| `/confirmar-nombre`  | `src/routes/confirmar-nombre.tsx:21`  | Real                                      |
| `/registro`          | `src/routes/registro.tsx:32`          | Real                                      |
| `/verificar-correo`  | `src/routes/verificar-correo.tsx:22`  | Real                                      |
| `/mi-dia`            | `src/routes/mi-dia.tsx:18`            | Real                                      |
| `/talleres`          | `src/routes/talleres.tsx:22`          | Real                                      |
| `/pago`              | `src/routes/pago.tsx:50`              | Real                                      |
| `/comprobante`       | `src/routes/comprobante.tsx:23`       | Real                                      |
| `/portal`            | `src/routes/portal.index.tsx:23`      | Real                                      |
| `/portal/estado`     | `src/routes/portal.estado.tsx:27`     | Real                                      |
| `/portal/qr`         | `src/routes/portal.qr.tsx:30`         | Real                                      |
| `/portal/evidencias` | `src/routes/portal.evidencias.tsx:32` | Real                                      |
| `/portal/constancia` | `src/routes/portal.constancia.tsx:21` | Real                                      |
| `/financieros`       | `src/routes/financieros.index.tsx:26` | Real, pero termina en callejón sin salida |

**No existe ningún cascarón.** La distinción relevante en este proyecto no es entre pantalla real y placeholder, sino entre pantalla real y ruta inexistente: lo que falta, falta por completo.

### Clasificación de las pantallas exigidas por la especificación

**Implementadas (16):** Bienvenida · Identificación de alumno · Confirmación de nombre · Formulario docente/externo · Verificación de correo · Día y sede asignados · Catálogo de talleres · Instrucciones de pago · Comprobante de pre-registro · Acceso al portal · Vista de estado · Mi código QR · Mis evidencias · Mi constancia · Búsqueda de financieros · Índice del prototipo.

**Parciales (2):** Vista de estado del portal (línea de tiempo incompleta) · Búsqueda de financieros (atajos anunciados sin implementar, y navega a una ruta inexistente).

**Cascarón (0):** ninguna.

**Ausentes (18):** Ficha del participante · Formulario de registro de pago · Carga masiva por Excel · Vista de conciliación · Configuración de sesión de captura · Pantalla de escaneo · Semáforo de resultado · Modo taller · Historial de sesión · Panel de revisión de evidencias · Dashboard admin · Monitoreo en vivo · CRUD de talleres · Configuración del evento · Importación de padrón · Gestión de usuarios · Bandeja de soporte · Bitácora · Reportes · Emisión de constancias · Verificación pública `/verificar/{folio}`.

---

## 4. Desviaciones de alcance

La instrucción fue explícita: solo interfaz, sin backend, sin base de datos, sin llamadas de red. **La instrucción se respetó en lo esencial**, con una desviación estructural heredada de la plantilla que conviene conocer.

### Verificaciones limpias

| Verificación                                                                                    | Resultado                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencias de backend (`@supabase/*`, `firebase`, `axios`, `prisma`, `drizzle`, clientes SQL) | **Ninguna** en `package.json`                                                                                                                                  |
| `fetch(` / `axios` / `XMLHttpRequest` / `.from(` de Supabase / WebSocket en código propio       | **Ninguna.** Las únicas coincidencias son `Array.from()` (`src/components/qr-falso.tsx:33`) y el `fetch` del entry SSR de la plantilla (`src/server.ts:48-51`) |
| Archivos `.env`                                                                                 | **Ninguno**                                                                                                                                                    |
| Migraciones, `.sql`, `schema.prisma`                                                            | **Ninguno**                                                                                                                                                    |
| `import.meta.env` / `process.env` en código propio                                              | **Ninguno**                                                                                                                                                    |
| Estado en memoria con React                                                                     | Correcto: `useState` + `useContext` en `src/lib/prototipo.tsx:25-41`. Se reinicia al recargar, como pedía la especificación                                    |
| Latencia simulada 600–900 ms                                                                    | Correcto: `src/lib/formato.ts:15-16` (`600 + rand(300)` → 600–899 ms)                                                                                          |

### Desviación 1 — El stack no es el especificado: TanStack Start con servidor SSR, no React + React Router

**Ubicación:** `package.json:39-41`, `src/server.ts`, `src/start.ts`, `vite.config.ts:9-13`.

La especificación pidió _"React + Vite + TypeScript + Tailwind CSS + shadcn/ui + **React Router**"_. El proyecto usa **TanStack Router** con **TanStack Start**, un framework full-stack con renderizado en servidor. `bun run build` genera un worker de servidor desplegable (`.output/server/index.mjs`, 18,75 kB) y configuración de Cloudflare (`.output/server/wrangler.json`, `.wrangler/deploy/config.json`).

**Clasificación: desviación de alcance real, pero no contaminación.** No hay código que intente conectarse a nada: no hay endpoints propios, ni server functions, ni acceso a datos. Lo que existe es la infraestructura de servidor de la plantilla. Dos piezas van claramente más allá de "solo presentación":

- `src/start.ts:23-25` instala un **middleware CSRF** para proteger server functions. No hay ninguna server function en el proyecto.
- `src/server.ts:1-61` implementa un envoltorio de manejo de errores SSR con recuperación de stacks tragados por h3.

El plan de generación documenta la decisión de forma consciente y razonable (`.lovable/plan/prototipo-visual-…md:5`): _"este proyecto ya usa el enrutador propio de la plantilla (TanStack Router), no React Router. Es equivalente para todo lo pedido… No instalaré React Router para evitar romper el proyecto."_ El argumento es defendible. El impacto práctico es que **el prototipo se despliega como aplicación con servidor**, no como sitio estático, lo que cambia el modelo de hosting frente a lo que la especificación daba por supuesto.

### Desviación 2 — Telemetría de errores hacia el editor Lovable

**Ubicación:** `src/lib/lovable-error-reporting.ts:26-58`, invocada en `src/routes/__root.tsx:45`.

Reporta excepciones a `window.__lovableEvents.captureException` y `window.__lovableReportRuntimeError`. **No es contaminación:** no hace peticiones de red; llama a funciones que el editor de Lovable inyecta en `window` y que solo existen dentro de su vista previa. Fuera del editor son `undefined` y el código no hace nada (encadenamiento opcional en las líneas 28 y 53).

### Desviación 3 — Recursos externos en tiempo de ejecución

**Ubicación:** `src/routes/__root.tsx:99-104` (Google Fonts), `src/mocks/evidencias.ts:36,48-50` y `src/routes/portal.evidencias.tsx:219` (`placehold.co`).

La especificación pidió tipografía Inter e imágenes de marcador de posición, así que ambos usos están autorizados. Se registra porque **el prototipo no es autocontenido**: sin conexión a internet, la tipografía cae al sistema y todas las imágenes de evidencia y voucher quedan rotas. Si la revisión se va a hacer en una sala sin red, conviene saberlo.

### Elementos implementados que la especificación no contemplaba

Ninguno es problemático; se listan porque cambian el inventario.

| Elemento                          | Ubicación                                | Valoración                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/mocks/evento.ts` (30 líneas) | Archivo completo                         | **Mejora útil.** No estaba en la lista de mocks pedidos. Centraliza fechas, sedes, cuotas, datos bancarios, fecha límite, WhatsApp y horarios de soporte. Es exactamente el modelo de datos que necesitará la pantalla de "Configuración del evento" cuando se construya |
| `bitacora` (8 registros)          | `src/mocks/casosSoporte.ts:70-79`        | **Mejora útil.** Datos listos para la pantalla de bitácora, aún ausente                                                                                                                                                                                                  |
| `evidenciasDuplicadas()`          | `src/mocks/evidencias.ts:42-46`          | **Mejora útil.** Helper que agrupa por hash; anticipa la alerta de duplicados del panel de revisión ausente                                                                                                                                                              |
| Metadatos SEO por ruta            | `src/lib/seo.ts` + `head()` en cada ruta | **Neutral.** No se pidió. Bien hecho y sin costo                                                                                                                                                                                                                         |
| `QrFalso` determinista            | `src/components/qr-falso.tsx`            | **Mejora útil.** QR decorativo generado por hash del folio, sin dependencias. Cada folio produce un patrón distinto y estable                                                                                                                                            |
| Modo oscuro parcial               | `src/styles.css:152-185`                 | **Riesgo latente.** Existe el bloque `.dark`, pero **no redefine ningún token de estado, semáforo ni perfil**. Si alguien activa el modo oscuro, los badges conservarán colores claros sobre fondo oscuro. No hay interruptor, así que hoy no se manifiesta              |

---

## 5. Auditoría de datos simulados

Todos los conteos se obtuvieron programáticamente. Para `asistencias.ts` y `evidencias.ts`, que son derivados y se generan con `flatMap`, se replicó la lógica exacta de generación para contar los registros resultantes; no se estimaron.

| Archivo               | Existe | Registros reales vs esperados                                                                | Casos cubiertos                                                                                                                                                                                                                                | Casos faltantes                                                                                                         |
| --------------------- | ------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `participantes.ts`    | Sí     | **60 / 60** ✅                                                                               | 3 perfiles (32 alumno, 16 docente, 12 externo); 3 días (21/19/20); **los 6 estados de pago del evento**; **los 6 estados de pago del taller**; 34 con taller y 26 sin; 7 con `nombreEnRevision: true`; 7 con discrepancia; **9 nombres con Ñ** | Ninguno                                                                                                                 |
| `alumnosPadron.ts`    | Sí     | **40 / 40** ✅                                                                               | Los 5 campos exigidos: matrícula, nombre, correo institucional, programa educativo (6 programas distintos), día asignado                                                                                                                       | El día asignado **contradice** a `participantes.ts` en 22 de los 32 alumnos compartidos (ver Defecto MAY-1)             |
| `talleres.ts`         | Sí     | **11 / 11** ✅                                                                               | Los 10 campos por taller. 2 con cupo lleno: T01 (30/30), T05 (25/25) ✅. Con solo 2 lugares: T02 (25/23), T06 (30/28), T10 (26/24) — se pidió uno, hay tres ✅. Talleres de 1 día y de 2 días                                                  | Ninguno. Observación menor: los 11 comparten el horario idéntico "10:00 a 13:00 hrs"                                    |
| `asistencias.ts`      | Sí     | **47 registros** (24 entradas + 18 salidas + 5 de taller). La especificación no fijó volumen | Entradas y salidas ✅. **4 registros con `cierreAutomatico: true`** ✅                                                                                                                                                                         | Ninguno frente a lo exigido. Los 6 participantes sin salida representan implícitamente el caso "sin registro de salida" |
| `evidencias.ts`       | Sí     | **75 / ~80** ✅ (dentro de "unas 80")                                                        | Los 4 estados con cobertura amplia: pendiente 19, aprobada 18, rechazada 19, no entregada 19. Motivos de rechazo, revisor, contador de intentos, imagen                                                                                        | ❌ **Solo 1 de los 2 pares de hash duplicado exigidos.** Ver Defecto CRI-3                                              |
| `usuariosInternos.ts` | Sí     | **8 registros**                                                                              | **Los 5 roles** ✅: administrador (1), servicios_financieros (2), capturista (2), revisor_evidencias (2), soporte (1). Incluye un usuario inactivo (U05)                                                                                       | Ninguno                                                                                                                 |
| `casosSoporte.ts`     | Sí     | **6 registros**                                                                              | **Los 3 estados** ✅: abierto (2), en_proceso (2), resuelto (2). Los 3 canales: whatsapp, correo, ventanilla. Casos con y sin responsable asignado                                                                                             | Ninguno                                                                                                                 |

### Preservación de la Ñ — **CORRECTA**

Este era el riesgo destacado por afectar la impresión de documentos oficiales. **Se resolvió bien.** No aparece ni un solo caso de `MUNOZ`, `PENA` o `NUNEZ` sin Ñ en los nombres mostrados.

Los 9 nombres con Ñ en `src/mocks/participantes.ts:17-76`:

| Línea | Nombre                               |
| ----- | ------------------------------------ |
| 17    | JUAN CARLOS PEREZ **MUÑOZ**          |
| 18    | MARIA FERNANDA LOPEZ **PEÑA**        |
| 19    | LUIS ANGEL **NUÑEZ** RAMIREZ         |
| 25    | RICARDO ALONSO **TREVIÑO** CANTU     |
| 40    | CAMILA RENATA ORTIZ **MUÑIZ**        |
| 49    | ROBERTO CARLOS **PEÑA** MALDONADO    |
| 53    | GERARDO ANTONIO **ZUÑIGA** PARRA     |
| 61    | ARMANDO NICOLAS FIGUEROA **BRISEÑO** |
| 69    | SAUL ANTONIO IBARRA **MUÑOZ**        |

`alumnosPadron.ts:3-44` refuerza el caso con seis más: PEÑALOZA, YAÑEZ, MUÑOZ CASTAÑEDA, NIÑO, además de MUÑOZ, PEÑA, NUÑEZ, TREVIÑO y MUÑIZ. `usuariosInternos.ts` y `casosSoporte.ts` también las conservan (BAÑUELOS, BAÑOS, PEÑA, MUÑOZ, NUÑEZ).

La normalización se aplica **solo donde corresponde**: la derivación de correos sí retira la Ñ (`participantes.ts:84` y `alumnosPadron.ts:58`, ambos con `.replace(/ñ/g, "n")`), que es el comportamiento correcto —el nombre impreso conserva la Ñ, la dirección de correo no puede llevarla—. La regla de la especificación de "mayúsculas sin acentos pero con Ñ" se cumple: `NUÑEZ` sin tilde y con Ñ, no `NÚÑEZ` ni `NUNEZ`.

### Cobertura de estados

**Todos los estados de la especificación tienen al menos un registro de ejemplo.** No hay ningún estado huérfano que impida evaluar visualmente su pantalla:

| Conjunto de estados           | Cobertura                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Estado de pago del evento (6) | pre_registrado 9 · comprobante_recibido 10 · pagado 24 · discrepancia 7 · expirado 5 · cancelado 5 |
| Estado de pago del taller (6) | pre_registrado 7 · comprobante_recibido 10 · pagado 10 · discrepancia 4 · expirado 2 · cancelado 1 |
| Estado de evidencia (4)       | pendiente 19 · aprobada 18 · rechazada 19 · no_entregada 19                                        |
| Estado de caso de soporte (3) | abierto 2 · en_proceso 2 · resuelto 2                                                              |
| Roles internos (5)            | Los 5 presentes                                                                                    |

**Salvedad importante:** la cobertura de datos es completa, pero **eso no significa que los estados se puedan evaluar visualmente**. El semáforo de escaneo (verde / amarillo / rojo) tiene sus tres tokens de color definidos en `src/styles.css:129-131`, y ningún archivo del proyecto los usa: la pantalla que debía pintarlos no existe. Lo mismo ocurre con los cuatro estados de evidencia desde la perspectiva del revisor, y con los seis estados de pago en el formulario de ventanilla.

---

## 6. Detalle por módulo

### 6.1 Pre-registro público — 🟢 100 % (18/18)

**Presente:**

- Bienvenida con nombre, fechas y sedes del evento, más los dos botones grandes exigidos — `src/routes/bienvenida.tsx:21-68`
- Identificación de alumno con matrícula y segundo campo de verificación por correo institucional — `src/routes/alumno.tsx:84-114`
- Botón de buscar con estado de carga visible ("Buscando en el padrón…") — `src/routes/alumno.tsx:117-127`
- Caso _no encontrado_ con el texto literal de la especificación y botón de WhatsApp — `src/routes/alumno.tsx:130-149`
- Caso _datos no coinciden_ con el texto literal "El correo no coincide con esa matrícula." — `src/routes/alumno.tsx:151-157`
- Recuadro de nombre en tipografía grande (`text-2xl`/`sm:text-3xl`, negrita extra), con el formato y la leyenda "Así aparecerá en tu constancia." — `src/routes/confirmar-nombre.tsx:35-44`
- **Casillas mutuamente excluyentes**: implementadas con un único estado `opcion` de tipo `"correcto" | "incorrecto" | null`, lo que hace estructuralmente imposible marcar ambas — `src/routes/confirmar-nombre.tsx:27, 46-62`
- **El nombre no es editable**: se renderiza en un `<p>`, no hay ningún `<input>` en la pantalla — `src/routes/confirmar-nombre.tsx:39`
- **Marcar "nombre incorrecto" no bloquea el avance**: el botón se habilita con cualquiera de las dos opciones (`disabled={!opcion}`) y aparece el aviso informativo con el texto exigido — `src/routes/confirmar-nombre.tsx:64-72, 86-95`
- **WhatsApp con contexto precargado**: matrícula, nombre mostrado y folio en el texto — `src/routes/confirmar-nombre.tsx:29-31`. Horario de atención y correo de respaldo visibles junto al botón — línea 82-84
- Formulario docente/externo con selector de perfil y los 6 campos, **apellido materno marcado como opcional** en su propia etiqueta — `src/routes/registro.tsx:115`
- Aviso permanente sobre el formulario con el texto exigido — `src/routes/registro.tsx:75-81`
- **Verificación de correo por código de 6 dígitos**, con reenvío y contador regresivo de 45 s — `src/routes/verificar-correo.tsx:64-95`
- Pantalla de confirmación final con el nombre completo y casilla obligatoria — `src/routes/verificar-correo.tsx:97-117`
- **Día asignado como solo lectura**: tarjeta informativa sin ningún control de selección, con la leyenda explícita "No es posible cambiar de día" — `src/routes/mi-dia.tsx:23-61`

**Faltante:** nada frente a la especificación.

---

### 6.2 Catálogo de talleres — 🟢 100 % (9/9)

**Presente** — todo en `src/routes/talleres.tsx`:

- Los 11 talleres con nombre, ponente, días, horario, lugar, contador de lugares, costo e insignia de duración — líneas 64-85, insignia en 66-68
- **Los 4 estados visuales de tarjeta**, calculados en las líneas 47-51 y aplicados en 56-62:
  - _Disponible_: borde normal, seleccionable
  - _Pocos lugares_ (`libres < 5`): contador en color de advertencia (`text-estado-discrepancia`) más el texto "¡últimos lugares!" — líneas 95-103
  - _Cupo lleno_: fondo gris con opacidad, etiqueta "Cupo lleno", botón deshabilitado. **La tarjeta sigue visible, no se oculta**, como exigía la especificación — líneas 58, 90-93, 108
  - _Seleccionado_: resaltado con anillo, los demás atenuados (`atenuado && !lleno && "opacity-50"`), botón que cambia a "Cambiar taller" — líneas 59-60, 112
- **Selección de máximo uno**: estado único `seleccion: string | null`; volver a pulsar deselecciona — líneas 25, 110
- **Botón "Continuar sin taller"** claramente visible, en barra fija inferior junto al de continuar — líneas 121-131
- Aviso de apartado con la fecha y hora literales exigidas — líneas 34-43

**Faltante:** nada.

---

### 6.3 Instrucciones de pago — 🟢 100 % (14/14)

**Presente** — todo en `src/routes/pago.tsx`:

- **Folio en tipografía muy grande** (`text-4xl` / `sm:text-5xl`, negrita extra) — línea 82
- **QR del folio** junto al bloque de folio — líneas 83-85
- **Aviso destacado de dos depósitos separados** con el texto exigido, en bloque con color de advertencia — líneas 88-93
- Desglose en dos bloques: evento con concepto `ENCUENTRO-{folio}` (línea 100) y taller con `TALLER-{folio}` (línea 108). Cuando no hay taller se muestra un bloque explicativo en lugar de omitirlo — líneas 112-121
- **Datos bancarios** (banco, cuenta, CLABE, beneficiario), **cada uno con botón de copiar que confirma al pulsarse** cambiando a "Copiado" durante 1,8 s — componente `CampoCopiable`, líneas 25-48; instancias en 127-130
- **Las dos imágenes de ejemplo de voucher** (correcta e incorrecta), en posición prominente y **ampliables al tocar** mediante diálogo modal — líneas 134-151, modal en 186-191. Marcadores de posición claramente etiquetados
- Ubicación y horario de Servicios Financieros — líneas 153-158
- **Fecha límite con día y hora exactos**, destacada en bloque con borde de color — líneas 159-162 (valor en `src/mocks/evento.ts:7`: "viernes 10 de octubre, 18:00 hrs")
- Qué llevar: credencial, voucher original, folio — líneas 165-172
- Aviso del QR con el texto literal exigido — líneas 174-180
- Botones de descargar PDF y reenviar por correo, ambos simulados con notificación — líneas 60-78
- Pantalla imprimible: los controles llevan `print:hidden` — líneas 60, 182

**Faltante:** nada.

---

### 6.4 Portal del participante — 🟢 97 % (16,5/17)

**Presente:**

- Acceso con folio más matrícula o correo, sin contraseña, con validación cruzada real contra el mock — `src/routes/portal.index.tsx:31-52`
- **Línea de tiempo horizontal de 4 nodos** (Pre-registrado → Comprobante recibido → Pagado → QR generado) con tres tratamientos visuales: completado, actual y pendiente — `src/routes/portal.estado.tsx:22, 46-75`
- Indicadores separados de pago de evento y de taller, más el aviso de nombre en revisión — `src/routes/portal.estado.tsx:78-109`
- **QR condicionado al estado pagado** (`const pagado = p.estadoPagoEvento === "pagado"`) — `src/routes/portal.qr.tsx:32, 37`
- QR grande con nombre y folio debajo, botones de descargar y guardar, y aviso de tomar captura porque no se necesita internet — `src/routes/portal.qr.tsx:38-59`
- Si no está pagado: sin QR, con el estado actual y **un mensaje distinto por cada uno de los 5 estados no pagados** — `src/routes/portal.qr.tsx:22-28, 61-80`
- **Tarjetas de evidencia por día (3), con los 6 estados exigidos** — `src/routes/portal.evidencias.tsx:53-67` y su renderizado en 91-164:
  - _Presencial_ (día asignado), con entrada y salida — líneas 91-114
  - _Fuera de ventana horaria_, bloqueada con explicación — líneas 116-124
  - _Disponible para subir_ — líneas 155-164
  - _Subida y en revisión_ / _aprobada_ / _no entregada_ vía `EstadoEvidenciaBadge` — líneas 126-153
  - _Rechazada con motivo visible y botón de volver a subir_ — líneas 132-146
- **Componente de subida con vista previa, indicador de progreso y contador de intentos restantes (máximo 3)** — `src/routes/portal.evidencias.tsx:174-234`; vista previa en 223-225, barra de progreso en 226, contador en 228, bloqueo al agotar intentos en 199-204
- Estado vacío correcto para perfiles no alumno — `src/routes/portal.evidencias.tsx:38-51`
- Constancia con botón activo solo si se cumplen los requisitos, y lista de qué falta con marca por requisito — `src/routes/portal.constancia.tsx:26-35, 49-60, 70-76`

**Faltante / incompleto:**

- **La línea de tiempo nunca marca "Pagado" como nodo actual.** `indiceDe()` mapea `pagado → 3` y `comprobante_recibido → 1`, saltando el índice 2 — `src/routes/portal.estado.tsx:24-25`. Además, los estados `discrepancia`, `expirado` y `cancelado` se mapean todos a `0`, indistinguibles de `pre_registrado` dentro de la línea de tiempo. Los badges de más abajo sí los diferencian, así que la información no se pierde, pero la línea de tiempo transmite un estado engañoso.

---

### 6.5 Panel de Servicios Financieros — 🔴 17 % (3,5/21)

**Presente** — todo en `src/routes/financieros.index.tsx`:

- **Campo de búsqueda único** que acepta folio, matrícula, nombre o correo — línea 66-73; la función de búsqueda cubre los cuatro campos en `src/mocks/participantes.ts:134-144`
- **Foco automático al cargar** — líneas 29, 35-37
- Botón grande de escanear QR que abre una **vista de cámara simulada** — líneas 78-80, modal en 142-159
- Estado vacío, estado de carga **con skeletons** (no spinner) y estado sin coincidencias, los tres con textos concretos — líneas 89-113
- Resultados con badge de perfil e indicadores separados de evento y taller — líneas 128-134

**Faltante:**

- ⚠️ **Atajos de teclado anunciados pero no implementados.** La pantalla muestra "Enter buscar · Esc limpiar · F2 escanear" (líneas 82-86), pero no existe ningún `onKeyDown` ni `addEventListener` en el archivo. Solo Enter funciona, y por el envío nativo del formulario. En un panel cuyo requisito explícito es la velocidad de atención en ventanilla, esto es engañoso para el operador.
- ❌ **Ficha del participante** — ausente. Debía mostrar nombre, folio, badge de perfil, día, sede, monto esperado, indicadores separados de evento y taller, taller seleccionado y **alerta destacada si el nombre está en revisión**.
- ❌ **Formulario de registro de pago** — ausente. Sin bloque por concepto, sin monto de voucher, referencia bancaria, fecha de depósito ni captura de foto del voucher.
- ❌ **Las 4 validaciones de monto y referencia** — ausentes las cuatro: referencia duplicada (error bloqueante rojo con el folio en conflicto y botón deshabilitado), monto menor (advertencia amarilla con nota obligatoria), monto mayor (ídem) y monto exacto (confirmación verde con aviso de QR generado y correo enviado).
- ❌ **Carga masiva por Excel** — ausente por completo: zona de arrastrar y soltar, plantilla descargable, columnas visibles, **vista previa obligatoria**, semáforo por fila, banner de resumen, filtros, "Aplicar solo los válidos", descarga del archivo de errores y modal de confirmación final.
- ❌ **Vista de conciliación** — ausente: tarjetas de total recaudado, desglose evento/taller, pagos en discrepancia, referencias duplicadas, pre-registros por vencer, tabla filtrable y exportación.
- 🔴 **Callejón sin salida.** Pulsar cualquier resultado o simular la lectura del QR llama a `navigate({ to: "/financieros/ficha" })` (línea 50), ruta que no existe: el usuario cae en el 404. Además, la barra de navegación del módulo muestra tres pestañas rotas — `src/components/nav-financieros.tsx:7-9`.

---

### 6.6 App de captura de asistencia — 🔴 0 % (0/16)

**No existe ningún archivo.** Verificado con `find src -iname "*captur*"`: la única coincidencia es `src/lib/error-capture.ts`, sin relación.

**Faltante — la totalidad:** configuración de sesión (selectores de día 1/2/3, modo ENTRADA/SALIDA/TALLER, punto de captura) · control de modo siempre visible en la pantalla de escaneo · cámara simulada a pantalla completa · campo alterno para teclear folio o matrícula · contador de escaneos de la sesión · **semáforo a pantalla completa en los tres colores** (verde con nombre, badge y hora; amarillo con motivo y acción sugerida; rojo con motivo y "PASAR A MESA DE INCIDENCIAS") · resultado durante 2 s con opción de mantener en pantalla · vibración y sonido diferenciados por color · **indicador de conexión permanente** (EN LÍNEA / SIN CONEXIÓN — N pendientes) · botón oculto de desarrollo para alternar el estado de conexión · modo taller con lista de casillas, búsqueda y contador · historial de sesión con deshacer el último escaneo.

Nota: los tokens de color del semáforo ya están definidos y listos para usarse (`src/styles.css:129-131`); hoy no los consume ningún archivo.

---

### 6.7 Panel de revisión de evidencias — 🔴 0 % (0/13)

**No existe ningún archivo.**

**Faltante — la totalidad:** visor de imagen a pantalla completa **con zoom** · panel lateral con nombre, matrícula, día y hora de subida · botones grandes de aprobar y rechazar · **atajos de teclado visibles y funcionales** (A aprobar, R rechazar, ←/→ navegar, Z deshacer) · avance automático a la siguiente imagen al decidir · **alerta destacada de hash duplicado con las dos imágenes lado a lado y los datos de ambos alumnos** · contador de progreso con barra · filtros por día, estado, revisor y solo duplicados · modal de rechazo con los 6 motivos seleccionables obligatorios · enlace permanente a los criterios de aprobación con panel lateral.

Nota: los datos ya están listos. `evidencias.ts` tiene 75 registros en los 4 estados, motivos de rechazo, revisores y el helper `evidenciasDuplicadas()` (`src/mocks/evidencias.ts:42-46`). Solo falta la interfaz — con la salvedad de que hoy solo hay un par de duplicados en lugar de dos (Defecto CRI-3).

---

### 6.8 Panel de administración — 🔴 0 % (0/18)

**No existe ningún archivo.** La constante `navAdmin` que definiría su navegación existe pero **no se importa en ningún sitio** — `src/components/nav-financieros.tsx:14-29` (código muerto).

**Faltante — la totalidad:** dashboard con tarjetas de indicadores y gráficas (pre-registros por perfil y por día, embudo de pagos, ocupación de los 11 talleres con barras, asistencia en vivo, avance de revisión, constancias emitidas contra elegibles) · monitoreo en vivo (total escaneado contra esperado, ritmo por minuto, desempeño por punto de captura, panel de alertas de anomalías) · CRUD de talleres · configuración del evento · importación del padrón con vista previa · gestión de usuarios internos y roles · bandeja de casos de soporte · bitácora filtrable · reportes con exportación · **emisión de constancias** (elegibles, vista previa PDF, individual y masiva con modal de confirmación indicando cuántas se generarán, y bloqueo visible para quienes tienen el nombre en revisión) · **página pública `/verificar/{folio}`** con sus tres estados (válida, no encontrada, anulada).

Nota: `recharts` 2.15.4 ya está declarado en `package.json:63` para las gráficas, y `usuariosInternos.ts`, `casosSoporte.ts`, `bitacora` y `evento.ts` tienen los datos preparados. Falta toda la interfaz.

---

### 6.9 Navegación y entrega — 🟡 83 % (2,5/3)

**Presente:**

- **Pantalla de índice en `/`** con todas las rutas agrupadas por módulo y una nota descriptiva por grupo — `src/routes/index.tsx:23-99, 102-142`
- **Selector flotante de participante de prueba**, visible en todas las pantallas, con los 60 participantes, su badge de perfil y su estado de pago, y cambio inmediato de contexto — `src/components/selector-prueba.tsx:10-68`, montado globalmente en `src/routes/__root.tsx:140`
- **Rutas navegables directamente por URL**: las 16 existentes lo son; el enrutador basado en archivos lo garantiza

**Faltante / incompleto:**

- 🔴 **21 de los 36 enlaces del índice conducen a un 404.** El índice se escribió para el proyecto completo planificado, no para el construido. Desglose por grupo:

  | Grupo del índice        | Enlaces | Funcionan | Rotos  |
  | ----------------------- | ------- | --------- | ------ |
  | Registro público        | 9       | 9         | 0      |
  | Portal del participante | 5       | 5         | 0      |
  | Servicios Financieros   | 4       | 1         | **3**  |
  | Captura de asistencia   | 4       | 0         | **4**  |
  | Revisión de evidencias  | 1       | 0         | **1**  |
  | Administración          | 10      | 0         | **10** |
  | Verificación pública    | 3       | 0         | **3**  |
  | **Total**               | **36**  | **15**    | **21** |

---

### 6.10 Sistema de diseño — 🟡 77 % (8,5/11)

**¿Existen tokens de color definidos?** **Sí, y bien organizados.** No en `tailwind.config` —que no existe, correctamente, porque Tailwind v4 define el tema en CSS— sino en `src/styles.css`. El bloque `@theme inline` (líneas 21-84) mapea las variables a utilidades de Tailwind, y `:root` (líneas 87-149) define los valores en formato `oklch`. Los tokens de dominio están agrupados y comentados:

- Estados de pago, 6 pares color/fondo — líneas 114-126
- Semáforo de escaneo, 3 colores — líneas 128-131
- Perfiles, 3 pares color/fondo — líneas 133-139
- Tipografía Inter declarada como `--font-sans` (línea 62) y cargada en `src/routes/__root.tsx:103`

**¿Los colores semánticos son consistentes entre módulos, o cada pantalla define los suyos?** **Consistentes.** Ninguna pantalla define colores propios para los estados: todas consumen las mismas utilidades derivadas de los tokens (`bg-estado-pagado-bg`, `text-estado-discrepancia`, `bg-perfil-alumno-bg`, etc.). Es el punto más sólido del sistema de diseño. Una única inconsistencia semántica menor: `src/routes/talleres.tsx:98` usa el token de _estado de pago_ `text-estado-discrepancia` para señalar _pocos lugares de cupo_, que es un dominio distinto; funciona visualmente pero mezcla vocabularios.

**¿Existen componentes reutilizables de badge, o están duplicados?** **Existen y están centralizados**, sin duplicación en ninguna vista — `src/components/estado-badges.tsx`:

- `PerfilBadge` (líneas 108-117): ALUMNO, DOCENTE, EXTERNO, cada uno con su color propio
- `EstadoPagoBadge` (líneas 15-67): los 6 estados, cada uno con color, **ícono** y etiqueta en español, más un prefijo opcional para distinguir "Evento:" de "Taller:"
- `EstadoEvidenciaBadge` (líneas 69-106): los 4 estados con el mismo tratamiento

Los tres comparten una constante `base` de estilo (línea 48-49), lo que garantiza forma y espaciado idénticos.

**¿Hay estados vacío, cargando y de error? ¿Skeletons o spinners?** **Parcialmente, y aquí está la debilidad.**

- _Vacío_: implementado solo en financieros, con tres variantes distintas (sin búsqueda / sin coincidencias) — `src/routes/financieros.index.tsx:98-113` — y en evidencias para perfiles no alumno — `portal.evidencias.tsx:38-51`.
- _Cargando_: **la especificación pidió skeletons, no spinners genéricos.** Solo `financieros.index.tsx:89-97` usa `Skeleton`. Todo el flujo público usa spinners `Loader2` con texto: `alumno.tsx:120`, `registro.tsx:141`, `verificar-correo.tsx:78`, `pago.tsx:75`, `portal.index.tsx:100`. Los textos que acompañan al spinner son concretos ("Buscando en el padrón…", "Enviando código de verificación…"), lo que mitiga el problema, pero no es lo que se pidió.
- _Error_: hay límite de error global (`__root.tsx:41-77`) y errores de validación por campo en todos los formularios. **El límite global está en inglés** (ver Defecto MAY-2).

**¿Los mensajes de error son concretos o genéricos?** **Concretos, y es un punto fuerte.** Ejemplos verificados: "No encontramos ese folio. Revisa que esté completo, por ejemplo PRE-00842." (`portal.index.tsx:42`) · "Ese folio no coincide con la matrícula o el correo que capturaste." (`portal.index.tsx:47`) · "El celular debe tener 10 dígitos." (`registro.tsx:57`) · "Ya usaste tus 3 intentos de este día. Contacta a soporte si necesitas ayuda." (`portal.evidencias.tsx:202`). La única excepción es el límite de error global, genérico y en inglés.

**Faltante:**

- ❌ **Confirmación explícita en acciones irreversibles**: no hay ninguna. La especificación citaba tres casos —cancelar registro, aplicar carga masiva, emitir constancias en lote— y los tres viven en módulos ausentes. Es faltante consecuente, no descuido.
- ❌ **Tokens de semáforo sin ningún consumidor** (`src/styles.css:129-131`).
- ⚠️ **El bloque `.dark` no redefine los tokens de estado, semáforo ni perfil** (`src/styles.css:152-185`): en modo oscuro los badges quedarían con colores claros sobre fondo oscuro. No hay interruptor de tema, así que hoy es riesgo latente.
- **Contraste AA: NO VERIFICABLE** por lectura estática. Los valores `oklch` elegidos (luminosidad 0,45–0,55 para texto sobre fondos de 0,94–0,95) sugieren buen contraste, pero confirmarlo exige medición sobre el render. Haría falta ejecutar la aplicación y pasar un verificador de contraste (axe, Lighthouse) sobre cada combinación token/fondo.
- **Targets táctiles de 44 px: cumplido** de forma consistente. `min-h-11` / `h-11` (44 px) o superior aparece en los 14 archivos de ruta y en 3 de componentes.

---

## 7. Defectos encontrados

### Críticos

**CRI-1 — 21 de 36 enlaces del índice conducen a un 404**
_Ubicación:_ `src/routes/index.tsx:53-98` (grupos Financieros, Captura, Revisión, Administración y Verificación pública).
_Descripción:_ La pantalla de entrega lista rutas de cuatro módulos que no se construyeron. Quien reciba el prototipo para revisión pulsará "Dashboard", "Panel de revisión" o "Escaneo con semáforo" y recibirá una pantalla de error en inglés, sin forma de distinguir entre un defecto y una omisión de alcance.
_Impacto:_ Es el defecto de mayor consecuencia práctica, porque **destruye la utilidad del prototipo como entregable de revisión**: convierte una entrega parcial honesta en una que aparenta estar completa y falla. Además invalida la revisión: el revisor no sabe qué evaluar.

**CRI-2 — El panel de financieros termina en un callejón sin salida y rompe la compilación de tipos**
_Ubicación:_ `src/routes/financieros.index.tsx:50`; enlaces de navegación en `src/components/nav-financieros.tsx:7-9`.
_Descripción:_ `navigate({ to: "/financieros/ficha" })` apunta a una ruta inexistente. Pulsar cualquier resultado de búsqueda o simular la lectura de un QR lleva al 404. Este es **el único error de `tsc --noEmit`** en todo el proyecto:

```
src/routes/financieros.index.tsx(50,16): error TS2820:
Type '"/financieros/ficha"' is not assignable to type '"." | "/" | "/alumno" | ...
```

_Impacto:_ El módulo de financieros es funcionalmente inalcanzable más allá de la primera pantalla, y **el proyecto no pasa el chequeo de tipos**. `bun run build` sí termina con éxito (exit 0) porque Vite no ejecuta `tsc`, lo que deja el error latente e invisible en el flujo de trabajo actual.

**CRI-3 — Solo existe 1 de los 2 pares de hash duplicado exigidos, y el comentario del código afirma lo contrario**
_Ubicación:_ `src/mocks/evidencias.ts:29-35`.
_Descripción:_ El comentario de la línea 29 declara _"Dos pares de hash duplicado a propósito (idx 5/9 y 12/20)"_. **El índice 5 nunca se genera.** Los índices se calculan como `idx = i * 3 + j`, pero `j` solo recorre 3 valores cuando `i % 3 === 0` y 2 en el resto (línea 16), de modo que la secuencia real salta valores: 0, 1, 2, 3, 4, **6**, 7, **9**, 10, 11, 12… Verificado replicando la lógica de generación: existen `idx` 9, 12 y 20, pero no el 5. Resultado: el hash `d41d8cd9…` aparece una sola vez y **no es un duplicado**. Solo el par 12/20 funciona.
_Impacto:_ La alerta de hash duplicado del panel de revisión —una de sus funciones distintivas, con comparación lado a lado— tendrá **un solo caso de prueba en lugar de dos**. No se podrá evaluar visualmente el comportamiento con múltiples grupos de duplicados, ni verificar que los filtros de "solo duplicados" funcionan sobre más de un grupo. Agravante: el comentario afirma algo falso, así que quien construya el panel confiará en tener dos pares y no lo comprobará.

### Mayores

**MAY-1 — El día asignado se contradice entre el padrón y los participantes en 22 de 32 alumnos**
_Ubicación:_ `src/mocks/alumnosPadron.ts:60` (`dia: ((i % 3) + 1)`) frente a `src/mocks/participantes.ts:17-48` (día literal por fila). Ambos archivos generan la misma matrícula con la misma fórmula (`A${2100045 + i * 7}`, líneas 56 y 108 respectivamente), por lo que los 32 primeros registros describen a las mismas personas.
_Descripción:_ Verificado por conteo: **22 de los 32 alumnos compartidos tienen un día distinto en cada archivo.** Ejemplos: `A2100052` es día 2 en el padrón y día 1 como participante; `A2100059` es día 3 en el padrón y día 1 como participante.
_Impacto:_ Es un defecto observable de extremo a extremo. El flujo público lee el día del padrón (`src/routes/alumno.tsx:59` → `src/routes/mi-dia.tsx:21`), mientras que el portal y el panel de financieros leen el día del participante (`portal.estado.tsx:29`, `financieros.index.tsx:125`). **La misma persona muestra un día y una sede diferentes según la pantalla.** Para una demostración ante interesados, es exactamente el tipo de inconsistencia que erosiona la confianza en todo el prototipo.

**MAY-2 — Las pantallas de error y de 404 están en inglés**
_Ubicación:_ `src/routes/__root.tsx:24, 26, 33, 52, 55, 65, 71`.
_Descripción:_ Textos literales: "Page not found", "The page you're looking for doesn't exist or has been moved.", "Go home", "This page didn't load", "Something went wrong on our end. You can try refreshing or head back home.", "Try again". La especificación exigió **todo en español de México**, y además pidió expresamente mensajes de error concretos, no "Ocurrió un error"; "Something went wrong on our end" es precisamente eso, en otro idioma.
_Impacto:_ Multiplicado por CRI-1: es la pantalla que más verá quien revise el prototipo, porque 21 enlaces del índice desembocan en ella. Son las dos únicas pantallas del proyecto que no están en español, y son las que más se van a mostrar.

**MAY-3 — Atajos de teclado anunciados en pantalla pero no implementados**
_Ubicación:_ `src/routes/financieros.index.tsx:82-86`.
_Descripción:_ La interfaz muestra "Enter buscar · Esc limpiar · F2 escanear". No hay ningún `onKeyDown` ni `addEventListener` en el archivo; solo Enter funciona, por el envío nativo del `<form>`. Esc y F2 no hacen nada.
_Impacto:_ La especificación fijó como requisito de este panel la velocidad de atención con fila de gente esperando, y pidió explícitamente "atajos de teclado visibles". Se cumplió la parte visible y no la funcional. Un operador que confíe en el cartel perderá tiempo en cada participante.

### Menores

**MEN-1 — La línea de tiempo del portal omite el nodo "Pagado" y no distingue tres estados**
_Ubicación:_ `src/routes/portal.estado.tsx:24-25`.
_Descripción:_ `indiceDe()` devuelve 3 para `pagado`, 1 para `comprobante_recibido` y 0 para todo lo demás. El índice 2 ("Pagado") nunca es el nodo actual, y `discrepancia`, `expirado` y `cancelado` se pintan igual que `pre_registrado`.
_Impacto:_ Un participante en discrepancia ve una línea de tiempo que sugiere que apenas se pre-registró. Los badges inferiores corrigen la impresión, así que la información no se pierde, pero el elemento más visible de la pantalla comunica un estado equivocado.

**MEN-2 — El campo de correo se transforma a mayúsculas mientras se escribe**
_Ubicación:_ `src/routes/registro.tsx:47-48`.
_Descripción:_ El manejador `set` aplica `.toUpperCase()` a **todos** los campos, incluido el correo. Al enviar se corrige con `.toLowerCase()` (línea 68), así que el dato guardado es correcto, pero el usuario ve su correo en mayúsculas mientras lo captura.
_Impacto:_ Cosmético y confuso. El aviso de "escribe en MAYÚSCULAS" se refiere al nombre, no al correo; aplicarlo al correo contradice la convención universal de direcciones en minúsculas.

**MEN-3 — Los tres casts `as "/"` desactivan la validación de rutas de TanStack Router**
_Ubicación:_ `src/routes/index.tsx:127`, `src/components/layouts.tsx:103`, `src/components/portal-nav.tsx:16`.
_Descripción:_ TanStack Router valida los destinos en tiempo de compilación. `to={r.to as "/"}` fuerza cualquier cadena al tipo de una ruta válida y anula esa verificación.
_Impacto:_ **Es la causa raíz de que CRI-1 pasara inadvertido.** Sin estos casts, los 21 enlaces rotos habrían producido 21 errores de tipo en el primer chequeo. La prueba está en CRI-2: la única navegación que no se casteó (`navigate` en `financieros.index.tsx:50`) sí generó el error.

**MEN-4 — Código muerto: `navAdmin` y `navCaptura`**
_Ubicación:_ `src/components/nav-financieros.tsx:14-29` y `31-40`.
_Descripción:_ Ambas constantes se exportan y ninguna se importa en ningún archivo. Definen la navegación de dos módulos que no existen, con 14 enlaces a rutas inexistentes. Además, el archivo se llama `nav-financieros.tsx` pero contiene la navegación de tres módulos.
_Impacto:_ Bajo hoy. Útil como andamiaje cuando se construyan esos módulos, pero conviene saber que hoy no se ejecuta.

**MEN-5 — 80 errores de formato de Prettier**
_Ubicación:_ Distribuidos en los archivos de `src/routes/` y `src/components/`.
_Descripción:_ `bun run lint` termina con código 1 y reporta **87 problemas: 80 errores y 7 advertencias**. Los 80 errores son en su totalidad de la regla `prettier/prettier` (saltos de línea y ajuste), y los 7 restantes son advertencias de `react-refresh/only-export-components`, mayormente en archivos de `src/components/ui/` generados por shadcn. **No hay ni un solo error de lógica, de hooks o de tipos en el lint.** Los 80 son corregibles automáticamente con `bun run format`.
_Impacto:_ Nulo en funcionamiento. Relevante porque deja el lint en rojo, y un lint que siempre falla deja de servir como señal.

**MEN-6 — El bloque de modo oscuro no cubre los tokens de dominio**
_Ubicación:_ `src/styles.css:152-185`.
_Descripción:_ `.dark` redefine los tokens base y los de shadcn, pero **ninguno** de los 12 tokens de estado de pago, 3 de semáforo ni 6 de perfil.
_Impacto:_ Latente. No hay interruptor de tema, así que hoy no se manifiesta. Si alguien lo añade, todos los badges quedarán ilegibles.

**MEN-7 — El paquete conserva el nombre de la plantilla**
_Ubicación:_ `package.json:2` (`"name": "tanstack_start_ts"`).
_Impacto:_ Cosmético.

### Observaciones que no son defectos

- **No hay lógica duplicada evidente.** Se buscó específicamente: los badges están centralizados en un solo archivo, los layouts en otro (`PantallaPublica`, `PantallaPanel`, `BarraSuperior`, `NavPanel`), el formato de moneda, fecha y latencia en `src/lib/formato.ts`, y el contexto de prototipo en `src/lib/prototipo.tsx`. El único patrón repetido es el bloque `<Alert>` de error de validación en los formularios, y es una repetición razonable de tres o cuatro líneas.
- **No hay ningún `TODO`, `FIXME`, `HACK` ni "Lorem ipsum"** en el código propio. La única coincidencia de la búsqueda fue la palabra "todo" en español dentro de una frase legítima (`confirmar-nombre.tsx:41`, "todo en MAYÚSCULAS").
- **No hay ningún `any` escrito a mano.** Las 16 apariciones están todas en `src/routeTree.gen.ts`, archivo autogenerado por el plugin del enrutador.
- **Ningún componente escrito a mano supera las 300 líneas.** El mayor es `portal.evidencias.tsx` con 235. El único archivo por encima del umbral es `routeTree.gen.ts` (388), autogenerado.
- **El plan de generación confirma que el alcance se truncó, no se malinterpretó.** `.lovable/plan/prototipo-visual-…md:41-49` enumera 8 fases de construcción: 1) sistema de diseño y mocks, 2) índice y componentes compartidos, 3) flujo público, 4) portal, 5) financieros, 6) captura, 7) revisión, 8) administración. Se completaron las fases 1 a 4 y una fracción de la 5. Las fases 6, 7 y 8 nunca se ejecutaron. El plan describe correctamente todo lo que la especificación pedía, incluidos los módulos ausentes: el modelo entendió el encargo y se quedó sin completar la ejecución.

---

## 8. Backlog priorizado

Estimación en tallas: **S** ≈ media jornada · **M** ≈ 1–2 jornadas · **L** ≈ 3–5 jornadas. Suponen una persona con el proyecto ya en marcha.

### Bloque 0 — Sanear la entrega antes de seguir construyendo (medio día en total)

| #   | Tarea                                                                                       | Talla | Depende de | Justificación                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 | Marcar como "no construido" los 21 enlaces rotos del índice, en lugar de enlazarlos (CRI-1) | **S** | —          | Convierte una entrega que aparenta estar completa y falla en una entrega parcial legible. Lo más barato y de mayor efecto de toda la lista |
| 0.2 | Traducir al español el 404 y el límite de error, con textos concretos (MAY-2)               | **S** | —          | Es la pantalla más visible del prototipo hoy                                                                                               |
| 0.3 | Corregir el destino de `financieros.index.tsx:50` para que `tsc --noEmit` pase (CRI-2)      | **S** | —          | Devuelve el chequeo de tipos a verde. Provisionalmente puede quedarse en la misma pantalla hasta que exista la ficha                       |
| 0.4 | Añadir un script `typecheck` (`tsc --noEmit`) a `package.json`                              | **S** | 0.3        | Sin esto, el próximo error de tipos volverá a pasar inadvertido: `build` no typechequea                                                    |
| 0.5 | Ejecutar `bun run format` para dejar el lint en verde (MEN-5)                               | **S** | —          | 80 de 87 problemas se corrigen automáticamente                                                                                             |

### Bloque 1 — Reparar los datos simulados (medio día)

| #   | Tarea                                                                               | Talla | Depende de | Justificación                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ----- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1.1 | Corregir el segundo par de hash duplicado usando un índice que sí se genere (CRI-3) | **S** | —          | **Bloquea la construcción correcta del panel de revisión.** Hacerlo antes de la tarea 4.1, no después          |
| 1.2 | Alinear el día asignado entre `alumnosPadron.ts` y `participantes.ts` (MAY-1)       | **S** | —          | Elimina que la misma persona muestre días distintos según la pantalla. Barato ahora, caro de depurar más tarde |

### Bloque 2 — Completar Servicios Financieros (el módulo de mayor valor pendiente)

| #   | Tarea                                                                                                                                                                                                   | Talla | Depende de | Justificación                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 2.1 | Ficha del participante en `/financieros/ficha`: datos, badge de perfil, indicadores separados de evento y taller, alerta de nombre en revisión                                                          | **M** | 0.3        | Desbloquea el callejón sin salida. La búsqueda ya funciona y ya deja el folio en contexto (`setFolio`) |
| 2.2 | Formulario de registro de pago con **las 4 validaciones** (referencia duplicada bloqueante, monto menor/mayor con nota obligatoria, monto exacto en verde con aviso de QR)                              | **M** | 2.1        | Es el corazón operativo del módulo y la parte con reglas más específicas de la especificación          |
| 2.3 | Implementar los atajos Esc y F2 realmente (MAY-3)                                                                                                                                                       | **S** | 2.1        | Corrige un cartel que hoy miente al operador                                                           |
| 2.4 | Carga masiva por Excel: arrastrar y soltar, plantilla, **vista previa obligatoria** con semáforo por fila, banner de resumen, filtros, aplicar solo válidos, descarga de errores, modal de confirmación | **L** | 2.2        | La pantalla más compleja del módulo. Reutiliza las validaciones de 2.2                                 |
| 2.5 | Vista de conciliación: tarjetas, tabla filtrable, exportación                                                                                                                                           | **M** | 2.2        | Depende de que exista el concepto de pago registrado                                                   |

### Bloque 3 — App de captura de asistencia

| #   | Tarea                                                                                                            | Talla | Depende de | Justificación                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ---------------------------------------------------------------------------------------------- |
| 3.1 | Configuración de sesión (día, modo, punto de captura)                                                            | **S** | —          | Sin dependencias; los tokens de semáforo ya existen                                            |
| 3.2 | Pantalla de escaneo: cámara simulada, campo alterno, contador, control de modo siempre visible                   | **M** | 3.1        | —                                                                                              |
| 3.3 | **Semáforo a pantalla completa en los 3 colores**, con 2 s de exhibición, opción de mantener, vibración y sonido | **M** | 3.2        | El elemento más distintivo del módulo. Consume los tokens ya definidos en `styles.css:129-131` |
| 3.4 | Indicador de conexión con el interruptor oculto de desarrollo                                                    | **S** | 3.2        | El interruptor es lo que hace evaluable el modo sin conexión                                   |
| 3.5 | Modo taller (lista con casillas, búsqueda, contador) e historial con deshacer                                    | **M** | 3.2        | —                                                                                              |

### Bloque 4 — Revisión de evidencias

| #   | Tarea                                                                                                | Talla | Depende de   | Justificación                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ----- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| 4.1 | Visor con zoom, panel lateral, aprobar/rechazar, **atajos funcionales** A/R/←/→/Z, avance automático | **M** | **1.1**      | Los 75 registros ya existen. La prioridad del módulo es el ritmo, así que los atajos son requisito, no adorno |
| 4.2 | Alerta de hash duplicado con comparación lado a lado                                                 | **S** | 4.1, **1.1** | `evidenciasDuplicadas()` ya está escrito (`evidencias.ts:42-46`). **Sin 1.1 solo habrá un caso de prueba**    |
| 4.3 | Contador de progreso con barra, filtros y modal de rechazo con motivos obligatorios                  | **M** | 4.1          | —                                                                                                             |
| 4.4 | Panel lateral de criterios de aprobación                                                             | **S** | 4.1          | —                                                                                                             |

### Bloque 5 — Administración y verificación pública

| #   | Tarea                                                                                                          | Talla | Depende de | Justificación                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Página pública `/verificar/{folio}` con sus 3 estados                                                          | **S** | —          | **Sin dependencias y de alto valor demostrativo.** Es la única pantalla pública que falta; puede adelantarse a todo el bloque 5 |
| 5.2 | Dashboard con indicadores y gráficas                                                                           | **L** | —          | `recharts` ya está declarado. Los datos para el embudo, la ocupación y los perfiles ya existen en los mocks                     |
| 5.3 | Monitoreo en vivo con alertas de anomalías                                                                     | **M** | 5.2        | Comparte componentes de indicador con el dashboard                                                                              |
| 5.4 | Pantallas de tabla: usuarios, soporte, bitácora, reportes                                                      | **M** | —          | Cuatro pantallas de estructura casi idéntica; conviene un componente de tabla filtrable compartido y hacerlas juntas            |
| 5.5 | CRUD de talleres y configuración del evento                                                                    | **M** | —          | `evento.ts` ya modela toda la configuración                                                                                     |
| 5.6 | Importación del padrón con vista previa                                                                        | **S** | **2.4**    | Reutiliza el componente de vista previa con semáforo de la carga masiva. Hacerla después, no antes                              |
| 5.7 | Emisión de constancias: elegibles, vista previa, individual y masiva con modal, bloqueo por nombre en revisión | **M** | 5.4        | Los 7 participantes con `nombreEnRevision: true` sirven para probar el bloqueo                                                  |

### Bloque 6 — Cierre de calidad

| #   | Tarea                                                                    | Talla | Depende de  | Justificación                                                                                                                                              |
| --- | ------------------------------------------------------------------------ | ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Sustituir spinners por skeletons en el flujo público                     | **S** | —           | La especificación pidió skeletons explícitamente. El patrón ya existe en `financieros.index.tsx:89-97`                                                     |
| 6.2 | Corregir la línea de tiempo del portal (MEN-1)                           | **S** | —           | —                                                                                                                                                          |
| 6.3 | Excluir el correo del `toUpperCase()` (MEN-2)                            | **S** | —           | Una línea                                                                                                                                                  |
| 6.4 | Retirar los casts `as "/"` una vez existan todas las rutas (MEN-3)       | **S** | Bloques 2–5 | **Hacerlo al final**: cuando las rutas existan, retirar los casts devuelve la verificación de enlaces en tiempo de compilación y evita que CRI-1 se repita |
| 6.5 | Completar los tokens de estado en el bloque `.dark`, o retirarlo (MEN-6) | **S** | —           | Decidir si habrá modo oscuro. Si no, retirarlo es más honesto que dejarlo a medias                                                                         |
| 6.6 | Verificar contraste AA con herramienta sobre el render                   | **S** | —           | Hoy es NO VERIFICABLE por lectura estática                                                                                                                 |

---

## 9. Recomendación de siguiente paso

**Ejecutar el Bloque 0 completo antes de escribir una sola línea de funcionalidad nueva.** Son cinco tareas de talla S, medio día en conjunto, y cambian la naturaleza del entregable: hoy el prototipo aparenta estar completo y falla en 21 sitios; después estará honestamente al 51 % y será revisable. Mientras eso no ocurra, cualquier revisión con interesados producirá retroalimentación sobre pantallas de error en inglés en lugar de sobre el producto, y cualquier persona que se incorpore perderá tiempo averiguando si los enlaces rotos son defectos o alcance pendiente. La tarea 0.4 —añadir el script `typecheck`— es la que impide que el problema se repita: el error de tipos de CRI-2 lleva ahí desde que se escribió esa línea y nadie lo vio, porque `bun run build` no ejecuta `tsc`.

**Inmediatamente después, el Bloque 1** (dos tareas S, medio día). Corregir los datos simulados ahora cuesta minutos; corregirlos después de construir el panel de revisión sobre la suposición de que hay dos pares de duplicados cuesta rehacer la pantalla. El mismo argumento aplica a la inconsistencia de días: es una línea de código hoy y una sesión de depuración desconcertante dentro de dos semanas, cuando alguien note que el mismo participante aparece en el día 1 en una pantalla y en el día 3 en otra.

**Como primer módulo de construcción, Servicios Financieros (Bloque 2), no la app de captura.** Tres razones concretas. Primera: es el único módulo a medio construir, y dejarlo así mantiene vivo el callejón sin salida —terminarlo elimina un defecto crítico además de añadir alcance—. Segunda: es el módulo con las reglas de negocio más específicas de toda la especificación —las cuatro validaciones de monto y referencia, con su tratamiento visual detallado— y por tanto el que más se beneficia de una revisión temprana con el área usuaria; si esas reglas están mal entendidas, conviene descubrirlo ahora. Tercera: la carga masiva (2.4) produce el componente de vista previa con semáforo que la importación del padrón (5.6) reutiliza, así que construirla primero ahorra trabajo más adelante.

**Una excepción que conviene adelantar:** la página pública `/verificar/{folio}` (tarea 5.1) es de talla S, no depende de nada y es la única pantalla pública que falta. Cabe en cualquier hueco y cierra por completo la superficie de cara al público, que es la parte del prototipo que más gente verá.

**Sobre el stack:** no recomiendo migrar de TanStack Start a React + React Router para cumplir la letra de la especificación. La decisión está documentada y razonada en el plan de generación, todas las rutas son navegables por URL como se exigía, y la migración consumiría esfuerzo que rinde mucho más en los cuatro módulos ausentes. Lo que sí conviene es **decidir explícitamente si el despliegue con servidor SSR es aceptable**, porque el build produce hoy un worker de Cloudflare y no un sitio estático. Si el destino previsto era hosting estático, es mejor saberlo antes de construir el 49 % restante que después.

---

## 10. Registro de cambios

### 05/09/2026 — Bloques 0 y 1 del backlog (saneamiento y datos simulados)

Tanda de reparación. **No se agregó funcionalidad nueva ni se inició ningún módulo faltante.** El objetivo fue eliminar lo que hacía que el prototipo aparentara estar completo sin estarlo, y corregir los datos simulados antes de que otros módulos se construyan encima.

#### Tareas ejecutadas

| #   | Tarea                                          | Estado                |
| --- | ---------------------------------------------- | --------------------- |
| 0.1 | Marcar los enlaces no construidos en el índice | ✅ Hecha              |
| 0.2 | Traducir las pantallas de error al español     | ✅ Hecha              |
| 0.3 | Corregir el destino roto de financieros        | ✅ Hecha              |
| 0.4 | Agregar script `typecheck`                     | ✅ Hecha              |
| 0.5 | Dejar el lint en verde                         | ✅ Hecha              |
| 1.1 | Corregir el segundo par de hash duplicado      | ✅ Hecha y verificada |
| 1.2 | Alinear el día asignado entre mocks            | ✅ Hecha y verificada |

#### Cambios por archivo

| Archivo                            | Cambio                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/mapa-pantallas.ts`        | **Nuevo.** Fuente de verdad única de las 36 pantallas del prototipo, cada una con `estado: "listo"` o `"pendiente"`. Exporta `avance` (contadores derivados), `construidasDe()`, `estadoDeRuta()` y `pantallaPendienteDe()`. Es el archivo que las siguientes tandas deben editar al construir una pantalla                                                                                    |
| `src/routes/index.tsx`             | Reescrito para consumir `mapa-pantallas`. Las entradas pendientes ya no son enlaces: se dibujan atenuadas, con candado, etiqueta **NO CONSTRUIDO** y `aria-disabled`. Cabecera con contador derivado y barra de avance; contador por módulo en cada tarjeta. Se eliminó el cast `as "/"` de este archivo: los destinos ahora se validan en compilación contra el tipo `RutaConstruida`         |
| `src/routes/__root.tsx`            | 404 y límite de error traducidos y reescritos. El 404 consulta `pantallaPendienteDe()` y distingue **«Esta pantalla aún no se construye»** (con el nombre de la pantalla y el avance) de **«Esa dirección no existe en el prototipo»** (con la ruta pedida). El límite de error explica que el fallo fue al dibujar y que no se pierde nada, muestra el mensaje real y ofrece volver al índice |
| `src/routes/financieros.index.tsx` | Se eliminó la navegación a `/financieros/ficha`. Seleccionar un resultado ahora fija el folio en el contexto del prototipo, muestra un aviso emergente y deja una alerta permanente en pantalla. Sin cast de tipo: el error de `tsc` se resolvió quitando el destino inexistente, no silenciándolo                                                                                             |
| `src/components/layouts.tsx`       | `NavPanel` consulta `estadoDeRuta()` y dibuja las entradas pendientes atenuadas y sin clic. Corrige los 3 enlaces muertos que la barra de Servicios Financieros seguía ofreciendo (parte de CRI-2)                                                                                                                                                                                             |
| `src/mocks/evidencias.ts`          | Los pares de hash duplicado se aplican ahora **por posición del arreglo generado**, no por el `idx` interno del generador que salta valores. Comentario corregido: el anterior afirmaba dos pares donde solo existía uno                                                                                                                                                                       |
| `src/mocks/participantes.ts`       | 22 días alineados contra el padrón; 9 `tallerId` reasignados (ver abajo)                                                                                                                                                                                                                                                                                                                       |
| `package.json`                     | Nuevo script `typecheck` que ejecuta `tsc --noEmit`                                                                                                                                                                                                                                                                                                                                            |
| `eslint.config.js`                 | Override documentado para `src/components/ui/**`                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/prototipo.tsx`            | Comentario y `eslint-disable-next-line` documentados sobre `usePrototipo`                                                                                                                                                                                                                                                                                                                      |

#### Verificación

Los tres comandos pasan:

| Comando             | Antes                                              | Ahora                                   |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| `bun run typecheck` | No existía; `tsc --noEmit` fallaba con 1 error     | **exit 0**, sin errores                 |
| `bun run lint`      | exit 1 — 87 problemas (80 errores, 7 advertencias) | **exit 0**, sin errores ni advertencias |
| `bun run build`     | exit 0                                             | **exit 0**                              |

**0.1 — El índice ya no ofrece ningún enlace roto.** Comprobado contra las rutas reales extraídas de `src/routeTree.gen.ts`: de las 36 entradas, las **15 marcadas `listo` corresponden todas a rutas existentes** y las **21 marcadas `pendiente` no son navegables**. Ninguna entrada pendiente corresponde a una ruta ya construida. Los contadores derivados coinciden con el conteo real (15 / 36 / 21). Desglose por módulo: Registro público 9/9 · Portal 5/5 · Servicios Financieros 1/4 · Captura 0/4 · Revisión 0/1 · Administración 0/10 · Verificación pública 0/3. Sumando las barras de navegación de paneles, **quedan 0 enlaces navegables apuntando a rutas inexistentes** en todo el proyecto.

**0.5 — Las 7 advertencias restantes se revisaron una por una.** Las 7 son de la misma regla, `react-refresh/only-export-components`, y ninguna es un defecto: 6 están en `src/components/ui/` (`badge`, `button`, `form`, `navigation-menu`, `sidebar`, `toggle`), código generado por el registro de shadcn que exporta helpers junto a los componentes; corregirlas nos desviaría del registro y rompería futuras actualizaciones con `shadcn add`. La séptima es `usePrototipo` en `src/lib/prototipo.tsx`, co-locado con su proveedor según la convención de React; separarlo exigiría tres archivos y tocar los ~10 sitios que lo importan. Se conservaron ambas con la razón documentada: un override acotado en `eslint.config.js` para el directorio de shadcn y un `eslint-disable-next-line` comentado en `prototipo.tsx`. La regla sigue activa en el resto del código.

**1.1 — Resultado real de `evidenciasDuplicadas()` tras la corrección:** devuelve **2 grupos, de 2 evidencias cada uno**, y los dos miembros de cada par son alumnos distintos:

```
Par 1 — hash d41d8cd98f00b204e9800998ecf8427e
    EV-0003 | A2100045 | JUAN CARLOS PEREZ MUÑOZ      | día 3 | rechazada
    EV-0010 | A2100066 | ANA SOFIA GUTIERREZ SOLIS    | día 1 | aprobada

Par 2 — hash 9e107d9d372bb6826bd81d3542a419d6
    EV-0014 | A2100073 | DIEGO ARMANDO CASTILLO RUIZ  | día 2 | aprobada
    EV-0025 | A2100101 | RICARDO ALONSO TREVIÑO CANTU | día 1 | pendiente
```

El total de evidencias sigue en 75 y los 4 estados conservan cobertura (pendiente 19, aprobada 18, rechazada 19, no entregada 19).

**1.2 — Se alinearon 22 registros.** De los 32 alumnos presentes en ambos mocks, 22 tenían un día distinto; los 32 quedaron alineados con `alumnosPadron.ts` como fuente de verdad. Verificación programática: **0 discrepancias**. La distribución por día quedó en 20 / 20 / 20 y la sede sigue siendo coherente con el día en los 60 participantes.

**Regresión detectada y corregida dentro de la misma tarea.** Los datos originales cumplían un invariante no documentado: el taller de cada participante se impartía en su día asignado. Cambiar los días lo rompió para 9 participantes. Se reasignó el `tallerId` de esos 9 a un taller que sí se imparte en su nuevo día, conservando el costo en 8 de los 9 casos:

| Folio     | Participante                    | Día | Taller anterior | Taller nuevo          |
| --------- | ------------------------------- | --- | --------------- | --------------------- |
| PRE-00803 | LUIS ANGEL NUÑEZ RAMIREZ        | 3   | T07 (día 1)     | T11 — mismo costo     |
| PRE-00809 | RICARDO ALONSO TREVIÑO CANTU    | 3   | T01 (días 1,2)  | T05 — mismo costo     |
| PRE-00811 | FERNANDO JAVIER AGUILAR MOTA    | 2   | T02 (día 1)     | T04 — mismo costo     |
| PRE-00813 | MIGUEL ANGEL BARRERA LUNA       | 1   | T03 (días 2,3)  | T10 — costo 400 → 350 |
| PRE-00818 | XIMENA GUADALUPE FLORES QUEZADA | 3   | T04 (días 1,2)  | T08 — mismo costo     |
| PRE-00821 | SERGIO ANTONIO MENDOZA IBARRA   | 3   | T10 (días 1,2)  | T05 — mismo costo     |
| PRE-00823 | HECTOR MANUEL CAMPOS ARELLANO   | 2   | T05 (día 3)     | T10 — mismo costo     |
| PRE-00825 | JORGE LUIS SANTIAGO BECERRA     | 1   | T09 (día 3)     | T02 — mismo costo     |
| PRE-00829 | ALEXIS GERARDO NAVARRO PONCE    | 2   | T11 (día 3)     | T06 — mismo costo     |

El costo solo pudo cambiar en PRE-00813 porque T03 es el único taller de $400 y no se imparte el día 1. Comprobado tras el ajuste: **0 participantes con taller fuera de su día**, y `montoEsperadoTaller` coincide con el costo del taller en los 34 casos con taller.

#### Indicadores que se movieron

| Indicador                                   | Antes                                          | Ahora                                    |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Enlaces navegables rotos en el prototipo    | 21 en el índice + 3 en la barra de financieros | **0**                                    |
| `bun run typecheck`                         | Inexistente; `tsc` fallaba con 1 error         | **exit 0**                               |
| `bun run lint`                              | exit 1 — 80 errores, 7 advertencias            | **exit 0** — 0 y 0                       |
| Pares de hash duplicado reales              | 1 de 2                                         | **2 de 2**                               |
| Discrepancias de día padrón ↔ participantes | 22 de 32                                       | **0 de 32**                              |
| Pantallas en inglés                         | 2 (404 y límite de error)                      | **0**                                    |
| Datos simulados                             | 🟢 93 %                                        | **🟢 100 %** (7 de 7 archivos conformes) |
| Navegación y entrega                        | 🟡 83 %                                        | **🟢 100 %** (3 de 3 elementos)          |

**Defectos cerrados:** CRI-1, CRI-2, CRI-3, MAY-1, MAY-2, MEN-5. **MEN-3 cerrado parcialmente:** el cast `as "/"` desapareció de `src/routes/index.tsx`, pero sigue en `src/components/layouts.tsx` y `src/components/portal-nav.tsx` (tarea 6.4).

**El avance global no se movió: sigue en 51 % (72 de 140 elementos).** Esta tanda fue de reparación, no de construcción: los tres elementos que ganó Navegación y entrega se compensan con que ninguna pantalla nueva se implementó. El semáforo de los módulos ausentes (Captura, Revisión, Administración) permanece en 🔴 0 %.

#### Defectos nuevos detectados y NO corregidos

Se anotan sin corregir, conforme a la regla de no mezclar saneamiento con mejoras.

1. **8 alumnos del padrón no tienen registro en `participantes.ts`.** `alumnosPadron.ts` tiene 40 alumnos y `participantes.ts` solo cubre los primeros 32. Las matrículas `A2100269`, `A2100276`, `A2100283`, `A2100290`, `A2100297`, `A2100304`, `A2100311` y `A2100318` (BRENDA JAZMIN CARRILLO OSUNA, IVAN ALEJANDRO PEÑALOZA GARZA, MELISSA ARACELI CORTES YAÑEZ, GUSTAVO ADOLFO LIMON BALDERAS, ARIADNA SOFIA MUÑOZ CASTAÑEDA, LEONARDO DANIEL BAUTISTA REYES, ANDREA CAROLINA VAZQUEZ NIÑO y JOAQUIN EMILIO SERNA PLASCENCIA) sí pasan la identificación en `/alumno`, pero no existen como participantes. _Impacto:_ quien pruebe el flujo con una de esas 8 matrículas avanza correctamente hasta `/mi-dia`, y a partir de ahí el prototipo muestra los datos del participante por defecto. Talla S.

2. **`cupoOcupado` de los talleres es decorativo: no guarda relación con cuántos participantes tienen ese taller.** T01 aparece como CUPO LLENO (30/30) con 1 participante asignado, mientras T05 (25/25, también lleno) tiene 5. Es un modelado preexistente, no introducido por esta tanda —el catálogo usa `cupoOcupado` solo para pintar los estados de tarjeta—, pero será un problema cuando el panel de administración muestre la "ocupación de los 11 talleres" y el número no cuadre con los participantes. Talla S.

3. **`src/routes/portal.evidencias.tsx:56` inventa las horas de entrada y salida.** Devuelve `"8:34"` y `"13:47"` escritas a mano en lugar de leer `asistencias.ts`, que ya contiene entradas y salidas reales por folio, incluidos los casos de cierre automático. _Impacto:_ la tarjeta del día presencial muestra la misma hora para todos los participantes y el caso `cierreAutomatico` no se refleja donde debería. Talla S.

4. **`navAdmin` y `navCaptura` siguen siendo código muerto** (`src/components/nav-financieros.tsx`). Ya no ofrecen enlaces rotos —heredan el tratamiento atenuado de `NavPanel`— pero ningún archivo los importa. Se conservan como andamiaje para cuando esos módulos se construyan. Corresponde a MEN-4, sin cambios.

---

### 05/09/2026 — Parte A (cierre de defectos) y Parte B (Servicios Financieros)

Primera tanda que construye alcance nuevo. Se cerraron los cuatro defectos menores de la tanda anterior, se documentaron los invariantes de los mocks en un verificador ejecutable, y se construyó el módulo de Servicios Financieros completo.

#### Resultado de los cuatro comandos

| Comando                   | Resultado                                     |
| ------------------------- | --------------------------------------------- |
| `bun run verificar-mocks` | **exit 0** — todos los invariantes se cumplen |
| `bun run typecheck`       | **exit 0**                                    |
| `bun run lint`            | **exit 0** — 0 errores, 0 advertencias        |
| `bun run build`           | **exit 0**                                    |

#### Parte A — Cierre de defectos

**A.1 — Alumnos del padrón sin participante.** El defecto no era el silencio de la interfaz sino la incoherencia de fondo: 40 alumnos en el padrón contra 32 en participantes. Se rebalanceó la composición de los 60 participantes a **40 alumnos + 12 docentes + 8 externos**, de modo que los 40 del padrón tienen su registro y no queda ninguno huérfano. Se respetan los dos volúmenes que la especificación fija (60 participantes, 40 en padrón). En `participantes.ts` la matrícula, el correo, el programa y el día de cada alumno **se leen del padrón**, no se vuelven a escribir: Servicios Escolares es la fuente de verdad y la desviación ya no puede reaparecer. Se agregó `getParticipantePorMatricula()`.

Efecto colateral atendido: al reordenarse los participantes cambiaron los folios, y tres casos de `casosSoporte.ts` quedaron apuntando a otra persona. Se reasignaron los seis casos a folios cuyo nombre y estado corresponden con la narrativa del caso (el de «depósito por monto menor» ahora apunta a alguien realmente en discrepancia, y el de «no recibió su QR» a alguien realmente pagado). El invariante que lo detecta quedó en el verificador.

**A.2 — `cupoOcupado` decorativo.** Ninguna de las dos salidas puras servía: derivar el cupo del conteo real dejaría todos los talleres casi vacíos y perdería los casos visuales exigidos, y ajustar las asignaciones exigiría 30 participantes en un solo taller. Se optó por el modelo intermedio, que además es el realista: el evento espera entre 2,100 y 2,500 asistentes, así que los 60 del prototipo son una muestra.

- `src/mocks/talleres-base.ts` (nuevo) guarda los datos fijos con `ocupadosPrevios`, las personas inscritas **fuera** del conjunto simulado.
- `src/mocks/talleres.ts` pasó a ser una vista derivada: `cupoOcupado = ocupadosPrevios + participantes con ese tallerId`. Ya no hay ningún número escrito a mano que los datos puedan desmentir.
- La separación en dos archivos evita el ciclo de importación: `participantes.ts` lee el costo de `talleres-base.ts`, y `talleres.ts` lee de ambos.
- Los tres casos visuales se conservan, ahora verificados: **T01 y T05 con cupo lleno**, y **T02, T06 y T10 con exactamente 2 lugares**.

**A.3 — Horas inventadas en el portal.** `portal.evidencias.tsx` ya no escribe `"8:34"` y `"13:47"`: lee `asistencias.ts` filtrando por folio y día. Se distinguen ahora cuatro situaciones donde antes había dos: entrada y salida escaneadas (ambas en verde), **salida por cierre automático** (en color de advertencia, con la etiqueta explícita y una nota que explica que el sistema la cerró al terminar el horario), sin registro de salida, y sin registro de entrada.

**A.4 — Barras de navegación sin uso.** Se **retiraron** `navAdmin` y `navCaptura`. Justificación: declaraban 14 destinos de módulos inexistentes, duplicando la lista que desde la tanda anterior vive en `src/lib/mapa-pantallas.ts`. Dos listas de lo mismo se desincronizan; una sola no. Cuando esos módulos se construyan, su barra se arma como la de financieros y `NavPanel` ya atenúa solo lo que siga pendiente. Queda un comentario en el archivo explicando el porqué.

**A.5 — Invariantes documentados y ejecutables.** `src/mocks/verificar.ts` (nuevo) comprueba **19 familias de invariantes** y `scripts/verificar-mocks.ts` lo expone como `bun run verificar-mocks`, con salida distinta de cero si algo falla:

| Invariante                                                                | Qué comprueba                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `volumen`                                                                 | 60 participantes, 40 en padrón, 11 talleres, ~80 evidencias                          |
| `padron-sin-participante`                                                 | Todo alumno del padrón tiene participante                                            |
| `dia-vs-padron`, `nombre-vs-padron`, `correo-vs-padron`                   | El padrón manda sobre el participante                                                |
| `alumno-sin-matricula`                                                    | Ningún alumno sin matrícula                                                          |
| `sede-vs-dia`                                                             | La sede corresponde al día (Teatro Victoria el día 3)                                |
| `taller-vs-dia`                                                           | **El taller se imparte el día del participante** — la regla que se rompió sin querer |
| `taller-inexistente`, `monto-taller`                                      | El `tallerId` existe y el monto esperado es su costo                                 |
| `cupo-ocupado`, `cupo-excedido`                                           | `cupoOcupado` = previos + inscritos, y no rebasa el total                            |
| `caso-cupo-lleno`, `caso-dos-lugares`, `caso-pocos-lugares`               | Los tres casos visuales del catálogo siguen existiendo                               |
| `cobertura-pago-evento`, `cobertura-pago-taller`                          | Los 6 estados de pago, en evento y en taller                                         |
| `cobertura-evidencia`, `cobertura-roles`, `cobertura-soporte`             | Los 4 estados de evidencia, los 5 roles, los 3 estados de caso                       |
| `hash-duplicado`                                                          | Dos pares, de dos evidencias, de alumnos distintos                                   |
| `enie`, `acentos`, `mayusculas`                                           | Ñ conservada, sin acentos, en mayúsculas                                             |
| `cierre-automatico`, `asistencia-vs-dia`, `asistencia-huerfana`           | Asistencias coherentes con su participante                                           |
| `evidencia-huerfana`, `caso-huerfano`, `caso-nombre`, `bitacora-huerfana` | Nada apunta a folios inexistentes                                                    |
| `folio-duplicado`                                                         | Folios únicos                                                                        |

Estado actual de los datos tras los cambios: 60 participantes (40/12/8), 27 pagados, los 6 estados cubiertos en evento y taller, 84 evidencias en los 4 estados, 2 pares de hash duplicado, 55 asistencias con 5 cierres automáticos, 13 nombres con Ñ.

#### Parte B — Panel de Servicios Financieros

| Archivo                                   | Contenido                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/pagos-logica.ts`                 | **Nuevo.** Lógica pura sin React: `diagnosticarPago()` con las cuatro validaciones, `parsearMonto()`, `referenciaValida()`, `buscarReferenciaEn()` y `pagosIniciales()`. Separada del proveedor para poder comprobarla sin montar componentes |
| `src/lib/pagos.tsx`                       | **Nuevo.** `PagosProvider` con el estado en memoria de los pagos registrados, sembrado con 43 pagos que los mocks ya dan por hechos. Expone `estadoDe()`, que superpone los pagos de la sesión sobre el estado del mock                       |
| `src/lib/carga-masiva.ts`                 | **Nuevo.** Lectura y análisis del archivo, también puro: `analizarArchivo()` devuelve el diagnóstico fila por fila y **no registra nada**                                                                                                     |
| `src/routes/financieros.ficha.tsx`        | **Nuevo.** B.1 y B.2                                                                                                                                                                                                                          |
| `src/routes/financieros.carga-masiva.tsx` | **Nuevo.** B.3                                                                                                                                                                                                                                |
| `src/routes/financieros.conciliacion.tsx` | **Nuevo.** B.4                                                                                                                                                                                                                                |
| `src/routes/financieros.index.tsx`        | Reconectado: el clic en un resultado vuelve a navegar a la ficha; se retiró el aviso provisional                                                                                                                                              |
| `public/ejemplos/*.csv`                   | **Nuevos.** Dos archivos de prueba generados a partir de folios y referencias reales de los mocks                                                                                                                                             |

**B.1 — Ficha.** Nombre, folio, matrícula, correo, badge de perfil, día y sede, taller con ponente, horario, lugar y costo, y alerta destacada cuando el nombre está en revisión. Los **indicadores de evento y taller son independientes** y reflejan los pagos de la sesión. El **total esperado lo calcula y muestra el sistema** en tipografía grande: quien atiende no decide cuánto debía pagar cada quien.

**B.2 — Registro de pago.** Un bloque por concepto, con monto, referencia, fecha y captura de foto del voucher con vista previa. Las validaciones **se evalúan en cada tecla, no al enviar**. La de referencia duplicada compara **contra todos los pagos registrados**, no solo los del participante en pantalla, y **gana sobre cualquier aviso de monto**: es el control que impide registrar dos veces el mismo voucher.

**B.3 — Carga masiva.** Zona de arrastrar y soltar, plantilla descargable, columnas visibles, vista previa obligatoria con semáforo por fila, banner de resumen, filtros por resultado, «Aplicar solo los válidos», descarga del archivo de errores y modal de confirmación final. Las referencias repetidas **dentro del propio archivo** también se marcan en rojo.

**B.4 — Conciliación.** Seis tarjetas —total recaudado, evento, talleres, pagos en discrepancia, referencias duplicadas y pre-registros por vencer—, todas calculadas de los pagos registrados. Tabla filtrable por texto y por estado, y exportación a CSV de lo que esté filtrado.

**Desviación menor de la especificación, para no agregar dependencias.** El README dice «carga masiva por Excel». El prototipo lee **CSV**, que Excel abre y exporta sin conversión, y trae su propio lector (`partirLinea`, con soporte de comillas). Leer `.xlsx` habría exigido una dependencia como `xlsx`, que la instrucción de no agregar dependencias desaconseja. Está dicho en la propia pantalla.

#### Verificación de las validaciones de pago

Probadas contra `diagnosticarPago()` con los 43 pagos sembrados. La referencia usada para el caso duplicado es **`REF482910`, registrada con el folio `PRE-00801`**, y el monto esperado del evento es $650.

| Caso                   | Entrada                      | Resultado                                                                                             |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Referencia duplicada   | `REF482910` + $650           | `duplicada` — «Esa referencia bancaria ya fue registrada con el folio PRE-00801.» Botón deshabilitado |
| Monto menor            | `REF900500` + $600           | `menor` — advertencia, nota obligatoria, permite continuar como discrepancia                          |
| Monto mayor            | `REF900501` + $700           | `mayor` — advertencia, nota obligatoria, permite continuar como discrepancia                          |
| Monto exacto           | `REF900502` + $650           | `exacto` — confirmación en verde, pasa a pagado, avisa QR generado y correo enviado                   |
| Referencia mal formada | `AB`                         | `invalido` — bloquea                                                                                  |
| Monto no numérico      | `seiscientos`                | `invalido` — bloquea                                                                                  |
| Precedencia            | `REF482910` + monto exacto   | `duplicada` — el bloqueo gana sobre la confirmación                                                   |
| Detección en caliente  | referencia recién registrada | `duplicada` en el siguiente intento                                                                   |

Además se comprobó que el mensaje **nombra el folio en conflicto**, como exige el README.

#### Verificación de la carga masiva

Con los dos archivos de ejemplo, contra los 43 pagos sembrados:

- `pagos-validos.csv` — 15 filas, **15 listas, 0 advertencias, 0 errores**.
- `pagos-mixtos.csv` — 11 filas: **4 listas, 3 advertencias, 4 errores**, cubriendo folio inexistente (`PRE-99999`), referencia duplicada (`REF482910`, ya del folio `PRE-00801`), monto con formato inválido (`seiscientos`) y concepto inválido (`inscripcion`), más advertencias de monto menor, monto mayor y taller.

**Nada se aplica antes de confirmar**, comprobado programáticamente: tras analizar ambos archivos, la lista de pagos **seguía teniendo los mismos 43 registros** y ninguno había cambiado de estado. Ninguna fila en rojo lleva pago aplicable, «Aplicar solo los válidos» toma exactamente listos + advertencias (7 de 11), las listas entran como `pagado` y las advertencias como `discrepancia`. Un archivo sin las columnas requeridas se rechaza nombrando cuáles faltan.

#### Avance

| Indicador                      | Antes                      | Ahora                                             |
| ------------------------------ | -------------------------- | ------------------------------------------------- |
| Pantallas construidas          | 15 de 36                   | **18 de 36**                                      |
| Servicios Financieros          | 🔴 17 % (1 de 4 pantallas) | **🟢 100 %** (4 de 4)                             |
| Datos simulados                | 🟢 100 %                   | 🟢 100 %, ahora **verificados en cada ejecución** |
| Elementos de la especificación | 72 de 140 (51 %)           | **90 de 140 (64 %)**                              |
| Enlaces navegables rotos       | 0                          | **0**                                             |

Los 18 elementos ganados son los 21 del módulo de financieros menos los 3,5 que ya estaban, redondeando el medio punto de los atajos de teclado, que siguen sin implementarse (MAY-3 sigue abierto: Esc y F2 se anuncian y no responden).

**Defectos cerrados:** los cuatro de la tanda anterior. Sigue abierto **MAY-3** (atajos de teclado anunciados sin implementar en la búsqueda) y **MEN-3 parcial** (el cast `as "/"` persiste en `layouts.tsx` y `portal-nav.tsx`).

#### Defectos nuevos detectados y NO corregidos

1. **`estadoDe()` solo lo consumen las pantallas de financieros.** El portal del participante, el comprobante y el selector de prueba siguen leyendo el estado directamente de `participantes.ts`, así que un pago registrado en ventanilla **no se refleja** en el portal de esa misma persona dentro de la sesión. Para el prototipo es aceptable —cada módulo se evalúa por separado—, pero en cuanto exista la app de captura o el panel de administración conviene mover la superposición de estado al contexto compartido. Talla M.
2. **La carga masiva no verifica cupo real de taller.** La advertencia por «taller sin cupo» que pide el README solo se dispara si el taller ya está sobrecupo (`cupoOcupado > cupoTotal`), situación que hoy no ocurre porque `verificar-mocks` la prohíbe. Un archivo que inscriba a alguien en un taller lleno pasa en verde. Falta decidir si la carga masiva puede sobrepasar el cupo. Talla S.
3. **`asistencias.ts` sigue derivando de `estadoPagoEvento` del mock.** Al registrar pagos nuevos en ventanilla, esas personas pasan a pagado pero no aparecen asistencias para ellas. Es coherente —todavía no han asistido— pero conviene tenerlo presente cuando se construya el monitoreo en vivo. Talla S.
4. **El campo de fecha del depósito usa `<input type="date">`**, que muestra el formato del sistema operativo y no el `DD/MM/AAAA` que la especificación fija para toda la aplicación. La carga masiva sí exige `DD/MM/AAAA`. Talla S.

---

### 05/09/2026 — Parte A (estado unificado) y Parte B (App de captura de asistencia)

Se unificó el estado del evento en un contexto compartido y se construyó el módulo de captura completo. Es la primera tanda en la que tres módulos se tocan entre sí dentro de una misma sesión.

#### Resultado de los cuatro comandos

| Comando                   | Resultado                                     |
| ------------------------- | --------------------------------------------- |
| `bun run verificar-mocks` | **exit 0** — todos los invariantes se cumplen |
| `bun run typecheck`       | **exit 0**                                    |
| `bun run lint`            | **exit 0** — 0 errores, 0 advertencias        |
| `bun run build`           | **exit 0**                                    |

#### Parte A — Estado unificado

`src/lib/pagos.tsx` desapareció y en su lugar está **`src/lib/estado-evento.tsx`**, que guarda pagos y asistencias juntos. La razón es la que señalaba el encargo: el semáforo del escáner se decide con el estado de pago, así que si la app de captura leyera `participantes.ts`, alguien que acaba de pagar en ventanilla saldría en rojo en la puerta y la cadena que el prototipo debe demostrar se rompería justo en la unión entre módulos.

La regla de superposición se extrajo como función pura, **`estadoDePagos()`** en `pagos-logica.ts`, para que el proveedor no la duplique y para poder verificarla sin montar componentes.

**Quince archivos consumen ahora el contexto.** Comprobado que **ninguna pantalla lee `p.estadoPagoEvento`, `p.estadoPagoTaller` ni `@/mocks/asistencias` directamente**: todas pasan por `estadoDe()` y `asistenciasDe()`.

| Pantalla                | Qué cambió                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `portal.estado.tsx`     | La línea de tiempo y los dos indicadores usan `estadoDe()`                                                   |
| `portal.qr.tsx`         | El QR aparece según el estado de la sesión, no el del mock                                                   |
| `portal.constancia.tsx` | El requisito de entrada y salida **se comprueba contra las asistencias reales** en vez de deducirse del pago |
| `portal.evidencias.tsx` | Las tarjetas leen `asistenciasDe()`: un escaneo en la puerta se refleja sin recargar                         |
| `financieros.index.tsx` | Los badges de resultados reflejan pagos de la sesión                                                         |
| `selector-prueba.tsx`   | Igual, para que el selector no contradiga a las pantallas                                                    |

**A.2 — MAY-3 cerrado.** Los atajos `Esc` (limpia la búsqueda y devuelve el foco) y `F2` (abre el escáner de QR) están implementados con un listener de teclado en `financieros.index.tsx`. Ya no hay carteles que mientan.

#### Parte B — App de captura

| Archivo                            | Contenido                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/escaneo.ts`               | **Nuevo.** Reglas del semáforo, puras. `evaluarEscaneo()` recibe el instante como parámetro en vez de leer el reloj, para poder comprobar la ventana de 15 minutos sin esperar 15 minutos |
| `src/lib/retro.ts`                 | **Nuevo.** Vibración y sonido por color. El audio se sintetiza con la Web Audio API: sin dependencias, sin archivos y funciona sin conexión                                               |
| `src/components/captura-shell.tsx` | **Nuevo.** Barra de conexión, selector de modo siempre visible y marco de las pantallas                                                                                                   |
| `src/routes/captura.index.tsx`     | **Nuevo.** B.1 y el disparador manual del cierre                                                                                                                                          |
| `src/routes/captura.escaneo.tsx`   | **Nuevo.** B.2, B.3 y B.4                                                                                                                                                                 |
| `src/routes/captura.taller.tsx`    | **Nuevo.** B.6                                                                                                                                                                            |
| `src/routes/captura.historial.tsx` | **Nuevo.** B.7                                                                                                                                                                            |
| `src/mocks/tipos.ts`               | `Asistencia` acepta `ts` opcional: la marca de tiempo que necesita la ventana de reingreso                                                                                                |

**B.1** — Selectores grandes de día, modo, punto y capturista. El modo se cambia también desde el escáner, con `SelectorModo` siempre visible arriba de la cámara.

**B.2** — Cámara simulada a pantalla completa, campo alterno en monoespaciada para teclear folio o matrícula, y contador de escaneos sobre la propia cámara. **Sin latencia simulada a propósito**: en la puerta la respuesta es inmediata.

Como la cámara es simulada, hay un panel de casos de prueba. **Los casos no están escritos a mano: se calculan pasando cada participante por `evaluarEscaneo()`** y quedándose con el primero de cada resultado distinto. Así la etiqueta siempre coincide con lo que pasa al pulsarla, incluso cuando los datos cambian. Esto corrigió un error propio: la primera versión listaba «Verde — pagado, día correcto», pero en los mocks **todo pagado ya tiene entrada del día** (porque `asistencias.ts` deriva de los pagados), así que ese botón habría dado AMARILLO «YA REGISTRADO».

**B.3** — Semáforo a pantalla completa, con el nombre en `text-3xl`/`text-5xl`, el badge de perfil reutilizado y el veredicto en `text-4xl`/`text-6xl`. En rojo, «PASAR A MESA DE INCIDENCIAS» va aún más grande. Se cierra solo a los 2 segundos y al tocar la pantalla queda retenido.

Vibración y sonido distintos por color: verde un pulso corto y agudo (880 Hz), amarillo dos pulsos medios (620 Hz), rojo un zumbido grave de onda cuadrada (200 y 160 Hz) con vibración larga.

**B.4** — Las tres reglas de negocio están en `escaneo.ts`, en este orden de precedencia: primero lo que impide el paso (rojo), después la duplicación de registro (amarillo que no registra) y al final la discrepancia de pago (amarillo que **sí** registra, porque a esa persona se le deja entrar avisando).

**B.5** — Barra permanente **EN LÍNEA** / **SIN CONEXIÓN — N pendientes** en las cuatro pantallas, con botón de desarrollo para alternar. Sin conexión los escaneos van a una cola que no cuenta como registrada; al reconectar se sincronizan y las marcas «Pendiente» del historial desaparecen. La cola **sí** cuenta para no duplicar registros mientras está pendiente.

**B.6** — Pase de lista por taller con selector, búsqueda y contador. Marcar una casilla **llama al mismo `escanear()`** que el escáner: las reglas de negocio son las mismas, solo cambia cómo se disparan.

**B.7** — Historial de la sesión, del más reciente al más antiguo, con color, hora, modo, punto, veredicto, si generó registro y si está pendiente de sincronizar. «Deshacer el último» retira el registro de la lista y de la cola.

#### Verificación del recorrido completo

Ejecutado con las funciones reales del código (`pagosIniciales`, `diagnosticarPago`, `estadoDePagos`, `evaluarEscaneo`, `asistenciaDe`) sobre una réplica del contexto. Sujeto: **`PRE-00803` LUIS ANGEL NUÑEZ RAMIREZ, día 3, estado inicial `comprobante_recibido`**.

| Paso                        | Resultado real                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0. Antes de pagar, escaneo  | **ROJO — SIN PAGAR**, no registra. El portal no mostraría QR (`estadoDe → comprobante_recibido`)       |
| 1. Ventanilla, monto exacto | `diagnosticarPago → exacto`                                                                            |
| 2. Portal                   | `estadoDe(...).evento === "pagado"` → **el QR aparece**                                                |
| 3. Escaneo de entrada       | **VERDE — ENTRADA REGISTRADA**, registra                                                               |
| 4. Portal                   | **1 entrada del día 3**, con el punto «Puerta A» y el capturista «MARIO CANTU» de la sesión de captura |

La cadena funciona de extremo a extremo dentro de una sola sesión.

#### Casos con los que se probó cada color

| Color       | Caso concreto                                                               | Resultado                                                                                 |
| ----------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 🟢 Verde    | `PRE-00806` ALEJANDRA MORENO ZAVALA, modo SALIDA (tiene entrada, no salida) | SALIDA REGISTRADA, registra                                                               |
| 🟢 Verde    | `PRE-00803` tras pagar en ventanilla, modo ENTRADA                          | ENTRADA REGISTRADA, registra                                                              |
| 🟡 Amarillo | `PRE-00801` ya tiene entrada del día                                        | YA REGISTRADO · «Déjalo pasar. No se registra otra vez.»                                  |
| 🟡 Amarillo | `PRE-00807` con discrepancia de pago                                        | DISCREPANCIA DE PAGO · registra · «Déjalo pasar y pídele acudir a Servicios Financieros.» |
| 🟡 Amarillo | Reingreso dentro de la ventana                                              | REINGRESO · no registra                                                                   |
| 🔴 Rojo     | `PRE-00805` en `pre_registrado`                                             | SIN PAGAR · «PASAR A MESA DE INCIDENCIAS»                                                 |
| 🔴 Rojo     | `PRE-00802` es del día 2, escaneado el día 1                                | DÍA EQUIVOCADO · `autorizable = true`                                                     |
| 🔴 Rojo     | `PRE-00000`                                                                 | FOLIO INVÁLIDO · «No existe ningún registro con «PRE-00000».»                             |

Y la autorización de supervisor sobre el día equivocado: el mismo `PRE-00802` con `autorizado = true` pasa a **ENTRADA REGISTRADA** y sí registra.

#### Ventana de reingreso de 15 minutos

Verificada inyectando el instante, sobre `PRE-00806` en modo SALIDA del día 3:

| Momento    | Resultado                                                                               | ¿Registra? |
| ---------- | --------------------------------------------------------------------------------------- | ---------- |
| t = 0 min  | SALIDA REGISTRADA (verde)                                                               | Sí         |
| t = 5 min  | REINGRESO (amarillo) — «Ya registró salida hace 5 minutos, dentro de la ventana de 15.» | No         |
| t = 14 min | REINGRESO (amarillo)                                                                    | No         |
| t = 15 min | YA REGISTRADO (amarillo) — fuera de la ventana, pero tampoco duplica                    | No         |

**Tras cuatro escaneos hay una sola salida registrada, no cuatro.** El límite se comporta exactamente en el minuto 15.

#### Cierre automático

`ejecutarCierreAutomatico(dia)` busca a quien tiene entrada y no salida ese día y le agrega una salida con `cierreAutomatico: true`, a la hora de cierre del evento y con capturista «SISTEMA». Se dispara desde la configuración de sesión, detrás de un modal de confirmación.

Estado de los datos al momento de verificar:

| Día | Con entrada | Con salida | Recibirían cierre                             |
| --- | ----------- | ---------- | --------------------------------------------- |
| 1   | 10          | 10         | 0                                             |
| 2   | 9           | 6          | **3** — `PRE-00814`, `PRE-00832`, `PRE-00851` |
| 3   | 8           | 5          | **3** — `PRE-00806`, `PRE-00824`, `PRE-00843` |

Seis casos disponibles para evaluarlo. El tratamiento visual **se reutiliza**: `portal.evidencias.tsx` ya distinguía el cierre automático de una salida escaneada, y esas salidas nuevas caen en el mismo camino.

#### Avance

| Indicador                      | Antes            | Ahora                                               |
| ------------------------------ | ---------------- | --------------------------------------------------- |
| Pantallas construidas          | 18 de 36         | **22 de 36**                                        |
| App de captura                 | 🔴 0 %           | **🟢 100 %** (4 de 4 pantallas, 16 de 16 elementos) |
| Elementos de la especificación | 90 de 140 (64 %) | **107 de 140 (76 %)**                               |
| Enlaces navegables rotos       | 0                | **0**                                               |

Los 17 elementos ganados son los 16 de la app de captura más el medio punto de los atajos de teclado (MAY-3), redondeado.

**Defectos cerrados:** MAY-3 y el primero de los cuatro anotados en la tanda anterior (el estado ya no está aislado en financieros). Sigue abierto **MEN-3 parcial**: el cast `as "/"` persiste en `layouts.tsx` y `portal-nav.tsx`.

#### Defectos nuevos detectados y NO corregidos

1. **Todo participante pagado ya tiene entrada del día en los mocks.** `asistencias.ts` deriva de los pagados, así que en modo ENTRADA el escáner casi siempre responde «YA REGISTRADO» y el verde limpio solo se consigue en modo SALIDA o con alguien que acaba de pagar. El panel de casos de prueba lo compensa mostrando siempre lo que va a ocurrir de verdad, pero para evaluar la puerta sería mejor que una parte de los pagados llegara sin entrada previa. Talla S, es un ajuste de datos.
2. **La cola sin conexión no sobrevive a la recarga.** Es coherente con la regla de que todo el estado vive en memoria, pero contradice la idea que la pantalla comunica: un modo sin conexión que pierde lo pendiente al recargar no es lo que el capturista esperaría. Resolverlo bien exige `localStorage`, que va más allá del alcance de solo interfaz. Conviene decidirlo explícitamente. Talla S.
3. **La autorización de supervisor no queda persistida como dato.** La nota se captura, se exige un mínimo de 10 caracteres y el escaneo se registra, pero la nota no se guarda en la asistencia: solo vive en el historial de la sesión como el veredicto verde. Falta un campo en `Asistencia` para el motivo de la excepción. Talla S.
4. **`portal.constancia.tsx` volvió más estricto el requisito de asistencia.** Ahora exige entrada **y** salida reales del día asignado, en vez de deducirlo del pago. Es más correcto, pero significa que varios participantes que antes aparecían como elegibles ya no lo son hasta que se ejecute el cierre automático del día. No es un defecto, es un cambio de comportamiento que conviene tener presente al revisar esa pantalla.
5. **El modo taller marca asistencia pero no la desmarca.** Una casilla marcada por error solo se puede revertir desde el historial de la sesión, que está en otra pantalla. En un pase de lista de 30 personas conviene poder desmarcar en el sitio. Talla S.

---

### 05/09/2026 — Parte A (correcciones) y Parte B (Panel de revisión de evidencias)

Cuarta tanda. Se corrigieron los cuatro defectos abiertos y se construyó el panel de revisión, el penúltimo módulo pendiente.

#### Resultado de los cuatro comandos

| Comando                   | Resultado                                                    |
| ------------------------- | ------------------------------------------------------------ |
| `bun run verificar-mocks` | **exit 0** — todos los invariantes, incluido el nuevo de A.1 |
| `bun run typecheck`       | **exit 0**                                                   |
| `bun run lint`            | **exit 0** — 0 errores, 0 advertencias                       |
| `bun run build`           | **exit 0**                                                   |

Las tres suites de tandas anteriores (captura, validaciones de pago, carga masiva) siguen pasando: sin regresiones.

#### Parte A — Correcciones

**A.1 — Sesgo de asistencias corregido.** `asistencias.ts` ya no da entrada a todos los pagados: uno de cada tres llega sin registro. No es un hueco, es el caso normal de la puerta.

| Día | Pagados | Con entrada | **Sin entrada (verde)** | Sin salida (cierre) |
| --- | ------- | ----------- | ----------------------- | ------------------- |
| 1   | 10      | 6           | **4**                   | 3                   |
| 2   | 9       | 6           | **3**                   | 3                   |
| 3   | 8       | 6           | **2**                   | 2                   |

Nueve casos verdes disponibles y ocho de cierre automático repartidos en los tres días, más que los seis que había antes. Las marcas `cierreAutomatico` preexistentes pasaron de 2 a 5 al ajustar la regla.

**El invariante que lo protege** es `pagados-sin-entrada` en `verificar.ts`: exige al menos **2 pagados sin entrada por día**, y falla nombrando el día si una tanda futura vuelve a dejar el escáner sin casos verdes. Va acompañado de `cierre-automatico-sin-casos`, que exige al menos una persona con entrada y sin salida por día. El resumen del verificador ahora imprime `pagadosSinEntradaPorDia`, así que el dato es visible en cada ejecución sin tener que buscarlo.

**A.2 — Cola sin conexión persistida.** Nuevo `src/lib/cola-pendientes.ts`, la **única** excepción a que el estado viva en memoria. Toda lectura y escritura está protegida: `localStorage` puede no existir (renderizado en servidor), estar bloqueado por el navegador, contener basura de una versión anterior o estar lleno; en cualquiera de esos casos la cola se comporta como vacía y la pantalla sigue funcionando. La lectura valida la forma de cada registro y **descarta lo que no encaje en vez de propagar datos corruptos**.

**A.3 — Autorización de supervisor persistida.** `Asistencia` gana un campo `autorizacion` con `nota`, `autorizadoPor` y `en`. Ya no vive solo en el historial de sesión: viaja con la asistencia, que es lo que corresponde a un registro de auditoría. El historial de captura lo muestra destacado.

**A.4 — Desmarcar en el pase de lista.** La fila del taller ahora alterna: tocar una casilla marcada la desmarca, con `aria-pressed` y la etiqueta «Desmarcar» visible. Se apoya en `quitarAsistencia()`, nuevo en el contexto compartido.

#### Parte B — Panel de revisión de evidencias

| Archivo                     | Contenido                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/revision.ts`       | **Nuevo.** Reparto de la cola, agrupación de duplicados, filtros, progreso, los seis motivos, el mapeo de teclas y el texto de criterios. Todo puro, sin React |
| `src/routes/revision.tsx`   | **Nuevo.** La pantalla completa                                                                                                                                |
| `src/lib/estado-evento.tsx` | Gana `evidencias` (con las decisiones aplicadas), `revisiones`, `revisarEvidencia()` y `deshacerRevision()`                                                    |

**B.1** — Imagen a pantalla completa con zoom de 50 % a 300 % en pasos de 25 %, y panel lateral con nombre, matrícula, folio, día, hora de subida, estado, intentos usados, revisor asignado e identificador de imagen.

**B.2** — Botones de aprobar y rechazar de 64 px de alto con la tecla impresa dentro. Los cinco atajos están extraídos a `accionDeTecla()`, una función pura, precisamente para poder comprobarlos uno por uno en vez de confiar en que estén bien. La función devuelve `null` cuando el foco está en un campo o hay un modal abierto: secuestrar el teclado mientras alguien escribe un motivo sería peor que no tener atajos.

**B.3** — Cuando el hash coincide, el visor **se sustituye** por la comparación lado a lado: las dos imágenes, los datos de ambos alumnos, sus estados y el identificador compartido, todo sobre fondo de alerta. No hay que ir a buscarlo.

**B.4** — Contador `«62 de 84 revisadas»` con barra y porcentaje, y cuatro filtros: día, estado, revisor asignado y solo duplicados, este último con el número de grupos en la propia etiqueta.

**B.5** — Selector de revisor que reparte la cola. Sin autenticación real, el reparto se calcula del id de la evidencia: es determinista, así que cada revisor ve siempre su mismo lote y **dos personas nunca reciben la misma imagen**, sin necesidad de coordinarse. La barra muestra cuántas evidencias tiene el lote de quien está revisando.

**B.6** — Modal con los seis motivos del README como radios. El botón de confirmar está deshabilitado mientras no haya motivo, y «Otro» exige al menos 5 caracteres de texto.

**B.7** — Enlace permanente en la barra superior que abre un panel lateral con los criterios, redactados en tres bloques —cuándo se aprueba, cuándo se rechaza, qué hacer ante la duda— derivados de los seis motivos de rechazo, para que criterio y motivo hablen del mismo hecho.

#### Verificaciones

**La cola sin conexión sobrevive a la recarga.** Comprobado con un `localStorage` simulado: se guardan dos escaneos, se descarta todo lo que hay en memoria —lo que hace una recarga— y `leerCola()` **recupera los dos, con folio e id intactos**. Al sincronizar, la cola se vacía y no queda basura guardada. Además: JSON inválido devuelve `[]` sin lanzar; un arreglo con un registro deforme y uno válido conserva solo el válido; y sin `localStorage` disponible tanto leer como guardar terminan sin error.

**Los cuatro atajos responden, probados uno por uno** contra `accionDeTecla()`:

| Tecla                       | Acción                               |
| --------------------------- | ------------------------------------ |
| `A` / `A` mayúscula         | `aprobar` — no depende de Bloq Mayús |
| `R`                         | `rechazar`                           |
| `→`                         | `siguiente`                          |
| `←`                         | `anterior`                           |
| `Z`                         | `deshacer`                           |
| Cualquier otra              | `null`                               |
| `A` con el foco en un campo | `null`                               |
| `R` con el modal abierto    | `null`                               |

**La comparación lado a lado, con los dos pares reales:**

```
Par 1 — hash d41d8cd98f00b204e9800998ecf8427e
   EV-0003 | A2100045 | JUAN CARLOS PEREZ MUÑOZ     | día 3 | 16/10/2025 11:12
   EV-0010 | A2100066 | ANA SOFIA GUTIERREZ SOLIS   | día 1 | 14/10/2025 11:19

Par 2 — hash 9e107d9d372bb6826bd81d3542a419d6
   EV-0016 | A2100080 | ALEJANDRA MORENO ZAVALA     | día 1 | 14/10/2025 10:25
   EV-0028 | A2100108 | PAOLA MICHELLE HERRERA VEGA | día 1 | 14/10/2025 15:37
```

En ambos casos `gemelasDe()` devuelve exactamente la otra evidencia, son alumnos distintos, y el filtro «solo duplicados» devuelve las 4. El par 2 es especialmente ilustrativo: mismo día, subidas con cinco horas de diferencia.

**Un rechazo sin motivo no se puede confirmar.** La condición del botón se comprobó en sus cinco combinaciones: sin motivo → bloqueado; «Otro» sin texto → bloqueado; «Otro» con 3 caracteres → bloqueado; «Otro» con texto suficiente → permitido; motivo de la lista → permitido.

**Una decisión se refleja en el portal en la misma sesión.** Sobre `EV-0001` de `PRE-00801` JUAN CARLOS PEREZ MUÑOZ: el portal ve «pendiente»; tras aprobar ve **«aprobada»** con el revisor que decidió y sin motivo; tras rechazar ve **«rechazada»** con el motivo «Imagen ilegible o muy oscura» visible para el alumno; tras deshacer vuelve a «pendiente». Decidir una evidencia **no altera ninguna de las otras 83**, y el contador de progreso pasa de 62 a 63.

**El reparto de la cola no se solapa.** Los lotes suman las 84 evidencias sin perder ninguna, ningún par de revisores comparte evidencia y el reparto es determinista: ANA LAURA VIDAL CASTRO 40, PEDRO SEGOVIA MUÑOZ 44.

#### Avance

| Indicador                      | Antes             | Ahora                             |
| ------------------------------ | ----------------- | --------------------------------- |
| Pantallas construidas          | 22 de 36          | **23 de 36**                      |
| Revisión de evidencias         | 🔴 0 %            | **🟢 100 %** (13 de 13 elementos) |
| Elementos de la especificación | 107 de 140 (76 %) | **120 de 140 (86 %)**             |
| Enlaces navegables rotos       | 0                 | **0**                             |

**Defectos cerrados:** los cuatro anotados en la tanda anterior. Sigue abierto **MEN-3 parcial**: el cast `as "/"` persiste en `layouts.tsx` y `portal-nav.tsx` (tarea 6.4, conviene hacerla cuando existan todas las rutas).

Queda un solo módulo: **Administración y verificación pública**, 18 elementos.

#### Defectos nuevos detectados y NO corregidos

1. **La cola de revisión reparte por evidencia, no por lote contiguo.** El reparto por hash del id es determinista y no se solapa, pero mezcla días y alumnos dentro del lote de cada revisor. En un panel real convendría repartir por bloques —por día o por rango de matrícula— para que el revisor gane contexto y no salte entre días a cada imagen. Talla S.
2. **El día 3 tiene solo 4 evidencias.** `evidencias.ts` da tres días a uno de cada diez alumnos y dos al resto, así que casi todas caen en los días 1 y 2. Filtrar por día 3 deja una cola muy corta y poco representativa. Talla S, es un ajuste de datos.
3. **El progreso cuenta sobre las 84 evidencias del prototipo, no sobre las ~5,000 del enunciado.** Es correcto respecto a los datos, pero el contador no transmite la escala que la pantalla dice atender. Convendría decidir si el prototipo simula el volumen real o declara explícitamente que trabaja sobre una muestra. Talla S.
4. **Al deshacer una decisión, la cola filtrada se reordena bajo el cursor.** Con el filtro en «Pendientes», deshacer devuelve la evidencia a la cola y el índice puede quedar apuntando a otra imagen. No se pierde nada y el aviso dice qué se deshizo, pero el salto desconcierta a ritmo alto. Talla S.
5. **`portal.evidencias.tsx` no muestra quién revisó ni cuándo.** El dato ya existe en el contexto tras la revisión, pero la tarjeta del alumno solo muestra estado y motivo. Añadirlo cerraría el círculo de trazabilidad. Talla S.

---

### 05/09/2026 — Parte A (correcciones), B (dashboard y monitoreo), C (constancias) y D (verificación pública)

Quinta tanda. Se cerraron cuatro de los cinco defectos abiertos y se construyó la mitad visible del módulo de administración. Queda la mitad de gestión para la tanda siguiente.

#### Resultado de los cuatro comandos

| Comando                   | Resultado                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| `bun run verificar-mocks` | **exit 0** — 24 familias de invariantes, con los nuevos de A.2 y de anomalías |
| `bun run typecheck`       | **exit 0**                                                                    |
| `bun run lint`            | **exit 0** — 0 errores, 0 advertencias                                        |
| `bun run build`           | **exit 0**                                                                    |

Las siete suites de tandas anteriores siguen pasando: sin regresiones.

#### Parte A — Correcciones

**A.1 — Reparto por bloques de día.** `asignacionDeCola()` sustituye al reparto por hash. Dentro de cada día las evidencias se ordenan y se cortan en tramos contiguos, uno por revisor. Comprobado: **cada día produce exactamente 2 tramos** para 2 revisores, es decir cada quien recibe un bloque seguido en lugar de imágenes salteadas. Sigue siendo determinista y sin solapamiento.

**A.2 — Escasez del día 3, corregida de raíz.** El problema no era solo el reparto: `evidencias.ts` asignaba días sin mirar el día presencial del alumno, así que generaba evidencia del día en que la persona sí asistió —que el portal nunca muestra— y dejaba días sin cubrir. Ahora **cada alumno sube evidencia de los dos días en los que no asiste en persona**, que es lo que el modelo pedía desde el principio.

| Día   | Antes | Ahora                                             |
| ----- | ----- | ------------------------------------------------- |
| 1     | 40    | **26**                                            |
| 2     | 40    | **27**                                            |
| 3     | **4** | **27**                                            |
| Total | 84    | **80** — justo las «unas 80» de la especificación |

**Invariantes que lo protegen:** `evidencias-por-dia` exige un mínimo de 15 por día y falla nombrando el día; `evidencia-en-dia-presencial` impide que vuelva a generarse evidencia del día en que el alumno asistió. El resumen imprime `evidenciasPorDia`.

**A.3 — Escala real en el contador.** El progreso sigue contando sobre los datos reales, sin falsearlos, y añade debajo la equivalencia: «Muestra del prototipo · al mismo ritmo serían N de 4,847 del evento». La constante `VOLUMEN_ESTIMADO_EVENTO` vive en `revision.ts`.

**A.4 — Cursor estable al deshacer.** Al revertir una decisión se guarda el id revertido y un efecto reposiciona el cursor sobre esa evidencia en cuanto la cola se recalcula. El aviso lo dice: «Vuelves a verla en pantalla».

**A.5 — Revisor y fecha en el portal.** La tarjeta del alumno muestra ahora «Revisada por NOMBRE el DD/MM/AAAA HH:mm», tomando el revisor de la evidencia y la fecha de la decisión de sesión.

#### Parte B — Dashboard y monitoreo

| Archivo                          | Contenido                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/monitoreo.ts`           | **Nuevo.** Métricas de puerta y las dos detecciones de anomalía, puras |
| `src/components/nav-admin.tsx`   | **Nuevo.** Barra derivada de `mapa-pantallas.ts`, no escrita a mano    |
| `src/routes/admin.index.tsx`     | **Nuevo.** B.1                                                         |
| `src/routes/admin.monitoreo.tsx` | **Nuevo.** B.2                                                         |

**B.1** — Arriba van las dos preguntas de cada mañana: cuánta gente falta por pagar y cuánta por entrar. Debajo, las seis vistas que pide la especificación: pre-registros por perfil (dona) y por día (barras apiladas), embudo acumulado con la fuga entre etapas, asistencia por día contra los que pagaron, avance de revisión y constancias emitidas contra elegibles, más la ocupación de los 11 talleres con su barra. Se usó **recharts, que ya estaba en el proyecto**; no se agregó ninguna dependencia.

**B.2** — Escaneado contra esperado, ritmo por minuto, proyección de cuánto falta al ritmo actual —con aviso explícito de abrir otro punto si se pasa de la hora—, desglose por punto de captura con sus capturistas, y el panel de alertas con el detalle desplegable de los registros implicados.

#### Parte C — Constancias

`src/lib/constancias.ts` (nuevo) concentra elegibilidad, bloqueo y normalización del nombre; `src/routes/admin.constancias.tsx` es la pantalla.

**C.1** — Cada participante muestra sus requisitos con marca de cumplido, y **para los no elegibles, qué le falta y cómo se resuelve**. La constancia de taller aparece como bloque aparte con sus propios requisitos. El cierre automático cuenta como salida válida, comprobado.

**C.2** — Vista previa del documento con el QR de verificación, emisión individual y masiva con modal que dice cuántas se generarán y cuántas quedan fuera por retención.

#### Parte D — Verificación pública

`/verificar/$folio` con los tres estados. **Solo expone nombre, tipo de constancia, evento y fecha de emisión**: ni matrícula, ni correo, ni día asignado, ni estado de pago. Un verificador no necesita —ni debe ver— los datos personales del titular para confirmar que el documento existe. La página lo dice al pie.

#### Verificaciones

**Los indicadores se mueven en la misma sesión**, comprobado con las funciones reales sobre una réplica del contexto:

| Acción                          | Efecto                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| Registrar un pago en ventanilla | Embudo: pagados **27 → 28**                                                |
| Escanear una entrada            | Asistencia del día 1: **6 → 7**                                            |
| Aprobar una evidencia           | Avance de revisión: **60 → 61**                                            |
| Cualquiera de las tres          | La elegibilidad se recalcula sobre el estado de sesión, no sobre los mocks |

**Las dos alertas de anomalía, con sus casos:**

- **Ráfaga** — «8 registros en 2 minutos»: JOSUE PALOMO registró 8 asistencias entre las 9:40 y las 9:41 del día 1, en Registro Taller. Son las 8 personas del grupo de taller del día 1, gente real inscrita; lo anómalo es el ritmo.
- **Horario improbable** — «3 escaneos en horario improbable»: LETICIA BAÑOS registró a las 5:12, 6:41 y 22:03 del día 2, fuera de la ventana de 8:00 a 14:00.

Ambos casos quedaron sembrados en `asistencias.ts` y protegidos por los invariantes `anomalia-rafaga` y `anomalia-horario`, que fallan si una tanda futura los borra.

**Elegibles por perfil:**

| Perfil  | Total | Elegibles | Retenidos por nombre |
| ------- | ----- | --------- | -------------------- |
| Alumno  | 40    | **4**     | 1                    |
| Docente | 12    | **2**     | 1                    |
| Externo | 8     | **2**     | 0                    |
| Taller  | —     | **5**     | —                    |

**Un ejemplo de cada motivo de no elegibilidad:**

- `PRE-00803` LUIS ANGEL NUÑEZ RAMIREZ — falta _pago registrado como pagado_: «Su pago está en comprobante_recibido. Debe entregar el voucher en Servicios Financieros.»
- `PRE-00801` JUAN CARLOS PEREZ MUÑOZ — falta _entrada y salida del día 1_: «Revisa la captura de asistencia o ejecuta el cierre automático del día.»
- `PRE-00806` ALEJANDRA MORENO ZAVALA — falta _2 evidencias aprobadas_: «Lleva 0 de 2 evidencias aprobadas.»

**La emisión se bloquea con nombre en revisión.** De los 7 participantes con `nombreEnRevision`, **2 quedan bloqueados** por tener un caso de soporte sin resolver:

- `PRE-00808` KARLA PATRICIA MEDINA ROJAS — caso CS-001 (abierto)
- **`PRE-00843` ARTURO MARTIN GALVAN REYNA — caso CS-004 (abierto), y cumple todos los requisitos.** Es el caso que importa: sería elegible y aun así no se emite, que es exactamente para lo que existe el campo desde el pre-registro.

Los otros 5 con nombre en revisión pero con el caso resuelto **no** se bloquean: el bloqueo exige un caso vivo, no la marca sola.

**La Ñ se conserva en el nombre impreso.** `nombreConstancia()` aparta la Ñ con un marcador de uso privado antes de descomponer los acentos, porque en Unicode la Ñ es una N con tilde y una normalización ingenua la degradaría. Comprobado sobre los **13 nombres con Ñ de los mocks: los 13 la conservan, ninguno degrada a N y ninguno conserva tildes**. Casos probados: `María Fernanda López Peña → MARIA FERNANDA LOPEZ PEÑA`, `NÚÑEZ RAMÍREZ → NUÑEZ RAMIREZ`.

**Los tres estados de la verificación pública:**

| Estado        | Folio de ejemplo                          | Qué muestra                                                                         |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Válida        | `CONS-E00802` (MARIA FERNANDA LOPEZ PEÑA) | Nombre, tipo, evento, fecha de emisión, y «Este documento es auténtico»             |
| Anulada       | `CONS-E00801`                             | Los mismos datos más el aviso de que no acredita participación y a dónde reportarlo |
| No encontrada | `CONS-99999`                              | Sin datos. Explica el formato del folio y a dónde escribir                          |

Los tres están enlazados desde el índice. El folio de taller se distingue del de evento: `CONS-T00802` frente a `CONS-E00802`.

#### Avance

| Indicador                      | Antes             | Ahora                           |
| ------------------------------ | ----------------- | ------------------------------- |
| Pantallas construidas          | 23 de 36          | **29 de 36**                    |
| Administración                 | 🔴 0 %            | **🟡 30 %** (3 de 10 pantallas) |
| Verificación pública           | 🔴 0 %            | **🟢 100 %** (3 de 3 estados)   |
| Elementos de la especificación | 120 de 140 (86 %) | **131 de 140 (94 %)**           |
| Enlaces navegables rotos       | 0                 | **0**                           |

**Defectos cerrados:** A.1 a A.5 salvo el reparto por bloques, que se implementó. Sigue abierto **MEN-3 parcial**: el cast `as "/"` en `layouts.tsx` y `portal-nav.tsx`.

Quedan las 7 pantallas de gestión: CRUD de talleres, configuración, importación de padrón, usuarios, soporte, bitácora y reportes.

#### Defectos nuevos detectados y NO corregidos

1. **El requisito de constancia era inalcanzable y hubo que rehacer la distribución de estados.** Con el generador anterior, los estados de evidencia se ciclaban por índice y **ningún alumno podía tener sus dos evidencias aprobadas**: la lista de elegibles salía vacía para el perfil más numeroso. Se corrigió ligando la aprobación al pago, y se añadió el invariante `constancia-inalcanzable`. Se anota porque revela un riesgo general: los requisitos compuestos sobre datos generados por ciclos pueden ser imposibles sin que nadie lo note.
2. **Solo 8 de 60 participantes son elegibles.** Es coherente con los datos —pocos tienen pago, asistencia completa y evidencias a la vez— pero deja la pantalla de constancias con una lista corta. Para evaluarla mejor convendría que una parte mayor de los pagados tuviera asistencia completa. Talla S, ajuste de datos.
3. **El dashboard fija el día 1 en la tarjeta «Faltan por entrar hoy».** No hay reloj de evento, así que no puede saber qué día es. Convendría un selector de día como el de monitoreo, o derivarlo de la fecha del sistema. Talla S.
4. **La página de verificación reconoce constancias no emitidas.** Para que los tres estados se puedan ver sin emitir nada primero, cualquier folio con forma `CONS-E<folio de un pagado>` se da por válido aunque nadie lo haya emitido en el módulo. Es una concesión al prototipo, pero significa que «válida» no equivale a «emitida». Convendría restringirlo a lo realmente emitido y sembrar un par de constancias previas en los mocks. Talla S.
5. **`anularConstancia()` está en el contexto pero ninguna pantalla la usa.** El estado anulado se muestra con un folio de ejemplo. Falta la acción de anular desde el módulo de constancias. Talla S.
6. **El ritmo por minuto sale muy bajo (0.3/min) porque los datos simulados reparten las entradas en 40 minutos.** El cálculo es correcto pero la cifra no transmite la urgencia real de 700 personas en una hora. Convendría concentrar las horas de entrada de los mocks. Talla S.

---

### 05/09/2026 — Cambio de alcance, correcciones y pantallas de gestión (última tanda de construcción)

Con esta tanda el prototipo queda completo respecto al alcance vigente: **33 de 33 pantallas**.

#### Resultado de los cuatro comandos

| Comando                   | Resultado                               |
| ------------------------- | --------------------------------------- |
| `bun run verificar-mocks` | **exit 0** — 24 familias de invariantes |
| `bun run typecheck`       | **exit 0**                              |
| `bun run lint`            | **exit 0** — 0 errores, 0 advertencias  |
| `bun run build`           | **exit 0**                              |

Las ocho suites de tandas anteriores siguen pasando.

#### Cambio de alcance: el sistema no genera constancias

Calcula quién es elegible y entrega el listado a quien elabora los documentos. Lo retirado se **eliminó del código**, no se dejó desconectado:

| Retirado                                                            | Dónde estaba                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Página pública de verificación con sus tres estados                 | `src/routes/verificar.$folio.tsx` — **archivo eliminado**               |
| Emisión individual y masiva, vista previa del documento, folio y QR | `src/routes/admin.constancias.tsx` — **archivo eliminado**              |
| `folioConstancia()` y el tipo del documento                         | `src/lib/constancias.ts` → **renombrado a `src/lib/elegibilidad.ts`**   |
| Estado de constancias emitidas y `anularConstancia()`               | `src/lib/estado-evento.tsx`                                             |
| Módulo «Verificación pública» y ruta `/verificar/$folio`            | `src/lib/mapa-pantallas.ts`                                             |
| Descarga de constancia del portal                                   | `src/routes/portal.constancia.tsx`, ahora informa si cumple y qué falta |

El `README.md` lleva una nota de cambio de alcance al principio, la sección de administración reescrita, y los **requisitos de elegibilidad escritos por primera vez** —no estaban en ninguna parte—.

**La marca de nombre en revisión cambió de función.** Ya no bloquea una emisión que no existe: señala esos casos en el listado y **viaja en la exportación**, en una columna `nombre_en_revision` con el valor `SI — REVISAR ANTES DE IMPRIMIR`, para que quien elabore los documentos los aparte. `bloqueadaPorNombre()` pasó a llamarse `nombreEnRevisionActivo()`, que es lo que hace.

#### Parte A — Correcciones

**A.1 — Muestra de elegibles ampliada.** Eran 8 de 60. El cuello no estaba en los requisitos sino en los datos: solo 27 de 60 habían pagado, lo que no representa un cierre de evento. Se convirtieron 12 registros a `pagado` —sin tocar los seis folios que citan los casos de soporte, porque su estado sostiene la narrativa del caso— y se ajustó la regla de salida para que la mayoría de quienes entraron tengan el día completo.

|                                | Antes    | Ahora                                    |
| ------------------------------ | -------- | ---------------------------------------- |
| Pagados                        | 27 de 60 | **39 de 60**                             |
| Con entrada y salida completas | 10       | **19**                                   |
| Elegibles                      | 8        | **15** (alumno 11, docente 3, externo 1) |

De los 19 que pagaron y asistieron completo, 15 son elegibles: **la mayoría**, que es lo que pedía el encargo. Los tres motivos de no elegibilidad se conservan, y también un caso con nombre en revisión que además cumple todos los requisitos.

**El invariante que lo protege** es `elegibles-por-perfil`: exige al menos uno por perfil y diez en total, y falla nombrando el perfil. Lo acompaña `marca-nombre-en-revision`, que exige que siempre haya alguien marcado para poder evaluar esa parte del listado. El resumen imprime `elegiblesPorPerfil`.

**A.2 — Reloj de evento configurable.** `src/components/reloj-evento.tsx` permite situarse en un día y una hora simulados; el dashboard y el monitoreo lo consumen. El ritmo por minuto se mide ahora **contra el reloj, no contra el último escaneo**: si nadie ha pasado en diez minutos el ritmo cae, que es justo lo que hay que ver para decidir si se abre otra puerta.

#### Parte B — Listado de elegibles

`src/routes/admin.elegibles.tsx` sustituye a la pantalla de emisión.

**B.2 — El detalle es lo que hace útil la pantalla.** No dice «faltan evidencias»; enumera cuál, de qué día y en qué estado. Un ejemplo real de los datos:

> `PRE-00806` ALEJANDRA MORENO ZAVALA — «Lleva 0 de 2 evidencias aprobadas; la del día 1 no se entregó y la del día 2 sigue pendiente de revisión.»

Y los otros dos motivos, con el mismo nivel:

> `PRE-00801` JUAN CARLOS PEREZ MUÑOZ — «Tiene entrada (8:15) pero no salida del día 1. Ejecuta el cierre automático del día para completarla.»
>
> `PRE-00803` LUIS ANGEL NUÑEZ RAMIREZ — «Su pago está en «comprobante recibido», referencia REF482936. Debe resolverse en Servicios Financieros.»

**B.3 — Exportación.** Tres botones: lo filtrado, solo elegibles, y el listado de talleres por separado. `src/lib/exportar.ts` (nuevo) escribe CSV con **BOM UTF-8** —sin él Excel en Windows abre el archivo como ANSI y convierte MUÑOZ en basura— y encierra los campos con coma, comilla o salto de línea.

#### Parte C — Siete pantallas de gestión

| Archivo                                                         | Pantalla                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/routes/admin.talleres.tsx`                                 | C.1 — CRUD con `cupoOcupado` derivado y advertencia al reducir el cupo por debajo de lo ocupado |
| `src/routes/admin.configuracion.tsx`                            | C.2 — Fechas, sedes, cuotas, banco, límites, WhatsApp y textos legales                          |
| `src/routes/admin.padron.tsx` + `src/lib/padron-importacion.ts` | C.3 — Importación con vista previa obligatoria                                                  |
| `src/routes/admin.usuarios.tsx`                                 | C.4 — Alta, baja y roles, con el detalle de qué concede cada uno                                |
| `src/routes/admin.soporte.tsx`                                  | C.5 — Bandeja filtrable con detalle y cambio de estado                                          |
| `src/routes/admin.bitacora.tsx`                                 | C.6 — Filtros por usuario, acción y rango de fechas                                             |
| `src/routes/admin.reportes.tsx`                                 | C.7 — Seis reportes con tabla y exportación                                                     |
| `src/components/nav-admin.tsx`                                  | Barra derivada de `mapa-pantallas.ts`, no escrita a mano                                        |

El contexto compartido creció para sostenerlas: configuración, catálogo editable, usuarios, casos, padrón, bitácora de sesión y reloj.

#### Verificaciones

**La cadena completa de soporte funciona.** Sujeto: `PRE-00843` ARTURO MARTIN GALVAN REYNA, caso `CS-004`, que **cumple todos los requisitos y aun así aparece marcado**:

| Paso                                        | Resultado                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Antes de resolver                        | El listado lo marca; la exportación dice `SI — REVISAR ANTES DE IMPRIMIR` |
| 2. Se marca CS-004 como resuelto en soporte | **La marca desaparece**                                                   |
| 3. Conteo de marcados                       | Baja de 2 a 1                                                             |
| 4. Exportación                              | La columna `nombre_en_revision` pasa a `NO`                               |
| 5. Si el caso se reabre                     | La marca vuelve                                                           |

El campo `nombreEnRevision` del participante **no cambia**: lo que manda es el caso vivo. Por eso reabrir el caso restaura la marca.

**La Ñ sobrevive a la exportación.** Los 13 nombres con Ñ la conservan tras pasar por `nombreConstancia()` y por `construirCsv()`; ninguna degrada a N. Comprobado también que un campo con coma se encierra (`"MUÑOZ, JUAN"`) y que las comillas internas se duplican.

**La bitácora registra la sesión.** Ocho acciones distintas quedan anotadas con usuario, fecha y detalle: registrar un pago (`PRE-00812 · evento · $650.00 · ref REF900123`), aplicar una carga masiva, aprobar y rechazar evidencias (con el motivo), editar o crear un taller (`T04 — … · cupo 28 · $300.00`), editar la configuración (`cuota 650 → 700`), dar de alta o de baja usuarios, resolver casos (`CS-004 · PRE-00843 · … → resuelto`), importar el padrón y exportar cualquier listado o reporte. La tabla las distingue de las históricas con una columna de origen y las resalta.

**La configuración llega a las pantallas públicas.** `pago.tsx`, `talleres.tsx`, `alumno.tsx`, `confirmar-nombre.tsx` y `comprobante.tsx` dejaron de importar el mock `evento` y leen `configuracion` del contexto. Cambiar la cuota mueve el monto de las instrucciones de pago; cambiar la fecha límite mueve el aviso de apartado del catálogo; cambiar el número de WhatsApp cambia el enlace de soporte. Marcar un taller como inactivo lo retira del catálogo público.

**La importación de padrón no aplica nada antes de confirmar.** Con `padron-mixto.csv`: **3 listos, 3 advertencias, 5 errores**. Tras analizarlo, el padrón **seguía con los mismos 40 alumnos**. Ninguna fila en rojo trae registro aplicable y «Aplicar solo los válidos» toma exactamente 6 de 11. Cubre altas nuevas, actualizaciones, cambio de nombre, matrícula mal formada, nombre en minúsculas, programa vacío, día fuera de rango y matrícula repetida dentro del archivo.

La advertencia que pedía el encargo se dispara con datos reales:

> Fila 4 — `A2100045` JUAN CARLOS PEREZ MUÑOZ: «Cambia de día 1 a 2 y **YA PAGÓ**: hay que avisarle, su taller puede no impartirse ese día.»

El modal de confirmación repite cuántos participantes ya registrados cambiarían de día.

#### Avance final

| Indicador                      | Antes             | Ahora                            |
| ------------------------------ | ----------------- | -------------------------------- |
| Pantallas construidas          | 29 de 36          | **33 de 33** del alcance vigente |
| Administración                 | 🟡 30 %           | **🟢 100 %**                     |
| Elementos de la especificación | 131 de 140 (94 %) | **138,5 de 139 (99 %)**          |
| Invariantes de datos           | 21 familias       | **24 familias**                  |
| Enlaces navegables rotos       | 0                 | **0**                            |

El denominador bajó de 140 a 139: salieron los 8 elementos de emisión y verificación pública, entraron los 7 del listado de elegibles y su exportación.

**MEN-3 sigue abierto:** el cast `as "/"` persiste en `layouts.tsx` y `portal-nav.tsx`. Ahora que todas las rutas existen, retirarlo es la tarea de limpieza pendiente (6.4).

#### Defectos nuevos detectados y NO corregidos

1. **Editar un taller no revalida a los inscritos.** Cambiar los días de un taller puede dejar a participantes inscritos en días que ya no se imparten, y el invariante `taller-vs-dia` solo cubre los mocks, no los cambios de sesión. Convendría advertirlo en el formulario como se hace con el cupo. Talla S.
2. **La importación del padrón no propaga el cambio de día a `participantes`.** Se advierte en la vista previa, pero al aplicar solo se actualiza el padrón: el participante conserva su día anterior, así que padrón y participantes quedan desalineados dentro de la sesión —justo lo que el invariante `dia-vs-padron` prohíbe en los mocks—. Talla M.
3. **La bitácora no registra los escaneos de asistencia.** Registra pagos, revisiones, configuración, usuarios, casos, padrón y exportaciones, pero la app de captura no la usa. Para aclarar una inconformidad sobre una asistencia haría falta. Talla S.
4. **Dar de baja un usuario lo elimina en lugar de desactivarlo.** El formulario tiene un campo «activo» que hace eso mismo de forma reversible; el botón de baja borra el registro. Convendría que la baja solo desactivara. Talla S.
5. **`admin.reportes.tsx` muestra los primeros 200 registros sin paginación.** Se avisa en pantalla y la exportación incluye todo, pero con volúmenes reales haría falta paginar o filtrar. Talla S.
6. **El bloque `.dark` sigue sin cubrir los tokens de dominio** (MEN-6, abierto desde la auditoría). No hay interruptor de tema, así que no se manifiesta; es el 1 % que falta para el 100 %. Talla S.

---

### 06/09/2026 — Cierre de defectos, sistema de diseño y guion de demostración (última tanda)

Tanda sin pantallas nuevas. Cierra los seis defectos abiertos, unifica el sistema
de diseño y deja escrito cómo enseñar el prototipo. El hallazgo de fondo no
estaba en la lista: la palabra «invariante» estaba cubriendo tres cosas
distintas, y eso impedía que el verificador sirviera para lo que esta tanda
necesitaba.

#### Parte A — Los seis defectos

**A.1 · La importación del padrón no propagaba el cambio de día.** Era el más
importante, porque rompía dentro de la sesión el mismo invariante que los datos
de arranque respetan: el padrón decía una cosa y el participante otra.

La causa era estructural, no un olvido. `participantes` se leía directamente del
mock, así que no había forma de cambiar a nadie. Ahora el contexto guarda ajustes
por folio y deriva la lista (`estado-evento.tsx:232`, `:295`), igual que ya hacía
con los cupos de taller: nada se duplica, todo se calcula.

`aplicarPadron` (`:598`) hace ahora tres cosas por cada fila cuyo día cambia:
mueve al participante al día nuevo, mueve su sede con él, y **si su taller no se
imparte ese día, libera la inscripción junto con su estado y monto de pago** —
dejar el pago colgando de un taller al que ya no asiste habría sido cambiar un
desajuste por otro—. Devuelve `{registros, diasCambiados, talleresLiberados}`,
y la pantalla lo dice con nombre y taller (`admin.padron.tsx:162-177`), no con
un número suelto.

Verificado con `MARIA FERNANDA LOPEZ PEÑA` (`PRE-00802`), que ya había pagado:
día 2 → 3, sede a Teatro Victoria, taller `T06` liberado porque solo se imparte
el día 2. Cero violaciones de integridad después. Y la contraprueba, que es lo
que da valor a la comprobación: sin propagar, `dia-vs-padron` sí salta.

**A.2 · Editar un taller no revalidaba a los inscritos.** Mismo problema por el
otro extremo: quitarle un día a un taller dejaba gente inscrita en días que ya
no se imparten. `liberarInscripcionesFueraDeDia(tallerId)` (`:539`) los libera, y
el formulario lo ofrece al guardar (`admin.talleres.tsx:160`) en vez de hacerlo a
espaldas de quien edita. Verificado con `T01`: al quitarle el día 1, cuatro de
sus diez inscritos quedan fuera, `taller-vs-dia` los nombra, y liberar resuelve
exactamente esos cuatro.

**A.3 · La bitácora no registraba los escaneos.** Ahora sí
(`estado-evento.tsx:396`), con folio, resultado, día, punto, la nota de la
autorización de supervisor cuando la hubo, y la marca de pendiente de
sincronizar si se capturó sin conexión. Es la acción más frecuente del sistema y
la que más se cuestiona después; era la única que no dejaba rastro. Escribir la
llamada obligó a mover `registrarBitacora` por encima de `escanear`: estaba
declarada después y se usaba antes.

**A.4 · Dar de baja un usuario lo borraba.** Ahora lo desactiva
(`admin.usuarios.tsx:246`) y el botón cambia a «Reactivar». El diálogo explica
por qué: *«Perderá el acceso, pero el registro se conserva: sus entradas de
bitácora siguen teniendo autor.»* Borrar a quien firmó cien registros deja cien
registros sin firma.

**A.5 · Reportes mostraba 200 filas sin paginación.** Paginado
(`admin.reportes.tsx:224-330`), con el detalle de que **la exportación sigue
llevando el reporte completo**: paginar la vista no debe recortar el archivo.

**A.6 · El cast `as "/"` de MEN-3.** Retirado. Era el último resto de cuando
había rutas que no existían; ahora existen todas y las tipa el router. No queda
ninguno en `src/`.

#### El hallazgo: «invariante» eran tres cosas

Al verificar A.1 aparecieron dos fallos que no eran fallos. Mover a alguien de
día dejaba sus asistencias y su evidencia en el día viejo, y el verificador lo
marcaba como violación. Pero es correcto: **la historia no se reescribe**. Que
alguien entrara el día 2 sigue siendo verdad después de reasignarlo al 3.

Y había un segundo grupo mezclado: reglas como «hay al menos dos pares de hash
duplicado» o «hay elegibles de los tres perfiles» no son integridad, son
propiedades de los datos de ejemplo para que el prototipo se pueda evaluar. Si
alguien cambia un dato en la sesión y deja de haber un caso de cupo lleno, eso no
está roto.

Así que `verificar.ts` distingue ahora tres clases (`:37`):

| Clase | Qué afirma | Si falla |
| --- | --- | --- |
| `integridad` | Debe cumplirse siempre, en arranque y en sesión | Es un error |
| `cobertura` | Los datos de ejemplo tienen los casos que hacen falta para evaluar | Solo importa en los mocks |
| `historico` | Consecuencia legítima de un cambio hecho durante la sesión | Es información |

Y `verificarMocks(datos)` recibe los datos por parámetro (`:134`), con los de
arranque como valor por omisión, para poder **correr sobre el estado de la
sesión**. El dashboard lo usa (`admin.index.tsx:71-85`): las de integridad salen
en rojo, las históricas como aviso ámbar que explica que hay registros en un día
que ya no corresponde. Antes esto habría sido imposible sin dar falsos positivos
en cada importación.

Un invariante hubo que reescribirlo para que funcionara sobre datos arbitrarios:
`cupo-ocupado` comparaba contra `talleres-base` en lugar de mirar los datos que
recibía.

#### Parte B — Sistema de diseño

**B.1 · Modo oscuro y contraste.** Los 18 tokens de dominio —seis de estado de
pago, tres de evidencia, tres de perfil y sus fondos— ya existen en `.dark`
(`styles.css:164`). El contraste no se estimó: se calcula desde los valores
`oklch` del tema, convirtiendo a OKLab, a sRGB lineal, a sRGB y a luminancia
relativa. Resultado real:

| | Claro | Oscuro |
| --- | --- | --- |
| 9 pares de badge | 4,84 – 6,24:1 · todos AA | 6,46 – 8,06:1 · siete AAA |
| Semáforo verde | 6,00:1 AA | **6,00:1 — idéntico** |
| Semáforo amarillo | 10,98:1 AAA | **10,98:1 — idéntico** |
| Semáforo rojo | 7,16:1 AAA | **7,16:1 — idéntico** |

El semáforo tiene sus propios colores de texto (`styles.css:139-144`) y **no se
redefine en oscuro**, a propósito: es la decisión de diseño de esta parte. Un
capturista que aprendió el verde en la mañana no debe encontrarse otro por la
tarde porque alguien cambió el tema del navegador. `--estado-pre` subió de
`oklch(0.55 …)` a `0.48` porque a 0,55 se quedaba en 4,3:1.

**B.2 · Badges centralizados.** `estado-badges.tsx` absorbió los tres que
seguían definidos en las rutas: `SemaforoFilaBadge` (`:152`), `EstadoCasoBadge`
(`:182`) y `PuntoSemaforo` (`:197`). Los seis componentes cubren ahora 5, 2, 9,
2, 1 y 2 rutas respectivamente.

**B.3 · La tarjeta de indicador.** Estaba escrita tres veces con el mismo
marcado y distinto nombre: `Indicador` en el dashboard, `Metrica` en monitoreo y
`Tarjeta` en conciliación. Una sola en `components/indicador.tsx`, con
`tono: "alerta" | "critico"` y `destacada`, usada por las tres. **Tres
definiciones duplicadas retiradas.**

**B.4 · Formatos de fecha.** `isoAFecha` (`formato.ts:36`) convierte lo que
devuelve `<input type="date">` al formato dd/mm/aaaa que usa el resto del
sistema. Solo hacía falta en la ficha de financieros, que es donde se capturan
fechas de depósito.

**Estados vacíos, de carga y de error.** Auditados uno por uno, no de memoria:
**19 de 19** vistas que pintan listas tienen estado vacío, **11 de 11** con
operación asíncrona tienen estado de carga. Tres usan `Skeleton` y seis un
spinner con texto concreto dentro del botón; la distinción es correcta —el
esqueleto es para contenido que llega, el spinner para una acción en curso—.
Nueve tienen mensaje de error concreto, que son las nueve que pueden fallar.

#### Parte C — Guion de demostración

`docs/RECORRIDO-DEMO.md`. El recorrido principal es la cadena completa con un
protagonista elegido porque sirve para recorrerla entera y además lleva Ñ:
**`PRE-00803` LUIS ANGEL NUÑEZ RAMIREZ**, matrícula `A2100059`, día 3, con el
comprobante entregado pero sin validar. Se pre-registra, recibe instrucciones,
financieros le registra el voucher con la referencia libre `REF556677`, aparece
su QR, se le escanea, sube evidencia, se le aprueba y aparece en elegibles.

Además: cuatro recorridos por área, los cinco casos que conviene mostrar —la Ñ,
el bloqueo de `REF482910` por duplicada, el rojo de `PRE-00802` escaneado el día
1, los pares `EV-0004`↔`EV-0011` y `EV-0017`↔`EV-0029`, y `PRE-00843` marcado
por nombre aun cumpliendo todo—, lo que hay que aclarar antes de empezar, las
preguntas que suelen salir y una ficha rápida.

**Todos los folios, nombres y referencias se verificaron por script contra los
datos antes de escribirlos**, incluido que la referencia libre esté libre, que el
protagonista salga verde tras pagar y que exista un caso concreto para cada color
del semáforo. Un guion que nombre un folio inexistente falla en el peor momento.

#### Verificación

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ 24 familias, código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Y las 14 comprobaciones de lógica pura acumuladas en las siete tandas —pagos,
carga masiva, escaneo, revisión, portal, padrón, elegibilidad, propagación,
índice, navegación, nombres, contraste, estados y datos de demostración— pasan
todas.

#### Avance final

| Indicador | Antes | Ahora |
| --- | --- | --- |
| Elementos de la especificación | 138,5 de 139 (99 %) | **139 de 139 (100 %)** |
| Sistema de diseño | 🟢 95 % | **🟢 100 %** |
| Tokens de dominio en `.dark` | 0 | **18** |
| Pares badge/semáforo bajo AA | no medido | **0 de 12, en ambos modos** |
| Definiciones duplicadas de componente | 3 | **0** |
| Defectos abiertos | 6 | **0** |

#### Defectos nuevos detectados y NO corregidos

Ninguno de los seis anteriores queda abierto. De esta tanda salen tres
observaciones menores, anotadas y no corregidas para no ampliar el alcance:

1. **Las asistencias no siguen al participante que cambia de día.** Es
   deliberado —la historia no se reescribe— y el dashboard lo informa como
   aviso, pero no hay forma de cerrar el caso: quien mueve a alguien de día no
   puede anular su entrada del día viejo desde ninguna pantalla. Faltaría una
   acción explícita de corrección de asistencia, con motivo y bitácora. Talla M.
2. **`liberarInscripcionesFueraDeDia` no avisa a quien se quedó sin taller.** El
   participante ve su portal sin taller y sin explicación. Con notificaciones
   reales sería un correo; en el prototipo, al menos una nota en su portal.
   Talla S.
3. **El modo oscuro no tiene interruptor.** Los tokens están completos y medidos,
   pero solo se activa poniendo la clase `.dark` a mano. Añadirlo es trivial;
   queda fuera porque el encargo pedía verificar los colores, no exponer el
   cambio de tema. Talla S.

---

### 07/09/2026 — Corrección de alcance: el padrón no trae correos ni programa

Cambio de datos, no de funcionalidad. Salió de una aclaración sobre lo que
Servicios Escolares entrega de verdad: **el padrón viene con el nombre completo
en una sola columna y la matrícula, nada más**. Ni correos, ni programa
educativo, ni el nombre separado en nombres y apellidos.

Eso invalidaba la identificación del alumno, que verificaba matrícula **contra el
correo del padrón**: no hay correos contra los que verificar. Y obligaba a
recoger del propio alumno los datos académicos que antes se daban por recibidos.

#### La identificación: solo la matrícula

Se consideraron dos segundos factores y se descartaron los dos.

Pedir el **apellido paterno** no funciona: con el nombre completo en una sola
columna no hay forma confiable de saber dónde terminan los nombres y empiezan los
apellidos. `JUAN CARLOS PEREZ MUÑOZ` tiene dos nombres, `ANDREA DE LA CRUZ SOLIS`
tiene un apellido de tres palabras, y hay listas que llegan con los apellidos
primero. Cualquier regla que parta el nombre rechaza alumnos reales, y un alumno
rechazado por cómo está escrito su propio nombre es el peor error posible en la
primera pantalla.

Se probó una regla tolerante —que lo escrito apareciera dentro del nombre
registrado, sin partirlo— y funcionaba con los 40 alumnos. Se descartó igual, por
decisión de producto: **un dato es suficiente**. Añadir un segundo campo cuesta
fricción en la pantalla que más gente ve, y no compra tanto como parece, porque
quien conoce una matrícula ajena suele conocer también el nombre de esa persona.

Así que `/alumno` pide la matrícula y nada más, con el campo grande y centrado
porque es lo único que hay que llenar. **La identidad se confirma en la pantalla
siguiente**, que ya existía: el alumno ve su nombre en grande y tiene que marcar
la casilla para continuar. Si se equivocó de matrícula, ahí se da cuenta.

El código de la regla de apellidos se retiró en lugar de dejarlo desconectado.

**Lo que esto implica, dicho para que quede en el registro:** basta con conocer
una matrícula ajena para iniciar un pre-registro a nombre de otro. Lo que impide
que ese registro sirva de algo es que el correo se verifica con un código, y que
el pago pasa por ventanilla. Si algún día hace falta cerrar esa puerta del todo,
la salida no es de diseño sino de datos: pedirle a Servicios Escolares un campo
más, normalmente la fecha de nacimiento.

#### Los datos que ahora declara el alumno

Pantalla nueva `/completar-datos`, entre confirmar el nombre y verificar el
correo. Pide correo, celular, nivel, programa, avance y grupo.

El **avance cambia de nombre con el nivel**: semestre en licenciatura (1 a 10),
módulo en maestría (1 a 6). Es la misma pregunta con dos nombres, y usar el
equivocado delata que el formulario no se pensó para quien lo llena. Cambiar de
nivel limpia el programa y el avance ya elegidos, en vez de dejar una combinación
imposible.

El programa es un catálogo (`src/mocks/catalogos.ts`), no un campo libre: en
texto libre la misma carrera se escribe de veinte maneras y el reporte por
programa deja de servir.

El correo ahora lo declara el alumno, así que **pasa por `/verificar-correo`**,
que antes solo usaban docentes y externos. Un correo autodeclarado sin verificar
es un correo al que nunca llega el folio.

#### Lo que arrastró quitar dos campos del padrón

Se mapeó antes de tocar nada. TypeScript atrapó 7 errores; los que no atrapa son
los que importan:

| Dónde | Qué cambió |
| --- | --- |
| `tipos.ts` | `AlumnoPadron` baja a `{matricula, nombre, dia}`; `Participante` gana `nivel`, `avance` y `grupo` |
| `padron-importacion.ts` | De 5 columnas a **3**. Fuera la validación de correo y de programa; entra una que faltaba: **el nombre debe traer al menos dos palabras** |
| `admin.padron.tsx` | Plantilla, cabeceras de la vista previa y `colSpan` |
| `admin.reportes.tsx` | El reporte de padrón baja a 3 columnas, y entra uno nuevo: **datos académicos declarados**. El de elegibles gana nivel y programa |
| `participantes.ts` | El correo del alumno ya no sale del padrón; los datos académicos se simulan como si él los hubiera capturado |
| `comprobante.tsx`, `financieros.ficha.tsx` | Muestran programa, avance y grupo |
| `padron-mixto.csv` | Reconstruido a 3 columnas, conservando el reparto de 3 listos / 3 advertencias / 5 errores |

**Un invariante se retiró y cuatro entraron.** `correo-vs-padron` se eliminó
—comparaba contra un dato que ya no existe—, y como los datos académicos ya no
los valida nadie corriente arriba, entraron `alumno-sin-datos-academicos`,
`programa-vs-nivel` y `avance-fuera-de-rango` como integridad, más
`niveles-representados` como cobertura. Sin ellos, un programa que no es del
nivel declarado o un semestre 14 llegarían hasta el reporte sin que nada los
detuviera. Las dos contrapruebas confirman que ambos saltan.

**Corrección de una cifra del propio informe:** las secciones 1 y 2 decían «24
familias de invariantes». Ese número no corresponde a cómo está organizado
`verificar.ts` y no se pudo reconstruir de dónde salió. La cifra verificable, y
la que queda, es **45 comprobaciones nombradas agrupadas en 18 familias**.

#### Verificación

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Las 16 comprobaciones de lógica pura pasan, incluida la nueva
`probar-preregistro.ts` (23 casos, con las contrapruebas de los invariantes
nuevos). `datos-demo.ts` hubo que corregirlo: afirmaba que el correo del padrón
coincide con el del participante, y ese campo ya no existe. Era el test el que
estaba desactualizado, no el código.

`docs/RECORRIDO-DEMO.md` se actualizó: el recorrido principal pasa de 9 a 11
pasos, con los dos nuevos verificados contra los datos.

#### Avance

| Indicador | Antes | Ahora |
| --- | --- | --- |
| Pantallas | 33 de 33 | **34 de 34** |
| Elementos de la especificación | 139 de 139 | **142 de 142** |
| Columnas exigidas al archivo de Servicios Escolares | 5 | **3** |
| Comprobaciones de invariantes | 42 | **45** |

#### Defectos nuevos detectados y NO corregidos

1. **El catálogo de programas no se edita desde administración.** Vive en
   `src/mocks/catalogos.ts` y solo se cambia tocando código. La configuración del
   evento sí es editable; esto debería serlo por el mismo motivo. Talla S.
2. **Solo hay dos niveles.** Licenciatura y maestría. Si la universidad recibe
   alumnos de doctorado, TSU o especialidad, hay que agregarlos al catálogo y
   decidir cómo se llama su avance. Talla S.
3. **La matrícula es el único dato para entrar.** Es una decisión tomada a
   propósito —un dato basta, y el segundo factor posible no compraba tanto como
   costaba—, pero conviene revisarla si alguna vez el pre-registro deja de pasar
   por la verificación de correo y por ventanilla. Talla S.
4. **Nada valida que el correo declarado sea institucional.** Se valida el
   formato, no el dominio. Si la universidad exige `@alumnos.universidad.mx`,
   falta esa regla y el mensaje que la explica. Talla S.
5. **El padrón sigue trayendo el día asignado.** No lo entrega Servicios
   Escolares: lo asigna la organización. Hoy viaja en el mismo archivo, lo cual
   funciona, pero conviene decidir si el reparto por días se hace en otro lado.
   Talla M.

---

### 07/09/2026 — Formato real de matrícula

Dato del cliente: la universidad usa matrículas **numéricas de 11 dígitos**, sin
letra. `20262122031` es una real. El prototipo asumía `A` más 7 dígitos, que fue
una invención de la especificación original.

| Dónde | Antes | Ahora |
| --- | --- | --- |
| `alumnosPadron.ts` | `A2100045` … `A2100318` | `20262122031` … `20262122304` |
| `padron-importacion.ts` | `/^A\d{7}$/` | `/^\d{11}$/`, y el mensaje dice «se esperan 11 dígitos» |
| `alumno.tsx` | acepta cualquier texto | **el campo no admite letras**: descarta todo lo que no sea dígito al escribir y al pegar, con teclado numérico, tope de 11 y un contador debajo |
| `padron-mixto.csv`, plantilla | matrículas con letra | de 11 dígitos |

En `/alumno` la corrección no es un mensaje, es el propio campo: **no deja
escribir una letra**. Filtrar al escribir en vez de reprochar al enviar evita que
el alumno pierda el tiempo dos veces, y el contador («7 de 11 dígitos») le dice
dónde va sin que tenga que enviar para averiguarlo. Lo único que queda por
validar al enviar son los dígitos que falten, y el mensaje dice cuántos.

El archivo de ejemplo conserva su reparto de **3 listos / 3 advertencias / 5
errores**, y la fila del error de formato ahora usa una matrícula del formato
viejo (`A2100325`), que es exactamente lo que llegaría si alguien reutiliza una
plantilla anterior.

#### Pregunta abierta

**¿Los primeros dígitos significan algo?** `2026` parece un año de ingreso, y
`2122031` podría llevar campus, programa o consecutivo. El mock genera las 40
matrículas en el mismo rango, así que **todos los alumnos simulados parecen de la
misma generación** aunque declaren semestres del 1 al 10. Si esos dígitos
codifican algo, conviene decirlo: los datos de ejemplo pueden reflejarlo y la
validación puede ser más específica que «11 dígitos». Está anotado en
`alumnosPadron.ts`, junto al dato.

---

### 07/09/2026 — Los campos numéricos dejan de aceptar letras

El campo de celular admitía letras y las reprochaba al enviar. No era un caso
suelto: el mismo defecto estaba en cuatro campos, porque cada pantalla validaba
por su cuenta al enviar en vez de filtrar al escribir.

La regla quedó en un solo lugar, `src/lib/campos.ts`: **un campo numérico no
acepta una letra para después reprocharla**. Se descarta lo que no corresponde en
el momento de escribirlo y de pegarlo, y el mensaje de error queda reservado para
lo único que puede fallar de verdad, que es la cantidad de dígitos.

| Campo | Antes | Ahora |
| --- | --- | --- |
| Matrícula (`/alumno`) | filtraba, con su propia copia del código | usa el filtro compartido |
| Celular (`/completar-datos`) | aceptaba letras | solo dígitos, tope de 10, contador debajo |
| Celular (`/registro`) | aceptaba letras, y además las pasaba a mayúsculas | solo dígitos, tope de 10, contador debajo |
| Código de 6 dígitos (`/verificar-correo`) | las casillas aceptaban letras | `pattern={REGEXP_ONLY_DIGITS}` |
| Monto del voucher (`/financieros/ficha`) | aceptaba letras | dígitos y un punto decimal, dos decimales |

Los largos (11, 10 y 6) viven ahora en `LARGO`, no repartidos por las pantallas.
El mensaje también es uno solo y dice cuántos dígitos faltan, en singular o
plural: «te falta 1 dígito», «te faltan 5 dígitos».

El filtro es tolerante con cómo copia y pega la gente: `81 1234 5678`,
`81-1234-5678` y `(81) 1234-5678` entran limpios, y `+52 81 1234 5678` se recorta
a 10 dígitos en vez de rechazarse.

**Lo que no se tocó, a propósito:** `diagnosticarPago` conserva su rama de monto
inválido aunque el campo ya no permita escribir letras, porque **la carga masiva
sí recibe texto de un CSV**. Filtrar la entrada del teclado no es lo mismo que
validar un archivo, y quitar la segunda comprobación habría dejado la puerta
abierta por donde de verdad entran los datos sucios.

**Un error que se metió y salió en la misma tanda:** la función que arma el
mensaje devuelve `undefined` cuando el campo está completo, y asignarlo igual
dejaba la clave presente en el objeto de errores. `Object.keys(e).length` la
contaba, y el formulario no volvía a enviarse nunca. Está corregido y anotado en
el código, porque es el tipo de fallo que no da síntoma hasta que alguien llena
todo bien.

#### Verificación

`probar-campos-numericos.ts`: **31 comprobaciones**, incluidas las que verifican
que las tres pantallas importan el filtro compartido y **ninguna reimplementa el
suyo**. Sustituye a `probar-campo-matricula.ts`, que solo cubría un campo.

Los cuatro comandos en código 0.

---

### 07/09/2026 — El código QR se descarga, no se envía

La pantalla de pago prometía: «recibirás tu código QR por correo». Enviar el
código a cada uno de dos mil quinientos alumnos es trabajo manual que alguien
tiene que hacer, y cada envío que no llega —correo mal escrito, buzón lleno,
carpeta de spam— se convierte en un reclamo el día del evento, con la fila
detenida.

**El QR se recoge, no se reparte.** El alumno deja su voucher en ventanilla,
espera el plazo de validación, entra a su portal y lo descarga. La pantalla que
lo entrega (`/portal/qr`) ya existía y ya tenía los botones de descargar y
guardar; lo que estaba mal era el texto que prometía otra cosa.

| Dónde | Antes | Ahora |
| --- | --- | --- |
| `/pago` | un párrafo: «recibirás tu QR por correo» | bloque **«Tu código QR lo descargas tú»** con los 4 pasos numerados y un botón directo a su QR |
| `/portal/qr`, sin pagar aún | «falta que validen el monto» | dice **cuántas horas** tarda y que el código aparece ahí mismo |
| `/portal/estado` | el último nodo decía «QR generado» | «QR disponible», y con el comprobante recibido aparece el plazo con enlace a su QR |
| `/financieros/ficha` | «se generó el QR y se envió por correo» | «ya está disponible en su portal»; y le dice a quien atiende qué responder en ventanilla |

**El plazo es configuración, no una constante escrita en el texto.**
`horasValidacion` vive en la configuración del evento y se edita en
`/admin/configuracion`, junto a la cuota y la fecha límite. Si ventanilla se
retrasa un día, se sube el número ahí y las cuatro pantallas lo repiten. Escribir
«5 horas» en cada texto habría garantizado que un día digan cosas distintas.

Al conectarlo apareció que **`/portal/qr` leía la configuración del mock y no del
contexto**, así que un cambio hecho en administración no se habría reflejado ahí.
Corregido: ahora lee del contexto, como el resto.

#### Defecto detectado y NO corregido

**Ocho pantallas más siguen leyendo `@/mocks/evento` directamente** en vez del
contexto: `bienvenida`, `captura.index`, `financieros.conciliacion`,
`financieros.ficha`, `index`, `mi-dia`, `portal.estado` y `portal.evidencias`.
Varias solo usan `infoDia`, que es un ayudante del mock y no configuración, pero
conviene revisarlas una por una: cualquiera que muestre cuota, fecha límite u
horas de validación quedaría desactualizada tras un cambio en administración.
Talla S.

---

### 07/09/2026 — Cierre de los defectos abiertos

Seis defectos anotados en tandas anteriores. Se cerraron los seis que no
dependían de una decisión ajena.

#### 1 y 2. El catálogo académico deja de ser código

Estaban anotados por separado —«el catálogo no se edita desde administración» y
«solo hay dos niveles»— pero eran el mismo defecto: los niveles y los programas
vivían como constantes en `catalogos.ts`, así que agregar un doctorado
significaba tocar código y volver a compilar.

Ahora es **configuración**, en `/admin/configuracion`, junto a la cuota y la
fecha límite. De cada nivel se edita el nombre, **cómo se llama su avance**
—semestre, módulo, cuatrimestre, año— hasta dónde llega, y sus programas, uno por
renglón. Se pueden agregar y quitar niveles; el último no se puede borrar, porque
un catálogo vacío dejaría el pre-registro sin salida.

Eso obligó a un cambio de tipos: `Participante.nivel` pasó de ser una unión
cerrada `"Licenciatura" | "Maestría"` a `string`. Es la consecuencia correcta de
volverlo dato: una unión de TypeScript no puede describir algo que se edita en
tiempo de ejecución. A cambio entró un invariante nuevo, **`nivel-inexistente`**,
de clase integridad, que atrapa lo que el tipo ya no puede.

Los renglones vacíos del área de programas se descartan **al guardar, no al
escribir**: borrar una línea a media edición no debe hacer saltar el cursor.

#### 3. El correo institucional se valida contra un dominio configurable

`dominioInstitucional` vive en la configuración. Si está puesto, `/completar-datos`
exige que el correo termine en él y lo dice con el dominio concreto; si se deja
vacío, se acepta cualquiera. Ese vacío es deliberado: hay universidades que no dan
cuenta institucional a todos, y rechazar a quien no la tiene lo dejaría fuera del
evento.

#### 4. Nueve pantallas leían la configuración del mock

Anotado en la tanda anterior como ocho; eran nueve, porque **la barra superior**
—que aparece en todas las pantallas y lleva el nombre del evento— también lo
hacía. Cambiar el nombre en administración lo habría cambiado en todas partes
menos en el encabezado.

Todas leen ahora del contexto. Además, `infoDia` pasó a ser una función del
contexto en vez de un ayudante del mock: administración puede cambiar la fecha y
la sede de un día, y seis pantallas seguían mostrando la sede vieja.

Queda una sola lectura directa del mock, `admin.configuracion`, que es la
pantalla que lo edita.

#### 5. Al participante que se queda sin taller se le avisa

El contexto guarda avisos por folio y los dos caminos que liberan una inscripción
—importar el padrón y editar los días de un taller— dejan uno, con el nombre del
taller y el motivo. Su portal los muestra en un bloque ámbar con la salida
concreta: **elegir otro taller**, y un botón de «ya lo vi» para quitarlo.

Antes el participante encontraba su portal sin taller y sin explicación.

#### 6. El modo oscuro se puede encender

Interruptor en el selector de «Prototipo», donde ya vive todo lo que es del
prototipo y no del sistema. **No se guarda en localStorage**: ahí solo vive la
cola de escaneos sin conexión, y esa regla no se toca. El tema vuelve al claro al
recargar, como todo lo demás.

#### 7. La asistencia del día viejo ya se puede cerrar

Era el de talla M. Mover a alguien de día dejaba sus asistencias anteriores en el
día que ya no le corresponde; el dashboard lo informaba, pero no había forma de
resolverlo desde ninguna pantalla.

Ahora el panel de avisos del dashboard **lista los registros concretos** —nombre,
folio, tipo, hora, y el día que hoy le corresponde— con un botón de anular por
cada uno. El diálogo **exige un motivo de al menos diez caracteres**: sin eso,
dentro de un mes nadie sabrá si fue un error o una corrección.

La asistencia anulada sale de los cálculos pero **no se borra**: queda en la
bitácora con quién la anuló, qué registro era y por qué. Borrarla sin más habría
dejado la bitácora sin explicación, que es justo lo que este defecto venía a
resolver.

#### Lo que NO se cerró, y por qué

**El padrón sigue trayendo el día asignado.** Ese dato no lo entrega Servicios
Escolares: lo asigna la organización. Funciona, pero decidir si el reparto por
días vive en ese mismo archivo o en otro lado es una decisión operativa, no
técnica. Sigue abierto a propósito.

#### Verificación

`probar-defectos.ts`: **26 comprobaciones**, una por arreglo, con las
contrapruebas. Entre ellas, que un doctorado con el avance medido en años entra
sin tocar código, que ninguna de las 36 rutas ni el layout leen ya la
configuración del mock, y que el interruptor de tema no toca localStorage.

Dos pruebas propias hubo que corregirlas, y las dos fallaban por mi culpa, no por
el código: una contaba mal las llamadas a `agregarAviso`, y la otra buscaba la
palabra «localStorage» y la encontraba **en el comentario que explica que no se
usa**. Buscar la palabra en vez del uso es un error fácil de repetir; ahora busca
`localStorage.`, que sí es uso.

`probar-preregistro.ts` también se actualizó al catálogo editable: sus
aserciones seguían usando las constantes que dejaron de existir.

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ 46 comprobaciones, código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Las **18 suites** de lógica pura pasan.

---

### 07/09/2026 — El día deja de venir en el archivo del padrón

Era el defecto que quedaba abierto. El archivo de Servicios Escolares traía una
columna `dia`, y eso era mentir sobre de dónde sale el dato: **el día lo asigna
la organización**, repartiendo a los alumnos entre las tres sedes. Que viajara en
el mismo archivo funcionaba, pero ponía una decisión de la organización en manos
de quien exporta el padrón.

#### El archivo baja a dos columnas

`COLUMNAS_PADRON` es ahora `["matricula", "nombre"]`. Al importar, quien ya estaba
**conserva el día que se le asignó** y quien entra nuevo queda esperando el
reparto. La fila lo dice: «Actualiza un registro existente. Conserva su día 2» o
«Alta nueva. Queda sin día asignado hasta que se reparta».

`AlumnoPadron.dia` pasó a ser opcional. No es un hueco: **es un estado real** —el
alumno dado de alta al que todavía nadie le asignó día— y tenía que poder verse.

#### La lógica de mover a alguien no desapareció: se mudó

Este era el riesgo del cambio. Toda la cadena de A.1 —mover al participante,
mover su sede, liberar su taller si no se imparte el día nuevo, avisarle— vivía
dentro de `aplicarPadron`. Si el archivo deja de traer el día, esa cadena se
queda sin quien la dispare.

Se extrajo a **`reasignarDia(matricula, dia)`**, que hace exactamente lo mismo y
la usan los dos caminos nuevos: el reparto masivo y el cambio de una persona.
`aplicarPadron` quedó reducido a lo que de verdad hace un archivo de Servicios
Escolares: dar de alta y actualizar nombres.

De paso, la sede dejó de estar escrita a mano (`dia === 3 ? "Teatro Victoria" :
"Salón SUTERM"`) y sale de `infoDia(dia).sede`, que es configuración. Antes,
mover a alguien le ponía la sede vieja si administración la había cambiado.

#### El reparto, en `/admin/padron`

Un tablero arriba de la importación: cuántos hay en cada día, con su sede, y
cuántos esperan. Si hay pendientes, un botón los reparte y una lista permite
asignarlos uno por uno.

**El reparto va al día que va más vacío, de uno en uno.** No al azar ni en
bloques: con tres sedes de aforo parecido, lo que importa es que ninguna se llene
mientras otra queda a medias. Verificado: partiendo de 14/13/13 con 9 pendientes,
queda en 17/16/16 — nunca más de uno de diferencia.

#### El caso que no podía quedar sin resolver

¿Y si un alumno sin día repartido se pre-registra antes de que la organización
haga su parte?

No se le bloquea. `diaDe(matricula)` le asigna en ese momento el día que va más
vacío, y sigue su camino. Bloquear el pre-registro porque una tarea interna está
pendiente habría trasladado al alumno un problema que no es suyo.

#### Invariantes

`dia-vs-padron` solo se comprueba **cuando la fila del padrón ya tiene día**: un
alta esperando reparto no está en desacuerdo con nadie. Y entra
**`participante-sin-dia-en-padron`**, de integridad, para el caso que sí es un
error: alguien que ya es participante de un día concreto y cuya fila del padrón
perdió el suyo.

#### El archivo de ejemplo

Reconstruido a dos columnas. El reparto cambió, porque los casos de error
cambiaron: **3 listos, 3 advertencias, 5 errores** siguen siendo el mismo total,
pero ahora las advertencias son dos altas nuevas sin día y un cambio de nombre de
alguien que ya pagó —«su constancia sale con el nombre nuevo, confírmalo antes de
aplicar»—, y entre los errores entró una matrícula demasiado corta en lugar del
día fuera de rango, que ya no puede existir.

#### Verificación

`probar-reparto.ts`: **17 comprobaciones**. Que el archivo no trae día ni lo
inventa, que el reparto equilibra sin perder ni duplicar a nadie, que mover a
alguien sigue arrastrando su sede y su taller, y las dos contrapruebas de los
invariantes.

Tres pruebas propias hubo que corregir, y las tres por lo mismo: afirmaban cosas
sobre las columnas anteriores. `probar-propagacion.ts` se recortó a la mitad —su
bloque de importación probaba un comportamiento que ya no existe—; dejarlo habría
sido peor que borrarlo, porque una prueba en verde que afirma algo falso es lo
que hace confiar en lo que no se debe.

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Las **19 suites** de lógica pura pasan. **No quedan defectos abiertos.**

---

### 07/09/2026 — Fuera la dependencia de la herramienta de generación

El andamiaje inicial del proyecto lo generó una herramienta externa, y quedaban
ataduras suyas en la compilación, en el código y en la documentación. Se
retiraron todas.

| Qué era | Qué se hizo |
| --- | --- |
| `@lovable.dev/vite-tanstack-config`, del que dependía `vite.config.ts` | La configuración se escribió completa: los seis plugins declarados, el alias `@` y el `dedupe` de React |
| `src/lib/lovable-error-reporting.ts` | Eliminado. Reportaba errores a funciones que el editor inyectaba en `window`; fuera de él no hacía nada |
| La llamada en el límite de error de `__root.tsx` | Retirada. El `console.error` que ya estaba sigue registrando |
| `.lovable/` (2 archivos) y `AGENTS.md` | Eliminados |
| Cuatro excepciones en `bunfig.toml` a la espera de 24 h del guardado de suministro | Retiradas: existían solo para esos paquetes |
| Dos secciones del `README.md` con enlaces al editor | Sustituidas por cómo trabajar el proyecto localmente |

#### Lo que había que no romper

`vite.config.ts` delegaba **todo** en ese paquete: los plugins de TanStack Start,
React, Tailwind, las rutas del `tsconfig`, Nitro con destino Cloudflare, el alias
`@` y la deduplicación de React. Un comentario en el archivo advertía de no
declararlos a mano «o la aplicación se rompe con plugins duplicados».

Se inspeccionó qué componía realmente el paquete y se reescribió la
configuración con las piezas que ya estaban instaladas —ninguna hacía falta
añadirla—. El orden importa y quedó anotado en el archivo: `tanstackStart` genera
el árbol de rutas y va antes que el plugin de React; `nitro` va al final porque
empaqueta lo que los demás produjeron.

**Comprobado de verdad, no por inspección:** se desinstaló el paquete
(`bun install` lo quitó del `bun.lock`) y se borró de `node_modules`. `bun run
build` sigue en 0 y produce el mismo worker de Cloudflare.

#### Lo que se conservó, y por qué

Las secciones 3 a 9 del informe —la auditoría original— siguen nombrando la
herramienta y sus archivos. Son la fotografía del punto de partida, y explican de
dónde salió el código y por qué el proyecto usa TanStack Router y no React
Router. Reescribirlas para borrar ese origen sería falsificar el registro, no
limpiar el proyecto. Queda avisado en la nota que precede a esas secciones que
nada de eso existe ya.

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

---

### 07/09/2026 — Servicios Escolares entrega los datos académicos

Nueva información del cliente: el archivo no traerá solo nombre y matrícula.
Traerá **nivel, programa, avance, grupo y sede**. El alumno deja de capturar todo
eso: solo verifica que su nombre esté bien y da su correo y su celular.

#### Lo primero fue desambiguar «sede»

En un padrón universitario «sede» es el **plantel donde estudia**. En este evento
`sede` ya significaba el **lugar al que le toca asistir**, derivado del día que
asigna la organización. Son dos cosas distintas con el mismo nombre, y meterlas
en el mismo campo habría producido participantes cuyo plantel dice «Salón
SUTERM».

Se separaron: `plantel` es dónde estudia y lo entrega la universidad; `sede` es
dónde asiste y la asigna la organización. Un invariante nuevo,
`plantel-vs-padron`, y una comprobación que verifica que **ningún participante
tiene los dos valores iguales**.

#### El padrón

`AlumnoPadron` pasó de 3 campos a 8: `matricula`, `nombre`, `nivel`, `programa`,
`avance`, `grupo?`, `plantel`, `dia?`. El archivo importado tiene esas siete
columnas —`dia` sigue sin venir, lo reparte la organización— y `grupo` puede ir
vacío porque no todos los programas lo manejan.

**La importación ahora valida contra el catálogo académico**, que ya era
editable: un nivel que no existe, un programa que no es de ese nivel o un avance
fuera de rango se rechazan con el motivo concreto. Sin eso, un archivo con
«Maestría en Docencia» puesto en una licenciatura llega hasta el reporte por
programa y lo parte en dos.

El participante hereda esos datos del padrón en vez de simularlos, y el
invariante `academicos-vs-padron` comprueba que no se desalineen en marcha.

#### La pantalla

`/completar-datos` pasó de seis campos a dos. Se llama ahora «Tus datos de
contacto», y arriba muestra **lo que entregó Servicios Escolares** en solo
lectura, con la salida escrita: si algo está mal, se corrige con ellos, no ahí.

De paso se cerraron cinco cosas del análisis previo:

| Hallazgo | Cómo quedó |
| --- | --- |
| El nivel venía preseleccionado en «Licenciatura», e inducía a que un alumno de posgrado eligiera mal | Desapareció el campo: el nivel lo entrega la universidad |
| «Grupo (opcional)» decía lo mismo dos veces | Desapareció el campo |
| Los botones de nivel eran `grid-cols-2` fijo y se rompían con un tercer nivel | Desaparecieron |
| El ejemplo del correo tenía el dominio escrito a mano, y mentía si administración lo cambiaba | Sale del dominio configurado |
| Al enviar con errores nada llevaba al campo que falla, y los mensajes no estaban asociados al campo | Foco al primer error y `aria-describedby` en los dos campos |

Queda dicho para qué se pide el celular, que antes no se decía: «solo lo usamos
si hay un problema con tu registro».

#### El hallazgo grande del análisis, resuelto por otro camino

El análisis decía que el alumno no podía **ver ni corregir** sus datos
académicos. La primera mitad se arregló: `/portal/estado` los muestra ahora en su
propia tarjeta. La segunda cambió de naturaleza: ya no son suyos que corregir,
son de la universidad, así que la salida correcta es soporte —y así está escrito
en las dos pantallas donde aparecen.

#### Verificación

`probar-padron-academico.ts`: **26 comprobaciones**. Que el padrón trae lo
académico, que plantel y sede no se confunden en ninguno de los 40, que el
participante hereda y no inventa, que la importación rechaza los siete errores
distintos del archivo de ejemplo, y las dos contrapruebas de los invariantes
nuevos.

Cuatro suites propias hubo que corregir, todas por describir el modelo anterior.
`probar-preregistro.ts` se recortó a la identificación por matrícula, que es lo
único que no cubría ya otra suite: sus bloques de importación y datos académicos
repetían —con el CSV viejo— lo que ahora comprueba la suite nueva.

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Las **22 suites** de lógica pura pasan.

---

### 07/09/2026 — La base de datos

Primer trabajo fuera de la capa visual: el esquema completo para Supabase, en
`supabase/migrations/`. **16 migraciones, 1 706 líneas de SQL, 17 tablas, 6
vistas, 12 tipos y 13 funciones**, con seguridad a nivel de fila en todas las
tablas.

El prototipo no se tocó: sigue con sus datos simulados y sus cuatro comandos en
0. Conectar las pantallas es un trabajo aparte y no se hizo aquí.

#### Las cuatro decisiones que explican el resto

**Lo que se calcula no se guarda.** El estado de pago es una vista sobre la tabla
de pagos, no una columna; el cupo de un taller se cuenta; la elegibilidad se
deriva de sus tres condiciones. En el prototipo eso ya era así por conveniencia;
aquí es por necesidad: un estado guardado y un pago registrado se contradicen
tarde o temprano, y entonces ninguno de los dos sirve para decidir.

**Las reglas que importan bajaron a la base.** La referencia bancaria es
`UNIQUE`: en el prototipo el control anti-fraude era un `if`, y dos ventanillas
capturando a la vez lo habrían atravesado las dos. Que nadie quede inscrito en un
taller que no se imparte su día —la regla que más veces se rompió durante el
desarrollo— es ahora una llave foránea compuesta contra `taller_dias`. Y que un
programa pertenezca al nivel declarado es otra, contra un índice único de
`programas` puesto ahí solo para poder exigirlo.

**El participante no tiene sesión.** Entra con folio y matrícula, sin contraseña,
así que RLS no tiene a quién filtrar. Su único camino son cinco funciones
`SECURITY DEFINER` que comprueban la credencial y devuelven solo lo suyo. La
migración `1600` revoca `EXECUTE` sobre todas las funciones y lo concede una por
una: sin eso, Supabase deja al anónimo llamar a `fn_repartir_dias_pendientes()`.

`fn_buscar_en_padron` acepta **solo matrícula exacta**, nunca nombre: si se
pudiera buscar por nombre, cualquiera podría recorrer la lista de alumnos de la
universidad.

**Nada se borra: se anula.** Una asistencia anulada sale de los cálculos y
conserva quién y por qué. Un usuario dado de baja se desactiva. Y la bitácora
**no tiene políticas de `UPDATE` ni `DELETE`**, así que la base las rechaza: una
bitácora editable no sirve para aclarar una inconformidad.

#### Reglas que el prototipo comprobaba y ahora impone la base

| Regla | Cómo se sostiene |
| --- | --- |
| Una referencia bancaria no se registra dos veces | `unique (referencia)` |
| Nadie inscrito en un taller fuera de su día | FK compuesta a `taller_dias` |
| El programa pertenece al nivel declarado | FK compuesta a `programas (id, nivel_id)` |
| El avance no pasa del tope de su nivel | Disparador: es una regla entre tablas |
| Una discrepancia lleva nota | `check` |
| Un rechazo de evidencia lleva motivo | `check` |
| Anular una asistencia lleva motivo de 10 caracteres | `check` |
| El alumno trae matrícula y datos académicos; el externo, ninguno | `check` compuesto |
| El resultado del pago lo decide el sistema, no quien captura | Disparador que lo recalcula |
| Un revisor solo firma con su propio id | Política RLS con `auth.uid()` |

#### Cómo se verificó

No había PostgreSQL en el entorno, así que se instaló **libpg_query** —el mismo
analizador que usa el servidor— y se validaron las **184 sentencias** contra la
gramática real. Además se comprobó que ninguna referencia apunte a una tabla o
columna inexistente, que ninguna mire hacia una migración posterior, que las 17
tablas queden con RLS activo **y con al menos una política** —una tabla con RLS y
sin políticas queda inaccesible, que es un error silencioso— y que los 12 tipos
creados se usen.

El validador tuvo que trocear los archivos por sentencia, porque el analizador se
corrompe con literales largos. Las dos primeras versiones del troceador estaban
mal y **acusaron a las migraciones de errores que no tenían**: la primera partía
dentro de los cuerpos `$$` de las funciones, la segunda dentro de las comillas
—los textos en español llevan punto y coma—. Vale la pena decirlo porque el
patrón se repite: cuando una herramienta nueva reporta muchos fallos de golpe,
suele estar mal la herramienta.

#### Lo que la base no cubre, y hay que decirlo

- **La aplicación sigue con datos simulados.** Estas migraciones crean el
  esquema; conectar las pantallas no se hizo.
- **Almacenamiento de archivos.** `evidencias.archivo_url` y `pagos.voucher_url`
  esperan una ruta de Supabase Storage. Faltan el bucket y sus políticas.
- **Envío de correos.** El código de verificación necesita un proveedor.
- **El hash de las evidencias** lo calcula quien sube el archivo; la base lo
  guarda y lo indexa.
- **No se ejecutaron contra una base real.** Los errores que solo aparecen al
  ejecutar —un cuerpo de función que nombra mal una columna, que PL/pgSQL no
  comprueba hasta la primera llamada— podrían seguir ahí. Conviene correrlas
  primero en un proyecto de prueba.

---

### 07/09/2026 — Fuera la verificación por código

Se preguntó para qué servía, y al rastrearlo la respuesta fue: para poco.

**Qué dependía de ese correo.** La copia del comprobante y el reenvío de las
instrucciones de pago están en pantalla y se imprimen. Soporte usa WhatsApp como
canal principal. Y el código QR **ya no se envía**: se descarga del portal. Al
portal se entra con folio y matrícula; el docente y el externo entran con folio y
correo, pero se compara contra el que ellos escribieron, así que un correo mal
tecleado sigue funcionando como credencial. Verificarlo no aportaba nada ahí.

**Qué costaba.** Un proveedor de correo, un paso más para 2 500 personas, y una
forma nueva de quedarse atorado: si el código no llega —spam, o la dirección está
mal escrita y entonces no puede llegar nunca— la persona no termina su
pre-registro. Eso genera exactamente los tickets de soporte que se han estado
quitando en todo lo demás.

**Qué quedó en su lugar.** Confirmar la dirección en pantalla antes de continuar.
Atrapa el error de dedo, que es lo que de verdad pasa, sin bloquear a nadie ni
depender de que un mensaje llegue.

#### Lo que casi se pierde

`/verificar-correo` tenía un segundo paso que no se veía desde el nombre: **la
confirmación de nombre de docentes y externos**. Ellos escriben su propio nombre,
y ahí era donde lo revisaban antes de que quedara fijo. Borrar la pantalla sin
más los habría dejado sin ese paso.

Se mudó a su propio formulario, donde tiene más sentido: al enviar, `/registro`
muestra el nombre y el correo y pide confirmarlos, con «Corregirlos» al lado. El
alumno no lo necesita porque su nombre viene del padrón y ya lo confirmó antes.

#### Retirado, no desconectado

La pantalla, el componente `ui/input-otp.tsx`, la dependencia `input-otp` del
`package.json` y `LARGO.codigo`. El índice bajó de 34 a 33 pantallas y el
denominador de la especificación de 142 a 141.

#### Un falso positivo del auditor, y por qué se arregló la regla

Al quitar la pantalla, `auditar-estados.ts` empezó a marcar que `/portal/estado`
pinta una lista sin estado vacío. No era cierto dos veces: la lista de avisos va
dentro de un `avisos.length > 0`, y la otra es una constante de cuatro pasos que
no puede quedarse vacía.

La regla se afinó en vez de silenciar el caso, y salió a su propio módulo
(`regla-lista.ts`): una lista guardada por su longitud ya resuelve el vacío —no
se dibuja nada— y una constante literal declarada en el archivo nunca se queda
sin elementos. Pedirles un «no hay resultados» sería pedir un mensaje que nadie
llegaría a ver.

| Comando | Resultado |
| --- | --- |
| `bun run verificar-mocks` | ✓ código 0 |
| `bun run typecheck` | ✓ código 0 |
| `bun run lint` | ✓ código 0 |
| `bun run build` | ✓ código 0 |

Las 23 suites pasan.
