-- =============================================================================
-- La CURP también la pueden guardar docentes y externos
--
-- La migración 20261026120000 la limitó a alumno: en ese momento solo el
-- alumno tenía constancia que ligar a RENAPO. Adol pidió abrirla -docente y
-- externo también la necesitan para la suya- y hoy `fn_portal_guardar_curp`
-- la rechaza con "La CURP solo se pide a los alumnos".
--
-- La columna, el índice único y la validación de formato no cambian: ya eran
-- de `participantes` entero, no de un perfil. Lo único que se quita es el
-- `if v_perfil <> 'alumno'`.
-- =============================================================================

create or replace function fn_portal_guardar_curp(p_folio text, p_credencial text, p_curp text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_curp text := upper(trim(coalesce(p_curp, '')));
begin
  perform privado.limitar('curp', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  if v_curp !~ '^[A-Z0-9]{18}$' then
    raise exception 'La CURP debe tener 18 letras y números' using errcode = 'check_violation';
  end if;

  if exists (select 1 from participantes where curp = v_curp and id <> v_id) then
    raise exception 'Esa CURP ya está registrada con otro folio' using errcode = 'unique_violation';
  end if;

  update participantes set curp = v_curp where id = v_id;
end;
$$;

revoke all on function fn_portal_guardar_curp(text, text, text) from public, anon, authenticated;
grant execute on function fn_portal_guardar_curp(text, text, text) to anon, authenticated;

comment on function fn_portal_guardar_curp is
  'Guarda la CURP del participante autenticado por folio+credencial, sin importar el perfil. Exige 18 alfanuméricos.';
