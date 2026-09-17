-- =============================================================================
-- Un alumno no se inscribe como externo
--
-- El hueco
-- --------
-- La 39 cerró el pre-registro doble por los dos lados que tenía: la matrícula
-- única protege al alumno, y el índice parcial `(perfil, correo)` protege al
-- docente y al externo.
--
-- Quedaba un tercer camino que ningún índice ve: el mismo alumno volviendo por
-- `/registro` como docente o externo. Ahí su matrícula viaja NULA, así que no
-- choca con su propia fila —que sí la tiene— ni con el índice parcial, porque
-- ese compara `(perfil, correo)` y el perfil es otro. Salen dos folios de la
-- misma persona, cada uno con su cuota esperada.
--
-- Dos comprobaciones, y una de las dos hoy no hace nada
-- ----------------------------------------------------
-- 1. **Si ese correo ya está registrado como alumno, se rechaza.** Es exacta y
--    no tiene falsos positivos: esa fila la creó esa persona.
--
-- 2. **Si ese correo es del dominio de alumnos, se rechaza.** Esta es la que
--    caza al alumno que NO se ha pre-registrado todavía y entra directo por
--    `/registro`, que la primera no puede ver: el padrón guarda matrícula y
--    nombre, no correo, así que sin una fila en `participantes` no hay nada con
--    lo que comparar.
--
--    Y hoy está dormida, porque `configuracion_evento.dominio_institucional`
--    está en NULL en el proyecto real. Llenarlo desde `/admin/configuracion` es
--    lo que la enciende, y es lo único que cierra el hueco por completo.
--
-- Lo que NO se hace, y por qué
-- ----------------------------
-- Comparar el nombre contra el padrón cazaría más casos, y se descarta. El
-- padrón guarda el nombre completo y `/registro` también lo pide completo, así
-- que la comparación sería viable; el problema es el precio del error. Dos
-- homónimos de la misma universidad existen, y a un externo real rechazado por
-- llamarse igual que un alumno no le queda salida: no tiene matrícula con la
-- que entrar por el otro lado. Preferimos un duplicado detectable a alguien
-- legítimo fuera del evento.
--
-- La firma no cambia.
-- =============================================================================

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
  v_dominio text;
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

  /*
   * Las dos puertas que le cierran este formulario a un alumno.
   *
   * Van antes de la búsqueda reentrante a propósito: no se trata de si esta
   * persona ya pasó por aquí, sino de que no debería estar aquí. Y van antes de
   * cualquier escritura, así que un intento no deja rastro.
   */
  if exists (select 1 from participantes where correo = v_correo and perfil = 'alumno') then
    raise exception
      'Ese correo ya está registrado como alumno. Entra por «Soy alumno de la universidad» '
      'con tu matrícula; si crees que es un error, escríbenos.'
      using errcode = 'check_violation';
  end if;

  -- Escalar y no `v_cfg`, porque la configuración completa se lee más abajo y
  -- solo en el camino que de verdad inserta.
  v_dominio := nullif(
    trim(coalesce((select dominio_institucional from configuracion_evento where id = 1), '')),
    ''
  );
  if v_dominio is not null and v_correo like '%@' || lower(v_dominio) then
    raise exception
      'Ese correo es una cuenta de alumno. Entra por «Soy alumno de la universidad» con tu '
      'matrícula.'
      using errcode = 'check_violation';
  end if;

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

  -- El cierre de la carrera que puso la 39: si otra petición se adelantó entre
  -- la búsqueda de arriba y este insert, se relee su fila y se devuelve su folio.
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

-- La firma no cambió, así que `create or replace` conservó las concesiones. Se
-- vuelven a cerrar igual, recorriendo `pg_proc`.
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'fn_preregistrar_externo'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
  end loop;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- El aviso que importa más que la migración
-- ---------------------------------------------------------------------------
do $bloque$
declare
  v_dominio text;
begin
  select nullif(trim(coalesce(dominio_institucional, '')), '')
    into v_dominio
    from configuracion_evento
   where id = 1;

  if v_dominio is null then
    raise notice '%', concat(
      'AVISO: `dominio_institucional` está vacío, así que la segunda comprobación queda ',
      'dormida. Con ella apagada, un alumno que NO se haya pre-registrado todavía puede ',
      'entrar por /registro como externo y nada lo detecta. Llénalo en ',
      '/admin/configuracion (por ejemplo «alumnos.universidad.mx») para cerrarlo.');
  else
    raise notice 'Dominio de alumnos: %. La segunda comprobación queda activa.', v_dominio;
  end if;
end;
$bloque$;
