-- =============================================================================
-- 57 · Guardar un taller es una sola cosa
--
-- Tres defectos que comparten causa: el guardado eran tres peticiones sueltas
-- ---------------------------------------------------------------------------
-- `guardarTallerRemoto` hacía `upsert` sobre `talleres`, después `delete` de
-- todos sus `taller_dias`, y después `insert` de los nuevos. Tres viajes HTTP
-- sin transacción que los una.
--
-- **1. Editar un taller con inscritos fallaba a medias.** `participantes` tiene
-- la llave foránea compuesta `(taller_id, dia) -> taller_dias` con
-- `on delete restrict`, así que borrar los días de un taller que tiene gente
-- inscrita lo rechaza la base. Pero el `upsert` de arriba YA se había aplicado.
--
-- El admin solo quería subir el cupo de T02 de 30 a 60: leía «Taller T02
-- guardado» y medio segundo después «No se pudo guardar el taller T02». Lo
-- volvía a intentar tres veces con el mismo resultado. Lo que había en la base
-- era el cupo nuevo y los días viejos, y nadie se lo decía.
--
-- **2. Liberar las inscripciones que quedan fuera de día no escribía nada.**
-- La casilla «liberar al guardar» existía y lo que hacía era `setState`: el
-- `tallerId: undefined` y el aviso vivían en memoria y morían al recargar. La
-- tabla `avisos_participante` no recibía un solo `insert` desde ninguna parte
-- de `src/`. Los dieciocho inscritos al día que se quitaba seguían apuntando
-- ahí y ninguno se enteraba.
--
-- **3. Un taller nuevo podía SOBRESCRIBIR a uno existente.** La pantalla
-- proponía la clave contando filas —`T` + (cuántas hay + 1)— en vez de mirar
-- cuáles están tomadas. Con un hueco en la numeración, y en este repositorio ya
-- lo hubo (la migración 45 documenta que T01 a T04 se borraron desde este mismo
-- panel), la clave propuesta choca con una existente y `onConflict: "clave"`
-- convierte un alta en una sobreescritura silenciosa: el T12 real —con sus
-- setenta inscritos— se quedaba con el nombre, el ponente y el precio del
-- taller nuevo.
--
-- Qué hace esta función
-- ---------------------
-- Lo mismo, pero como UNA operación: o pasa entera o no pasa nada. Y en el
-- orden correcto, que es lo que hacía imposible el arreglo desde el cliente:
-- primero libera a quien va a quedar fuera de día, y solo entonces cambia los
-- días. Al revés, la llave foránea lo impide — y con razón.
--
-- Los días se calculan por DIFERENCIA en vez de borrarlos todos y reponerlos:
-- borrar un día que se conserva y volver a insertarlo idéntico es lo que
-- tropezaba con el `restrict` sin necesidad ninguna.
--
-- `p_crear` separa el alta de la edición. Un alta es un `insert`, así que una
-- clave repetida rebota con un error legible en vez de machacar lo que había.
--
-- NO es `security definer`, a propósito: corre con los permisos de quien llama
-- y las políticas de `talleres`, `taller_dias` y `participantes` la gobiernan.
-- Es el patrón de la migración 47, y el que la 55 tuvo que ir a reparar en las
-- que no lo siguieron.
-- =============================================================================

create or replace function fn_guardar_taller(
  p_clave text,
  p_nombre text,
  p_descripcion text,
  p_ponente text,
  p_costo numeric,
  p_cupo_total integer,
  p_horario text,
  p_lugar text,
  p_activo boolean,
  p_dias smallint[],
  p_crear boolean,
  p_liberar boolean
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_id uuid;
  v_liberados integer := 0;
begin
  -- El mensaje legible. Sin esto, quien no sea administración recibiría el
  -- «new row violates row-level security policy» de la política, que es cierto
  -- y no le dice a nadie qué hacer.
  if not tiene_rol(array['admin']::rol_interno[]) then
    raise exception 'Solo administración puede editar los talleres'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(array_length(p_dias, 1), 0) = 0 then
    raise exception 'Un taller sin días no se imparte ningún día: nadie podría inscribirse'
      using errcode = 'check_violation';
  end if;

  if p_crear then
    -- `insert` y no `upsert`: si la clave ya existe tiene que rebotar, no
    -- machacar el taller que la tenía.
    insert into talleres (clave, nombre, descripcion, ponente, costo, cupo_total,
                          horario, lugar, activo)
    values (p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
            p_horario, p_lugar, p_activo)
    returning id into v_id;
  else
    update talleres
       set nombre = p_nombre,
           descripcion = p_descripcion,
           ponente = p_ponente,
           costo = p_costo,
           cupo_total = p_cupo_total,
           horario = p_horario,
           lugar = p_lugar,
           activo = p_activo
     where clave = p_clave
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe ningún taller con la clave %', p_clave
        using errcode = 'no_data_found';
    end if;
  end if;

  /*
   * Liberar va ANTES de tocar los días, y ese orden es todo el asunto.
   *
   * Mientras alguien siga inscrito en `(taller, día)`, la llave foránea impide
   * borrar esa fila de `taller_dias`. Desde el cliente no había forma de
   * ordenarlo: eran dos peticiones y la primera ya había fallado.
   */
  if p_liberar then
    with afectados as (
      select id from participantes
       where taller_id = v_id and not (dia = any (p_dias))
    ),
    liberados as (
      update participantes p
         set taller_id = null, monto_esperado_taller = null
        from afectados a
       where p.id = a.id
      returning p.id
    ),
    avisados as (
      -- El aviso le espera en su portal: enterarse al presentarse sería peor.
      insert into avisos_participante (participante_id, texto)
      select l.id,
             format(
               'El taller «%s» ya no se imparte tu día, así que tu inscripción se '
               'liberó. Puedes elegir otro; si ya lo habías pagado, acude a '
               'Servicios Financieros.',
               p_clave
             )
        from liberados l
      returning 1
    )
    select count(*) into v_liberados from avisados;
  end if;

  -- Por diferencia, no borrando y reponiendo: un día que se conserva no tiene
  -- por qué pasar por el `restrict` de la llave foránea.
  delete from taller_dias
   where taller_id = v_id and not (dia = any (p_dias));

  insert into taller_dias (taller_id, dia)
  select v_id, d from unnest(p_dias) as d
  on conflict (taller_id, dia) do nothing;

  return v_liberados;
end;
$$;

revoke all on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, boolean, smallint[], boolean, boolean
) from public, anon, authenticated;
grant execute on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, boolean, smallint[], boolean, boolean
) to authenticated;

comment on function fn_guardar_taller is
  'Guarda un taller y sus días como UNA operación, liberando primero a quien '
  'quedaría fuera de día. Devuelve cuántas inscripciones liberó.';
