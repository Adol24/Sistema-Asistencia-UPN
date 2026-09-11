-- =============================================================================
-- La puerta pasa a ser un torniquete
--
-- Qué pasaba
-- ----------
-- El modelo de asistencia asumía un solo par por jornada: una entrada por la
-- mañana y una salida al terminar. `uq_asistencia_por_dia` lo imponía con un
-- índice único sobre (participante_id, dia, tipo), así que el segundo paso por
-- la puerta lo rechazaba PostgreSQL.
--
-- Ese supuesto no aguanta la operación real. El evento recibe 700 personas por
-- día, tiene un receso de quince minutos y la gente sale y vuelve. Y sobre todo:
-- hay quien sale a media mañana y ya no regresa. Con el modelo viejo eso era
-- invisible —nadie registraba esa salida— y el cierre automático terminaba de
-- taparlo poniéndole una salida al final del horario, idéntica a la de quien
-- aguantó la jornada completa.
--
-- Qué cambia
-- ----------
-- 1. Se permite más de una entrada y más de una salida por persona y día. En su
--    lugar, la propia base decide la dirección de cada paso a partir del último
--    movimiento: si estaba dentro, sale; si estaba fuera, entra. El capturista
--    no elige, porque con ocho puntos de captura nadie puede saber de qué lado
--    del recinto está cada quien, y equivocarse invierte el registro.
--
-- 2. Se protege el doble escaneo con una ventana corta. Aquí no basta con no
--    duplicar: registrar dos veces invierte el estado y deja fuera a quien
--    acaba de entrar. Dos minutos es más de lo que tarda un doble escaneo y
--    menos de lo que tarda la ida más corta al baño.
--
-- 3. El cierre automático solo cierra a quien sigue DENTRO. Quien salió a las
--    once y no volvió ya tiene su salida; ponerle otra al final sería borrar
--    exactamente el dato que se quería conservar.
--
-- Lo que NO cambia
-- ----------------
-- La constancia. Sigue dependiendo del pago, de la entrada y —en alumnos— de
-- las evidencias, según decidió la organización. Registrar no es condicionar:
-- esto hace que el sistema SEPA quién se fue a media jornada, sin que eso le
-- quite el documento a nadie. Si algún día se quiere condicionar, el dato ya
-- estará; al revés no se puede.
-- =============================================================================

-- 1 · El índice único que impedía ir y volver -------------------------------
--
-- Se conserva el de taller: ahí un solo pase de lista por persona sigue siendo
-- lo correcto, porque no hay idas y vueltas que registrar.
drop index if exists uq_asistencia_por_dia;

-- Sin unicidad, lo que importa para leer el estado es el orden. Este índice es
-- el que sostiene la pregunta que ahora se hace en cada escaneo y en cada
-- cierre: ¿cuál fue el último movimiento de esta persona hoy?
create index if not exists ix_asistencia_movimientos
  on asistencias (participante_id, dia, registrada_en desc)
  where tipo in ('entrada', 'salida') and anulada_en is null;

comment on index ix_asistencia_movimientos is
  'Sostiene la lectura del último movimiento, que es lo que decide si el próximo paso por la puerta es entrada o salida.';

-- 2 · ¿Está dentro? ----------------------------------------------------------
--
-- Una sola definición para toda la base. Estaba repetida como «tiene entrada y
-- no tiene salida», que con idas y vueltas deja de ser cierto: lo que manda es
-- el último movimiento, no la existencia de uno de cada.
create or replace function fn_esta_dentro(p_participante uuid, p_dia smallint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.tipo = 'entrada'
        from asistencias a
       where a.participante_id = p_participante
         and a.dia = p_dia
         and a.tipo in ('entrada', 'salida')
         and a.anulada_en is null
       order by a.registrada_en desc
       limit 1
    ),
    false
  );
$$;

comment on function fn_esta_dentro(uuid, smallint) is
  'Manda el último movimiento: quien nunca pasó por la puerta está fuera, y quien salió y no volvió también.';

-- 3 · La evaluación del escaneo ----------------------------------------------
--
-- Cambia la firma: ya no recibe el tipo, recibe el MODO del punto de captura
-- ('puerta' o 'taller') y devuelve el tipo que decidió. El cliente dejó de ser
-- quien sabe la dirección, porque su copia local puede estar atrasada respecto
-- de los otros siete puntos, y esta consulta existe precisamente para cuando la
-- escucha en vivo no está disponible.
drop function if exists fn_evaluar_escaneo(text, smallint, tipo_asistencia);

create or replace function fn_evaluar_escaneo(
  p_entrada text,
  p_dia smallint,
  p_modo text
)
returns table (
  color semaforo,
  titulo text,
  detalle text,
  participante_id uuid,
  autorizable boolean,
  tipo tipo_asistencia
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p record;
  v_estado estado_pago;
  v_ultimo record;
  v_dentro boolean;
  v_minutos numeric;
begin
  select * into v_p
    from participantes
   where folio = upper(trim(p_entrada)) or matricula = trim(p_entrada);

  if v_p is null then
    return query select 'rojo'::semaforo, 'NO ENCONTRADO',
      'Ese folio o matrícula no existe. Pasar a mesa de incidencias.',
      null::uuid, false, 'entrada'::tipo_asistencia;
    return;
  end if;

  -- --- Puerta: la dirección la decide la base ------------------------------
  if p_modo = 'puerta' then
    select a.tipo, a.registrada_en into v_ultimo
      from asistencias a
     where a.participante_id = v_p.id
       and a.dia = p_dia
       and a.tipo in ('entrada', 'salida')
       and a.anulada_en is null
     order by a.registrada_en desc
     limit 1;

    if v_ultimo is not null then
      v_minutos := extract(epoch from (now() - v_ultimo.registrada_en)) / 60;

      -- Doble escaneo. Registrarlo no dejaría un duplicado inocuo: invertiría
      -- el estado de esa persona.
      if v_minutos < 2 then
        return query select 'amarillo'::semaforo, 'YA ESCANEADO',
          format('Su %s se registró hace menos de dos minutos.', v_ultimo.tipo),
          v_p.id, false, v_ultimo.tipo;
        return;
      end if;

      -- Estaba dentro, así que sale. A nadie se le niega salir, y a quien ya
      -- fue admitido no se le vuelve a auditar el pago para dejarlo volver del
      -- baño: los controles son de admisión, no de cada paso.
      if v_ultimo.tipo = 'entrada' then
        return query select 'verde'::semaforo, 'SALIDA REGISTRADA',
          v_p.nombre, v_p.id, false, 'salida'::tipo_asistencia;
        return;
      end if;

      return query select 'verde'::semaforo, 'REGRESÓ',
        v_p.nombre, v_p.id, false, 'entrada'::tipo_asistencia;
      return;
    end if;
  end if;

  -- --- Primera vez del día, o pase de lista de taller ----------------------
  if v_p.dia <> p_dia then
    return query select 'rojo'::semaforo, 'DÍA EQUIVOCADO',
      format('Le toca el día %s. Pasar a mesa de incidencias.', v_p.dia),
      v_p.id, true, 'entrada'::tipo_asistencia;
    return;
  end if;

  select estado into v_estado
    from v_estado_pago
   where participante_id = v_p.id and concepto = 'evento';

  if v_estado <> 'pagado' and v_estado <> 'discrepancia' then
    return query select 'rojo'::semaforo, 'SIN PAGO REGISTRADO',
      'Pasar a mesa de incidencias.', v_p.id, true, 'entrada'::tipo_asistencia;
    return;
  end if;

  if p_modo = 'taller' then
    -- Un solo pase de lista por taller: aquí sí no hay idas y vueltas.
    if exists (
      select 1 from asistencias a
       where a.participante_id = v_p.id and a.dia = p_dia
         and a.tipo = 'taller' and a.anulada_en is null
    ) then
      return query select 'amarillo'::semaforo, 'YA REGISTRADO',
        'Su taller de hoy ya está registrado. No se duplica.',
        v_p.id, false, 'taller'::tipo_asistencia;
      return;
    end if;
  end if;

  if v_estado = 'discrepancia' then
    return query select 'amarillo'::semaforo, 'PASA CON DISCREPANCIA',
      'Su pago no cuadra. Puede entrar; avísale que pase a ventanilla.',
      v_p.id, false,
      (case when p_modo = 'taller' then 'taller' else 'entrada' end)::tipo_asistencia;
    return;
  end if;

  return query select 'verde'::semaforo,
    case when p_modo = 'taller' then 'TALLER REGISTRADA' else 'ENTRADA REGISTRADA' end,
    v_p.nombre, v_p.id, false,
    (case when p_modo = 'taller' then 'taller' else 'entrada' end)::tipo_asistencia;
end;
$$;

-- 4 · El cierre del día ------------------------------------------------------
--
-- Solo a quien sigue dentro. Quien salió a media jornada y no volvió conserva su
-- salida real, que es el dato que antes se perdía.
create or replace function fn_cierre_automatico(p_dia smallint, p_hora timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  with dentro as (
    select p.id
      from participantes p
     where p.dia = p_dia
       and fn_esta_dentro(p.id, p_dia)
  )
  insert into asistencias (participante_id, dia, tipo, registrada_en, punto, capturista_id)
  select id, p_dia, 'salida', p_hora, 'Cierre automático', null
    from dentro;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

comment on function fn_cierre_automatico(smallint, timestamptz) is
  'Cierra el día de quien sigue dentro. No toca a quien ya había salido: esa salida es información, no un trámite pendiente.';

-- 5 · Permisos ---------------------------------------------------------------
--
-- La firma nueva no hereda los grants de la vieja, y ninguna de estas funciones
-- debe quedar abierta al rol anónimo: son de personal interno.
revoke all on function fn_evaluar_escaneo(text, smallint, text) from public;
revoke all on function fn_esta_dentro(uuid, smallint) from public;
grant execute on function fn_evaluar_escaneo(text, smallint, text) to authenticated;
grant execute on function fn_esta_dentro(uuid, smallint) to authenticated;
