# Migraciones

## Aplicadas

Las 16 originales (`20260907000100` … `20260907001600`) y las tres de seguridad,
confirmadas contra el proyecto real: `fn_padron_existe` responde 200,
`fn_evaluar_escaneo` y `fn_buscar_en_padron` responden 401 al público.

## Pendiente

| # | Archivo | Qué hace |
| --- | --- | --- |
| 20 | `20260908180000_catalogo_academico_real.sql` | Sustituye el catálogo de ejemplo por la oferta real de la UPN |

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
curl -s -X POST "$URL/rest/v1/rpc/fn_evaluar_escaneo" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_entrada":"X","p_dia":1,"p_tipo":"entrada"}'
```
