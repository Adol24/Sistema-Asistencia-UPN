/**
 * Prueba el sistema CONTRA LA BASE REAL, ejerciendo las reglas como lo haría
 * una persona: se pre-registra, cambia de taller, entra a su portal.
 *
 *     bun run probar-sistema             # solo lo que NO escribe
 *     bun run probar-sistema --escribe   # también las altas de verdad
 *     bun run probar-sistema --limites   # además agota un tope por IP (ver abajo)
 *
 * Por qué dos modos
 * -----------------
 * `verificar-conexion` es de solo lectura y está bien que lo siga siendo: se
 * corre a menudo y sobre producción. Pero hay reglas que NO se pueden observar
 * sin escribir —la reentrancia del alta, el cambio de taller, el aforo que baja,
 * la puerta del portal— y quedarse sin probarlas por prudencia es dejar sin
 * comprobar justo la parte que más cuesta si falla.
 *
 * Así que las altas van detrás de una bandera explícita. Nadie las dispara sin
 * querer, y quien las dispara sabe lo que hace.
 *
 * Qué cuesta correrlo
 * -------------------
 * DOS lugares del aforo, y **solo la primera vez**: las altas son reentrantes
 * —mismo correo y mismo perfil devuelven el folio que ya existe en vez de crear
 * otro—, así que la segunda corrida reutiliza los mismos dos participantes. Esa
 * reentrancia no es un efecto colateral afortunado: es una de las reglas que
 * este comprobante está probando.
 *
 * Cómo se limpia
 * --------------
 * No se puede desde aquí: `participantes` está cerrada al anónimo y no hay
 * función de baja expuesta —y así debe seguir—. Al terminar, el comprobante
 * imprime el SQL exacto para borrar lo que creó, para el editor de Supabase.
 * Todo lo que escribe lleva la marca de abajo, así que no hay forma de
 * confundirlo con una persona de verdad.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env["VITE_SUPABASE_URL"];
const clave = process.env["VITE_SUPABASE_ANON_KEY"];

if (!url || !clave) {
  console.error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env");
  process.exit(1);
}

const sb = createClient(url, clave);
const escribe = process.argv.includes("--escribe");

/*
 * Los topes por IP van detrás de SU PROPIA bandera, y no de `--escribe`.
 *
 * Comprobar un limitador exige agotarlo, y agotarlo deja esa puerta cerrada
 * diez minutos **para esta IP**. Si se corre desde la red de la universidad
 * durante el pre-registro, quien esté detrás del mismo NAT se lleva el portazo.
 * Por eso no basta con que sea opt-in: tiene que ser una decisión aparte de
 * «quiero probar las altas».
 */
const limites = process.argv.includes("--limites");

/*
 * La marca. Todo lo que este comprobante crea la lleva, y por eso la limpieza
 * es un `delete` de una línea sin riesgo de llevarse a nadie por delante.
 *
 * `.invalid` es un dominio que el RFC 2606 reserva para esto mismo: no existe
 * ni puede existir, así que ningún correo de verdad va a coincidir.
 */
const MARCA = "PRUEBA AUTOMATIZADA";
const correoDe = (caso: string) => `qa-${caso}@prueba.invalid`;

let fallas = 0;
let saltadas = 0;
const ok = (m: string) => console.log(`OK     ${m}`);
const nota = (m: string) => console.log(`       ${m}`);
const salta = (m: string) => {
  saltadas++;
  console.log(`SALTA  ${m}`);
};
const falla = (m: string, detalle?: unknown) => {
  fallas++;
  console.log(`FALLA  ${m}`);
  const d = detalle as { message?: string; code?: string } | undefined;
  if (d?.message) console.log(`       ${d.code ? `[${d.code}] ` : ""}${d.message}`);
  else if (detalle !== undefined) console.log(`       ${JSON.stringify(detalle)}`);
};

/** El mensaje de un error de PostgREST, o cadena vacía si no hubo error. */
const mensaje = (e: unknown) => (e as { message?: string } | null)?.message ?? "";

/**
 * Llama al alta de docente o externo. Un solo sitio para la firma, porque ya
 * cambió dos veces —`p_acepto_aviso` se añadió después— y cada cambio dejó
 * llamadas viejas que fallaban con PGRST202 en vez de decir qué pasaba.
 */
const altaExterna = (d: {
  perfil: "docente" | "externo" | string;
  nombre: string;
  correo: string;
  celular?: string;
  institucion?: string;
  dia: number;
  aviso?: boolean;
  taller?: string | null;
}) =>
  sb.rpc("fn_preregistrar_externo", {
    p_perfil: d.perfil,
    p_nombre: d.nombre,
    p_correo: d.correo,
    p_celular: d.celular ?? "8112345678",
    p_institucion: d.institucion ?? MARCA,
    p_dia: d.dia,
    p_acepto_aviso: d.aviso ?? true,
    p_taller: d.taller ?? null,
  });

/** El uuid de un taller a partir de su clave corta. */
async function tallerPorClave(cl: string) {
  const { data } = await sb.from("talleres").select("id, clave").eq("clave", cl).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** El cupo ocupado de un taller, tal como lo cuenta `v_talleres`. */
async function ocupado(cl: string): Promise<number | null> {
  const { data } = await sb.from("v_talleres").select("cupo_ocupado").eq("clave", cl).maybeSingle();
  const n = (data as { cupo_ocupado: number } | null)?.cupo_ocupado;
  return n === undefined ? null : Number(n);
}

console.log(`Proyecto: ${url.replace(/https:\/\/([^.]+)\..*/, "$1")}`);
console.log(escribe ? "Modo: ESCRIBE (se darán altas reales)\n" : "Modo: solo lectura\n");

// ===========================================================================
console.log("=== LO QUE EL ALTA TIENE QUE RECHAZAR ===\n");
// ---------------------------------------------------------------------------
/*
 * Ninguna de estas llamadas escribe: todas abortan en una comprobación previa
 * al `insert`. Por eso corren SIEMPRE, también sin `--escribe`.
 *
 * Se prueban con la puerta real —la función que usa la pantalla— y no leyendo
 * el SQL, porque lo que importa no es que la regla esté escrita sino que esté
 * VIGENTE en la base que atiende hoy.
 */
{
  const casos: { nombre: string; args: Parameters<typeof altaExterna>[0]; espera: RegExp }[] = [
    {
      nombre: "un día que no existe",
      args: { perfil: "docente", nombre: "QA RECHAZO", correo: correoDe("dia"), dia: 99 },
      espera: /no forma parte del evento/i,
    },
    {
      nombre: "sin aceptar el aviso de privacidad",
      args: {
        perfil: "docente",
        nombre: "QA RECHAZO",
        correo: correoDe("aviso"),
        dia: 1,
        aviso: false,
      },
      espera: /aviso de privacidad/i,
    },
    {
      nombre: "un alumno colándose por la puerta de externo",
      args: { perfil: "alumno", nombre: "QA RECHAZO", correo: correoDe("perfil"), dia: 1 },
      espera: /solo para docentes y externos/i,
    },
    {
      nombre: "sin nombre",
      args: { perfil: "docente", nombre: "   ", correo: correoDe("nombre"), dia: 1 },
      espera: /falta el nombre/i,
    },
    {
      nombre: "sin institución",
      args: {
        perfil: "docente",
        nombre: "QA RECHAZO",
        correo: correoDe("inst"),
        institucion: "  ",
        dia: 1,
      },
      espera: /falta la institución/i,
    },
  ];

  for (const c of casos) {
    const { error } = await altaExterna(c.args);
    if (c.espera.test(mensaje(error))) ok(`rechaza ${c.nombre}`);
    else if (error) falla(`rechaza ${c.nombre}, pero por otro motivo`, error);
    else falla(`ACEPTÓ ${c.nombre}: se creó un participante que no debería existir`);
  }

  /*
   * Aquí se comprobaba que un taller de otro día se RECHAZARA, y ya no es un
   * rechazo: es lo normal.
   *
   * La migración 60 quitó la llave foránea `(taller_id, dia) -> taller_dias`
   * porque los talleres se imparten en la UPN U-212, que no es la sede del
   * Encuentro: el día que te toca dice a qué sede vas, no a qué taller entras.
   *
   * El caso no se invierte aquí. Esta batería solo prueba altas que DEBEN
   * fallar, y por eso es barata: ninguna crea un participante ni gasta un lugar
   * del aforo. Comprobar que ahora se acepta exige crear uno, así que vive en
   * «EL CAMBIO DE TALLER, POR EL CAMINO DE LA APLICACIÓN», bajo `--escribe`,
   * reutilizando el externo que ya se da de alta ahí.
   */
}

// ===========================================================================
console.log("\n=== EL PADRÓN NO SE DEJA ENUMERAR ===\n");
// ---------------------------------------------------------------------------
/*
 * La migración 12 cerró el enumerador del padrón. Lo que se comprueba es que
 * una matrícula inexistente y una existente no se distingan por la forma de la
 * respuesta: si se distinguieran, cualquiera podría barrer el espacio de
 * matrículas y saber quién estudia ahí.
 */
{
  /*
   * Devuelve `{existe, ya_registrado}`, no un booleano: la pantalla necesita
   * distinguir «no estás en el padrón» de «ya te registraste» para mandar a
   * cada uno por su camino.
   */
  const { data, error } = await sb.rpc("fn_padron_existe", { p_matricula: "00000000000" });
  const r = data as { existe?: boolean; ya_registrado?: boolean } | null;
  if (error) falla("fn_padron_existe no respondió", error);
  else if (r?.existe === false) ok("una matrícula imposible contesta que no existe, y nada más");
  else if (r?.existe === true) falla("fn_padron_existe dice que existe una matrícula imposible");
  else falla("fn_padron_existe devolvió una forma inesperada", data);

  // Las tablas del padrón, cerradas a cal y canto.
  for (const t of ["padron_alumnos", "participantes", "pagos", "asistencias", "evidencias"]) {
    const { error: e } = await sb.from(t).select("*").limit(1);
    if (e) ok(`\`${t}\` está cerrada al anónimo`);
    else falla(`\`${t}\` SE PUEDE LEER desde la clave anónima`);
  }
}

// ===========================================================================
console.log("\n=== EL TOPE POR IP DE LAS PUERTAS PÚBLICAS ===\n");
// ---------------------------------------------------------------------------
/*
 * La regresión que esto vigila ya ocurrió una vez, y es la razón de que exista
 * esta comprobación.
 *
 * La migración 13 le puso tope a `fn_padron_confirmar`. La 20260910200000, cuyo
 * único objeto era añadir un campo al JSON de respuesta, reescribió la función
 * copiando el cuerpo SIN la llamada al limitador y devolviéndola a `stable`.
 * Nada falló: la función siguió contestando bien y el comentario del cliente
 * siguió afirmando que el tope estaba puesto. Se descubrió año y medio de
 * commits después, leyendo el SQL.
 *
 * Un tope no se puede comprobar leyendo: hay que agotarlo. Por eso esto vive
 * aquí, contra la base real, y no en `verificar-configuracion`.
 */
if (!limites) {
  salta("no se pidió `--limites`: no se comprobó que los topes por IP estén puestos.");
  nota("Agotarlos cierra esa puerta DIEZ MINUTOS para esta IP. Si lo corres desde");
  nota("la red de la universidad durante el pre-registro, se lo cierras a quien");
  nota("esté detrás del mismo NAT. Córrelo desde otra red, o fuera de horario.");
} else {
  /*
   * Se ataca `ventana_matricula`, que es el tope MENOS dañino de agotar: su
   * puerta solo se consulta para anunciar una fecha, y si falla la pantalla
   * enseña «inténtalo en un momento» y deja seguir. Agotar `padron_confirmar`
   * dejaría a esta IP sin poder confirmar identidad, que sí corta el recorrido.
   */
  const TOPE = 30;
  let respuesta429 = 0;
  let enQueLlamada = 0;

  for (let i = 1; i <= TOPE + 2; i++) {
    const { error } = await sb.rpc("fn_ventana_de_matricula", { p_matricula: "00000000000" });
    if (error?.code === "PGRST202") {
      falla("fn_ventana_de_matricula no existe: falta alguna migración");
      break;
    }
    // PostgREST traduce el `raise sqlstate 'PGRST'` del limitador a un 429 con
    // el mensaje que arma `privado.limitar`.
    if (/demasiados intentos/i.test(mensaje(error))) {
      respuesta429++;
      if (!enQueLlamada) enQueLlamada = i;
      break;
    }
    if (error) {
      falla(`fn_ventana_de_matricula falló por otro motivo en la llamada ${i}`, error);
      break;
    }
  }

  if (respuesta429 && enQueLlamada === TOPE + 1)
    ok(`el tope de ventana_matricula corta en la llamada ${enQueLlamada}, como está declarado`);
  else if (respuesta429)
    ok(
      `el tope corta en la llamada ${enQueLlamada} (declarado ${TOPE + 1}): hay tope, con otro valor`,
    );
  else
    falla(
      `${TOPE + 2} llamadas seguidas y ninguna se cortó: fn_ventana_de_matricula NO tiene tope por IP`,
    );
  nota("esa puerta queda cerrada ~10 minutos para esta IP; se suelta sola.");
}

// ===========================================================================
console.log("\n=== LAS FUNCIONES DEL PERSONAL, CERRADAS AL ANÓNIMO ===\n");
// ---------------------------------------------------------------------------
/*
 * Lo que esto vigila, y lo que NO.
 *
 * NO puede comprobar el arreglo de la migración 55. Ese consiste en que un
 * token de `authenticated` SIN rol de personal deje de poder llamarlas, y este
 * comprobante corre con la clave anónima: no tiene forma de fabricarse un token
 * así, y tampoco debería.
 *
 * Lo que sí vigila es la otra mitad, y no es poco: que ninguna de estas llegue
 * nunca a concederse a `anon`. Son `security definer` —se saltan las políticas—
 * y entre ellas hay tres que ESCRIBEN el día de la gente. Un `grant ... to anon`
 * puesto por descuido en una migración futura aparecería aquí el mismo día.
 */
for (const [fn, args] of [
  ["fn_evaluar_escaneo", { p_entrada: "PRE-00801", p_dia: 1, p_modo: "puerta" }],
  ["fn_reasignar_dia", { p_matricula: "00000000000", p_dia: 1 }],
  ["fn_repartir_dias_pendientes", {}],
  ["fn_alta_usuario_interno", { p_correo: "qa@prueba.invalid", p_nombre: "QA", p_rol: "admin" }],
  [
    "fn_guardar_taller",
    {
      p_clave: "T99",
      p_nombre: "QA",
      p_descripcion: "",
      p_ponente: "QA",
      p_costo: 0,
      p_cupo_total: 1,
      p_horario: "",
      p_lugar: "",
      p_activo: false,
      p_dias: [1],
      p_crear: true,
      p_liberar: false,
    },
  ],
] as const) {
  const { error } = await sb.rpc(fn, args as Record<string, unknown>);
  /*
   * PGRST202 es «esa función no existe» y cualquier otro error es «existe pero
   * no puedes». Distinguirlos importa: una función que falta y una cerrada dan
   * las dos un error, y solo una de las dos es lo que se quería comprobar.
   */
  if (error?.code === "PGRST202") falla(`\`${fn}\` NO EXISTE: falta alguna migración`);
  else if (error) ok(`\`${fn}\` está cerrada a la clave anónima`);
  else falla(`\`${fn}\` SE PUEDE LLAMAR desde la clave anónima`);
}

// ===========================================================================
console.log("\n=== LA ENTREGA DE EVIDENCIAS Y LA REGLA DE CONSTANCIA ===\n");
// ---------------------------------------------------------------------------
/*
 * Las dos puertas de la entrega existen y piden credencial. No se puede probar
 * la subida entera desde aquí —haría falta un folio real y un archivo— pero sí
 * que las funciones estén y que no dejen pasar a quien no se identifica, que es
 * lo que distingue «la migración está aplicada» de «la migración falta».
 */
{
  const { error } = await sb.rpc("fn_evidencia_preparar", {
    p_folio: "XX-000000",
    p_credencial: "nadie@prueba.invalid",
    p_dia: 1,
  });
  if (error?.code === "PGRST202")
    falla("fn_evidencia_preparar no existe: falta la migración 20260922220000 (la 52)");
  else if (/folio o credencial/i.test(mensaje(error)))
    ok("la entrega de evidencias pide credencial antes de reservar nada");
  else if (error) falla("fn_evidencia_preparar respondió otra cosa", error);
  else falla("fn_evidencia_preparar RESERVÓ una entrega sin credencial válida");

  /*
   * Lo único que esto puede afirmar es que el anónimo no VE contenido.
   *
   * Y conviene dejar dicho lo que NO prueba, porque la primera versión de esta
   * comprobación daba una falla que no existía: `list()` devuelve
   * `{error: null, data: []}` tanto con un bucket protegido por RLS como con
   * uno que NO EXISTE. Storage filtra filas en vez de contestar error, así que
   * por este camino las dos situaciones son indistinguibles.
   *
   * Que el bucket exista se comprueba en el recorrido a mano —subir una
   * evidencia desde el portal— o mirándolo en el panel de Supabase.
   */
  const { data: contenido } = await sb.storage.from("evidencias").list();
  if ((contenido ?? []).length === 0)
    ok("el bucket de evidencias no le enseña contenido al anónimo");
  else falla(`el anónimo VE ${contenido!.length} objetos del bucket de evidencias`);
}

{
  // `v_elegibles` es `security_invoker` y sus tablas están cerradas al anónimo.
  // Si contestara filas, la regla de constancia sería pública.
  const { error } = await sb.from("v_elegibles").select("folio").limit(1);
  if (error?.code === "42P01" || error?.code === "PGRST205")
    falla("no existe `v_elegibles`: falta alguna migración");
  else if (error) ok("v_elegibles existe y está cerrada al anónimo");
  else falla("v_elegibles SE PUEDE LEER desde la clave anónima");
}

// ===========================================================================
console.log("\n=== LAS VENTANAS, TAL COMO LAS VE QUIEN LLEGA ===\n");
// ---------------------------------------------------------------------------
for (const perfil of ["docente", "externo"] as const) {
  const { data, error } = await sb.rpc("fn_motivo_fuera_de_ventana_perfil", { p_perfil: perfil });
  if (error?.code === "PGRST202") falla("falta la migración 20260922120000 (la 49)");
  else if (error) falla(`fn_motivo_fuera_de_ventana_perfil(${perfil})`, error);
  else if (data === null) ok(`un ${perfil} puede pre-registrarse AHORA`);
  else ok(`un ${perfil} lee: «${data}»`);
}

// ===========================================================================
console.log("\n=== EL CUPO DEL TALLER ===\n");
// ---------------------------------------------------------------------------
/*
 * Dos mitades, y la primera se puede probar entera desde aquí.
 *
 * **Que el aspirante VEA el cupo real.** El catálogo leía la tabla `talleres`, y
 * como al anónimo le está cerrada `participantes`, el navegador sumaba cero
 * inscritos: anunciaba «30 lugares disponibles» con doscientos dentro y el botón
 * «Seleccionar» no se desactivaba nunca. Ahora lee `v_talleres`, que lo cuenta
 * en la base. Si esto vuelve a romperse, el cupo ocupado saldrá cero para todos
 * y esta comprobación lo dirá.
 */
{
  const { data, error } = await sb
    .from("v_talleres")
    .select("clave, cupo_total, ocupados_previos, cupo_ocupado, lugares_libres, dias, activo");

  if (error) {
    falla("el anónimo no puede leer v_talleres: el catálogo público se quedaría vacío", error);
  } else {
    const filas = (data ?? []) as {
      clave: string;
      cupo_total: number;
      ocupados_previos: number;
      cupo_ocupado: number;
      lugares_libres: number;
      dias: number[];
      activo: boolean;
    }[];

    ok(`el anónimo lee v_talleres: ${filas.length} talleres`);

    if (filas.some((t) => t.ocupados_previos === undefined))
      falla("v_talleres no publica `ocupados_previos`: falta la migración 59");
    else ok("v_talleres publica `ocupados_previos`, que el panel necesita por separado");

    // Lo decisivo de esta mitad: si alguien está inscrito, el anónimo TIENE que
    // verlo. Antes veía cero siempre, porque lo contaba su propio navegador.
    const conGente = filas.filter((t) => t.cupo_ocupado > 0);
    if (conGente.length)
      ok(
        `el cupo ocupado le llega al anónimo: ${conGente
          .map((t) => `${t.clave} ${t.cupo_ocupado}/${t.cupo_total}`)
          .join(", ")}`,
      );
    else
      nota(
        "ningún taller tiene inscritos ahora mismo, así que no se puede demostrar que " +
          "el conteo llega; inscribe a alguien y vuelve a correrlo.",
      );

    const descuadre = filas.find((t) => t.lugares_libres !== t.cupo_total - t.cupo_ocupado);
    if (descuadre) falla(`las cifras de ${descuadre.clave} no cuadran`, descuadre);
    else ok("lugares libres = cupo total − cupo ocupado, en todos");

    /*
     * **Que la BASE cierre la puerta.** Esta mitad solo se demuestra con un
     * taller sin lugares, y llenarlo a la fuerza costaría treinta altas y
     * treinta lugares del aforo real. Así que se aprovecha si hay uno lleno, y
     * si no, se dice cómo crear la condición en un clic.
     */
    const lleno = filas.find((t) => t.activo && t.lugares_libres <= 0);
    if (!lleno) {
      salta("ningún taller está lleno: no se puede demostrar que la base rechace la sobreventa");
      nota("Para comprobarlo en un clic: pon un taller a «cupo total 1» en /admin/talleres");
      nota("—si ya tiene un inscrito queda lleno— y vuelve a correr esto con --escribe.");
    } else if (!escribe) {
      salta(`${lleno.clave} está lleno, pero probar la sobreventa exige --escribe`);
    } else {
      const id = await tallerPorClave(lleno.clave);
      const { error: e } = await altaExterna({
        perfil: "externo",
        nombre: "QA PRUEBA SOBREVENTA",
        correo: correoDe("sobreventa"),
        dia: lleno.dias[0] ?? 1,
        taller: id,
      });
      if (/no tiene lugares disponibles/i.test(mensaje(e)))
        ok(`la base rechaza inscribir en ${lleno.clave}, que está lleno`);
      else if (e) falla(`rechaza ${lleno.clave}, pero por otro motivo`, e);
      else falla(`SOBREVENTA: la base aceptó inscribir en ${lleno.clave}, que no tenía lugares`);
    }
  }
}

// ===========================================================================
if (!escribe) {
  console.log("\n=== LAS ALTAS DE VERDAD ===\n");
  salta("no se pidió `--escribe`, así que no se dio de alta a nadie.");
  console.log("       Sin ellas quedan sin probar: la reentrancia del alta, el cambio");
  console.log("       de taller por el camino real, el aforo del día y la puerta del");
  console.log("       portal. Cuestan DOS lugares del aforo, y solo la primera vez.");
  console.log(
    fallas === 0 ? `\nLO COMPROBADO PASA (${saltadas} saltadas)` : `\n${fallas} PROBLEMAS`,
  );
  process.exit(fallas === 0 ? 0 : 1);
}

console.log("\n=== EL RECORRIDO DE UN DOCENTE, DE VERDAD ===\n");
// ---------------------------------------------------------------------------
/**
 * Folio, día y credencial del docente de prueba.
 *
 * Se expone fuera del bloque para que la entrega de evidencia lo reutilice en
 * vez de dar de alta a otra persona: cada alta cuesta un lugar del aforo, y la
 * entrega necesita exactamente lo mismo que ya hay aquí.
 */
let elDocente: { folio: string; dia: number; correo: string } | null = null;
{
  const correo = correoDe("docente");
  const primera = await altaExterna({
    perfil: "docente",
    nombre: "QA PRUEBA DOCENTE",
    correo,
    dia: 1,
  });
  if (primera.error) {
    falla("no se pudo dar de alta al docente de prueba", primera.error);
  } else {
    const uno = primera.data as { id: string; folio: string; dia: number };
    elDocente = { folio: uno.folio, dia: uno.dia, correo };
    ok(`alta del docente: folio ${uno.folio}, día ${uno.dia}`);

    /*
     * La reentrancia, que es la regla que hace barato este comprobante y, sobre
     * todo, la que impide que alguien que vuelve atrás en el navegador acabe
     * con dos folios y dos cuotas que pagar.
     */
    const segunda = await altaExterna({
      perfil: "docente",
      nombre: "QA PRUEBA DOCENTE",
      correo,
      dia: 1,
    });
    const dos = segunda.data as { folio: string } | null;
    if (segunda.error)
      falla("la segunda alta idéntica falló en vez de devolver el folio", segunda.error);
    else if (dos?.folio === uno.folio) ok(`repetir el alta devuelve el mismo folio (${dos.folio})`);
    else falla(`repetir el alta creó OTRO folio: ${uno.folio} y luego ${dos?.folio}`);

    // La puerta del portal: el folio más el correo.
    const auth = await sb.rpc("fn_autenticar_portal", { p_folio: uno.folio, p_credencial: correo });
    if (auth.error) falla("fn_autenticar_portal falló con las credenciales buenas", auth.error);
    else if (auth.data) ok("el portal abre con folio y correo correctos");
    else falla("el portal NO abre con folio y correo correctos");

    // Y con la credencial equivocada, no abre.
    const mala = await sb.rpc("fn_autenticar_portal", {
      p_folio: uno.folio,
      p_credencial: "no-es-su-correo@prueba.invalid",
    });
    if (mala.error) ok("con la credencial equivocada el portal devuelve error");
    else if (!mala.data) ok("con la credencial equivocada el portal no devuelve a nadie");
    else falla("EL PORTAL ABRIÓ CON UNA CREDENCIAL EQUIVOCADA");

    /*
     * Y lo que de verdad importa del portal: que un folio inexistente y un
     * folio real con la credencial mal NO se distingan. Si se distinguieran,
     * el portal sería un enumerador de folios.
     */
    const fantasma = await sb.rpc("fn_autenticar_portal", {
      p_folio: "XX-000000",
      p_credencial: correo,
    });
    const igualDeMudos =
      (fantasma.error?.message ?? null) === (mala.error?.message ?? null) &&
      !fantasma.data === !mala.data;
    if (igualDeMudos) ok("un folio inexistente responde igual que una credencial equivocada");
    else
      falla(
        "el portal distingue folio inexistente de credencial equivocada: es un enumerador de folios",
        {
          inexistente: fantasma.error?.message ?? fantasma.data,
          credencialMala: mala.error?.message ?? mala.data,
        },
      );
  }
}

console.log("\n=== LA ENTREGA DE UNA EVIDENCIA, DE PUNTA A PUNTA ===\n");
// ---------------------------------------------------------------------------
/*
 * El recorrido completo de la migración 52, con la clave anónima.
 *
 * Se dio por hecho que esto no se podía probar desde aquí, y sí se puede: el
 * paso que necesita una sesión de revisor es VER la imagen firmada, no subirla.
 * Las dos funciones de la entrega están concedidas al anónimo —tienen que
 * estarlo, el participante no tiene sesión— y la política de Storage le permite
 * depositar.
 *
 * Lo que se ejerce aquí son las cuatro reglas que sostienen la entrega, y cada
 * una se caería en silencio: que pida credencial, que rechace el día en que a
 * esa persona le toca asistir, que solo acepte la ruta que ella misma emitió, y
 * que el anónimo NO pueda leer lo que acaba de subir.
 */
/*
 * Primero, la regla que añadió la migración 58: SOLO los alumnos entregan.
 *
 * Esto salió al probar la 52 de punta a punta. El recorrido se hizo con un
 * DOCENTE y funcionó entero — y que la prueba pasara era, en realidad, el
 * hallazgo: la pantalla decía «las evidencias solo aplican para alumnos» y la
 * base no lo comprobaba.
 */
if (!elDocente) {
  salta("sin docente de prueba no se puede comprobar quién NO entrega evidencia");
} else {
  const { folio, dia, correo } = elDocente;
  const { error } = await sb.rpc("fn_evidencia_preparar", {
    p_folio: folio,
    p_credencial: correo,
    p_dia: dia === 1 ? 2 : 1,
  });
  if (/solo para alumnos/i.test(mensaje(error)))
    ok("un docente NO puede entregar evidencia: su perfil no la necesita");
  else if (error) falla("rechaza al docente, pero por otro motivo", error);
  else falla("un DOCENTE pudo reservar una entrega de evidencia");
}

/*
 * Y el recorrido completo, que ahora necesita un alumno de verdad.
 *
 * Un alumno solo existe si su matrícula está en el padrón, y este comprobante no
 * puede —ni debe— inventarse una: usar la de una persona real ocuparía SU
 * pre-registro, con el correo y el celular de esta prueba dentro. Así que la
 * matrícula se pide por fuera:
 *
 *     QA_MATRICULA=20262100001 bun run probar-sistema --escribe
 *
 * Reserva una en el padrón para esto, con su programa y su avance dentro de
 * alguna ventana abierta. Sin ella se salta y se DICE qué queda sin ejercer,
 * que es mejor que fingir cobertura: la subida al bucket, la confirmación y que
 * el portal la enseñe.
 */
const matriculaQA = process.env["QA_MATRICULA"];
if (!matriculaQA) {
  salta("sin QA_MATRICULA no se recorre la entrega completa de una evidencia.");
  nota("Reserva una matrícula en el padrón para pruebas y córrelo así:");
  nota("  QA_MATRICULA=<matricula> bun run probar-sistema --escribe");
  nota("Queda sin ejercer: la subida al bucket, la confirmación y el portal.");
} else {
  const alta = await sb.rpc("fn_preregistrar_alumno", {
    p_matricula: matriculaQA,
    p_correo: correoDe("alumno"),
    p_celular: "8112345678",
    p_acepto_aviso: true,
    p_taller: null,
  });

  if (alta.error) {
    falla(`no se pudo dar de alta al alumno ${matriculaQA}`, alta.error);
    nota("¿Está esa matrícula en el padrón, y su programa dentro de una ventana abierta?");
  } else {
    const { folio, dia } = alta.data as { folio: string; dia: number };
    const credencial = matriculaQA;
    const diaEvidencia = dia === 1 ? 2 : 1;
    ok(`alta del alumno de prueba: folio ${folio}, día ${dia}`);

    const prep = await sb.rpc("fn_evidencia_preparar", {
      p_folio: folio,
      p_credencial: credencial,
      p_dia: diaEvidencia,
    });

    if (prep.error) {
      falla("fn_evidencia_preparar no reservó la entrega", prep.error);
    } else {
      const ruta = prep.data as string;
      ok(`reserva la ruta de subida del día ${diaEvidencia}`);

      const suDia = await sb.rpc("fn_evidencia_preparar", {
        p_folio: folio,
        p_credencial: credencial,
        p_dia: dia,
      });
      if (/es el que te toca asistir/i.test(mensaje(suDia.error)))
        ok(`rechaza la evidencia del día ${dia}, que es el que le toca asistir`);
      else falla(`ACEPTÓ la evidencia del día ${dia}`, suDia.error ?? suDia.data);

      const credencialMala = await sb.rpc("fn_evidencia_preparar", {
        p_folio: folio,
        p_credencial: "00000000000",
        p_dia: diaEvidencia,
      });
      if (/folio o credencial/i.test(mensaje(credencialMala.error)))
        ok("rechaza una credencial que no es la suya");
      else falla("ACEPTÓ una credencial equivocada", credencialMala.error);

      // Un PNG de 1x1: lo que se prueba es el camino, no la foto.
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (c) => c.charCodeAt(0),
      );
      const subida = await sb.storage
        .from("evidencias")
        .upload(ruta, png, { contentType: "image/png", upsert: false });

      if (subida.error) {
        falla("no se pudo subir el archivo al bucket", subida.error);
      } else {
        ok("el archivo sube al bucket con la clave anónima");
        const resumen = await crypto.subtle.digest("SHA-256", png);
        const hash = [...new Uint8Array(resumen)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const rutaAjena = await sb.rpc("fn_evidencia_confirmar", {
          p_folio: folio,
          p_credencial: credencial,
          p_dia: diaEvidencia,
          p_ruta: "otra/ruta/inventada",
          p_hash: hash,
        });
        if (/no corresponde a tu entrega/i.test(mensaje(rutaAjena.error)))
          ok("rechaza confirmar una ruta que no emitió");
        else falla("ACEPTÓ una ruta que no emitió", rutaAjena.error ?? rutaAjena.data);

        const conf = await sb.rpc("fn_evidencia_confirmar", {
          p_folio: folio,
          p_credencial: credencial,
          p_dia: diaEvidencia,
          p_ruta: ruta,
          p_hash: hash,
        });
        if (conf.error) falla("no se pudo confirmar la entrega", conf.error);
        else ok("la entrega queda confirmada");

        const estado = await sb.rpc("fn_portal_estado", {
          p_folio: folio,
          p_credencial: credencial,
        });
        const evidencias = (estado.data as Record<string, unknown> | null)?.["evidencias"] as
          { dia: number; estado: string }[] | undefined;
        const suya = (evidencias ?? []).find((e) => e.dia === diaEvidencia);
        if (suya?.estado === "pendiente")
          ok(`su portal la enseña como «pendiente» el día ${diaEvidencia}`);
        else falla("el portal NO enseña la evidencia recién entregada", evidencias);

        const baja = await sb.storage.from("evidencias").download(ruta);
        if (baja.error) ok("el anónimo NO puede descargar la evidencia que subió");
        else falla("EL ANÓNIMO PUEDE DESCARGAR LAS EVIDENCIAS DEL BUCKET");
      }
    }
  }
}

console.log("\n=== EL CAMBIO DE TALLER, POR EL CAMINO DE LA APLICACIÓN ===\n");
// ---------------------------------------------------------------------------
/*
 * `fn_cambiar_taller` está cerrada al anónimo, y así tiene que seguir. La
 * pantalla `/talleres` cambia de taller volviendo a llamar al alta con otro
 * taller, y la función reconoce que esa persona ya existe y cambia el suyo.
 * Se prueba ese camino, que es el que de verdad se usa.
 */
{
  const correo = correoDe("externo");
  const { data: activos } = await sb
    .from("v_talleres")
    .select("clave, dias, lugares_libres")
    .eq("activo", true);
  const delDia2 = ((activos ?? []) as { clave: string; dias: number[]; lugares_libres: number }[])
    .filter((t) => t.dias.includes(2) && t.lugares_libres > 0)
    .map((t) => t.clave);

  if (delDia2.length < 2) {
    salta("hacen falta dos talleres con cupo el día 2 para probar el cambio");
  } else {
    const [a, b] = delDia2 as [string, string];
    const idA = await tallerPorClave(a);
    const idB = await tallerPorClave(b);

    const antesA = await ocupado(a);
    const alta = await altaExterna({
      perfil: "externo",
      nombre: "QA PRUEBA EXTERNO",
      correo,
      dia: 2,
      taller: idA,
    });
    if (alta.error) {
      falla("no se pudo dar de alta al externo de prueba", alta.error);
    } else {
      const folio = (alta.data as { folio: string }).folio;
      ok(`alta del externo en ${a}: folio ${folio}`);
      const despuesA = await ocupado(a);
      if (antesA !== null && despuesA === antesA + 1)
        ok(`el cupo ocupado de ${a} subió de ${antesA} a ${despuesA}`);
      else
        nota(
          `cupo de ${a}: antes ${antesA}, después ${despuesA} (puede haber otras altas a la vez)`,
        );

      // Ahora al otro taller, por el mismo camino que usa la pantalla.
      const antesB = await ocupado(b);
      const cambio = await altaExterna({
        perfil: "externo",
        nombre: "QA PRUEBA EXTERNO",
        correo,
        dia: 2,
        taller: idB,
      });
      if (cambio.error) falla(`no se pudo cambiar de ${a} a ${b}`, cambio.error);
      else {
        const finalA = await ocupado(a);
        const finalB = await ocupado(b);
        if (finalA === despuesA! - 1 && finalB === antesB! + 1)
          ok(
            `cambiar de ${a} a ${b} movió el cupo: ${a} ${despuesA}→${finalA}, ${b} ${antesB}→${finalB}`,
          );
        else
          falla(`el cupo no siguió al cambio de taller`, {
            [a]: `${despuesA}→${finalA}`,
            [b]: `${antesB}→${finalB}`,
          });
      }

      /*
       * Y LA REGLA NUEVA: un taller de otro día tiene que ACEPTARSE.
       *
       * Esta comprobación afirmaba lo contrario hasta la migración 60 —exigía
       * el rechazo— y era correcta entonces: la llave foránea
       * `(taller_id, dia) -> taller_dias` hacía imposible la fila. Quitada la
       * llave, es al revés: quien asiste el día 2 puede tomar un taller de la
       * tarde del día 1 en la UPN, que es otra sede.
       *
       * Es la mitad que de verdad prueba el desacople, y solo se puede probar
       * escribiendo: la llave vive en la base y su ausencia no se ve desde el
       * lado anónimo. Si alguien la repone, esto lo dice.
       */
      const deOtroDia = (
        (activos ?? []) as { clave: string; dias: number[]; lugares_libres: number }[]
      ).find((t) => !t.dias.includes(2) && t.lugares_libres > 0);
      if (!deOtroDia)
        salta("no hay taller con cupo ajeno al día 2 para probar que ya no se limita por día");
      else {
        const idOtro = await tallerPorClave(deOtroDia.clave);
        const antesOtro = await ocupado(deOtroDia.clave);
        const { error } = await altaExterna({
          perfil: "externo",
          nombre: "QA PRUEBA EXTERNO",
          correo,
          dia: 2,
          taller: idOtro,
        });
        if (/no se imparte el día/i.test(mensaje(error)))
          falla(
            `RECHAZÓ ${deOtroDia.clave} por ser de otro día: la llave (taller_id, dia) volvió a ` +
              "estar puesta, o falta la migración 60",
            error,
          );
        else if (error)
          falla(`el alta en ${deOtroDia.clave}, de otro día, falló por otro motivo`, error);
        else {
          const finalOtro = await ocupado(deOtroDia.clave);
          ok(
            `quien asiste el día 2 puede tomar ${deOtroDia.clave}, que se imparte el día ` +
              `${deOtroDia.dias.join(" y ")} (cupo ${antesOtro}→${finalOtro})`,
          );
        }
      }
    }
  }
}

// ===========================================================================
console.log("\n=== EL AFORO DE CADA DÍA, AHORA MISMO ===\n");
{
  const { data, error } = await sb.from("v_cupo_dia").select("*").order("dia");
  if (error) falla("no se pudo leer v_cupo_dia", error);
  else for (const d of (data ?? []) as Record<string, unknown>[]) nota(JSON.stringify(d));
}

// ===========================================================================
console.log("\n=== PARA BORRAR LO QUE ESTE COMPROBANTE CREÓ ===\n");
console.log("Pega `supabase/utilidades/limpiar-datos-de-prueba.sql` en el editor SQL de");
console.log("Supabase. Lleva el orden correcto —las cuatro tablas de `restrict` antes que");
console.log("el participante—, borra también los archivos del bucket mientras todavía se");
console.log("sabe de quién eran, y empieza por un `select` para mirar antes de borrar.\n");
console.log("El resumen, por si lo prefieres a mano:\n");
console.log("  -- Primero las evidencias, que referencian al participante:");
console.log("  delete from evidencias where participante_id in (");
console.log("    select id from participantes where correo like 'qa-%@prueba.invalid');");
console.log("");
console.log("  delete from participantes");
console.log("   where correo like 'qa-%@prueba.invalid'");
console.log(`      or institucion = '${MARCA}';\n`);
console.log("  -- Y para verlos antes de borrarlos:");
console.log("  -- select folio, nombre, correo, perfil, dia, taller_id from participantes");
console.log("  --  where correo like 'qa-%@prueba.invalid';\n");

console.log(fallas === 0 ? `EL SISTEMA PASA (${saltadas} saltadas)` : `${fallas} PROBLEMAS`);
process.exit(fallas === 0 ? 0 : 1);
