-- =============================================================================
-- El aforo dejó de frenar el padrón
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260926180000_el_aforo_dejo_de_frenar_el_padron`.
--
-- Qué cambia
-- ----------
-- `fn_asignar_dia_a_varios` pierde el tope del aforo. Mover alumnos del PADRÓN
-- a un día deja de compararse contra `dias_evento.cupo`, así que un día puede
-- quedar planeado por encima de sus 700 —o de sus 600— y la base lo acepta.
--
-- Por qué
-- -------
-- Es un retroceso, no una regla nueva.
-- `20260921200000_el_padron_planea_y_el_preregistro_reserva` le había quitado
-- ese tope el 21 de septiembre. Dos días después,
-- `20260923140000_el_taller_no_depende_del_dia_del_evento` reescribió la
-- función entera para quitarle la liberación del taller, y al hacerlo partió de
-- un cuerpo anterior: el bloque del aforo volvió a entrar sin que nadie lo
-- pidiera. Desde entonces está vivo.
--
-- `20260926120000_el_padron_planea_tambien_al_repartir` arregló las otras dos
-- funciones dando por hecho —así lo dice su propia cabecera— que a esta ya le
-- habían quitado el tope. No era cierto, y por eso el reparto siguió fallando
-- después de aplicarla: `fn_dia_mas_vacio` ya proponía días por encima del
-- aforo y esta función los rechazaba uno por uno.
--
-- Lo que la organización ve, y es de lo que salió este arreglo: en
-- `/admin/padron`, con 687/700, 691/700 y 583/600 planeados y 532 alumnos sin
-- día, cualquier reparto muere con «No se pudo guardar el cambio de día».
--
-- La regla, otra vez, porque es la que el tope contradecía: en el padrón se
-- sube la base de alumnos que PODRÍAN ir cada día, y es obvio que no todos se
-- inscriben. Se pueden planear mil en un día de 700. Los 700 los ocupa quien
-- hace su pre-registro, no quien aparece en una lista.
--
-- Lo que NO cambia
-- ----------------
-- El tope firme sigue donde estaba y contando lo que debe.
-- `fn_preregistrar_alumno` y `fn_preregistrar_externo` cuentan `participantes`
-- bajo `pg_advisory_xact_lock` y rechazan el alta que no cabe; esta migración
-- no las toca. Siguen habiendo 700, 700 y 600 lugares y los sigue ocupando
-- quien se pre-registra, por orden de llegada.
--
-- Tampoco cambia lo que esta función hace desde la migración 60: mueve el día
-- del padrón Y el del participante —que es el que lee el escáner de la puerta—
-- y NO toca el taller, así que sigue devolviendo cero filas.
--
-- Tampoco cambian las concesiones. Es `create or replace` con la misma firma,
-- así que conserva su ACL; las dos líneas de abajo la vuelven a fijar de todos
-- modos, porque son idempotentes y dejan el permiso escrito donde se lee.
--
-- Rebasar el aforo al planear no es silencioso: `/admin/padron` lo avisa en
-- ámbar —«el día 1 queda con 720 planeados y caben 700»— y lo anota en la
-- bitácora. Avisa; nunca impide.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Mover de día, sin techo
-- ---------------------------------------------------------------------------
/*
 * El cuerpo es el de `20260923140000` con el bloque del aforo fuera, y nada
 * más. Desaparecen con él las tres variables que solo servían para contarlo
 * —`v_cupo`, `v_ya`, `v_entran`— y con ellas el `declare`.
 *
 * Los alias de tabla se quedan, y no son decorativos: `matricula` es un
 * parámetro de salida de esta función, así que un `where matricula = ...` sin
 * alias se lee a sí mismo en vez de leer la columna.
 */
create or replace function fn_asignar_dia_a_varios(
  p_matriculas text[],
  p_dia smallint
)
returns table (matricula text, taller_liberado text)
language plpgsql
-- SIN `security definer`, igual que antes y por el mismo motivo: quien llama ya
-- tiene sesión, y corriendo con SUS permisos las políticas de `padron_alumnos`
-- y `participantes` son exactamente la comprobación que hace falta. Con
-- `security definer` correría como el dueño de las tablas, que no está sujeto a
-- ninguna, y cualquier usuario autenticado podría mover a la gente de día.
set search_path = public
as $$
begin
  update padron_alumnos a set dia = p_dia where a.matricula = any (p_matriculas);

  -- Quitarle el día a alguien solo tiene sentido en el padrón: un participante
  -- ya registrado tiene que asistir algún día, y `participantes.dia` es NOT NULL.
  if p_dia is null then
    return;
  end if;

  -- Solo el día, y `is distinct from` evita reescribir a quien ya estaba ahí:
  -- sería trabajo inútil y ruido en el tiempo real.
  update participantes p
     set dia = p_dia
   where p.matricula = any (p_matriculas)
     and p.dia is distinct from p_dia;

  -- Ninguna inscripción que liberar, así que ninguna fila que devolver.
  return;
end;
$$;

comment on function fn_asignar_dia_a_varios is
  'Mueve de día a un conjunto: el padrón Y el participante, que es el que lee '
  'el escáner de la puerta. NO comprueba el aforo: el padrón planea y el '
  'pre-registro reserva. NO toca el taller desde la migración 60, así que '
  'devuelve cero filas.';

revoke all on function fn_asignar_dia_a_varios(text[], smallint) from public, anon;
grant execute on function fn_asignar_dia_a_varios(text[], smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Que el reemplazo haya ocurrido de verdad
--
-- No es ceremonia. Este tope ya volvió una vez sin que nadie lo pidiera, y la
-- forma de enterarse fue que la organización no podía repartir su padrón tres
-- días después. Aquí se comprueba el CUERPO VIVO, que es lo único que decide:
-- la función que quedó no puede nombrar `dias_evento`, porque sin aforo que
-- consultar no tiene ningún motivo para hacerlo.
-- ---------------------------------------------------------------------------
do $bloque$
declare
  v_def text;
  v_n integer;
begin
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_asignar_dia_a_varios';

  if v_n = 0 then
    raise exception 'fn_asignar_dia_a_varios no existe después de crearla.';
  end if;

  /*
   * Una sola, y esto no es celo.
   *
   * Las seis definiciones que ha tenido esta función en el repo llevan la misma
   * firma —`(text[], smallint)`— así que `create or replace` reemplaza en
   * sitio. Pero PostgREST resuelve por NOMBRES de parámetro, y una variante
   * creada a mano en el editor SQL con otra firma se quedaría viva al lado de
   * esta: el cliente podría seguir llamando a la del tope sin que nada lo
   * delate. Con dos, esto se detiene y las enumera.
   */
  if v_n > 1 then
    raise exception
      'Hay % funciones fn_asignar_dia_a_varios. Quedó una firma vieja viva: bórrala antes de seguir.',
      v_n
      using errcode = 'check_violation';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_asignar_dia_a_varios';

  if position('dias_evento' in v_def) > 0 then
    raise exception
      'El tope del aforo sigue vivo en fn_asignar_dia_a_varios: el reemplazo no ocurrió.'
      using errcode = 'check_violation';
  end if;
end;
$bloque$;
