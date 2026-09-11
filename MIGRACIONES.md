# Migraciones

## Aplicadas

Las 16 originales (`20260907000100` … `20260907001600`) y las tres de seguridad,
confirmadas contra el proyecto real: `fn_padron_existe` responde 200,
`fn_evaluar_escaneo` y `fn_buscar_en_padron` responden 401 al público.

## Pendiente

| # | Archivo | Qué hace |
| --- | --- | --- |
| 20 | `20260908180000_catalogo_academico_real.sql` | Sustituye el catálogo de ejemplo por la oferta real de la UPN |
| 30 | `20260911120000_puerta_como_torniquete.sql` | Permite ir y volver por la puerta, y que el cierre no tape a quien se fue |
| 31 | `20260911140000_puntos_de_captura_por_dia.sql` | Cada sede nombra sus propios puntos de captura |

Hasta que corra, la aplicación seguirá mostrando los programas de ejemplo: el
catálogo se carga de la base, no del código.

La migración da de alta los nueve programas reales **antes** de retirar los de
ejemplo, para que nunca haya un momento sin catálogo. Solo retira los que no
tienen alumnos detrás —`padron_alumnos` y `participantes` apuntan a `programas`
con `on delete restrict`, así que un borrado a ciegas fallaría a medias— y avisa
por consola de los que queden, con cuántas filas dependen de cada uno.

También baja licenciatura de 10 a 8 semestres y cambia «Módulo» por
«Cuatrimestre» en maestría. El disparador `fn_validar_avance` solo actúa al
insertar o actualizar, así que no invalida filas existentes; la migración cuenta
cuántas se pasarían del nuevo tope y lo avisa.

### La puerta como torniquete (30)

Es la única pendiente que **quita** una restricción, así que conviene leerla
antes de correrla.

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

**Pruébalas primero en un proyecto de prueba.** No se han ejecutado contra
ningún Postgres: en la máquina donde se escribieron no hay `psql`, ni el CLI de
Supabase, ni Docker. Están revisadas leyéndolas, no probadas.

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
