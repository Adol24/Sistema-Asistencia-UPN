-- =============================================================================
-- 58 · Solo los alumnos entregan evidencia
--
-- `/portal/evidencias` lo dice desde siempre —«Las evidencias solo aplican para
-- alumnos», y a un docente ni siquiera le dibuja el formulario— pero la base no
-- lo comprobaba. Llamando a `fn_evidencia_preparar` directamente, cualquier
-- perfil podía reservar, subir y confirmar una entrega.
--
-- Salió al probar la migración 52 de punta a punta: el recorrido se hizo con un
-- DOCENTE, y funcionó entero. Que la prueba pasara era, en realidad, el
-- hallazgo.
--
-- No daba constancia a nadie: `v_elegibles` cuenta evidencias solo para el
-- perfil `alumno` desde la migración 53. Pero la fila entraba igual en la cola
-- de revisión, y ahí sí cuesta: alguien tiene que abrirla para descubrir que no
-- importaba, y con cinco mil imágenes de verdad por revisar eso no sobra.
--
-- Basta con cerrar `fn_evidencia_preparar`: `fn_evidencia_confirmar` solo acepta
-- una ruta que la fila ya tenga reservada, y esas rutas solo las emite esta.
--
-- El cuerpo se copió del archivo de la 52 de forma mecánica; lo único nuevo son
-- la variable del perfil y la comprobación. Retranscribir a mano para colar seis
-- líneas es cómo se perdió el limitador de `fn_padron_confirmar`.
-- =============================================================================

create or replace function fn_evidencia_preparar(
  p_folio text,
  p_credencial text,
  p_dia smallint
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_perfil perfil_participante;
  v_su_dia smallint;
  v_intentos smallint;
  v_estado estado_evidencia;
  v_ruta text;
begin
  perform privado.limitar('evidencia', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  select perfil, dia into v_perfil, v_su_dia from participantes where id = v_id;

  /*
   * Solo los alumnos entregan evidencia.
   *
   * `/portal/evidencias` ya lo decía —«Las evidencias solo aplican para
   * alumnos»— y la base no lo comprobaba, así que un docente podía entregar
   * llamando a la función directamente. No le servía de nada: `v_elegibles`
   * cuenta evidencias solo para el perfil `alumno` desde la migración 53. Pero
   * la fila sí acababa en la cola de revisión, y ahí sí cuesta: alguien tiene
   * que mirarla para descubrir que no importaba.
   */
  if v_perfil <> 'alumno' then
    raise exception 'Las evidencias son solo para alumnos: tu perfil no necesita entregar ninguna'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  -- La evidencia es de los días que NO le tocó asistir. Hasta ahora esto solo
  -- vivía en `v_elegibles`, que no consulta ninguna pantalla: alguien podía
  -- entregar la del día en que estuvo presente y contarla para su constancia.
  if p_dia = v_su_dia then
    raise exception 'El día % es el que te toca asistir en persona: su evidencia no se entrega', p_dia
      using errcode = 'check_violation';
  end if;

  select intentos, estado into v_intentos, v_estado
    from evidencias
   where participante_id = v_id and dia = p_dia;

  if v_estado = 'aprobada' then
    raise exception 'Tu evidencia del día % ya está aprobada', p_dia
      using errcode = 'check_violation';
  end if;

  if coalesce(v_intentos, 0) >= 3 then
    raise exception 'Ya usaste tus 3 intentos del día %. Escríbenos y lo revisamos', p_dia
      using errcode = 'check_violation';
  end if;

  /*
   * La ruta lleva el uuid del participante por delante para que las cinco mil
   * imágenes queden repartidas y no en una sola carpeta, y un uuid propio al
   * final para que reintentar no pise el archivo anterior: si la confirmación
   * se pierde, el objeto viejo queda huérfano en vez de corromper el nuevo.
   */
  v_ruta := format('%s/dia-%s-%s', v_id, p_dia, gen_random_uuid());

  -- Se reserva la fila con la ruta prometida, todavía sin entregar. El `check`
  -- de la tabla solo exige archivo y hash cuando el estado NO es
  -- `no_entregada`, así que esto es legal y es lo que permite al paso 3
  -- comprobar que la ruta es la que se emitió.
  insert into evidencias (participante_id, dia, archivo_url, estado)
  values (v_id, p_dia, v_ruta, 'no_entregada')
  on conflict (participante_id, dia) do update
    set archivo_url = excluded.archivo_url,
        estado = 'no_entregada',
        hash_archivo = null,
        subida_en = null;

  return v_ruta;
end;
$$;

revoke all on function fn_evidencia_preparar(text, text, smallint)
  from public, anon, authenticated;
grant execute on function fn_evidencia_preparar(text, text, smallint) to anon, authenticated;

comment on function fn_evidencia_preparar is
  'Paso 1 de la entrega: valida credencial, PERFIL, día y tope, y devuelve la '
  'ruta a la que subir. Solo los alumnos entregan evidencia.';
