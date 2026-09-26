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

**Y el 2026-09-24 se le quitó un rojo falso.** Denunciaba que la ventana de
docentes y externos «no admite a nadie» porque no tiene filas en
`ventana_cohortes`, cuando esa ventana admite por `ventana_perfiles` —docente y
externo no pertenecen a ningún programa— y él mismo confirmaba dos líneas más
abajo que los dos leen su aviso. Terminaba siempre en «1 PROBLEMAS», y un
comprobante que siempre sale en rojo se mira por encima el día que el rojo es de
verdad. Ahora mira las dos formas de admitir y solo falla si no hay ninguna.

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

**Y todas las de los días 24 y 25 también**, comprobado el 2026-09-26 con la
clave anónima preguntando por el efecto observable de cada una: las dos del
calendario oficial, el módulo que trae el alumno, los módulos bajos de LEIP, el
whatsapp real, la entrega en Aportaciones, el salón de cada taller, las citas de
pago de LEIP, la ventana en la ficha, el día de reinscripción, las maestrías en
módulo 1 y 3, y el día único para dejar el voucher. Ninguna quedó pendiente.

Este archivo decía lo contrario de siete de ellas —«SIN APLICAR»— durante días.
Escribir el rótulo al terminar de redactar la migración es justo el modo de fallar
que advierte la primera línea de este documento: **una migración está aplicada
cuando la base contesta lo que debe.** Los rótulos de abajo ya dicen con qué
respuesta se comprobó cada una.

#### Tres trampas al preguntarle a la base si algo está puesto

La primera vuelta de esa comprobación dio dos veredictos falsos, y los dos por el
modo de preguntar, no por la base:

- **`head: true` se come el cuerpo del error.** `select("x", { head: true })` pide
  sin cuerpo, así que una tabla que ya no existe —404 `PGRST205`— llega al cliente
  como «sin error, cero filas», indistinguible de una tabla vacía. Con una
  petición normal el código sale a la vista.
- **`42501` prueba que la tabla EXISTE.** «Permiso denegado» solo se contesta
  sobre algo que se encontró; una tabla ausente contesta `PGRST205` o `42P01`. Un
  comprobante que trate los dos como «no está» declara pendiente lo que ya se
  aplicó, y es lo que pasó con `dia_entrega_voucher`.
- **Los nombres de los parámetros importan.** `fn_motivo_fuera_de_ventana` toma
  `p_programa`, no `p_programa_id`; con el nombre inventado PostgREST contesta
  `PGRST202`, que es lo mismo que contesta cuando la función no existe.

`supabase/utilidades/estado-de-migraciones.sql` hace esto mismo con permisos y sin
esas trampas, pero solo llega hasta `20260923200000`: las de los días 24 y 25 no
están ahí todavía.

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
**Corrección del 2026-09-21: no estaban apagados, estaban BORRADOS.** Al
mirarlos con permisos, `talleres` tenía ocho filas. Desde el rol anónimo las dos
cosas se ven igual —`talleres_lectura` es `using (activo or
es_interno_activo())`, así que ni el apagado ni el inexistente aparecen— y todo
lo que se dedujo desde fuera encajaba con las dos explicaciones.

`/admin/talleres` tiene un botón de eliminar junto al interruptor de activo.
Quien quiso apagarlos los borró. Los restituye la **45**
(`20260921160000_devolver_los_talleres_del_dia_1`), y el comprobante ya enumera
las claves ausentes diciendo que no puede distinguir un caso del otro.

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

### La 46 tampoco se puede comprobar desde el comprobante

Igual que la 37, y por la misma clase de motivo: `bun run verificar-conexion`
pregunta con la clave publicable, y la pertenencia a una publicación se lee de
`pg_publication_tables`, que no se expone por PostgREST.

**Abrir la escucha no lo comprueba.** Se probó: suscribirse a
`ventanas_preregistro` —que a propósito NO está publicada— devuelve
`SUBSCRIBED` igual que `participantes`. El canal se abre y luego no llega
nada, que es exactamente el fallo que esta migración viene a arreglar, así que
esa señal no distingue las dos situaciones.

Para verlo de verdad, en el editor SQL del proyecto:

```sql
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;
```

Deben salir 17, y entre ellas `bitacora`, `niveles_academicos`, `planteles` y
`programas`. NO debe salir `ventanas_preregistro`.

La prueba práctica, si no se quiere abrir el editor: dos pestañas con sesión de
administración, una en `/admin/bitacora` y otra en cualquier pantalla que
escriba —dar de alta un taller, por ejemplo—. La anotación tiene que aparecer
en la primera sin recargarla.

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

### El cupo de un taller de dos días es compartido, y está bien

Se estuvo a punto de «arreglar» algo que no estaba roto, así que queda escrito.

`talleres.cupo_total` es un número por taller y `v_talleres` cuenta sus
inscritos **sin mirar el día**. En un taller de dos fechas el cupo se comparte
entre las dos, y eso es lo correcto:

| Taller | Días | Cupo | Qué significa |
| --- | --- | --- | --- |
| T03, T05, T06 | 1 y 2 | 30 | **30 lugares en total.** Quien lo elige ocupa uno, venga el día que venga. |
| T04 / T12 | 1 / 2 | 70 + 70 | **Dos grupos con listas distintas.** Por eso son dos claves. |

La decolonialidad es el único caso de dos grupos, y con un solo renglón los del
jueves y los del viernes competirían por el mismo cupo. La duplicación que se ve
en el panel no es un defecto: son dos grupos de verdad. El alumno no la ve nunca,
porque `/talleres` solo le ofrece los de su día.

**Cuidado con la lectura fácil**: «van las mismas 30 personas los dos días»
significa los mismos 30 LUGARES, no las mismas 30 personas asistiendo dos veces.
Una persona va a **un solo día** del evento. Leerlo al revés lleva a dar cupo por
día y a anunciar el doble de lugares de los que existen.

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

## Los dos números, y por qué no hay que fiarse de ninguno

**Para aplicar y para comprobar, se usa el NOMBRE DEL ARCHIVO. No el ordinal.**

En este repo el ordinal significa dos cosas distintas, y ya no coinciden:

1. **La posición en la carpeta** — `ls supabase/migrations/*.sql | nl`.
2. **El número que el archivo declara en su encabezado** — la línea `-- NN · …`.

Divergen desde `20260921180000_publicar_lo_que_faltaba`, que **no declara
ninguno** y además comparte marca de tiempo con el archivo anterior. De ahí en
adelante, **posición = encabezado + 1**:

```
pos 46  hdr 46   los_dos_grupos_de_decolonialidad_son_de_70
pos 47  hdr —    publicar_lo_que_faltaba            <-- aquí empieza la deriva
pos 48  hdr 47   el_padron_planea_y_el_preregistro_reserva
…
pos 60  hdr 59   el_cupo_del_taller_que_no_comprobaba_nadie
pos 61  hdr 60   el_taller_no_depende_del_dia_del_evento
pos 62  hdr 62   la_salida_que_nadie_dio            <-- salta el 61
```

O sea que **«la 60» nombra dos migraciones distintas** según quién lo diga, y el
encabezado 61 no lo usa nadie. No se renumera: los encabezados están citados
dentro de decenas de comentarios que se referencian entre sí —«ver la 39», «la
25», «desde la 62»—, en las migraciones y también en `tipos.ts` y
`elegibilidad.ts`. Renumerar sería reescribir todo eso para ganar cosmética.

Lo que se hace es **no depender del ordinal para nada que importe**. La marca de
tiempo es lo único único de verdad, es lo que ordena a Postgres y es lo que usa
`supabase db push`. Por eso `supabase/utilidades/estado-de-migraciones.sql`
etiqueta por marca de tiempo y slug, y no por número.

Los números que siguen en este documento son **encabezados**, y se conservan
porque son los que citan los comentarios. Para localizar el archivo, el slug.

Esto ya había mordido una vez por el otro lado: este documento llamaba «30» a la
del torniquete cuando era la 31, y todo lo que se numeró encima heredó el error.

## Qué hicieron las últimas

### El aviso ya no promete otro taller (`20260926140000`) — SIN APLICAR

Este rótulo dice lo que dice: el archivo existe y **la base todavía no lo ha
contestado**. Y esta es de las que no se pueden comprobar con la clave anónima:
`avisos_participante` está cerrada y sus filas solo salen por `fn_portal_estado`,
que exige el folio y la credencial de una persona concreta.

No toca el esquema ni ninguna función. Reescribe el TEXTO de las filas que ya
están en `avisos_participante` y que dicen «Puedes elegir otro taller», porque
hoy eso es mentira: el taller no se cambia una vez cerrado el pre-registro, y
**no hay ninguna pantalla —pública ni interna— que cambie el de un inscrito**.
`fn_cambiar_taller` está revocada a `public`, `anon` y `authenticated`, y solo la
llaman las dos altas del pre-registro.

Esos avisos los escribieron `fn_reasignar_dia`, `fn_asignar_dia_a_varios` y
`fn_guardar_taller` cuando cambiar de día liberaba la inscripción al taller.
`20260923140000` les quitó esa liberación y con ella el `insert`, pero las filas
ya escritas se quedaron, y `fn_portal_estado` sigue devolviendo las que tienen
`visto_en is null`. El botón «Elegir otro taller» que las acompañaba se quitó de
`/portal/estado` el 2026-09-26 (`8f1f938`); el texto vive en la base y no se fue
con él.

Reescribe **solo la segunda frase**, con `replace` de un trozo exacto. La primera
—«Cambiaste al día 2 y el taller «T07» no se imparte ese día, así que tu
inscripción se liberó»— sigue siendo cierta y lleva el dato que la persona
necesita; además el día y la clave se interpolaron con `format` al escribir la
fila, así que un texto nuevo no podría reconstruirlos. Y solo las de
`visto_en is null`, que son las únicas que alguien puede llegar a leer: una fila
marcada como vista es el registro de lo que ya se le dijo a esa persona.

Trae sus dos comprobaciones dentro:

- **Antes de tocar nada**, pregunta a `pg_proc` si alguna función sigue
  insertando la promesa. Si aparece alguna se detiene sin reescribir: significaría
  que la 60 no está puesta en esa base, y entonces el problema es ese.
- **Al terminar**, busca `Puedes elegir otro` suelto. Si queda alguna variante que
  la migración no conoce —una escrita a mano por soporte— las enumera y lanza
  excepción en vez de dar el trabajo por hecho.

Se puede volver a aplicar: `replace` sobre una fila ya reescrita no encuentra nada
que sustituir.

**Puede que no reescriba ninguna fila, y eso no es un fallo.** Si nunca se movió
a nadie de día antes del 2026-09-23, no existen filas con ese texto; lo dice al
aplicarse, con un `notice`. Para saberlo de antemano hacen falta permisos:

```sql
select count(*) filter (where visto_en is null) as por_leer,
       count(*) as todas
  from avisos_participante
 where texto like '%Puedes elegir otro%';
```

### El padrón planea también al repartir (`20260926120000`) — corrida, huella por comprobar

Adol la corrió en el editor SQL el 2026-09-26. El rótulo se queda a medias a
propósito: **desde la clave anónima esta migración no se puede comprobar**, y no
por descuido. Las dos funciones que redefine están revocadas de `anon` y de
`authenticated`, así que las dos contestan `42501` con el techo puesto y sin él —
el mismo código antes y después—. `verificar-conexion` solo puede confirmar que
existen y que siguen cerradas, que es lo que confirmaba ya.

Lo que lo cierra es su huella en `supabase/utilidades/estado-de-migraciones.sql`,
con una sesión con permisos:

```sql
select
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'fn_dia_mas_vacio'
             and pg_get_functiondef(p.oid) not like '%having%')          as sin_techo,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'fn_dia_de'
             and pg_get_functiondef(p.oid) like '%left join participantes p on p.dia = d.dia%')
                                                                        as cuenta_asientos;
```

Las dos en `true` y el rótulo pasa a «aplicada». Si solo sale una, falta la otra
mitad y hay que ponerla antes de repartir un padrón grande: ver abajo por qué una
sola es peor que ninguna.

Dos funciones pierden un tope que estaba contando lo que no debía:

- **`fn_dia_mas_vacio`** deja de tener techo. Devolvía NULL cuando los tres días
  llegaban a su aforo *en el plan*, así que un padrón de 2500 alumnos no se podía
  repartir más allá de 2000 —700 + 700 + 600— aunque ninguno de esos lugares
  estuviera ocupado todavía. Sigue eligiendo por proporción de ocupación, que es
  lo que mantiene los tres días parejos con aforos distintos.
- **`fn_dia_de`** deja de elegir por el plan y elige por asientos reales,
  contando `participantes`. Era la peor de las dos: la llama
  `fn_preregistrar_alumno`, y con el plan lleno una persona real leía «Ya no
  quedan lugares en ninguno de los tres días» con la sede medio vacía. Su
  excepción sigue ahí, pero ahora solo salta cuando el evento está lleno de
  verdad.

Es la regla que ya estableció
`20260921200000_el_padron_planea_y_el_preregistro_reserva` —el padrón PLANEA, el
pre-registro RESERVA— y que se quedó sin aplicar en estas dos. **El tope firme no
se toca**: `fn_preregistrar_alumno` y `fn_preregistrar_externo` siguen contando
`participantes` bajo `pg_advisory_xact_lock`.

Van juntas a propósito. Quitarle el techo al reparto sin arreglar `fn_dia_de`
habría convertido un padrón grande en pre-registros rechazados, que es un fallo
peor que el que se venía a corregir.

Del lado de la aplicación cambia lo mismo: `repartirDiasPendientes` reparte sin
techo y ya no devuelve `sinLugar`, y `/admin/padron` avisa en ámbar del día que
quede por encima de su aforo en vez de dejar gente sin día.

### El día único para dejar el voucher (`20260925160000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `dia_entrega_voucher`
existe —contesta `42501`, permiso denegado, que solo puede contestar una tabla que
está— y `dia_reinscripcion`, su nombre anterior, ya no existe (`PGRST205`). El
renombre corrió.

Lo que **no** se ve con la clave anónima son sus filas: la tabla está cerrada, así
que desde aquí no se puede confirmar que las 23 cohortes-plantel de licenciatura y
los posgrados quedaran cargados. Con permisos:

```sql
select p.nombre, pl.nombre as plantel, d.avance, d.grupo, d.fecha
  from dia_entrega_voucher d
  join programas p on p.id = d.programa_id
  join planteles pl on pl.id = d.plantel_id
 order by d.fecha, p.nombre, pl.nombre;
```

Si se aplicó entera no hace falta: su bloque final lanza excepción cuando las
cuentas no cuadran, así que una aplicación silenciosa ya es la prueba.

### Las maestrías van en módulo 1 y 3 (`20260925140000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `cita_cohortes` y
`ventana_cohortes` dan `[1, 3]` para los tres programas de nivel Maestría, y
ningún 4.

Las tres maestrías entraban con los módulos **1 y 4**. Son el **1 y el 3**,
dicho por la organización el 2026-09-25.

El 4 venía de traducir el calendario del Encuentro de forma mecánica: allí las
maestrías salen con los romanos **I y IV**, y IV se leyó como 4. Con LEIP la
regla resultó ser restar uno —II→1, VI→5, X→9, XIV→13— pero a las maestrías no
se les aplicó, porque I menos uno da cero y ahí la regla se rompía. Se dejaron
tal cual, y ese fue el error: **el IV sí corre, el I no**.

Con el 4 puesto, en la ventana del 27 y 28: quien va en módulo 3 lee «Todavía
no se anuncia la fecha de registro para tu grupo» el día que sí le toca, y
quien fuera en 4 se registraría un día que no es el suyo.

Se corrige en `ventana_cohortes` **y** en `cita_cohortes` a la vez. Cambiar solo
la ventana dejaría a esa generación registrándose sin saber qué día ir a pagar
— que es exactamente el agujero que abrió `20260924120000` con LEIP y que hubo
que cerrar después con `20260924230000`.

Se filtra por **nivel** y no por una lista de nombres: lo que define a las tres
es su nivel, y una lista escrita a mano es lo que se queda atrás el día que se
dé de alta una cuarta.

La etiqueta de la ventana pasa a «…y de los módulos 1, 3 y 5», porque esa frase
se le enseña a quien llega fuera de plazo y también tiene que decir la verdad.

### El día de reinscripción de LEIP (`20260925120000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `fn_cita_de_pago` responde, y la
tabla del calendario de pago existe.

Para LEIP —y solo para LEIP— el día de dejar el voucher **no es un rango**: es
un día concreto, y no puede ir antes ni después. Sale de la hoja «LEIP OCTUBRE
26» del calendario de reinscripciones de Servicios Escolares, elaborado el
17/08/2026.

Y no depende solo del módulo: depende de **sede, módulo y grupo** a la vez. Un
alumno de Teziutlán en módulo 9 va el 7 de octubre si es del grupo A o B, y el
8 si es del C o del D. Por eso no cabía en `cita_cohortes`, que solo conoce
programa y avance.

| Día | Sedes |
| --- | --- |
| 2 de octubre | Huehuetla, Hueyapan, Zapotitlán |
| 3 de octubre | Caxhuacan, Guadalupe Victoria, Hueyapan, Hueytamalco, Zapotitlán |
| 6 de octubre | Ayotoxco |
| 7 de octubre | Teziutlán |
| 8 de octubre | Teziutlán |

Son 66 grupos. La fecha límite de vouchers es el 10, así que ninguno se sale de
plazo.

**Los números de módulo.** La hoja habla de los módulos a los que el alumno
PASA al reinscribirse; el padrón del Encuentro se carga antes, así que trae el
anterior: la hoja dice 2, 6, 10 y 14 y el padrón guarda 1, 5, 9 y 13. Es la
misma correspondencia que ya usan `ventana_cohortes` y `cita_cohortes`. En la
hoja, la clave del grupo lleva el módulo dentro en hexadecimal (`2NM…`=2,
`6NM…`=6, `ANM…`=10, `ENM…`=14), y cada fila de la migración lleva su clave
anotada para poder cotejarla contra el papel.

**La tabla está cerrada al público.** Al alumno se la sirve `fn_cita_de_pago`,
que es `security definer` y solo contesta por SU matrícula; abrir la tabla
entregaría el calendario completo de todos los grupos a quien lo pida.

**`fn_cita_de_pago` devuelve `jsonb`** —`{cuando, estricto}`— y no texto,
porque la pantalla necesita saber dos cosas: qué día, y si ese día es único.
Se añade junto a `fn_cita_de_inscripcion`, que se queda: el cliente prueba la
nueva y, si la base contesta `PGRST202`, cae a la vieja. Comprobado contra el
proyecto real antes de aplicar nada.

**La llave primaria ES la regla**: `(programa, plantel, avance, grupo)`. Un
alumno no puede resolver a dos días.

El bloque final cruza la tabla contra el padrón y **enumera a los alumnos de
LEIP que se quedan sin día**. Esos verán «el día de tu reinscripción», la frase
vaga de siempre, que es mucho mejor que una fecha equivocada.

### La ventana viaja con la ficha (`20260924240000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `fn_ventana_de_matricula`
responde al anónimo. El campo `ventana` dentro de la ficha necesita una matrícula
del padrón para verse, así que eso sigue sin comprobarse desde aquí.

`/confirmar-nombre` hacía dos viajes seguidos: `fn_padron_confirmar` para el
reto de identidad y, con su respuesta en la mano, `fn_ventana_de_matricula`
para saber si a esa cohorte ya le toca. Unos 160 ms de más, y en la única
pantalla donde el alumno está parado mirando la rueda.

Las dos preguntan por la misma matrícula y acaban en la misma fila del padrón.
La segunda no aportaba un viaje: aportaba un campo. Ahora `fn_padron_confirmar`
devuelve además `ventana`.

**Se puede desplegar en cualquier orden**, y esa es la parte que importa. La
clave se AÑADE; no se quita ni se renombra nada, así que un cliente viejo la
ignora. Y el cliente nuevo distingue tres casos:

| lo que llega | qué significa |
| --- | --- |
| la clave no viene | esta migración no está aplicada → preguntar aparte, como siempre |
| `null` | le toca; adelante |
| texto | no le toca todavía; esa frase es lo que se le enseña |

Sin esa distinción entre «no viene» y «viene vacía», subir el código antes que
el SQL dejaría pasar a cohortes cuya ventana ni se comprobó.

De paso, el alumno gasta **un cupo menos** de tope por IP por intento:
`fn_ventana_de_matricula` consume `ventana_matricula` (30 cada diez minutos) y
`fn_motivo_fuera_de_ventana`, que es a quien se llama ahora por dentro, no tiene
tope propio. El que de verdad aprieta sigue siendo `padron_confirmar` —10 cada
diez minutos— y no se toca: es lo que impide recorrer el padrón.

El cuerpo se copió mecánicamente de `20260922180000`; lo único añadido son tres
líneas dentro del `jsonb_build_object`.

### Las citas de pago de LEIP (`20260924230000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `fn_cita_de_pago` existe; la creó
esta o `20260925120000`, y las dos están puestas.

Los módulos que el calendario administrativo llama II, VI, X y XIV llegan al
padrón **corridos una posición**: son el 1, 5, 9 y 13.

Dos migraciones ya arreglaron la mitad del sistema con ese desfase —
`20260924160000_el_modulo_que_trae_el_alumno` para la ventana del 25 y
`20260924180000_los_modulos_bajos_de_leip` para la del 27—. Las dos tocan
`ventana_cohortes`, que es **quién puede registrarse y cuándo**. Ninguna toca
`cita_cohortes`, que es **qué día le toca ir a pagar**, y ahí siguen los
números viejos.

| | |
| --- | --- |
| con ventana y SIN cita | LEIP 1, 5 y 9 — se registran y su comprobante no les dice cuándo pagar |
| con cita y SIN ventana | LEIP 2, 6 y 10 — filas que nadie alcanza |

Solo el módulo 13 queda bien, que es el único número que se había comprobado
contra el padrón cuando se escribió `20260924140000`.

Esta migración toca **solo** `cita_cohortes`, y solo las filas de LEIP. No
repite las ventanas ni las etiquetas: eso ya está bien y es trabajo de las
otras dos. Tampoco cambia a qué cita apunta LEIP, que sigue siendo «el día de
tu reinscripción» porque el calendario oficial no le da fecha fija.

**La comprobación no cuenta filas: cruza las dos tablas.** Las cuentas ya
cuadraban cuando el error estaba —veintinueve cohortes con ventana y
veintinueve con cita—; el fallo estaba en cuáles, no en cuántas.

### Los módulos bajos de LEIP (`20260924180000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** `ventana_cohortes` admite los
módulos `[1, 5, 9, 13]` de LEIP.

Contesta la pregunta que dejó abierta la anterior: en la ventana del 27 y 28,
los módulos de LEIP son el **1 y el 5**, no el 2 y el 6. Confirmado por la
organización el 2026-09-24. El desfase de uno vale para todo LEIP.

Sin esto, los módulos 1 y 5 llegan el 27 y leen «Todavía no se anuncia la fecha
de registro para tu grupo» el día que sí les toca, y los módulos 2 y 6 se
registran un día que no es el suyo.

**Las maestrías no se tocan**: sus módulos I y IV siguen guardados como 1 y 4.
El desfase es de LEIP —esa generación pasa a un módulo nuevo y el calendario ya
la nombra por el siguiente—; aplicárselo a la maestría de módulo I la dejaría en
cero, que no es un módulo que exista. El bloque del final lo comprueba, porque
es justo lo que un `update` mal acotado se llevaría por delante.

El rótulo pasa a «…y de los módulos 1, 4 y 5»: los números que de verdad entran,
que son los que el alumno puede comparar contra el suyo.

### El módulo que trae el alumno (`20260924160000`) — aplicada

**Comprobada contra el proyecto real el 2026-09-26.** Los mismos cuatro módulos de
LEIP en `ventana_cohortes`.

Una alumna de LEIP leía «El registro de séptimo semestre y de los módulos **X y
XIV** abre el 25/09/2026», y los dos números estaban mal de dos maneras.

**El dato**: la ventana admitía los módulos 10 y 13, y las cohortes que entran
el 25 son la **9 y la 13** —dicho por la organización el 2026-09-24—. Quien va
en 9 habría leído «Todavía no se anuncia la fecha de registro para tu grupo» el
día que sí le tocaba.

La `20260924120000` ya había visto la mitad: guardó el módulo XIV como 13
porque «es el número que trae el alumno y el que compara `ventana_cohortes`», y
dejó escrito que el X guardado como 10 era «lo único de esta migración que no
está comprobado contra el padrón». Era eso, el mismo desfase de uno.

**El rótulo**: ese texto sale tal cual en la pantalla de «todavía no te toca», y
el alumno lo compara contra el número de su lista. Pasa a decir «de los módulos
9 y 13».

Queda una pregunta abierta, escrita también en la cabecera de la migración: la
ventana del 27 y 28 lleva a LEIP con los módulos II y VI, guardados como 2 y 6.
Si el desfase vale para todo LEIP serían 1 y 5, y los módulos 2 y 6 se quedarían
fuera sin que nadie se entere hasta el día 27. **No se cambia sin que alguien lo
confirme**: de la organización vino la corrección del 9 y el 13, no la de estos.

Comprobable sin permisos —las ventanas y sus cohortes las lee el anónimo—:

```sql
select v.etiqueta, p.nombre, c.avance
  from ventana_cohortes c
  join ventanas_preregistro v on v.id = c.ventana_id
  join programas p on p.id = c.programa_id
 where v.abre::date = '2026-09-25'
 order by p.nombre, c.avance;
```

El bloque final de la migración exige que LEIP quede exactamente con `{9,13}` en
esa ventana y revienta si no, porque el 25 es mañana.

### El calendario oficial (`20260924120000` y `20260924140000`) — aplicadas

**Comprobada contra el proyecto real el 2026-09-26.** `citas_inscripcion` tiene 4 filas
y `cita_cohortes` 27, las dos legibles al anónimo, y `fn_cita_de_inscripcion`
responde.

Las dos salen del «Calendario_registro-inscripción_XIV Encuentro
Internacional», firmado por Jefatura Administrativa el 23/09/2026. Es el primer
documento oficial de fechas, y **ninguna de las tres ventanas cargadas hasta
entonces coincidía con él**: lo que había venía de conversaciones previas.

El documento separa dos procesos que el sistema trataba como uno:

| | Qué es | Dónde vive |
| --- | --- | --- |
| **Registro** | el formulario en línea | `ventanas_preregistro`, y es una puerta |
| **Inscripción** | el pago presencial en ventanilla | `citas_inscripcion`, y es solo información |

**`20260924120000` mueve las ventanas de registro.** Renglón por renglón:

| | Antes | Ahora |
| --- | --- | --- |
| séptimo semestre | 21 al 27 de septiembre | 25 y 26 |
| séptimo, quiénes | cinco licenciaturas | cuatro: Educación Indígena no tiene séptimo |
| primer semestre | 27-28, solo avance 1 | 27-28, avances 1, 3 y 5 |
| LEIP | avance 1 y 13 | módulos II, VI, X y XIV |
| las tres maestrías | avance 13 | módulos I y IV |
| docentes y externos | 29 y 30 de septiembre | solo el 29 |

**El módulo XIV se guarda como 13, y no es una errata.** Esa generación va a
pasar a un módulo nuevo, pero en las listas de las que sale el padrón todavía
se trata como 13, que es el número que trae el alumno y el que compara
`ventana_cohortes`. Por eso el `total_avance` de LEIP —13— sigue siendo
correcto.

Lo que **no** está comprobado contra el padrón es que los otros tres módulos de
LEIP vayan por su número: II como 2, VI como 6, X como 10. Si las listas
también los corrieran, esas cohortes quedarían fuera y leerían «Todavía no se
anuncia la fecha de registro para tu grupo». El bloque final de la migración
enumera las cohortes sin ventana justamente para que eso se vea al aplicarla.

Se **actualizan** las ventanas en vez de borrarlas y reinsertarlas:
`fn_motivo_fuera_de_ventana` deja pasar a todo el mundo cuando hay CERO
ventanas, así que un borrado abre esa puerta mientras dura. Dentro de una
transacción no se vería, pero no toda forma de aplicar una migración garantiza
una.

**`20260924140000` añade el calendario de inscripción.** Dos tablas nuevas
—`citas_inscripcion` y `cita_cohortes`, con lectura para el anónimo— y
`fn_cita_de_inscripcion(matricula)`, que devuelve la frase ya redactada. El
comprobante la pide al terminar el registro y le dice al alumno **qué día le
toca ir a pagar**, que es lo que preguntaba y no se le contestaba.

| Cita | Quiénes |
| --- | --- |
| 28 y 29 de septiembre | séptimo de las cuatro licenciaturas |
| 29 y 30 de septiembre, y 1 y 2 de octubre | primero, tercero y quinto de las cinco |
| 3 de octubre | las tres maestrías, módulos I y IV |
| el día de tu reinscripción | LEIP, módulos II, VI, X y XIV |

La cita es **texto y no dos fechas**, a propósito: tres de las cuatro son
rangos partidos y la cuarta ni siquiera es una fecha. Nada de esto se compara
con `now()`, así que un texto no pierde nada.

**Dos cosas que el documento deja abiertas.** Docentes y externos no aparecen
en la tabla de inscripción: aquí no se les inventa una fecha, y su comprobante
enseña la ventanilla sin día concreto. Y el 3 de octubre de 2026 cae en
**sábado**, mientras `configuracion_evento.ventanilla_horario` dice «Lunes a
viernes de 9:00 a 17:00 hrs» — a una maestría le diría «el 3 de octubre, de
lunes a viernes». El horario se corrige en la configuración, no aquí.

### Los datos de pago reales (`20260924000000`) — aplicada

La cuenta que `/pago` le enseña al alumno era la inventada de la migración de
datos iniciales: BBVA México, cuenta `0123456789`, CLABE `012320001234567897`.
Esta la sustituye por la del Encuentro:

| Dato | Valor |
| --- | --- |
| Banco | Santander |
| Cuenta | `65501202802` |
| Beneficiario | Universidad Pedagógica Nacional |

Son tres, no cuatro: **la CLABE se retira**, dicho por la organización el
2026-09-24. No es que falte y se espere, así que la columna `banco_clabe` se va
con ella —`drop column`— en vez de quedarse vacía marcando un hueco. Ninguna
vista, función ni política la nombraba; solo la definición de la tabla y el
`insert` de datos iniciales, así que soltarla no arrastra nada.

Lo que no podía quedarse era la del relleno: es de BBVA y **existe**, o sea que
quien la copiara junto a una cuenta de Santander mandaría el depósito a una
cuenta ajena. En el cliente desaparecen la fila de `/pago`, el campo de
`/admin/configuracion` y `banco.clabe` del tipo `ConfiguracionEvento`.

**Aplicada el 2026-09-24 y comprobada contra el proyecto real** con la clave
anónima, que es con la que se lee la configuración:

```sql
select banco_nombre, banco_cuenta, banco_beneficiario
  from configuracion_evento where id = 1;
```

```
banco_nombre       : "Santander"
banco_cuenta       : "65501202802"
banco_beneficiario : "Universidad Pedagógica Nacional"
banco_clabe        : no existe la columna
```

Esa última línea es la que importa y no se lee del archivo: se preguntó si
`banco_clabe` venía en la fila —`"banco_clabe" in fila`— y no viene. La columna
se fue de verdad.

`bun run verificar-conexion` sigue dando «configuracion_evento tiene las
columnas que el puente espera», que es lo que comprueba el otro lado: el cliente
ya no la pide.

El bloque final de la migración comprueba lo mismo al aplicarse: si la fila no
quedó con esos valores, si no existe, o si `banco_clabe` sigue en la tabla,
levanta excepción en vez de dejar un «UPDATE 0» que nadie lee en el editor
SQL.

Si algún día vuelve a hacer falta, vuelve en una migración de una línea
(`alter table … add column banco_clabe text not null default ''`) y el campo
regresa al panel. Retirarla no cierra esa puerta.

### La salida que nadie dio (`20260923160000`) — aplicada

Quita `fn_cierre_automatico`, y con ella la última pieza que inventaba
movimientos en `asistencias`.

Nació con la 31, cuando la puerta pasó a ser torniquete, y entonces hacía falta:
`v_elegibles` exigía entrada **y salida** para la constancia, así que sin esa
fila nadie que no escaneara al irse recibía su documento. El cierre no era un
registro, era un parche para un requisito.

La 53 quitó la salida de la regla de elegibilidad. Desde ahí la única razón por
la que existía el cierre había desaparecido, y lo que quedaba era una función que
escribe salidas que nadie dio. La 57 ya lo había notado a medias —le revocó el
`execute` observando que «no se invoca desde ni una línea de `src/`»— pero la
dejó en pie.

Por qué inventarla es peor que no tenerla:

- `asistencias` es el registro de lo que pasó en la puerta. Una salida a las
  15:00 a nombre de quien nunca pasó por ahí a esa hora es un dato falso en el
  único sitio donde se guarda la verdad. Que lleve `punto = 'Cierre automático'`
  la hace rastreable, no cierta.
- Deja a todo el mundo con una `salida` como último movimiento, y el primer
  bloque de `fn_evaluar_escaneo` resuelve eso como **REGRESÓ, en verde**, antes
  de mirar el día y el pago. Después del cierre, un escaneo cualquiera reabría la
  jornada sin que nadie cotejara una credencial.
- Borra justo la diferencia que la 31 quería conservar: quien se fue a media
  mañana volvía a ser indistinguible de quien aguantó la jornada completa.

La presencia la prueba la **entrada**. Quien entró y no volvió a escanear estuvo;
quien entró, salió a la calle y no regresó también estuvo. Ninguno necesita que
nadie le escriba una salida al final del día.

Las filas ya escritas no se tocan: dropear la función no borra datos, y
`cierreAutomatico` se conserva en el cliente como campo de **lectura** para poder
explicarlas en el reporte. `tiene_salida` sigue en `v_elegibles` como columna que
se mira y no condiciona, igual que la dejó la 53.

En el cliente desaparecen el botón «Ejecutar cierre automático», su diálogo y
`ejecutarCierreAutomatico`. Ese botón además nunca escribió en la base: solo
tocaba la memoria de la pestaña, así que su aviso de «se cerraron N asistencias»
prometía algo que no ocurría.

### Publicar lo que faltaba de tiempo real (`20260921180000`) — aplicada

Comprobable: `estado-de-migraciones.sql` mira las ocho tablas en `supabase_realtime`.

La escucha en vivo existe desde la 21 y funciona, pero su lista se armó con las
pantallas que había entonces. Cuatro tablas que el panel sí lee se quedaron
fuera, y su ausencia no se nota: la pantalla no dice «esto está viejo», enseña
lo de antes y ya.

- **`bitacora`.** La pantalla que la consulta acaba de empezar a leerla de la
  base. Sin publicarla, la anotación de OTRA persona —el cobro de la ventanilla
  de al lado— no aparece hasta recargar. Un registro de auditoría que llega
  tarde se consulta tarde.
- **`niveles_academicos` y `programas`.** El catálogo contra el que se valida el
  padrón. Quien da de alta un programa lo ve al instante; quien está importando
  en otra máquina sigue con el catálogo viejo y su archivo se rechaza entero con
  «programa desconocido» por un programa que ya existe. Ese error no se parece
  en nada a su causa.
- **`planteles`.** Las sedes, que el padrón también valida. Mismo caso y mismo
  mensaje engañoso.

No publica `ventanas_preregistro` ni `ventana_cohortes`. Desde que
`/admin/configuracion` las edita sí hay un cliente que las lee, pero las pide al
entrar y las vuelve a pedir al guardar: no hay nadie esperando a que cambien
solas. La regla que importa la sigue aplicando un disparador, y publicar una
tabla que nadie escucha solo cuesta WAL.

Es idempotente: comprueba `pg_publication_tables` antes de añadir cada una,
igual que la 21, así que volver a correrla es inofensivo.

No cambia la seguridad. Realtime evalúa las políticas de fila de quien escucha
antes de entregarle nada, así que a un capturista no le llega una anotación de
la bitácora aunque la tabla esté publicada.

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

El techo iba en dos sitios:

| Dónde | Contra qué cuenta | Qué pasa al llegar al tope |
| --- | --- | --- |
| Pre-registro | `participantes` | Se rechaza el alta |
| Reparto de días | `padron_alumnos.dia` | ~~No se asigna ese día~~ |

**El segundo se retiró en la 47**, y conviene saber por qué: confundía el PLAN
con la RESERVA. `padron_alumnos.dia` es una intención de la universidad sobre
gente que todavía no se inscribe y que en buena parte no lo hará. Con el tope
ahí, asignar el día 1 a los 800 alumnos de una zona era imposible aunque se
supiera que solo van a inscribirse unos quinientos. Ver abajo.

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

### Un alumno no se inscribe como externo (`20260917160000`) — sus reglas están puestas

**Este encabezado decía «sin aplicar» y engañaba.** Las dos comprobaciones de
esta migración viven dentro de `fn_preregistrar_externo`, y la **61**
—`20260923140000`, aplicada— volvió a crear esa función llevándoselas dentro.
O sea que la protección está hoy en la base, haya corrido o no este archivo.

Lo que importa de una migración que solo redefine funciones no es si su archivo
llegó a correr: es si su regla está en el cuerpo que la base tiene puesto. Eso es
lo que comprueba `supabase/utilidades/estado-de-migraciones.sql`, y por eso busca
la frase de la regla y no el nombre del archivo.

La segunda regla sigue dormida a propósito, y eso no cambia: depende de
`dominio_institucional`, que está vacío porque aquí nadie tiene cuenta
institucional. Ver el aviso de `verificar-conexion`.


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

### El docente y el externo se podían pre-registrar dos veces (`20260917140000`) — aplicada

Comprobable: `estado-de-migraciones.sql` busca el índice `uq_participante_sin_matricula`, que desde el rol anónimo no se ve.

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

**Antes de pegarlas, `bun run verificar-migraciones`.** Revisa sin base de datos
las de `migrations/` **y las de `utilidades/`**, y caza lo que solo se descubre
al aplicarlas:

- **Los argumentos de cada `raise`**, contra sus marcadores. Es de donde salió:
  `20260923200000` llevaba un `%%` —que en PL/pgSQL es un porcentaje LITERAL, no
  dos marcadores— con tres argumentos para dos, y la función entera no compiló.
  El error apareció en producción, al aplicarla, con el pre-registro a cuatro
  días.
- **El equilibrio de las comillas de dólar.** Un `$fn$` sin cerrar no da un
  error legible: Postgres se come el resto del archivo como texto.

`utilidades/` entra aunque no sean migraciones, porque se pegan en el MISMO
editor y traen las mismas construcciones: `raise` con marcadores y bloques
`do $$ … $$`. Y la urgencia va al revés de lo que sugiere el nombre de la
carpeta: una migración se aplica una vez, con cuidado y con el archivo delante;
un archivo de utilidades se pega deprisa, y `abrir-ventana-docentes-y-externos`
abre o cierra el pre-registro de una audiencia entera.

Revisarlo a ojo no funciona, y hay prueba de las dos formas: auditar a mano las
tres migraciones de ese día no lo encontró, y el primer comprobante escrito para
buscarlo acusó de desajuste a un `raise` correcto porque cortaba la sentencia en
un punto y coma que estaba **dentro de una cadena**. Hay que leer el SQL como lo
lee Postgres.

Lo que ese comprobante **no** hace es validar SQL: una columna que no existe o
una política mal puesta solo las dice la base. Un verde ahí significa «no tiene
los errores que se pueden ver leyendo», no «se puede aplicar».

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
