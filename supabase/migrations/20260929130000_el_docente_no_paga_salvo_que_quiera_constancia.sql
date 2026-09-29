-- =============================================================================
-- El docente no paga, salvo que quiera constancia
--
-- Esta migración es
-- `20260929130000_el_docente_no_paga_salvo_que_quiera_constancia`.
--
-- EXIGE que `20260929120000_un_estado_de_pago_para_quien_no_debe_nada` ya esté
-- aplicada, EN UNA CORRIDA APARTE. La primera sentencia de aquí lo comprueba y
-- se detiene con instrucciones si falta. Postgres no deja añadir un valor a un
-- enum y usarlo en la misma transacción; por eso son dos archivos.
--
-- La regla, tal como la dio la organización el 2026-09-29
-- -------------------------------------------------------
-- Al MAESTRO el evento le sale gratis, y el taller también. Si quiere
-- constancia, paga igual que todos —cuota del evento más el taller que haya
-- elegido—. Y si no la quiere, entra gratis y **ya no tiene que traer voucher**.
--
-- Hay que preguntárselo, así que la pregunta existe: `/registro` la hace justo
-- debajo del botón «docente», y su respuesta viaja en el borrador hasta el alta.
--
-- Qué NO cambia, y es la mitad de la regla
-- ----------------------------------------
-- `v_elegibles` sigue exigiendo `estado = 'pagado'`. Un exento entra al evento y
-- **no aparece en el listado de constancias**, que es exactamente lo que la
-- organización pidió. Las dos mitades de la regla viven en dos sitios distintos
-- a propósito: la puerta la decide `fn_evaluar_escaneo` y el documento
-- `v_elegibles`, y separarlas es lo que impide que una concesión en la entrada
-- se convierta en un documento regalado.
--
-- Dónde queda escrita la exención
-- -------------------------------
-- En DOS sitios, y cada uno contesta una pregunta distinta:
--
--   · `participantes.quiere_constancia` · la RESPUESTA de esa persona. Es el
--     dato que se le preguntó, y el que un reporte necesita.
--   · `monto_esperado_evento` / `monto_esperado_taller` en cero · lo que DEBE.
--     Es lo que miran las vistas, y por eso `v_estado_pago` no necesita saber
--     por qué debe cero: le basta que deba cero y que no haya depositado.
--
-- `fn_sincronizar_exencion` es la única que traduce de la primera a los
-- segundos, así que no pueden separarse por dos caminos distintos.
--
-- El hueco que esto NO cierra, y hay que decirlo
-- ----------------------------------------------
-- `/registro` no comprueba que nadie sea docente. La comprobación del dominio es
-- letra muerta —`dominio_institucional` está vacío en producción— y la única
-- barrera real es que el correo no sea de un alumno ya registrado, que un Gmail
-- cualquiera esquiva. Hasta hoy marcar «docente» solo evitaba las dos
-- evidencias; a partir de hoy **vale dinero**. Sin padrón de docentes, quien
-- quiera entrar gratis solo tiene que decir que es maestro.
--
-- Queda dicho aquí porque el riesgo lo crea esta migración, no porque se
-- resuelva en ella: el padrón de docentes es una decisión de la organización.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0 · Que la anterior esté puesta
--
-- Leer el catálogo sí se puede en esta transacción; lo que Postgres prohíbe es
-- USAR el valor nuevo en la misma. Este bloque solo lo lee, y es el que atrapa
-- el error fácil: pegar los dos archivos de una vez.
-- ---------------------------------------------------------------------------
do $bloque$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'estado_pago' and e.enumlabel = 'exento'
  ) then
    raise exception
      'Falta el valor «exento» en el tipo estado_pago. Aplica primero, y en una '
      'corrida APARTE, 20260929120000_un_estado_de_pago_para_quien_no_debe_nada.sql';
  end if;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- 1 · La respuesta, guardada
--
-- `not null default true`, y no nulable: «no se le preguntó» y «dijo que no» no
-- pueden parecer lo mismo, porque uno cobra y el otro no. Todo el que ya está
-- registrado queda con `true`, que es lo que se le cobró.
-- ---------------------------------------------------------------------------
alter table participantes
  add column if not exists quiere_constancia boolean not null default true;

comment on column participantes.quiere_constancia is
  'La respuesta a «¿quieres constancia?», que solo se le pregunta al docente. '
  'En false su cuota es cero y la puerta lo admite como exento, pero v_elegibles '
  'lo deja fuera del listado de constancias. Regla de la organización, 2026-09-29.';

-- Solo el docente puede quedar exento. El externo paga igual que antes, y el
-- alumno nunca entró en esta regla.
alter table participantes drop constraint if exists chk_exento_solo_docente;
alter table participantes add constraint chk_exento_solo_docente
  check (quiere_constancia or perfil = 'docente');

comment on constraint chk_exento_solo_docente on participantes is
  'La exención es del maestro. Un alumno o un externo con quiere_constancia en '
  'false entraría gratis por una regla que no es la suya.';

-- ---------------------------------------------------------------------------
-- 2 · El estado de pago de quien no debe nada
--
-- La rama nueva va ANTES de la de `fecha_limite`, y el orden es la mitad del
-- arreglo: puesta después, el 9 de octubre a las 18:00 todo exento pasaría a
-- `expirado` y el torniquete lo rechazaría el día del evento. No tiene fecha
-- límite quien no tiene nada que entregar.
--
-- Y va DESPUÉS de las tres ramas que dependen de `pagos`: si esa persona
-- depositó de todos modos, manda el depósito. Un exento que deposita 500 sale
-- en `discrepancia` —cero esperado contra 500 recibido— y eso es correcto: hay
-- dinero suyo en la cuenta y lo resuelve Servicios Financieros, no esta vista.
--
-- `monto_esperado_taller` no puede ser nulo en la fila del taller: el `where` de
-- abajo solo la produce cuando hay `taller_id`, y `chk_monto_taller` exige que
-- los dos vayan juntos.
--
-- `p.monto_esperado_*` se lee sin agregar porque el `group by p.id` agrupa por la
-- clave primaria de `participantes`, y Postgres reconoce esa dependencia
-- funcional.
--
-- Si algún día `cuota_evento` fuera cero, TODO el mundo saldría exento. No es un
-- descuido: sería cierto, el evento sería gratis para todos, y la constancia
-- seguiría exigiendo `pagado` en `v_elegibles`.
--
-- **SIN `security_invoker`, a propósito.** Lo dice el comentario de abajo desde
-- `20260910100000`: es la única forma de que el capturista de la puerta sepa
-- quién pagó sin poder leer importes ni referencias. Marcarla dejaría el
-- torniquete en rojo para todo el mundo.
-- ---------------------------------------------------------------------------
create or replace view v_estado_pago as
select
  p.id as participante_id,
  c.concepto,
  case
    when bool_or(g.resultado = 'discrepancia') then 'discrepancia'::estado_pago
    when bool_or(g.resultado = 'pagado') then 'pagado'::estado_pago
    when count(g.id) > 0 then 'comprobante_recibido'::estado_pago
    when (
      case c.concepto
        when 'evento' then p.monto_esperado_evento
        else p.monto_esperado_taller
      end
    ) = 0 then 'exento'::estado_pago
    when now() > e.fecha_limite then 'expirado'::estado_pago
    else 'pre_registrado'::estado_pago
  end as estado
from participantes p
cross join (values ('evento'::concepto_pago), ('taller'::concepto_pago)) as c (concepto)
cross join configuracion_evento e
left join pagos g on g.participante_id = p.id and g.concepto = c.concepto
where c.concepto = 'evento' or p.taller_id is not null
group by p.id, c.concepto, e.fecha_limite;

comment on view v_estado_pago is
  'El estado de pago no se guarda: se deriva. Deliberadamente SIN '
  'security_invoker: es la única forma de que el capturista sepa quién pagó sin '
  'poder leer importes ni referencias; cambiarlo deja la puerta en rojo para '
  'todos. Desde el 2026-09-29 devuelve «exento» cuando no debe nada y no ha '
  'depositado, que es el maestro que no quiere constancia.';

-- ---------------------------------------------------------------------------
-- 3 · La única que traduce la respuesta a importes
--
-- Existe porque `fn_preregistrar_externo` es REENTRANTE y vuelve a pasar por el
-- mismo participante cada vez que esa persona retrocede en el recorrido. El
-- maestro puede cambiar de opinión, y si eso no se refleja aquí se queda con la
-- cuota —o con la exención— de su primera vuelta.
--
-- `fn_cambiar_taller` sale temprano cuando el taller no cambia, así que no puede
-- ser el sitio donde se recalculan los importes: haría falta cambiar de taller
-- para cambiar de respuesta. Esta recalcula los DOS, mire o no el taller.
--
-- Con un depósito registrado no toca nada. El dinero ya entró, el papel ya se
-- entregó en ventanilla, y quien lo devuelve o lo reasigna es Servicios
-- Financieros. Volverle la cuota a cero aquí dejaría su depósito en
-- `discrepancia` sin que nadie lo hubiera pedido.
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
   * `monto_esperado_evento` con la `cuota_evento` de HOY, así que a quien se
   * registró con 500 y vuelve después de que administración la subiera a 600 se le
   * cambiaría el precio por haber pulsado «atrás». Aquí solo se sincroniza lo que
   * la persona cambió, que es lo único que esta función sabe.
   */
  if v_p.quiere_constancia = v_quiere then
    return;
  end if;

  if exists (select 1 from pagos where participante_id = p_participante) then
    return;
  end if;

  update participantes
     set quiere_constancia = v_quiere,
         monto_esperado_evento = case
           when v_quiere then (select cuota_evento from configuracion_evento where id = 1)
           else 0
         end,
         -- El nulo significa «no lleva taller» y hay que conservarlo:
         -- `chk_monto_taller` exige que el taller y su monto vayan juntos.
         monto_esperado_taller = case
           when taller_id is null then null
           when v_quiere then (select t.costo from talleres t where t.id = taller_id)
           else 0
         end
   where id = p_participante;
end;
$$;

comment on function fn_sincronizar_exencion is
  'Traduce «¿quieres constancia?» a los dos montos esperados. La llaman las dos '
  'vueltas reentrantes del alta de docente y externo. No toca a quien ya '
  'depositó: eso es de Servicios Financieros.';

-- Cerrada a todo el mundo: la llama el alta, que es `security definer` y corre
-- como el dueño.
revoke all on function fn_sincronizar_exencion(uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · El taller también sale gratis
--
-- Se conserva palabra por palabra de `20260926160000` salvo el `update` final.
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
  perform fn_exigir_lugar_en_taller(p_taller);

  /*
   * El monto del taller respeta la exención del docente.
   *
   * Esta línea decía `monto_esperado_taller = v_costo` y era la vía por la que
   * un maestro exento volvía a deber dinero sin tocar nada: le basta cambiar de
   * taller —o que el alta reentrante pase por aquí— para que el catálogo le
   * ponga los 100 encima. La organización eximió el evento Y el taller juntos.
   *
   * Cero y no nulo: `chk_monto_taller` exige que el taller y su monto vayan de
   * la mano, y el nulo significa «no lleva taller», no «no lo paga».
   */
  update participantes
     set taller_id = p_taller,
         monto_esperado_taller = case when v_p.quiere_constancia then v_costo else 0 end
   where id = p_participante;
end;
$$;

comment on function fn_cambiar_taller is
  'Cambia el taller de un participante. Desde la migración 60 no comprueba que '
  'se imparta su día; desde la 66 cualquier depósito registrado lo cierra. Desde '
  'el 2026-09-29 el monto del taller respeta la exención del maestro.';

-- Sigue cerrada a todo el mundo: la llaman las dos altas del pre-registro y,
-- desde aquí, `fn_asignar_taller`. Las tres son `security definer` y corren como
-- el dueño, así que no necesitan concesión.
revoke all on function fn_cambiar_taller(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · El alta, con la pregunta dentro
--
-- Se conserva palabra por palabra de `20260923140000` salvo lo que toca la
-- exención: el parámetro, la guardia del perfil, los importes del insert y las
-- dos llamadas a `fn_sincronizar_exencion` en los dos caminos reentrantes.
--
-- **Hay que TIRAR la firma de ocho parámetros.** Añadir uno con valor por
-- omisión crea una función NUEVA y deja viva la anterior; el cliente que llame
-- con ocho argumentos recibiría «function is not unique», y el que llame con la
-- vieja a propósito se saltaría la pregunta. El mismo error que
-- `20260917140000` dejó documentado con su comprobación de unicidad.
-- ---------------------------------------------------------------------------
drop function if exists fn_preregistrar_externo(
  text, text, text, text, text, smallint, boolean, uuid
);

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
  perform fn_exigir_lugar_en_taller(p_taller);

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
      -- Los dos importes a la vez: el evento y el taller le salen gratis juntos,
      -- porque la organización los eximió juntos. `chk_monto_taller` exige que
      -- el taller y su monto vayan de la mano, así que sin taller sigue nulo.
      case when v_quiere then v_cfg.cuota_evento else 0 end,
      case when v_costo is null then null when v_quiere then v_costo else 0 end,
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

-- Las concesiones se rehacen: la función es NUEVA —otra firma— así que trae las
-- de por defecto y no las de su antecesora. Mismo bloque que `20260917120000`.
do $bloque$
declare
  r record;
begin
  for r in
    select oid::regprocedure as firma
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'fn_preregistrar_externo'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    execute format('grant execute on function %s to anon, authenticated', r.firma);
    raise notice 'Concedida solo a anon y authenticated: %', r.firma;
  end loop;
end;
$bloque$;

comment on function fn_preregistrar_externo is
  'Alta de docente o externo, reentrante. Desde el 2026-09-29 recibe '
  'p_quiere_constancia: en false el maestro queda exento del evento y del '
  'taller, y la puerta lo admite sin voucher. Solo el docente puede.';

-- Debe quedar exactamente una de cada. Si salen más, quedó viva la firma de
-- ocho parámetros y el pre-registro se podría hacer sin contestar la pregunta.
do $bloque$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('fn_preregistrar_alumno', 'fn_preregistrar_externo');
  if v_n <> 2 then
    raise exception 'Se esperaban 2 funciones de alta y hay %. Quedó una firma vieja viva.', v_n;
  end if;
end;
$bloque$;

-- ---------------------------------------------------------------------------
-- 6 · El torniquete admite al exento
--
-- Se conserva palabra por palabra de `20260923040000` salvo la guardia del pago.
-- ---------------------------------------------------------------------------
create or replace function fn_evaluar_escaneo(
  p_entrada text,
  p_dia smallint,
  p_modo text
)
returns table (
  color semaforo,
  titulo text,
  detalle text,
  participante_id uuid,
  autorizable boolean,
  tipo tipo_asistencia
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p record;
  v_estado estado_pago;
  v_ultimo record;
  v_minutos numeric;
  v_dias_taller text;
begin
  /*
   * El candado que el comentario de `permisos.sql` daba por puesto.
   *
   * Decía: «Van a `authenticated` porque la comprobación de rol está dentro:
   * quien no sea capturista no obtiene nada útil de `fn_evaluar_escaneo`». No
   * la había. Y al ser `security definer` se salta las políticas, así que
   * cualquier JWT del proyecto —no hace falta tener fila en `usuarios_internos`—
   * podía pedir folio por folio el NOMBRE y el semáforo de pago de las
   * setecientas personas.
   *
   * Los mismos dos roles que `asistencias_alta` y que `ROLES_POR_AREA.captura`:
   * quien puede registrar la asistencia es quien puede consultarla antes.
   */
  if not tiene_rol(array['admin', 'capturista']::rol_interno[]) then
    raise exception 'Solo el personal de captura puede evaluar un escaneo'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_p
    from participantes
   where folio = upper(trim(p_entrada)) or matricula = trim(p_entrada);

  if v_p is null then
    return query select 'rojo'::semaforo, 'NO ENCONTRADO',
      'Ese folio o matrícula no existe. Pasar a mesa de incidencias.',
      null::uuid, false, 'entrada'::tipo_asistencia;
    return;
  end if;

  -- --- Puerta: la dirección la decide la base ------------------------------
  if p_modo = 'puerta' then
    select a.tipo, a.registrada_en into v_ultimo
      from asistencias a
     where a.participante_id = v_p.id
       and a.dia = p_dia
       and a.tipo in ('entrada', 'salida')
       and a.anulada_en is null
     order by a.registrada_en desc
     limit 1;

    if v_ultimo is not null then
      v_minutos := extract(epoch from (now() - v_ultimo.registrada_en)) / 60;

      -- Doble escaneo. Registrarlo no dejaría un duplicado inocuo: invertiría
      -- el estado de esa persona.
      if v_minutos < 2 then
        return query select 'amarillo'::semaforo, 'YA ESCANEADO',
          format('Su %s se registró hace menos de dos minutos.', v_ultimo.tipo),
          v_p.id, false, v_ultimo.tipo;
        return;
      end if;

      -- Estaba dentro, así que sale. A nadie se le niega salir, y a quien ya
      -- fue admitido no se le vuelve a auditar el pago para dejarlo volver del
      -- baño: los controles son de admisión, no de cada paso.
      if v_ultimo.tipo = 'entrada' then
        return query select 'verde'::semaforo, 'SALIDA REGISTRADA',
          v_p.nombre, v_p.id, false, 'salida'::tipo_asistencia;
        return;
      end if;

      return query select 'verde'::semaforo, 'REGRESÓ',
        v_p.nombre, v_p.id, false, 'entrada'::tipo_asistencia;
      return;
    end if;
  end if;

  -- --- ¿Le toca hoy? Depende de qué se esté preguntando --------------------
  if p_modo = 'taller' then
    if v_p.taller_id is null then
      return query select 'rojo'::semaforo, 'SIN TALLER',
        'No está inscrito en ningún taller. Pasar a mesa de incidencias.',
        v_p.id, false, 'taller'::tipo_asistencia;
      return;
    end if;

    if not exists (
      select 1 from taller_dias td
       where td.taller_id = v_p.taller_id and td.dia = p_dia
    ) then
      select string_agg(td.dia::text, ' y ' order by td.dia)
        into v_dias_taller
        from taller_dias td
       where td.taller_id = v_p.taller_id;

      return query select 'rojo'::semaforo, 'SU TALLER NO ES HOY',
        format('Su taller se imparte el día %s. Pasar a mesa de incidencias.',
               coalesce(v_dias_taller, '(sin días configurados)')),
        v_p.id, true, 'taller'::tipo_asistencia;
      return;
    end if;

  elsif v_p.dia <> p_dia then
    return query select 'rojo'::semaforo, 'DÍA EQUIVOCADO',
      format('Le toca el día %s. Pasar a mesa de incidencias.', v_p.dia),
      v_p.id, true, 'entrada'::tipo_asistencia;
    return;
  end if;

  select estado into v_estado
    from v_estado_pago
   where participante_id = v_p.id and concepto = 'evento';

  /*
   * `exento` abre la puerta igual que `pagado`, y esta línea es la que lo
   * decide para las setecientas personas que pasan por el torniquete.
   *
   * La regla del 2026-09-29: al maestro el evento y el taller le salen gratis,
   * y la constancia se paga. Un docente exento no tiene —ni va a tener— una
   * fila en `pagos`, así que con la comprobación anterior salía en ROJO, «SIN
   * PAGO REGISTRADO», y la mesa de incidencias lo mandaba a depositar algo que
   * nadie le iba a cobrar.
   *
   * Lo que NO cambia es `v_elegibles`, que sigue exigiendo `pagado`: el exento
   * entra y no sale en el listado de constancias. Es la misma regla vista por
   * sus dos lados, y separarlas es justo lo que la hace cumplirse.
   */
  if v_estado not in ('pagado', 'discrepancia', 'exento') then
    return query select 'rojo'::semaforo, 'SIN PAGO REGISTRADO',
      'Pasar a mesa de incidencias.', v_p.id, true, 'entrada'::tipo_asistencia;
    return;
  end if;

  if p_modo = 'taller' then
    -- Un solo pase de lista por taller: aquí sí no hay idas y vueltas.
    if exists (
      select 1 from asistencias a
       where a.participante_id = v_p.id and a.dia = p_dia
         and a.tipo = 'taller' and a.anulada_en is null
    ) then
      return query select 'amarillo'::semaforo, 'YA REGISTRADO',
        'Su taller de hoy ya está registrado. No se duplica.',
        v_p.id, false, 'taller'::tipo_asistencia;
      return;
    end if;
  end if;

  if v_estado = 'discrepancia' then
    return query select 'amarillo'::semaforo, 'PASA CON DISCREPANCIA',
      'Su pago no cuadra. Puede entrar; avísale que pase a ventanilla.',
      v_p.id, false,
      (case when p_modo = 'taller' then 'taller' else 'entrada' end)::tipo_asistencia;
    return;
  end if;

  return query select 'verde'::semaforo,
    case when p_modo = 'taller' then 'TALLER REGISTRADA' else 'ENTRADA REGISTRADA' end,
    v_p.nombre, v_p.id, false,
    (case when p_modo = 'taller' then 'taller' else 'entrada' end)::tipo_asistencia;
end;
$$;

revoke all on function fn_evaluar_escaneo(text, smallint, text) from public, anon, authenticated;
grant execute on function fn_evaluar_escaneo(text, smallint, text) to authenticated;

comment on function fn_evaluar_escaneo is
  'El semáforo de la puerta. Exige rol admin o capturista: es security definer, '
  'así que sin esa comprobación cualquier token leía el padrón folio por folio. '
  'Desde el 2026-09-29 admite «exento» igual que «pagado».';

-- ---------------------------------------------------------------------------
-- 7 · Lo que esta migración comprueba de sí misma
--
-- Ninguna de estas consultas inventa datos: miran el catálogo y el padrón que ya
-- hay. Un cero en la última NO es un fallo —todavía no se le ha preguntado a
-- nadie— y es el número con el que volver sobre esto.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  v_n integer;
begin
  -- La columna y su restricción
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'participantes'
       and column_name = 'quiere_constancia'
  ) then
    raise exception 'No quedó la columna participantes.quiere_constancia';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'participantes'::regclass and conname = 'chk_exento_solo_docente'
  ) then
    raise exception 'No quedó la restricción chk_exento_solo_docente';
  end if;

  -- La vista devuelve la rama nueva. Se busca el texto porque la única forma de
  -- probarla con datos sería inventar un participante, y esta migración no
  -- escribe en el padrón.
  if (select pg_get_viewdef('v_estado_pago'::regclass)) not like '%exento%' then
    raise exception 'v_estado_pago no quedó con la rama de exento';
  end if;

  -- La puerta. Se busca la CONDICIÓN y no la palabra: el comentario que va
  -- encima ya dice «exento», así que buscar solo eso daría verde con el código
  -- viejo debajo.
  if (select prosrc from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'fn_evaluar_escaneo')
     not like '%not in (''pagado'', ''discrepancia'', ''exento'')%' then
    raise exception 'fn_evaluar_escaneo no quedó admitiendo al exento';
  end if;

  -- v_elegibles NO se toca, y esto lo comprueba: sigue exigiendo pagado.
  if (select pg_get_viewdef('v_elegibles'::regclass)) not like '%= ''pagado''%' then
    raise exception
      'v_elegibles dejó de exigir pagado. La mitad de la regla que niega la '
      'constancia al exento vive ahí, y sin ella el exento saldría elegible.';
  end if;

  select count(*) into v_n from participantes where perfil = 'docente';
  raise notice 'Docentes registrados hoy: %. Todos con quiere_constancia = true.', v_n;
end;
$bloque$;
