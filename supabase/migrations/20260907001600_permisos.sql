-- =============================================================================
-- 1600 · Quién puede llamar a qué
--
-- Las funciones SECURITY DEFINER corren con los permisos de quien las creó, así
-- que ignoran RLS por diseño. Eso las hace la única puerta del participante a
-- sus datos, y también la puerta más peligrosa si se deja abierta de más.
--
-- Supabase concede EXECUTE sobre las funciones de `public` a `anon` y
-- `authenticated` por omisión. Aquí se revoca todo y se concede una por una: es
-- la diferencia entre que el anónimo consulte su folio y que reparta los días
-- del evento.
-- =============================================================================

revoke execute on all functions in schema public from anon, authenticated;

-- ------------------------------------------------- lo que puede el público ---
-- Todas piden una credencial o una matrícula exacta y devuelven una sola fila.
-- Ninguna permite recorrer el padrón ni listar participantes.
grant execute on function fn_autenticar_portal(text, text) to anon, authenticated;
grant execute on function fn_portal_estado(text, text) to anon, authenticated;
grant execute on function fn_buscar_en_padron(text) to anon, authenticated;
grant execute on function fn_preregistrar_alumno(text, text, text, uuid) to anon, authenticated;
grant execute on function fn_abrir_caso_nombre(uuid, text) to anon, authenticated;

-- ------------------------------------------- lo que necesita el personal ---
-- Van a `authenticated` porque la comprobación de rol está dentro: quien no sea
-- capturista no obtiene nada útil de `fn_evaluar_escaneo`, pero tampoco hace
-- falta que la llamada falle antes de empezar.
grant execute on function fn_evaluar_escaneo(text, smallint, tipo_asistencia) to authenticated;
grant execute on function fn_cierre_automatico(smallint, timestamptz) to authenticated;
grant execute on function fn_reasignar_dia(text, smallint) to authenticated;
grant execute on function fn_repartir_dias_pendientes() to authenticated;
grant execute on function fn_dia_de(text) to authenticated;
grant execute on function fn_dia_mas_vacio() to authenticated;
grant execute on function es_interno_activo() to authenticated;
grant execute on function tiene_rol(rol_interno[]) to authenticated;

-- --------------------------------------------------------------- vistas ---
-- ATENCIÓN: lo que decía aquí era falso, y se corrige en
-- `20260910100000_vistas_security_invoker.sql`.
--
-- Decía que «las vistas heredan las políticas de sus tablas, así que conceder
-- SELECT no abre nada que las tablas no permitieran ya». Una vista de
-- PostgreSQL corre con los permisos de quien la creó, no de quien la consulta,
-- salvo que se declare `security_invoker = true`. Ninguna de estas lo hacía, y
-- las creó el dueño de las tablas: las seis se saltaban RLS.
--
-- Otro efecto del orden de este archivo: el `grant` sobre `v_talleres` de más
-- abajo lo deshace el `revoke all on all tables ... from anon` que le sigue,
-- porque «ALL TABLES» incluye las vistas. También se repone allí.
grant select on v_participantes, v_estado_pago, v_talleres, v_elegibles,
                v_reparto_dias, v_evidencias_duplicadas
  to authenticated;

-- El catálogo de talleres sí es público: sale en el cartel.
grant select on v_talleres to anon;

-- ---------------------------------------------------------- lo prohibido ---
-- El anónimo no toca ninguna tabla directamente. Su único camino son las
-- funciones de arriba, que comprueban folio y matrícula antes de devolver nada.
revoke all on all tables in schema public from anon;
grant select on configuracion_evento, dias_evento, niveles_academicos,
                programas, planteles, talleres, taller_dias
  to anon;

comment on schema public is
  'El participante no tiene sesión: entra por funciones SECURITY DEFINER, nunca a las tablas.';
