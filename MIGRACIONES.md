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

Confirmadas contra el proyecto real hasta la 35, las dos del programa oficial
incluidas: el comprobante termina en «LA CONEXIÓN FUNCIONA», sin ningún problema.

**Pendientes de aplicar: la 36 y la 37**, las dos de la estructura real de los
talleres, que salió al revisar los cupos con quien organiza.

- `20260915160000_decolonialidad_son_dos_grupos` parte T04 en dos talleres de 35,
  uno por día. Hasta que se corra, nada impide que las 70 inscripciones caigan el
  mismo día y desborden el salón.
- `20260915180000_el_taller_pregunta_por_sus_dias` separa la comprobación del día
  por modo. Hasta que se corra, las 90 personas de los talleres de dos tardes
  reciben pantalla roja el segundo día.

Córrelas en ese orden. La 37 **no cambia la firma** de `fn_evaluar_escaneo`, así
que `create or replace` conserva las concesiones; aun así las vuelve a cerrar
recorriendo `pg_proc`, que es lo que manda la trampa de más abajo.

Lo que queda abierto no son migraciones: los **días 2 y 3** no tienen puntos de
captura, y a los talleres les falta descripción. Ambas cosas se llenan desde el
panel —`/admin/configuracion` y `/admin/talleres`— sin tocar la base.

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

## Qué hicieron las últimas

El número entre paréntesis es **la posición del archivo en la carpeta**, que se
comprueba así:

```bash
ls supabase/migrations/*.sql | nl
```

Se dice porque ya se había desfasado una vez: este documento llamaba «30» a la
del torniquete cuando era la 31, y a partir de ahí todo lo que se numeró encima
heredó el error. El timestamp del nombre no miente nunca; el ordinal es comodidad
y hay que verificarlo.

### Los talleres tienen dos estructuras distintas (36 y 37) — sin aplicar

Al revisar los cupos salió que «taller de dos días» significaba dos cosas
distintas, y el modelo solo sabía expresar una.

**T04 eran dos grupos, no uno de setenta.** 35 personas el jueves y 35 distintas
el viernes. La nota del programa lo decía —«trabajará con grupos distintos»— y el
propio programa los numera aparte, el 4 y el 11; fui yo quien los unió al ver el
mismo nombre y tallerista. Con un solo taller de 70 y dos días, nada impedía que
las 70 inscripciones cayeran el mismo día: el cupo se cuenta por taller, no por
día. Partirlo en dos de 35 lo arregla **sin tocar el esquema**.

**T03, T05 y T06 sí son un solo grupo de 30 que asiste las dos tardes.** Y eso
rompía el escaneo, porque el pase de lista de taller compartía la comprobación
del día con la puerta (`v_p.dia <> p_dia`). Para esas 90 personas era pantalla
roja el segundo día por presentarse justo donde debían.

La comprobación se separa por modo, porque son dos preguntas distintas:

| Modo     | La pregunta        | La responde                      |
| -------- | ------------------ | -------------------------------- |
| `puerta` | ¿te toca hoy?      | el día asignado del participante |
| `taller` | ¿tu taller es hoy? | `taller_dias`                    |

A las conferencias se va una sola vez, la del día asignado; el otro día se vuelve
a las 15:00 solo al taller, que además es en otro edificio y ni siquiera cruza la
puerta de las conferencias.

De paso el modo taller gana dos comprobaciones que le faltaban y que la del día
venía tapando por accidente: que la persona esté inscrita en algún taller, y que
ese taller se imparta hoy. Antes, a alguien con taller del día 1 que llegara el
día 2 lo rechazaba la regla del día asignado; ahora lo rechaza la razón
verdadera, y el mensaje se la dice: «su taller se imparte el día 1».

El mismo cambio va en `src/lib/escaneo.ts`, que es el motor local con el que se
decide cuando no hay red. Las dos reglas tienen que decir lo mismo.

### Las fechas reales del programa (34)

La siembra inicial puso el evento en el 14, 15 y 16 de octubre. El programa
oficial que entregó la universidad lo sitúa un día después: **jueves 15, viernes
16 y sábado 17**.

Manda el documento porque cuadra consigo mismo y la siembra no: en 2026 el 15 de
octubre cae en jueves, el 16 en viernes y el 17 en sábado, tal como los nombra.
El 14 habría sido miércoles, y ningún día del programa se llama así.

No es cosmético. `dias_evento.fecha` es contra lo que la puerta compara para
decidir si alguien viene el día que le toca: con un día de desfase, el jueves 15
el escáner habría marcado en rojo a todo el que tuviera asignado el día 1.

La migración también corrige el texto de `fechas`, que es lo que el alumno lee
antes de depositar. No toca las sedes —el programa también las contradice, pero
eso necesita una decisión de diseño, ver abajo— ni la fecha límite, que sigue
siendo anterior al evento y se cambia desde `/admin/configuracion`.

### Talleres, sedes y cuota del programa oficial (35)

**Las sedes.** Quedan Salón SUTERM el día 1 y Centro de convenciones Teziutlán
los días 2 y 3. «Teatro Victoria», que la siembra ponía el día 3, no aparece en
el programa por ninguna parte: era invento.

Esa columna guarda la sede de las **ponencias**, que es a donde se llega por la
mañana y lo que imprime el comprobante. Los talleres son por la tarde en otro
edificio —Instalaciones UPN U-212— y ese dato no cabía aquí: viaja en la columna
`lugar` de cada taller, que ya existía.

**Los puntos del día 2 se vacían.** La migración 32 les cargó los de SUTERM
cuando se creía que ese día era ahí. Ahora es en el Centro de convenciones, así
que los tres nombraban lugares inexistentes. Vacío cae a la lista genérica y el
capturista sigue trabajando; un punto con nombre falso habría dejado reportes que
dicen «Puerta 1 SUTERM» de un día que no fue en SUTERM, y eso ya no se desmiente
después.

**Los once talleres.** Todos en la UPN U-212, por la tarde, a 100 pesos, con cupo
de 30 salvo `T04`, que el programa fija en 70 porque su tallerista trabaja con
grupos distintos.

Cuatro de ellos —`T03`, `T04`, `T05` y `T06`— se imparten **los dos días**. Para
eso existía `taller_dias`.

El programa los marca de dos maneras, por si hay que releerlo: a `T03`, `T05` y
`T06` los repite en la tabla del día 2 sin volver a numerarlos, que es la pista
de que son los mismos; a `T04` sí le pone número propio (el 11), pero es el mismo
taller —mismo tallerista, título, lugar y horario que el 4 del día 1— y la nota
del día 1, «trabajará con grupos distintos», dice justamente eso.

**Lo de `T04` quedó mal aquí y lo corrige la 36.** No eran 70 en un taller de dos
días: eran dos grupos de 35, uno por día. Ver más arriba.

**El día 3 no tiene talleres**: es el de la clausura. No hace falta prohibirlo por
separado — como ningún taller declara ese día, la llave foránea compuesta contra
`taller_dias` ya no admite la combinación.

**La cuota baja de 650 a 500.** Son 500 las conferencias y 600 con talleres, y
como los dos conceptos se cobran y concilian por separado, la diferencia va en el
costo del taller: 500 + 100 = 600.

### La puerta como torniquete (31)

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

### Puntos de captura por día (32)

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
que eso cuesta: la 31 parecía correcta en el archivo y dejó dos funciones
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
