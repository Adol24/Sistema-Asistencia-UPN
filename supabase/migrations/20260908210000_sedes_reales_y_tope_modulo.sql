-- Las sedes reales donde estudian los alumnos, y el tope de módulo corregido.
--
-- Dos cambios que vienen del mismo sitio: lo que Servicios Escolares va a
-- entregar en el archivo del padrón.
--
-- Sobre el nombre: la tabla se llama `planteles` y en la aplicación se muestra
-- como «Sede», que es la palabra que usa la universidad. No se renombra la tabla
-- porque de ella dependen `padron_alumnos` y `participantes` por llave foránea,
-- y varias vistas; el nombre visible ya es el correcto y la traducción vive en
-- el mapeo, igual que con `dias_evento.sede` -> `lugar`.

-- ---------------------------------------------------------------------------
-- El tope del módulo en maestría.
--
-- Estaba en 6. El padrón trae módulo 13, así que TODA fila de maestría por
-- encima de 6 se habría rechazado al importar, y el motivo —un disparador que
-- valida entre tablas— no es evidente leyendo el archivo.
--
-- Se sube a 13, que es el máximo real. Dejarlo sin tope habría dejado pasar una
-- errata de tecleo sin avisar, y un «módulo 31» en el padrón no lo detecta nadie
-- hasta que ese alumno reclama su constancia.
-- ---------------------------------------------------------------------------
update niveles_academicos
   set total_avance = 13
 where nivel = 'Maestría';

-- ---------------------------------------------------------------------------
-- Las nueve sedes.
--
-- Se dan de alta antes de retirar las de ejemplo, para que no haya un momento
-- sin catálogo. Las viejas solo se retiran si nadie las usa: `padron_alumnos` y
-- `participantes` apuntan aquí con `on delete restrict`, así que un borrado a
-- ciegas fallaría dejando la migración a medias.
-- ---------------------------------------------------------------------------
insert into planteles (nombre) values
  ('Teziutlán'),
  ('Hueyapan'),
  ('Guadalupe Victoria'),
  ('Ayotoxco'),
  ('Zapotitlán'),
  ('Huehuetla'),
  ('Caxhuacan'),
  ('San Miguel Tenextatiloyan'),
  ('Hueytamalco')
on conflict (nombre) do nothing;

do $$
declare
  ejemplo text[] := array['Campus Central', 'Campus Norte', 'Campus Sur', 'Unidad Poniente'];
  v_borrados integer;
  v_en_uso integer;
  r record;
begin
  with quitables as (
    select pl.id
      from planteles pl
     where pl.nombre = any (ejemplo)
       and not exists (select 1 from padron_alumnos a where a.plantel_id = pl.id)
       and not exists (select 1 from participantes p where p.plantel_id = pl.id)
  )
  delete from planteles where id in (select id from quitables);
  get diagnostics v_borrados = row_count;

  select count(*) into v_en_uso from planteles pl where pl.nombre = any (ejemplo);

  raise notice 'Sedes de ejemplo retiradas: %', v_borrados;

  if v_en_uso > 0 then
    raise notice 'Quedan % sedes de ejemplo porque tienen alumnos detrás:', v_en_uso;
    for r in
      select pl.nombre,
             (select count(*) from padron_alumnos a where a.plantel_id = pl.id) as en_padron,
             (select count(*) from participantes p where p.plantel_id = pl.id) as en_participantes
        from planteles pl
       where pl.nombre = any (ejemplo)
       order by pl.nombre
    loop
      raise notice '  % — padrón: %, participantes: %', r.nombre, r.en_padron, r.en_participantes;
    end loop;
    raise notice 'Reasigna esas filas a su sede real y vuelve a correr esta migración.';
  end if;
end;
$$;
