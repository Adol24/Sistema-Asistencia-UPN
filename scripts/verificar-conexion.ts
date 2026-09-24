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

// ------------------------------------------------- las sedes y su aforo ---
console.log("\n=== LAS SEDES Y SU AFORO ===\n");

{
  /*
   * Las sedes definitivas (migración 41) y el aforo de cada una (la 42).
   *
   * Las sedes se comprueban por contenido y no por igualdad exacta: se editan
   * desde /admin/configuracion y alguien puede escribir «Salón SUTERM, Teziutlán»
   * con toda la razón. Lo que no puede pasar es que el día 3 siga diciendo lo
   * que decía la 33, porque entonces 600 personas leerían la sede equivocada en
   * su comprobante.
   */
  // Las dos comprobaciones piden columnas distintas EN CONSULTAS DISTINTAS, y
  // no las dos a la vez. Juntas, una base con la 41 aplicada y la 42 todavía no
  // fallaba entera por la columna que falta, y las sedes —que sí estaban bien—
  // no llegaban a comprobarse nunca.
  const { data, error } = await sb.from("dias_evento").select("dia, sede").order("dia");
  if (error) falla("dias_evento: no se pudieron leer las sedes", error);
  else {
    const esperadas: Record<number, RegExp> = { 1: /suterm/i, 2: /suterm/i, 3: /victoria/i };
    for (const f of (data ?? []) as { dia: number; sede: string }[]) {
      const patron = esperadas[f.dia];
      if (!patron) continue;
      if (patron.test(f.sede)) ok(`día ${f.dia}: «${f.sede}»`);
      else
        falla(
          `día ${f.dia}: la sede dice «${f.sede}». Se esperaba ${
            f.dia === 3 ? "el Teatro Victoria" : "el salón SUTERM"
          }: falta la migración 20260919120000 (la 41), o alguien la cambió a mano.`,
        );
    }
  }
}

{
  const { data, error } = await sb.from("dias_evento").select("dia, cupo").order("dia");
  if (error) falla("dias_evento.cupo no existe: falta la migración 20260919140000 (la 42)", error);
  else {
    const aforos: Record<number, number> = { 1: 700, 2: 700, 3: 600 };
    for (const f of (data ?? []) as { dia: number; cupo: number | null }[]) {
      const esperado = aforos[f.dia];
      if (esperado === undefined) continue;
      if (f.cupo === null) falla(`día ${f.dia}: sin aforo cargado`);
      else if (f.cupo === esperado) ok(`día ${f.dia}: aforo ${f.cupo}`);
      else
        // No es una falla: el aforo se edita desde /admin/configuracion y que
        // la organización lo haya movido es legítimo. Se dice para que nadie
        // descubra en octubre que alguien lo cambió sin avisar.
        console.log(
          `       día ${f.dia}: aforo ${f.cupo}, no ${esperado}. Se cambió desde administración.`,
        );
    }
  }
}

{
  // La vista que la pantalla pública usa para no ofrecer días agotados. Tiene
  // que ser legible por el anónimo: como invoker devolvería cero ocupados
  // siempre, y el evento parecería vacío hasta el final.
  const { data, error } = await sb.from("v_cupo_dia").select("*").order("dia");
  if (error?.code === "42501")
    falla(
      "v_cupo_dia existe pero está cerrada al anónimo: falta el grant de la migración 20260919140000",
    );
  else if (error) falla("v_cupo_dia no existe: falta la migración 20260919140000 (la 42)", error);
  else {
    const filas = (data ?? []) as {
      dia: number;
      cupo: number;
      ocupados: number;
      disponibles: number;
      lleno: boolean;
    }[];
    if (filas.length === 3) ok("v_cupo_dia es pública y trae los tres días");
    else falla(`v_cupo_dia devolvió ${filas.length} días, se esperaban 3`);

    for (const f of filas) {
      const linea = `día ${f.dia}: ${f.ocupados} de ${f.cupo} (${f.disponibles} libres)`;
      if (f.ocupados > f.cupo)
        falla(`${linea} — SOBRECUPO: ${f.ocupados - f.cupo} personas de más ya pre-registradas`);
      else if (f.lleno) falla(`${linea} — lleno: ese día ya no admite pre-registros`);
      else ok(linea);
    }
  }
}

// ------------------------------------------- cómo se cuenta el avance ---
console.log("\n=== CÓMO SE CUENTA EL AVANCE ===\n");

/*
 * La 43 sí se puede comprobar desde aquí, y no es casualidad.
 *
 * `programas` está abierta al anónimo (`programas_lectura using (true)`), así
 * que sus columnas nuevas se ven. Es la diferencia con la 37, que solo cambió
 * el cuerpo de una función cerrada y por eso no hay forma de mirarla desde
 * fuera. Al escribir una migración vale la pena preguntarse esto antes: una que
 * deja huella en una tabla legible se puede verificar, y una que no, no.
 */
{
  const { data, error } = await sb
    .from("programas")
    .select("nombre, etiqueta_avance, total_avance")
    .order("nombre");

  if (error) falla("no se pudo leer `programas`", error);
  else {
    const filas = data as {
      nombre: string;
      etiqueta_avance: string | null;
      total_avance: number | null;
    }[];

    // Que las columnas existan se nota en que PostgREST no se queja de ellas:
    // una columna inexistente tumba la consulta entera con 42703.
    ok(`las columnas de excepción existen en \`programas\` (${filas.length} programas)`);

    const modular = filas.find((p) =>
      p.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().includes("INNOVACION PEDAGOGICA"),
    );

    if (!modular)
      falla(
        "no existe la Licenciatura en Educación e Innovación Pedagógica: sin ella no hay excepción que comprobar",
      );
    else if (modular.total_avance === 13 && modular.etiqueta_avance === "Módulo")
      ok(`«${modular.nombre}» se cuenta por módulos hasta 13: la 43 está aplicada`);
    else
      falla(
        `«${modular.nombre}» dice «${modular.etiqueta_avance ?? "lo que diga su nivel"}» hasta ${
          modular.total_avance ?? "el tope de su nivel"
        }. Se esperaba Módulo hasta 13: falta la migración 20260921120000 (la 43), o se editó desde el panel.`,
      );

    // La excepción tiene que ser UNA. Si alguien copió «Módulo 13» al resto de
    // las licenciaturas, el padrón dejaría entrar un «semestre 12» de Pedagogía
    // y lo imprimiría en su comprobante.
    const conExcepcion = filas.filter((p) => p.total_avance !== null || p.etiqueta_avance !== null);
    if (conExcepcion.length <= 1)
      ok("ningún otro programa declara excepción: los demás heredan de su nivel");
    else
      falla(
        `${conExcepcion.length} programas declaran su propio avance: ${conExcepcion
          .map((p) => p.nombre)
          .join(", ")}. Solo la licenciatura modular debería.`,
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
   *
   * **El cupo NO es parte de la comprobación, y antes lo era.** La 36 lo siembra
   * en 35, pero `/admin/talleres` existe justamente para cambiarlo, y la
   * organización lo subió a 70 —a propósito— a las pocas horas de que esto
   * empezara a mirarlo. El comprobante lo cantó como FALLA.
   *
   * Eso es lo que este archivo dice, unas líneas más arriba, que no hay que
   * hacer: un comprobante que avisa de algo que está bien acaba enseñando a
   * ignorarlo, y entonces deja de servir el día que avisa de algo que está mal.
   *
   * Lo que sí prueba que la 36 corrió es que T12 EXISTA y que tenga solo el día
   * 2 —antes ese grupo era el día 2 de T04—. Ninguna de las dos se edita desde
   * el panel. El cupo se imprime como dato, para que un cambio se vea, sin
   * pretender que sea un error.
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
      if (dias.length === 1 && dias[0] === 2)
        ok(`T12 existe y solo se imparte el día 2: la 36 está aplicada (cupo ${t.cupo_total})`);
      else
        falla(
          `T12 existe pero se imparte el día ${dias.join("+")}; la 36 lo deja solo en el día 2`,
        );

      /*
       * Los dos grupos de decolonialidad tienen que ser iguales.
       *
       * T04 y T12 son el mismo taller con dos grupos distintos, uno por día, y
       * la organización los quiere de 70 cada uno (migración 46). La 36 los
       * había sembrado en 35, y durante un tiempo T12 estuvo en 70 y T04 en 35:
       * el mismo taller anunciaba el doble de lugares el viernes que el jueves
       * sin que nadie lo hubiera decidido.
       *
       * Se comprueba que coincidan, no que valgan 70: el número lo puede
       * cambiar la organización desde el panel y eso es legítimo. Lo que no es
       * legítimo es que se separen.
       */
      const { data: gemelo } = await sb
        .from("talleres")
        .select("cupo_total")
        .eq("clave", "T04")
        .maybeSingle();
      const cupoT04 = (gemelo as { cupo_total: number } | null)?.cupo_total;
      if (cupoT04 === undefined || cupoT04 === null)
        console.log("       T04 no se ve: apagado o borrado. Es el grupo del día 1 de T12.");
      else if (cupoT04 === t.cupo_total)
        ok(`los dos grupos de decolonialidad son de ${t.cupo_total}: T04 el día 1 y T12 el día 2`);
      else
        falla(
          `los dos grupos de decolonialidad no coinciden: T04 tiene ${cupoT04} y T12 tiene ${t.cupo_total}. Es el mismo taller.`,
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

/*
 * Cuántos talleres puede elegir de verdad quien cae en cada día.
 *
 * Esto no se deduce de ninguna migración, y por eso se cuenta aquí: depende de
 * qué talleres están ACTIVOS —que se cambia desde `/admin/talleres` sin dejar
 * rastro en las migraciones— cruzado con qué días declara cada uno.
 *
 * La cuenta importa porque el reparto de días es ciego a ella. `fn_dia_mas_vacio`
 * reparte por aforo de la sede, así que puede mandar a seiscientas personas a un
 * día donde solo hay sesenta lugares de taller. Nadie se entera hasta que el
 * alumno abre el desplegable y lo ve medio vacío.
 *
 * No es una falla: cuántos talleres se imparten cada día lo decide la
 * organización. Se imprime para que sea una decisión con los números delante.
 */
{
  const { data: talleres } = await sb
    .from("talleres")
    .select("clave, cupo_total, taller_dias ( dia )");
  const { data: diasEvento } = await sb.from("dias_evento").select("dia, cupo").order("dia");

  const activos = (talleres ?? []) as {
    clave: string;
    cupo_total: number;
    taller_dias: { dia: number }[];
  }[];

  /*
   * Qué claves faltan, y por qué esto merece decirse aunque no sea una falla.
   *
   * El programa oficial trae doce talleres, T01 a T12. Desde el rol anónimo, un
   * taller APAGADO y uno BORRADO se ven exactamente igual: `talleres_lectura` es
   * `using (activo or es_interno_activo())`, así que en los dos casos no
   * aparece. Durante semanas se dio por hecho que T01 a T04 estaban inactivos, y
   * al mirarlos con permisos resultó que no existían: alguien usó el botón de
   * eliminar del panel en vez del interruptor.
   *
   * Este comprobante no puede distinguirlos —no tiene permisos— pero sí puede
   * dejar de esconder la pregunta. Enumerar las claves ausentes y decir que la
   * diferencia no se ve desde aquí es lo único honesto, y es lo que habría
   * ahorrado el rodeo.
   */
  const esperadas = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
  const visibles = new Set(activos.map((t) => t.clave));
  const ausentes = esperadas.filter((c) => !visibles.has(c));
  if (ausentes.length) {
    console.log(`       no se ven: ${ausentes.join(", ")} — apagados o borrados, desde el rol`);
    console.log("       anónimo no se distingue. Con una sesión con permisos:");
    console.log("         select clave, activo from talleres order by clave;");
    console.log("       Si no salen ahí tampoco, están borrados y hay que restituirlos.");
  } else ok("los doce talleres del programa oficial están a la vista");

  // Un taller activo que no declara ningún día SÍ es una falla: está a la vista
  // y no se puede elegir desde ningún sitio.
  const huerfanos = activos.filter((t) => t.taller_dias.length === 0);
  if (huerfanos.length)
    falla(
      `${huerfanos.map((t) => t.clave).join(", ")} están activos pero no declaran día: nadie puede elegirlos`,
    );

  for (const d of (diasEvento ?? []) as { dia: number; cupo: number }[]) {
    const suyos = activos.filter((t) => t.taller_dias.some((x) => x.dia === d.dia));
    const lugares = suyos.reduce((n, t) => n + t.cupo_total, 0);
    const detalle = suyos.length ? ` [${suyos.map((t) => t.clave).join(" ")}]` : "";
    console.log(
      `       día ${d.dia}: ${suyos.length} talleres · ${lugares} lugares para un aforo de ${d.cupo}${detalle}`,
    );
  }
  ok("así se ve el catálogo de talleres desde el pre-registro");
}

// ----------------------------------- cuándo puede registrarse cada grupo ---
console.log("\n=== LAS VENTANAS DE PRE-REGISTRO ===\n");

{
  const { data, error } = await sb
    .from("ventanas_preregistro")
    .select("id, etiqueta, abre, cierra, ventana_cohortes ( avance, programas ( nombre ) )")
    .order("abre");

  // PostgREST contesta PGRST205 cuando la tabla no está en su caché de esquema,
  // y 42P01 cuando PostgreSQL dice que no existe. Son el mismo hecho visto desde
  // dos capas, y las dos significan lo mismo aquí: falta la migración.
  if (error?.code === "42P01" || error?.code === "PGRST205")
    falla("no existe `ventanas_preregistro`: falta la migración 20260921140000 (la 44)", error);
  else if (error) falla("no se pudieron leer las ventanas", error);
  else {
    /*
     * `programas` llega como objeto, no como lista, porque la relación es a uno.
     * El tipo que infiere el cliente dice lista, así que se pasa por `unknown`:
     * afirmar la forma que de verdad devuelve PostgREST es más honesto que
     * escribir código defensivo para un array que nunca llega.
     */
    const ventanas = data as unknown as {
      id: string;
      etiqueta: string;
      abre: string;
      cierra: string;
      ventana_cohortes: { avance: number; programas: { nombre: string } | null }[];
    }[];

    /*
     * Los perfiles se piden aparte, y por la misma razón que explica el bloque
     * de la 49 más abajo: embebidos en el `select` de arriba, una 49 sin
     * aplicar rompería TAMBIÉN la lectura de las cohortes y el comprobante
     * culparía a la 44, que sí está.
     *
     * Si no se pueden leer se sigue con el mapa vacío. No se calla nada: el
     * bloque de la 49 dice qué falta, y una ventana sin cohortes y sin perfiles
     * conocidos se sigue denunciando aquí.
     */
    const { data: filasPerfil } = await sb.from("ventana_perfiles").select("ventana_id, perfil");
    const perfilesDe = new Map<string, string[]>();
    for (const f of (filasPerfil ?? []) as { ventana_id: string; perfil: string }[])
      perfilesDe.set(f.ventana_id, [...(perfilesDe.get(f.ventana_id) ?? []), f.perfil]);

    if (!ventanas.length) {
      /*
       * Cero ventanas NO es una falla: es el interruptor apagado, y el
       * pre-registro queda abierto para todos, como estaba antes de la 44.
       * Marcarlo en rojo obligaría a inventar ventanas para callar el
       * comprobante, que es peor que no tenerlas.
       */
      ok("sin ventanas cargadas: el pre-registro está abierto para todos");
    } else {
      const ahora = Date.now();
      for (const v of ventanas) {
        const abre = new Date(v.abre).getTime();
        const cierra = new Date(v.cierra).getTime();
        const estado = ahora < abre ? "aún no abre" : ahora > cierra ? "ya cerró" : "ABIERTA AHORA";
        const fecha = (iso: string) =>
          new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
        ok(`«${v.etiqueta}» — del ${fecha(v.abre)} al ${fecha(v.cierra)} · ${estado}`);

        const perfiles = [...new Set(perfilesDe.get(v.id) ?? [])].sort();

        /*
         * Una ventana que no admite a NADIE no lo parece: se ve cargada en el
         * panel y en la base, y rechaza a todo el mundo con «todavía no se
         * anuncia la fecha de registro para tu grupo».
         *
         * Se admite de DOS formas, y mirar solo una daba un rojo falso. La
         * ventana de docentes y externos no declara cohortes —no pertenecen a
         * ningún programa— sino perfiles, así que este comprobante la denunciaba
         * en cada ejecución mientras él mismo confirmaba, dos líneas más abajo,
         * que el docente y el externo leen su aviso. Terminaba siempre en «1
         * PROBLEMAS», y un comprobante que siempre sale en rojo deja de
         * comprobar: se mira por encima y el día que el rojo sea de verdad
         * también se mirará por encima.
         */
        if (!v.ventana_cohortes.length && !perfiles.length) {
          falla(`«${v.etiqueta}» no admite a nadie: no declara ni programas ni perfiles`);
          continue;
        }

        if (perfiles.length) console.log(`       por perfil: ${perfiles.join(", ")}`);
        if (!v.ventana_cohortes.length) continue;
        const porAvance = new Map<number, string[]>();
        for (const c of v.ventana_cohortes)
          porAvance.set(c.avance, [
            ...(porAvance.get(c.avance) ?? []),
            c.programas?.nombre ?? "(programa borrado)",
          ]);
        for (const [avance, programas] of [...porAvance.entries()].sort((a, b) => a[0] - b[0]))
          console.log(`       avance ${avance}: ${programas.length} programas`);
      }

      // Que nadie quede sin ventana no se puede comprobar desde aquí —el padrón
      // está cerrado al anónimo—, pero sí que el catálogo entero esté cubierto.
      const { data: progs } = await sb.from("programas").select("nombre");
      const cubiertos = new Set(
        ventanas.flatMap((v) => v.ventana_cohortes.map((c) => c.programas?.nombre)),
      );
      const fuera = ((progs ?? []) as { nombre: string }[])
        .map((p) => p.nombre)
        .filter((n) => !cubiertos.has(n));
      if (fuera.length)
        console.log(
          `       sin ventana todavía: ${fuera.join(", ")} — sus alumnos verán «aún no se anuncia»`,
        );
      else ok("los nueve programas tienen ventana");
    }
  }
}

// --------------------------------- la ventana de docentes y externos (49) ---
/*
 * Va en su propio bloque y no dentro de la consulta de arriba a propósito: si
 * la 49 todavía no está aplicada, pedir `ventana_perfiles` en el mismo `select`
 * haría fallar TAMBIÉN la comprobación de las cohortes, y el comprobante diría
 * que falta la 44 —que sí está— en vez de la que falta de verdad.
 */
{
  const { data, error } = await sb.from("ventana_perfiles").select("perfil");

  if (error?.code === "42P01" || error?.code === "PGRST205")
    falla("no existe `ventana_perfiles`: falta la migración 20260922120000 (la 49)", error);
  else if (error) falla("no se pudieron leer los perfiles con ventana", error);
  else {
    const perfiles = (data ?? []) as { perfil: string }[];
    if (!perfiles.length)
      /*
       * Cero filas no es una falla, igual que cero ventanas: es el interruptor
       * por audiencia de la 49. Mientras nadie nombre un perfil, docentes y
       * externos se registran cuando quieran, como antes de la 49. Pero SÍ se
       * dice, porque es justo el hueco que la 49 vino a poder cerrar y dejarlo
       * abierto tiene que ser una decisión.
       */
      console.log(
        "       ninguna ventana nombra a docentes ni externos: se registran cuando quieran\n" +
          "       (la 49 está aplicada; falta que la organización cargue su ventana en /admin/configuracion)",
      );
    else ok(`con ventana propia: ${[...new Set(perfiles.map((p) => p.perfil))].join(", ")}`);
  }
}

/*
 * Y lo que de verdad importa: qué contesta la puerta ahora mismo.
 *
 * Es la misma función que consulta el formulario público antes de dejar
 * escribir nada, así que esto enseña literalmente lo que va a ver un docente
 * que entre en este momento. `null` es «puede pasar».
 */
for (const perfil of ["docente", "externo"] as const) {
  const { data, error } = await sb.rpc("fn_motivo_fuera_de_ventana_perfil", { p_perfil: perfil });
  if (error?.code === "PGRST202")
    falla(`fn_motivo_fuera_de_ventana_perfil no existe: falta la migración 20260922120000 (la 49)`);
  else if (error) falla(`fn_motivo_fuera_de_ventana_perfil(${perfil})`, error);
  else if (data === null) ok(`un ${perfil} puede pre-registrarse AHORA`);
  else ok(`un ${perfil} lee: «${data}»`);
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
   * La segunda depende de `dominio_institucional`, y en ESTA universidad ese
   * campo se queda vacío: nadie tiene cuenta institucional, ni alumnos ni
   * docentes. Así que la regla está apagada por decisión, no por descuido.
   *
   * Lo que se comprueba, entonces, cambia según el caso: con el campo vacío, que
   * siga vacío y que quede dicho qué queda al descubierto; con el campo lleno,
   * que la regla de verdad muerda.
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
    /*
     * Vacío es LO CORRECTO en esta universidad, y por eso esto no es una falla.
     *
     * Aquí ni los alumnos ni los docentes tienen cuenta institucional: cada
     * quien se registra con el correo que usa. El campo es un interruptor con
     * dos filos —al alumno le EXIGE ese dominio y al externo se lo PROHÍBE—, así
     * que llenarlo cerraría el hueco del duplicado a cambio de dejar fuera del
     * evento a todo el que tenga gmail. Ya pasó una vez: la base venía sembrada
     * con `alumnos.universidad.mx` y ningún alumno podía pre-registrarse, hasta
     * que la migración 20260910180000 lo vació.
     *
     * Esto salía en rojo y no había nada que arreglar. Un comprobante que avisa
     * de algo que está bien acaba enseñando a ignorarlo, y entonces deja de
     * servir el día que avisa de algo que está mal —es la misma lección que ya
     * costó la falla de `fn_buscar_en_padron`, cincuenta líneas más arriba—.
     */
    ok("`dominio_institucional` vacío: cada quien se registra con el correo que usa");
    console.log("       es deliberado, no un pendiente: aquí nadie tiene cuenta institucional.");
    console.log("       La segunda regla de la 40 queda dormida a propósito, y el hueco que");
    console.log("       deja es acotado: el alumno que NUNCA se pre-registró puede sacar un");
    console.log("       segundo folio como externo. La primera regla sí actúa —si ya tiene");
    console.log("       folio, su correo lo delata— y un duplicado se limpia; alguien que no");
    console.log("       puede inscribirse, no.");
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

/*
 * `count: "exact"` da el total; `.limit(1)` evita traerse las filas.
 *
 * Antes esto hacía `.limit(5)` y luego imprimía cuántas habían llegado, así que
 * cualquier vista con datos decía «5 filas visibles» dijera lo que dijera la
 * base. Ya hizo perder un rato: se leyó ese 5 como el número de talleres
 * activos —son 8— y se salió a buscar tres talleres que no faltaban. Un número
 * que siempre sale igual no informa de nada, y encima miente con aspecto de
 * dato.
 *
 * Lo que NO se puede usar aquí es `head: true`, aunque sea lo que pide el
 * cuerpo: sin cuerpo en la respuesta, el cliente no puede leer el código del
 * error, y las tres vistas cerradas pasan de «cerrada al anónimo (42501)» a un
 * error vacío indistinguible de una vista rota. Se pagan unas filas de más a
 * cambio de poder distinguir las dos cosas.
 */
for (const vista of ["v_talleres", "v_estado_pago", "v_elegibles", "v_reparto_dias"] as const) {
  const { count, error } = await sb.from(vista).select("*", { count: "exact" }).limit(1);
  if (error && error.code === "42501") ok(`${vista.padEnd(22)} existe y está cerrada al anónimo`);
  else if (error) falla(`${vista}`, error);
  else ok(`${vista.padEnd(22)} ${count ?? 0} filas visibles`);
}

console.log(fallas === 0 ? "\nLA CONEXIÓN FUNCIONA" : `\n${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
