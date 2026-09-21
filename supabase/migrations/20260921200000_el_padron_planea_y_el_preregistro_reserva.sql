-- =============================================================================
-- 47 · El padrón planea, el pre-registro reserva
--
-- Qué cambia
-- ----------
-- `fn_asignar_dia_a_varios` deja de **impedir** que la organización reparta más
-- alumnos a un día de los que caben en la sede. Pasa a permitirlo.
--
-- El tope sigue existiendo, y sigue siendo firme, donde de verdad importa:
-- `fn_preregistrar_alumno` cuenta `participantes` bajo candado y rechaza el alta
-- que no cabe. Eso no se toca.
--
-- Por qué estaba mal donde estaba
-- -------------------------------
-- La 42 puso el techo en dos sitios y contando dos cosas distintas:
--
--   reparto de días  -> cuenta `padron_alumnos.dia`   (el PLAN)
--   pre-registro     -> cuenta `participantes`        (la REALIDAD)
--
-- Y las confundió. `padron_alumnos.dia` no es una reserva: es una intención de
-- la universidad sobre gente que **todavía no se ha inscrito y en buena parte no
-- lo hará**. De los alumnos de un padrón nunca se pre-registran todos.
--
-- Con el tope ahí, asignar el día 1 a los 800 alumnos de una zona era imposible
-- aunque se supiera de antemano que solo van a inscribirse unos quinientos. La
-- organización se veía obligada a partir sedes que viajan juntas, o a dejar
-- alumnos sin día, para respetar un límite que ninguno de ellos estaba ocupando
-- todavía.
--
-- Un asiento lo ocupa quien se pre-registra. Hasta entonces, el número es una
-- previsión.
--
-- Lo que NO se pierde
-- -------------------
-- Sobrevender tiene consecuencias reales: si se planean 800 para un día de 700,
-- los últimos cien que intenten inscribirse van a encontrarse la puerta cerrada
-- **después** de que se les dijera qué día les tocaba. Eso hay que saberlo al
-- repartir, que es cuando todavía se puede corregir.
--
-- Así que el dato no desaparece, cambia de forma: la pantalla del padrón lo
-- enseña —cuántos planeados contra cuántos caben, día por día— y avisa al
-- pasarse. Informar y dejar decidir, en vez de decidir por la organización.
-- =============================================================================

create or replace function fn_asignar_dia_a_varios(
  p_matriculas text[],
  p_dia smallint
)
returns table (matricula text, taller_liberado text)
language plpgsql
-- Sigue SIN `security definer`, igual que antes y por lo mismo: quien llama ya
-- tiene sesión, y corriendo con SUS permisos las políticas de `padron_alumnos`,
-- `participantes` y `avisos_participante` son exactamente la comprobación que
-- hace falta. Con `security definer` correría como el dueño de las tablas, que
-- no está sujeto a ninguna, y cualquier usuario autenticado podría mover gente
-- de día.
set search_path = public
as $$
begin
  /*
   * Aquí vivía la comprobación de aforo contra `padron_alumnos.dia`.
   *
   * Se retira entera, no se ablanda: un tope que a veces deja pasar es peor que
   * ninguno, porque nadie sabe cuándo confiar en él. El aforo se sostiene en
   * `fn_preregistrar_alumno`, contra `participantes` y con
   * `pg_advisory_xact_lock`, que es donde un lugar se ocupa de verdad.
   *
   * El resto del cuerpo es **idéntico** al de la 42, copiado literal: liberar
   * el taller de quien cambia a un día en que no se imparte, dejarle el aviso en
   * su portal, y mover a los demás. Lo único que se quita es el techo.
   */
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
  'Reparte días en el padrón. NO comprueba aforo a propósito: el padrón es un plan y el lugar lo ocupa quien se pre-registra.';
