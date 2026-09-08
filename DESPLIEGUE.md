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

## Riesgo abierto antes de exponer esto a internet

**Las pantallas de operación no tienen autenticación.** `/admin`, `/financieros`,
`/captura` y `/revision` se abren escribiendo la URL.

Hoy el daño está acotado desde la base: el rol anónimo no tiene ningún permiso
sobre `participantes`, `padron_alumnos`, `pagos`, `evidencias`,
`usuarios_internos`, `casos_soporte` ni `bitacora`, así que quien entre sin
sesión ve la interfaz vacía o con datos simulados, no datos reales. La puerta
está abierta pero el cuarto está vacío.

Aun así, antes de un despliegue público hace falta una sesión real —Supabase Auth
con los roles de `usuarios_internos`— y un `beforeLoad` que redirija a quien no la
tenga. Sin eso, cualquiera puede recorrer la interfaz interna, y basta con que
alguien conceda un permiso de más en la base para que deje de estar vacía.
