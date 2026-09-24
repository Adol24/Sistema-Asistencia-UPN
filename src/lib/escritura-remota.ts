/**
 * El puente entre lo que se ve y lo que se guarda.
 *
 * Vivía dentro de `estado-evento.tsx`, y ahí no era del contexto: era su propia
 * pieza. El contexto lo usa dieciocho veces y nunca necesita saber cómo está
 * hecho, así que separarlo quita ochenta líneas de un archivo que ya pasaba de
 * dos mil y deja este asunto —escribir sin esperar— donde se puede leer entero
 * de una vez.
 */

import { hayBaseDeDatos } from "@/lib/supabase-config";
import type { ConfiguracionEvento } from "@/lib/configuracion";

/**
 * Acceso a la capa de datos, cargada bajo demanda.
 *
 * `@/lib/datos` arrastra el SDK de Supabase. Importarlo de forma estática metía
 * ese peso en el paquete que descarga **cualquier** visitante, incluido el
 * alumno que solo abre su QR desde el teléfono y nunca escribe en la base. Con
 * el import dinámico, el SDK se descarga la primera vez que hace falta y solo
 * si hay base configurada.
 */
export type ModuloDatos = typeof import("@/lib/datos");

/**
 * Campo de la configuración -> columna de su tabla.
 *
 * Era una escalera de ocho `if (patch.x !== undefined)` idénticos salvo por el
 * nombre. Como dato en una tabla, añadir un campo es una línea y no hay ninguna
 * rama que leer: la correspondencia se ve de un vistazo y no puede
 * desincronizarse a mitad de la escalera.
 *
 * ---------------------------------------------------------------------------
 * **Tenía ocho entradas y el formulario edita veintitrés.**
 *
 * Lo que no estaba aquí se descartaba en silencio, y la pantalla decía
 * «Configuración guardada» igual. No se guardaban: los cuatro datos bancarios,
 * los dos de la ventanilla, la fecha límite, el aviso de privacidad, los
 * términos, el horario de soporte y los dos tramos de registro. Trece campos.
 *
 * El más caro era el banco. Es la cuenta a la que depositan setecientas
 * personas: alguien corrige el número dos días antes, lee que se guardó, se va
 * tranquilo, y los depósitos siguen yendo a la cuenta vieja.
 *
 * Que faltara una fila no es el defecto —una tabla se completa—; el defecto es
 * que descartar en silencio se veía igual que guardar. Por eso ahora existe
 * `camposSinGuardar`: lo que no tiene columna se puede NOMBRAR, y la pantalla
 * que lo edite tiene con qué dejar de prometer.
 * ---------------------------------------------------------------------------
 *
 * Solo campos planos. `dias` y `catalogoAcademico` viven en tablas aparte.
 */
const COLUMNA = {
  nombre: "nombre",
  subtitulo: "subtitulo",
  fechas: "fechas",
  cuotaEvento: "cuota_evento",
  fechaLimite: "fecha_limite",
  horasValidacion: "horas_validacion",
  dominioInstitucional: "dominio_institucional",
  registroEntrada: "registro_entrada",
  registroSalida: "registro_salida",
  whatsappSoporte: "whatsapp_soporte",
  correoSoporte: "correo_soporte",
  horarioSoporte: "horario_soporte",
  avisoPrivacidad: "aviso_privacidad",
  terminos: "terminos",
} as const satisfies Partial<Record<keyof ConfiguracionEvento, string>>;

/**
 * Los dos campos que en la aplicación son un objeto y en la tabla son columnas
 * sueltas.
 *
 * Van aparte y no en `COLUMNA` porque la correspondencia no es campo→columna
 * sino campo→varias columnas, y meterlos en la misma tabla habría obligado a
 * que cada entrada supiera si es plana o no. Son dos; se nombran los dos.
 */
const ANIDADAS = {
  banco: {
    banco: "banco_nombre",
    cuenta: "banco_cuenta",
    beneficiario: "banco_beneficiario",
  },
  ventanilla: { lugar: "ventanilla_lugar", horario: "ventanilla_horario" },
} as const satisfies Partial<Record<keyof ConfiguracionEvento, Record<string, string>>>;

/**
 * Lo que esta tabla NO puede guardar, y por qué, para poder decirlo.
 *
 * - `horario` es derivado: la tabla guarda los dos tramos de registro y el
 *   horario se arma juntándolos al leer. No hay columna que escribir.
 * - `dias` tiene su propia tabla y su propio camino, `guardarDia`. No se
 *   descarta: se guarda en otro sitio.
 * - `catalogoAcademico` también, desde que la licenciatura modular obligó a que
 *   el tope de un programa se pudiera corregir sin escribir una migración. Va
 *   por `guardarCatalogo`.
 */
const SIN_COLUMNA: Record<string, string> = {
  horario: "el horario general (se arma solo con los dos tramos de registro)",
};

/**
 * Dónde acaba cada campo de la configuración. Los cuatro destinos posibles.
 *
 * No es documentación: lo lee `bun run verificar-configuracion`, que comprueba
 * que TODO campo de `ConfiguracionEvento` esté en uno de los cuatro grupos.
 *
 * Esa comprobación es la que faltaba. El defecto de los trece campos no fue
 * que alguien se equivocara al escribir el mapa: fue que añadir un campo al
 * formulario y olvidar la fila de aquí no rompía nada —ni compilaba mal, ni
 * fallaba en pantalla, ni salía en una prueba—. Se descartaba en silencio y el
 * aviso decía «guardada». Ahora olvidarlo falla el comprobante.
 */
export const DESTINO_DE_CAMPO = {
  /** Una columna suya en `configuracion_evento`. */
  columna: Object.keys(COLUMNA),
  /** Un objeto en la aplicación, varias columnas en la tabla. */
  anidada: Object.keys(ANIDADAS),
  /** No se puede guardar, y se avisa a quien lo edite. */
  sinColumna: Object.keys(SIN_COLUMNA),
  /** Tiene tabla propia y su propio camino de escritura. */
  tablaPropia: ["dias", "catalogoAcademico"],
} as const;

/** Sin dominio configurado es cadena vacía en la app y NULL en la tabla. */
const valorDeColumna = (campo: string, valor: unknown) =>
  campo === "dominioInstitucional" ? valor || null : valor;

export function columnasDeConfiguracion(
  patch: Partial<ConfiguracionEvento>,
): Record<string, unknown> {
  const columnas: Record<string, unknown> = {};

  for (const [campo, valor] of Object.entries(patch)) {
    if (valor === undefined) continue;

    if (campo in COLUMNA) {
      columnas[COLUMNA[campo as keyof typeof COLUMNA]] = valorDeColumna(campo, valor);
      continue;
    }

    const anidada = ANIDADAS[campo as keyof typeof ANIDADAS] as Record<string, string> | undefined;
    if (anidada && valor && typeof valor === "object")
      for (const [clave, columna] of Object.entries(anidada)) {
        const suyo = (valor as Record<string, unknown>)[clave];
        if (suyo !== undefined) columnas[columna] = suyo;
      }
  }

  return columnas;
}

/**
 * Los campos del parche que esta capa no sabe guardar, con nombre de persona.
 *
 * Existe para que una pantalla pueda decir la verdad. Devolver una lista vacía
 * es «se guardó todo»; devolver algo es «esto no, y es esto». Lo que antes
 * pasaba —descartar y anunciar éxito— no se puede distinguir de funcionar, y
 * por eso duró.
 */
export function camposSinGuardar(patch: Partial<ConfiguracionEvento>): string[] {
  return Object.entries(patch)
    .filter(([campo, valor]) => valor !== undefined && campo in SIN_COLUMNA)
    .map(([campo]) => SIN_COLUMNA[campo]!);
}

/**
 * Avisa en pantalla de una escritura que la base rechazó.
 *
 * Se importa el aviso al vuelo en vez de arriba porque este módulo lo cargan
 * todas las pantallas, incluidas las del participante en el teléfono, y una
 * escritura fallida es la excepción: no vale la pena que el paquete de la
 * portada arrastre la librería de avisos por un caso que casi nunca ocurre.
 */
export function avisarFallo(mensaje: string): void {
  void import("sonner").then(({ toast }) => toast.error(mensaje));
}

/**
 * Lo contrario, y hace falta por una sola razón: la cola.
 *
 * Todo lo demás en esta aplicación se pinta antes de guardarse, así que no hay
 * nada que celebrar después —la pantalla ya lo dio por hecho—. Vaciar la cola
 * sin conexión es la excepción: lo que se sincroniza ocurrió hace rato, puede
 * ser en otra pantalla, y sin decirlo el capturista no tiene forma de saber que
 * sus ochenta escaneos por fin están a salvo.
 */
export function avisarLogro(mensaje: string): void {
  void import("sonner").then(({ toast }) => toast.success(mensaje));
}

/**
 * Escribe en la base sin que nadie espere el resultado.
 *
 * Reúne en un sitio el patrón que estaba copiado cuatro veces —escribir sin
 * esperar y registrar el fallo en consola—, que es la forma correcta aquí: la
 * pantalla ya se actualizó de manera optimista y la escritura no debe bloquear
 * a quien está atendiendo una fila.
 *
 * -----------------------------------------------------------------------------
 * `alFallar` es OBLIGATORIO, y antes no lo era.
 * -----------------------------------------------------------------------------
 * Era opcional, y de diecinueve llamadas NUEVE lo omitían. En esas nueve, un
 * rechazo de la base producía un `console.error` y nada más: ni aviso, ni
 * revertido, ni rastro para quien estaba usando la pantalla.
 *
 * El resultado es el mismo defecto una y otra vez, con nombres distintos: **la
 * pantalla dice que sí y la base dice que no.** La puerta pinta VERDE y la
 * asistencia no existe. La evidencia se aprueba y el alumno no lo ve nunca. Se
 * da de baja a un capturista y su sesión sigue viva. Se corrige la cuenta del
 * banco y los depósitos siguen yendo a la vieja. Nadie se entera hasta que se
 * cuentan los resultados, que es cuando ya no se puede arreglar.
 *
 * Ponerlo obligatorio no arregla por sí solo ninguno de esos casos: los arregla
 * el manejador que ahora hay que escribir en cada uno. Lo que hace es que
 * OLVIDARLO no compile, que es la única forma de que no vuelva a pasar
 * diecinueve veces.
 *
 * Cuando de verdad no haya nada que deshacer, el manejador sigue teniendo que
 * decirlo: `avisarFallo` es el mínimo, y basta. Lo que no vale es el silencio.
 *
 * @param alFallar Se llama si la base rechazó la escritura: para deshacer lo que
 *   ya se había pintado, para avisar a quien lo hizo, o para las dos cosas.
 */
export function escribir(
  descripcion: string,
  accion: (datos: ModuloDatos) => Promise<unknown>,
  alFallar: (e: unknown) => void,
): void {
  if (!hayBaseDeDatos) return;
  void import("@/lib/datos").then(accion).catch((e: unknown) => {
    console.error(`No se pudo guardar ${descripcion}`, e);
    alFallar(e);
  });
}
