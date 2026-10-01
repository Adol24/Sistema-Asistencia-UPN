-- =============================================================================
-- Dos fechas de reposición: el 9 para todos, el 10 para Teziutlán
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20261001180000_dos_fechas_de_reposicion`.
--
-- La regla, dicha entera
-- ---------------------
-- Cuando a un alumno se le vence su fecha oficial de entrega, se le enseña una
-- fecha de reposición. Hasta hoy era UNA sola, el 12 de octubre. La
-- organización la partió en dos:
--
--   · **viernes 9 de octubre** — todos. Las cinco licenciaturas en cualquier
--     sede, la LEIP de las seis sedes que no son Teziutlán, y las tres
--     maestrías de las sedes que no son Teziutlán.
--   · **sábado 10 de octubre** — quien estudia en **Teziutlán** y es de
--     **posgrado o de LEIP**.
--
-- Y el 12 se descarta: ya no es la reposición de nadie.
--
-- Fíjate que el 10 NO es «todo Teziutlán». Pedagogía 7.º de Teziutlán es una
-- licenciatura y va al 9; lo que distingue a los del 10 es el cruce de sede con
-- programa. Son dos condiciones y las dos tienen que cumplirse.
--
-- Dónde se guarda, y por qué no en la configuración
-- -------------------------------------------------
-- Lo obvio sería una segunda columna en `configuracion_evento`, del estilo
-- `fecha_reposicion_teziutlan_posgrado`. Se descartó por dos razones:
--
--   1. El nombre tendría que codificar la regla, y los nombres que codifican
--      reglas envejecen. El día que entre un tercer grupo, la columna miente —
--      que es exactamente lo que acabó de corregir `20261001160000`.
--   2. La regla quedaría escrita en el cuerpo de `fn_cita_de_pago`, así que un
--      tercer grupo sería una migración de CÓDIGO y no un dato.
--
-- En vez de eso, la reposición pasa a ser un atributo de la cohorte: una
-- columna `fecha_reposicion` en `dia_entrega_voucher`, al lado de su fecha. La
-- consulta ya resuelve la fila de cada persona por programa, sede, módulo y
-- grupo, así que la reposición sale **en el mismo `select`**: ni segunda
-- consulta, ni condición nueva. Un tercer grupo mañana es un `update`.
--
-- `null` significa «usa la general», que vive donde siempre, en
-- `configuracion_evento.fecha_recuperacion_voucher` y sigue editable desde el
-- panel. Así los 96 renglones que van al 9 no se tocan: basta mover ese campo.
--
-- Lo que esta migración NO toca
-- -----------------------------
-- **Ninguna fecha oficial de entrega.** El 3 de las maestrías, el 7 y el 8 de
-- LEIP Teziutlán y los del 28 de septiembre al 2 de octubre se quedan donde
-- están. Esto solo decide a dónde se manda a quien los deja pasar.
--
-- **El vencimiento interno**, que sigue el 12 de octubre a las 18:00. Queda dos
-- días después de la última reposición, y eso es inofensivo: un vencimiento más
-- tardío solo significa que el sistema todavía aceptaría un depósito, nunca que
-- alguien quede expirado antes de su propia fecha —que es la trampa que
-- `20260930140000` vino a cerrar—. Si se quiere apretar al 10 a las 18:00, es
-- un campo del panel y no hace falta migración.
--
-- **El navegador.** La reposición se resuelve aquí dentro y `fn_cita_de_pago`
-- ya devuelve `repuesta: true` con la fecha que toque. Las cuatro pantallas que
-- la pintan no distinguen una reposición de otra, y no tienen por qué.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La reposición, ahora por cohorte
-- ---------------------------------------------------------------------------
alter table dia_entrega_voucher
  add column if not exists fecha_reposicion date;

comment on column dia_entrega_voucher.fecha_reposicion is
  'A dónde se manda a esta cohorte cuando su `fecha` ya pasó. NULO significa '
  '«usa la general de configuracion_evento.fecha_recuperacion_voucher», que es '
  'el caso de la mayoría: solo se rellena donde la organización pidió una fecha '
  'distinta. Desde el 2026-10-01, el posgrado y la LEIP de Teziutlán.';

-- ---------------------------------------------------------------------------
-- 2 · La general pasa del 12 al 9
--
-- Se escribe aquí y no se deja al panel porque es la fecha que van a leer 96 de
-- las 122 cohortes: si quedara pendiente de que alguien la cambie a mano,
-- seguirían leyendo un 12 que ya no es de nadie.
-- ---------------------------------------------------------------------------
update configuracion_evento
   set fecha_recuperacion_voucher = date '2026-10-09'
 where id = 1;

comment on column configuracion_evento.fecha_recuperacion_voucher is
  'La reposición GENERAL: el día al que se manda a quien se le pasó el suyo y '
  'cuya cohorte no declara una propia en `dia_entrega_voucher.fecha_reposicion`. '
  'Nulo significa que no hay reposición y no se le enseña ninguna fecha, que es '
  'preferible a enseñarle una vencida. Organización, 2026-10-01: el 9 de octubre.';

-- ---------------------------------------------------------------------------
-- 3 · El 10 de octubre, para el posgrado y la LEIP de Teziutlán
--
-- El empate es POR NOMBRE, y ahí está el peligro: una tilde de menos descarta la
-- fila en silencio y la migración «pasa» habiendo tocado cero renglones. Así se
-- perdió el límite por IP de `fn_padron_confirmar` durante año y medio en este
-- mismo repo. Por eso el bloque de abajo cuenta exacto y revienta si no cuadra.
--
-- Las dos condiciones se escriben juntas y no como dos `update`: son UNA regla
-- —«de Teziutlán y de posgrado o LEIP»— y partirla invita a que alguien aplique
-- la mitad.
-- ---------------------------------------------------------------------------
do $$
declare
  v_maestrias integer;
  v_leip integer;
  v_tocadas integer;
begin
  /*
   * Se cuenta ANTES de escribir, no después.
   *
   * Si los nombres no empatan, esto revienta sin haber tocado una sola fila, y
   * la base queda exactamente como estaba. Contando después, una migración que
   * hubiera escrito mal se quedaría a medias: unas filas puestas y la excepción
   * deshaciendo el resto solo si quien la corrió respetó la transacción.
   */
  select
    count(*) filter (where n.nivel = 'Maestría'),
    count(*) filter (where n.nivel <> 'Maestría')
    into v_maestrias, v_leip
    from dia_entrega_voucher d
    join programas p on p.id = d.programa_id
    join niveles_academicos n on n.id = p.nivel_id
    join planteles pl on pl.id = d.plantel_id
   where pl.nombre = 'Teziutlán'
     and (
       n.nivel = 'Maestría'
       or p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
     );

  /*
   * Las cuentas esperadas, y de dónde salen:
   *
   *   · 9 de maestrías = 3 programas × módulos 1, 3 y 4, con grupo comodín. Los
   *     cargó `20260925160000` con un `cross join planteles`, y el módulo 4 lo
   *     copió `20260928120000` desde el 1.
   *   · 17 de LEIP = módulo 1 (A–D), módulo 5 (A–C), módulo 9 (A–D) y módulo 13
   *     (A–F), de `20260925120000`.
   *
   * El empate es POR NOMBRE de programa y de plantel, y ahí está el peligro: una
   * tilde de menos no da error, devuelve cero filas y la migración «pasa» sin
   * haber hecho nada. Así se perdió el límite por IP de `fn_padron_confirmar`
   * durante año y medio en este repo. Por eso se cuenta exacto.
   */
  if v_maestrias <> 9 or v_leip <> 17 then
    raise exception
      'Se esperaban 9 filas de maestrías y 17 de LEIP en Teziutlán, y se encontraron '
      '% y %. Revisa los nombres exactos en `programas` y `planteles`: el empate es '
      'por nombre y una tilde de menos no da error, devuelve cero filas.',
      v_maestrias, v_leip
      using errcode = 'data_exception';
  end if;

  /*
   * Las dos condiciones van juntas en un solo `update` y no en dos: son UNA
   * regla —«de Teziutlán, y de posgrado o LEIP»— y partirla invita a que alguien
   * aplique la mitad.
   */
  update dia_entrega_voucher d
     set fecha_reposicion = date '2026-10-10'
   where exists (
     select 1
       from programas p
       join niveles_academicos n on n.id = p.nivel_id
       join planteles pl on pl.id = d.plantel_id
      where p.id = d.programa_id
        and pl.nombre = 'Teziutlán'
        and (
          n.nivel = 'Maestría'
          or p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
        )
   );
  get diagnostics v_tocadas = row_count;

  -- El cinturón del cinturón: lo contado y lo escrito tienen que ser lo mismo.
  if v_tocadas <> v_maestrias + v_leip then
    raise exception 'Se contaron % filas y se escribieron %.',
      v_maestrias + v_leip, v_tocadas
      using errcode = 'data_exception';
  end if;

  raise notice
    'Reposición del 10 de octubre · maestrías de Teziutlán: % · LEIP de Teziutlán: % · total %',
    v_maestrias, v_leip, v_tocadas;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · Ninguna cohorte puede tener su reposición ANTES de su propia fecha
--
-- Hoy no pasa —la última fecha oficial es el 8 y las reposiciones son el 9 y el
-- 10— pero esta comprobación no es para hoy: es para el día que alguien mueva
-- una fecha del calendario y deje a una cohorte con una reposición que ya
-- quedó atrás. Esa persona vería «tu nueva fecha» señalando al pasado, que es
-- el defecto que `20260930140000` vino a cerrar, reaparecido por otra puerta.
--
-- Es un `warning` y no una excepción a propósito: las dos fechas son decisiones
-- de la organización y puede haber un motivo para una combinación rara. Lo que
-- no puede haber es que nadie se entere.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_general date;
  v_malas integer := 0;
begin
  select fecha_recuperacion_voucher into v_general
    from configuracion_evento where id = 1;

  for r in
    select p.nombre as programa, pl.nombre as sede, d.avance, d.grupo,
           d.fecha, coalesce(d.fecha_reposicion, v_general) as repone
      from dia_entrega_voucher d
      join programas p on p.id = d.programa_id
      join planteles pl on pl.id = d.plantel_id
     where coalesce(d.fecha_reposicion, v_general) < d.fecha
  loop
    v_malas := v_malas + 1;
    raise warning '% · % · módulo % grupo %: entrega el % y repone el %, que es ANTES.',
      r.programa, r.sede, r.avance, r.grupo, r.fecha, r.repone;
  end loop;

  if v_malas = 0 then
    raise notice 'Toda cohorte repone en una fecha posterior a la suya.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · La consulta lee la reposición de la cohorte
--
-- Se reescribe entera, como las veces anteriores: el cambio está en el `select`
-- del día —que ahora trae dos columnas— y en el `coalesce` que elige entre la
-- de la cohorte y la general. Leerla completa es más corto que leer un diff
-- mental, y es lo que evita perder una línea al copiar.
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
  v_suya date;
  v_reposicion date;
  v_hoy date;
  v_repuesta boolean := false;
  v_cuando text;
  v_grupo text;
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
  /*
   * Qué día es hoy EN MÉXICO, no en el servidor.
   *
   * La base corre en UTC. Entre las 18:00 y la medianoche hora de México,
   * `current_date` ya es el día siguiente allá arriba: de 18:00 a 23:59 del 8
   * de octubre, un `current_date` crudo diría 9 y daría por vencida la cita de
   * las ocho cohortes de LEIP que entregan ese mismo día, mientras la
   * ventanilla sigue abierta. Seis horas de diferencia que caen justo en las
   * horas de oficina de la tarde.
   */
  v_hoy := (now() at time zone 'America/Mexico_City')::date;

  select programa_id, plantel_id, avance, grupo
    into v_a
    from padron_alumnos
   where matricula = trim(p_matricula);

  -- Quien no está en el padrón no tiene cita, y no se le dice más: contestar
  -- distinto a una matrícula que existe y a otra que no es un enumerador.
  if not found then
    return null;
  end if;

  -- El padrón permite `grupo` nulo, y la tabla de días no: se normaliza a
  -- cadena vacía, que no empata con ninguna letra y por eso cae al comodín.
  v_grupo := upper(trim(coalesce(v_a.grupo, '')));

  /*
   * La fecha de la cohorte Y su reposición, en la misma consulta.
   *
   * Ésta es la razón por la que `fecha_reposicion` vive en esta tabla y no en
   * la configuración: la fila de esta persona ya se está resolviendo aquí, con
   * su comodín y su precedencia de grupo. Una columna aparte habría pedido una
   * segunda consulta y una condición escrita a mano que repetiría la regla.
   */
  select d.fecha, d.fecha_reposicion
    into v_fecha, v_suya
    from dia_entrega_voucher d
   where d.programa_id = v_a.programa_id
     and d.plantel_id = v_a.plantel_id
     and d.avance = v_a.avance
     and d.grupo in (v_grupo, '*')
   order by case when d.grupo = v_grupo then 0 else 1 end
   limit 1;

  if v_fecha is not null then
    /*
     * Si su día ya pasó, se le da el de reposición.
     *
     * `<=` y no `<`: el día de hoy también cuenta como pasado. Entre
     * pre-registrarse y entregar el voucher hay una ida al banco que no se puede
     * saltar, así que una cita para hoy, dicha hoy, es un plazo vencido con otro
     * nombre. Decidido el 2026-09-30.
     */
    if v_fecha <= v_hoy then
      /*
       * La de su cohorte si la tiene; si no, la general.
       *
       * Desde el 2026-10-01 son dos: el 10 de octubre para el posgrado y la
       * LEIP de Teziutlán —que lo traen en su propia fila— y el 9 para todos los
       * demás, que lo leen de aquí.
       */
      v_reposicion := coalesce(
        v_suya,
        (select fecha_recuperacion_voucher from configuracion_evento where id = 1)
      );

      /*
       * Si hasta la reposición quedó atrás, NO se enseña ninguna fecha.
       *
       * Devolver el 10 de octubre el día 20 sería repetir exactamente el defecto
       * que esto vino a arreglar, solo que con otra fecha. A esa altura el
       * pre-registro ya figura como `expirado` y el portal lo dice arriba del
       * todo, que es la información verdadera.
       */
      if v_reposicion is null or v_reposicion < v_hoy then
        return null;
      end if;

      v_fecha := v_reposicion;
      v_repuesta := true;
    end if;

    return jsonb_build_object(
      'cuando', format('%s %s de %s',
        v_dias[extract(dow from v_fecha)::int + 1],
        extract(day from v_fecha)::int,
        v_meses[extract(month from v_fecha)::int]),
      'estricto', true,
      -- La pantalla lo necesita para no fingir que esta fecha fue siempre la
      -- suya: a quien se le pasó el día hay que decírselo.
      'repuesta', v_repuesta
    );
  end if;

  -- El respaldo: la cita general de su cohorte. Con el calendario cargado esto
  -- solo se alcanza si alguien queda fuera de la tabla —un programa nuevo, una
  -- sede que nadie declaró—, y entonces un rango ancho es mejor que un hueco.
  --
  -- No se compara contra `v_hoy`: `citas_inscripcion.cuando` es texto libre
  -- —«28 y 29 de septiembre»— y no hay fecha que comparar. Inventar una a
  -- partir de la frase sería adivinar.
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

  return jsonb_build_object('cuando', v_cuando, 'estricto', false, 'repuesta', false);
end;
$$;

revoke all on function fn_cita_de_pago(text) from public, anon, authenticated;
grant execute on function fn_cita_de_pago(text) to anon, authenticated;

comment on function fn_cita_de_pago is
  'El día que le toca a esa matrícula ir a dejar su voucher. Compara contra HOY '
  'en hora de México: si su día ya pasó devuelve la reposición con `repuesta` en '
  'true —la de su cohorte si la declara, y si no la general— y si hasta ésa pasó '
  'no devuelve nada. Nunca enseña una fecha vencida.';
