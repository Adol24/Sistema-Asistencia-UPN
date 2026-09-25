-- =============================================================================
-- La entrega es en Aportaciones
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924200000_la_entrega_es_en_aportaciones`.
--
-- Dónde se entrega el voucher
-- ---------------------------
-- La configuración decía «Servicios Financieros, Edificio A, planta baja» y un
-- horario de «Lunes a viernes de 9:00 a 17:00 hrs». Los dos venían sembrados de
-- la migración de datos iniciales, cuando no había ni departamento ni
-- calendario que poner, y los dos son falsos aquí:
--
--   · La entrega es en el **Departamento de Aportaciones**. Sin edificio ni
--     planta: en la UPN 212 el departamento se pregunta por su nombre, y un
--     «Edificio A» inventado manda a la gente a buscar una letra que no está
--     rotulada en ninguna pared.
--   · El horario de atención se vacía porque **no hay semana de entrega**: hay
--     un día, con su hora, y eso ya lo dice la fecha de entrega. Anunciar
--     «lunes a viernes» al lado de un solo día es contradecirse en dos
--     renglones, y el que se equivoca pierde el registro.
--
-- Vaciar el horario no rompe nada: `/comprobante` ya lo dibujaba solo si traía
-- algo, y `/pago` deja de pedirlo en el mismo cambio. La columna se queda —el
-- panel la sigue editando— porque el año que la entrega dure una semana se
-- vuelve a llenar sin tocar la base.
-- =============================================================================

update configuracion_evento
   set ventanilla_lugar   = 'Departamento de Aportaciones',
       ventanilla_horario = ''
 where id = 1;

/*
 * Que la fila quedó así, y no como dice la intención.
 *
 * Un `update` que no encuentra la fila afecta cero filas y Postgres lo da por
 * bueno; este archivo se pega a mano en el editor SQL, donde nadie lee el
 * «UPDATE 0».
 */
do $$
declare
  fila configuracion_evento%rowtype;
begin
  select * into fila from configuracion_evento where id = 1;

  if not found then
    raise exception 'No hay configuracion_evento con id = 1: el lugar de entrega no se guardó en ningún lado.';
  end if;

  if fila.ventanilla_lugar <> 'Departamento de Aportaciones' or fila.ventanilla_horario <> '' then
    raise exception 'La ventanilla quedó como «%» con horario «%», y debe ser «Departamento de Aportaciones» sin horario.',
      fila.ventanilla_lugar, fila.ventanilla_horario;
  end if;

  raise notice 'Entrega de vouchers: % · el día y la hora los dice fecha_limite (%)',
    fila.ventanilla_lugar, fila.fecha_limite;
end
$$;
