-- =============================================================================
-- El salón de cada taller
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924220000_el_salon_de_cada_taller`.
--
-- Qué faltaba
-- -----------
-- Los doce talleres tienen EL MISMO `lugar`: «Instalaciones UPN U-212,
-- Teziutlán». Eso dice a qué edificio ir, y nada más. Quien llega a la UPN a
-- las tres de la tarde, con los talleres repartidos en nueve espacios, lo que
-- necesita es el aula — y hasta hoy el aula no estaba en ninguna parte del
-- sistema: ni en el catálogo donde se elige, ni en el comprobante que se lleva
-- a la puerta, ni en el portal donde se consulta después.
--
-- La organización la entregó el 2026-09-24, en una tabla de doce renglones con
-- número, tallerista, taller y aula.
--
-- Por qué una columna y no pegado a `lugar`
-- -----------------------------------------
-- Son dos datos de vidas distintas. La sede es la misma para los doce y no va a
-- cambiar; el aula es de cada taller y es justo lo que se mueve a última hora.
-- Con columna propia, un cambio de aula se arregla desde /admin/talleres en
-- diez segundos. Metido dentro de `lugar` habría que reescribir el texto entero
-- —sede incluida— cada vez, y con el evento encima eso se hace mal.
--
-- El cruce, y la trampa que traía
-- -------------------------------
-- La tabla numera del 1 al 12, y ESE NÚMERO NO ES LA CLAVE. Sus dos últimos
-- renglones van al revés que las claves de la base: el renglón 11 es la
-- decolonialidad del grupo 2, que aquí es `T12`, y el renglón 12 es el taller de
-- la Dra. Huamán Castro, que aquí es `T11`. Cargar la lista por posición
-- cruzaría esos dos salones. El cruce se hizo por tallerista y por título.
--
-- Ningún espacio choca, y está comprobado día por día contra `taller_dias`:
--
--   Aula B1                → T01 (día 1) y T07 (día 2)
--   Aula B2                → T02 (día 1) y T11 (día 2)
--   Sala de usos múltiples → T04 (día 1) y T12 (día 2)
--   Aula B3 (T03), Aula A1 (T05) y Aula A2 (T06) se imparten los dos días, y
--   tienen su espacio en exclusiva.
--   Aula F1 (T08), Aula F2 (T09) y Centro de cómputo (T10) son solo del día 2.
--
-- Día 1: seis espacios ocupados. Día 2: nueve.
--
-- Por qué se guarda «Aula B1» y no «B1»
-- -------------------------------------
-- La columna del documento se titula «Aula» y sus valores son `B1`, `B2`, `A1`…
-- Un «B1» suelto en una tarjeta no se lee como un aula. Se guarda el rótulo
-- entero, y es también la razón de no ponerle «Aula» delante desde la pantalla:
-- tres de los espacios NO son aulas —la Sala de usos múltiples y el Centro de
-- cómputo— y anteponérselo diría algo falso. La pantalla imprime el valor tal
-- cual, sin adornarlo.
--
-- Lo que NO se resuelve aquí
-- --------------------------
-- La Dra. Huamán Castro pide «Laboratorio con equipos e internet para los
-- participantes» —su ficha en `talleres.descripcion` ya lo dice— y el documento
-- la manda al Aula B2, mientras el Centro de cómputo se lo lleva T10. Se carga
-- lo que dice el documento, que es la fuente. Si la organización lo corrige, se
-- cambia desde el panel y esta migración no estorba.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La columna
--
-- `not null default ''` y no nullable: un taller sin aula asignada todavía es
-- normal —se dan de alta antes de que la organización reparta los espacios— y
-- la cadena vacía lo dice sin obligar a cada pantalla a distinguir NULL de
-- vacío. Las pantallas omiten el renglón cuando está en blanco.
-- ---------------------------------------------------------------------------
alter table talleres add column if not exists salon text not null default '';

comment on column talleres.salon is
  'El espacio concreto dentro de la sede: «Aula B1», «Centro de cómputo». '
  '`lugar` es el edificio, y es el mismo para los doce talleres. Vacío '
  'significa que la organización todavía no lo reparte, no que no lo tenga.';

-- ---------------------------------------------------------------------------
-- 2 · El reparto del 2026-09-24
--
-- Por clave, NUNCA por el número de renglón del documento. Ver la cabecera: los
-- dos últimos renglones van al revés.
-- ---------------------------------------------------------------------------
update talleres t
   set salon = v.salon
  from (values
    ('T01', 'Aula B1'),                 -- Dr. Casassus Gutiérrez · día 1
    ('T02', 'Aula B2'),                 -- Mtra. Bárcenas Pozos · día 1
    ('T03', 'Aula B3'),                 -- Dra. Pastro Fiad · días 1 y 2
    ('T04', 'Sala de usos múltiples'),  -- Dr. Rojas Hernández, grupo 1 · día 1
    ('T05', 'Aula A1'),                 -- Mtra. Soberanes Cruz · días 1 y 2
    ('T06', 'Aula A2'),                 -- Mtro. Hernández Vázquez · días 1 y 2
    ('T07', 'Aula B1'),                 -- Dra. Garduño Teliz · día 2
    ('T08', 'Aula F1'),                 -- Dra. Santos Cano · día 2
    ('T09', 'Aula F2'),                 -- Mtra. Toxqui Teutle · día 2
    ('T10', 'Centro de cómputo'),       -- Dra. Almeyda y Mtra. García Contino · día 2
    ('T11', 'Aula B2'),                 -- Dra. Huamán Castro · día 2 (renglón 12)
    ('T12', 'Sala de usos múltiples')   -- Dr. Rojas Hernández, grupo 2 · día 2 (renglón 11)
  ) as v (clave, salon)
 where t.clave = v.clave;

-- ---------------------------------------------------------------------------
-- 3 · La vista lo publica
--
-- La columna nueva va AL FINAL del `select`, y no es estilo: `create or replace
-- view` solo admite columnas añadidas al final. Meterla en medio lo rechaza
-- PostgreSQL. El resto es la definición de la migración 59, sin tocar.
-- ---------------------------------------------------------------------------
create or replace view v_talleres
with (security_invoker = false) as
select
  t.id,
  t.clave,
  t.nombre,
  t.ponente,
  t.descripcion,
  t.horario,
  t.lugar,
  t.costo,
  t.activo,
  t.cupo_total,
  t.ocupados_previos + count(p.id) as cupo_ocupado,
  t.cupo_total - (t.ocupados_previos + count(p.id)) as lugares_libres,
  array(select dia from taller_dias td where td.taller_id = t.id order by dia) as dias,
  t.ocupados_previos,
  t.salon
from talleres t
left join participantes p on p.taller_id = t.id
-- El filtro que `talleres_lectura` aplica y esta vista se saltaría. NO se toca:
-- es lo que impide que el catálogo público enseñe talleres dados de baja.
where t.activo or es_interno_activo()
group by t.id;

comment on view v_talleres is
  'El cupo ocupado se cuenta, no se guarda. Publica también `ocupados_previos` '
  'para que el panel no tenga que deducirlo, y `salon` para que el catálogo, el '
  'comprobante y el portal digan a qué aula ir. Deliberadamente SIN '
  'security_invoker: cuenta inscritos, que el público no puede leer.';

grant select on v_talleres to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · El panel puede editarlo
--
-- `fn_guardar_taller` gana `p_salon`, y la firma vieja SE QUEDA como envoltura.
--
-- No es ceremonia: entre que esta migración se pega en producción y que el
-- cliente nuevo termina de desplegarse hay minutos en los que el panel vivo
-- sigue llamando con doce parámetros. Sin la envoltura, en esos minutos no se
-- puede guardar ningún taller.
--
-- Y la envoltura CONSERVA el salón que ya tenga —no manda cadena vacía—, que es
-- la diferencia entre una compatibilidad y un borrado silencioso: un cliente
-- viejo editando el cupo de T01 le habría dejado el aula en blanco.
--
-- Las dos firmas no se confunden entre sí: PostgREST resuelve por el conjunto de
-- nombres que recibe, y `p_salon` no tiene valor por omisión, así que una
-- llamada sin él solo encaja con la vieja.
-- ---------------------------------------------------------------------------
create or replace function fn_guardar_taller(
  p_clave text,
  p_nombre text,
  p_descripcion text,
  p_ponente text,
  p_costo numeric,
  p_cupo_total integer,
  p_horario text,
  p_lugar text,
  p_salon text,
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
                          horario, lugar, salon, activo)
    values (p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
            p_horario, p_lugar, coalesce(p_salon, ''), p_activo)
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
           salon = coalesce(p_salon, ''),
           activo = p_activo
     where clave = p_clave
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe ningún taller con la clave %', p_clave
        using errcode = 'no_data_found';
    end if;
  end if;

  -- Los días, tal cual. Ya no hay inscripción que estorbe al borrado.
  delete from taller_dias where taller_id = v_id and not (dia = any (p_dias));

  insert into taller_dias (taller_id, dia)
  select v_id, d from unnest(p_dias) as d
  on conflict (taller_id, dia) do nothing;

  -- Cero liberados, siempre. El valor se conserva para no cambiarle el tipo de
  -- retorno a un cliente desplegado.
  return 0;
end;
$$;

revoke all on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, boolean, smallint[], boolean, boolean
) from public, anon, authenticated;
grant execute on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, boolean, smallint[], boolean, boolean
) to authenticated;

comment on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, text, boolean, smallint[], boolean, boolean
) is
  'Guarda un taller, su salón y sus días como UNA operación. No libera '
  'inscripciones —el taller no depende del día del evento desde la migración '
  '60— y `p_liberar` se acepta y se ignora. Devuelve siempre 0.';

-- La firma de doce parámetros, ahora envoltura: delega conservando el salón.
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
begin
  return fn_guardar_taller(
    p_clave, p_nombre, p_descripcion, p_ponente, p_costo, p_cupo_total,
    p_horario, p_lugar,
    -- El salón que ya tiene. En un alta no hay fila todavía y queda vacío, que
    -- es lo correcto: un cliente que no sabe pedirlo tampoco puede darlo.
    coalesce((select salon from talleres where clave = p_clave), ''),
    p_activo, p_dias, p_crear, p_liberar
  );
end;
$$;

comment on function fn_guardar_taller(
  text, text, text, text, numeric, integer, text, text, boolean, smallint[], boolean, boolean
) is
  'Firma anterior, conservada para el cliente que todavía no conoce `p_salon`. '
  'Delega en la de trece parámetros conservando el salón guardado, para que '
  'editar un taller desde un cliente viejo no borre su aula.';

-- ---------------------------------------------------------------------------
-- 5 · Qué quedó
-- ---------------------------------------------------------------------------
do $$
declare
  v_sin_salon integer;
  r record;
begin
  select count(*) into v_sin_salon from talleres where activo and trim(salon) = '';

  for r in
    select t.clave, t.salon, t.nombre,
           array(select dia from taller_dias td where td.taller_id = t.id order by dia) as dias
      from talleres t
     where t.activo
     order by t.clave
  loop
    raise notice '% · % · días % · %', r.clave, r.salon, r.dias, left(r.nombre, 45);
  end loop;

  if v_sin_salon > 0 then
    raise notice 'ATENCIÓN: % talleres activos se quedaron sin salón.', v_sin_salon;
  else
    raise notice 'Los talleres activos tienen salón.';
  end if;
end;
$$;
