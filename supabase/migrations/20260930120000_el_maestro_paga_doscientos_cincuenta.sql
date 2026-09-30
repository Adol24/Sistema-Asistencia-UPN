-- =============================================================================
-- El maestro paga 250, y el taller le va incluido
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260930120000_el_maestro_paga_doscientos_cincuenta`.
--
-- Qué cambia
-- ----------
-- Hasta hoy había UN precio para todos: `configuracion_evento.cuota_evento`,
-- que vale 500. El docente que quería constancia pagaba esos 500 más el costo
-- de su taller; el que no la quería no pagaba nada.
--
-- La organización fijó el 2026-09-30 una cuota propia para el maestro: 250, y
-- con el taller incluido. Las dos respuestas del docente quedan así:
--
--   ┌───────────────────────────────┬─────────┬────────┐
--   │ El docente dice…              │ Evento  │ Taller │
--   ├───────────────────────────────┼─────────┼────────┤
--   │ «sí quiero constancia»        │ 250     │ 0      │  ← antes 500 + 100
--   │ «no, solo voy a asistir»      │ 0       │ 0      │  ← igual que ayer
--   └───────────────────────────────┴─────────┴────────┘
--
-- El alumno y el externo NO se tocan: siguen en `cuota_evento` más el costo de
-- su taller. La exención de ayer tampoco se toca, y `chk_exento_solo_docente`
-- sigue siendo el que impide que un alumno la use.
--
-- Por qué una columna y no un 250 escrito en la función
-- -----------------------------------------------------
-- Por la misma razón por la que `cuota_evento` es una columna: administración
-- cambia las cuotas, y ya cambió esta una vez. Escrita en el cuerpo de tres
-- funciones, el siguiente ajuste vuelve a ser una migración y el panel sigue
-- enseñando un solo importe que ya no es el de todos. `cuota_docente` se edita
-- desde `/admin/configuracion` al lado de la otra.
--
-- El valor por omisión es 250 y no `cuota_evento`: una columna nueva que naciera
-- valiendo 500 no se notaría rota —todo seguiría igual— hasta que alguien
-- revisara por qué los maestros siguen pagando de más.
--
-- Qué pasa con los docentes ya pre-registrados
-- --------------------------------------------
-- Se les baja el importe, pero SOLO a quien todavía no ha depositado. Ver el
-- apartado 5: quien ya entregó voucher es de Servicios Financieros, y
-- reescribirle el esperado por debajo le convertiría un pago correcto en una
-- discrepancia sin que nadie lo hubiera tocado.
--
-- Las tres funciones se copian enteras de `20260929180000` y `20260929130000`
-- —`create or replace` necesita el cuerpo completo— y lo único que cambia en
-- cada una son las dos expresiones del importe. Están marcadas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La cuota del maestro, que es una columna
-- ---------------------------------------------------------------------------
alter table configuracion_evento
  add column if not exists cuota_docente numeric(10, 2) not null default 250.00
    check (cuota_docente >= 0);

comment on column configuracion_evento.cuota_docente is
  'Lo que paga el docente de la UPN U-212 que quiere constancia, y le incluye el '
  'taller. El alumno y el externo no la usan: ellos van por `cuota_evento` más el '
  'costo de su taller. Regla de la organización, 2026-09-30.';

-- El valor por omisión cubre la fila que ya existe, pero decirlo explícitamente
-- deja la cifra en la migración y no solo en el `default`: quien lea esto
-- dentro de un mes no tiene que ir al catálogo de columnas a saber con qué se
-- arrancó.
update configuracion_evento set cuota_docente = 250.00 where id = 1;

-- ---------------------------------------------------------------------------
-- 2 · «¿Quieres constancia?» traducida a importes
--
-- Se conserva palabra por palabra de `20260929130000` salvo el `update` final,
-- que ahora pregunta también por el perfil.
-- ---------------------------------------------------------------------------
create or replace function fn_sincronizar_exencion(
  p_participante uuid,
  p_quiere_constancia boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_quiere boolean := coalesce(p_quiere_constancia, true);
begin
  select * into v_p from participantes where id = p_participante;
  if v_p is null then
    raise exception 'Ese participante no existe' using errcode = 'no_data_found';
  end if;

  if not v_quiere and v_p.perfil <> 'docente' then
    raise exception 'Solo los docentes pueden registrarse sin pagar la cuota'
      using errcode = 'check_violation';
  end if;

  /*
   * Si la respuesta no cambió, no se toca nada. Y esto NO es una optimización.
   *
   * El alta es reentrante: esa persona vuelve a pasar por aquí cada vez que
   * retrocede en el recorrido. Sin esta salida, cada vuelta reescribiría
   * `monto_esperado_evento` con la cuota de HOY, así que a quien se registró con
   * 500 y vuelve después de que administración la subiera a 600 se le cambiaría
   * el precio por haber pulsado «atrás». Aquí solo se sincroniza lo que la
   * persona cambió, que es lo único que esta función sabe.
   *
   * Es también la razón por la que el ajuste del 2026-09-30 necesita el `update`
   * del apartado 5: a los docentes que ya respondieron y no van a volver a
   * responder, esta función no les llega nunca.
   */
  if v_p.quiere_constancia = v_quiere then
    return;
  end if;

  if exists (select 1 from pagos where participante_id = p_participante) then
    return;
  end if;

  update participantes
     set quiere_constancia = v_quiere,
         /*
          * ↓ LO QUE CAMBIA EL 2026-09-30 ↓
          *
          * Tres casos y no dos. El maestro tiene cuota propia, así que ya no
          * basta con preguntar si quiere constancia: hay que preguntar también
          * quién es. El externo cae en el `else` y sigue exactamente igual —él
          * nunca pudo responder que no, lo impide `chk_exento_solo_docente`—.
          */
         monto_esperado_evento = case
           when not v_quiere then 0
           when v_p.perfil = 'docente' then
             (select cuota_docente from configuracion_evento where id = 1)
           else (select cuota_evento from configuracion_evento where id = 1)
         end,
         /*
          * Al docente el taller le va incluido en su cuota, quiera constancia o
          * no. Antes el cero era solo del exento; ahora es de todo maestro.
          *
          * El nulo significa «no lleva taller» y hay que conservarlo:
          * `chk_monto_taller` exige que el taller y su monto vayan juntos.
          */
         monto_esperado_taller = case
           when taller_id is null then null
           when not v_quiere then 0
           when v_p.perfil = 'docente' then 0
           else (select t.costo from talleres t where t.id = taller_id)
         end
   where id = p_participante;
end;
$$;

comment on function fn_sincronizar_exencion is
  'Traduce «¿quieres constancia?» a los dos montos esperados. La llaman las dos '
  'vueltas reentrantes del alta de docente y externo. Desde el 2026-09-30 el '
  'docente va por `cuota_docente` y su taller le sale en cero. No toca a quien ya '
  'depositó: eso es de Servicios Financieros.';

revoke all on function fn_sincronizar_exencion(uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Cambiar de taller no le pone precio al taller del maestro
--
-- Se conserva palabra por palabra de `20260929180000` salvo el `update` final.
-- ---------------------------------------------------------------------------
create or replace function fn_cambiar_taller(p_participante uuid, p_taller uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_costo numeric(10, 2);
begin
  select * into v_p from participantes where id = p_participante;
  if v_p is null then
    raise exception 'Ese participante no existe' using errcode = 'no_data_found';
  end if;

  -- Sin cambio no hay nada que hacer, y decirlo aquí evita comprobar el resto.
  -- Va ANTES de la guardia del depósito a propósito: el alta del pre-registro es
  -- reentrante y vuelve a pasar por aquí con el mismo taller que la persona ya
  -- tiene. Comprobar el pago primero convertiría ese «no cambia nada» en un
  -- error para todo el que ya hubiera depositado.
  if v_p.taller_id is not distinct from p_taller then
    return;
  end if;

  /*
   * Cualquier depósito cierra el taller, no solo el del taller.
   *
   * Antes esto decía `and concepto = 'taller'`, y por ahí se colaba el caso que
   * importa: quien ya depositó los 500 del evento tiene una fila con
   * `concepto = 'evento'`, así que la comprobación no lo veía y se le podía
   * añadir un taller que nadie iba a cobrarle.
   *
   * Y el depósito es uno solo desde el 2026-09-25: el concepto que escribió a
   * mano en su hoja dice si lleva taller o no. Cambiárselo después no le
   * modifica una cifra, le invalida el papel que ya entregó en ventanilla.
   */
  if exists (select 1 from pagos where participante_id = p_participante) then
    raise exception
      'Ya tienes un depósito registrado, y el taller va en ese mismo depósito. '
      'Para cambiarlo acude a Servicios Financieros'
      using errcode = 'check_violation';
  end if;

  if p_taller is null then
    -- `chk_monto_taller` exige que el taller y su monto vayan juntos: o los dos
    -- puestos, o los dos nulos.
    update participantes
       set taller_id = null, monto_esperado_taller = null
     where id = p_participante;
    return;
  end if;

  select costo into v_costo from talleres where id = p_taller and activo;
  if v_costo is null then
    raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
  end if;

  -- El cupo del taller. Ver `fn_exigir_lugar_en_taller`.
  -- El perfil va como argumento desde el 2026-09-29, y aquí sale de la ficha:
  -- este es el camino del panel —`fn_asignar_taller` delega aquí— y también el de
  -- las dos altas cuando alguien retrocede y cambia de taller.
  perform fn_exigir_lugar_en_taller(p_taller, v_p.perfil);

  /*
   * ↓ LO QUE CAMBIA EL 2026-09-30 ↓
   *
   * El taller del maestro vale cero, responda lo que responda.
   *
   * Esta línea decía `case when v_p.quiere_constancia then v_costo else 0 end`:
   * cubría al exento —lo puso el 2026-09-29— pero no al docente que sí quiere
   * constancia, que a partir de hoy tiene el taller incluido en sus 250. Sin
   * esta condición le bastaba cambiar de taller para que el catálogo le pusiera
   * los 100 encima y llegara al banco con un importe que la base no espera.
   *
   * Cero y no nulo: `chk_monto_taller` exige que el taller y su monto vayan de
   * la mano, y el nulo significa «no lleva taller», no «no lo paga».
   */
  update participantes
     set taller_id = p_taller,
         monto_esperado_taller = case
           when v_p.perfil = 'docente' then 0
           when not v_p.quiere_constancia then 0
           else v_costo
         end
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller y reescribe su monto. Al docente le pone cero desde el '
  '2026-09-30: el taller le va incluido en `cuota_docente`. Cualquier depósito '
  'registrado lo cierra, porque el taller viaja en ese mismo depósito.';

-- ---------------------------------------------------------------------------
-- 4 · El alta del docente y del externo
--
-- Se conserva palabra por palabra de `20260929180000` salvo los dos importes
-- del `insert`.
-- ---------------------------------------------------------------------------
create or replace function fn_preregistrar_externo(
  p_perfil text,
  p_nombre text,
  p_correo text,
  p_celular text,
  p_institucion text,
  p_dia smallint,
  p_acepto_aviso boolean,
  p_taller uuid default null,
  /*
   * La respuesta a «¿quieres constancia?», que solo se le pregunta al docente.
   *
   * Trae `true` por omisión, y el valor por omisión es el que COBRA: si un
   * llamador viejo no manda nada, esa persona queda con su cuota de siempre.
   * Al revés —exento por omisión— un cliente sin actualizar dejaría entrar
   * gratis a todo el mundo, y eso no se nota hasta el torniquete.
   */
  p_quiere_constancia boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cfg record;
  v_folio text;
  v_id uuid;
  v_costo numeric(10, 2);
  v_perfil perfil_participante;
  v_correo text;
  v_dominio text;
  v_ya record;
  v_cupo integer;
  v_ocupados integer;
  v_quiere boolean := coalesce(p_quiere_constancia, true);
begin
  if p_acepto_aviso is not true then
    raise exception 'Hay que aceptar el aviso de privacidad para continuar'
      using errcode = 'check_violation';
  end if;

  if p_perfil not in ('docente', 'externo') then
    raise exception 'Este registro es solo para docentes y externos'
      using errcode = 'check_violation';
  end if;
  v_perfil := p_perfil::perfil_participante;

  /*
   * La exención es SOLO del docente.
   *
   * La regla del 2026-09-29 habla de los maestros, y el externo paga igual que
   * antes. `chk_exento_solo_docente` lo vuelve a decir en la tabla y ese es el
   * que manda; esto existe para que el mensaje diga qué pasó en vez de un
   * «violación de restricción».
   */
  if not v_quiere and v_perfil <> 'docente' then
    raise exception 'Solo los docentes pueden registrarse sin pagar la cuota'
      using errcode = 'check_violation';
  end if;
  v_correo := lower(trim(p_correo));

  /*
   * Las dos puertas que le cierran este formulario a un alumno.
   *
   * Van antes de la búsqueda reentrante a propósito: no se trata de si esta
   * persona ya pasó por aquí, sino de que no debería estar aquí. Y van antes de
   * cualquier escritura, así que un intento no deja rastro.
   */
  if exists (select 1 from participantes where correo = v_correo and perfil = 'alumno') then
    raise exception
      'Ese correo ya está registrado como alumno. Entra por «Soy alumno de la universidad» '
      'con tu matrícula; si crees que es un error, escríbenos.'
      using errcode = 'check_violation';
  end if;

  -- Escalar y no `v_cfg`, porque la configuración completa se lee más abajo y
  -- solo en el camino que de verdad inserta.
  v_dominio := nullif(
    trim(coalesce((select dominio_institucional from configuracion_evento where id = 1), '')),
    ''
  );
  if v_dominio is not null and v_correo like '%@' || lower(v_dominio) then
    raise exception
      'Ese correo es una cuenta de alumno. Entra por «Soy alumno de la universidad» con tu '
      'matrícula.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_institucion), '') = '' then
    raise exception 'Falta la institución' using errcode = 'check_violation';
  end if;

  -- ¿Ya se pre-registró? Entonces esto es una vuelta atrás, no un alta nueva.
  -- `order by creado_en` importa: un fallo anterior ya pudo dejar duplicados, y
  -- ante varios se elige el PRIMERO, que es el folio que esa persona llegó a ver.
  select id, folio, dia into v_ya
    from participantes
   where correo = v_correo and perfil = v_perfil
   order by creado_en
   limit 1;
  if v_ya.id is not null then
    perform fn_cambiar_taller(v_ya.id, p_taller);
    perform fn_sincronizar_exencion(v_ya.id, v_quiere);
    update participantes
       set acepto_aviso_en = coalesce(acepto_aviso_en, now())
     where id = v_ya.id;
    return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end if;

  select * into v_cfg from configuracion_evento where id = 1;

  -- El taller ya no se comprueba contra `p_dia`: puede ser de otro día. Lo
  -- único que se le exige es existir y estar activo.
  if p_taller is not null then
    select costo into v_costo from talleres where id = p_taller and activo;
    if v_costo is null then
      raise exception 'Ese taller no está disponible' using errcode = 'no_data_found';
    end if;
  end if;

  -- ------------------------------------------------------------- el aforo ---
  -- A esta persona sí se le puede decir «elige otro día», porque el día lo
  -- eligió ella. No hay reparto que respetar.
  perform pg_advisory_xact_lock(20260919, p_dia::integer);

  select d.cupo, count(p.id)
    into v_cupo, v_ocupados
    from dias_evento d
    left join participantes p on p.dia = d.dia
   where d.dia = p_dia
   group by d.cupo;

  if v_ocupados >= v_cupo then
    raise exception 'El día % ya no tiene lugares disponibles. Elige otro día.', p_dia
      using errcode = 'check_violation';
  end if;

  -- El cupo del taller, que hasta ahora no lo comprobaba nadie. Ver
  -- `fn_exigir_lugar_en_taller`: si no hay taller elegido, no hace nada.
  -- El perfil va como argumento desde el 2026-09-29. `v_perfil` ya está validado
  -- arriba: solo puede ser `docente` o `externo`, y el externo cuenta dentro del
  -- tope del alumno.
  perform fn_exigir_lugar_en_taller(p_taller, v_perfil);

  -- El cierre de la carrera que puso la 39: si otra petición se adelantó entre
  -- la búsqueda de arriba y este insert, se relee su fila y se devuelve su folio.
  begin
    insert into participantes (
      perfil, matricula, nombre, correo, celular, institucion,
      nivel_id, programa_id, avance, grupo, plantel_id,
      dia, taller_id, monto_esperado_evento, monto_esperado_taller,
      acepto_aviso_en, quiere_constancia
    )
    values (
      v_perfil, null, upper(trim(p_nombre)), v_correo, trim(p_celular),
      trim(p_institucion),
      null, null, null, null, null,
      p_dia, p_taller,
      /*
       * ↓ LO QUE CAMBIA EL 2026-09-30 ↓
       *
       * Los dos importes del maestro, que ya no son los de todos. Su cuota es
       * `cuota_docente` y le incluye el taller, así que el segundo caso es cero
       * incluso cuando sí quiere constancia. El externo cae en el `else` de
       * ambos y sigue pagando `cuota_evento` más el costo de su taller.
       *
       * `chk_monto_taller` exige que el taller y su monto vayan de la mano, así
       * que sin taller elegido el monto sigue nulo, no cero.
       */
      case
        when not v_quiere then 0
        when v_perfil = 'docente' then v_cfg.cuota_docente
        else v_cfg.cuota_evento
      end,
      case
        when v_costo is null then null
        when not v_quiere then 0
        when v_perfil = 'docente' then 0
        else v_costo
      end,
      now(), v_quiere
    )
    returning id, folio into v_id, v_folio;
  exception
    when unique_violation then
      select id, folio, dia into v_ya
        from participantes
       where correo = v_correo and perfil = v_perfil
       order by creado_en
       limit 1;
      if v_ya.id is null then
        raise;
      end if;
      perform fn_cambiar_taller(v_ya.id, p_taller);
      perform fn_sincronizar_exencion(v_ya.id, v_quiere);
      update participantes
         set acepto_aviso_en = coalesce(acepto_aviso_en, now())
       where id = v_ya.id;
      return jsonb_build_object('id', v_ya.id, 'folio', v_ya.folio, 'dia', v_ya.dia);
  end;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', format('Pre-registró a un %s', p_perfil),
          format('%s · %s · día %s (día elegido por la persona, quedan %s lugares)',
                 v_folio, upper(trim(p_nombre)), p_dia, v_cupo - v_ocupados - 1));

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'dia', p_dia);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5 · Los docentes que ya se pre-registraron
--
-- `fn_sincronizar_exencion` no les va a llegar: sale temprano cuando la
-- respuesta no cambia, y la de ellos no va a cambiar. Sin este `update` se
-- quedarían con 500 esperados y verían 250 en pantalla —o al revés, según qué
-- se desplegara primero—, y ventanilla les marcaría discrepancia a todos.
--
-- La guarda es `not exists (… pagos …)`, la MISMA que usan las otras dos
-- funciones, y por la misma razón: a quien ya entregó voucher no se le mueve el
-- esperado por debajo. Un depósito de 500 correcto contra un esperado que
-- acabara de bajar a 250 saldría en `discrepancia`, y esa persona tendría que ir
-- a Servicios Financieros a arreglar algo que hizo bien.
--
-- Si a esos pocos hay que devolverles la diferencia, es una decisión de la
-- organización y se toma con nombres delante, no en una migración.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ajustados integer;
begin
  with recalculados as (
    update participantes p
       set monto_esperado_evento = case
             when p.quiere_constancia then
               (select cuota_docente from configuracion_evento where id = 1)
             else 0
           end,
           -- Cero para todo maestro con taller, nulo para el que no lleva
           -- ninguno: `chk_monto_taller` no admite la tercera combinación.
           monto_esperado_taller = case when p.taller_id is null then null else 0 end
     where p.perfil = 'docente'
       and not exists (select 1 from pagos g where g.participante_id = p.id)
    returning 1
  )
  select count(*) into v_ajustados from recalculados;

  if v_ajustados > 0 then
    insert into bitacora (usuario_texto, accion, detalle)
    values ('Migración 20260930120000', 'Ajustó la cuota de los docentes',
            format('%s docentes sin depósito pasaron a la cuota de maestro '
                   '(taller incluido). A los que ya depositaron no se les tocó.',
                   v_ajustados));
  end if;

  raise notice 'Docentes reajustados a la cuota de maestro: %', v_ajustados;
end;
$$;
