-- =============================================================================
-- 1400 · Eliminar una respuesta de la encuesta
--
-- `/admin/encuesta` solo podía mirar. Con la unicidad por conferencia que
-- acaba de nacer —ver `20261012130000_una_evaluacion_por_conferencia.sql`—
-- alguien que se equivocó de matrícula, de correo o de conferencia queda
-- atrapado contra su propio registro: no puede volver a contestar, y antes
-- de esta migración la única salida era pegar SQL a mano en el editor de
-- Supabase, contra la tabla de producción, igual que pasaba con los
-- pre-registros antes de `fn_eliminar_preregistro`.
--
-- Mismo patrón que aquella función: SOLO administración, security definer
-- —la tabla sigue con RLS sin política para anon/authenticated—, y la
-- bitácora se anota dentro de la misma transacción que borra la fila.
--
-- Encuesta no tiene huella que proteger: no hay llave foránea que dependa de
-- `encuesta_respuestas.id`, así que no hace falta comprobar nada antes de
-- borrar. No se deshace.
-- =============================================================================

create or replace function fn_eliminar_respuesta_encuesta(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_conferencia text;
begin
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede eliminar una respuesta de la encuesta'
      using errcode = 'insufficient_privilege';
  end if;

  delete from encuesta_respuestas
  where id = p_id
  returning nombre, conferencia into v_nombre, v_conferencia;

  if v_nombre is null then
    raise exception 'No hay ninguna respuesta con ese identificador'
      using errcode = 'no_data_found';
  end if;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    'Eliminó una respuesta de la encuesta',
    format('%s · %s', v_nombre, v_conferencia)
  );

  return jsonb_build_object('nombre', v_nombre, 'conferencia', v_conferencia);
end;
$$;

comment on function fn_eliminar_respuesta_encuesta is
  'Elimina una respuesta de la encuesta de conferencias preliminares. SOLO administración. No se deshace.';

revoke all on function fn_eliminar_respuesta_encuesta(uuid) from public, anon;
grant execute on function fn_eliminar_respuesta_encuesta(uuid) to authenticated;
