-- Sustituye el catálogo académico de ejemplo por la oferta real de la UPN.
--
-- La semilla de `20260907001500` ya corrió, así que editarla no cambiaría nada:
-- este archivo actualiza lo que hay.
--
-- El orden importa. Primero se dan de alta los programas nuevos y solo después
-- se retiran los viejos, para que nunca haya un momento sin catálogo: si alguien
-- se pre-registra mientras esto corre, el desplegable no puede quedar vacío.

-- ---------------------------------------------------------------------------
-- Cómo se cuenta el avance.
--
-- Licenciatura pasa de 10 a 8 semestres, y maestría de «Módulo» a
-- «Cuatrimestre». El disparador `fn_validar_avance` solo se dispara al insertar
-- o actualizar, así que bajar el tope no invalida filas existentes; lo que hará
-- es rechazar la próxima edición de una fila que se pase. Más abajo se avisa
-- cuántas hay en ese caso.
-- ---------------------------------------------------------------------------
update niveles_academicos
   set etiqueta_avance = 'Semestre', total_avance = 8
 where nivel = 'Licenciatura';

update niveles_academicos
   set etiqueta_avance = 'Cuatrimestre', total_avance = 6
 where nivel = 'Maestría';

-- ---------------------------------------------------------------------------
-- Alta de la oferta real.
-- ---------------------------------------------------------------------------
insert into programas (nivel_id, nombre)
select n.id, p.nombre
from niveles_academicos n
join (values
  ('Licenciatura', 'Licenciatura en Administración Educativa'),
  ('Licenciatura', 'Licenciatura en Educación e Innovación Pedagógica'),
  ('Licenciatura', 'Licenciatura en Educación Indígena'),
  ('Licenciatura', 'Licenciatura en Intervención Educativa'),
  ('Licenciatura', 'Licenciatura en Pedagogía'),
  ('Licenciatura', 'Licenciatura en Psicología Educativa'),
  ('Maestría', 'Maestría en Didácticas de Lenguas y Culturas Indoamericanas'),
  ('Maestría', 'Maestría en Educación Básica'),
  ('Maestría', 'Maestría en Educación Media Superior')
) as p (nivel, nombre) on p.nivel = n.nivel
on conflict (nivel_id, nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Baja de los de ejemplo, solo los que nadie usa.
--
-- `padron_alumnos` y `participantes` apuntan a `programas` con `on delete
-- restrict`, así que un borrado a ciegas fallaría y dejaría la migración a
-- medias. Se retiran los que no tienen a nadie detrás y se informa de los que
-- sí, que hay que reasignar a mano antes de poder quitarlos.
-- ---------------------------------------------------------------------------
do $$
declare
  ejemplo text[] := array[
    'Ingeniería en Sistemas Computacionales',
    'Ingeniería Industrial',
    'Licenciatura en Administración',
    'Licenciatura en Ciencias de la Educación',
    'Licenciatura en Derecho',
    'Licenciatura en Nutrición',
    'Licenciatura en Psicología',
    'Maestría en Administración',
    'Maestría en Ciencias Computacionales',
    'Maestría en Docencia',
    'Maestría en Educación',
    'Maestría en Innovación Educativa'
  ];
  v_borrados integer;
  v_en_uso integer;
  v_fuera_de_rango integer;
  r record;
begin
  with quitables as (
    select pr.id
      from programas pr
     where pr.nombre = any (ejemplo)
       and not exists (select 1 from padron_alumnos a where a.programa_id = pr.id)
       and not exists (select 1 from participantes p where p.programa_id = pr.id)
  )
  delete from programas where id in (select id from quitables);
  get diagnostics v_borrados = row_count;

  select count(*) into v_en_uso
    from programas pr
   where pr.nombre = any (ejemplo);

  raise notice 'Programas de ejemplo retirados: %', v_borrados;

  if v_en_uso > 0 then
    raise notice 'Quedan % programas de ejemplo porque tienen alumnos detrás:', v_en_uso;
    for r in
      select pr.nombre,
             (select count(*) from padron_alumnos a where a.programa_id = pr.id) as en_padron,
             (select count(*) from participantes p where p.programa_id = pr.id) as en_participantes
        from programas pr
       where pr.nombre = any (ejemplo)
       order by pr.nombre
    loop
      raise notice '  % — padrón: %, participantes: %', r.nombre, r.en_padron, r.en_participantes;
    end loop;
    raise notice 'Reasigna esas filas al programa correcto y vuelve a correr esta migración.';
  end if;

  select count(*) into v_fuera_de_rango
    from padron_alumnos a
    join niveles_academicos n on n.id = a.nivel_id
   where a.avance > n.total_avance;

  if v_fuera_de_rango > 0 then
    raise notice 'Aviso: % filas del padrón tienen un avance por encima del nuevo tope. '
                 'No estorban hoy, pero fallarán al editarse.', v_fuera_de_rango;
  end if;
end;
$$;
