# Base de datos — XIV Encuentro Internacional de Educación

Esquema completo para Supabase: **16 migraciones, 17 tablas, 6 vistas, 12 tipos
y 13 funciones**, con seguridad a nivel de fila en todas las tablas.

## Cómo ejecutarlas

Se ejecutan **en orden**, del `0100` al `1600`. El número del nombre no es
decorativo: una migración referencia tablas de las anteriores, y salteársela
produce un error de tabla inexistente.

**Con el editor SQL de Supabase.** Abre cada archivo, pega su contenido y
ejecútalo, en orden. Es lo más directo si no tienes la CLI.

**Con la CLI de Supabase**, si prefieres tenerlo versionado:

```sh
supabase link --project-ref <tu-proyecto>
supabase db push
```

Los archivos ya están con el nombre que la CLI espera
(`<marca de tiempo>_<nombre>.sql`), así que `db push` los toma tal cual.

### Antes de empezar

Nada. No hacen falta extensiones: `gen_random_uuid()` viene en PostgreSQL 13 y
Supabase trae 15. La única dependencia externa es `auth.users`, que Supabase crea
al provisionar el proyecto.

### Después de ejecutarlas

1. **Crea el primer usuario administrador.** Regístralo desde Authentication y
   luego dale su rol:

   ```sql
   insert into usuarios_internos (id, nombre, correo, rol)
   values ('<uuid de auth.users>', 'NOMBRE APELLIDO', 'correo@universidad.mx', 'admin');
   ```

   Sin esta fila nadie puede administrar nada: el rol vive en la aplicación, no
   en la autenticación.

2. **Importa el padrón.** Servicios Escolares entrega `matricula`, `nombre`,
   `nivel`, `programa`, `avance`, `grupo` y `plantel`. El día del evento **no
   viene en el archivo**: se reparte después con `fn_repartir_dias_pendientes()`.

3. **Carga los talleres**, con sus días en `taller_dias`.

## Qué archivo hace qué

| Archivo | Qué establece |
| --- | --- |
| `0100_tipos` | Los 12 estados cerrados del dominio |
| `0200_configuracion` | Configuración del evento, días y catálogo académico |
| `0300_usuarios_internos` | El personal y los ayudantes de rol que usan las políticas |
| `0400_padron` | El padrón de Servicios Escolares |
| `0500_talleres` | Talleres y los días en que se imparte cada uno |
| `0600_participantes` | Quien se pre-registró, y sus avisos |
| `0700_pagos` | Pagos y el control anti-fraude |
| `0800_asistencias` | Entradas, salidas y pase de lista |
| `0900_evidencias` | Evidencias y su revisión |
| `1000_soporte_bitacora` | Casos y el registro de lo que hizo cada quien |
| `1100_vistas` | Todo lo derivado: estado de pago, cupos, elegibilidad |
| `1200_funciones` | Reparto de días, escáner, cierre automático |
| `1300_portal_publico` | La puerta del participante, que no tiene sesión |
| `1400_rls` | Seguridad a nivel de fila, tabla por tabla |
| `1500_datos_iniciales` | Configuración, días y catálogo de arranque |
| `1600_permisos` | Qué funciones puede llamar un anónimo |

## Las cuatro decisiones que explican el resto

**Lo que se calcula no se guarda.** El estado de pago sale de la tabla de pagos,
el cupo de un taller sale de contar a sus inscritos y la elegibilidad sale de sus
tres condiciones. Un estado guardado y un pago registrado se contradicen tarde o
temprano, y entonces ninguno de los dos sirve para decidir.

**Las reglas que importan viven en la base, no en el navegador.** La referencia
bancaria es `UNIQUE`: dos ventanillas capturando a la vez pueden pasar las dos
por la validación de la pantalla, y solo una puede pasar por la restricción. Que
nadie quede inscrito en un taller que no se imparte su día es una llave foránea
compuesta contra `taller_dias`, no un `if`.

**El participante no tiene sesión.** Entra con folio y matrícula, sin contraseña,
así que no hay a quién filtrar con RLS. Su único camino son las funciones
`SECURITY DEFINER` de `1300`, que comprueban la credencial y devuelven solo lo
suyo. Por eso `1600` revoca todo y concede una por una: es la diferencia entre
que consulte su folio y que reparta los días del evento.

**Nada se borra: se anula.** Una asistencia anulada sale de los cálculos y
conserva quién la anuló y por qué. Un usuario dado de baja se desactiva, porque
borrarlo dejaría sin autor cada entrada de bitácora que firmó. La bitácora no
tiene políticas de `UPDATE` ni `DELETE`, así que es inmutable: una bitácora
editable no sirve para aclarar una inconformidad.

## Lo que este esquema todavía no cubre

- **La aplicación sigue con datos simulados.** Estas migraciones crean la base;
  conectar las pantallas es un trabajo aparte.
- **Almacenamiento de archivos.** `evidencias.archivo_url` y `pagos.voucher_url`
  esperan una ruta de Supabase Storage. Faltan el bucket y sus políticas.
- **El envío de correos.** El código de verificación y los avisos necesitan un
  proveedor; la base solo guarda el correo.
- **El hash de las evidencias** lo calcula quien sube el archivo. La base lo
  guarda y lo indexa, pero no puede calcularlo por sí sola.

## Cómo se verificó

Las 16 migraciones se validaron contra **libpg_query**, el mismo analizador que
usa el servidor de PostgreSQL: 184 sentencias, todas sintácticamente válidas. Se
comprobó además que ninguna referencia apunte a una tabla o columna inexistente,
que ninguna mire hacia una migración posterior, que las 17 tablas queden con RLS
activo y con al menos una política —una tabla con RLS y sin políticas queda
inaccesible— y que los 12 tipos creados se usen.

**No se ejecutaron contra una base real.** No había PostgreSQL disponible en el
entorno, así que los errores que solo aparecen al ejecutar —un cuerpo de función
que nombra mal una columna, que PL/pgSQL no comprueba hasta la primera
llamada— podrían seguir ahí. Vale la pena correrlas primero en un proyecto de
prueba.
