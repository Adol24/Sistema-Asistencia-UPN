-- =============================================================================
-- El aviso ya no promete un taller que nadie puede elegir
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260926140000_el_aviso_ya_no_promete_otro_taller`.
--
-- Qué cambia
-- ----------
-- Nada del esquema ni de ninguna función: solo el TEXTO de las filas que ya
-- están en `avisos_participante`. Las que dicen «Puedes elegir otro taller»
-- dejan de decirlo.
--
-- Por qué
-- -------
-- Esos avisos se escribieron cuando cambiar de día liberaba la inscripción al
-- taller, y entonces la frase era verdad: quien perdía su lugar podía volver a
-- `/talleres` y elegir otro. Desde
-- `20260923140000_el_taller_no_depende_del_dia_del_evento` no lo es, y no por
-- descuido: el taller no se cambia una vez cerrado el pre-registro.
--
-- Hoy `fn_cambiar_taller` está revocada a `public`, `anon` y `authenticated`, y
-- solo la llaman `fn_preregistrar_alumno` y `fn_preregistrar_externo`. Ninguna
-- otra sentencia viva escribe `participantes.taller_id`. O sea que NO existe
-- ninguna pantalla —pública ni interna— capaz de cumplir esa frase: ni el
-- portal, ni soporte, ni administración.
--
-- Y la frase se sigue leyendo. `fn_portal_estado` devuelve los avisos con
-- `visto_en is null`, así que cualquiera de esas filas le aparece hoy en
-- `/portal/estado` a la persona a la que se le liberó el taller, y la manda a un
-- sitio donde no puede hacer lo que se le dice. El botón «Elegir otro taller»
-- que la acompañaba ya se quitó de esa pantalla; el texto vive en la base y no
-- se fue con él.
--
-- Por qué solo la segunda frase
-- -----------------------------
-- La primera —«Cambiaste al día 2 y el taller «T07» no se imparte ese día, así
-- que tu inscripción se liberó»— sigue siendo cierta, y es la que lleva el dato
-- que la persona necesita: cuál era su taller. Se reescribe la promesa y se
-- conserva el hecho. Por eso esto es un `replace` de un trozo exacto y no un
-- texto nuevo: un texto nuevo tendría que reconstruir el día y la clave del
-- taller, y la fila no los guarda por separado — se interpolaron con `format` al
-- escribirla y ahí se quedaron, dentro de la cadena.
--
-- Por qué solo las que nadie ha marcado
-- -------------------------------------
-- `visto_en is null` es exactamente el conjunto que `fn_portal_estado` puede
-- devolver, o sea lo único que alguien puede llegar a leer. Una fila marcada
-- como vista es el registro de lo que ya se le dijo a esa persona, y
-- reescribirla no le ahorra nada a nadie: solo borra lo que constaba. Mismo
-- criterio que los pagos, que se corrigen con otro registro y su nota, no
-- haciendo desaparecer el anterior.
--
-- Qué NO arregla
-- --------------
-- El aviso queda diciendo a dónde preguntar, no que se le vaya a cambiar el
-- taller. Es la misma salida que da `/confirmar-nombre` a quien vuelve con su
-- pre-registro hecho, y es lo único que este sistema puede sostener mientras no
-- exista una pantalla que cambie el taller de un inscrito.
--
-- Cuándo lo ve
-- ------------
-- El portal pregunta cada tres minutos con la pestaña al frente, así que no hay
-- nada que avisar ni que invalidar: la siguiente llamada a `fn_portal_estado` ya
-- trae el texto nuevo.
--
-- Se puede volver a aplicar
-- -------------------------
-- `replace` sobre una fila ya reescrita no encuentra nada que sustituir, así que
-- correrla dos veces deja lo mismo que correrla una.
-- =============================================================================

do $fn$
declare
  -- Los dos textos que llegaron a escribirse, literales. El largo salió de
  -- `fn_reasignar_dia` y de `fn_asignar_dia_a_varios` —cambiar de día—; el corto
  -- de `fn_guardar_taller` —quitarle a un taller el día en que se imparte—. Las
  -- tres dejaron de producirlos en la migración 60.
  c_promesa_larga constant text :=
    'Puedes elegir otro taller; si ya lo habías pagado, acude a Servicios Financieros.';
  c_promesa_corta constant text :=
    'Puedes elegir otro; si ya lo habías pagado, acude a Servicios Financieros.';
  c_verdad constant text :=
    'Desde tu portal ya no se elige otro taller: pregúntanos por WhatsApp si '
    'necesitas algo con él. Si ya lo habías pagado, acude a Servicios Financieros.';
  v_larga integer;
  v_corta integer;
  v_quedan integer;
  v_productoras integer;
  r record;
begin
  -- -------------------------------------------------------------------------
  -- 1 · Que no haya quedado nadie produciéndolo
  --
  -- Reescribir las filas no sirve de nada si una función sigue insertando la
  -- promesa: volvería con el siguiente cambio de día. Se le pregunta al
  -- catálogo, que es el cuerpo vivo de las funciones y no el archivo que las
  -- escribió.
  --
  -- Si aparece alguna, esto se detiene y no reescribe nada: significaría que la
  -- migración 60 no está puesta en esta base, y entonces el problema es ese y no
  -- el texto.
  -- -------------------------------------------------------------------------
  v_productoras := 0;
  for r in
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc like '%Puedes elegir otro%'
     order by p.proname
  loop
    v_productoras := v_productoras + 1;
    raise warning 'Todavía escribe la promesa: %', r.proname;
  end loop;

  if v_productoras > 0 then
    raise exception
      'Hay % funciones que siguen insertando «Puedes elegir otro». Aplica primero '
      '20260923140000_el_taller_no_depende_del_dia_del_evento.', v_productoras
      using errcode = 'check_violation';
  end if;

  -- -------------------------------------------------------------------------
  -- 2 · Los dos textos, reescritos
  --
  -- `strpos` y no `like`: el trozo que se busca es texto literal, y con `like`
  -- habría que confiar en que no lleve nunca un `%` ni un `_`. Hoy no los lleva,
  -- y esa es justo la clase de suposición que deja de ser verdad sin avisar.
  --
  -- Los dos trozos son disjuntos —el largo dice «otro taller;» donde el corto
  -- dice «otro;»— así que ninguna fila cae en los dos y el orden no importa.
  -- -------------------------------------------------------------------------
  update avisos_participante
     set texto = replace(texto, c_promesa_larga, c_verdad)
   where visto_en is null
     and strpos(texto, c_promesa_larga) > 0;
  get diagnostics v_larga = row_count;

  update avisos_participante
     set texto = replace(texto, c_promesa_corta, c_verdad)
   where visto_en is null
     and strpos(texto, c_promesa_corta) > 0;
  get diagnostics v_corta = row_count;

  raise notice 'Avisos reescritos: % del cambio de día, % de la baja de un taller.',
    v_larga, v_corta;

  if v_larga + v_corta = 0 then
    raise notice
      'Ninguna fila lo decía. Es el resultado esperado si nunca se movió a nadie '
      'de día antes del 2026-09-23.';
  end if;

  -- -------------------------------------------------------------------------
  -- 3 · Que no quede ninguna variante sin reescribir
  --
  -- Se busca la promesa suelta, sin su final: si alguien de soporte la escribió
  -- a mano con otras palabras, esta migración no la conoce y hay que verla en
  -- vez de darla por corregida.
  -- -------------------------------------------------------------------------
  v_quedan := 0;
  for r in
    select av.id, left(av.texto, 140) as inicio
      from avisos_participante av
     where av.visto_en is null
       and strpos(av.texto, 'Puedes elegir otro') > 0
     order by av.creado_en
  loop
    v_quedan := v_quedan + 1;
    raise warning 'Aviso % sigue prometiéndolo: %', r.id, r.inicio;
  end loop;

  if v_quedan > 0 then
    raise exception
      '% avisos siguen prometiendo elegir otro taller, con palabras que esta '
      'migración no conoce. Míralos arriba y reescríbelos a mano.', v_quedan
      using errcode = 'check_violation';
  end if;
end $fn$;
