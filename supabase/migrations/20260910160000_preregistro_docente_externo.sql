-- =============================================================================
-- El docente y el externo eligen su día, y por fin pueden pre-registrarse
--
-- El problema
-- -----------
-- No había ninguna forma de que un docente o un visitante externo entrara al
-- sistema. La única puerta de pre-registro es `fn_preregistrar_alumno`, y lo
-- primero que hace es exigir una matrícula del padrón:
--
--   select * into v_a from padron_alumnos where matricula = trim(p_matricula);
--   if v_a is null then raise exception 'Esa matrícula no está en el padrón';
--
-- Un docente no tiene matrícula. Llenaba su formulario, la pantalla le decía
-- que su día era el 1 —un valor por defecto del navegador, no una decisión de
-- nadie— y al continuar el alta fallaba. No quedaba registrado.
--
-- Por qué elige el día
-- --------------------
-- Al alumno se lo reparte Servicios Escolares: viene en el padrón y no es
-- negociable. El docente y el externo no están en ningún padrón, así que no hay
-- nada que repartirles; imponerles un día es inventárselo. Eligen el suyo, y
-- con él quedan sujetos a las mismas reglas que todos: la llave foránea
-- `(taller_id, dia)` sigue impidiendo que nadie se inscriba a un taller que no
-- se imparte su día.
--
-- Dos cosas que NO aplican a este perfil
-- --------------------------------------
-- El correo institucional, porque un visitante externo no tiene uno y exigirlo
-- lo dejaría fuera. Y los datos académicos, que van en NULL: el CHECK
-- `chk_alumno_completo` prohíbe expresamente que alguien que no es alumno
-- traiga nivel, programa o avance, porque serían datos inventados viajando
-- hasta los reportes.
-- =============================================================================

create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
begin
  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;

  -- El día lo elige quien se registra, pero tiene que ser uno de los del
  -- evento: la llave foránea lo rechazaría igual, con un mensaje que no
  -- ayudaría a nadie.
  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_institucion), '') = '' then
    raise exception 'Falta la institución' using errcode = 'check_violation';
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
    -- Se comprueba aquí para poder decirlo con palabras. La llave foránea
    -- `(taller_id, dia)` lo impediría de todos modos, pero su mensaje habla de
    -- restricciones y no de que ese taller no se imparte el día que eligió.
    if not exists (select 1 from taller_dias where taller_id = p_taller and dia = p_dia) then
      raise exception 'Ese taller no se imparte el día %', p_dia
        using errcode = 'check_violation';
    end if;
  end if;

  -- El nombre se guarda en mayúsculas porque la tabla lo exige: `nombre =
  -- upper(nombre)`. Se normaliza aquí en vez de confiar en que el formulario lo
  -- haya hecho, que es lo mismo que no comprobarlo.
  insert into participantes (
    perfil, matricula, nombre, correo, celular, institucion,
    nivel_id, programa_id, avance, grupo, plantel_id,
    dia, taller_id, monto_esperado_evento, monto_esperado_taller
  )
  values (
    v_perfil, null, upper(trim(p_nombre)), lower(trim(p_correo)), trim(p_celular),
    trim(p_institucion),
    null, null, null, null, null,
    p_dia, p_taller, v_cfg.cuota_evento, v_costo
  )
  returning id, folio into v_id, v_folio;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona)', v_folio, upper(trim(p_nombre)), p_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$$;

comment on function fn_preregistrar_externo is
  'Alta de docente o externo. El día lo elige la persona: no está en ningún '
  'padrón, así que no hay nada que repartirle. Sin correo institucional '
  'obligatorio y sin datos académicos, que el CHECK prohíbe para este perfil.';

-- Es la puerta del participante, como las demás del portal. Se concede a mano
-- porque desde `20260908160000` las funciones nuevas no nacen ejecutables.
revoke all on function fn_preregistrar_externo(text, text, text, text, text, smallint, uuid)
  from public;
grant execute on function fn_preregistrar_externo(text, text, text, text, text, smallint, uuid)
  to anon, authenticated;
