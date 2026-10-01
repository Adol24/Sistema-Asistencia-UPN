-- =============================================================================
-- La cita que ya pasó no se le enseña a nadie
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260930140000_la_cita_que_ya_paso_se_repone`.
--
-- El defecto
-- ----------
-- `fn_cita_de_pago` devuelve la fecha que el calendario le asignó a esa
-- cohorte y no mira qué día es hoy. El calendario corre del 28 de septiembre al
-- 8 de octubre, así que desde el 29 hay cohortes cuya fecha ya quedó atrás.
--
-- Quien se pre-registra hoy, 30 de septiembre, siendo de Pedagogía 7.º lee en
-- su comprobante:
--
--     Tu inscripción: martes 29 de septiembre
--     Es ese día y solo ese: no puedes ir antes ni después.
--
-- Un día que pasó ayer, y una frase que le dice que no hay otro. El mensaje no
-- es que llegó tarde: es que no tiene nada que hacer. La persona cierra la
-- pestaña, y el sistema acaba de perder un pago que sí iba a entrar.
--
-- Son 32 grupos los que ya están en esa situación: los 4 del 28, los 14 del 29
-- y los 14 del 30.
--
-- La regla nueva
-- --------------
-- La organización fijó el **12 de octubre** como el día de reposición. Si la
-- fecha que le toca a esa cohorte ya pasó, se le enseña esa en su lugar, y
-- marcada como lo que es —una reposición— para que la pantalla no finja que
-- siempre fue su día.
--
-- Por qué `<=` y no `<`: el día de HOY también cuenta como pasado
-- ---------------------------------------------------------------
-- Parece más generoso dejar que quien tiene cita hoy siga viendo hoy, y es
-- peor. Entre pre-registrarse y entregar el voucher hay un paso que no se puede
-- saltar: **ir al banco**. Quien termina su registro a las once de la mañana no
-- va a depositar y volver a ventanilla el mismo día, y menos viniendo de
-- Huehuetla o de Caxhuacan. Una cita para hoy, dicha hoy, no es una cita: es un
-- plazo vencido con otro nombre.
--
-- El costo asumido es real y se nombra: quien ya tenía su voucher en la mano y
-- pensaba entregarlo hoy leerá el 12 de octubre. No pierde nada —esa fecha es
-- válida— pero el dinero entra doce días más tarde. A cambio, nadie lee una
-- fecha imposible.
--
-- La fecha límite se mueve, y NO es opcional
-- -------------------------------------------
-- `v_estado_pago` deriva `expirado` con `now() > fecha_limite` para quien no
-- tiene ningún pago registrado. Con el límite en el 9 de octubre y la
-- reposición en el 12, a esas 32 cohortes se las declararía expiradas **tres
-- días antes de su propia cita**: el torniquete las rechazaría el día del
-- evento por no haber entregado un voucher que el sistema todavía no les dejaba
-- entregar.
--
-- Así que el límite pasa al 12 de octubre a las 18:00, el mismo día de la
-- reposición y a la misma hora que tenía. Quien ya entregó no se ve afectado:
-- `expirado` solo alcanza a quien no tiene fila en `pagos`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · El día de reposición, que es una columna
-- ---------------------------------------------------------------------------
alter table configuracion_evento
  add column if not exists fecha_recuperacion_voucher date;

update configuracion_evento
   set fecha_recuperacion_voucher = coalesce(fecha_recuperacion_voucher, date '2026-10-12')
 where id = 1;

comment on column configuracion_evento.fecha_recuperacion_voucher is
  'El día al que se manda a quien se le pasó el suyo. Nulo significa «no hay '
  'reposición»: entonces a esa persona no se le enseña ninguna fecha, que es '
  'preferible a enseñarle una que ya pasó. Regla de la organización, 2026-09-30.';

-- ---------------------------------------------------------------------------
-- 2 · La fecha límite acompaña a la reposición
--
-- 18:00 hora de México, igual que tenía. Se escribe con el huso explícito y no
-- como texto suelto: el servidor corre en UTC, y `'2026-10-12 18:00'` sin huso
-- se guardaría seis horas antes de lo que dice.
-- ---------------------------------------------------------------------------
update configuracion_evento
   set fecha_limite = timestamptz '2026-10-12 18:00:00-06'
 where id = 1;

-- ---------------------------------------------------------------------------
-- 3 · La consulta, que ahora sí mira el calendario
--
-- Se reescribe entera y no se parchea, como la vez anterior: el cambio toca el
-- centro de la función y leerla completa es más corto que leer un diff mental.
-- Lo único nuevo son `v_hoy`, la comparación, y el tercer campo del resultado.
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

  select d.fecha
    into v_fecha
    from dia_entrega_voucher d
   where d.programa_id = v_a.programa_id
     and d.plantel_id = v_a.plantel_id
     and d.avance = v_a.avance
     and d.grupo in (v_grupo, '*')
   order by case when d.grupo = v_grupo then 0 else 1 end
   limit 1;

  if v_fecha is not null then
    /*
     * Lo nuevo del 2026-09-30: si su día ya pasó, se le da el de reposición.
     *
     * `<=` y no `<` a propósito; la razón está en la cabecera. Entre registrarse
     * y entregar hay una ida al banco, así que una cita para hoy, dicha hoy, no
     * es una cita.
     */
    if v_fecha <= v_hoy then
      select fecha_recuperacion_voucher into v_reposicion
        from configuracion_evento where id = 1;

      /*
       * Si hasta la reposición quedó atrás, NO se enseña ninguna fecha.
       *
       * Devolver el 12 de octubre el día 20 sería repetir exactamente el
       * defecto que esta migración arregla, solo que con otra fecha. A esa
       * altura el pre-registro ya figura como `expirado` y el portal lo dice
       * arriba del todo, que es la información verdadera.
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
      -- El tercer campo. La pantalla lo necesita para no fingir que esta fecha
      -- fue siempre la suya: a quien se le pasó el día hay que decírselo.
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
  'El día que le toca a esa matrícula ir a dejar su voucher. Desde el '
  '2026-09-30 compara contra HOY en hora de México: si su día ya pasó devuelve '
  'el de reposición con `repuesta` en true, y si hasta ese pasó no devuelve '
  'nada. Nunca enseña una fecha vencida.';

-- ---------------------------------------------------------------------------
-- 4 · Qué quedó puesto
--
-- Un `raise notice` y no una comprobación que falle: las dos fechas son
-- decisiones de la organización, no invariantes. Lo que hace falta es poder
-- leerlas en la salida de la corrida sin ir a consultarlas aparte.
-- ---------------------------------------------------------------------------
do $$
declare
  v_cfg record;
  v_atrasadas integer;
begin
  select fecha_limite, fecha_recuperacion_voucher into v_cfg
    from configuracion_evento where id = 1;

  select count(*) into v_atrasadas
    from dia_entrega_voucher
   where fecha <= (now() at time zone 'America/Mexico_City')::date;

  raise notice 'Reposición: %  ·  límite: %', v_cfg.fecha_recuperacion_voucher, v_cfg.fecha_limite;
  raise notice 'Filas del calendario ya vencidas hoy: % (a esas cohortes se les enseña la reposición)',
    v_atrasadas;
end;
$$;
