-- =============================================================================
-- El programa oficial: los once talleres, las sedes y la cuota.
--
-- Todo lo de aquí sale del programa que entregó la universidad y de lo que el
-- usuario confirmó al revisarlo. Sustituye a los datos de ejemplo que quedaban
-- de la siembra inicial.
--
-- La migración anterior (20260915120000) ya corrigió las fechas. Esta cierra lo
-- que quedó abierto: dónde es cada día, qué talleres hay y cuánto cuesta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Las sedes.
--
-- La siembra puso «Salón SUTERM» los días 1 y 2 y «Teatro Victoria» el 3. El
-- programa dice otra cosa, y «Teatro Victoria» no aparece en él por ninguna
-- parte: era invento.
--
--   Día 1 · Salón SUTERM                    (ya estaba bien)
--   Día 2 · Centro de convenciones Teziutlán
--   Día 3 · Centro de convenciones Teziutlán
--
-- Esto es la sede de las PONENCIAS, que es a donde la persona llega por la
-- mañana y lo que imprime su comprobante. Los talleres de la tarde son en otro
-- edificio —Instalaciones UPN U-212— y ese dato viaja en cada taller, en su
-- propia columna `lugar`, no aquí.
-- ---------------------------------------------------------------------------
update dias_evento set sede = 'Salón SUTERM'                    where dia = 1;
update dias_evento set sede = 'Centro de convenciones Teziutlán' where dia = 2;
update dias_evento set sede = 'Centro de convenciones Teziutlán' where dia = 3;

-- ---------------------------------------------------------------------------
-- 2 · Los puntos de captura del día 2 dejan de existir.
--
-- La migración 31 cargó los mismos tres puntos para los días 1 y 2 —«Puerta 1
-- SUTERM», «Mesa de incidencias», «Registro Taller»— porque entonces se creía
-- que ambos días eran en SUTERM. El día 2 es en el Centro de convenciones, así
-- que los tres nombran lugares que ese día no existen.
--
-- Se vacían en lugar de inventarles nombre. Vacío es un estado que el sistema ya
-- entiende: cae a la lista genérica y el capturista sigue pudiendo trabajar. Un
-- punto con nombre falso es peor, porque el reporte del día 2 diría «Puerta 1
-- SUTERM» de un día que no fue en SUTERM, y eso ya nadie lo puede desmentir
-- después.
--
-- Se llenan desde /admin/configuracion cuando se sepan los accesos reales del
-- Centro de convenciones. El día 3 sigue vacío por lo mismo.
-- ---------------------------------------------------------------------------
update dias_evento set puntos = '{}' where dia = 2;

-- ---------------------------------------------------------------------------
-- 3 · La cuota.
--
-- Son 500 las conferencias y 600 con talleres. El sistema cobra los dos
-- conceptos por separado —son dos depósitos distintos y Servicios Financieros
-- los concilia aparte— así que la diferencia va en el costo del taller:
--
--   cuota_evento = 500   +   costo del taller = 100   =   600
--
-- Estaba en 650, que era un número de ejemplo.
-- ---------------------------------------------------------------------------
update configuracion_evento set cuota_evento = 500.00 where id = 1;

-- ---------------------------------------------------------------------------
-- 4 · Los once talleres.
--
-- Todos en las Instalaciones de la UPN U-212, Teziutlán, por la tarde, y todos
-- a 100 pesos.
--
-- Sobre los días: cuatro talleres se imparten las dos tardes —T03, T04, T05 y
-- T06—. No son talleres nuevos cada día, son el mismo repetido, y por eso
-- aparecen con los dos días. Que un taller pueda darse en varios días ya estaba
-- previsto: para eso existe `taller_dias`.
--
-- El programa los marca de dos maneras distintas, y conviene saberlo por si hay
-- que releerlo. A T03, T05 y T06 los repite en la tabla del día 2 SIN volver a
-- numerarlos, que es la pista de que son los mismos. A T04 sí le pone número
-- propio el día 2 (el 11), pero es el mismo taller: mismo tallerista, mismo
-- título, mismo lugar y mismo horario que el 4 del día 1. La nota del día 1
-- —«trabajará con grupos distintos»— dice justamente eso.
--
-- Sobre el cupo: 30 en todos menos T04, que el propio programa fija en 70 porque
-- su tallerista trabaja con grupos distintos.
--
-- El día 3 no tiene talleres. Es el de la clausura: registro, tres ponencias y
-- programa cultural hasta las 12:45. Quien quede asignado a ese día no puede
-- tomar taller, y la llave foránea compuesta contra `taller_dias` ya lo impide
-- por sí sola: ningún taller declara el día 3, así que no hay combinación
-- válida que lo permita.
--
-- Sobre la descripción: el programa solo trae título y tallerista. Se deja
-- vacía salvo donde el propio documento dice algo que el alumno necesita saber
-- ANTES de elegir —que tiene que llevar computadora—, porque enterarse de eso al
-- llegar es quedarse fuera del taller que ya pagó.
-- ---------------------------------------------------------------------------
insert into talleres (clave, nombre, ponente, descripcion, horario, lugar, cupo_total, costo)
values
  ('T01',
   'Desarrollo de habilidades emocionales',
   'Dr. Juan Enrique Casassus Gutiérrez',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T02',
   'Humanismo y práctica docente',
   'Mtra. Laura Angélica Bárcenas Pozos',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T03',
   'Emociones y responsabilidad docente',
   'Dra. Silvia Miracy Pastro Fiad',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T04',
   'La decolonialidad como práctica didáctica en el aula',
   'Dr. Armando Rojas Hernández',
   'El tallerista trabaja con grupos distintos, por eso admite más participantes que los demás.',
   '15:00 a 18:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   70, 100.00),

  ('T05',
   'La práctica de las pedagogías críticas en el aula: construcción de estrategias didácticas desde el enfoque de la NEM',
   'Mtra. Minerva Soberanes Cruz',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T06',
   'Diseño de proyectos comunitarios de investigación etnomatemática para la enseñanza de la numeración: medición y ubicación espacial en la Educación Indígena',
   'Mtro. Juan Ignacio Hernández Vázquez',
   '',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T07',
   'Formación en ciudadanía digital desde un enfoque centrado en la persona',
   'Dra. Elvia Garduño Teliz',
   'Requisito: trae tu equipo de cómputo.',
   '15:00 a 17:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T08',
   'Taller práctico para reconocer las trayectorias sociolingüísticas y fortalecer la enseñanza de lenguas originarias',
   'Dra. Tania Santos Cano',
   '',
   '15:00 a 18:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T09',
   'Reconociéndonos desde el territorio: acercamientos al Método Inductivo Intercultural desde nuestras historias',
   'Mtra. Clara Toxqui Teutle',
   '',
   '15:00 a 18:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T10',
   'Tecnologías digitales e inteligencia artificial para la educación desde una perspectiva crítica',
   'Dra. Annia Almeyda Vázquez y Mtra. Solanch García Contino',
   'Requisito: trae tu equipo de cómputo.',
   '15:00 a 19:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00),

  ('T11',
   'Creando innovación en el aula universitaria: recursos digitales con inteligencia artificial',
   'Dra. Milagros Cecilia Huamán Castro',
   'Requisito: trae tu equipo de cómputo. Se imparte en laboratorio con internet.',
   '15:00 a 18:00 hrs',
   'Instalaciones UPN U-212, Teziutlán',
   30, 100.00)
on conflict (clave) do nothing;

-- Los días de cada taller. Se resuelve la clave a su id aquí y no a mano, para
-- que volver a correr la migración no dependa de qué uuid tocó.
insert into taller_dias (taller_id, dia)
select t.id, d.dia
from talleres t
join (values
  ('T01', 1),
  ('T02', 1),
  ('T03', 1), ('T03', 2),
  ('T04', 1), ('T04', 2),
  ('T05', 1), ('T05', 2),
  ('T06', 1), ('T06', 2),
  ('T07', 2),
  ('T08', 2),
  ('T09', 2),
  ('T10', 2),
  ('T11', 2)
) as d (clave, dia) on d.clave = t.clave
on conflict (taller_id, dia) do nothing;

-- ---------------------------------------------------------------------------
-- 5 · Qué quedó cargado y qué sigue faltando.
-- ---------------------------------------------------------------------------
do $$
declare
  v_talleres integer;
  v_cupo integer;
  v_sin_descripcion integer;
  v_desfasados integer;
  r record;
begin
  select count(*), coalesce(sum(cupo_total), 0) into v_talleres, v_cupo
    from talleres where activo;

  raise notice 'Talleres activos: % · lugares en total: %', v_talleres, v_cupo;

  for r in
    select d.dia, d.fecha, d.sede,
           coalesce(array_length(d.puntos, 1), 0) as n_puntos,
           (select count(*) from taller_dias td where td.dia = d.dia) as n_talleres
      from dias_evento d
     order by d.dia
  loop
    raise notice 'Día % · % · % · talleres: % · puntos de captura: %',
      r.dia, r.fecha, r.sede, r.n_talleres, r.n_puntos;
  end loop;

  select count(*) into v_sin_descripcion from talleres where activo and descripcion = '';
  if v_sin_descripcion > 0 then
    raise notice 'PENDIENTE: % talleres sin descripción. El programa no las trae; se escriben en /admin/talleres.',
      v_sin_descripcion;
  end if;

  raise notice 'PENDIENTE: los días 2 y 3 no tienen puntos de captura. Se llenan en /admin/configuracion.';

  -- -------------------------------------------------------------------------
  -- Quien ya se pre-registró conserva el monto que se le dijo.
  --
  -- El pre-registro COPIA la cuota al participante en vez de leerla cada vez, y
  -- eso es a propósito: a quien ya se le dijo «deposita esto» no se le cambia la
  -- cifra por la espalda. Pero significa que bajar la cuota aquí no alcanza a
  -- los que entraron antes, y el disparador de `pagos` compara contra ese monto
  -- congelado: si depositan 500 contra un esperado de 650, les marca
  -- discrepancia.
  --
  -- No se tocan desde aquí. Si son pre-registros de prueba, se borran; si son
  -- personas de verdad, alguien tiene que decidir qué se les cobra. Ninguna de
  -- las dos cosas la puede decidir una migración.
  -- -------------------------------------------------------------------------
  select count(*) into v_desfasados
    from participantes p
   where p.monto_esperado_evento <> 500.00;

  if v_desfasados > 0 then
    raise warning 'ATENCIÓN: % participantes se pre-registraron con otra cuota y la conservan.', v_desfasados;
    for r in
      select p.monto_esperado_evento as monto, count(*) as cuantos
        from participantes p
       where p.monto_esperado_evento <> 500.00
       group by p.monto_esperado_evento
       order by p.monto_esperado_evento
    loop
      raise warning '  esperan % · % personas', r.monto, r.cuantos;
    end loop;
    raise warning 'Si depositan 500, el disparador de pagos les marcará discrepancia. Revísalos antes de abrir el pre-registro.';
  end if;
end;
$$;
