-- =============================================================================
-- 1200 · Evidencias más ligeras
--
-- El bucket `evidencias` vive en el plan GRATIS de Supabase: 1 GB de
-- almacenamiento. Con ~1,500 alumnos confirmados y dos evidencias cada uno
-- —ver `EVIDENCIAS_REQUERIDAS` en `src/lib/elegibilidad.ts`—, son hasta 3,000
-- fotos. Al tope viejo de 5 MB cada una, el peor caso eran 14-15 GB: catorce
-- veces el límite del plan.
--
-- La pantalla (`src/routes/portal.evidencias.tsx`) ya comprime la foto en el
-- navegador antes de subirla —`src/lib/imagen.ts`, reescalada y reencodada
-- como JPEG—, así que en el camino normal una evidencia pesa unos cientos de
-- KB, no varios MB. Este tope del bucket deja de ser el anuncio de la
-- pantalla y pasa a ser lo que de verdad importa: la última defensa para
-- cuando ese paso no pudo comprimir nada —un formato que el navegador no supo
-- decodificar— y la foto original todavía pesa de más.
--
-- 2 MB y no menos: es varias veces más que lo que deja la compresión normal,
-- así que no le cierra la puerta a nadie que de verdad comprimió su foto; solo
-- destapa el caso raro de una foto sin comprimir.
-- =============================================================================

do $$
declare
  v_filas integer;
begin
  update storage.buckets
     set file_size_limit = 2097152
   where id = 'evidencias';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise warning 'El bucket evidencias no existe. ¿Falta correr 20260922220000 primero?';
  end if;
end;
$$;
