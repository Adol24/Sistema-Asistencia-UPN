# Despliegue en Cloudflare

El proyecto compila para **Cloudflare Workers**. Nitro usa el preset
`cloudflare-module` (`vite.config.ts`) y genera en cada compilación el
`wrangler.json` con `nodejs_compat` y el enlace a los archivos estáticos, así que
no hay que escribirlo a mano.

```bash
bun install
bun run build          # deja todo en .output/
bun run deploy         # compila y publica
bun run deploy:preview # igual, pero sin publicar (--dry-run)
```

## Lo único que hay que configurar a mano

Dos variables:

| Variable | Ejemplo |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la clave publicable del proyecto |

**Van como variables de compilación, no como secretos del Worker.** Esto no es un
detalle de forma: el prefijo `VITE_` significa que Vite las **sustituye por su
valor dentro del código al compilar**, no las lee al ejecutarse. Un secreto de
Worker se resuelve en ejecución, cuando ya es tarde.

Y el fallo no avisa. El sistema está hecho para seguir funcionando sin base de
datos —con los datos simulados, para que quien revise pantallas no dependa de una
llave—, así que si las variables no están al compilar, `hayBaseDeDatos` queda en
falso y **el sitio se despliega sin error, aparentemente bien, mostrando datos
inventados**. Nadie lo nota hasta que alguien busca un folio real y no aparece.

En el panel de Cloudflare: *Workers & Pages → el proyecto → Settings →
Variables and Secrets*, y hay que elegir explícitamente que apliquen al **build**.

### Cómo comprobar que quedó bien

Después de desplegar, abre el sitio y entra al selector de participante… o más
rápido, busca en el paquete servido:

```bash
curl -s https://<tu-dominio>/ | grep -c supabase
```

Si el sitio corre contra la base, el panel de administración muestra datos reales
en vez del padrón simulado de 40 alumnos.

## Qué NO hace falta configurar

- **La clave anónima es pública a propósito.** Viaja al navegador y así debe ser:
  no da permisos por sí sola, queda sujeta a las políticas de seguridad a nivel de
  fila de Supabase. La clave de servicio nunca debe aparecer en este proyecto.
- **El nombre del Worker** se deriva solo (`adol24-sistema-asistencia-upn`). Para
  fijarlo o añadir un dominio propio, se configura en el panel de Cloudflare.

## Límite conocido

El `wrangler.json` que genera la compilación usa rutas con separador de Windows
cuando se construye desde Windows. Publicar desde el runner de Cloudflare —o
desde cualquier máquina Linux o macOS— lo regenera correctamente. Si vas a
publicar desde Windows y falla al resolver los archivos estáticos, esta es la
causa.

## Acceso del personal

`/admin`, `/financieros`, `/captura` y `/revision` piden sesión. La cuenta de
Supabase Auth por sí sola no basta: hace falta además una fila **activa** en
`usuarios_internos`, que es donde vive el rol. Dar de baja a alguien —`activo =
false`— lo deja fuera sin borrar su cuenta, para que sus firmas en la bitácora
sigan teniendo autor.

Quién entra a cada zona reproduce lo que ya exigen las políticas de la base:

| Zona | Roles |
| --- | --- |
| Administración | `admin` |
| Servicios Financieros | `admin`, `financieros` |
| Captura de asistencia | `admin`, `capturista` |
| Revisión de evidencias | `admin`, `revisor` |

Para dar de alta a quien capturará asistencia: crear su usuario en Supabase Auth,
y una fila en `usuarios_internos` con el mismo `id`, su correo y rol
`capturista`. **Una cuenta por persona, no una compartida por punto de captura**:
cada escaneo se firma en `asistencias.capturista_id`, y una cuenta compartida
deja cualquier registro dudoso sin responsable.

### Sin base de datos: modo prototipo

Si no hay variables configuradas, la aplicación corre con datos simulados y **no
pide contraseña**, para que se puedan revisar las pantallas sin depender de una
llave. En ese modo, todas las pantallas internas muestran una franja ámbar que lo
advierte. Es deliberado que sea visible: un modo sin autenticación que no se
anuncia es una trampa esperando a que alguien publique el prototipo creyendo que
la administración está cerrada.

## Límite de intentos por IP

Vive en la base, no en el navegador: un contador en React se reinicia recargando
la página. Se registra un renglón por intento en `privado.intentos` —un esquema
que PostgREST no publica— y la IP sale de `cf-connecting-ip`, la cabecera de
fiar porque Supabase corre detrás de Cloudflare.

| Puerta | Tope | Ventana |
| --- | --- | --- |
| `fn_padron_existe` | 30 | 10 min |
| `fn_padron_confirmar` | 10 | 10 min |
| `fn_perfil_interno` (acceso) | 10 | 15 min |

Sobre el acceso del personal: el inicio de sesión lo atiende Supabase Auth y no
se puede interceptar desde Postgres. Pero entrar necesita **dos** cosas —la
sesión de Auth y una fila activa en `usuarios_internos`—, y esa segunda sí pasa
por la base. Por eso el límite está ahí: una IP que aporrea el acceso deja de
obtener perfil aunque acierte la contraseña.

Conviene además subir el límite propio de Supabase Auth en el panel
(*Authentication → Rate Limits*), que es la primera barrera y actúa antes.

Si no hay ninguna cabecera de IP —desarrollo local— no se limita. Inventar una
agruparía a todo el mundo bajo la misma cuenta y bastaría un usuario para dejar
fuera a los demás.

## Tiempo real

Las pantallas del personal escuchan los cambios de la base por WebSocket: un
pre-registro nuevo, un cobro de otra ventanilla o una asistencia de la puerta
llegan solos, sin que nadie pulse nada. La ventanilla lo dice con una insignia
**En vivo**, y la puerta avisa cuando falta.

`20260910140000_tiempo_real.sql` ya está aplicada: añade las tablas a la
publicación `supabase_realtime`, que es lo único que Supabase entrega por
WebSocket. Comprobado antes contra el proyecto real que Realtime responde y el
canal llega a `SUBSCRIBED`.

Que los cambios lleguen de verdad solo se ve operando: abre la ventanilla en
dos equipos, confirma un cobro en uno y comprueba que el otro se actualiza sin
tocar nada. La insignia **En vivo** dice si el canal está escuchando; si sale
«sin conexión en vivo», el botón «Actualizar» sigue estando.

Publicar una tabla **no la abre**: Realtime evalúa las políticas de fila de
quien escucha antes de entregarle nada, así que a un capturista le siguen sin
llegar los pagos. El anónimo no escucha nada, y por eso el portal del
participante se mantiene al día de otra forma: pregunta por `fn_portal_estado`
cada 20 segundos, y solo con la pestaña al frente.

## Migraciones aplicadas

Las tres del 10 de septiembre están ejecutadas y comprobadas contra el proyecto
real:

| Migración | Comprobación |
| --- | --- |
| `20260910140000_tiempo_real` | Realtime responde; el canal llega a `SUBSCRIBED` |
| `20260910160000_preregistro_docente_externo` | `fn_preregistrar_externo` existe, el anónimo puede llamarla y valida el perfil |
| `20260910180000_correo_personal_del_alumno` | `dominio_institucional` está en NULL: se acepta cualquier correo |

Sigue **sin aplicar** `20260910100000_vistas_security_invoker.sql`, que corrige
que las seis vistas se salten la seguridad a nivel de fila. No bloquea la
operación, pero conviene antes del evento.

## Lo que sigue pendiente

- **La subida de evidencias del alumno no llega a la base.** `portal/evidencias`
  enseña una barra de progreso, espera un momento simulado y responde «Tu
  evidencia quedó en revisión», pero la foto no sale del navegador: no hay
  bucket de Storage en el proyecto y `datos.ts` no tiene ninguna escritura sobre
  `evidencias` —solo la lectura de la carga y el `update` que usa el revisor—.
  El revisor no verá nada, y como la elegibilidad exige dos evidencias
  aprobadas, hoy nadie puede llegar a elegible por esa vía. Es el mismo caso que
  tenía la foto del voucher en ventanilla, que ya se retiró.
- Revisar que cada persona tenga su propia cuenta antes del primer día.
- Las dos migraciones nuevas (`20260908120000` y `20260908140000`) **no se han
  ejecutado contra un Postgres**: en esta máquina no hay ni `psql` ni el CLI de
  Supabase. Están revisadas leyéndolas, no probadas. Aplícalas primero en un
  proyecto de prueba.
- `20260910100000_vistas_security_invoker.sql` **tampoco se ha ejecutado**, y
  cambia permisos, así que conviene aún más probarla antes. Corrige que las seis
  vistas se saltaran la seguridad a nivel de fila. Dos se dejan como estaban a
  propósito y el archivo explica por qué: `v_estado_pago`, porque es lo único
  que permite al capturista saber quién pagó sin ver importes ni referencias, y
  `v_talleres`, porque cuenta inscritos para el cartel público. Marcar
  `v_estado_pago` como `security_invoker` deja la puerta en rojo para todos.
- `20260910120000_referencia_opcional_en_ventanilla.sql` ya se aplicó contra el
  proyecto real.
