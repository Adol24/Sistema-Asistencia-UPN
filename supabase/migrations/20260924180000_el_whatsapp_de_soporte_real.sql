-- =============================================================================
-- El WhatsApp de soporte real, y un formato que no se pueda romper
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924180000_el_whatsapp_de_soporte_real`.
--
-- El número que había
-- -------------------
-- `5211234567890`. Es el relleno de la migración de datos iniciales, hermano
-- de la cuenta de BBVA que se retiró el 2026-09-24: los diez dígitos son
-- `1234567890`. Todos los enlaces de «escríbenos por WhatsApp» del sitio
-- apuntaban ahí.
--
-- El nuevo es **231 147 2210**, dicho por la organización el 2026-09-24.
--
-- Por qué `52` y no `521`
-- -----------------------
-- `wa.me` quiere el número internacional sin signos, sin espacios y sin ceros
-- de salida: lada de país pegada a los diez dígitos. Para México eso es
-- `52` + `2311472210` = `522311472210`.
--
-- El `1` que llevaba el valor anterior —`521…`— es herencia de cuando WhatsApp
-- distinguía móvil de fijo en México. Dejó de hacer falta en 2020 y hoy los
-- números mexicanos se normalizan sin él. `wa.me/521…` todavía resuelve, pero
-- guardar la forma vigente evita que alguien la «corrija» de vuelta más
-- adelante sin saber por qué estaba.
--
-- El formato, ahora comprobado
-- ----------------------------
-- La columna era `text` a secas y el panel la edita con un campo de texto
-- libre. Escribir «231 147 2210» tal como se lee —con espacios— dejaba el
-- enlace roto **en todas las pantallas a la vez** y sin ninguna señal: el
-- botón sigue ahí, se pulsa, y WhatsApp abre una pantalla de número inválido.
-- Es el mismo fallo silencioso que la CLABE inventada, y se cierra igual: con
-- una restricción.
--
-- Se admite la cadena vacía porque es un estado real y ya está contemplado:
-- `PiePublico` comprueba `evento.whatsappSoporte` antes de dibujar el enlace, y
-- sin número no lo dibuja en vez de ofrecer uno que no lleva a nadie.
-- =============================================================================

update configuracion_evento
   set whatsapp_soporte = '522311472210'
 where id = 1;

alter table configuracion_evento
  drop constraint if exists whatsapp_soporte_formato;

alter table configuracion_evento
  add constraint whatsapp_soporte_formato
  check (whatsapp_soporte = '' or whatsapp_soporte ~ '^[0-9]{10,15}$');

comment on column configuracion_evento.whatsapp_soporte is
  'Solo dígitos, con lada de país pegada: 52 y los diez del número. Es lo que '
  '`wa.me` acepta. Vacío significa que no se ofrece el enlace, no que falte.';

-- ---------------------------------------------------------------------------
-- Que el enlace que se va a pintar lleve a alguien
-- ---------------------------------------------------------------------------
do $$
declare
  v_numero text;
begin
  select whatsapp_soporte into v_numero from configuracion_evento where id = 1;

  if v_numero is null or v_numero = '' then
    raise warning 'El WhatsApp de soporte quedó vacío: el sitio no ofrecerá el enlace.';
    return;
  end if;

  if v_numero = '5211234567890' then
    raise exception
      'El WhatsApp de soporte sigue siendo el número de relleno. El `update` no '
      'encontró la fila 1 de `configuracion_evento`.';
  end if;

  raise notice 'WhatsApp de soporte: % → https://wa.me/%', v_numero, v_numero;
  raise notice 'Compruébalo abriendo ese enlace antes de que abra el registro.';
end;
$$;
