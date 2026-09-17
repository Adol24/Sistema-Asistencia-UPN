/**
 * Comprueba que lo que la aplicación le pide a Supabase existe y responde.
 *
 * Ejecuta las mismas consultas que `cargarTodo()` y las mismas llamadas del
 * portal, contra el proyecto real. **Solo lee**: no inserta, no actualiza y no
 * borra nada, así que se puede correr sobre la base de producción sin riesgo.
 *
 *     bun run verificar-conexion
 *
 * Las credenciales salen de `.env`, que Bun carga solo. No se imprimen.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env["VITE_SUPABASE_URL"];
const clave = process.env["VITE_SUPABASE_ANON_KEY"];

if (!url || !clave) {
  console.error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  process.exit(1);
}

const sb = createClient(url, clave);

let fallas = 0;
const ok = (m: string) => console.log(`OK     ${m}`);
const falla = (m: string, e?: unknown) => {
  fallas++;
  const d = e as { message?: string; code?: string; hint?: string } | undefined;
  console.log(`FALLA  ${m}`);
  if (d?.message) console.log(`       ${d.code ? `[${d.code}] ` : ""}${d.message}`);
  if (d?.hint) console.log(`       pista: ${d.hint}`);
};

console.log(`Proyecto: ${url.replace(/https:\/\/([^.]+)\..*/, "$1")}\n`);

// ------------------------------------------------ lo que ve un anónimo ---
console.log("=== LECTURA PÚBLICA (lo que ve quien no ha iniciado sesión) ===\n");

const publicas = [
  ["configuracion_evento", "*", 1],
  ["dias_evento", "*", 3],
  [
    "niveles_academicos",
    "id, nivel, etiqueta_avance, total_avance, orden, programas ( nombre )",
    1,
  ],
  ["talleres", "*, taller_dias ( dia )", 0],
] as const;

for (const [tabla, cols, minimo] of publicas) {
  const { data, error } = await sb.from(tabla).select(cols);
  if (error) falla(`${tabla}`, error);
  else if ((data?.length ?? 0) < minimo)
    falla(`${tabla}: ${data?.length ?? 0} filas, se esperaban al menos ${minimo}`);
  else ok(`${tabla.padEnd(22)} ${data?.length ?? 0} filas`);
}

// La forma exacta que espera el puente de tipos.
{
  const { data } = await sb.from("configuracion_evento").select("*").eq("id", 1).single();
  const faltan = [
    "nombre",
    "cuota_evento",
    "fecha_limite",
    "horas_validacion",
    "dominio_institucional",
    "banco_clabe",
    "ventanilla_lugar",
    "aviso_privacidad",
  ].filter((c) => data && !(c in data));
  if (faltan.length) falla(`configuracion_evento sin columnas: ${faltan.join(", ")}`);
  else ok("configuracion_evento tiene las columnas que el puente espera");
}

{
  const { data } = await sb
    .from("niveles_academicos")
    .select("nivel, etiqueta_avance, total_avance, programas ( nombre )");
  const total = (data ?? []).reduce(
    (n, x) => n + ((x as { programas?: unknown[] }).programas?.length ?? 0),
    0,
  );
  if (total === 0) falla("el catálogo no trae programas: la relación no está resolviendo");
  else ok(`catálogo académico: ${data?.length} niveles, ${total} programas`);
}

// ------------------------------------------ lo que NO debe ver un anónimo ---
console.log("\n=== LO QUE LAS POLÍTICAS DEBEN CERRAR ===\n");

for (const tabla of ["padron_alumnos", "participantes", "pagos", "bitacora"] as const) {
  const { data, error } = await sb.from(tabla).select("*").limit(1);
  if (error) ok(`${tabla.padEnd(22)} cerrada (${error.code})`);
  else if ((data?.length ?? 0) === 0) ok(`${tabla.padEnd(22)} cerrada (0 filas para el anónimo)`);
  else falla(`${tabla}: el anónimo puede leerla, y no debería`);
}

// -------------------------------------------- las funciones del portal ---
console.log("\n=== FUNCIONES DEL PORTAL ===\n");

{
  /*
   * `fn_buscar_en_padron` tiene que estar CERRADA al anónimo.
   *
   * Este comprobante esperaba lo contrario, y llevaba desde entonces gritando
   * una falla que era en realidad la corrección funcionando. La migración
   * `20260908120000_padron_sin_enumeracion` la cerró porque devolvía datos del
   * padrón a cualquiera que probara matrículas: anulaba por completo el arreglo
   * de privacidad hecho en la interfaz. El pre-registro no la usa; usa
   * `fn_padron_existe` y `fn_padron_confirmar`.
   *
   * Un comprobante que avisa de algo que está bien acaba enseñando a ignorarlo,
   * y entonces deja de servir el día que avisa de algo que está mal.
   */
  const { error } = await sb.rpc("fn_buscar_en_padron", { p_matricula: "00000000000" });
  if (error) ok(`fn_buscar_en_padron          cerrada al anónimo (${error.code ?? "sin código"})`);
  else falla("fn_buscar_en_padron: el anónimo puede enumerar el padrón, y no debería");
}

{
  // Esta sí es pública, y es la que el pre-registro necesita.
  const { error } = await sb.rpc("fn_padron_existe", { p_matricula: "00000000000" });
  if (error) falla("fn_padron_existe", error);
  else ok("fn_padron_existe responde y el anónimo puede llamarla");
}

{
  const { error } = await sb.rpc("fn_portal_estado", {
    p_folio: "PRE-00000",
    p_credencial: "00000000000",
  });
  // Con credenciales falsas tiene que rechazar, que es justo lo que se comprueba.
  if (error && /incorrect/i.test(error.message)) ok("fn_portal_estado rechaza credenciales falsas");
  else if (error) falla("fn_portal_estado", error);
  else falla("fn_portal_estado aceptó credenciales que no existen");
}

for (const fn of ["fn_repartir_dias_pendientes", "fn_dia_mas_vacio"] as const) {
  const { error } = await sb.rpc(fn);
  if (error) ok(`${fn.padEnd(28)} cerrada al anónimo (${error.code ?? "sin código"})`);
  else falla(`${fn}: el anónimo puede ejecutarla, y no debería`);
}

// ------------------------------------------------ la puerta y sus puntos ---
//
// Comprueba las dos migraciones que cambian cómo funciona la puerta. Ninguna se
// puede dar por aplicada leyendo el archivo: lo que importa es qué contesta la
// base.
console.log("\n=== LA PUERTA COMO TORNIQUETE ===\n");

{
  /*
   * La firma de `fn_evaluar_escaneo` cambió: recibe `p_modo` y ya no `p_tipo`.
   *
   * El anónimo no puede ejecutarla en ninguno de los dos casos, así que lo que
   * se mira es CUÁL error devuelve. Si los parámetros encajan con una función
   * que existe, PostgREST llega hasta el permiso y responde 42501. Si no encaja
   * con ninguna, ni siquiera la encuentra y responde PGRST202. Esa diferencia
   * es la que distingue «la migración corrió» de «la migración no corrió».
   */
  const nueva = await sb.rpc("fn_evaluar_escaneo", {
    p_entrada: "X",
    p_dia: 1,
    p_modo: "puerta",
  });
  if (nueva.error?.code === "42501")
    ok("fn_evaluar_escaneo acepta p_modo y está cerrada al anónimo");
  else if (nueva.error?.code === "PGRST202")
    falla("fn_evaluar_escaneo no conoce p_modo: falta la migración 20260911120000");
  else if (nueva.error) falla("fn_evaluar_escaneo con p_modo", nueva.error);
  else falla("fn_evaluar_escaneo: el anónimo puede ejecutarla, y no debería");

  const vieja = await sb.rpc("fn_evaluar_escaneo", {
    p_entrada: "X",
    p_dia: 1,
    p_tipo: "entrada",
  });
  if (vieja.error?.code === "PGRST202") ok("la firma vieja con p_tipo ya no existe");
  else falla("la firma vieja con p_tipo sigue viva: la migración la dejó a medias");
}

{
  const { error } = await sb.rpc("fn_esta_dentro", {
    p_participante: "00000000-0000-0000-0000-000000000000",
    p_dia: 1,
  });
  if (error?.code === "42501") ok("fn_esta_dentro existe y está cerrada al anónimo");
  else if (error?.code === "PGRST202")
    falla("fn_esta_dentro no existe: falta la migración 20260911120000");
  else if (error) falla("fn_esta_dentro", error);
  else falla("fn_esta_dentro: el anónimo puede ejecutarla, y no debería");
}

{
  // Los puntos de captura por sede, y que los de SUTERM quedaran sembrados.
  const { data, error } = await sb.from("dias_evento").select("dia, puntos").order("dia");
  if (error) falla("dias_evento.puntos: falta la migración 20260911140000", error);
  else {
    const filas = (data ?? []) as { dia: number; puntos: string[] | null }[];
    const conPuertaSuterm = filas.filter((d) =>
      (d.puntos ?? []).some((p) => /suterm/i.test(p)),
    ).length;
    if (conPuertaSuterm >= 2)
      ok(`dias_evento.puntos sembrado: ${conPuertaSuterm} días con la puerta de SUTERM`);
    else
      falla(
        `dias_evento.puntos existe pero solo ${conPuertaSuterm} día(s) traen la puerta de SUTERM; se esperaban 2`,
      );

    const sinPuntos = filas.filter((d) => (d.puntos ?? []).length === 0).map((d) => d.dia);
    if (sinPuntos.length)
      console.log(
        `       día ${sinPuntos.join(", ")} sin puntos: usará los genéricos hasta que se llenen`,
      );
  }
}

// ------------------------------------- la estructura de los talleres ---
console.log("\n=== LA ESTRUCTURA DE LOS TALLERES ===\n");

{
  /*
   * La 36 parte T04 en dos grupos de 35, uno por día, y el del día 2 pasa a ser
   * T12. Se comprueba por T12 y no por T04 porque `talleres_lectura` esconde al
   * anónimo los talleres inactivos, y T01 a T04 lo están: preguntar por T04
   * desde aquí no distingue «no existe» de «no me lo dejan ver».
   *
   * T12 nace activo, así que este sí se ve, y con él el cupo y el día. Es la
   * huella que deja esa migración y no hay otra forma de dar por aplicada.
   */
  const { data, error } = await sb
    .from("talleres")
    .select("clave, cupo_total, taller_dias ( dia )")
    .eq("clave", "T12");

  if (error) falla("talleres: no se pudo comprobar T12", error);
  else {
    const t = ((data ?? []) as { cupo_total: number; taller_dias: { dia: number }[] }[])[0];
    if (!t) falla("T12 no existe: falta la migración 20260915160000 (la 36)");
    else {
      const dias = t.taller_dias.map((d) => d.dia).sort();
      if (t.cupo_total === 35 && dias.length === 1 && dias[0] === 2)
        ok("T12 existe con cupo 35 y solo el día 2: la 36 está aplicada");
      else
        falla(
          `T12 existe pero con cupo ${t.cupo_total} y día(s) ${dias.join("+")}; se esperaba cupo 35 y solo el día 2`,
        );
    }
  }

  /*
   * La 37 NO se puede comprobar desde aquí, y decirlo es mejor que fingir que sí.
   *
   * Solo cambia el cuerpo de `fn_evaluar_escaneo` —la misma firma—, y esa función
   * está cerrada al anónimo: llamarla devuelve 42501 tanto antes como después.
   * Su otra huella es el `comment on function`, que vive en `pg_catalog` y
   * PostgREST no expone. Un comprobante que dijera «OK» aquí estaría adivinando.
   *
   * Para saberlo hace falta una sesión con permisos:
   *
   *   select obj_description('fn_evaluar_escaneo(text,smallint,text)'::regprocedure);
   *
   * y ver si menciona los días del taller. O la prueba de verdad: escanear a
   * alguien de T05 o T06 el segundo día de su taller y comprobar que pasa.
   */
  const { data: dobles } = await sb
    .from("talleres")
    .select("clave, taller_dias ( dia )")
    .in("clave", ["T05", "T06"]);
  const conDosDias = ((dobles ?? []) as { taller_dias: { dia: number }[] }[]).filter(
    (t) => t.taller_dias.length === 2,
  ).length;
  if (conDosDias === 2)
    console.log(
      "       T05 y T06 siguen con sus dos días (es lo que la 37 tiene que saber leer,\n" +
        "       no la prueba de que corrió: eso no se ve desde el rol anónimo)",
    );
  else falla(`T05 y T06 deberían tener dos días cada uno; con dos días hay ${conDosDias}`);
}

// ------------------------------------- un solo pre-registro por persona ---
console.log("\n=== UN SOLO PRE-REGISTRO POR PERSONA ===\n");

{
  /*
   * La 39 pone un índice único parcial que impide dos filas del mismo docente o
   * externo, y hace que las altas devuelvan el folio existente en vez de
   * reventar cuando dos peticiones corren a la vez.
   *
   * Comprobarlo desde el rol anónimo tiene un problema: `participantes` está
   * cerrada, y `pg_indexes` no se expone. La única huella que se ve desde fuera
   * es de comportamiento, y forzarla exigiría crear un participante de verdad,
   * que este comprobante no hace ni debe hacer —es de solo lectura—.
   *
   * Así que se mira de la única manera honesta que queda: se llama al alta con
   * un día que no existe. Esa comprobación está DESPUÉS de la del aviso y
   * ANTES de cualquier escritura, así que el mensaje confirma que se llegó a
   * ella y que la función responde; lo que el índice hace o no hace queda
   * fuera del alcance de la clave anónima, y se dice.
   */
  const { error } = await sb.rpc("fn_preregistrar_externo", {
    p_perfil: "docente",
    p_nombre: "NADIE",
    p_correo: "nadie@example.com",
    p_celular: "0000000000",
    p_institucion: "NINGUNA",
    p_dia: 99,
    p_acepto_aviso: true,
  });
  if (/no forma parte del evento/i.test(error?.message ?? ""))
    ok("el alta de docente y externo valida antes de escribir");
  else if (error) falla("fn_preregistrar_externo no llegó a validar el día", error);
  else falla("fn_preregistrar_externo aceptó un día que no existe");

  /*
   * La 40 le cierra el formulario de externo a un alumno, con dos reglas. La
   * primera —«ese correo ya está registrado como alumno»— no se puede probar
   * desde aquí sin conocer el correo de un alumno real, y no se va a adivinar.
   *
   * La segunda sí, y además es la que de verdad cierra el hueco: rechaza los
   * correos del dominio de alumnos, que es lo único que caza a quien todavía no
   * se ha pre-registrado. Depende de un campo del panel, así que puede estar
   * apagada sin que nadie lo note. Eso es exactamente lo que un comprobante
   * tiene que decir en voz alta.
   */
  const { data: cfg } = await sb
    .from("configuracion_evento")
    .select("dominio_institucional")
    .eq("id", 1)
    .maybeSingle();
  const dominio = (
    (cfg as { dominio_institucional?: string | null } | null)?.dominio_institucional ?? ""
  ).trim();

  if (!dominio) {
    falla(
      "`dominio_institucional` está vacío: un alumno que no se haya pre-registrado todavía " +
        "puede entrar por /registro como externo y nada lo detecta",
    );
    console.log("       se llena en /admin/configuracion; sin él la regla de la 40 está dormida");
  } else {
    const { error: eDominio } = await sb.rpc("fn_preregistrar_externo", {
      p_perfil: "docente",
      p_nombre: "NADIE",
      p_correo: `nadie@${dominio.toLowerCase()}`,
      p_celular: "0000000000",
      p_institucion: "NINGUNA",
      p_dia: 1,
      p_acepto_aviso: true,
    });
    if (/cuenta de alumno/i.test(eDominio?.message ?? ""))
      ok(`un correo @${dominio} no puede registrarse como externo`);
    else if (eDominio)
      falla("el correo del dominio de alumnos no se rechazó por ser de alumno", eDominio);
    else falla("¡se creó un externo con un correo del dominio de alumnos!");
  }

  console.log(
    "       el índice `uq_participante_sin_matricula` (la 39) no se ve desde el rol\n" +
      "       anónimo: `participantes` está cerrada y `pg_indexes` no se expone. Para\n" +
      "       comprobarlo, con una sesión con permisos:\n" +
      "         select indexdef from pg_indexes where indexname = 'uq_participante_sin_matricula';",
  );
}

// ---------------------------------------------- aviso de privacidad ---
console.log("\n=== AVISO DE PRIVACIDAD ===\n");

{
  /*
   * Las dos altas ganaron `p_acepto_aviso`, y aquí se comprueba lo mismo que en
   * `fn_evaluar_escaneo`: que la firma nueva existe y que la vieja no.
   *
   * La diferencia es que estas SÍ se le conceden al anónimo —son las que usa
   * quien se pre-registra—, así que el error no puede ser 42501: la llamada
   * entra en la función. Por eso se manda `p_acepto_aviso: false`, que es la
   * primera comprobación de las dos y aborta ANTES de tocar nada. No se escribe
   * ninguna fila, y el mensaje que devuelve prueba que la regla está en la base.
   *
   * La matrícula es imposible a propósito: si por lo que sea se pasara la
   * primera comprobación, la segunda la detendría igual.
   */
  const IMPOSIBLE = "00000000000";

  const nueva = await sb.rpc("fn_preregistrar_alumno", {
    p_matricula: IMPOSIBLE,
    p_correo: "nadie@example.com",
    p_celular: "0000000000",
    p_acepto_aviso: false,
  });
  if (/aviso de privacidad/i.test(nueva.error?.message ?? ""))
    ok("fn_preregistrar_alumno exige el aviso y lo rechaza sin él");
  else if (nueva.error?.code === "PGRST202")
    falla("fn_preregistrar_alumno no conoce p_acepto_aviso: falta la migración 20260917120000");
  else if (nueva.error) falla("fn_preregistrar_alumno con p_acepto_aviso", nueva.error);
  else falla("fn_preregistrar_alumno dejó pasar un alta SIN aceptar el aviso");

  const vieja = await sb.rpc("fn_preregistrar_alumno", {
    p_matricula: IMPOSIBLE,
    p_correo: "nadie@example.com",
    p_celular: "0000000000",
  });
  if (vieja.error?.code === "PGRST202") ok("la firma vieja del alta de alumno ya no existe");
  else
    falla(
      "la firma vieja del alta de alumno sigue viva: se puede registrar sin aceptar el aviso",
      vieja.error,
    );

  const externo = await sb.rpc("fn_preregistrar_externo", {
    p_perfil: "docente",
    p_nombre: "NADIE",
    p_correo: "nadie@example.com",
    p_celular: "0000000000",
    p_institucion: "NINGUNA",
    p_dia: 1,
    p_acepto_aviso: false,
  });
  if (/aviso de privacidad/i.test(externo.error?.message ?? ""))
    ok("fn_preregistrar_externo exige el aviso y lo rechaza sin él");
  else if (externo.error?.code === "PGRST202")
    falla("fn_preregistrar_externo no conoce p_acepto_aviso: falta la migración 20260917120000");
  else if (externo.error) falla("fn_preregistrar_externo con p_acepto_aviso", externo.error);
  else falla("fn_preregistrar_externo dejó pasar un alta SIN aceptar el aviso");

  const externoViejo = await sb.rpc("fn_preregistrar_externo", {
    p_perfil: "docente",
    p_nombre: "NADIE",
    p_correo: "nadie@example.com",
    p_celular: "0000000000",
    p_institucion: "NINGUNA",
    p_dia: 1,
  });
  if (externoViejo.error?.code === "PGRST202")
    ok("la firma vieja del alta de docente y externo ya no existe");
  else
    falla(
      "la firma vieja del alta de docente y externo sigue viva: se puede registrar sin aceptar",
      externoViejo.error,
    );

  // El texto que se le enseña a la persona. Vacío no es un fallo de migración,
  // pero sí una casilla que se marca sin nada que leer detrás.
  const { data } = await sb
    .from("configuracion_evento")
    .select("aviso_privacidad")
    .eq("id", 1)
    .maybeSingle();
  const texto = ((data as { aviso_privacidad?: string } | null)?.aviso_privacidad ?? "").trim();
  if (texto.length > 40) ok(`el texto del aviso está cargado (${texto.length} caracteres)`);
  else falla("el aviso de privacidad está vacío o es demasiado corto para ser uno");
}

// --------------------------------------------------------------- vistas ---
console.log("\n=== VISTAS ===\n");

for (const vista of ["v_talleres", "v_estado_pago", "v_elegibles", "v_reparto_dias"] as const) {
  const { data, error } = await sb.from(vista).select("*").limit(5);
  if (error && error.code === "42501") ok(`${vista.padEnd(22)} existe y está cerrada al anónimo`);
  else if (error) falla(`${vista}`, error);
  else ok(`${vista.padEnd(22)} ${data?.length ?? 0} filas visibles`);
}

console.log(fallas === 0 ? "\nLA CONEXIÓN FUNCIONA" : `\n${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
