-- =============================================================================
-- El día que le toca a cada grupo de LEIP
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260925120000_el_dia_de_reinscripcion_de_leip`.
--
-- La regla
-- --------
-- Para LEIP —y SOLO para LEIP— el día de dejar el voucher **no es un rango**:
-- es un día concreto, y no puede ir antes ni después. Lo fija el calendario de
-- reinscripciones de Servicios Escolares para el periodo octubre-diciembre
-- 2026, hoja «LEIP OCTUBRE 26», elaborada el 17/08/2026.
--
-- Y no depende solo del módulo. Depende de **sede, módulo y grupo** a la vez:
-- un alumno de Teziutlán en módulo 9 va el 7 de octubre si es del grupo A o B,
-- y el 8 si es del C o del D. Por eso esto no cabía en `cita_cohortes`, que
-- solo conoce programa y avance.
--
-- Los cinco días son 2, 3, 6, 7 y 8 de octubre. La fecha límite de entrega de
-- vouchers es el 10, así que ninguno se sale de plazo.
--
-- Los números de módulo
-- ---------------------
-- La hoja habla de los módulos a los que el alumno PASA al reinscribirse. El
-- padrón del Encuentro se carga antes —el registro es del 25 al 28 de
-- septiembre y la reinscripción del 2 al 8 de octubre—, así que trae el módulo
-- anterior. La correspondencia, confirmada por la organización:
--
--   la hoja      2    6   10   14
--   el padrón    1    5    9   13
--
-- Es la misma que ya usan `ventana_cohortes` y `cita_cohortes`. En la hoja, la
-- clave del grupo lleva el módulo dentro en hexadecimal —`2NM…`=2, `6NM…`=6,
-- `ANM…`=10, `ENM…`=14—, y las filas de abajo llevan su clave anotada para que
-- cualquiera pueda cotejarlas contra el papel sin volver a deducir nada.
--
-- Las dos filas de Guadalupe Victoria en módulo 1
-- -----------------------------------------------
-- Son `2NM5` y `2NM6`, y en la hoja su celda de sede está VACÍA: la combinación
-- `F36:F40` no llega hasta ellas. Pertenecen al bloque del 3 de octubre
-- —`A34:A40` es una sola celda de fecha— y la única sede nombrada en ese bloque
-- es Guadalupe Victoria. Van ahí, y queda escrito por qué.
--
-- Qué pasa con quien no aparece
-- ------------------------------
-- Nada malo: `fn_cita_de_pago` cae a la cita general de `cita_cohortes`, que
-- para LEIP dice «el día de tu reinscripción». Es la respuesta vaga de siempre,
-- que es mucho mejor que una fecha equivocada. El bloque final enumera a los
-- alumnos de LEIP del padrón que se quedan sin día, para que se vea al aplicar.
-- =============================================================================

create table if not exists dia_reinscripcion (
  programa_id uuid not null references programas (id) on delete cascade,
  plantel_id uuid not null references planteles (id) on delete cascade,
  avance smallint not null check (avance >= 1),
  -- Tal como lo guarda el padrón: una letra, o «ÚNICO» cuando el módulo tiene
  -- un solo grupo en esa sede. El importador lo sube a mayúsculas.
  grupo text not null check (length(trim(grupo)) > 0),
  fecha date not null,
  -- La llave ES la regla: un alumno no puede resolver a dos días.
  primary key (programa_id, plantel_id, avance, grupo)
);

comment on table dia_reinscripcion is
  'El día exacto en que cada grupo deja su voucher. Hoy solo LEIP, porque es el '
  'único programa cuyo pago cae en su día de reinscripción y no en un rango.';

alter table dia_reinscripcion enable row level security;

-- Cerrada al público: al alumno se la sirve `fn_cita_de_pago`, que es
-- `security definer` y solo le contesta por SU matrícula. Abrir la tabla
-- entregaría el calendario completo de todos los grupos a quien lo pida.
drop policy if exists dia_reinscripcion_lectura on dia_reinscripcion;
create policy dia_reinscripcion_lectura on dia_reinscripcion
  for select to authenticated using (es_interno_activo());

revoke all on dia_reinscripcion from anon;
grant select on dia_reinscripcion to authenticated;

-- ---------------------------------------------------------------------------
-- Los 66 grupos de la hoja
--
-- Se borra y se vuelve a cargar entero, para que reaplicar la migración corrija
-- en vez de acumular. Los nombres de sede se unen contra `planteles`; si alguno
-- no casara, la comprobación del final lo dice con el número delante.
-- ---------------------------------------------------------------------------
delete from dia_reinscripcion;

insert into dia_reinscripcion (programa_id, plantel_id, avance, grupo, fecha)
select p.id, pl.id, e.avance, e.grupo, e.fecha
  from (values
    ('Huehuetla', 1::smallint, 'A', '2026-10-02'::date),  -- 2NME
    ('Huehuetla', 1::smallint, 'B', '2026-10-02'::date),  -- 2NMF
    ('Huehuetla', 5::smallint, 'A', '2026-10-02'::date),  -- 6NME
    ('Huehuetla', 5::smallint, 'B', '2026-10-02'::date),  -- 6NMF
    ('Huehuetla', 9::smallint, 'A', '2026-10-02'::date),  -- ANMD
    ('Huehuetla', 9::smallint, 'B', '2026-10-02'::date),  -- ANME
    ('Huehuetla', 13::smallint, 'A', '2026-10-02'::date), -- ENMI
    ('Huehuetla', 13::smallint, 'B', '2026-10-02'::date), -- ENMJ
    ('Huehuetla', 13::smallint, 'C', '2026-10-02'::date), -- ENMK
    ('Hueyapan', 1::smallint, 'A', '2026-10-02'::date),   -- 2NM7
    ('Hueyapan', 1::smallint, 'B', '2026-10-02'::date),   -- 2NM8
    ('Hueyapan', 5::smallint, 'A', '2026-10-02'::date),   -- 6NM6
    ('Hueyapan', 5::smallint, 'B', '2026-10-02'::date),   -- 6NM7
    ('Hueyapan', 5::smallint, 'C', '2026-10-02'::date),   -- 6NM8
    ('Hueyapan', 9::smallint, 'A', '2026-10-02'::date),   -- ANM6
    ('Hueyapan', 9::smallint, 'B', '2026-10-02'::date),   -- ANM7
    ('Zapotitlán', 1::smallint, 'A', '2026-10-02'::date), -- 2NM9
    ('Zapotitlán', 1::smallint, 'B', '2026-10-02'::date), -- 2NMA
    ('Zapotitlán', 5::smallint, 'A', '2026-10-02'::date), -- 6NM9
    ('Zapotitlán', 5::smallint, 'B', '2026-10-02'::date), -- 6NMA
    ('Zapotitlán', 9::smallint, 'A', '2026-10-02'::date), -- ANM8
    ('Zapotitlán', 9::smallint, 'B', '2026-10-02'::date), -- ANM9
    ('Zapotitlán', 9::smallint, 'C', '2026-10-02'::date), -- ANMA

    ('Caxhuacan', 1::smallint, 'A', '2026-10-03'::date),  -- 2NMD
    ('Caxhuacan', 1::smallint, 'B', '2026-10-03'::date),  -- 2NMG
    -- Las dos sin sede en la hoja. Ver «Las dos filas de Guadalupe Victoria».
    ('Guadalupe Victoria', 1::smallint, 'A', '2026-10-03'::date),      -- 2NM5
    ('Guadalupe Victoria', 1::smallint, 'B', '2026-10-03'::date),      -- 2NM6
    ('Guadalupe Victoria', 5::smallint, 'A', '2026-10-03'::date),      -- 6NM4
    ('Guadalupe Victoria', 5::smallint, 'B', '2026-10-03'::date),      -- 6NM5
    ('Guadalupe Victoria', 9::smallint, 'ÚNICO', '2026-10-03'::date),  -- ANM5
    ('Guadalupe Victoria', 13::smallint, 'A', '2026-10-03'::date),     -- ENM7
    ('Guadalupe Victoria', 13::smallint, 'B', '2026-10-03'::date),     -- ENM8
    ('Hueyapan', 13::smallint, 'A', '2026-10-03'::date),  -- ENM9
    ('Hueyapan', 13::smallint, 'B', '2026-10-03'::date),  -- ENMA
    ('Hueyapan', 13::smallint, 'C', '2026-10-03'::date),  -- ENMB
    ('Hueyapan', 13::smallint, 'D', '2026-10-03'::date),  -- ENMC
    ('Hueytamalco', 1::smallint, 'A', '2026-10-03'::date),-- 2NMH
    ('Zapotitlán', 13::smallint, 'A', '2026-10-03'::date),-- ENMD
    ('Zapotitlán', 13::smallint, 'B', '2026-10-03'::date),-- ENME
    ('Zapotitlán', 13::smallint, 'C', '2026-10-03'::date),-- ENMF

    ('Ayotoxco', 1::smallint, 'A', '2026-10-06'::date),   -- 2NMB
    ('Ayotoxco', 1::smallint, 'B', '2026-10-06'::date),   -- 2NMC
    ('Ayotoxco', 5::smallint, 'A', '2026-10-06'::date),   -- 6NMB
    ('Ayotoxco', 5::smallint, 'B', '2026-10-06'::date),   -- 6NMC
    ('Ayotoxco', 5::smallint, 'C', '2026-10-06'::date),   -- 6NMD
    ('Ayotoxco', 9::smallint, 'A', '2026-10-06'::date),   -- ANMB
    ('Ayotoxco', 9::smallint, 'B', '2026-10-06'::date),   -- ANMC
    ('Ayotoxco', 13::smallint, 'A', '2026-10-06'::date),  -- ENMG
    ('Ayotoxco', 13::smallint, 'B', '2026-10-06'::date),  -- ENMH

    ('Teziutlán', 1::smallint, 'A', '2026-10-07'::date),  -- 2NM1
    ('Teziutlán', 1::smallint, 'B', '2026-10-07'::date),  -- 2NM2
    ('Teziutlán', 1::smallint, 'C', '2026-10-07'::date),  -- 2NM3
    ('Teziutlán', 1::smallint, 'D', '2026-10-07'::date),  -- 2NM4
    ('Teziutlán', 5::smallint, 'A', '2026-10-07'::date),  -- 6NM1
    ('Teziutlán', 5::smallint, 'B', '2026-10-07'::date),  -- 6NM2
    ('Teziutlán', 5::smallint, 'C', '2026-10-07'::date),  -- 6NM3
    ('Teziutlán', 9::smallint, 'A', '2026-10-07'::date),  -- ANM1
    ('Teziutlán', 9::smallint, 'B', '2026-10-07'::date),  -- ANM2

    -- El módulo 9 de Teziutlán se parte: A y B el 7, C y D el 8.
    ('Teziutlán', 9::smallint, 'C', '2026-10-08'::date),  -- ANM3
    ('Teziutlán', 9::smallint, 'D', '2026-10-08'::date),  -- ANM4
    ('Teziutlán', 13::smallint, 'A', '2026-10-08'::date), -- ENM1
    ('Teziutlán', 13::smallint, 'B', '2026-10-08'::date), -- ENM2
    ('Teziutlán', 13::smallint, 'C', '2026-10-08'::date), -- ENM3
    ('Teziutlán', 13::smallint, 'D', '2026-10-08'::date), -- ENM4
    ('Teziutlán', 13::smallint, 'E', '2026-10-08'::date), -- ENM5
    ('Teziutlán', 13::smallint, 'F', '2026-10-08'::date)  -- ENM6
  ) as e(sede, avance, grupo, fecha)
  join planteles pl on pl.nombre = e.sede
  cross join programas p
 where p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
on conflict (programa_id, plantel_id, avance, grupo) do nothing;

-- ---------------------------------------------------------------------------
-- La cita de pago, ahora con el día exacto cuando lo hay
--
-- Devuelve `jsonb` y no texto porque la pantalla necesita saber DOS cosas: qué
-- día, y si ese día es único. A un alumno de LEIP hay que decirle «no puedes ir
-- antes ni después»; a los demás no, porque su cita sí es un rango.
--
-- Se añade junto a `fn_cita_de_inscripcion`, que se queda donde está: el
-- cliente prueba esta y, si la base todavía no la tiene, cae a aquella. Así el
-- código puede subir antes que el SQL sin que nadie se quede sin su fecha.
-- ---------------------------------------------------------------------------
create or replace function fn_cita_de_pago(p_matricula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a record;
  v_fecha date;
  v_cuando text;
  /*
   * Los nombres en español se arman a mano y no con `to_char`: el formato con
   * nombres depende de la configuración regional del servidor, que aquí no
   * controlamos, y «Friday 2 de October» sería peor que no decir el día.
   */
  v_dias constant text[] := array[
    'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  v_meses constant text[] := array[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
begin
  select programa_id, plantel_id, avance, grupo
    into v_a
    from padron_alumnos
   where matricula = trim(p_matricula);

  -- Quien no está en el padrón no tiene cita, y no se le dice más: contestar
  -- distinto a una matrícula que existe y a otra que no es un enumerador.
  if not found then
    return null;
  end if;

  select d.fecha
    into v_fecha
    from dia_reinscripcion d
   where d.programa_id = v_a.programa_id
     and d.plantel_id = v_a.plantel_id
     and d.avance = v_a.avance
     and d.grupo = upper(trim(coalesce(v_a.grupo, '')));

  if found then
    return jsonb_build_object(
      'cuando', format('%s %s de %s',
        v_dias[extract(dow from v_fecha)::int + 1],
        extract(day from v_fecha)::int,
        v_meses[extract(month from v_fecha)::int]),
      'estricto', true
    );
  end if;

  -- Sin día propio, la cita general de su cohorte. Para LEIP eso es «el día de
  -- tu reinscripción», que es vago pero cierto.
  select c.cuando
    into v_cuando
    from cita_cohortes cc
    join citas_inscripcion c on c.id = cc.cita_id
   where cc.programa_id = v_a.programa_id
     and cc.avance = v_a.avance
   order by c.orden
   limit 1;

  if v_cuando is null then
    return null;
  end if;

  return jsonb_build_object('cuando', v_cuando, 'estricto', false);
end;
$$;

revoke all on function fn_cita_de_pago(text) from public, anon, authenticated;
grant execute on function fn_cita_de_pago(text) to anon, authenticated;

comment on function fn_cita_de_pago is
  'Qué día le toca ir a pagar a quien tiene esa matrícula. `estricto` en cierto '
  'significa que es un día único y no un rango: hoy solo LEIP, por su '
  'calendario de reinscripciones. NULL si no está en el padrón o no tiene cita.';

-- ---------------------------------------------------------------------------
-- Que lo de arriba sea verdad
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_filas integer;
  v_sin integer := 0;
  v_leip uuid;
begin
  select id into v_leip from programas
   where nombre = 'Licenciatura en Educación e Innovación Pedagógica';

  if v_leip is null then
    raise exception
      'No hay ningún programa llamado «Licenciatura en Educación e Innovación '
      'Pedagógica». Ninguna fila se cargó.';
  end if;

  select count(*) into v_filas from dia_reinscripcion;
  if v_filas <> 66 then
    raise exception
      'Se cargaron % grupos y la hoja tiene 66. Casi seguro que algún nombre de '
      'sede no coincide con `planteles`.', v_filas;
  end if;

  raise notice '66 grupos de LEIP con día propio. Reparto por fecha:';
  for r in
    select to_char(d.fecha, 'DD/MM') as dia,
           count(*) as grupos,
           string_agg(distinct pl.nombre, ', ') as sedes
      from dia_reinscripcion d
      join planteles pl on pl.id = d.plantel_id
     group by d.fecha
     order by d.fecha
  loop
    raise notice '  % · % grupos · %', r.dia, r.grupos, r.sedes;
  end loop;

  /*
   * Y lo que de verdad importa: quién se queda sin día.
   *
   * Se cruza contra el padrón REAL. Un alumno de LEIP cuyo (sede, módulo,
   * grupo) no esté en la hoja verá «el día de tu reinscripción» en vez de su
   * fecha. No es un fallo del sistema —es que su grupo no aparece en el papel,
   * o que viene escrito de otra forma— pero hay que verlo.
   */
  raise notice '';
  for r in
    select a.matricula, pl.nombre as sede, a.avance,
           coalesce(a.grupo, '(sin grupo)') as grupo
      from padron_alumnos a
      join planteles pl on pl.id = a.plantel_id
     where a.programa_id = v_leip
       and not exists (
         select 1 from dia_reinscripcion d
          where d.programa_id = a.programa_id
            and d.plantel_id = a.plantel_id
            and d.avance = a.avance
            and d.grupo = upper(trim(coalesce(a.grupo, '')))
       )
     order by pl.nombre, a.avance, a.grupo
     limit 40
  loop
    v_sin := v_sin + 1;
    if v_sin = 1 then
      raise notice 'Alumnos de LEIP SIN día propio (verán la frase general):';
    end if;
    raise notice '  % · % · módulo % · grupo %', r.matricula, r.sede, r.avance, r.grupo;
  end loop;

  if v_sin = 0 then
    raise notice 'Ningún alumno de LEIP del padrón se queda sin su día.';
    raise notice '(Si el padrón todavía está vacío, esto no demuestra nada:';
    raise notice ' vuelve a mirarlo después de importarlo.)';
  else
    raise notice '';
    raise notice '% alumnos sin día (se listan hasta 40). Revisa cómo viene su', v_sin;
    raise notice 'grupo en el padrón: la hoja usa A, B, C, D, E, F y ÚNICO.';
  end if;
end;
$$;
