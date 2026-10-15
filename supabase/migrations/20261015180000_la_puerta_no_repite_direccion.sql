-- =============================================================================
-- 1800 · La puerta no repite dirección
--
-- Qué pasaba
-- ----------
-- `20260911120000_puerta_como_torniquete.sql` quitó el índice único que
-- impedía una segunda entrada o salida el mismo día, a propósito: la gente
-- sale y vuelve, y una sola entrada+salida por jornada no aguanta la
-- operación real. Pero no dejó nada en su lugar que impida el caso que SÍ es
-- siempre inválido: dos movimientos del MISMO tipo seguidos, sin uno del tipo
-- contrario en medio.
--
-- La dirección de cada escaneo en modo puerta la decide, casi siempre, el
-- estado LOCAL del navegador (`evaluarEscaneo`, mirando su copia de
-- `asistencias`) y no la base: la consulta a `fn_evaluar_escaneo` —que sí
-- conoce la regla de los dos minutos— solo se hace cuando esa pestaña no
-- tiene escucha en tiempo real (`enVivo === false`). Con tiempo real sano,
-- que es el caso normal, nadie vuelve a preguntarle a la base nada antes de
-- escribir: `guardarAsistencia` hace un `insert` directo.
--
-- Esa copia local se pone al día por `cargarTodo()`, que ahora se dispara
-- como mucho cada 20 segundos (antes 5, bajado en el mismo incidente que esta
-- migración cierra del otro lado: ver `src/lib/tiempo-real.ts`). Con varios
-- puntos de captura activos a la vez, eso deja una ventana real: si la misma
-- persona pasa por dos puertas distintas dentro de esos segundos, la segunda
-- estación todavía no se enteró de la primera, la evalúa como si viniera de
-- fuera y la registra con la MISMA dirección. Quedan dos «entrada» seguidas
-- en la base, sin que nada lo impida ni lo avise, y el torniquete de esa
-- persona queda invertido desde ahí: su siguiente escaneo real se interpreta
-- al revés, y su constancia puede salir mal.
--
-- Qué cambia
-- ----------
-- Un disparador que SÍ corre siempre, sin importar de qué pestaña venga el
-- insert ni si su tiempo real está sano: si el movimiento inmediatamente
-- anterior de esa persona ese día —sin contar anuladas— es del MISMO tipo que
-- el que se intenta insertar, se rechaza. No hay ningún caso legítimo en que
-- esto deba pasar: por diseño, la dirección siempre alterna, así que dos
-- iguales seguidas solo pueden venir de esta carrera entre estaciones.
--
-- El reintento de la cola —mismo `idRemoto`, insertando de nuevo lo que ya se
-- guardó porque la respuesta se perdió— se deja pasar a propósito: se excluye
-- la fila con el mismo `id` antes de mirar «cuál es el movimiento anterior»,
-- así que un reintento legítimo sigue viendo el movimiento de ANTES de sí
-- mismo, y sigue llegando sano hasta el choque contra la llave primaria que
-- `guardarAsistencia` ya sabe tratar como «ya estaba, no falló».
--
-- Lo que NO cierra
-- ----------------
-- Dos inserts que de verdad lleguen a confirmarse en el mismo instante, antes
-- de que cualquiera de los dos sea visible para el otro, no los detiene esto
-- —ninguna comprobación «mirar y decidir» sin bloqueo lo hace—. No se cierra
-- con un candado explícito porque eso exige una fila de estado por persona
-- que lockear, y ese rediseño no se improvisa a mitad de un evento en vivo.
-- Lo que esta migración sí cierra es el caso real: dos escaneos segundos
-- aparte, en estaciones distintas, con la copia local de alguna todavía
-- atrasada. Es la causa que de verdad se está viendo.
-- =============================================================================

create or replace function fn_exigir_alternancia_de_puerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior tipo_asistencia;
begin
  -- El pase de lista de taller no tiene idas y vueltas que alternar, y ya
  -- tiene su propio candado: `uq_asistencia_taller`.
  if new.tipo not in ('entrada', 'salida') then
    return new;
  end if;

  select a.tipo into v_anterior
    from asistencias a
   where a.participante_id = new.participante_id
     and a.dia = new.dia
     and a.tipo in ('entrada', 'salida')
     and a.anulada_en is null
     and a.id <> new.id
   order by a.registrada_en desc
   limit 1;

  if v_anterior = new.tipo then
    raise exception
      'Esta persona ya tiene «%» como su último movimiento de hoy. Dos «%» seguidas sin un movimiento contrario en medio no son válidas: es probable que otro punto de captura ya haya registrado lo contrario hace un instante. Revisa el historial de esta persona antes de reintentar.',
      v_anterior, new.tipo
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function fn_exigir_alternancia_de_puerta() from public, anon, authenticated;

drop trigger if exists trg_exigir_alternancia_de_puerta on asistencias;
create trigger trg_exigir_alternancia_de_puerta
  before insert on asistencias
  for each row execute function fn_exigir_alternancia_de_puerta();

comment on function fn_exigir_alternancia_de_puerta is
  'Rechaza una entrada o salida si el último movimiento de esa persona ese día fue del mismo tipo: la dirección siempre alterna, así que dos iguales seguidas solo pueden venir de una carrera entre puntos de captura.';
