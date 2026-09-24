-- =============================================================================
-- 65 · Los datos de pago reales
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924000000_los_datos_de_pago_reales`.
--
-- El problema
-- -----------
-- La cuenta que ve el alumno en `/pago` sigue siendo la inventada de la
-- migración de datos iniciales: «BBVA México», cuenta `0123456789`, CLABE
-- `012320001234567897`, beneficiario «UNIVERSIDAD AUTONOMA — ENCUENTRO
-- INTERNACIONAL». Eran datos de relleno para que el sistema arrancara, y ahí
-- se quedaron. La cuenta real del Encuentro es de Santander, y es esta:
--
--   · Banco .......... Santander
--   · Cuenta ......... 65501202802
--   · Beneficiario ... Universidad Pedagógica Nacional
--
-- Son setecientos depósitos. Un dígito equivocado aquí no es un error de
-- pantalla: es dinero que sale de la cuenta del alumno y no llega a ninguna.
--
-- La CLABE se retira
-- ------------------
-- Son tres datos, no cuatro: **la CLABE deja de existir en el sistema**. No es
-- que falte y se espere —decisión de la organización el 2026-09-24—, así que la
-- columna se va con ella en vez de quedarse vacía marcando un hueco.
--
-- Lo que no podía quedarse era la del relleno. Es de BBVA y **existe**: quien
-- la copiara junto a una cuenta de Santander mandaría el depósito a una cuenta
-- ajena. Una CLABE falsa es peor que ninguna, y ninguna es justo lo que el
-- alumno necesita aquí: el depósito se hace a la cuenta, que es lo que se le da.
--
-- En el cliente desaparecen la fila de `/pago`, el campo de
-- `/admin/configuracion` y `banco.clabe` del tipo `ConfiguracionEvento`. Nada
-- en la base la leía: ninguna vista, función ni política la nombra —solo la
-- definición de la tabla y el `insert` de datos iniciales—, así que soltarla no
-- arrastra nada.
--
-- Si algún día vuelve a hacer falta, vuelve en una migración de una línea
-- (`alter table … add column banco_clabe text not null default ''`) y el campo
-- regresa al panel. Retirarla no cierra esa puerta.
-- =============================================================================

update configuracion_evento
   set banco_nombre       = 'Santander',
       banco_cuenta       = '65501202802',
       banco_beneficiario = 'Universidad Pedagógica Nacional'
 where id = 1;

alter table configuracion_evento drop column if exists banco_clabe;

/*
 * Que la fila quedó como dice la cabecera, no como dice la intención.
 *
 * El `update` de arriba no falla si la fila no existe —afecta cero filas y
 * Postgres lo da por bueno—, y este archivo se pega a mano en el editor SQL de
 * producción, donde nadie lee el «UPDATE 0». Esto lo convierte en un error.
 *
 * Y de paso que la columna se fue de verdad. `drop column if exists` calla
 * igual si nunca existió que si la acaba de soltar, así que preguntar por ella
 * es la única forma de distinguir las dos cosas.
 */
do $$
declare
  fila configuracion_evento%rowtype;
begin
  select * into fila from configuracion_evento where id = 1;

  if not found then
    raise exception 'No hay configuracion_evento con id = 1: los datos de pago no se guardaron en ningún lado.';
  end if;

  if fila.banco_nombre <> 'Santander'
     or fila.banco_cuenta <> '65501202802'
     or fila.banco_beneficiario <> 'Universidad Pedagógica Nacional' then
    raise exception 'Los datos bancarios no quedaron como esta migración los deja. Están así: banco=%, cuenta=%, beneficiario=%',
      fila.banco_nombre, fila.banco_cuenta, fila.banco_beneficiario;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'configuracion_evento'
       and column_name = 'banco_clabe'
  ) then
    raise exception 'La columna banco_clabe sigue en configuracion_evento: la CLABE no se retiró.';
  end if;

  raise notice 'Datos de pago: % · cuenta % · %',
    fila.banco_nombre, fila.banco_cuenta, fila.banco_beneficiario;
end
$$;
