-- =============================================================================
-- 63 · La ventana de primer semestre
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260923180000_la_ventana_de_primer_semestre`.
--
-- El problema
-- -----------
-- El pre-registro abre el 25 de septiembre y los alumnos de nuevo ingreso lo
-- hacen el 27 y el 28. Hoy no pueden: **no es el padrón lo que los detiene, es
-- la ventana**, y son dos muros distintos.
--
-- `fn_motivo_fuera_de_ventana` tiene una regla que conviene tener presente:
--
--   · con CERO ventanas cargadas, el pre-registro está abierto para todos;
--   · existiendo UNA, toda cohorte que no esté declarada en alguna queda
--     bloqueada con «Todavía no se anuncia la fecha de registro para tu grupo».
--
-- Y hay una cargada: «El registro previo para semestre 7 y módulo 13», del 25 al
-- 27. Así que primer semestre está cerrado, y lo estaría igual con el padrón
-- completo, con autodeclaración o con captura en mesa. Esta ventana hace falta
-- en los tres casos, y por eso se abre antes de decidir cómo entran sus datos.
--
-- Qué se abre, y qué NO
-- ---------------------
-- Se abre del 27 al 28 para las **seis licenciaturas en avance 1**. Las tres
-- maestrías NO se incluyen: la organización habló de nuevo ingreso de primer
-- semestre, y una generación de maestría entrando por módulo 1 es una decisión
-- distinta que nadie ha tomado. Si la toma, se añade una fila por programa.
--
-- El avance es 1 para las seis, incluida la que va por módulos —LEIP—: la
-- etiqueta cambia («Módulo 1» en vez de «Semestre 1») pero el número es el
-- mismo, y `ventana_cohortes` guarda el número.
--
-- El bloque del final enumera las cohortes que siguen sin ventana. No es
-- decorado: es la pregunta que queda abierta —¿se registran 2º, 3º, 5º?—
-- convertida en una lista concreta en vez de una duda.
--
-- Las horas con `-06` explícito
-- -----------------------------
-- Igual que en la migración de las ventanas, y por la misma razón: en México no
-- hay horario de verano desde 2022, así que el desfase es fijo. Sin zona se
-- interpretarían en la del servidor —UTC— y la ventana abriría seis horas
-- antes, la tarde del 26, para quien estuviera mirando.
-- =============================================================================

insert into ventanas_preregistro (etiqueta, abre, cierra)
select 'El registro de primer semestre',
       '2026-09-27 00:00:00-06'::timestamptz,
       '2026-09-28 23:59:59-06'::timestamptz
 where not exists (
   select 1 from ventanas_preregistro
    where etiqueta = 'El registro de primer semestre'
 );

/*
 * Las seis licenciaturas, en avance 1.
 *
 * Se filtran por NIVEL y no por una lista de nombres escrita a mano: si mañana
 * el catálogo gana o pierde una licenciatura, esta ventana la sigue —o deja de
 * seguirla— sin que nadie tenga que acordarse de venir aquí. Una lista de
 * nombres es justo lo que se queda atrás en silencio.
 */
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id, p.id, 1
  from ventanas_preregistro v
  cross join programas p
  join niveles_academicos n on n.id = p.nivel_id
 where v.etiqueta = 'El registro de primer semestre'
   and n.nivel = 'Licenciatura'
on conflict (ventana_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- Qué quedó abierto, y qué sigue cerrado
-- ---------------------------------------------------------------------------
do $$
declare
  v_cohortes integer;
  r record;
  v_cerradas integer := 0;
begin
  select count(*) into v_cohortes
    from ventana_cohortes c
    join ventanas_preregistro v on v.id = c.ventana_id
   where v.etiqueta = 'El registro de primer semestre';

  if v_cohortes = 0 then
    raise exception
      'La ventana de primer semestre quedó sin cohortes. ¿El catálogo tiene '
      'programas de nivel Licenciatura?';
  end if;

  raise notice 'Ventana «El registro de primer semestre»: 27 y 28 de septiembre.';
  raise notice '  % cohortes abiertas (licenciaturas en avance 1).', v_cohortes;

  raise notice '';
  raise notice 'Ventanas cargadas ahora mismo:';
  for r in
    select v.etiqueta,
           to_char(v.abre at time zone 'America/Mexico_City', 'DD/MM') as desde,
           to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM') as hasta,
           (select count(*) from ventana_cohortes c where c.ventana_id = v.id) as cohortes
      from ventanas_preregistro v
     order by v.abre
  loop
    raise notice '  % · del % al % · % cohortes', r.etiqueta, r.desde, r.hasta, r.cohortes;
  end loop;

  /*
   * Y lo que de verdad hay que mirar: quién sigue fuera.
   *
   * Se recorre cada programa con cada avance posible hasta su tope y se señala
   * el que no aparece en ninguna ventana. Esas personas, hoy, reciben «Todavía
   * no se anuncia la fecha de registro para tu grupo» — que es correcto si de
   * verdad no están invitadas, y es un portazo silencioso si lo están.
   */
  raise notice '';
  raise notice 'Cohortes SIN ventana (hoy no pueden pre-registrarse):';
  for r in
    select p.nombre as programa,
           coalesce(p.etiqueta_avance, n.etiqueta_avance) as etiqueta,
           a.avance
      from programas p
      join niveles_academicos n on n.id = p.nivel_id
      cross join lateral generate_series(
        1,
        coalesce(p.total_avance, n.total_avance)
      ) as a(avance)
     where not exists (
       select 1 from ventana_cohortes c
        where c.programa_id = p.id and c.avance = a.avance
     )
     order by p.nombre, a.avance
  loop
    v_cerradas := v_cerradas + 1;
    raise notice '  % · % %', r.programa, r.etiqueta, r.avance;
  end loop;

  raise notice '';
  raise notice '% cohortes cerradas en total. Si alguna de ellas SÍ está invitada,', v_cerradas;
  raise notice 'hay que declararle su ventana o no va a poder registrarse.';
end;
$$;
