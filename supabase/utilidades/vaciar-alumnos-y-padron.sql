-- =============================================================================
-- Vaciar TODO lo que es de los alumnos: padrón, registros y lo que cuelga
--
-- NO es una migración, y por eso vive fuera de `migrations/`: no se aplica al
-- desplegar. Es para pegar en el editor SQL de Supabase, a mano, sabiendo lo
-- que se hace.
--
-- ⚠ ESTO NO SE DESHACE
-- --------------------
-- No hay papelera ni historial. Lo que se borre aquí solo vuelve desde una
-- copia de seguridad del proyecto, y eso se pide desde el panel de Supabase
-- ANTES, no después. Si nunca has hecho una, hazla ahora: Database → Backups.
--
-- ⚠ Y EL REGISTRO PUEDE ESTAR ABIERTO
-- -----------------------------------
-- La ventana de séptimo abre el 24 de septiembre. Si esto se corre con el
-- registro en marcha, se borra también a quien acabe de registrarse hace un
-- minuto: se queda con un folio impreso que ya no existe en ninguna parte, y
-- sin forma de entrar a su portal. El paso 0 dice cuántos hay; míralo.
--
-- Qué se borra, y qué NO
-- ----------------------
-- SE BORRA todo lo que es de una persona concreta:
--
--   padron_alumnos        quiénes están invitados
--   participantes         quiénes se registraron, con su folio
--   pagos                 depósitos y vouchers registrados
--   asistencias           entradas y salidas de la puerta
--   evidencias            entregas de los días en línea
--   revisiones            quién aprobó o rechazó cada evidencia
--   casos_soporte         incidencias abiertas
--   avisos_participante   avisos que le esperaban en su portal
--
-- NO SE TOCA nada del montaje del evento: talleres, sus días y salones, sedes,
-- planteles, programas, niveles, la configuración, el personal interno, las
-- ventanas de registro, las citas de pago ni el calendario de reinscripción de
-- LEIP. Todo eso se queda listo para volver a empezar.
--
-- `bitacora` tampoco se toca, y es deliberado: es el registro de auditoría —no
-- tiene política de UPDATE ni de DELETE justamente por eso— y su valor está en
-- sobrevivir a lo que audita. Si aun así la quieres vacía, el paso 4 lo dice.
--
-- El orden NO es opcional
-- -----------------------
-- `pagos`, `asistencias`, `evidencias` y `casos_soporte` referencian a
-- `participantes` con `on delete restrict`: intentar borrar al participante
-- primero lo RECHAZA la base. Y `participantes.matricula` referencia a
-- `padron_alumnos` igual, así que el padrón va al final.
--
-- `avisos_participante` va con `cascade` y `revisiones` cuelga de `evidencias`,
-- así que esas dos se irían solas. Se borran explícitas de todas formas: una
-- lista completa se lee mejor que una que da cosas por supuestas.
--
-- Los archivos del bucket NO se van con esto
-- ------------------------------------------
-- Supabase rechaza `delete from storage.objects` —hay un disparador puesto a
-- propósito— así que las imágenes de evidencias y los vouchers subidos se
-- quedan en el bucket, ya sin ninguna fila que los nombre. Se retiran desde el
-- panel: Storage → el bucket → seleccionar y borrar. El paso 0 los cuenta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0 · MIRAR ANTES DE BORRAR
--
-- Córrelo SOLO, y lee lo que sale. Si el número de participantes no es el que
-- esperabas, para aquí: probablemente haya gente registrándose ahora mismo.
-- ---------------------------------------------------------------------------
select 'padron_alumnos'      as tabla, count(*) as filas from padron_alumnos
union all select 'participantes',       count(*) from participantes
union all select 'pagos',               count(*) from pagos
union all select 'asistencias',         count(*) from asistencias
union all select 'evidencias',          count(*) from evidencias
union all select 'revisiones',          count(*) from revisiones
union all select 'casos_soporte',       count(*) from casos_soporte
union all select 'avisos_participante', count(*) from avisos_participante
union all select '— archivos en el bucket que quedarán huérfanos —',
                 count(*) from evidencias where archivo_url is not null
order by 1;

-- Y quiénes son, por si alguno no debería estar ahí. Míralo de verdad: es la
-- última oportunidad de ver un folio que hoy tiene dueño.
select folio, nombre, perfil, dia, matricula, creado_en
  from participantes
 order by creado_en desc
 limit 50;

-- ---------------------------------------------------------------------------
-- 1 · BORRAR. De aquí para abajo ya no hay vuelta atrás.
--
-- Todo en una transacción: o se va entero o no se va nada. Sin esto, un fallo
-- a mitad dejaría participantes sin sus pagos, que es peor que no haber
-- empezado.
-- ---------------------------------------------------------------------------
begin;

delete from revisiones;
delete from evidencias;
delete from asistencias;
delete from pagos;
delete from casos_soporte;
delete from avisos_participante;
delete from participantes;
delete from padron_alumnos;

-- ---------------------------------------------------------------------------
-- 2 · El folio vuelve a empezar
--
-- `seq_folio` arranca en 801 —ver `20260907000600_participantes`— y sigue
-- contando aunque no quede ni un participante. Sin esto, el primero del padrón
-- nuevo no sería PRE-00801 sino el siguiente al último borrado.
--
-- Piénsalo un segundo: si alguien ya anda por ahí con un comprobante impreso,
-- reiniciar la cuenta hará que su folio se le asigne a OTRA persona. Si es el
-- caso, salta este paso.
-- ---------------------------------------------------------------------------
alter sequence seq_folio restart with 801;

-- ---------------------------------------------------------------------------
-- 3 · Comprobar antes de confirmar
--
-- Todavía dentro de la transacción: si algo no cuadra, `rollback` y no ha
-- pasado nada.
-- ---------------------------------------------------------------------------
do $$
declare
  v_quedan integer;
begin
  select (select count(*) from padron_alumnos)
       + (select count(*) from participantes)
       + (select count(*) from pagos)
       + (select count(*) from asistencias)
       + (select count(*) from evidencias)
       + (select count(*) from revisiones)
       + (select count(*) from casos_soporte)
       + (select count(*) from avisos_participante)
    into v_quedan;

  if v_quedan <> 0 then
    raise exception 'Quedan % filas de alumnos. Algo no se borró; haz rollback.', v_quedan;
  end if;

  raise notice 'Las ocho tablas de alumnos están vacías.';
  raise notice 'El catálogo sigue en pie: % talleres, % programas, % planteles.',
    (select count(*) from talleres),
    (select count(*) from programas),
    (select count(*) from planteles);
  raise notice '';
  raise notice 'Revisa esto de arriba y escribe COMMIT para confirmar,';
  raise notice 'o ROLLBACK para dejarlo todo como estaba.';
end;
$$;

-- Escríbelo tú, a mano, después de leer lo de arriba. Está comentado a
-- propósito: pegar el archivo entero no debe bastar para borrar el padrón.
-- commit;

-- ---------------------------------------------------------------------------
-- 4 · Lo que queda fuera, y cómo se hace si lo quieres
-- ---------------------------------------------------------------------------
--
-- La bitácora, si de verdad la quieres vacía. Piérdela solo sabiendo que es el
-- registro de auditoría y que nada más lo reconstruye:
--
--   delete from bitacora;
--
-- Los archivos del bucket: desde el panel, Storage → el bucket de evidencias →
-- seleccionar todo y borrar. Desde SQL no se puede, lo rechaza el disparador
-- `storage.protect_delete()`.
--
-- Los «inscritos previos» de cada taller —`talleres.ocupados_previos`— son un
-- número escrito a mano, no un conteo: sobreviven a este borrado y siguen
-- ocupando lugar. Si venían de datos de prueba, ponlos a cero desde
-- `/admin/talleres`.
--
-- Y el cupo de T01, que hoy está en 2 en vez de 30: eso tampoco lo toca este
-- archivo. Se corrige en `/admin/talleres`.
