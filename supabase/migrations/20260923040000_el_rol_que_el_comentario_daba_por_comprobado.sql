-- =============================================================================
-- 55 · El rol que el comentario daba por comprobado
--
-- La promesa
-- ----------
-- `20260907001600_permisos.sql` concede siete funciones a `authenticated` con
-- esta justificación escrita:
--
--   «Van a `authenticated` porque la comprobación de rol está dentro: quien no
--    sea capturista no obtiene nada útil de `fn_evaluar_escaneo`, pero tampoco
--    hace falta que la llamada falle antes de empezar.»
--
-- No la hay. En ninguna de las siete. Y todas son `security definer`, así que se
-- saltan las políticas de las tablas que leen y escriben.
--
-- `authenticated` en Supabase es CUALQUIER token de Auth, tenga o no fila en
-- `usuarios_internos`. O sea que la separación entre capturista, financiero,
-- revisor y administración —que las políticas sí sostienen— desaparecía en
-- cuanto la consulta pasaba por una de estas funciones.
--
-- Qué se podía hacer con un token cualquiera
-- ------------------------------------------
--   fn_evaluar_escaneo           nombre y semáforo de pago, folio por folio
--   fn_reasignar_dia             ESCRIBE el día de quien sea
--   fn_repartir_dias_pendientes  ESCRIBE el día de TODO el padrón
--   fn_cierre_automatico         INSERTA una salida para todos los que están dentro
--   fn_dia_de, fn_dia_mas_vacio, fn_esta_dentro   el resto del expediente
--
-- Dos arreglos distintos, y la diferencia importa
-- -----------------------------------------------
-- **Seis se REVOCAN, no se reescriben.** Ninguna la llama el cliente: son
-- ayudantes internos —`fn_dia_de` la usa `fn_preregistrar_alumno`— o pantallas
-- que nunca se conectaron (`fn_cierre_automatico` no se invoca desde ni una
-- línea de `src/`). Revocar el permiso las cierra por completo sin tocar una
-- sola línea de sus cuerpos, y **no rompe las llamadas internas**: una función
-- `security definer` corre con los permisos de su dueño, no con los de quien la
-- llamó, así que el pre-registro público sigue resolviendo su día igual.
--
-- Si algún día una pantalla necesita una de estas, se le vuelve a conceder el
-- permiso a propósito y con su comprobación dentro. Hoy conceder «por si acaso»
-- es lo que produjo esto.
--
-- **Una sí se reescribe, porque el cliente la llama.** `fn_evaluar_escaneo` es
-- la del escáner de la puerta, así que no se puede cerrar: necesita el candado
-- por dentro. Se le exigen los MISMOS dos roles que `asistencias_alta` y que
-- `ROLES_POR_AREA.captura` en el cliente —`admin` y `capturista`—, porque quien
-- puede registrar la asistencia es quien puede consultarla antes.
--
-- Su cuerpo se copió del archivo original **sin transcribirlo a mano**: lo único
-- que se añade es el bloque de seis líneas tras el `begin`. Reescribir a mano
-- ciento cuarenta y cuatro líneas para colar seis es exactamente cómo la
-- migración 20260910200000 perdió el limitador de `fn_padron_confirmar`, y no
-- hacía falta correr ese riesgo dos veces.
--
-- Lo que NO se toca
-- -----------------
-- `fn_perfil_interno` se queda como está, y es la prueba de que el patrón se
-- sabía hacer bien: solo mira `auth.uid()`, devuelve el expediente de QUIEN
-- PREGUNTA y ya llevaba su tope por IP. Una función que solo puede hablar de ti
-- no necesita preguntarte quién eres.
--
-- `fn_asignar_dia_a_varios` y `fn_dia_mas_vacio` tampoco: no son `security
-- definer`, así que corren con los permisos de quien llama y las políticas ya
-- las cubren. Es el patrón que documentó la migración 47, y el que estas siete
-- deberían haber seguido.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Las seis que nadie llama desde el cliente
-- ---------------------------------------------------------------------------
revoke execute on function fn_reasignar_dia(text, smallint) from authenticated;
revoke execute on function fn_repartir_dias_pendientes() from authenticated;
revoke execute on function fn_cierre_automatico(smallint, timestamptz) from authenticated;
revoke execute on function fn_dia_de(text) from authenticated;
revoke execute on function fn_dia_mas_vacio() from authenticated;
revoke execute on function fn_esta_dentro(uuid, smallint) from authenticated;

comment on function fn_reasignar_dia is
  'Ayudante interno. NO se concede a `authenticated`: escribe el día de cualquiera '
  'y es security definer. Ver la migración 55.';
comment on function fn_repartir_dias_pendientes is
  'Ayudante interno. NO se concede a `authenticated`: reparte el día de todo el padrón.';
comment on function fn_cierre_automatico is
  'Ayudante interno. NO se concede a `authenticated`: inserta salidas en bloque.';

-- ---------------------------------------------------------------------------
-- Y la del escáner, que sí hace falta desde fuera
--
-- Cuerpo idéntico al de `20260915180000`. Lo único nuevo es el `if` de arriba.
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

  if v_estado <> 'pagado' and v_estado <> 'discrepancia' then
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
  'así que sin esa comprobación cualquier token leía el padrón folio por folio.';
