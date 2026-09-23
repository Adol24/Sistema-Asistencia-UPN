-- =============================================================================
-- Limpieza de los datos que deja `bun run probar-sistema --escribe`
--
-- NO es una migración, y por eso vive fuera de `migrations/`: no se aplica al
-- desplegar. Es para pegar en el editor SQL de Supabase cuando se quieran
-- retirar los participantes de prueba.
--
-- Por qué hace falta a mano
-- -------------------------
-- El comprobante corre con la clave anónima, y `participantes` está cerrada a
-- esa clave. Tampoco hay ninguna función de baja expuesta, y así debe seguir:
-- una puerta que permita borrar participantes desde fuera es exactamente lo que
-- no queremos que exista. Así que el comprobante puede crear sus datos y no
-- puede retirarlos, y eso es correcto aunque sea incómodo.
--
-- Cómo se reconocen
-- -----------------
-- Todo lo que crea lleva correo `qa-*@prueba.invalid` —`.invalid` es el dominio
-- que el RFC 2606 reserva para esto, así que no existe ni puede existir— e
-- institución «PRUEBA AUTOMATIZADA». No hay forma de confundirlos con una
-- persona de verdad.
--
-- El orden NO es opcional
-- -----------------------
-- `evidencias`, `asistencias`, `pagos` y `casos_soporte` referencian a
-- `participantes` con `on delete restrict`: borrar al participante primero lo
-- rechaza la base. `avisos_participante` va con `cascade` y `revisiones` cuelga
-- de `evidencias`, así que esas dos se van solas.
--
-- Los archivos del bucket NO se pueden borrar desde aquí
-- ------------------------------------------------------
-- La primera versión de este archivo lo intentaba con un
-- `delete from storage.objects`, y Supabase lo rechaza:
--
--   ERROR 42501: Direct deletion from storage tables is not allowed.
--   Use the Storage API instead.
--   CONTEXT: PL/pgSQL function storage.protect_delete()
--
-- Hay un disparador puesto a propósito para que un `delete` en SQL no deje
-- archivos sin fila que los referencie. O sea que Storage protege exactamente
-- lo que aquí se quería hacer a mano.
--
-- Así que los archivos se retiran APARTE, desde el panel, y por eso el paso 1
-- los lista: sus rutas viven en `evidencias.archivo_url`, y una vez borradas
-- esas filas ya no habría de dónde sacarlas. Apúntalas antes de correr el
-- paso 2.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · MIRAR ANTES DE BORRAR
--
-- Córrelo solo y revisa lo que sale. Si aparece alguien que no reconoces como
-- de prueba, PARA: el resto del archivo no distingue.
-- ---------------------------------------------------------------------------
select p.folio,
       p.nombre,
       p.correo,
       p.perfil,
       p.dia,
       (select count(*) from evidencias e where e.participante_id = p.id) as evidencias,
       (select count(*) from asistencias a where a.participante_id = p.id) as asistencias,
       (select count(*) from pagos g where g.participante_id = p.id) as pagos
  from participantes p
 where p.correo like 'qa-%@prueba.invalid'
    or p.institucion = 'PRUEBA AUTOMATIZADA'
 order by p.folio;

-- ---------------------------------------------------------------------------
-- 1b · LAS RUTAS DE LOS ARCHIVOS, que hay que apuntar AHORA
--
-- Viven en `evidencias.archivo_url` y el paso 2 borra esas filas, así que
-- después ya no habría de dónde sacarlas. Cópialas antes de seguir: son las que
-- hay que retirar a mano en Storage → bucket `evidencias`.
-- ---------------------------------------------------------------------------
select e.archivo_url as ruta_en_el_bucket, p.folio, e.dia, e.estado
  from evidencias e
  join participantes p on p.id = e.participante_id
 where (p.correo like 'qa-%@prueba.invalid' or p.institucion = 'PRUEBA AUTOMATIZADA')
   and e.archivo_url is not null
 order by p.folio, e.dia;

-- ---------------------------------------------------------------------------
-- 2 · BORRAR
--
-- En una transacción: o se va todo o no se va nada. A medias quedaría un
-- participante sin sus pagos, que es peor que no haber empezado.
-- ---------------------------------------------------------------------------
begin;

create temporary table qa_ids on commit drop as
select id from participantes
 where correo like 'qa-%@prueba.invalid'
    or institucion = 'PRUEBA AUTOMATIZADA';

-- Las cuatro de `restrict`, antes que su participante.
delete from evidencias    where participante_id in (select id from qa_ids);
delete from asistencias   where participante_id in (select id from qa_ids);
delete from pagos         where participante_id in (select id from qa_ids);
delete from casos_soporte where participante_id in (select id from qa_ids);

-- `avisos_participante` se va en cascada con esto, y `revisiones` ya se fue con
-- las evidencias.
delete from participantes where id in (select id from qa_ids);

commit;

-- ---------------------------------------------------------------------------
-- 3 · LOS ARCHIVOS, en el panel
--
-- Storage → bucket `evidencias` → borra las rutas que anotaste en el paso 1b.
-- Están en carpetas con el uuid del participante por delante, así que la carpeta
-- entera es de esa persona y se puede quitar de una vez.
--
-- Esto no se puede hacer en SQL: `storage.protect_delete()` lo impide a
-- propósito, para que un `delete` no deje archivos sin fila que los referencie.
-- Aquí el efecto es el contrario —la fila ya no está y el archivo sí— pero el
-- disparador no distingue, y tampoco tiene por qué.
--
-- Si se olvidan, tampoco pasa gran cosa: son objetos que ninguna fila
-- referencia, en un bucket privado al que el anónimo no puede ni asomarse.
-- Ocupan sitio y nada más.
--
-- ---------------------------------------------------------------------------
-- 4 · COMPROBAR
--
-- La primera consulta tiene que devolver cero, y el aforo de cada día debería
-- haber bajado en tantos lugares como participantes de prueba había.
-- ---------------------------------------------------------------------------
select count(*) as participantes_de_prueba_restantes
  from participantes
 where correo like 'qa-%@prueba.invalid'
    or institucion = 'PRUEBA AUTOMATIZADA';

select dia, cupo, ocupados, disponibles from v_cupo_dia order by dia;
