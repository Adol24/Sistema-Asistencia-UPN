-- =============================================================================
-- 43 · El avance lo manda el programa, no el nivel
--
-- Hasta aquí el sistema creía que el NIVEL decide cómo se cuenta el avance y
-- hasta dónde llega: Licenciatura → «Semestre», 1 a 8; Maestría → «Módulo», 1 a
-- 13. El padrón real de la UPN 212 lo desmiente en su primera hoja.
--
-- La **Licenciatura en Educación e Innovación Pedagógica se cuenta por
-- módulos** y llega al 13, siendo licenciatura. Es la única que lo hace: las
-- otras cinco licenciaturas van por semestre. No es un plan viejo conviviendo
-- con uno nuevo —eso fue la primera sospecha y era falsa—; es el plan de esa
-- licenciatura, y las cohortes de 2024 y 2025 que el archivo lista como
-- «TERCER» y «QUINTO» son módulo 3 y módulo 5, no semestres.
--
-- Con el modelo anterior, las 293 filas de esa hoja se rechazaban una por una
-- —«Semestre 13 está fuera de rango: ese nivel llega a 8»— y no había forma de
-- cargarlas sin mentir: subir el tope de Licenciatura a 13 habría hecho que el
-- comprobante de un alumno de Pedagogía pudiera decir «Semestre 11».
--
-- Así que la etiqueta y el tope bajan un escalón, del nivel al programa, y lo
-- hacen como EXCEPCIÓN: las dos columnas nuevas admiten NULL, y NULL significa
-- «lo que diga mi nivel». Ocho de los nueve programas se quedan en NULL. Que la
-- excepción se vea como excepción es el punto: si se copiara el dato a los
-- nueve, dentro de un año nadie sabría cuál de ellos es el raro.
-- =============================================================================

-- `if not exists` para poder correrla dos veces sin que se caiga en la primera
-- sentencia. Es el mismo cuidado que tomó la 42 con `dias_evento.cupo`, y aquí
-- importa igual: estas migraciones se aplican a mano desde el editor SQL, donde
-- no hay nada que lleve la cuenta de cuáles ya corrieron.
alter table programas
  add column if not exists etiqueta_avance text,
  add column if not exists total_avance smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_etiqueta_avance_programa') then
    alter table programas add constraint chk_etiqueta_avance_programa
      check (etiqueta_avance is null or length(trim(etiqueta_avance)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_total_avance_programa') then
    alter table programas add constraint chk_total_avance_programa
      check (total_avance is null or total_avance >= 1);
  end if;
end;
$$;

comment on column programas.etiqueta_avance is
  'NULL = se cuenta como diga su nivel. Solo se llena cuando el programa es la excepción.';
comment on column programas.total_avance is
  'NULL = el tope de su nivel. Solo se llena cuando el programa es la excepción.';

-- La única excepción que existe hoy. Se busca por nombre normalizado y no por
-- id porque los ids se generan al sembrar y difieren entre proyectos.
--
-- `extensions.unaccent` va con su esquema por delante: aquí no estamos dentro de
-- una función con `set search_path`, y en Supabase la extensión no vive en
-- `public`. Sin el prefijo, esta migración corre en el editor SQL y falla en un
-- despliegue limpio, que es la peor forma de fallar.
update programas
   set etiqueta_avance = 'Módulo',
       total_avance = 13
 where upper(extensions.unaccent(nombre)) =
       upper(extensions.unaccent('Licenciatura en Educación e Innovación Pedagógica'));

-- Si el catálogo ya tiene programas y ninguno era ese, la excepción se perdió en
-- silencio y el padrón volvería a rechazar 293 filas sin que nadie sepa por qué.
-- Se detiene aquí, que es donde todavía se puede leer el motivo.
do $$
declare
  v_programas int;
  v_excepcion int;
begin
  select count(*) into v_programas from programas;
  select count(*) into v_excepcion from programas where total_avance is not null;

  if v_programas > 0 and v_excepcion = 0 then
    raise exception
      'No se encontró «Licenciatura en Educación e Innovación Pedagógica» entre los % programas cargados. Se renombró, y hay que ajustar esta migración antes de aplicarla.',
      v_programas
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- El disparador pregunta primero al programa
--
-- Misma firma y mismo nombre, así que `create or replace` conserva sus
-- concesiones y no hay que recorrer `pg_proc` (ver la trampa en MIGRACIONES.md).
-- Lo único que cambia es a quién le pregunta el tope.
-- -----------------------------------------------------------------------------
create or replace function fn_validar_avance()
returns trigger
language plpgsql
as $$
declare
  v_tope smallint;
  v_etiqueta text;
  v_fuente text;
begin
  select coalesce(p.total_avance, n.total_avance),
         coalesce(p.etiqueta_avance, n.etiqueta_avance),
         case when p.total_avance is null then 'ese nivel' else 'ese programa' end
    into v_tope, v_etiqueta, v_fuente
    from programas p
    join niveles_academicos n on n.id = p.nivel_id
   where p.id = new.programa_id;

  -- Un programa que no existe lo rechaza la llave foránea, no este disparador.
  if v_tope is null then
    return new;
  end if;

  if new.avance > v_tope then
    raise exception '% % está fuera de rango: % llega a %',
      v_etiqueta, new.avance, v_fuente, v_tope
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Antes bastaba con vigilar `avance` y `nivel_id`, porque el tope colgaba del
-- nivel. Ahora cuelga del programa: cambiar de programa sin cambiar de nivel
-- —de Pedagogía a Innovación Pedagógica, las dos licenciaturas— mueve el tope, y
-- sin esto pasaría sin que nadie lo comprobara.
drop trigger if exists trg_padron_avance on padron_alumnos;
create trigger trg_padron_avance
  before insert or update of avance, nivel_id, programa_id on padron_alumnos
  for each row execute function fn_validar_avance();
