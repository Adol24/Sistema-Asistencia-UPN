-- =============================================================================
-- 45 · Devolver T01 a T04, que no estaban apagados sino borrados
--
-- Qué pasó
-- --------
-- Durante semanas se creyó que estos cuatro talleres estaban **inactivos**. La
-- política `talleres_lectura` es `using (activo or es_interno_activo())`, así
-- que al rol anónimo un taller apagado y uno inexistente se le parecen
-- exactamente: en los dos casos no aparece. Todo lo que se dedujo desde fuera
-- —incluido este comprobante— encajaba con las dos explicaciones.
--
-- Al mirarlos con permisos, la tabla tenía ocho filas. No estaban apagados: no
-- estaban.
--
-- `/admin/talleres` tiene un botón de eliminar junto al interruptor de activo.
-- Quien quiso apagarlos los borró, y desde ese momento el panel ya no podía
-- enseñárselos a nadie —ni siquiera para deshacerlo—.
--
-- Qué se restituye, y en qué estado
-- ---------------------------------
-- Los valores son los del programa oficial (migración 33), con la corrección
-- que la 36 le hizo a T04: ese taller se partió en dos grupos, el del día 1 se
-- quedó en T04 con cupo 35, y el del día 2 pasó a ser T12 —que sobrevivió, y es
-- la razón de que el taller de decolonialidad se pudiera elegir el viernes y no
-- el jueves—.
--
-- Se restituyen ACTIVOS. Quien los borró quería que no se ofrecieran, pero la
-- organización confirmó que los cuatro van: son los que sostienen el día 1, que
-- sin ellos se queda con dos talleres y sesenta lugares para setecientas
-- personas.
-- =============================================================================

insert into talleres (clave, nombre, ponente, descripcion, horario, lugar, cupo_total, costo, activo)
values
  ('T01',
   'Desarrollo de habilidades emocionales',
   'Dr. Juan Enrique Casassus Gutiérrez',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00, true),

  ('T02',
   'Humanismo y práctica docente',
   'Mtra. Laura Angélica Bárcenas Pozos',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00, true),

  ('T03',
   'Emociones y responsabilidad docente',
   'Dra. Silvia Miracy Pastro Fiad',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00, true),

  -- Cupo 35 y no 70: es el grupo del día 1. El del día 2 es T12, con los otros
  -- 35 que la 36 le dio —y que alguien subió a 70 desde el panel—.
  ('T04',
   'La decolonialidad como práctica didáctica en el aula',
   'Dr. Armando Rojas Hernández',
   'Grupo del día 1. El mismo taller se imparte el día 2 con otro grupo.',
   '15:00 a 18:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   35, 100.00, true)
on conflict (clave) do nothing;

-- Los días. T03 es el único de los cuatro que se imparte los dos; T04 se quedó
-- solo con el jueves cuando la 36 le pasó el viernes a T12.
insert into taller_dias (taller_id, dia)
select t.id, d.dia
from talleres t
join (values
  ('T01', 1),
  ('T02', 1),
  ('T03', 1), ('T03', 2),
  ('T04', 1)
) as d (clave, dia) on d.clave = t.clave
on conflict (taller_id, dia) do nothing;

-- ---------------------------------------------------------------------------
-- Que no vuelva a pasar en silencio
--
-- Se deja constancia del recuento. Si alguien vuelve a borrar un taller en vez
-- de apagarlo, esta migración no lo va a impedir —el botón sigue ahí— pero el
-- comprobante ya distingue los dos casos y lo dice al correrlo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_total integer;
  v_dia1 integer;
begin
  select count(*) into v_total from talleres;
  select coalesce(sum(t.cupo_total), 0) into v_dia1
    from talleres t
    join taller_dias d on d.taller_id = t.id
   where d.dia = 1 and t.activo;

  raise notice 'Talleres en la tabla: % (se esperan 12).', v_total;
  raise notice 'Lugares de taller del día 1: % (se esperan 185).', v_dia1;

  if v_total <> 12 then
    raise warning 'No son 12 talleres. Revisa si falta alguno más de los borrados.';
  end if;
end;
$$;
