-- =============================================================================
-- El alumno guarda su CURP
--
-- RENAPO exige la CURP para expedir la constancia, y hasta ahora el sistema no
-- la pedía en ningún paso: ni el pre-registro ni el portal la mencionaban. El
-- alumno la escribe desde su portal, cuando quiera, y queda guardada contra su
-- participante.
--
-- Solo el alumno la necesita: docente y externo no tienen expediente escolar
-- que ligar a RENAPO para este documento. La columna admite nulo -nadie trae
-- la suya el día que se registra- y la función rechaza cualquier otro perfil.
--
-- La validación es de FORMA, no de estructura: 18 caracteres, letras y
-- números. No se comprueba que la fecha de nacimiento o el sexo codificados
-- adentro sean reales -eso es trabajo de RENAPO, no de este sistema- así que
-- una CURP bien tecleada pero inventada pasa. Atrapa el error de dedo, que es
-- el caso común; no sustituye la validación oficial.
-- =============================================================================

alter table participantes
  add column curp text
  check (curp is null or curp ~ '^[A-Z0-9]{18}$');

-- Nula para docente y externo -muchos a la vez-, única para quien sí la trae.
create unique index participantes_curp_key on participantes (curp) where curp is not null;

comment on column participantes.curp is
  'Clave Única de Registro de Población. Solo el alumno la llena, desde su portal. Nula hasta que la escribe.';

-- ---------------------------------------------------------------------------
-- La guarda, por folio + credencial, igual que el resto del portal.
-- ---------------------------------------------------------------------------
create or replace function fn_portal_guardar_curp(p_folio text, p_credencial text, p_curp text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_perfil perfil_participante;
  v_curp text := upper(trim(coalesce(p_curp, '')));
begin
  perform privado.limitar('curp', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  select perfil into v_perfil from participantes where id = v_id;

  if v_perfil <> 'alumno' then
    raise exception 'La CURP solo se pide a los alumnos' using errcode = 'check_violation';
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
  'Guarda la CURP del alumno autenticado por folio+credencial. Rechaza otro perfil y exige 18 alfanuméricos.';

-- ---------------------------------------------------------------------------
-- v_participantes necesita la columna nueva: `fn_portal_estado` la expone con
-- `to_jsonb(vp)`, y sin tocar la vista el alumno nunca vería lo que acaba de
-- guardar. El cuerpo es el de la migración de abonos de prórroga; lo único que
-- cambia es la línea de `curp`.
-- ---------------------------------------------------------------------------
create or replace view v_participantes
with (security_invoker = true) as
select
  p.id,
  p.folio,
  p.perfil,
  p.matricula,
  p.nombre,
  p.nombre_en_revision,
  p.curp,
  p.correo,
  p.celular,
  p.institucion,
  n.nivel,
  pr.nombre as programa,
  p.avance,
  n.etiqueta_avance,
  p.grupo,
  pl.nombre as plantel,
  p.dia,
  d.fecha as fecha_dia,
  -- La sede sale del día, no de una copia guardada en el participante.
  d.sede,
  p.taller_id,
  t.clave as taller_clave,
  t.nombre as taller_nombre,
  p.monto_esperado_evento,
  p.monto_esperado_taller,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'evento')
    as estado_pago_evento,
  (select estado from v_estado_pago v where v.participante_id = p.id and v.concepto = 'taller')
    as estado_pago_taller,
  p.creado_en,
  p.acepto_aviso_en,
  p.prorroga_hasta
from participantes p
join dias_evento d on d.dia = p.dia
left join niveles_academicos n on n.id = p.nivel_id
left join programas pr on pr.id = p.programa_id
left join planteles pl on pl.id = p.plantel_id
left join talleres t on t.id = p.taller_id;

alter view v_participantes set (security_invoker = true);
