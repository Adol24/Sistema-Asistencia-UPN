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
incluidas.

**La 36, la 37 y la 38 también, el 2026-09-17.** El comprobante termina con una
sola falla, y es la conocida de los puntos de captura.

**La 39 también**, el mismo día. Recreaba las dos altas, o sea el caso en que la
trampa de más abajo muerde; no mordió, porque la firma no cambiaba y
`create or replace` conservó las concesiones. Comprobado: las dos siguen
respondiendo al rol anónimo y llegan a sus validaciones internas.

Su índice `uq_participante_sin_matricula` **no se ve desde la clave anónima**
—`participantes` está cerrada y `pg_indexes` no se expone—. Para mirarlo con
permisos:

```sql
select indexdef from pg_indexes where indexname = 'uq_participante_sin_matricula';
```

No había duplicados previos: si los hubiera, la migración se habría detenido
enumerándolos en vez de aplicarse.

**Pendiente: la 40** —`20260917160000_un_alumno_no_es_externo`—, que le cierra el
formulario de externo a un alumno. Ver abajo, e **importante**: trae dos reglas y
una de las dos está dormida hasta que se llene un campo del panel.

De la 38 se comprueban cuatro cosas y las cuatro contestan: las dos altas exigen
`p_acepto_aviso`, y las dos firmas viejas —las que dejarían registrarse sin
aceptar nada— ya no existen. La 38 **sí cambiaba la firma** de las dos altas, y
por eso empezaba tirándolas por nombre antes de recrearlas: es exactamente el
caso que describe la trampa de más abajo.

De la 36 se comprueba `T12`: existe, con cupo 35 y solo el día 2. Se pregunta por
T12 y no por T04 porque `talleres_lectura` esconde al anónimo los inactivos —y
T01 a T04 lo están—, así que preguntar por T04 no distingue «no existe» de «no me
lo dejan ver».

### La 37 no se puede comprobar desde el comprobante

Y conviene saberlo antes de confiar en un «LA CONEXIÓN FUNCIONA». Solo cambia el
CUERPO de `fn_evaluar_escaneo` —la misma firma—, y esa función está cerrada al
anónimo: llamarla devuelve 42501 igual antes que después. Su otra huella es el
`comment on function`, que vive en `pg_catalog` y PostgREST no expone.

Para saberlo hace falta una sesión con permisos:

```sql
select obj_description('fn_evaluar_escaneo(text,smallint,text)'::regprocedure);
```

y ver si menciona los días del taller. O la prueba de verdad: escanear a alguien
de T05 o T06 el segundo día de su taller y comprobar que pasa en vez de salir en
rojo. El comprobante sí avisa de lo que esa migración necesita leer —que T05 y
T06 conserven sus dos días—, pero eso es una precondición, no una prueba.

Al mirar los talleres para saber si la 36 había corrido salió otra cosa, que no
es una migración: **T01, T02, T03 y T04 están inactivos** en el proyecto real. La
política `talleres_lectura` los oculta al anónimo (`using (activo or
es_interno_activo())`), así que el pre-registro ofrece ocho talleres de los doce.
Si no es deliberado, se activan desde `/admin/talleres`.

Eso incluye a T04, o sea que **el grupo del día 1 del taller de decolonialidad no
se puede elegir y el del día 2 sí** —T12 nació activo—. Los 35 lugares del
jueves están ahí pero nadie los ve.

### Lo que sigue abierto del pre-registro doble

El alumno **sí** está protegido, y por el esquema y no por la aplicación:
`matricula text unique` desde la migración 6. Dos veces con la misma matrícula
devuelven el mismo folio, y desde la 39 también si las dos peticiones corren a
la vez.

Lo que ninguna migración impide todavía son dos caminos, y los dos son
decisiones pendientes, no descuidos:

1. **El mismo alumno regresando por `/registro`** como docente o externo. Lo
   cierra la 40, con la salvedad de su segunda regla dormida: hasta que
   `dominio_institucional` se llene, el alumno que nunca se pre-registró sigue
   pudiendo entrar por ahí.
2. **La misma persona con dos correos distintos**, sin matrícula. No hay
   identidad con la que deduplicar: dos correos son dos personas. Atarlo a
   nombre + institución tendría falsos positivos —dos homónimos de la misma
   universidad existen— y rechazaría a alguien real.

Y lo que no son migraciones: los **días 2 y 3** no tienen puntos de captura, y a
los talleres les falta descripción. Ambas cosas se llenan desde el panel
—`/admin/configuracion` y `/admin/talleres`— sin tocar la base.

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

### Un alumno no se inscribe como externo (40) — sin aplicar

La 39 cerró el pre-registro doble por los dos lados que tenía. Quedaba un tercer
camino que ningún índice ve: el mismo alumno volviendo por `/registro` como
docente o externo. Ahí su matrícula viaja NULA, así que no choca con su propia
fila ni con el índice parcial, porque ese compara `(perfil, correo)` y el perfil
es otro.

Dos comprobaciones en `fn_preregistrar_externo`, antes de cualquier escritura:

1. **Ese correo ya está registrado como alumno** → se rechaza. Exacta, sin
   falsos positivos: esa fila la creó esa persona.
2. **Ese correo es del dominio de alumnos** → se rechaza. Es la que caza al
   alumno que **todavía no se ha pre-registrado**, y la primera no puede verlo:
   el padrón guarda matrícula y nombre, no correo, así que sin fila en
   `participantes` no hay nada con lo que comparar.

**La segunda está dormida.** `configuracion_evento.dominio_institucional` está en
NULL en el proyecto real, y con ella apagada el hueco sigue abierto para quien
entra directo por `/registro`. Llenarlo en `/admin/configuracion` es lo único que
lo cierra del todo; el comprobante ahora lo reporta como FALLA en vez de callarlo.

También se adelanta en el navegador (`src/routes/registro.tsx`): si el dominio
está configurado y el correo es de ahí, se para en el campo con un enlace a
`/alumno`, en vez de al final del recorrido. Rechazar a alguien sin enseñarle por
dónde sí es lo que convierte un error en un mensaje a soporte.

**Lo que NO se hace:** comparar el nombre contra el padrón. Cazaría más casos y
se descarta por el precio del error: dos homónimos de la misma universidad
existen, y a un externo real rechazado por llamarse igual que un alumno no le
queda salida —no tiene matrícula con la que entrar por el otro lado—. Antes un
duplicado detectable que alguien legítimo fuera del evento.

### El docente y el externo se podían pre-registrar dos veces (39) — aplicada

En `participantes` solo hay dos cosas únicas: el `folio`, que genera una
secuencia, y la `matricula`. Y la matrícula es **nula** para el docente y el
externo. O sea que para dos de los tres perfiles no había ninguna restricción
que impidiera dos filas de la misma persona.

La 30 ya había atacado esto y arregló el caso secuencial: antes de insertar, las
altas buscan si esa persona ya se pre-registró y devuelven SU folio. Lo que
quedó abierto fue la **carrera**: buscar-y-después-insertar sin nada que
serialice las dos cosas. Dos peticiones a la vez —dos pestañas, o el doble clic
de quien ve que no pasa nada— hacen la búsqueda las dos antes de que cualquiera
inserte, las dos concluyen «esta persona no está», y las dos insertan.

Al alumno lo detiene el índice único de su matrícula, aunque de mala manera:
revienta con una violación de unicidad al final de todo el recorrido, sin folio.
Al docente y al externo **no los detiene nada**, y salen dos folios con su cuota
esperada cada uno, contando doble en cupos y reportes. No se ve un error: se ven
dos inscripciones legítimas.

Dos partes:

1. Un índice único parcial `(perfil, correo) where matricula is null`. Es el par
   con el que la propia función reconoce a la misma persona, así que la regla
   que ya estaba en el código pasa a estar también en el esquema, que es donde
   una carrera no la puede saltar.
2. Las dos altas atrapan `unique_violation`, releen la fila que ganó la carrera
   y devuelven SU folio. Dejan de ser «reentrantes si nadie corre a la vez».

**Las firmas no cambian**, así que `create or replace` conserva las concesiones;
se vuelven a cerrar igual recorriendo `pg_proc`.

El cerrojo del navegador va aparte, en `src/routes/talleres.tsx`: un `ref` que se
echa en la misma pulsación, porque `disabled={registrando}` no llega a tiempo
—entre el clic y el redibujado hay ventana—. Los dos hacen falta: el ref evita
que la carrera se produzca desde una pestaña, y el índice importa cuando se
produce desde dos.

### El aviso de privacidad no se le enseñaba a nadie (38) — aplicada

`configuracion_evento.aviso_privacidad` existe desde la migración 2, es `not
null`, y se edita desde `/admin/configuracion`. Dice lo que tiene que decir: que
los datos se usan solo para el registro, la asistencia y la constancia, que no se
comparten con terceros, y a quién escribir para corregirlos o darse de baja.

Y no salía en ninguna pantalla pública. Se pedían correo y celular con el texto
que lo explicaba guardado en la misma base.

Ahora se acepta al capturar los datos —`/completar-datos` para el alumno,
`/registro` para docente y externo—, que es **antes** de recogerlos. Y queda
constancia: `participantes.acepto_aviso_en`. Una casilla que solo bloquea un
botón se borra al recargar y no deja nada que enseñar si alguien pregunta.

La columna queda **NULA** para quien se pre-registró antes. Ponerle `now()` a
esas filas las marcaría como si hubieran aceptado algo que nunca vieron, que es
justo el dato que no quieres tener el día que te lo reclamen. En el reporte
nuevo —«Aceptación del aviso de privacidad»— esas filas dicen «no consta», que no
es lo mismo que una celda vacía.

Las dos altas ganan `p_acepto_aviso boolean`, **sin valor por defecto**: con
`default false` una llamada vieja seguiría compilando y crearía el registro sin
consentimiento, en silencio. La función rechaza el alta si no llega en `true`, o
sea que la regla vive en la base y no solo en la pantalla.

Al volver atrás para cambiar de taller se conserva la **primera** aceptación
(`coalesce(acepto_aviso_en, now())`): retroceder no vuelve a otorgar nada.

### Los talleres tienen dos estructuras distintas (36 y 37) — aplicadas

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
