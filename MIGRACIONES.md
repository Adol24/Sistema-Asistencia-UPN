# Migraciones pendientes

Estado comprobado contra el proyecto real el 8 de septiembre de 2026, con una
sonda de solo lectura usando la clave publicable.

## Lo que ya está aplicado

Las **16 migraciones originales** (`20260907000100` … `20260907001600`). Se
confirmó llamando a `fn_buscar_en_padron`, que responde 200.

## Lo que falta correr, en este orden

| # | Archivo | Qué hace |
| --- | --- | --- |
| 17 | `20260908120000_padron_sin_enumeracion.sql` | Parte la consulta del padrón y le quita el acceso a `anon` |
| 18 | `20260908140000_limite_por_ip.sql` | Límite de intentos por IP; `fn_perfil_interno` |
| 19 | `20260908160000_revocar_ejecucion_publica.sql` | Cierra las funciones del personal al público |

Comprobado: `fn_padron_existe`, `fn_padron_confirmar` y `fn_perfil_interno`
devuelven 404 en el proyecto, o sea que ninguna de las tres está aplicada.

## Por qué corre prisa

Con solo las 16 originales, el proyecto **hoy** tiene dos agujeros abiertos:

1. `fn_buscar_en_padron` devuelve el expediente académico completo —nombre,
   nivel, programa, avance, grupo, plantel— a cambio de una matrícula, a
   cualquiera con la clave publicable. Las matrículas siguen un patrón, así que
   recorrerlas es un bucle.
2. Las funciones del personal responden a llamadas anónimas. Se comprobó:
   `fn_evaluar_escaneo` devolvió 200 a una llamada sin sesión. La causa es que
   `create function` concede `EXECUTE` a `PUBLIC` por defecto y nadie lo revocó;
   los `grant ... to authenticated` de `permisos.sql` añadían un permiso que ya
   tenía todo el mundo. Entre las expuestas hay dos que escriben.

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
