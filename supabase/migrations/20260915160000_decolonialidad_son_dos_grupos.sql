-- =============================================================================
-- El taller de decolonialidad son dos grupos, no uno de setenta.
--
-- La migración 35 lo cargó como un solo taller de 70 lugares impartido los días
-- 1 y 2. Al revisarlo con quien organiza resultó ser otra cosa: son **35
-- personas el jueves y 35 distintas el viernes**. Dos grupos que no comparten
-- nada —ni personas, ni cupo, ni sesión—, y la nota del programa lo decía desde
-- el principio: «trabajará con grupos distintos».
--
-- El programa también los numera aparte: el 4 el día 1 y el 11 el día 2. Fui yo
-- quien los unió al ver el mismo nombre y el mismo tallerista.
--
-- Por qué importa y no es cosmético: con un solo taller de 70 y dos días, nada
-- impedía que las 70 inscripciones cayeran el mismo día. El cupo se cuenta por
-- taller (`v_talleres`), no por día, así que 70 personas el jueves y 0 el
-- viernes habría sido un estado perfectamente válido para la base y un salón
-- desbordado para el tallerista.
--
-- Partirlo en dos talleres de 35 lo arregla sin tocar el esquema: cada uno tiene
-- su día y su cupo, y el conteo que ya existe hace lo correcto.
--
-- Es distinto de T03, T05 y T06 —esos SÍ son un solo grupo de 30 que asiste las
-- dos tardes—, y eso se resuelve aparte, en la regla del escaneo de taller.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Nadie puede estar inscrito todavía en el grupo que se va a mover.
--
-- Si alguien ya eligió T04 con día 2, quitarle ese día al taller rompería la
-- llave foránea compuesta de `participantes`. Se comprueba antes y se detiene
-- con un mensaje que dice qué hacer, en vez de fallar con un error de llave que
-- no explica nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_inscritos integer;
begin
  select count(*) into v_inscritos
    from participantes p
    join talleres t on t.id = p.taller_id
   where t.clave = 'T04' and p.dia = 2;

  if v_inscritos > 0 then
    raise exception
      'Hay % personas inscritas en T04 con día 2. Muévelas al taller nuevo (T12) antes de correr esta migración.',
      v_inscritos;
  end if;
end;
$$;

-- El grupo del jueves se queda en T04, con su cupo real.
update talleres
   set cupo_total = 35,
       descripcion = 'Grupo del día 1. El mismo taller se imparte el día 2 con otro grupo.'
 where clave = 'T04';

delete from taller_dias
 where dia = 2
   and taller_id = (select id from talleres where clave = 'T04');

-- El grupo del viernes es un taller propio.
insert into talleres (clave, nombre, ponente, descripcion, horario, lugar, cupo_total, costo)
values (
  'T12',
  'La decolonialidad como práctica didáctica en el aula',
  'Dr. Armando Rojas Hernández',
  'Grupo del día 2. El mismo taller se imparte el día 1 con otro grupo.',
  '15:00 a 18:00 hrs',
  'Instalaciones UPN U-212, Teziutlán',
  35,
  100.00
)
on conflict (clave) do nothing;

insert into taller_dias (taller_id, dia)
select id, 2 from talleres where clave = 'T12'
on conflict (taller_id, dia) do nothing;

-- ---------------------------------------------------------------------------
-- Cómo quedó el reparto por día.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select td.dia,
           count(*) as talleres,
           sum(t.cupo_total) as lugares
      from taller_dias td
      join talleres t on t.id = td.taller_id
     where t.activo
     group by td.dia
     order by td.dia
  loop
    raise notice 'Día % · % talleres · % lugares', r.dia, r.talleres, r.lugares;
  end loop;

  raise notice 'Aviso: en los lugares del día 1 y del día 2 se cuentan dos veces los talleres de dos tardes (T03, T05, T06), porque son las mismas 30 personas en ambos.';
end;
$$;
