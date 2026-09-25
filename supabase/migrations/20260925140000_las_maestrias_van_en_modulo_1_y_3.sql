-- =============================================================================
-- Las maestrías van en módulo 1 y 3
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260925140000_las_maestrias_van_en_modulo_1_y_3`.
--
-- El número que estaba mal
-- ------------------------
-- Las tres maestrías entraban con los módulos **1 y 4**. Son el **1 y el 3**,
-- dicho por la organización el 2026-09-25.
--
-- El 4 venía de traducir el calendario del Encuentro de forma mecánica: allí
-- las maestrías salen con los romanos **I y IV**, y IV se leyó como 4. Con LEIP
-- la regla resultó ser restar uno —II→1, VI→5, X→9, XIV→13— pero a las
-- maestrías no se les aplicó, porque I menos uno da cero y ahí la regla se
-- rompía. Se dejaron tal cual, y ese fue el error: el IV sí corre, el I no.
--
-- Lo que costaba, y en qué plazo
-- ------------------------------
-- La ventana del 27 y 28 es la suya. Con el 4 puesto:
--
--   quien va en módulo 3 lee «Todavía no se anuncia la fecha de registro para
--   tu grupo» el día que sí le toca;
--
--   quien va en módulo 4 —si existe alguien— se registra un día que no es el
--   suyo.
--
-- Se corrige en las DOS tablas a la vez. Cambiar solo la ventana dejaría a esa
-- generación registrándose sin saber qué día ir a pagar, que es exactamente el
-- agujero que abrió `20260924120000` con LEIP y que hubo que cerrar después.
--
-- Por qué se filtra por NIVEL y no por nombre
-- -------------------------------------------
-- Son las tres maestrías del catálogo, y lo que las define es su nivel. Una
-- lista de nombres escrita a mano es lo que se queda atrás en silencio el día
-- que se dé de alta una cuarta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La ventana del 27 y 28
-- ---------------------------------------------------------------------------
update ventana_cohortes c
   set avance = 3
  from programas p
  join niveles_academicos n on n.id = p.nivel_id
 where p.id = c.programa_id
   and n.nivel = 'Maestría'
   and c.avance = 4;

-- La etiqueta se le enseña a quien llega fuera de plazo, así que también tiene
-- que decir la verdad. Se localiza por su texto de ahora.
update ventanas_preregistro
   set etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 3 y 5'
 where etiqueta = 'El registro de primero, tercero y quinto semestre y de los módulos 1, 4 y 5';

-- ---------------------------------------------------------------------------
-- 2 · Y su día de pago, que va en el mismo movimiento
--
-- Las tres maestrías pagan el 3 de octubre. Lo que cambia es POR QUIÉN se
-- pregunta, no cuándo: `fn_cita_de_pago` busca por programa y avance, y con el
-- 4 no encontraría a nadie.
-- ---------------------------------------------------------------------------
update cita_cohortes c
   set avance = 3
  from programas p
  join niveles_academicos n on n.id = p.nivel_id
 where p.id = c.programa_id
   and n.nivel = 'Maestría'
   and c.avance = 4;

-- ---------------------------------------------------------------------------
-- 3 · Que lo de arriba sea verdad
--
-- Igual que en las anteriores, la comprobación que sirve es CRUZAR las dos
-- tablas. Las cuentas seguirían cuadrando con el número equivocado: el fallo
-- está en cuáles, no en cuántas.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_mal integer := 0;
  v_cuatro integer;
begin
  select count(*) into v_cuatro
    from ventana_cohortes c
    join programas p on p.id = c.programa_id
    join niveles_academicos n on n.id = p.nivel_id
   where n.nivel = 'Maestría' and c.avance = 4;

  if v_cuatro > 0 then
    raise exception
      'Quedan % cohortes de maestría en módulo 4. El `update` no las alcanzó.', v_cuatro;
  end if;

  for r in
    select p.nombre as programa, c.avance
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
      join niveles_academicos n on n.id = p.nivel_id
     where n.nivel = 'Maestría'
     order by p.nombre, c.avance
  loop
    raise notice '  % · módulo %', r.programa, r.avance;
  end loop;

  -- Ninguna cohorte puede quedarse con ventana y sin cita, ni al revés.
  for r in
    select p.nombre as programa, c.avance, 'con ventana y SIN cita' as que
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from cita_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     union all
    select p.nombre, c.avance, 'con cita y SIN ventana'
      from cita_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from ventana_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     order by 1, 2
  loop
    v_mal := v_mal + 1;
    raise warning '% · avance % · %', r.programa, r.avance, r.que;
  end loop;

  if v_mal > 0 then
    raise exception
      '% cohortes descuadradas entre registro e inscripción. Cada una es alguien '
      'que se registra sin saber cuándo pagar, o una cita que nadie alcanza.', v_mal;
  end if;

  raise notice '';
  raise notice 'Las tres maestrías quedan en módulo 1 y 3, con su día de pago.';
  raise notice 'Registro e inscripción cuadran en todos los programas.';

  for r in
    select v.etiqueta,
           to_char(v.abre at time zone 'America/Mexico_City', 'DD/MM') as desde,
           to_char(v.cierra at time zone 'America/Mexico_City', 'DD/MM') as hasta
      from ventanas_preregistro v
     order by v.abre
  loop
    raise notice '  % · del % al %', r.etiqueta, r.desde, r.hasta;
  end loop;
end;
$$;
