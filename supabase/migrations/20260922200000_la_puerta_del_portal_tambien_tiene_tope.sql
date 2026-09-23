-- =============================================================================
-- 51 · La puerta del portal también tiene tope
--
-- Lo que quedó abierto en la 50
-- -----------------------------
-- La migración anterior repuso los topes de las puertas del padrón y dejó dicho
-- por qué NO tocaba esta: el portal se refrescaba solo cada veinte segundos, así
-- que una persona sentada mirando su estado gastaba tres llamadas por minuto.
-- Cualquier tope lo bastante bajo para estorbar a un barrido la habría echado a
-- ella primero.
--
-- Eso ya no es cierto: el refresco pasó a tres minutos en el mismo cambio que
-- trae esta migración. El portal no enseña nada que cambie más rápido —un pago
-- que se registra en ventanilla, una evidencia que se revisa— y tres minutos
-- siguen siendo más rápido que preguntar en la mesa de incidencias.
--
-- Por qué hacía falta
-- -------------------
-- `fn_autenticar_portal` está concedida a `anon`, no registra ni limita
-- intentos, y los folios son una secuencia: `'PRE-' || lpad(nextval(...), 5)`.
-- Quien conozca UNA matrícula —van impresas en la credencial y circulan en los
-- grupos de clase— puede recorrer `PRE-00801`…`PRE-02800` hasta dar con el par
-- válido, sin encontrarse un solo 429. Con el par entra al portal y lee nombre,
-- correo, celular, matrícula, programa, plantel, grupo, montos y estado de pago
-- de esa persona.
--
-- Un solo contador para las dos puertas
-- -------------------------------------
-- `fn_portal_estado` llama a `fn_autenticar_portal` por dentro para volver a
-- comprobar la credencial. Poniendo el tope en la segunda quedan cubiertas las
-- dos —la entrada y cada refresco— **con un único contador**, en vez de dos que
-- se gastarían a la vez y obligarían a duplicar el margen.
--
-- Y `fn_portal_estado` solo necesita cambiar de volatilidad, no de cuerpo: una
-- función `stable` corre en transacción de solo lectura y no podría registrar
-- el intento de la que llama. `alter function` lo hace sin tocar sus sesenta
-- líneas de `jsonb_build_object`, que es exactamente el tipo de reescritura por
-- copia que perdió el limitador de `fn_padron_confirmar` en su día.
--
-- El tope: cuarenta cada diez minutos
-- -----------------------------------
-- Una persona en su portal gasta, como mucho: una entrada, un refresco cada
-- tres minutos —tres o cuatro en la ventana— y una carga por cada una de las
-- cuatro pantallas que visite. Quince largos. Cuarenta deja el doble de margen
-- para quien recarga de nervios, y a quien barre lo deja en cuarenta pares por
-- diez minutos, que contra 2000 folios cruzados con cada matrícula no llega a
-- ninguna parte.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- La puerta, ahora con contador
--
-- Pasa de `language sql` a `plpgsql` porque hay que ejecutar algo antes de la
-- consulta. El `select` es el mismo, letra por letra: folio exacto, y la
-- credencial vale como matrícula o como correo.
-- ---------------------------------------------------------------------------
create or replace function fn_autenticar_portal(p_folio text, p_credencial text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform privado.limitar('portal', 40, interval '10 minutes');

  select id
    into v_id
    from participantes
   where folio = upper(trim(p_folio))
     and (
       matricula = trim(p_credencial)
       or lower(correo) = lower(trim(p_credencial))
     );

  return v_id;
end;
$$;

revoke all on function fn_autenticar_portal(text, text) from public, anon, authenticated;
grant execute on function fn_autenticar_portal(text, text) to anon, authenticated;

comment on function fn_autenticar_portal is
  'Folio más matrícula o correo. Es la única puerta del participante a sus datos, '
  'y lleva tope por IP: los folios son correlativos y sin tope se recorren enteros.';

-- ---------------------------------------------------------------------------
-- Y el estado del portal, que la llama
--
-- Solo cambia la volatilidad. El cuerpo no se toca: reescribir sesenta líneas
-- de `jsonb_build_object` para cambiar una palabra es justo cómo se perdió el
-- limitador de `fn_padron_confirmar` —una copia que olvidó una línea— y no hay
-- ninguna necesidad de correr ese riesgo teniendo `alter function`.
-- ---------------------------------------------------------------------------
alter function fn_portal_estado(text, text) volatile;

comment on function fn_portal_estado is
  'Todo lo que el portal muestra, en una llamada. El tope por IP lo pone '
  'fn_autenticar_portal, a la que llama para revalidar la credencial.';
