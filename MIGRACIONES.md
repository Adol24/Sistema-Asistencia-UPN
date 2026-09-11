# Migraciones

## Cómo se sabe que una migración quedó

```bash
bun run verificar-conexion
```

Solo lee, así que se puede correr contra producción. Pregunta a la base en vez de
leer estos archivos, que es la única forma de saberlo: una migración está
aplicada cuando la base contesta lo que debe, no cuando el archivo existe.

Ese comprobante ya cazó una: `20260911120000` dejó dos funciones abiertas al rol
anónimo, y desde el archivo parecían cerradas.

## Aplicadas

**Todas**, confirmadas contra el proyecto real: el comprobante termina en «LA
CONEXIÓN FUNCIONA», sin ningún problema.

No queda ninguna pendiente. Lo único abierto no es una migración: el **día 3**
sigue sin puntos de captura porque es otra sede y aún no se sabe cómo se llaman
sus accesos. Mientras tanto usa los genéricos, que no rompe nada. Se llenan desde
`/admin/configuracion`, sin tocar la base.

### La trampa que hay que recordar al escribir la siguiente

`20260911120000` creó dos funciones y las cerró con `revoke ... from public`. En
Supabase eso **no alcanza**: `anon` es un rol con nombre propio y con su propia
concesión, así que quitarle el permiso a PUBLIC no le quita el suyo. Y al cambiar
la firma de `fn_evaluar_escaneo`, para PostgreSQL era una función nueva: nació
con las concesiones por defecto en vez de heredar las de la vieja, que sí estaba
cerrada. (`create or replace` sí las conserva; cambiar la firma, no.)

Quedó abierta al público hasta que lo cerró `20260911160000`. Al escribir una
migración que cree o recree funciones internas:

- Revocar siempre `from public, anon`, no solo de `public`.
- Recorrer `pg_proc` por nombre en lugar de escribir las firmas a mano. Repetir
  los tipos exactos de los argumentos es justo donde se cuela el error, y una
  letra de más deja la función abierta sin que nadie lo note. El patrón está en
  `20260908160000` y en `20260911160000`.
- Correr `bun run verificar-conexion` después. Fue lo que lo encontró.

## Qué hicieron las últimas (ya aplicadas)

### La puerta como torniquete (30)

Es la única que **quita** una restricción, así que conviene tenerla presente si
algo de la puerta se comporta raro.

`uq_asistencia_por_dia` permitía una entrada y una salida por persona y día. Con
el receso de quince minutos y 700 personas, el segundo paso por la puerta lo
rechazaba Postgres. La migración lo sustituye por `ix_asistencia_movimientos`,
que no impone unicidad sino orden: lo que ahora se pregunta en cada escaneo no
es «¿ya entró?» sino «¿cuál fue su último movimiento?».

De ahí salen los otros tres cambios:

- `fn_esta_dentro` centraliza esa pregunta. Estaba escrita a mano como «tiene
  entrada y no tiene salida», que con idas y vueltas deja de ser cierta.
- `fn_evaluar_escaneo` **cambia de firma**: recibe `p_modo` (`'puerta'` o
  `'taller'`) en lugar de `p_tipo`, y devuelve el tipo que decidió. El cliente
  dejó de ser quien sabe la dirección, porque su copia local puede estar
  atrasada respecto de los otros puntos de captura. Al cambiar la firma hay que
  volver a conceder el `execute`, y la migración lo hace.
- `fn_cierre_automatico` solo cierra a quien sigue dentro. A quien salió a media
  jornada y no volvió se le respeta su salida real.

No toca la elegibilidad para constancia: registrar no es condicionar.

### Puntos de captura por día (31)

Añade `puntos text[]` a `dias_evento`. Vacío significa «sin configurar» y la
aplicación cae a su lista genérica, así que nada se rompe mientras no se llene.

Van por día porque no es el mismo sitio: el salón SUTERM recibe los días 1 y 2 y
el 3 es en otra sede. Y hacen falta con el nombre real porque un reporte que dice
«Puerta A» es un reporte que nadie sabe traducir a un lugar.

En SUTERM los baños están en la planta baja, junto a las escaleras, **dentro** del
recinto: ir al baño no es salir y ahí no se registra nada. El punto de control es
la puerta que da a la calle, porque cruzarla sí es irse.

La migración ya deja cargados los de SUTERM (días 1 y 2):

```
Puerta 1 SUTERM · Mesa de incidencias · Registro Taller
```

Un solo punto de puerta porque SUTERM tiene una sola salida a la calle. Varios
capturistas comparten ese punto y se distinguen igual, porque cada asistencia
guarda quién la capturó: inventar «Puerta 1», «Puerta 2» y «Puerta 3» para tener
un nombre por persona habría creado tres lugares que no existen.

**El día 3 se queda vacío**, porque es otra sede y aún no sabemos cómo se llaman
sus accesos. Vacío no rompe nada: cae a la lista genérica. Cuando se sepa, se
escribe en `/admin/configuracion`, en «Lugares por día» — esa pantalla ahora sí
guarda los días en la base, que antes no lo hacía.

## Cómo aplicarlas

Con el CLI de Supabase, desde la raíz del repositorio:

```bash
supabase link --project-ref <ref-del-proyecto>
supabase db push
```

O pegando cada archivo, en orden, en el editor SQL del panel.

**Pruébalas primero en un proyecto de prueba.** No se ejecutan contra ningún
Postgres al escribirlas: en la máquina donde se escriben no hay `psql`, ni el CLI
de Supabase, ni Docker. Salen revisadas leyéndolas, no probadas — y ya se vio lo
que eso cuesta: la 30 parecía correcta en el archivo y dejó dos funciones
abiertas al público.

Después de correrlas, `bun run verificar-conexion`. Siempre.

## Cómo verificar que quedaron

```bash
URL=https://<ref>.supabase.co
KEY=<clave publicable>

# Debe responder 200 y {"existe":false,...}
curl -s -X POST "$URL/rest/v1/rpc/fn_padron_existe" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_matricula":"0"}'

# Debe responder 404 o permiso denegado: ya no es del público
# (tras la migración 30 el parámetro es p_modo, no p_tipo)
curl -s -X POST "$URL/rest/v1/rpc/fn_evaluar_escaneo" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_entrada":"X","p_dia":1,"p_modo":"puerta"}'
```
