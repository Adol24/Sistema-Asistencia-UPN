-- =============================================================================
-- En el taller la pregunta no es «¿te toca hoy?», es «¿tu taller es hoy?».
--
-- T03, T05 y T06 son talleres de dos tardes: las MISMAS 30 personas asisten el
-- día 1 y el día 2. A las conferencias van una sola vez, la de su día asignado,
-- y el otro día regresan a las 15:00 solo al taller, que además es en otro
-- edificio —las instalaciones de la UPN U-212—, así que ni siquiera cruzan la
-- puerta de las conferencias.
--
-- Pero el escaneo de taller compartía la comprobación del día con la puerta:
-- `v_p.dia <> p_dia` y a la mesa de incidencias. Para esas 90 personas eso
-- significaba una pantalla roja el segundo día, por presentarse exactamente
-- donde debían estar.
--
-- La comprobación se separa por modo, porque son dos preguntas distintas:
--
--   PUERTA  · «¿te toca hoy?»       → responde el día asignado del participante.
--                                     A las conferencias se va una sola vez.
--   TALLER  · «¿tu taller es hoy?»  → responde `taller_dias`. El día asignado no
--                                     tiene nada que decir aquí.
--
-- De paso, el modo taller gana dos comprobaciones que le faltaban y que la del
-- día venía tapando por accidente: que la persona esté inscrita en algún taller,
-- y que el taller en el que está se imparta hoy. Antes, a alguien con un taller
-- del día 1 que llegara el día 2 lo rechazaba la regla del día asignado; ahora
-- lo rechaza la razón verdadera, y el mensaje se lo dice: «su taller se imparte
-- el día 1».
--
-- La firma NO cambia —los mismos tres argumentos y la misma tabla de salida— así
-- que `create or replace` conserva las concesiones. Aun así se vuelven a cerrar
-- al final recorriendo `pg_proc`, que es lo que MIGRACIONES.md manda hacer desde
-- que la 31 dejó dos funciones abiertas al rol anónimo.
-- =============================================================================

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
  v_minutos numeric;
  v_dias_taller text;
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

  -- --- ¿Le toca hoy? Depende de qué se esté preguntando --------------------
  if p_modo = 'taller' then
    if v_p.taller_id is null then
      return query select 'rojo'::semaforo, 'SIN TALLER',
        'No está inscrito en ningún taller. Pasar a mesa de incidencias.',
        v_p.id, false, 'taller'::tipo_asistencia;
      return;
    end if;

    if not exists (
      select 1 from taller_dias td
       where td.taller_id = v_p.taller_id and td.dia = p_dia
    ) then
      select string_agg(td.dia::text, ' y ' order by td.dia)
        into v_dias_taller
        from taller_dias td
       where td.taller_id = v_p.taller_id;

      return query select 'rojo'::semaforo, 'SU TALLER NO ES HOY',
        format('Su taller se imparte el día %s. Pasar a mesa de incidencias.',
               coalesce(v_dias_taller, '(sin días configurados)')),
        v_p.id, true, 'taller'::tipo_asistencia;
      return;
    end if;

  elsif v_p.dia <> p_dia then
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

comment on function fn_evaluar_escaneo(text, smallint, text) is
  'Evalúa un escaneo. En la puerta el día lo decide el asignado al participante; en el taller lo deciden los días del taller, porque un taller de dos tardes lo cursa el mismo grupo ambos días.';

-- ---------------------------------------------------------------------------
-- Cerrarla al público, por si acaso.
--
-- La firma no cambió, así que `create or replace` conservó las concesiones y
-- esto debería ser un no-op. Se hace igual, y recorriendo `pg_proc` en vez de
-- escribir la firma a mano, porque ya se vio lo que cuesta darlo por hecho: la
-- 31 dejó dos funciones de la puerta ejecutables por el rol anónimo.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_evaluar_escaneo'
  loop
    execute format('revoke all on function %s from public, anon', r.firma);
    execute format('grant execute on function %s to authenticated', r.firma);
    raise notice 'Cerrada al público y concedida al personal: %', r.firma;
  end loop;
end;
$$;
