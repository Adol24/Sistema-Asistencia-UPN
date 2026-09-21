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

**La 40, la 41, la 42 y la 43 también**, el 2026-09-21, en ese orden. El
comprobante termina en **LA CONEXIÓN FUNCIONA**, sin fallas.

```
OK     día 1: «Salón SUTERM»        OK  día 1: aforo 700
OK     día 2: «Salón SUTERM»        OK  día 2: aforo 700
OK     día 3: «Teatro Victoria»      OK  día 3: aforo 600
OK     dias_evento.puntos sembrado: 2 días con la puerta de SUTERM
OK     «Licenciatura en Educación e Innovación Pedagógica» se cuenta por módulos hasta 13
OK     ningún otro programa declara excepción: los demás heredan de su nivel
```

### El dominio institucional se queda vacío, y es una decisión

`configuracion_evento.dominio_institucional` **no es un pendiente**. En la UPN
212 **nadie tiene cuenta institucional** —ni alumnos ni docentes—: cada quien se
registra con el correo que usa. Dicho por la organización el 2026-09-21.

Conviene saber por qué no se llena «por si acaso», porque el campo parece
inofensivo y no lo es. Es **un interruptor con dos filos opuestos**:

| Quién se registra | Qué hace el dominio si se llena |
| --- | --- |
| Alumno (`fn_preregistrar_alumno`) | **Le exige** ese correo. Con gmail, lo rechaza. |
| Docente o externo (`fn_preregistrar_externo`) | **Le prohíbe** ese correo: «entra como alumno». |

Llenarlo cerraría el hueco del duplicado a cambio de dejar fuera del evento a
todo el que no tenga esa cuenta. **Ya pasó una vez**: la base vino sembrada con
`alumnos.universidad.mx`, un dominio inventado, y ningún alumno podía
pre-registrarse hasta que la 22 —`20260910180000_correo_personal_del_alumno`— lo
vació.

Lo que queda al descubierto, y se acepta: **el alumno que NUNCA se pre-registró**
puede sacar un segundo folio por `/registro` como externo. La primera regla de la
40 sí actúa —si ya tiene folio, su correo lo delata—, y el padrón guarda
matrícula y nombre pero no correo, así que no hay con qué comparar a quien aún
no existe en `participantes`. Un duplicado se limpia; alguien que no puede
inscribirse, no.

El comprobante ya no lo marca en rojo. Lo dice en verde y enumera lo que queda
abierto, que es lo honesto: avisar de algo que está bien enseña a ignorar los
avisos.

**De la 40 no hay prueba directa**, y conviene decirlo: solo reemplaza el cuerpo
de `fn_preregistrar_externo` sin cambiar su firma, y esa función está cerrada al
anónimo. Es el mismo punto ciego que la 37. Se corrió igual porque volver a
correrla es inofensivo, que sale más barato que la duda. Su segunda regla
—la que caza al alumno que nunca se pre-registró— **sigue dormida** hasta que se
llene `dominio_institucional`.

La 41 arregló de paso una falla que ya venía saliendo: la de los puntos de
captura del día 2, que la 35 había vaciado al creer que ese día cambiaba de
sede. El día 3 sigue sin puntos a propósito: el Teatro Victoria es otra sede y
aún no sabemos cómo se llaman sus accesos.

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
Ninguna migración los apaga: se desactivaron desde `/admin/talleres`, y ahí
mismo se vuelven a encender.

**Lo que eso deja, contado por días** (lo imprime `verificar-conexion`):

```
día 1: 2 talleres ·  60 lugares para un aforo de 700  [T05 T06]
día 2: 8 talleres · 280 lugares para un aforo de 700  [T05 T06 T07 T08 T09 T10 T11 T12]
día 3: 0 talleres ·   0 lugares para un aforo de 600
```

Los cuatro apagados son los que sostienen el día 1: T01 (habilidades
emocionales), T02 (humanismo y práctica docente), T03 (emociones y
responsabilidad docente) y T04 —el grupo del día 1 de decolonialidad, cuyo
hermano del día 2, T12, sí está activo—. Encenderlos llevaría el día 1 de 60 a
220 lugares.

El día 3 sin talleres **es de diseño**: ningún taller declara ese día, y la 33
lo dejó escrito. El día 1 con 60 lugares para 700 personas no lo es
necesariamente, y por eso se imprime: el reparto de días es ciego a esta cuenta
—`fn_dia_mas_vacio` reparte por aforo de la sede— y puede mandar a cientos de
personas a un día donde casi no hay taller que elegir.

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

### El avance lo manda el programa (43)

Va después de las dos del aforo, pero no depende de ellas: toca `programas` y
`padron_alumnos`, que las otras no tocan.

**Qué la provocó.** El padrón oficial de Servicios Escolares
(`plantilla-padron-oficial.xlsx`) trae una hoja «MÓDULO 13» con 293 alumnos de la
**Licenciatura en Educación e Innovación Pedagógica**, y su avance es el módulo
13. El sistema creía que el NIVEL decide cómo se cuenta el avance y hasta dónde
llega —Licenciatura → «Semestre», 1 a 8—, así que las 293 se rechazaban con
«Semestre 13 está fuera de rango: ese nivel llega a 8».

**Por qué no bastaba subirle el tope a Licenciatura.** Son seis licenciaturas y
solo esa va por módulos. Poner 13 a todas habría dejado pasar un «Semestre 11» de
Pedagogía y lo habría impreso en su comprobante.

**Lo que hace.** `programas` estrena `etiqueta_avance` y `total_avance`, las dos
NULL por omisión. NULL significa «me cuento como diga mi nivel», y ocho de los
nueve programas se quedan así. Solo la LEIP se llena, con «Módulo» y 13. Que la
excepción se vea como excepción es el punto.

`fn_validar_avance` conserva su firma —`create or replace` mantiene sus
concesiones, y no hay que recorrer `pg_proc`— y solo cambia a quién le pregunta:
`coalesce(programa, nivel)`. Su disparador **sí** cambia, porque ahora también
tiene que vigilar `programa_id`: cambiar de Pedagogía a Innovación Pedagógica
mueve el tope sin cambiar de nivel.

**Trae un freno.** Si al aplicarla el catálogo ya tiene programas y ninguno se
llama como la LEIP, la migración se detiene diciéndolo. Sin ese freno, un
renombre dejaría la excepción sin aplicar y el padrón volvería a rechazar 293
filas sin motivo visible.

**Se puede correr dos veces.** Las columnas entran con `if not exists` y las
restricciones dentro de un `do $$` que pregunta por `pg_constraint`, igual que
hizo la 42 con `dias_evento.cupo`. Importa porque estas migraciones se aplican a
mano desde el editor SQL, donde nada lleva la cuenta de cuáles ya corrieron.

**Y se puede comprobar**, al revés que la 37: `programas` está abierta al
anónimo, así que `bun run verificar-conexion` mira sus columnas nuevas y dice si
la excepción está puesta. También avisa si hay **más de un** programa
declarándola: copiar «Módulo 13» al resto de las licenciaturas dejaría pasar un
semestre 12 de Pedagogía.

**Los 13 módulos los dijo la organización**, no el archivo: 13 es el valor más
alto que aparece, que no es lo mismo que el tope del plan. Desde esta migración,
además, el tope se puede corregir desde `/admin/configuracion` sin otra
migración.

### El aforo de cada sede (41 y 42)

Van juntas y en ese orden: la 41 dice **dónde** es cada día y la 42 dice
**cuánta gente cabe** ahí. Separarlas es a propósito —la sede es un dato y el
aforo es una regla nueva— pero aplicar solo la 42 dejaría los aforos colgados de
las sedes equivocadas.

#### La 41 · los tres lugares definitivos

La organización corrige lo que la 35 leyó del programa oficial en Word:

| Día | Fecha | Decía la 35 | Dice la organización |
| --- | --- | --- | --- |
| 1 | jue 15 oct | Salón SUTERM | Salón SUTERM |
| 2 | vie 16 oct | Centro de convenciones Teziutlán | **Salón SUTERM** |
| 3 | sáb 17 oct | Centro de convenciones Teziutlán | **Teatro Victoria** |

Manda la organización y no el documento: el programa es el de las ponencias y se
redactó antes de cerrar la logística. Queda escrito en la migración para que
dentro de un mes nadie «arregle» las sedes volviendo a abrir el Word.

Las fechas **no se tocan**: la 34 ya las dejó en 15, 16 y 17, y ahí el documento
y la organización coinciden.

Los puntos de captura del día 2 vuelven a los de SUTERM. El día 3 se queda vacío,
igual que antes: el Teatro Victoria es otra sede y aún no sabemos cómo se llaman
sus accesos.

#### La 42 · el aforo, y quién lo respeta

`dias_evento` estrena columna `cupo`: **700 · 700 · 600**. El día 3 admite menos
porque es otro edificio, y por eso el aforo vive junto a la sede y no como un
número suelto en `configuracion_evento`.

**Ocupa lugar quien se pre-registró, haya pagado o no.** No se exige el pago
porque entonces el aforo solo se sabría después de la fecha límite, cuando ya no
sirve. Un pre-registro `expirado` sigue ocupando: ese estado lo deriva el reloj, y
los lugares no deben devolverse solos a las 18:00 del 9 de octubre sin que nadie
lo decida.

El techo va en dos sitios y hacen falta los dos:

| Dónde | Contra qué cuenta | Qué pasa al llegar al tope |
| --- | --- | --- |
| Pre-registro | `participantes` | Se rechaza el alta |
| Reparto de días | `padron_alumnos.dia` | No se asigna ese día |

Con solo el primero, Servicios Escolares podría repartir 900 alumnos al día 3 y
el sistema lo dejaría: los primeros 600 entrarían bien y los otros 300 rebotarían
de uno en uno, ya con la fecha encima, sin que nadie hubiera avisado.

**El alumno cuyo día ya está lleno se rechaza, no se mueve.** Es decisión de la
organización. Reubicarlo solo lo dejaría dentro sin que nadie hiciera nada, pero
el día de un alumno se reparte por plantel, programa y grupo para que los
compañeros coincidan, y moverlo en silencio deshace ese reparto. El docente y el
externo sí eligen día, así que a ellos se les dice «elige otro».

Lo que la 42 cambia, en orden:

- `dias_evento.cupo`, sin DEFAULT: se añade vacía, se llena y solo entonces se
  exige `not null`. Un `default 0` habría dejado los tres días llenos durante un
  instante, y un `default 9999` habría hecho que un día mal configurado pareciera
  correcto.
- `v_cupo_dia`, **pública**, con los lugares libres de cada día. Sin
  `security_invoker`, por la misma razón que `v_talleres`: cuenta filas de
  `participantes`, que el público no puede leer, y la pantalla de «elige tu día»
  necesita saber si su día se llenó antes de elegirlo. Solo expone agregados.
- `v_reparto_dias` gana `cupo` y `libres`, para que la organización vea el reparto
  contra su techo.
- `fn_dia_mas_vacio` deja de repartir «al que tenga menos gente» y reparte **al
  proporcionalmente más vacío**. Con tres aforos iguales daba lo mismo; con 700,
  700 y 600 no: el día 3 habría recibido a todo el mundo hasta empatar con los
  otros dos y se habría llenado primero siendo el más pequeño. Devuelve `NULL` si
  los tres llegaron a su tope.
- Las dos altas comprueban el aforo bajo `pg_advisory_xact_lock` por día. Sin el
  candado, dos personas que pulsan «confirmar» a la vez leen las dos «queda 1» y
  entran las dos. Es por día, así que el día 1 no hace cola con el día 2, y no
  toca `dias_evento`, así que no estorba a la puerta.
- `fn_asignar_dia_a_varios` —el «todos los de Psicología al día 2» de
  `/admin/padron`— falla entera o no hace nada, y dice cuántos caben. Meter a los
  30 primeros de 80 dejaría a la organización creyendo que movió a los 80.

Las firmas de las dos altas **no cambian**, así que aquí no muerde la trampa de
más abajo; aun así se recorren `pg_proc` y se vuelven a cerrar, como la 39 y la 40.

La migración termina contando lo que encuentra. **Puede avisar de sobrecupo ya
existente**, porque hasta ahora nada impedía repartir 900 alumnos a un día ni
pre-registrar a 800 en otro. No echa a nadie —borrar pre-registros que la gente ya
vio confirmados sería peor— y avisa para que la organización decida.

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
