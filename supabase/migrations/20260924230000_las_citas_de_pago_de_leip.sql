-- =============================================================================
-- Las citas de pago de LEIP
--
-- El ordinal de esta cabecera NO la identifica: en este repo hay dos
-- numeraciones que difieren en uno (ver «Los dos números» en MIGRACIONES.md).
-- Esta migración es `20260924230000_las_citas_de_pago_de_leip`.
--
-- La mitad que quedó sin corregir
-- -------------------------------
-- Los módulos que el calendario administrativo llama II, VI, X y XIV llegan al
-- padrón corridos una posición: son el **1, 5, 9 y 13**. Dos migraciones ya
-- arreglaron la mitad del sistema con ese desfase:
--
--   20260924160000_el_modulo_que_trae_el_alumno    ventana del 25 → 9 y 13
--   20260924180000_los_modulos_bajos_de_leip       ventana del 27 → 1 y 5
--
-- Las dos tocan `ventana_cohortes`, que es QUIÉN PUEDE REGISTRARSE Y CUÁNDO.
-- Ninguna toca `cita_cohortes`, que es QUÉ DÍA LE TOCA IR A PAGAR, y ahí siguen
-- los números viejos.
--
-- Lo que eso produce, hoy, en producción
-- --------------------------------------
--   con ventana y SIN cita:  LEIP 1, 5 y 9    se registran, y su comprobante
--                                              NO les dice cuándo pagar
--   con cita y SIN ventana:  LEIP 2, 6 y 10   filas que nadie alcanza
--
-- Tres de las cuatro cohortes de LEIP terminan su registro y llegan al
-- comprobante sin la mitad de la respuesta. `fn_cita_de_inscripcion` busca por
-- programa y avance, no encuentra fila, y devuelve NULL — que el cliente trata
-- como «este perfil no tiene cita», que es lo correcto para un docente y es
-- falso para ellos.
--
-- Solo el módulo 13 queda bien, que es justo el único número que se había
-- comprobado contra el padrón cuando se escribió `20260924140000`.
--
-- Qué NO toca
-- -----------
-- Ni `ventanas_preregistro`, ni sus etiquetas, ni `ventana_cohortes`. Todo eso
-- ya está bien y es trabajo de otras dos migraciones: repetirlo aquí solo
-- añadiría formas de deshacerlo por accidente.
--
-- Tampoco cambia a qué cita apunta LEIP. Sigue siendo «el día de tu
-- reinscripción», que es lo que dice el calendario oficial: LEIP no tiene fecha
-- fija de inscripción, se inscribe cuando le toque su reinscripción.
-- =============================================================================

-- Se borran solo las de LEIP y se vuelven a poner. Las demás cohortes están
-- comprobadas y no hay por qué moverlas.
delete from cita_cohortes c
 using programas p
 where p.id = c.programa_id
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica';

/*
 * Los cuatro módulos, con el número que trae el alumno en su lista.
 *
 *   calendario   II    VI    X    XIV
 *   padrón        1     5    9     13
 *
 * La cita se localiza por su texto porque es lo que la identifica: `cuando` es
 * lo que se le lee al alumno en el comprobante, y no hay dos iguales.
 */
insert into cita_cohortes (cita_id, programa_id, avance)
select c.id, p.id, e.avance
  from citas_inscripcion c
  cross join (values (1::smallint), (5::smallint), (9::smallint), (13::smallint)) as e(avance)
  cross join programas p
 where c.cuando = 'el día de tu reinscripción'
   and p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
on conflict (cita_id, programa_id, avance) do nothing;

-- ---------------------------------------------------------------------------
-- Que las dos tablas digan lo mismo
--
-- No se cuentan filas: se CRUZAN. Las cuentas ya cuadraban cuando el error
-- estaba —veintinueve cohortes con ventana y veintinueve con cita—, y el fallo
-- estaba en cuáles, no en cuántas. Esta es la comprobación que lo habría
-- cazado.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_mal integer := 0;
begin
  for r in
    select p.nombre as programa, c.avance, 'con ventana y SIN cita' as que
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from cita_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     union all
    select p.nombre, c.avance, 'con cita y SIN ventana'
      from cita_cohortes c
      join programas p on p.id = c.programa_id
     where not exists (
       select 1 from ventana_cohortes x
        where x.programa_id = c.programa_id and x.avance = c.avance
     )
     order by 1, 2
  loop
    v_mal := v_mal + 1;
    raise warning '% · avance % · %', r.programa, r.avance, r.que;
  end loop;

  if v_mal > 0 then
    raise exception
      '% cohortes descuadradas entre registro e inscripción. Cada una es alguien '
      'que se registra sin saber cuándo pagar, o una cita que nadie alcanza.', v_mal;
  end if;

  raise notice 'Registro e inscripción cuadran: toda cohorte que puede registrarse';
  raise notice 'sabe qué día le toca pagar, y ninguna cita se queda sin dueño.';
  raise notice '';

  for r in
    select c.avance,
           (select v.etiqueta from ventanas_preregistro v where v.id = c.ventana_id) as ventana,
           (select i.cuando
              from cita_cohortes cc
              join citas_inscripcion i on i.id = cc.cita_id
             where cc.programa_id = c.programa_id and cc.avance = c.avance
             limit 1) as cita
      from ventana_cohortes c
      join programas p on p.id = c.programa_id
     where p.nombre = 'Licenciatura en Educación e Innovación Pedagógica'
     order by c.avance
  loop
    raise notice 'LEIP módulo % · registro: % · pago: %', r.avance, r.ventana, r.cita;
  end loop;
end;
$$;
