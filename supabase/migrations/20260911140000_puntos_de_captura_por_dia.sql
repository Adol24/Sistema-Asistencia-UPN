-- =============================================================================
-- Los puntos de captura son de cada sede, no del código
--
-- Qué pasaba
-- ----------
-- La lista de puntos vivía escrita en `estado-evento.tsx`: «Puerta A», «Puerta
-- B», «Vestíbulo», «Registro Taller». Nombres genéricos que no existen en
-- ningún lado. El capturista elegía el que menos mal le sonara y el reporte
-- decía «Puerta A», que después nadie sabía traducir a un lugar real.
--
-- Y no hay una lista buena para los tres días, porque no es el mismo sitio: el
-- salón SUTERM recibe los días 1 y 2, y el día 3 es en otra sede con otra
-- disposición. Una lista única obliga a que dos sedes distintas se describan
-- con las mismas palabras.
--
-- Lo que la operación real necesita nombrar
-- -----------------------------------------
-- En SUTERM los baños están en la planta baja, junto a las escaleras, DENTRO
-- del recinto. Ir al baño no es salir, así que ahí no se registra nada: poner a
-- alguien junto a los baños pidiéndole a la gente que se registre al entrar y
-- al salir es incómodo y no aporta un dato que se vaya a mirar.
--
-- Lo que sí se registra es la puerta grande que da a la calle, porque cruzarla
-- sí es irse. El perímetro de control es esa puerta, no la del salón. De ahí
-- que los puntos tengan que poder llamarse como se llaman de verdad.
--
-- Qué hace
-- --------
-- Añade `puntos` a cada día. Vacío significa «usa los genéricos de siempre»,
-- así que nada se rompe mientras no se llene: la aplicación cae a su lista por
-- defecto y sigue funcionando igual que hasta ahora.
-- =============================================================================

alter table dias_evento
  add column if not exists puntos text[] not null default '{}';

comment on column dias_evento.puntos is
  'Puntos de captura de esa sede, en el orden en que se ofrecen. Vacío deja que la aplicación use su lista por defecto.';

-- Un arreglo vacío es «sin configurar»; una entrada en blanco DENTRO del
-- arreglo sería otra cosa: un botón sin nombre en la pantalla del capturista.
--
-- La comprobación va con `array_position` y no con un `exists` sobre `unnest`
-- porque PostgreSQL no admite subconsultas dentro de un CHECK.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_puntos_sin_vacios'
  ) then
    alter table dias_evento
      add constraint chk_puntos_sin_vacios
      check (array_position(puntos, '') is null);
  end if;
end;
$$;
