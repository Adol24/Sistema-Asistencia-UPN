-- =============================================================================
-- 52 · La evidencia se sube de verdad
--
-- Lo que había
-- ------------
-- `subir()` en `portal.evidencias.tsx` movía una barra de progreso, esperaba
-- `simularLatencia()` —un `setTimeout` de 600 a 900 ms, sin ninguna condición de
-- entorno— y mostraba «Tu evidencia quedó en revisión». No había archivo que se
-- enviara, ni hash, ni fila, ni almacenamiento. Recargar la página devolvía la
-- tarjeta a «Subir evidencia».
--
-- Y no podía funcionar aunque se hubiera intentado: `evidencias_escritura` exige
-- rol `admin` o `revisor`, y la migración 16 le revoca al anónimo todas las
-- tablas. El participante no tenía por dónde.
--
-- La tabla, en cambio, estaba terminada desde la migración 9: `archivo_url`,
-- `hash_archivo` con su formato de SHA-256, `unique (participante_id, dia)` y
-- `chk_entregada_con_archivo`. Lo que faltaba era todo lo de debajo.
--
-- Con dos mil quinientos alumnos son cinco mil imágenes, y de esto depende la
-- constancia: sin evidencia aprobada nadie acredita. Era el defecto más caro del
-- sistema, y el más silencioso.
--
-- Cómo sube alguien que no tiene sesión
-- -------------------------------------
-- El participante es `anon`: no hay identidad que una política de Storage pueda
-- mirar. Así que la subida va en dos tiempos, y la credencial se comprueba en
-- los dos:
--
--   1. `fn_evidencia_preparar` valida folio y credencial, comprueba el día y el
--      tope de intentos, y DEVUELVE la ruta exacta a la que hay que subir. Esa
--      ruta se guarda en la fila, todavía como `no_entregada`.
--   2. El navegador sube el archivo a esa ruta.
--   3. `fn_evidencia_confirmar` vuelve a validar, exige que la ruta sea la que
--      se emitió, y recién entonces pone `pendiente` con su hash y su fecha.
--
-- La política de Storage deja al anónimo INSERTAR en este bucket y nada más: ni
-- leer, ni cambiar, ni borrar. Alguien puede subir basura a un nombre inventado,
-- y eso queda en un objeto huérfano que ninguna fila referencia —barrible, y sin
-- efecto sobre nadie—, porque el paso 3 solo acepta la ruta que el paso 1 emitió
-- para esa persona y ese día.
--
-- Lo que la base pasa a exigir, y antes no exigía nadie
-- -----------------------------------------------------
-- - **El día tiene que ser distinto del suyo.** Se entrega evidencia de los días
--   en que NO se asistió. Esto solo vivía en `v_elegibles`, la vista que ninguna
--   pantalla consulta, así que en la práctica no lo comprobaba nadie.
-- - **Tres intentos por día.** El encabezado del portal lo prometía y el
--   contador vivía en un `useState`: recargar la página lo devolvía a cero.
--   Ahora es una columna.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- El contador de intentos, que la aplicación ya leía y la tabla no tenía
--
-- `FilaEvidencia` declara `intentos` desde siempre y `datos.ts` lo rellenaba
-- con un `1` literal porque la columna no existía. El panel de revisión enseña
-- «Intentos usados: 1 de 3» para todo el mundo desde entonces.
-- ---------------------------------------------------------------------------
alter table evidencias
  add column if not exists intentos smallint not null default 0 check (intentos >= 0);

comment on column evidencias.intentos is
  'Cuántas veces se ha entregado esta evidencia. El tope lo aplica fn_evidencia_preparar.';

-- ---------------------------------------------------------------------------
-- El bucket
--
-- Privado: las evidencias son fotos que manda una persona identificada, y la
-- URL de un bucket público es adivinable por quien conozca la ruta. El personal
-- las ve con una URL firmada de vida corta, que es lo que ya esperaba el
-- comentario de `imagenes.ts`.
--
-- El tope de 5 MB es el que anuncia la pantalla, y los tipos se limitan a
-- imagen: un PDF o un ejecutable en este bucket no tienen ningún uso legítimo.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias',
  'evidencias',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- El anónimo solo puede DEPOSITAR. No lee, no cambia y no borra: ni lo suyo.
drop policy if exists evidencias_subida on storage.objects;
create policy evidencias_subida on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'evidencias');

-- Y solo el personal que revisa puede mirarlas.
drop policy if exists evidencias_lectura_interna on storage.objects;
create policy evidencias_lectura_interna on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and tiene_rol(array['admin', 'revisor']::rol_interno[])
  );

-- ---------------------------------------------------------------------------
-- Paso 1: pedir sitio donde subir
--
-- Devuelve la ruta, o lanza con el motivo exacto. Todo lo que puede impedir la
-- entrega se comprueba AQUÍ, antes de que la persona gaste datos móviles
-- subiendo una foto que se iba a rechazar igual.
-- ---------------------------------------------------------------------------
create or replace function fn_evidencia_preparar(
  p_folio text,
  p_credencial text,
  p_dia smallint
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_su_dia smallint;
  v_intentos smallint;
  v_estado estado_evidencia;
  v_ruta text;
begin
  perform privado.limitar('evidencia', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  select dia into v_su_dia from participantes where id = v_id;

  if not exists (select 1 from dias_evento where dia = p_dia) then
    raise exception 'Ese día no forma parte del evento' using errcode = 'no_data_found';
  end if;

  -- La evidencia es de los días que NO le tocó asistir. Hasta ahora esto solo
  -- vivía en `v_elegibles`, que no consulta ninguna pantalla: alguien podía
  -- entregar la del día en que estuvo presente y contarla para su constancia.
  if p_dia = v_su_dia then
    raise exception 'El día % es el que te toca asistir en persona: su evidencia no se entrega', p_dia
      using errcode = 'check_violation';
  end if;

  select intentos, estado into v_intentos, v_estado
    from evidencias
   where participante_id = v_id and dia = p_dia;

  if v_estado = 'aprobada' then
    raise exception 'Tu evidencia del día % ya está aprobada', p_dia
      using errcode = 'check_violation';
  end if;

  if coalesce(v_intentos, 0) >= 3 then
    raise exception 'Ya usaste tus 3 intentos del día %. Escríbenos y lo revisamos', p_dia
      using errcode = 'check_violation';
  end if;

  /*
   * La ruta lleva el uuid del participante por delante para que las cinco mil
   * imágenes queden repartidas y no en una sola carpeta, y un uuid propio al
   * final para que reintentar no pise el archivo anterior: si la confirmación
   * se pierde, el objeto viejo queda huérfano en vez de corromper el nuevo.
   */
  v_ruta := format('%s/dia-%s-%s', v_id, p_dia, gen_random_uuid());

  -- Se reserva la fila con la ruta prometida, todavía sin entregar. El `check`
  -- de la tabla solo exige archivo y hash cuando el estado NO es
  -- `no_entregada`, así que esto es legal y es lo que permite al paso 3
  -- comprobar que la ruta es la que se emitió.
  insert into evidencias (participante_id, dia, archivo_url, estado)
  values (v_id, p_dia, v_ruta, 'no_entregada')
  on conflict (participante_id, dia) do update
    set archivo_url = excluded.archivo_url,
        estado = 'no_entregada',
        hash_archivo = null,
        subida_en = null;

  return v_ruta;
end;
$$;

revoke all on function fn_evidencia_preparar(text, text, smallint)
  from public, anon, authenticated;
grant execute on function fn_evidencia_preparar(text, text, smallint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paso 3: confirmar que el archivo está arriba
--
-- Solo acepta la ruta que el paso 1 emitió para esa persona y ese día. Sin esa
-- comprobación, cualquiera podría apuntar la fila de otro a un objeto suyo.
-- ---------------------------------------------------------------------------
create or replace function fn_evidencia_confirmar(
  p_folio text,
  p_credencial text,
  p_dia smallint,
  p_ruta text,
  p_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prometida text;
begin
  perform privado.limitar('evidencia', 20, interval '10 minutes');

  v_id := fn_autenticar_portal(p_folio, p_credencial);
  if v_id is null then
    raise exception 'Folio o credencial incorrectos' using errcode = 'invalid_password';
  end if;

  -- El formato del hash lo exige también la tabla; comprobarlo aquí permite
  -- decirlo con palabras en vez de con el nombre de una restricción.
  if p_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'La huella del archivo no tiene la forma esperada'
      using errcode = 'check_violation';
  end if;

  select archivo_url into v_prometida
    from evidencias
   where participante_id = v_id and dia = p_dia;

  if v_prometida is null or v_prometida is distinct from p_ruta then
    raise exception 'Esa ruta no corresponde a tu entrega. Vuelve a empezar la subida'
      using errcode = 'check_violation';
  end if;

  update evidencias
     set hash_archivo = p_hash,
         subida_en = now(),
         estado = 'pendiente',
         intentos = intentos + 1
   where participante_id = v_id and dia = p_dia;
end;
$$;

revoke all on function fn_evidencia_confirmar(text, text, smallint, text, text)
  from public, anon, authenticated;
grant execute on function fn_evidencia_confirmar(text, text, smallint, text, text)
  to anon, authenticated;

comment on function fn_evidencia_preparar is
  'Paso 1 de la entrega: valida credencial, día y tope, y devuelve la ruta a la que subir.';
comment on function fn_evidencia_confirmar is
  'Paso 3 de la entrega: valida que la ruta sea la emitida y pasa la evidencia a pendiente.';
