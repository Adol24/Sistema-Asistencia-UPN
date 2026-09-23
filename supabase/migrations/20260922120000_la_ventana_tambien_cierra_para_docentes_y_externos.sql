-- =============================================================================
-- 49 · La ventana también cierra para docentes y externos
--
-- El hueco
-- --------
-- La migración 44 puso ventanas de pre-registro y su disparador se salta a
-- docentes y externos en la primera línea, con este comentario:
--
--   «Docentes y externos no tienen programa ni avance: su calendario es otro y
--    esta regla no habla de ellos.»
--
-- Ese otro calendario nunca se escribió. `fecha_limite` tampoco los detiene:
-- la única que la lee es `v_estado_pago`, para expirar pagos. Así que un
-- docente podía pre-registrarse hoy, en diciembre o después del Encuentro.
--
-- Por qué eso hace daño, y no solo desorden
-- ------------------------------------------
-- Porque el aforo es por día y es común. `fn_preregistrar_externo` cuenta
-- TODOS los participantes del día contra `dias_evento.cupo`, sin separar por
-- perfil, y el docente ELIGE su día. El alumno no: el suyo sale del padrón.
--
-- Si los docentes llenan un día antes de que abra la ventana de los alumnos,
-- el alumno al que le tocaba ese día se encuentra con
--
--   «El día 2 ya no tiene lugares disponibles, Y ES EL DÍA QUE TE TOCA.
--    Escríbenos y la organización te reubica.»
--
-- y no puede hacer nada: no elige día. El externo sí —«Elige otro día»—. O sea
-- que quien tiene la prioridad es el único que se queda sin salida, y cada caso
-- se convierte en una reubicación a mano. Esta migración existe para que la
-- organización pueda decidir el orden en vez de que lo decida quien madrugue.
--
-- Qué se guarda
-- -------------
-- Una tabla hermana de `ventana_cohortes`, con la misma forma: una ventana, a
-- quién deja pasar. Cambia lo que identifica al invitado, porque no es lo
-- mismo: al alumno se le invita por GENERACIÓN —programa más avance, que es
-- una fila de `ventana_cohortes`— y al docente por lo que es. No hay avance
-- que escribir ni programa al que apuntar.
--
-- `check (perfil <> 'alumno')`: los alumnos se declaran por cohorte y solo por
-- cohorte. Admitir aquí 'alumno' daría dos maneras de decir lo mismo, y con
-- reglas distintas —una por generación, otra en bloque—, que es la clase de
-- ambigüedad que después nadie sabe resolver al leer la pantalla.
-- =============================================================================

create table if not exists ventana_perfiles (
  ventana_id uuid not null references ventanas_preregistro (id) on delete cascade,
  perfil perfil_participante not null check (perfil <> 'alumno'),
  primary key (ventana_id, perfil)
);

comment on table ventana_perfiles is
  'Qué perfiles sin padrón entran en cada ventana. Los alumnos van por ventana_cohortes, que los invita por generación.';

-- ---------------------------------------------------------------------------
-- El texto, en un solo sitio
--
-- Se saca de `fn_motivo_fuera_de_ventana` para que la versión de perfil no lo
-- copie. Son tres frases con una fecha dentro; copiadas, la primera vez que
-- alguien corrija una redacción quedarán dos mensajes distintos para la misma
-- situación, según quién pregunte. Y el que no se corrija será el que menos se
-- lee, que es justo el que más falta hace que esté bien.
--
-- Devuelve NULL cuando la ventana está abierta ahora, que es el caso bueno.
-- ---------------------------------------------------------------------------
create or replace function fn_texto_de_ventana(
  p_etiqueta text,
  p_abre timestamptz,
  p_cierra timestamptz
)
returns text
language sql
-- `stable` y no `immutable`, aunque no toque tablas: lee `now()`, y una función
-- marcada inmutable puede plegarse a una constante en el plan. La frase se
-- quedaría congelada en el momento en que se planificó la consulta.
stable
as $$
  select case
    when now() < p_abre then format(
      '%s abre el %s. Vuelve ese día para completar tu registro.',
      p_etiqueta,
      to_char(p_abre at time zone 'America/Mexico_City', 'DD/MM/YYYY')
    )
    when now() > p_cierra then format(
      '%s cerró el %s. Escríbenos y vemos qué se puede hacer.',
      p_etiqueta,
      to_char(p_cierra at time zone 'America/Mexico_City', 'DD/MM/YYYY')
    )
    else null
  end;
$$;

revoke all on function fn_texto_de_ventana(text, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El interruptor, ahora por audiencia
--
-- **Este es el cambio delicado de la migración.** La 44 abría la puerta cuando
-- no existía NINGUNA ventana:
--
--   if not exists (select 1 from ventanas_preregistro) then return null;
--
-- Con una sola audiencia eso bastaba. Con dos se rompe: en cuanto se cargue una
-- ventana que solo habla de docentes, `ventanas_preregistro` deja de estar
-- vacía y **todos los alumnos del padrón recibirían «todavía no se anuncia la
-- fecha de registro para tu grupo»**, sin que nadie haya tocado sus fechas.
--
-- Así que cada audiencia se mide con las ventanas que hablan de ELLA: los
-- alumnos con `ventana_cohortes`, los demás con `ventana_perfiles`. Hoy, con la
-- única ventana cargada y sus nueve programas, las dos formas dan el mismo
-- resultado; la diferencia solo aparece el día que se cargue una ventana de una
-- sola audiencia, que es exactamente lo que esta migración viene a permitir.
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
  v_suya record;
begin
  -- Sin ninguna ventana que hable de alumnos no hay nada que cerrarles.
  if not exists (select 1 from ventana_cohortes) then
    return null;
  end if;

  select v.etiqueta, v.abre, v.cierra
    into v_suya
    from ventanas_preregistro v
    join ventana_cohortes c on c.ventana_id = v.id
   where c.programa_id = p_programa
     and c.avance = p_avance
   order by
     (now() between v.abre and v.cierra) desc,
     v.abre
   limit 1;

  if not found then
    return 'Todavía no se anuncia la fecha de registro para tu grupo. '
           'Escríbenos y te avisamos en cuanto se abra.';
  end if;

  return fn_texto_de_ventana(v_suya.etiqueta, v_suya.abre, v_suya.cierra);
end;
$$;

revoke all on function fn_motivo_fuera_de_ventana(uuid, smallint) from public, anon, authenticated;
grant execute on function fn_motivo_fuera_de_ventana(uuid, smallint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lo mismo para quien no está en ningún padrón
--
-- El mensaje de «ninguna ventana lo incluye» se redacta aparte porque «tu
-- grupo» no significa nada para un docente: no tiene grupo. Y se nombra al
-- perfil en el texto porque las dos audiencias pueden tener fechas distintas, y
-- «para ti» dejaría a quien lo lee sin saber a quién se refiere.
-- ---------------------------------------------------------------------------
create or replace function fn_motivo_fuera_de_ventana_perfil(p_perfil perfil_participante)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_suya record;
begin
  -- Los alumnos no pasan por aquí: su invitación es por generación.
  if p_perfil = 'alumno' then
    return null;
  end if;

  -- Sin ninguna ventana que hable de perfiles, abierto, igual que hasta hoy.
  -- Esto es lo que hace que aplicar la migración no cierre nada: el
  -- comportamiento nuevo empieza con el primer dato, no con el despliegue.
  if not exists (select 1 from ventana_perfiles) then
    return null;
  end if;

  select v.etiqueta, v.abre, v.cierra
    into v_suya
    from ventanas_preregistro v
    join ventana_perfiles vp on vp.ventana_id = v.id
   where vp.perfil = p_perfil
   order by
     (now() between v.abre and v.cierra) desc,
     v.abre
   limit 1;

  if not found then
    return format(
      'Todavía no se anuncia la fecha de registro para %s. '
      'Escríbenos y te avisamos en cuanto se abra.',
      case p_perfil
        when 'docente' then 'docentes'
        else 'participantes externos'
      end
    );
  end if;

  return fn_texto_de_ventana(v_suya.etiqueta, v_suya.abre, v_suya.cierra);
end;
$$;

-- El formulario público la consulta para avisar ANTES de que la persona llene
-- nada, igual que `fn_ventana_de_matricula` en el camino del alumno. Recibe un
-- perfil y devuelve una frase: no expone ningún dato de nadie.
revoke all on function fn_motivo_fuera_de_ventana_perfil(perfil_participante)
  from public, anon, authenticated;
grant execute on function fn_motivo_fuera_de_ventana_perfil(perfil_participante)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- La puerta
--
-- Sigue siendo el mismo disparador sobre `participantes`, y por las mismas
-- razones de la 44: cierra CUALQUIER camino que dé de alta a alguien, incluido
-- el que todavía no existe.
--
-- Lo que cambia es el orden. La exención del personal estaba DESPUÉS de la
-- salida por perfil, así que daba igual; ahora que los no-alumnos también se
-- comprueban, tiene que ir primero o ventanilla y soporte se quedarían sin
-- poder dar de alta a un docente fuera de plazo, que es justo cuando hace falta.
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
  -- El personal actúa en nombre de alguien que ya tiene un caso abierto.
  if es_interno_activo() then
    return new;
  end if;

  if new.perfil = 'alumno' then
    -- Un alumno sin programa ni avance no se puede medir contra una cohorte.
    -- Pasa, como hasta ahora: lo rechazaría por un dato que no depende de él.
    if new.programa_id is null or new.avance is null then
      return new;
    end if;
    v_motivo := fn_motivo_fuera_de_ventana(new.programa_id, new.avance::smallint);
  else
    v_motivo := fn_motivo_fuera_de_ventana_perfil(new.perfil);
  end if;

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

-- ---------------------------------------------------------------------------
-- Permisos, los mismos que sus hermanas
--
-- La ventana es información pública: quien llega fuera de plazo tiene derecho a
-- saber cuándo le toca. Editarla es de administración.
-- ---------------------------------------------------------------------------
alter table ventana_perfiles enable row level security;

drop policy if exists perfiles_lectura on ventana_perfiles;
create policy perfiles_lectura on ventana_perfiles for select using (true);
drop policy if exists perfiles_admin on ventana_perfiles;
create policy perfiles_admin on ventana_perfiles for all
  using (tiene_rol(array['admin']::rol_interno[]))
  with check (tiene_rol(array['admin']::rol_interno[]));
