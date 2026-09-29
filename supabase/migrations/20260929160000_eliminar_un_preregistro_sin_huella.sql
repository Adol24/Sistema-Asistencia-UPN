-- =============================================================================
-- Eliminar un pre-registro que no dejó huella
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260929160000_eliminar_un_preregistro_sin_huella`.
--
-- Qué cambia
-- ----------
-- Nace `fn_eliminar_preregistro(folio)`, **solo para administración**: la
-- primera y única forma de retirar del sistema a alguien que se pre-registró y
-- ya no va a venir.
--
-- Por qué no existía, y por qué existe ahora
-- ------------------------------------------
-- No existía a propósito, y está escrito: la cabecera de
-- `supabase/utilidades/limpiar-datos-de-prueba.sql` dice que «una puerta que
-- permita borrar participantes desde fuera es exactamente lo que no queremos que
-- exista». Eso sigue siendo cierto para el ANÓNIMO, que es de quien hablaba: las
-- funciones públicas siguen sin poder borrar nada, y esta se revoca a `anon`.
--
-- Lo que faltaba era del otro lado. Quien escribe «me inscribí por error» o «ya
-- no voy a ir» dejaba su folio ocupando un lugar del aforo y, si había elegido
-- taller, un lugar del taller. La única respuesta que el sistema podía dar era
-- pegar SQL a mano en el editor de Supabase, contra la tabla de producción, con
-- el registro abierto. Eso es peor que una función con guardias.
--
-- Solo se borra a quien no dejó huella, y la base ya lo decía
-- -----------------------------------------------------------
-- No hace falta inventar la regla: las llaves foráneas la llevan escritas desde
-- el 7 de septiembre. Cuatro de las cinco que apuntan a `participantes` son
-- `on delete restrict`, así que la base YA rechaza borrar a quien dejó rastro.
-- Esta función no la relaja: la comprueba antes, para poder decir CUÁL de las
-- tres es y a dónde mandar a esa persona.
--
--   pagos        · restrict · hay dinero suyo registrado. Es de Servicios
--                  Financieros decidir qué pasa con él, y de nadie más.
--   asistencias  · restrict · entró por la puerta. Eso ocurrió, y el registro de
--                  quién estuvo en el evento no se reescribe.
--   evidencias   · restrict · entregó trabajo. Lo mismo.
--
-- Con cualquiera de las tres, la excepción dice cuántas hay y por qué no se
-- borra. Sin ninguna, el `delete` pasa.
--
-- Las dos que SÍ se van con la persona
-- -------------------------------------
--   avisos_participante · `on delete cascade` desde siempre. Un aviso que le
--                         esperaba en un portal que ya no existe no es nada.
--
--   casos_soporte       · es `restrict`, y aquí se borran a propósito ANTES.
--
-- Lo segundo es la única decisión de esta migración, así que se razona. Un caso
-- de soporte no es una huella de la persona: es una anotación SOBRE su registro.
-- Lo dice el comentario de su propia tabla —«un caso de nombre abierto es lo que
-- señala al participante en el listado de elegibles»— y lo confirma quién los
-- crea: `fn_abrir_caso_nombre`, que se dispara sola en el pre-registro cuando
-- alguien corrige cómo viene escrito su nombre. No lleva dinero ni presencia.
--
-- Bloquear por eso haría inútil la función para una parte grande de la gente
-- —cualquiera que haya tocado su nombre— a cambio de conservar un renglón que
-- apunta a un folio inexistente. Se van dentro de la MISMA transacción, así que
-- o se va todo o no se va nada, y la bitácora dice cuántos eran.
--
-- El disparador `trg_caso_marca_nombre` corre al borrarlos y actualiza
-- `participantes.nombre_en_revision`, sobre una fila que sigue viva en ese
-- instante. Por eso los casos van primero y el participante después.
--
-- Lo que se libera solo, y por eso no se toca
-- --------------------------------------------
-- Nada hay que devolver a mano. Los dos cupos se CUENTAN, no se reservan:
--
--   · el taller · `fn_exigir_lugar_en_taller` y `v_talleres` hacen
--     `ocupados_previos + count(p.id)` sobre `participantes`;
--   · el aforo del día · la guardia del alta hace `count(p.id)` sobre
--     `participantes` con su `pg_advisory_xact_lock`;
--   · y el padrón · `ya_registrado` es un `exists (select 1 from participantes
--     where matricula = ...)` vivo, no una columna.
--
-- Al desaparecer la fila, los dos lugares vuelven y esa persona puede volver a
-- pre-registrarse. Ninguna de las tres consultas se modifica aquí.
--
-- Solo administración, y no es el mismo par que el taller
-- --------------------------------------------------------
-- `fn_asignar_taller` admite `admin` y `soporte`. Esta no: `admin` y nada más.
-- Mover a alguien de taller se deshace moviéndolo otra vez; hacer desaparecer su
-- folio, no. La puerta más estrecha que resuelve el caso es la correcta.
--
-- Da igual para la pantalla —`/admin/preinscritos` ya es de `administrador`
-- solo, porque `ROLES_POR_AREA.admin` no incluye a soporte— pero la guardia que
-- manda es esta, no aquella: la pantalla se puede saltar, la función no.
--
-- Lo que esto NO resuelve, y hay que decirlo
-- -------------------------------------------
-- Al que ya depositó no lo toca. Ese caso sigue sin tener respuesta dentro del
-- sistema, y es el más probable: alguien paga y luego no puede ir. Hacerlo
-- pedía un estado de baja en `participantes` y revisar TODO lo que cuenta gente
-- —los dos cupos, el padrón, la vista de pagos, los elegibles, el torniquete y
-- los reportes—, y olvidar uno deja un lugar fantasma o a alguien dado de baja
-- entrando por la puerta. Se decidió dejarlo fuera de esta migración, a
-- conciencia, no por descuido.
-- =============================================================================

create or replace function fn_eliminar_preregistro(p_folio text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_folio text := upper(trim(coalesce(p_folio, '')));
  v_id uuid;
  v_nombre text;
  v_matricula text;
  v_perfil perfil_participante;
  v_dia smallint;
  v_taller uuid;
  v_taller_clave text;
  v_pagos integer;
  v_asistencias integer;
  v_evidencias integer;
  v_casos integer;
begin
  -- Administración y nadie más. Ver la cabecera: esto no se deshace.
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede eliminar un pre-registro'
      using errcode = 'insufficient_privilege';
  end if;

  if v_folio = '' then
    raise exception 'Falta el folio' using errcode = 'check_violation';
  end if;

  select p.id, p.nombre, p.matricula, p.perfil, p.dia, p.taller_id
    into v_id, v_nombre, v_matricula, v_perfil, v_dia, v_taller
    from participantes p
   where p.folio = v_folio;

  if v_id is null then
    raise exception 'No hay ningún participante con el folio %', v_folio
      using errcode = 'no_data_found';
  end if;

  /*
   * Las tres huellas, cada una con su mensaje y en este orden.
   *
   * El orden es el de gravedad, y importa porque solo se enseña la primera:
   * quien tiene depósito Y asistencia necesita oír lo del depósito, que es lo
   * que decide a dónde va esa persona. Decirle «entró por la puerta» le mandaría
   * a discutir con el capturista un asunto de dinero.
   *
   * Se cuentan en vez de comprobar existencia porque el número es el dato que
   * hace creíble el rechazo: «tiene 1 depósito» se verifica en la ficha, «tiene
   * depósitos» se discute.
   */
  select count(*) into v_pagos from pagos where participante_id = v_id;
  if v_pagos > 0 then
    raise exception
      'El folio % tiene % depósito(s) registrado(s), así que no se elimina desde '
      'aquí: hay dinero suyo en la cuenta y quién decide sobre él es Servicios '
      'Financieros.', v_folio, v_pagos
      using errcode = 'check_violation';
  end if;

  select count(*) into v_asistencias from asistencias where participante_id = v_id;
  if v_asistencias > 0 then
    raise exception
      'El folio % tiene % registro(s) de entrada o salida: esa persona estuvo en '
      'el evento. Quién asistió no se reescribe.', v_folio, v_asistencias
      using errcode = 'check_violation';
  end if;

  select count(*) into v_evidencias from evidencias where participante_id = v_id;
  if v_evidencias > 0 then
    raise exception
      'El folio % tiene % evidencia(s) entregada(s). Eso es trabajo suyo ya '
      'recibido, y no se borra junto con el registro.', v_folio, v_evidencias
      using errcode = 'check_violation';
  end if;

  -- La clave del taller se lee ANTES de borrar: después no hay a quién
  -- preguntarle de dónde salió el lugar que acaba de quedar libre.
  select clave into v_taller_clave from talleres where id = v_taller;

  /*
   * Los casos de soporte, dentro de la misma transacción. Ver la cabecera: son
   * anotaciones sobre este registro, no huella de la persona, y van primero
   * porque su disparador toca al participante que todavía existe.
   */
  delete from casos_soporte where participante_id = v_id;
  get diagnostics v_casos = row_count;

  -- `avisos_participante` se va sola: su llave es `on delete cascade`.
  delete from participantes where id = v_id;

  insert into bitacora (usuario_id, accion, detalle)
  values (
    auth.uid(),
    'Eliminó un pre-registro',
    format('%s · %s · %s · día %s · %s%s',
           v_folio,
           v_nombre,
           coalesce(v_matricula, v_perfil::text),
           v_dia,
           coalesce('taller ' || v_taller_clave, 'sin taller'),
           case when v_casos > 0
                then format(' · con %s caso(s) de soporte', v_casos)
                else '' end)
  );

  return jsonb_build_object(
    'folio', v_folio,
    'nombre', v_nombre,
    'dia', v_dia,
    'taller', v_taller_clave,
    'casos', v_casos
  );
end;
$$;

comment on function fn_eliminar_preregistro is
  'Elimina un pre-registro que no dejó huella. SOLO administración. Lo rechaza '
  'cualquier depósito, entrada o evidencia, cada uno con su mensaje: esos tres '
  'son hechos que ocurrieron. Los casos de soporte y los avisos se van con la '
  'persona. El lugar del taller y el del aforo se liberan solos, porque se '
  'cuentan en vivo. No se deshace.';

revoke all on function fn_eliminar_preregistro(text) from public, anon;
grant execute on function fn_eliminar_preregistro(text) to authenticated;

-- ---------------------------------------------------------------------------
-- A cuánta gente alcanza esto hoy
--
-- Se dice al aplicar para no tener que adivinarlo después, y de paso comprueba
-- que las tres guardias miran donde creen que miran.
-- ---------------------------------------------------------------------------
do $fn$
declare
  v_total integer;
  v_borrables integer;
  v_con_pago integer;
  v_con_asistencia integer;
  v_con_evidencia integer;
begin
  select count(*) into v_total from participantes;

  select count(*) into v_con_pago
    from participantes p
   where exists (select 1 from pagos g where g.participante_id = p.id);

  select count(*) into v_con_asistencia
    from participantes p
   where exists (select 1 from asistencias a where a.participante_id = p.id);

  select count(*) into v_con_evidencia
    from participantes p
   where exists (select 1 from evidencias e where e.participante_id = p.id);

  select count(*) into v_borrables
    from participantes p
   where not exists (select 1 from pagos g where g.participante_id = p.id)
     and not exists (select 1 from asistencias a where a.participante_id = p.id)
     and not exists (select 1 from evidencias e where e.participante_id = p.id);

  raise notice 'Participantes: %.', v_total;
  raise notice '  Sin huella, el panel ya puede eliminarlos: %.', v_borrables;
  raise notice '  Con depósito registrado: % (van a Servicios Financieros).', v_con_pago;
  raise notice '  Con entrada o salida por la puerta: %.', v_con_asistencia;
  raise notice '  Con evidencia entregada: %.', v_con_evidencia;
  raise notice 'Los tres últimos se solapan entre sí; no se suman.';
end $fn$;
