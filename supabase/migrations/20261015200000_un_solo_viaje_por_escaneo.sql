-- Un escaneo de la puerta hacía 2 o 3 viajes al servidor: buscar el id del
-- folio, si era de taller preguntar el taller del participante, e insertar.
-- Es la función de mayor frecuencia de todo el sistema —cada escaneo, de las
-- seis estaciones, durante horas— y cada viaje de más es otra petición contra
-- el mismo proyecto que, el día del evento, ya tiene encima la carga de
-- Realtime y el resto de pantallas. Se junta en una sola función.
--
-- security invoker, no definer
-- ----------------------------
-- A propósito. `security invoker` corre con el permiso de quien llama, así
-- que sigue pasando por las MISMAS políticas de siempre: `participantes_lectura`
-- (necesita `es_interno_activo()`) y `asistencias_alta` (necesita rol `admin` o
-- `capturista`). No se amplía ni se reduce el permiso de nadie, solo se junta
-- en un viaje lo que antes eran tres. `auth.uid()` firma el registro: ya no
-- hace falta que el navegador mande quién es, ni pedírselo a `getSession()`.
--
-- Qué NO cambia
-- -------------
-- Los disparadores de `asistencias` —`trg_exigir_dia_real`,
-- `trg_exigir_alternancia_de_puerta`— siguen viéndose exactamente igual:
-- disparan sobre cualquier INSERT, venga de PostgREST directo o de una
-- función. La regla sigue viviendo en un solo sitio.
--
-- El choque contra una llave única —la primaria, o `uq_asistencia_taller`—
-- sigue significando «ya estaba», no «falló»: es lo que permite reintentar sin
-- duplicar cuando la respuesta se perdió a mitad de camino. Antes lo decidía
-- el navegador mirando `error.code`; ahora lo decide la propia función, con el
-- mismo criterio.

create or replace function fn_registrar_asistencia(
  p_folio text,
  p_dia smallint,
  p_tipo tipo_asistencia,
  p_punto text,
  p_autorizacion_motivo text default null,
  p_id_remoto uuid default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_participante_id uuid;
  v_taller_id uuid;
begin
  select id, taller_id
    into v_participante_id, v_taller_id
    from participantes
   where folio = p_folio;

  if v_participante_id is null then
    raise exception 'No encontramos el folio %.', p_folio;
  end if;

  if p_tipo = 'taller' and v_taller_id is null then
    raise exception '% no está inscrito en ningún taller: no se puede pasar su lista.', p_folio;
  end if;

  begin
    insert into asistencias (
      id, participante_id, dia, tipo, punto, taller_id, capturista_id, autorizacion_motivo
    ) values (
      coalesce(p_id_remoto, gen_random_uuid()),
      v_participante_id,
      p_dia,
      p_tipo,
      p_punto,
      -- Solo en taller: `chk_taller_solo_en_taller` exige null en los demás
      -- tipos, aunque el participante sí tenga uno asignado.
      case when p_tipo = 'taller' then v_taller_id else null end,
      auth.uid(),
      p_autorizacion_motivo
    );
  exception
    when unique_violation then
      -- La fila entró y la respuesta se perdió de vuelta —la red cayéndose a
      -- mitad de la petición—, así que el reintento choca contra la misma
      -- llave. En la base está exactamente lo que se quería poner.
      null;
  end;
end;
$$;

comment on function fn_registrar_asistencia is
  'Registra un escaneo en un solo viaje: antes eran dos o tres (buscar folio, taller, insertar). security invoker: mismas políticas de siempre.';

grant execute on function fn_registrar_asistencia(
  text, smallint, tipo_asistencia, text, text, uuid
) to authenticated;
