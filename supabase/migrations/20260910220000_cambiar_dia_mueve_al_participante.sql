-- =============================================================================
-- Cambiar el día en Administración no movía al participante
--
-- Qué pasaba
-- ----------
-- El día de una persona vive en DOS sitios: `padron_alumnos.dia` es el que
-- reparte Servicios Escolares, y `participantes.dia` es al que de verdad va a
-- asistir. El escáner de la puerta decide con el segundo.
--
-- La asignación desde Administración escribía solo el primero. En pantalla se
-- veía correcto —la aplicación movía a la persona en memoria— pero en la base
-- el participante seguía en su día viejo. Al escanear su código, la puerta leía
-- `participantes.dia`, veía el día anterior y respondía DÍA EQUIVOCADO a alguien
-- que sí había sido reasignado. Y al recargar la pantalla, el cambio
-- desaparecía: nunca había llegado a guardarse.
--
-- Existía `fn_reasignar_dia`, que hace lo correcto para una persona —mueve el
-- padrón, mueve al participante y libera su taller si ese día no se imparte—,
-- pero no la llamaba nadie. La aplicación usaba un `update` directo sobre el
-- padrón para todos los casos, incluido el de una sola persona.
--
-- Esta función es esa misma lógica para un conjunto, en una sola ida a la base:
-- reasignar un grupo entero llamando N veces a la de una persona serían N
-- viajes por cada sede que se mueve.
-- =============================================================================

create or replace function fn_asignar_dia_a_varios(
  p_matriculas text[],
  p_dia smallint
)
returns table (matricula text, taller_liberado text)
language plpgsql
-- SIN `security definer`, a diferencia de las funciones del portal, y es
-- deliberado. Aquí no hace falta saltarse nada: quien llama ya tiene sesión, y
-- corriendo con SUS permisos las políticas de `padron_alumnos`, `participantes`
-- y `avisos_participante` —las tres de administración y soporte— son
-- exactamente la comprobación que hace falta. Con `security definer` correría
-- como el dueño de las tablas, que no está sujeto a ninguna, y cualquier
-- usuario autenticado podría mover a la gente de día.
set search_path = public
as $$
begin
  update padron_alumnos a set dia = p_dia where a.matricula = any (p_matriculas);

  -- Quitarle el día a alguien solo tiene sentido en el padrón: un participante
  -- ya registrado tiene que asistir algún día, y `participantes.dia` es NOT NULL.
  if p_dia is null then
    return;
  end if;

  return query
  with afectados as (
    -- Los que pierden su taller porque no se imparte el día nuevo. Se
    -- identifican ANTES de tocar nada, para poder avisarles y devolverlos.
    select p.id, p.matricula, t.clave
      from participantes p
      join talleres t on t.id = p.taller_id
     where p.matricula = any (p_matriculas)
       and not exists (
         select 1 from taller_dias td
          where td.taller_id = p.taller_id and td.dia = p_dia
       )
  ),
  liberados as (
    -- El día y el taller se cambian en la MISMA sentencia. Moverlos por
    -- separado dejaría un instante con el día nuevo y el taller viejo, que es
    -- justo lo que la llave foránea `(taller_id, dia)` prohíbe.
    update participantes p
       set dia = p_dia,
           taller_id = null,
           monto_esperado_taller = null
      from afectados a
     where p.id = a.id
    returning p.id
  ),
  avisados as (
    -- Enterarse de que se perdió la inscripción al llegar sería peor que
    -- enterarse ahora, así que el aviso le espera en su portal.
    insert into avisos_participante (participante_id, texto)
    select a.id,
           format(
             'Cambiaste al día %s y el taller «%s» no se imparte ese día, así que tu '
             'inscripción se liberó. Puedes elegir otro taller; si ya lo habías pagado, '
             'acude a Servicios Financieros.',
             p_dia, a.clave
           )
      from afectados a
    returning 1
  ),
  resto as (
    -- Los demás solo cambian de día. `is distinct from` evita reescribir a
    -- quien ya estaba ahí: sería trabajo inútil y ruido en el tiempo real.
    update participantes p
       set dia = p_dia
     where p.matricula = any (p_matriculas)
       and p.dia is distinct from p_dia
       and p.id not in (select a.id from afectados a)
    returning p.id
  )
  select a.matricula, a.clave from afectados a;
end;
$$;

comment on function fn_asignar_dia_a_varios is
  'Mueve de día a un conjunto: el padrón Y el participante, que es el que lee '
  'el escáner de la puerta. Escribir solo el padrón hacía que la puerta '
  'rechazara por DÍA EQUIVOCADO a quien acababa de ser reasignado.';

-- Se concede a `authenticated` porque el anónimo no tiene nada que hacer aquí y
-- porque desde `20260908160000` las funciones nuevas no nacen ejecutables. Que
-- pueda EJECUTARLA no significa que pueda escribir: al correr con los permisos
-- de quien llama, a un capturista las políticas le dejan las tres tablas
-- intactas y la función no cambia nada.
revoke all on function fn_asignar_dia_a_varios(text[], smallint) from public, anon;
grant execute on function fn_asignar_dia_a_varios(text[], smallint) to authenticated;
