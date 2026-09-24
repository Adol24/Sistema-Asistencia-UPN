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
-- La CLABE que nadie dio
-- ----------------------
-- De los cuatro datos bancarios llegaron tres. La CLABE **no**, y no se puede
-- deducir: la de Santander son 18 dígitos —`014` + plaza + los 11 de la cuenta
-- + dígito de control— y la plaza no está en ningún lado. Inventarla sería
-- exactamente el fallo que esta migración viene a arreglar.
--
-- Así que se guarda vacía, y `/pago` deja de dibujar esa fila cuando lo está:
-- el alumno ve tres datos ciertos en vez de cuatro con uno falso. Dejar la
-- CLABE del relleno junto a una cuenta de Santander sería peor que no tener
-- ninguna —la de BBVA existe, y quien la copie manda el dinero a otro banco—.
--
-- Por eso el `check` de la columna cambia: seguía exigiendo 18 dígitos y `not
-- null`, así que «todavía no la sabemos» no era un estado que la base
-- permitiera, ni desde aquí ni desde el panel de configuración. Ahora acepta
-- las dos cosas que son ciertas: una CLABE completa, o ninguna. Lo que NO
-- acepta es una a medias.
-- =============================================================================

alter table configuracion_evento
  drop constraint if exists configuracion_evento_banco_clabe_check;

alter table configuracion_evento
  add constraint configuracion_evento_banco_clabe_check
  check (banco_clabe = '' or banco_clabe ~ '^[0-9]{18}$');

comment on column configuracion_evento.banco_clabe is
  'Vacía significa que no se conoce: /pago oculta la fila en vez de mostrar una falsa. Con valor, son los 18 dígitos completos.';

update configuracion_evento
   set banco_nombre       = 'Santander',
       banco_cuenta       = '65501202802',
       banco_clabe        = '',
       banco_beneficiario = 'Universidad Pedagógica Nacional'
 where id = 1;

/*
 * Que la fila quedó como dice la cabecera, no como dice la intención.
 *
 * El `update` de arriba no falla si la fila no existe —afecta cero filas y
 * Postgres lo da por bueno—, y este archivo se pega a mano en el editor SQL de
 * producción, donde nadie lee el «UPDATE 0». Esto lo convierte en un error.
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
     or fila.banco_beneficiario <> 'Universidad Pedagógica Nacional'
     or fila.banco_clabe <> '' then
    raise exception 'Los datos bancarios no quedaron como esta migración los deja. Están así: banco=%, cuenta=%, clabe=%, beneficiario=%',
      fila.banco_nombre, fila.banco_cuenta, fila.banco_clabe, fila.banco_beneficiario;
  end if;

  raise notice 'Datos de pago: % · cuenta % · % (sin CLABE)',
    fila.banco_nombre, fila.banco_cuenta, fila.banco_beneficiario;
end
$$;
