# Recorrido de demostración — Encuentro UI

Guía para enseñar el prototipo a las áreas de la universidad. Dice qué abrir, en
qué orden y qué decir.

Todos los folios, matrículas y referencias de este documento **están verificados
contra los datos del prototipo**. Si alguno deja de funcionar, es que los datos
cambiaron: vuelve a verificarlos antes de la siguiente demostración.

---

## Antes de empezar: qué aclarar

Dilo tú primero, en menos de un minuto. Si no lo dices, alguien lo preguntará a
la mitad y perderás el hilo.

1. **Es un prototipo de interfaz, no el sistema.** Sirve para ver cada pantalla y
   cada estado, y decidir si es lo que hace falta antes de construirlo de verdad.
2. **Los datos son inventados.** Sesenta participantes, once talleres, ochenta
   evidencias. Parecen reales porque están hechos para parecerlo, pero no lo son.
3. **Al recargar la página todo vuelve al inicio.** No hay base de datos. Lo que
   registres durante la demostración se ve al instante en las demás pantallas,
   y desaparece al refrescar. Es a propósito.
4. **El sistema no genera las constancias.** Calcula quién cumple los requisitos
   y entrega el listado a quien las elabora. Es la parte que nadie más puede
   hacer, porque solo el sistema sabe quién pagó, quién asistió y quién tiene sus
   evidencias aprobadas.
5. **Nada se le envía al alumno.** Ni el QR ni la constancia. Él entra a su
   portal y lo descarga. El sistema no depende de que un envío haya llegado, y
   nadie tiene que mandar dos mil quinientos correos a mano.

**Cómo moverte.** La página de inicio (`/`) lista las 33 pantallas agrupadas por
módulo: es el mapa. Abajo a la derecha, en todas las pantallas, hay un botón
**«Prototipo»** que abre el selector de participante de prueba: sirve para
saltar a cualquiera de los 60 sin rehacer el flujo.

---

## Recorrido principal — la cadena completa

Es el recorrido que hay que enseñar primero, porque demuestra lo único que no se
ve mirando pantallas sueltas: **que los módulos se conectan**. Dura unos diez
minutos.

**El protagonista:**

| Dato | Valor |
|---|---|
| Nombre | **LUIS ANGEL NUÑEZ RAMIREZ** |
| Folio | `PRE-00803` |
| Matrícula | `20262122045` |
| Correo (lo declara él) | `luis.angel3@alumnos.universidad.mx` |
| Día y sede | Día 3 — Teatro Victoria |
| Estado inicial | Comprobante recibido, **sin pagar** |
| Taller | `T05` Estadística aplicada con SPSS — $350 |

Se eligió a propósito: ya entregó su comprobante pero Servicios Financieros aún
no lo valida, así que se puede recorrer todo el camino desde ahí. Y lleva Ñ en el
apellido, lo que sirve para el punto que a Servicios Escolares le importa.

### 1. Se pre-registra · `/bienvenida` → `/alumno`

Abre `/bienvenida` y pulsa **«Soy alumno de la universidad»**.

Captura la matrícula `20262122045` y continúa.

> «Un solo dato. Servicios Escolares nos entrega el padrón con el nombre completo
> y la matrícula, así que la matrícula es lo único que podemos buscar.»

Intenta escribir una letra: **no entra**. El campo solo acepta dígitos, así que
no hay forma de teclear una matrícula con el formato equivocado. Debajo va
contando: «7 de 11 dígitos».

> «El campo no acepta una letra para después reprocharla. Eso hace perder el
> tiempo dos veces.»

Los dos errores que quedan: enviar con dígitos de menos —«te faltan 3 dígitos:
la matrícula son 11»— y una matrícula completa que no existe —«no encontramos
esa matrícula», con el botón de WhatsApp—.

### 2. Confirma su nombre · `/confirmar-nombre`

Aquí se confirman dos cosas a la vez.

> «Primero: que la matrícula que escribió es la suya. Ve su nombre en grande y
> tiene que marcar la casilla para seguir. Si se equivocó de matrícula, aquí se
> da cuenta.»
>
> «El nombre no se puede editar. Aparece como quedará impreso: mayúsculas, sin
> acentos, **pero conservando la Ñ**. Fíjense en NUÑEZ.»
>
> «Las dos casillas son excluyentes. Y si marca "mi nombre aparece incorrecto",
> **el registro continúa igual**: se abre un caso en soporte y su constancia
> queda señalada, pero no se le bloquea el trámite. Eso lo veremos al final.»

### 3. Da sus datos de contacto · `/completar-datos`

Arriba ve **lo que entregó Servicios Escolares**: su programa, su avance, su
grupo y su plantel. No los puede editar.

> «Todo esto ya lo tiene la universidad, así que no se lo preguntamos. Solo se lo
> mostramos para que lo reconozca. Si algo está mal, se corrige con Servicios
> Escolares, no aquí.»

Lo único que captura es **correo y celular**, que es lo único que la universidad
no nos entrega. Escribe `luis.angel3@alumnos.universidad.mx` y un celular de 10
dígitos.

Prueba a escribir un correo de otro dominio, por ejemplo `@gmail.com`:

> «Se exige el correo institucional, y el dominio se configura en administración.
> Si la universidad cambia de dominio, no hay que tocar código.»

### 4. Confirma su correo

Al continuar no se envía ningún código: se le muestra la dirección que escribió y
tiene que confirmarla.

> «Verificar por código obligaría a montar un proveedor de correo y a que 2 500
> personas esperen un mensaje que puede caer en spam. Y protegía poco: el QR lo
> descarga del portal, y al portal entra con folio y matrícula. Confirmar la
> dirección atrapa el error de dedo, que es lo que de verdad pasa.»

### 5. Ve su día y elige taller · `/mi-dia` → `/talleres`

El día viene del padrón y no se elige. Continúa al catálogo.

> «Once talleres. Fíjense en los cuatro estados de tarjeta: disponible, pocos
> lugares en ámbar, cupo lleno en gris —visible pero no seleccionable— y el
> seleccionado, que atenúa a los demás. Y hay un botón grande de continuar sin
> taller, porque el taller es opcional.»

`T01` y `T05` están llenos; `T02`, `T06` y `T10` tienen 2 lugares.

### 6. Recibe sus instrucciones de pago · `/pago`

> «Folio grande y con QR, porque lo va a mostrar en ventanilla desde el
> celular. El aviso de que son **dos depósitos separados** va destacado: es el
> error más común. Cada dato bancario tiene botón de copiar. Y las dos fotos de
> ejemplo de cómo entregar el voucher.»

Baja hasta el bloque **«Tu código QR lo descargas tú»**. Es el que más preguntas
ahorra el día del evento.

> «Aquí decimos desde el principio que nadie le va a enviar el código. Deja su
> voucher, espera **5 horas**, entra a su portal y lo descarga. Los cuatro pasos
> están numerados.»
>
> «Mandarle el QR por correo a cada alumno es inviable de operar, y además genera
> el reclamo de "no me llegó". Que lo recoja él quita las dos cosas: nadie tiene
> que enviar nada, y siempre está disponible en el mismo lugar.»

Las 5 horas se configuran en `/admin/configuracion`. Si ventanilla se retrasa un
día, se sube el número ahí y todas las pantallas lo dicen.

### 7. Financieros registra su voucher · `/financieros`

Busca `PRE-00803`. Se abre su ficha.

> «El sistema dice cuánto debía pagar. Quien atiende no tiene que calcularlo, ni
> acordarse de que el taller va aparte.»

Captura: monto **650**, referencia **`REF556677`**, la fecha, y una foto
cualquiera como voucher.

> «Monto exacto: confirmación en verde, y le dice a quien atiende qué
> responderle: que su QR ya está en su portal y entre con folio y matrícula.»

**Ahora enseña el bloqueo.** Corrige el registro y escribe la referencia
**`REF482910`**:

> «Esa referencia ya está registrada con el folio PRE-00801. El botón se
> deshabilita. Es lo que impide que dos personas presenten copias del mismo
> voucher, y responde mientras se escribe, no al enviar.»

Vuelve a `REF556677` y registra.

### 8. Él mismo descarga su QR · `/portal`

Entra con folio `PRE-00803` y matrícula `20262122045`.

> «Sin contraseña: folio más matrícula o correo.»

En `/portal/estado` la línea de tiempo avanzó hasta **«QR disponible»**. En
`/portal/qr` **ya está el código**, con los botones de descargar y guardar.

> «Esto es lo importante: el pago se registró en otra pantalla, por otra persona,
> y aquí ya se ve. No hubo que recargar nada, y sobre todo: **nadie tuvo que
> enviarle nada**.»

Si quieres enseñar el otro lado, abre el selector de **«Prototipo»** y cambia a
alguien con el comprobante recibido pero sin validar. En `/portal/qr` no hay
código, y la pantalla dice cuánto falta esperar en vez de dejarlo en blanco.

### 9. Se escanea su entrada · `/captura`

Configura: **día 3**, modo **ENTRADA**, punto **Puerta A**. Comienza a escanear.

Escribe `PRE-00803` en el campo de abajo.

> «La cámara está simulada; el campo es el plan B real, para quien llega sin
> código. Verde a pantalla completa, con nombre grande y hora. Se lee a un metro,
> que es la distancia a la que se trabaja en la puerta.»

Vuelve a escanearlo de inmediato:

> «Amarillo: reingreso dentro de los 15 minutos. No genera un registro nuevo. Sin
> esta regla, quien sale al baño acaba con cuatro entradas y el cálculo de
> permanencia deja de servir.»

### 10. Sube su evidencia y se la revisan · `/portal/evidencias` → `/revision`

En el portal, el día 3 aparece como presencial —ya se escaneó— y los días 1 y 2
piden evidencia. Sube una.

En `/revision`, filtra por estado **Pendientes** y búscala.

> «Este panel se diseñó para volumen: unas cinco mil imágenes. Todo se decide con
> el teclado: **A** aprueba, **R** rechaza, **flechas** navegan, **Z** deshace. Y
> avanza solo a la siguiente.»

Aprueba con **A**.

### 11. Aparece en el listado de elegibles · `/admin/elegibles`

Busca `PRE-00803`.

> «Aquí termina la cadena. El sistema no imprime nada: dice quién cumple. Y para
> quien no cumple, dice exactamente qué le falta.»

Muestra el nombre normalizado: **LUIS ANGEL NUÑEZ RAMIREZ**, con la Ñ.

> «Ese es el texto que se va a imprimir. La Ñ sobrevive hasta el archivo que se
> les entrega.»

Pulsa **«Solo elegibles»** para descargar el CSV.

---

## Recorridos por área

Cuando cada área quiera ver lo suyo. Cinco minutos cada uno.

### Servicios Financieros · `/financieros`

1. **Búsqueda** — un solo campo que acepta folio, matrícula, nombre o correo.
   Foco automático al abrir. Prueba con `MUÑOZ`.
2. **Las cuatro validaciones** — en la ficha de cualquiera:
   - Referencia `REF482910` → bloqueo rojo, dice de qué folio es.
   - Monto **600** → advertencia ámbar, exige nota, deja continuar como discrepancia.
   - Monto **700** → lo mismo por exceso.
   - Monto **650** → verde, pasa a pagado.
3. **Carga masiva** · `/financieros/carga-masiva` — descarga
   `pagos-mixtos.csv` desde la propia pantalla y súbelo.
   > «Cuatro listos, tres con advertencia, cuatro con error. **Nada ha cambiado
   > todavía**: esto es una vista previa. Se aplican solo al confirmar, y solo los
   > válidos.»
4. **Conciliación** · `/financieros/conciliacion` — total recaudado, desglose,
   discrepancias, referencias duplicadas, pre-registros por vencer. Todo
   calculado, y la tabla se exporta.

### Capturistas · `/captura`

Enséñalo en un teléfono si puedes. Está diseñado para usarse de pie.

1. **Configuración** — día, modo y punto, con botones grandes. El modo se cambia
   después sin salir del escáner.
2. **Los tres colores.** La pantalla de escaneo trae accesos rápidos que
   **calculan qué va a pasar** antes de pulsarlos. Casos concretos:

| Color | Folio | Qué pasa |
|---|---|---|
| 🟢 Verde | `PRE-00801` en modo **SALIDA**, día 1 | SALIDA REGISTRADA |
| 🟡 Amarillo | `PRE-00827`, día 3 | Discrepancia de pago: pasa, pero avisa |
| 🔴 Rojo | `PRE-00805`, día 2 | Sin pagar → «PASAR A MESA DE INCIDENCIAS» |
| 🔴 Rojo | `PRE-00802` escaneado el **día 1** | Día equivocado, con autorización de supervisor |

> «Cada color tiene sonido y vibración distintos. En un salón con setecientas
> personas el capturista no siempre alcanza a mirar la pantalla: el tono le dice
> si puede seguir o tiene que detener a la persona.»

3. **Día equivocado con autorización** — escanea `PRE-00802` el día 1, pulsa
   «Autorización de supervisor» y escribe un motivo.
   > «Queda registrado con quién autorizó y por qué. Es auditoría, no un permiso
   > suelto.»
4. **Modo sin conexión** — pulsa **«Simular caída»** en la barra superior.
   Escanea dos o tres personas. La barra cuenta los pendientes.
   > «Y esto sí sobrevive a recargar la página: es lo único del prototipo que se
   > guarda. Sería absurdo que una pantalla que promete no perder escaneos los
   > perdiera al refrescar.»

   Recarga para demostrarlo, y luego pulsa **«Reconectar»**.
5. **Modo taller** · `/captura/taller` — pase de lista con casillas. Se marca y
   se desmarca tocando.
6. **Historial** · `/captura/historial` — con deshacer el último.

### Revisores de evidencias · `/revision`

1. **Los atajos**, que están impresos en pantalla: A, R, ←, →, Z.
2. **Duplicados** — activa **«Solo duplicados»**. Hay dos pares:

| Par | Evidencias |
|---|---|
| 1 | `EV-0004` MARIA FERNANDA LOPEZ PEÑA (día 1) ↔ `EV-0011` ANA SOFIA GUTIERREZ SOLIS (día 3) |
| 2 | `EV-0017` ALEJANDRA MORENO ZAVALA (día 2) ↔ `EV-0029` PAOLA MICHELLE HERRERA VEGA (día 3) |

   > «Cuando el archivo coincide, el visor **se sustituye** por la comparación
   > lado a lado con los datos de ambos alumnos. No hay que ir a buscarlo. Es el
   > control que atrapa el caso más común: dos alumnos que suben la misma foto.»

3. **Rechazo con motivo** — pulsa R. El botón de confirmar está deshabilitado
   hasta elegir uno de los seis motivos.
   > «Todo rechazo lleva motivo, y el motivo le llega al alumno para que sepa qué
   > corregir. Un rechazo sin explicación se convierte en un reclamo por WhatsApp,
   > y con dos mil quinientos alumnos eso no escala.»
4. **Criterios de aprobación** — el enlace de la barra superior.
   > «Sin un criterio común, dos revisores dan resultados distintos con la misma
   > foto y ninguna decisión se puede defender después.»
5. **Cola repartida** — el selector de revisor.
   > «Cada uno recibe un bloque del mismo día. Dos personas nunca reciben la misma
   > imagen, y revisar veinte fotos del mismo día es más rápido que saltar entre
   > ellos.»

### Coordinación · `/admin`

1. **Dashboard** — arriba están las dos preguntas de cada mañana: cuánta gente
   falta por pagar y cuánta por entrar hoy.
   > «Hoy: 39 de 60 pagados, 15 elegibles.»

   Usa el **reloj simulado** de la esquina para situarte en la hora pico.
2. **Monitoreo en vivo** · `/admin/monitoreo` — escaneado contra esperado, ritmo
   por minuto, desempeño por puerta.
   > «Si el ritmo no alcanza para recibir a todos en la hora de registro, la
   > pantalla lo dice y sugiere abrir otro punto. Verlo a tiempo es la diferencia
   > entre una fila que avanza y una que no.»

   **Anomalías** — cambia el reloj al día 1 y al día 2:
   - Día 1: JOSUE PALOMO con **8 registros entre las 9:40 y las 9:41**.
     > «Eso no lo hace una persona escaneando gente: es alguien pasando una pila
     > de credenciales.»
   - Día 2: LETICIA BAÑOS registrando a las **5:12, 6:41 y 22:03**, fuera del
     horario del evento.
3. **Listado de elegibles** · `/admin/elegibles` — filtros por perfil, día y
   elegibilidad. Muestra los motivos de quien no cumple (ver la tabla de abajo).
4. **Gestión** — talleres, configuración, padrón, usuarios, soporte, bitácora y
   reportes. Si hay poco tiempo, enseña **configuración** y **bitácora**:
   - En `/admin/configuracion`, cambia la cuota de 650 a 700 y guarda. Abre
     `/pago`: el monto cambió.
     > «La configuración no está repartida por el código: se edita aquí y se ve
     > donde se usa.»
   - En `/admin/bitacora` está todo lo que hiciste en la demostración, marcado
     como «Sesión».
     > «Cada pago, cada evidencia revisada, cada escaneo. Si alguien reclama que
     > sí entró, aquí se comprueba.»

---

## Los cinco casos que conviene mostrar

Cada uno responde a una preocupación que alguien va a plantear. Si tienes poco
tiempo, estos cinco valen más que recorrer pantallas.

### 1. La Ñ se conserva — para Servicios Escolares

**Dónde:** `/admin/elegibles`, buscando `MUÑOZ`. O en la exportación.

**Por qué importa:** un apellido impreso como MUNOZ en un documento oficial hay
que corregirlo a mano, uno por uno. Hay 13 nombres con Ñ en los datos.

**Qué decir:** «El nombre va en mayúsculas y sin acentos, pero la Ñ se respeta.
Y sobrevive hasta el archivo CSV que se les entrega: el archivo lleva la marca
que Excel necesita para no degradarla al abrirlo.»

### 2. El voucher duplicado se bloquea — para Financieros

**Dónde:** ficha de cualquiera, referencia `REF482910`.

**Por qué importa:** es el control anti-fraude. Impide que varias personas
presenten copias del mismo comprobante.

**Qué decir:** «Compara contra todos los pagos registrados, no solo los de esta
persona. Y avisa mientras se escribe, cuando todavía se puede corregir.»

### 3. El semáforo rojo por día equivocado — para Capturistas

**Dónde:** `/captura/escaneo` en día 1, escaneando `PRE-00802` (que es del día 2).

**Por qué importa:** los tres grupos son de setecientas personas y las sedes
cambian. Alguien llegará el día que no es.

**Qué decir:** «Rojo, no se registra, y en grande: pasar a mesa de incidencias.
Pero existe la excepción: un supervisor puede autorizarlo escribiendo el motivo,
y queda anotado con su nombre.»

### 4. El hash duplicado lado a lado — para Revisores

**Dónde:** `/revision` con **«Solo duplicados»**.

**Por qué importa:** dos alumnos que suben la misma foto es el intento más común,
y comparar cinco mil imágenes a mano es imposible.

**Qué decir:** «El sistema las detecta y las pone una junto a otra con los datos
de ambos. El revisor decide en segundos en vez de investigar.»

### 5. El nombre en revisión, marcado en el listado — para todos

**Dónde:** `/admin/elegibles`, filtro **«Nombre en revisión»**. Sale
`PRE-00843` **ARTURO MARTIN GALVAN REYNA**.

**Por qué importa:** cierra el círculo que empezó en el pre-registro, cuando
alguien marcó «mi nombre aparece incorrecto».

**Qué decir:** «Este señor **cumple todos los requisitos** y aun así está
señalado, porque su caso de nombre sigue abierto. La marca viaja en la
exportación, para que quien imprima lo aparte.»

**Y ahora la cadena completa, que es lo que impresiona:** ve a `/admin/soporte`,
abre el caso `CS-004` y márcalo como **resuelto**. Vuelve a `/admin/elegibles`.

> «La marca desapareció. Un caso que empezó con una casilla en el pre-registro,
> pasó por soporte y termina liberando un documento. Es la única cadena que
> atraviesa el sistema completo.»

---

## Los motivos de no elegibilidad

Es la pregunta que van a hacer cientos de veces cuando se entreguen las
constancias. Conviene enseñar que se responde sin abrir otra pantalla.

En `/admin/elegibles`, filtro **«No elegibles»**:

| Folio | Nombre | Qué le falta |
|---|---|---|
| `PRE-00801` | JUAN CARLOS PEREZ MUÑOZ | «Tiene entrada (8:15) pero no salida del día 1. Ejecuta el cierre automático del día para completarla.» |
| `PRE-00803` | LUIS ANGEL NUÑEZ RAMIREZ | «Su pago está en "comprobante recibido", referencia REF482936. Debe resolverse en Servicios Financieros.» |
| `PRE-00806` | ALEJANDRA MORENO ZAVALA | «Lleva 0 de 2 evidencias aprobadas; la del día 1 no se entregó y la del día 2 sigue pendiente de revisión.» |

> «No dice "faltan evidencias". Dice cuál, de qué día y en qué estado. Quien
> atiende la ventanilla no debería tener que abrir tres módulos para responder.»

---

## Preguntas que suelen salir

**«¿Esto ya funciona?»**
No. Es la capa visual completa: cada pantalla, cada estado y cada mensaje. Sirve
para acordar cómo debe comportarse el sistema antes de construir la parte que
guarda los datos.

**«¿Se puede cambiar X?»**
Sí, y esa es la razón de enseñarlo ahora. Cambiar una pantalla aquí cuesta horas;
cambiarla cuando ya está conectada, semanas.

**«¿Qué pasa si se cae el internet en la puerta?»**
Enseña el modo sin conexión. Los escaneos se acumulan y se sincronizan al
volver la red, y sobreviven a recargar la página.

**«¿Le mandamos el QR a cada alumno?»**
No, y es deliberado. Enviar dos mil quinientos códigos es trabajo manual que
alguien tiene que hacer, y cada envío que no llega —correo mal escrito, buzón
lleno, carpeta de spam— se convierte en un reclamo el día del evento. El alumno
lo descarga de su portal, que siempre está en el mismo lugar y no depende de que
nada se haya entregado.

**«¿Y si llega a la puerta sin el QR?»**
Entra igual. El capturista puede escribir el folio o la matrícula en el campo de
abajo del escáner; el código solo hace la fila más rápida.

**«¿Por qué 5 horas?»**
Es el plazo que se le promete al alumno para que no vuelva a los diez minutos a
preguntar por qué no está su código. Se configura en `/admin/configuracion`: si
ventanilla se retrasa, se sube el número ahí y todas las pantallas lo repiten.

**«¿Quién imprime las constancias?»**
El sistema no las imprime. Entrega el listado de quién cumple, con el nombre ya
normalizado y los casos que hay que apartar señalados. La impresión la hace quien
hoy la hace.

**«¿Y si alguien cambia de día?»**
El día no viene en el archivo de Servicios Escolares: lo reparte la
organización. En `/admin/padron`, arriba, está el **tablero de reparto**: cuántos
hay en cada día y cuántos esperan.

Para mover a una persona, se le asigna otro día desde ahí. El sistema **arrastra
lo que cuelga de eso**: su sede cambia, y si su taller no se imparte el día
nuevo, su inscripción se libera y él lo ve en su portal con la opción de elegir
otro.

**«¿Puedo probarlo yo?»**
Sí. Recargar la página deja todo como estaba, así que no hay forma de romperlo.

---

## Ficha rápida

Para tener a la mano durante la demostración.

| Para qué | Dato |
|---|---|
| Protagonista del recorrido | `PRE-00803` · matrícula `20262122045` |
| Su correo, que él captura | `luis.angel3@alumnos.universidad.mx` |
| Referencia libre para pagar | `REF556677` |
| Referencia ya usada (bloquea) | `REF482910` (de `PRE-00801`) |
| Monto del evento | $650 |
| Verde en modo SALIDA | `PRE-00801`, día 1 |
| Amarillo por discrepancia | `PRE-00827`, día 3 |
| Rojo sin pagar | `PRE-00805`, día 2 |
| Rojo por día equivocado | `PRE-00802` escaneado el día 1 |
| Nombre en revisión, elegible | `PRE-00843` · caso `CS-004` |
| Pares de hash duplicado | `EV-0004`↔`EV-0011` · `EV-0017`↔`EV-0029` |
| Talleres llenos | `T01`, `T05` |
| Talleres con 2 lugares | `T02`, `T06`, `T10` |
| Archivos de ejemplo | `pagos-validos.csv`, `pagos-mixtos.csv`, `padron-mixto.csv` |
| Columnas del padrón | `matricula`, `nombre`, `nivel`, `programa`, `avance`, `grupo`, `plantel` |
