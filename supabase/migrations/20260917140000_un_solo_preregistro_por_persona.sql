-- =============================================================================
-- El docente y el externo se podían pre-registrar dos veces
--
-- Qué protege la base hoy
-- -----------------------
-- En `participantes` solo hay dos cosas únicas: el `folio`, que lo genera una
-- secuencia, y la `matricula`. Y la matrícula es NULA para el docente y el
-- externo, porque no tienen. O sea que para dos de los tres perfiles **no hay
-- ninguna restricción** que impida dos filas de la misma persona.
--
-- La 30 (`20260911100000_preregistro_reentrante`) ya atacó esto, y arregló el
-- caso secuencial: antes de insertar, las altas buscan si esa persona ya se
-- pre-registró y, si la encuentran, devuelven SU folio. Volver atrás para
-- cambiar de taller dejó de duplicar.
--
-- Lo que quedó abierto: la carrera
-- --------------------------------
-- Buscar-y-después-insertar sin nada que serialice las dos cosas es una carrera
-- de libro. Dos peticiones a la vez —dos pestañas, o el doble clic de quien ve
-- que no pasa nada y vuelve a pulsar— hacen la búsqueda las dos ANTES de que
-- cualquiera inserte. Las dos concluyen «esta persona no está» y las dos
-- insertan.
--
-- Para el alumno el índice único de `matricula` detiene a la segunda, aunque de
-- mala manera: revienta con una violación de unicidad en vez de comportarse como
-- lo reentrante que ya es. Para el docente y el externo no la detiene nada, y el
-- resultado es dos folios de la misma persona, cada uno con su cuota esperada,
-- contando doble en los cupos y en los reportes. Nadie ve un error: se ven dos
-- inscripciones legítimas.
--
-- La corrección, en dos partes
-- ----------------------------
-- 1. Un índice único parcial: `(perfil, correo)` donde `matricula is null`. Es
--    el par con el que la propia función reconoce a la misma persona, así que
--    la regla que ya estaba en el código pasa a estar también en el esquema,
--    que es donde una carrera no la puede saltar.
--
-- 2. Las dos altas atrapan la violación de unicidad y, en vez de reventar,
--    releen la fila que ganó la carrera y devuelven SU folio. Así dejan de ser
--    «reentrantes si nadie corre a la vez» y pasan a serlo siempre: dos
--    peticiones simultáneas devuelven el mismo folio, que es lo que el
--    pre-registro promete.
--
-- Las firmas NO cambian. `create or replace` conserva las concesiones; se
-- vuelven a cerrar igual recorriendo `pg_proc`, que es lo que manda la trampa
-- de MIGRACIONES.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Primero: ¿ya hay duplicados de antes?
--
-- El índice no se puede crear encima de ellos, y **no se deduplican aquí a
-- propósito**. Elegir qué folio sobrevive no es una decisión de una migración:
-- uno de los dos puede tener pagos, evidencias o asistencias colgando, y el
-- otro es el que esa persona llegó a ver y apuntó. Eso lo resuelve alguien
-- mirando, no un `delete` a ciegas.
--
-- Así que esto se detiene y los enseña.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select perfil, correo, count(*) as veces, string_agg(folio, ', ' order by creado_en) as folios
      from participantes
     where matricula is null
     group by perfil, correo
    having count(*) > 1
  loop
    v_n := v_n + 1;
    raise notice 'Duplicado: % con % (%) -> %', r.correo, r.perfil, r.veces, r.folios;
  end loop;

  if v_n > 0 then
    raise exception
      'Hay % persona(s) con más de un pre-registro. Resuélvelas antes de correr esta '
      'migración: decide qué folio se queda (el que tenga pagos, o el primero) y borra '
      'el otro. Los de arriba están en los avisos de esta misma ejecución.', v_n;
  end if;

  raise notice 'Sin duplicados previos: se puede poner el índice.';
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- El índice.
--
-- Parcial, `where matricula is null`, para no tocar al alumno: a ese ya lo
-- protege la unicidad de su matrícula, y extender la regla a su correo sería
-- otra decisión —la de si dos alumnos pueden compartir cuenta— que esta
-- migración no viene a tomar.
--
-- `correo` se guarda ya en minúsculas (las dos altas hacen `lower(trim(...))`),
-- así que el índice va sobre la columna y no sobre una expresión.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_participante_sin_matricula
  on participantes (perfil, correo)
  where matricula is null;

comment on index uq_participante_sin_matricula is
  'El docente y el externo no tienen matrícula que los haga únicos, y el par '
  '(perfil, correo) es con el que las altas los reconocen. Sin esto, dos '
  'peticiones simultáneas creaban dos folios de la misma persona.';

-- ---------------------------------------------------------------------------
-- El alumno
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_alumno(
  p_matricula text,
  p_correo text,
  p_celular text,
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_a record;
  v_cfg record;
  v_dia smallint;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_dominio text;
  v_ya record;
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  select * into v_a from padron_alumnos where matricula = trim(p_matricula);
  if v_a is null then
    raise exception 'Esa matrícula no está en nuestros registros'
      using errcode = 'no_data_found';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    -- `coalesce` y no `now()`: vale la PRIMERA aceptación. Volver atrás para
    -- cambiar de taller no vuelve a otorgar nada.
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- Sin dominio configurado —NULL o en blanco— se acepta cualquier correo,
  -- porque hay universidades que no dan cuenta institucional a todos.
  v_dominio := nullif(trim(coalesce(v_cfg.dominio_institucional, '')), '');
  if v_dominio is not null
     and lower(trim(p_correo)) not like '%@' || lower(v_dominio) then
    raise exception 'Usa tu correo institucional, el que termina en @%', v_dominio
      using errcode = 'check_violation';
  end if;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
  end if;

  if v_a.dia is not null then
    v_dia := v_a.dia;
    if p_taller is not null
       and not exists (select 1 from taller_dias where taller_id = p_taller and dia = v_dia) then
      raise exception 'Ese taller no se imparte el día %, que es el que te toca', v_dia
        using errcode = 'check_violation';
    end if;
  elsif p_taller is not null then
    -- Sin día repartido y con taller elegido: el día más vacío DE ESE TALLER.
    select td.dia into v_dia
      from taller_dias td
      left join padron_alumnos a on a.dia = td.dia
     where td.taller_id = p_taller
     group by td.dia
     order by count(a.matricula), td.dia
     limit 1;
    if v_dia is null then
      raise exception 'Ese taller no tiene días asignados' using errcode = 'no_data_found';
    end if;
    update padron_alumnos set dia = v_dia where matricula = v_a.matricula;
  else
    v_dia := fn_dia_de(v_a.matricula);
  end if;

  /*
   * El alta, y qué hacer si otra petición se nos adelantó entre la búsqueda de
   * arriba y este insert.
   *
   * La ventana es real: dos pestañas, o el doble clic de quien no ve respuesta.
   * Antes la segunda petición reventaba con la violación de unicidad de
   * `matricula` y la persona veía «Ese registro ya existe» al final de todo su
   * recorrido, sin folio. Ahora se relee la fila que ganó y se devuelve la
   * misma respuesta que habría dado la búsqueda: el alta es idempotente de
   * verdad, no solo cuando nadie corre a la vez.
   */
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en
    )
    values (
      'alumno', v_a.matricula, v_a.nombre, lower(trim(p_correo)), p_celular,
      'Universidad Autónoma',
      v_a.nivel_id, v_a.programa_id, v_a.avance, v_a.grupo, v_a.plantel_id,
      v_dia, p_taller, v_cfg.cuota_evento, v_costo,
      now()
    )
    returning id, folio into v_id, v_folio;
  exception
    when unique_violation then
      select id, folio, dia into v_ya from participantes where matricula = v_a.matricula;
      -- Si no aparece, la unicidad que se violó era otra y hay que dejarla subir:
      -- tragarse un error que no se entiende es peor que enseñarlo.
      if v_ya.id is null then
        raise;
      end if;
      perform fn_cambiar_taller(v_ya.id, p_taller);
      update participantes
         set acepto_aviso_en = coalesce(acepto_aviso_en, now())
       where id = v_ya.id;
      return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Pre-registró a un alumno',
          format('%s · %s · día %s', v_folio, v_a.matricula, v_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', v_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- El docente y el externo
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_acepto_aviso boolean,
  p_taller uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
  v_correo text;
  v_ya record;
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;
  v_correo := lower(trim(p_correo));

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_institucion), '') = '' then
    raise exception 'Falta la institución' using errcode = 'check_violation';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  -- `order by creado_en` importa: un fallo anterior ya pudo dejar duplicados, y
  -- ante varios se elige el PRIMERO, que es el folio que esa persona llegó a ver.
  select id, folio, dia into v_ya
    from participantes
   where correo = v_correo and perfil = v_perfil
   order by creado_en
   limit 1;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
    if not exists (select 1 from taller_dias where taller_id = p_taller and dia = p_dia) then
      raise exception 'Ese taller no se imparte el día %', p_dia
        using errcode = 'check_violation';
    end if;
  end if;

  -- Mismo cierre de la carrera que en el alta de alumno, y aquí es donde más
  -- hacía falta: hasta esta migración no había ningún índice que la detuviera,
  -- así que la segunda petición no fallaba, creaba otro folio.
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en
    )
    values (
      v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
      trim(p_institucion),
      null, null, null, null, null,
      p_dia, p_taller, v_cfg.cuota_evento, v_costo,
      now()
    )
    returning id, folio into v_id, v_folio;
  exception
    when unique_violation then
      select id, folio, dia into v_ya
        from participantes
       where correo = v_correo and perfil = v_perfil
       order by creado_en
       limit 1;
      if v_ya.id is null then
        raise;
      end if;
      perform fn_cambiar_taller(v_ya.id, p_taller);
      update participantes
         set acepto_aviso_en = coalesce(acepto_aviso_en, now())
       where id = v_ya.id;
      return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona)',
                 v_folio, upper(trim(p_nombre)), p_dia));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Cerrarlas, por si acaso.
--
-- La firma no cambió, así que `create or replace` conservó las concesiones y
-- esto debería ser un no-op. Se hace igual, y recorriendo `pg_proc` en vez de
-- escribir las firmas a mano, por lo que ya costó una vez: la 31 dejó dos
-- funciones de la puerta ejecutables por el rol anónimo.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
  end loop;
end;
$bloque$;

-- Una de cada, como dejó la 38. Si salen más, alguna sobrecarga sobrevivió.
do $bloque$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo');
  if v_n <> 2 then
    raise exception 'Se esperaban 2 funciones de alta y hay %.', v_n;
  end if;
end;
$bloque$;
