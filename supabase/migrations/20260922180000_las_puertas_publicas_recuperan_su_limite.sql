-- =============================================================================
-- 50 · Las puertas públicas recuperan su límite por IP
--
-- Cómo se perdió
-- --------------
-- La migración 13 puso `privado.limitar` y la llamó desde tres sitios:
-- `fn_padron_existe`, `fn_padron_confirmar` y el acceso del personal. Hoy el
-- limitador solo se invoca desde DOS de esos tres, y la tercera llamada no la
-- quitó nadie a propósito: **se perdió en una redefinición posterior.**
--
-- `fn_padron_confirmar` se volvió a escribir en la migración 20260910200000
-- —cuyo único objeto era añadir el campo `dia` al JSON de respuesta— copiando
-- el cuerpo sin la primera línea y devolviéndola a `stable`, que es justo la
-- volatilidad que impide registrar el intento. Desde entonces el reto de
-- identidad del alumno no tiene ningún tope del lado del servidor: el único
-- freno es `INTENTOS = 3` en `confirmar-nombre.tsx`, que es estado de React y
-- muere al recargar la página.
--
-- Es la clase de regresión que no deja huella: la función siguió contestando
-- bien, las pruebas manuales siguieron pasando, y el comentario del cliente
-- —«la función lleva además el límite por IP»— siguió afirmando algo que había
-- dejado de ser cierto.
--
-- Qué más se cierra aquí
-- ----------------------
-- Dos puertas que nunca lo tuvieron y que hoy son enumeradores:
--
-- `fn_ventana_de_matricula` devuelve NULL para una matrícula que no está en el
-- padrón y una frase para una que sí está. Su propio comentario afirma que «una
-- matrícula que no está en el padrón no se distingue aquí», y no es verdad: es
-- un oráculo de sí/no, concedido a `anon`, sin tope. Con él se reconstruye la
-- lista de matrículas válidas sin tocar `fn_padron_existe`, que es la que sí
-- lleva el suyo. Aquí se le pone el mismo tope que a su hermana; igualar además
-- las dos respuestas cambiaría lo que lee una persona de verdad, y eso es otra
-- decisión que no se toma de paso en una migración de seguridad.
--
-- `fn_abrir_caso_nombre` escribe en `casos_soporte` y en `bitacora` desde el rol
-- anónimo, sin credencial y sin tope. No pide más que un uuid de participante,
-- y además SOBRESCRIBE el detalle de un caso abierto que ya exista. Un bucle
-- deja la bandeja de soporte inservible el día del evento y machaca el texto de
-- los casos legítimos sin resolver. El tope no arregla que no pida credencial
-- —eso exige cambiarle la firma, y va aparte— pero sí lo saca de «gratis».
--
-- Lo que NO se toca
-- -----------------
-- `fn_portal_estado` se queda sin tope **a propósito**, y conviene que quede
-- dicho por qué: el portal se refresca solo cada veinte segundos, así que una
-- persona sentada mirando su estado gasta tres llamadas por minuto. Cualquier
-- tope lo bastante bajo para estorbar a un barrido la echaría a ella primero.
-- Eso se arregla espaciando el refresco, no limitando la puerta, y es un cambio
-- del cliente que va en su propio turno.
--
-- Las altas —`fn_preregistrar_alumno` y `fn_preregistrar_externo`— tampoco se
-- tocan aquí, y no por falta de ganas: su rama reentrante devuelve el folio de
-- cualquiera a cambio de su matrícula, que es el agujero más grande de los dos.
-- Pero arreglarlo bien exige cambiarles la firma y revisar ciento cincuenta
-- líneas de cuerpo, y meter eso en la misma migración que tres reposiciones
-- quirúrgicas es cómo se rompen las cosas. Va en la siguiente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- El reto de identidad del alumno, con su tope de vuelta
--
-- Cuerpo idéntico al de la 20260910200000. Lo único que cambia son las dos
-- cosas que aquella perdió: la llamada al limitador y `volatile` en vez de
-- `stable`. Las dos van juntas y no se pueden separar —una función `stable` no
-- puede registrar el intento, que es escribir— y separarlas es exactamente lo
-- que pasó la vez anterior.
-- ---------------------------------------------------------------------------
create or replace function fn_padron_confirmar(
  p_matricula text,
  p_nombres text,
  p_programa text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_nombre text;
  v_programa text;
  v_partes text[];
  v_reales text[];
  v jsonb;
begin
  perform privado.limitar('padron_confirmar', 10, interval '10 minutes');

  select a.nombre, pr.nombre
    into v_nombre, v_programa
    from padron_alumnos a
    join programas pr on pr.id = a.programa_id
   where a.matricula = trim(p_matricula);

  -- Matrícula inexistente y reto fallido devuelven lo mismo a propósito: si se
  -- distinguieran, la diferencia ya sería un buscador de matrículas válidas.
  if v_nombre is null then
    return null;
  end if;

  v_partes := regexp_split_to_array(
    trim(regexp_replace(upper(unaccent(coalesce(p_nombres, ''))), '\s+', ' ', 'g')), ' '
  );
  v_reales := regexp_split_to_array(
    trim(regexp_replace(upper(unaccent(v_nombre)), '\s+', ' ', 'g')), ' '
  );

  if coalesce(array_length(v_partes, 1), 0) = 0
     or array_length(v_partes, 1) > array_length(v_reales, 1)
     or v_partes <> v_reales[1:array_length(v_partes, 1)]
     or upper(unaccent(trim(coalesce(p_programa, '')))) <> upper(unaccent(v_programa)) then
    return null;
  end if;

  select jsonb_build_object(
           'matricula', a.matricula,
           'nombre', a.nombre,
           'nivel', n.nivel,
           'programa', pr.nombre,
           'avance', a.avance,
           'etiqueta_avance', n.etiqueta_avance,
           'grupo', a.grupo,
           'plantel', pl.nombre,
           -- El día que le repartió Servicios Escolares. Puede ser NULL si
           -- todavía no se ha repartido, y la pantalla lo distingue: con día
           -- acota el catálogo de talleres, sin día lo enseña entero y avisa.
           'dia', a.dia,
           'ya_registrado', exists (
             select 1 from participantes p where p.matricula = a.matricula
           )
         )
    into v
    from padron_alumnos a
    join niveles_academicos n on n.id = a.nivel_id
    join programas pr on pr.id = a.programa_id
    join planteles pl on pl.id = a.plantel_id
   where a.matricula = trim(p_matricula);

  return v;
end;
$$;

revoke all on function fn_padron_confirmar(text, text, text) from public, anon, authenticated;
grant execute on function fn_padron_confirmar(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El anuncio de la ventana, que era un oráculo gratuito
--
-- Mismo tope que `fn_padron_existe` —30 cada diez minutos— porque se consulta
-- en el mismo momento del recorrido y por la misma persona: una vez al
-- confirmar identidad. Treinta deja sitio de sobra a quien recarga, y quita el
-- barrido de diez mil matrículas en una tarde.
-- ---------------------------------------------------------------------------
create or replace function fn_ventana_de_matricula(p_matricula text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_a record;
begin
  perform privado.limitar('ventana_matricula', 30, interval '10 minutes');

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
-- El caso de nombre, que escribía gratis desde el rol anónimo
--
-- Diez cada diez minutos: una persona abre UNO en todo su recorrido, y quien
-- vuelva atrás a corregirlo otra vez cabe de sobra. El cuerpo no cambia.
-- ---------------------------------------------------------------------------
create or replace function fn_abrir_caso_nombre(
  p_participante uuid,
  p_nombre_correcto text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_clave text;
  v_detalle text;
begin
  perform privado.limitar('abrir_caso_nombre', 10, interval '10 minutes');

  select nombre into v_nombre from participantes where id = p_participante;
  if v_nombre is null then
    raise exception 'No existe ese participante' using errcode = 'no_data_found';
  end if;

  v_detalle := format(
    'Dice "%s" y debe decir "%s". Lo reportó el alumno al confirmar su nombre.',
    v_nombre, p_nombre_correcto
  );

  update casos_soporte
     set detalle = v_detalle
   where participante_id = p_participante
     and asunto = 'Nombre incorrecto en el registro'
     and estado <> 'resuelto'
  returning clave into v_clave;

  if v_clave is not null then
    return v_clave;
  end if;

  insert into casos_soporte (participante_id, asunto, detalle, canal)
  values (p_participante, 'Nombre incorrecto en el registro', v_detalle, 'portal')
  returning clave into v_clave;

  insert into bitacora (usuario_texto, accion, detalle)
  values ('Pre-registro en línea', 'Abrió un caso de nombre',
          format('%s · %s → %s', v_clave, v_nombre, p_nombre_correcto));

  return v_clave;
end;
$$;

revoke all on function fn_abrir_caso_nombre(uuid, text) from public, anon, authenticated;
grant execute on function fn_abrir_caso_nombre(uuid, text) to anon, authenticated;

comment on function fn_padron_confirmar is
  'El reto de identidad del alumno. Lleva tope por IP: sin él es un cosechador de nombres.';
comment on function fn_ventana_de_matricula is
  'Cuándo le toca registrarse a esa matrícula. Lleva tope por IP: sin él es un oráculo del padrón.';
comment on function fn_abrir_caso_nombre is
  'Abre o actualiza el caso de nombre del participante. Lleva tope por IP: escribe desde el rol anónimo.';
