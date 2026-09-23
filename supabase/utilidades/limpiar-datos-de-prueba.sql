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

-- Los archivos del bucket van PRIMERO, mientras todavía se sabe de quién eran:
-- la ruta lleva el uuid del participante por delante —ver `fn_evidencia_preparar`—
-- y una vez borrada la fila no habría por dónde encontrarlos. Quedarían como
-- objetos huérfanos que nadie referencia y que nadie sabría identificar.
delete from storage.objects o
 using qa_ids q
 where o.bucket_id = 'evidencias'
   and o.name like q.id::text || '/%';

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
-- 3 · COMPROBAR
--
-- Las dos consultas tienen que devolver cero. El aforo de cada día debería
-- haber bajado en tantos lugares como participantes de prueba había.
-- ---------------------------------------------------------------------------
select count(*) as participantes_de_prueba_restantes
  from participantes
 where correo like 'qa-%@prueba.invalid'
    or institucion = 'PRUEBA AUTOMATIZADA';

select count(*) as archivos_de_prueba_restantes
  from storage.objects
 where bucket_id = 'evidencias'
   and name not in (select archivo_url from evidencias where archivo_url is not null);

select dia, cupo, ocupados, disponibles from v_cupo_dia order by dia;
