-- =============================================================================
-- 44 · Cada grupo se pre-registra en sus días, y no en otros
--
-- El hueco
-- --------
-- Hasta aquí **nada cerraba el pre-registro por fecha**. `fecha_limite` existe
-- desde la migración 2, pero solo la lee `v_estado_pago` para marcar un pago
-- como `expirado`: ni `fn_preregistrar_alumno` ni ninguna pantalla la
-- consultan. Cualquiera podía inscribirse en cualquier momento.
--
-- La organización lo necesita al revés: el **registro previo para semestre 7 y
-- módulo 13** son el 25, 26 y 27 de septiembre de 2026, y solo esos tres días.
-- Los demás grupos entran después, en fechas que todavía no se anuncian.
--
-- Qué se guarda, y por qué en dos tablas
-- --------------------------------------
-- Una ventana es un tramo de tiempo. A quién deja pasar es otra cosa, y es una
-- lista: cinco licenciaturas por su semestre 7, la licenciatura modular por su
-- módulo 13, y las tres maestrías por el suyo. Meter eso en una columna del
-- mismo renglón obligaría a un arreglo o a un texto con comas, y ninguna de las
-- dos formas se puede consultar ni sostiene una llave foránea contra
-- `programas`.
--
-- Se declara **programa por programa, sin inferir nada**. La tentación era
-- escribir «avance 7 u 13» y ahorrarse nueve renglones, pero eso admitiría a un
-- alumno de maestría en su módulo 7 —que no está por egresar y no está
-- invitado— y excluiría a los de la licenciatura modular en el 13. La regla
-- corta no es más simple: es otra regla.
--
-- El interruptor
-- --------------
-- **Sin ninguna ventana cargada, todo sigue abierto**, exactamente como hasta
-- hoy. En cuanto existe una, la puerta se cierra para quien no tenga la suya
-- abierta. Así esta migración no rompe nada al aplicarse y el comportamiento
-- nuevo empieza con el primer dato, no con el despliegue.
-- =============================================================================

create table if not exists ventanas_preregistro (
  id uuid primary key default gen_random_uuid(),
  -- Se le enseña a quien llega fuera de plazo: «El registro previo para
  -- semestres 7 y 13 abre el 25 de septiembre». Tiene que poder leerlo alguien
  -- que no sabe qué es una ventana.
  etiqueta text not null check (length(trim(etiqueta)) > 0),
  abre timestamptz not null,
  cierra timestamptz not null,
  check (cierra > abre)
);

comment on table ventanas_preregistro is
  'Cuándo puede pre-registrarse cada grupo. Sin filas, el pre-registro está abierto para todos.';

create table if not exists ventana_cohortes (
  ventana_id uuid not null references ventanas_preregistro (id) on delete cascade,
  programa_id uuid not null references programas (id) on delete cascade,
  -- El avance exacto, no un rango: la invitación es a una generación concreta.
  avance smallint not null check (avance >= 1),
  primary key (ventana_id, programa_id, avance)
);

comment on table ventana_cohortes is
  'Qué generación de qué programa entra en cada ventana. Se declara una por una, sin inferir.';

create index if not exists ix_ventana_cohortes_busqueda
  on ventana_cohortes (programa_id, avance);

-- ---------------------------------------------------------------------------
-- Quién puede pre-registrarse ahora, y si no, cuándo
--
-- Devuelve NULL cuando puede pasar. Cuando no, devuelve el texto que hay que
-- enseñarle, ya redactado: el motivo y la fecha. Se resuelve en la base y no en
-- la pantalla porque la pantalla se puede saltar, y porque el mensaje tiene que
-- ser el mismo en los dos sitios.
-- ---------------------------------------------------------------------------
create or replace function fn_motivo_fuera_de_ventana(
  p_programa uuid,
  p_avance smallint
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hay_ventanas boolean;
  v_suya record;
begin
  select exists (select 1 from ventanas_preregistro) into v_hay_ventanas;
  -- Sin ventanas cargadas no hay nada que cerrar: es el estado de siempre.
  if not v_hay_ventanas then
    return null;
  end if;

  -- La suya: la que lo incluye y sigue abierta, si la hay. Si no, la próxima
  -- que lo incluya, para poder decirle cuándo. Y si ninguna lo incluye, nada.
  select v.etiqueta, v.abre, v.cierra
    into v_suya
    from ventanas_preregistro v
    join ventana_cohortes c on c.ventana_id = v.id
   where c.programa_id = p_programa
     and c.avance = p_avance
   order by
     -- Primero la que está abierta ahora mismo; después la más próxima.
     (now() between v.abre and v.cierra) desc,
     v.abre
   limit 1;

  -- `not found` y no `v_suya is null`: para una variable de tipo registro, `is
  -- null` solo es cierto cuando TODOS sus campos lo son, así que una ventana con
  -- etiqueta vacía se habría leído como «no hay ninguna». `found` dice lo que se
  -- quiere preguntar de verdad, que es si la consulta devolvió fila.
  if not found then
    return 'Todavía no se anuncia la fecha de registro para tu grupo. '
           'Escríbenos y te avisamos en cuanto se abra.';
  end if;

  if now() < v_suya.abre then
    return format(
      '%s abre el %s. Vuelve ese día para completar tu registro.',
      v_suya.etiqueta,
      to_char(v_suya.abre at time zone 'America/Mexico_City', 'DD/MM/YYYY')
    );
  end if;

  if now() > v_suya.cierra then
    return format(
      '%s cerró el %s. Escríbenos y vemos qué se puede hacer.',
      v_suya.etiqueta,
      to_char(v_suya.cierra at time zone 'America/Mexico_City', 'DD/MM/YYYY')
    );
  end if;

  return null;
end;
$$;

-- El pre-registro la llama antes de escribir, así que el anónimo necesita poder
-- ejecutarla: la pantalla la consulta para avisar ANTES de que la persona
-- llene el formulario entero. No expone nada —recibe un programa y un número y
-- devuelve un texto— y la puerta de verdad sigue estando dentro del alta.
revoke all on function fn_motivo_fuera_de_ventana(uuid, smallint) from public, anon, authenticated;
grant execute on function fn_motivo_fuera_de_ventana(uuid, smallint) to anon, authenticated;

/*
 * Lo mismo, pero preguntando por matrícula.
 *
 * Es lo que necesita la pantalla: cuando el alumno confirma su identidad, todavía
 * no ha llenado nada, y ahí es donde hay que decirle que vuelva el día 25 —no
 * después de teclear correo, celular y elegir taller—.
 *
 * Se añade aparte en vez de ampliar `fn_padron_confirmar`, que mide casi dos
 * centenares de líneas: reescribirla entera para devolver un campo más es
 * arriesgar las otras ciento noventa por una.
 *
 * No enseña nada nuevo de nadie. Recibe una matrícula y devuelve una frase con
 * una fecha; que la matrícula exista ya lo contesta `fn_padron_existe`, que es
 * pública desde el principio y es la que el pre-registro usa para empezar.
 */
create or replace function fn_ventana_de_matricula(p_matricula text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a record;
begin
  select programa_id, avance into v_a
    from padron_alumnos
   where matricula = trim(p_matricula);

  -- Una matrícula que no está en el padrón no se distingue aquí: contestar «no
  -- existe» convertiría esto en el enumerador que la migración 12 cerró. El
  -- pre-registro ya la rechaza en su sitio, con su mensaje.
  if not found then
    return null;
  end if;

  return fn_motivo_fuera_de_ventana(v_a.programa_id, v_a.avance::smallint);
end;
$$;

revoke all on function fn_ventana_de_matricula(text) from public, anon, authenticated;
grant execute on function fn_ventana_de_matricula(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El registro previo del 25 al 27 de septiembre de 2026
--
-- Las horas van con `-06` explícito: en México no hay horario de verano desde
-- 2022, así que el desfase es fijo. Escribirlo sin zona lo habría interpretado
-- en la del servidor —UTC— y la ventana habría abierto seis horas antes, la
-- noche del 24, para quien estuviera mirando.
-- ---------------------------------------------------------------------------
insert into ventanas_preregistro (etiqueta, abre, cierra)
select 'El registro previo para semestre 7 y módulo 13',
       '2026-09-25 00:00:00-06'::timestamptz,
       '2026-09-27 23:59:59-06'::timestamptz
 where not exists (
   select 1 from ventanas_preregistro
    where etiqueta = 'El registro previo para semestre 7 y módulo 13'
 );

/*
 * A quién deja pasar, derivado de cómo se cuenta cada programa.
 *
 * Quien se cuenta por MÓDULOS entra en el 13: la licenciatura modular y las tres
 * maestrías. Quien se cuenta por SEMESTRES entra en el 7: las otras cinco
 * licenciaturas. Son los nueve programas del catálogo, cada uno con su número.
 *
 * Sale de `coalesce(p.etiqueta_avance, n.etiqueta_avance)`, la misma precedencia
 * que estrenó la 43: el programa manda y el nivel suple. Si mañana otra
 * licenciatura pasa a modular, entra sola por el lado correcto.
 */
insert into ventana_cohortes (ventana_id, programa_id, avance)
select v.id,
       p.id,
       case
         when coalesce(p.etiqueta_avance, n.etiqueta_avance) = 'Módulo' then 13
         else 7
       end
  from ventanas_preregistro v
  cross join programas p
  join niveles_academicos n on n.id = p.nivel_id
 where v.etiqueta = 'El registro previo para semestre 7 y módulo 13'
on conflict (ventana_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
--
-- La ventana es información pública: quien llega fuera de plazo tiene derecho a
-- saber cuándo le toca. Editarla es de administración, como el resto de la
-- configuración del evento.
-- ---------------------------------------------------------------------------
alter table ventanas_preregistro enable row level security;
alter table ventana_cohortes enable row level security;

drop policy if exists ventanas_lectura on ventanas_preregistro;
create policy ventanas_lectura on ventanas_preregistro for select using (true);
drop policy if exists ventanas_admin on ventanas_preregistro;
create policy ventanas_admin on ventanas_preregistro for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));

drop policy if exists cohortes_lectura on ventana_cohortes;
create policy cohortes_lectura on ventana_cohortes for select using (true);
drop policy if exists cohortes_admin on ventana_cohortes;
create policy cohortes_admin on ventana_cohortes for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));

-- ---------------------------------------------------------------------------
-- Y la puerta de verdad
--
-- Va como DISPARADOR sobre `participantes`, no dentro de `fn_preregistrar_alumno`.
--
-- Dos razones. La primera es que la función mide ciento y pico de líneas y
-- reescribirla entera para colar cuatro es pedir un error de transcripción en
-- las otras ciento. La segunda, y es la que decide: un disparador cierra
-- CUALQUIER camino que dé de alta a un alumno, incluido el que todavía no
-- existe. Una comprobación dentro de una función solo cierra esa función.
--
-- **No se le aplica al personal.** Quien está dentro del sistema —ventanilla,
-- soporte, administración— actúa en nombre de alguien que ya tiene un caso
-- abierto, y bloquearlo dejaría a soporte sin poder arreglar nada fuera de
-- plazo, que es justo cuando hace falta. La ventana es para el formulario
-- público, que es donde la organización quiere el orden.
--
-- Solo mira las ALTAS. Volver a pasar por el pre-registro para recuperar el
-- comprobante o cambiar de taller no es un alta: el lugar ya está tomado por esa
-- misma persona, y echarla luego sería quitarle algo que ya tenía.
-- ---------------------------------------------------------------------------
create or replace function fn_validar_ventana_preregistro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text;
begin
  -- Docentes y externos no tienen programa ni avance: su calendario es otro y
  -- esta regla no habla de ellos.
  if new.perfil <> 'alumno' or new.programa_id is null or new.avance is null then
    return new;
  end if;

  if es_interno_activo() then
    return new;
  end if;

  v_motivo := fn_motivo_fuera_de_ventana(new.programa_id, new.avance::smallint);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function fn_validar_ventana_preregistro() from public, anon, authenticated;

drop trigger if exists trg_ventana_preregistro on participantes;
create trigger trg_ventana_preregistro
  before insert on participantes
  for each row execute function fn_validar_ventana_preregistro();
