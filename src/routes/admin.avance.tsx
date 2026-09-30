/**
 * La hoja de avance: el reporte con gráficas, hecho para el papel.
 *
 * ---------------------------------------------------------------------------
 * Qué lleva dentro
 * ---------------------------------------------------------------------------
 * Seis cifras arriba —apuntados, pagados, pendientes, ocupación y el dinero—, y
 * debajo el mismo par de columnas repetido en cada corte: cuántos se apuntaron
 * ahí y cuántos de esos ya pagaron. Los cortes son sede, perfil, día, nivel,
 * licenciatura, semestre, plantel y taller.
 *
 * Todos cuentan con `desglosar`, que devuelve siempre las mismas columnas. No
 * es solo por no repetir seis `filter`: la resta de `faltan` descuenta a los
 * exentos, y la copia que lo olvidara inventaría una morosidad que no existe.
 *
 * ---------------------------------------------------------------------------
 * Por qué es una hoja y no un botón que escupe un PDF
 * ---------------------------------------------------------------------------
 * Un CSV no lleva gráficas —es texto separado por comas—, así que el reporte de
 * `/admin/reportes` no podía crecer hacia aquí. Y generar el PDF desde el
 * navegador pedía dos librerías: una que dibuje el documento y otra que
 * convierta las gráficas en imagen. Entre las dos pasan del medio mega, solo
 * para esta pantalla, y el resultado sería PEOR: una captura rasterizada, con
 * el texto convertido en píxeles, que no se puede seleccionar ni buscar y que
 * se ve borrosa al ampliar.
 *
 * Imprimir desde el navegador —`Ctrl+P` → «Guardar como PDF»— produce un
 * documento vectorial: las gráficas salen como SVG, el texto sigue siendo
 * texto, y no pesa nada porque no hay librería que bajar. Es también lo que ya
 * hace el resto del sistema: el comprobante del aspirante llega al papel así, y
 * de `/pago` y de `/comprobante` se retiraron sendos botones que solo llamaban
 * a `window.print()`, porque duplicaban lo que el navegador ya hace.
 *
 * Lo único que este archivo tiene que garantizar es que lo que se ve sea lo que
 * sale. De ahí las dos decisiones de abajo.
 *
 * ---------------------------------------------------------------------------
 * Los colores van escritos, no en variables del tema
 * ---------------------------------------------------------------------------
 * El panel tiene modo oscuro. Una hoja que heredara el tema saldría con fondo
 * negro —y en cuanto el navegador descarta los fondos al imprimir, que es lo
 * que hace por omisión, quedaría texto claro sobre papel blanco: ilegible.
 *
 * Así que esta pantalla no se tematiza. Usa los valores CLAROS del sistema,
 * copiados aquí como literales, y se ve igual en oscuro que en claro que en
 * papel. Los `oklch` son los mismos de `styles.css`: si allí cambia el azul de
 * la universidad, aquí hay que venir a cambiarlo. Es el precio de que la hoja
 * no dependa de un tema, y se paga a gusto.
 *
 * ---------------------------------------------------------------------------
 * Las gráficas se importan de forma estática, y es a propósito
 * ---------------------------------------------------------------------------
 * En `/admin` van perezosas porque `recharts` pesa 375 KB y el tablero tiene
 * quince cosas más que enseñar mientras tanto. Aquí no: esta pantalla ES las
 * gráficas, y una carga diferida abre la puerta al peor fallo posible —alguien
 * pulsa `Ctrl+P` antes de que el trozo baje y se lleva una hoja con dos huecos
 * blancos donde iban los datos—. Como es su propia ruta, `recharts` solo llega
 * a quien entra aquí.
 */

import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Protegido } from "@/components/acceso";
import {
  GraficaAvance,
  GraficaDesglose,
  GraficaPerfiles,
  GraficaPorDia,
} from "@/components/graficas-panel";
import { avancePorDia, totalDelAvance } from "@/lib/avance";
import { desglosar, sumaDelDesglose, type GrupoDesglosado } from "@/lib/desglose";
import { avanceTexto } from "@/dominio/catalogos";
import { useEstadoEvento } from "@/lib/estado-evento";
import { fechaHora, moneda } from "@/lib/formato";
import { porCobrar } from "@/lib/pagos-logica";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Dia, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/avance")({
  head: () =>
    meta(
      "Hoja de avance",
      "Avance del pre-registro del XIV Encuentro Internacional de Educación: contra el aforo de cada sede y desglosado por nivel, licenciatura, semestre, plantel y taller, con gráficas, para imprimir o guardar como PDF.",
    ),
  component: () => (
    <Protegido area="admin">
      <HojaDeAvance />
    </Protegido>
  ),
});

/*
 * La paleta clara del sistema, escrita. Ver la cabecera: esta hoja no se
 * tematiza. Son los valores de `:root` en `styles.css`, no los de `.dark`.
 */
const TINTA = {
  alumno: "oklch(0.443 0.193 261)",
  docente: "oklch(0.506 0.142 149)",
  externo: "oklch(0.509 0.007 255.5)",
  /** El techo, en gris: es el fondo contra el que se leen las otras barras. */
  meta: "oklch(0.87 0.005 255)",
  pagado: "oklch(0.506 0.142 149)",
};

/**
 * Un bloque de la hoja: su título, su aclaración y lo que enseñe.
 *
 * @param junta Que el navegador no parta el bloque entre dos páginas. Va
 *   apagado en las tablas largas: una tabla de veinte carreras que no se puede
 *   partir se empuja entera a la página siguiente y deja media hoja en blanco.
 * @param nuevaPagina Empieza página. Se usa donde el documento cambia de tema
 *   —del avance general al detalle académico— y no para separar cada sección.
 */
function Seccion({
  titulo,
  nota,
  junta = true,
  nuevaPagina = false,
  children,
}: {
  titulo: string;
  nota?: string;
  junta?: boolean;
  nuevaPagina?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "mt-6",
        junta && "break-inside-avoid",
        nuevaPagina && "print:break-before-page",
      )}
    >
      <h2 className="text-sm font-bold">{titulo}</h2>
      {nota ? <p className="mb-2 text-xs text-neutral-500">{nota}</p> : null}
      {children}
    </section>
  );
}

/**
 * La tabla de un corte cualquiera, con su fila de totales.
 *
 * Las mismas seis columnas en los cuatro cortes, y en el mismo orden. Un
 * documento que cuenta lo mismo de cuatro maneras distintas obliga a releer
 * cada encabezado; así, quien leyó la primera tabla ya sabe leer las otras.
 */
function TablaDesglose({ columna, grupos }: { columna: string; grupos: GrupoDesglosado[] }) {
  if (grupos.length === 0)
    return <p className="mt-1 text-xs italic text-neutral-500">Todavía no hay nadie que contar.</p>;

  const suma = sumaDelDesglose(grupos);
  return (
    <table className="mt-2 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-neutral-400 text-left">
          {[columna, "Apuntados", "Pagados", "Exentos", "Faltan", "% pagado"].map((h) => (
            <th key={h} className="py-1.5 pr-2 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => (
          <tr key={g.etiqueta} className="border-b border-neutral-200">
            <td className="py-1.5 pr-2">{g.etiqueta}</td>
            <td className="py-1.5 pr-2 font-semibold tabular-nums">{g.total}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.pagados}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.exentos}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.faltan}</td>
            <td className="py-1.5 tabular-nums">{g.pct}%</td>
          </tr>
        ))}
        <tr className="border-t-2 border-neutral-400 font-bold">
          <td className="py-1.5 pr-2">TOTAL</td>
          <td className="py-1.5 pr-2 tabular-nums">{suma.total}</td>
          <td className="py-1.5 pr-2 tabular-nums">{suma.pagados}</td>
          <td className="py-1.5 pr-2 tabular-nums">{suma.exentos}</td>
          <td className="py-1.5 pr-2 tabular-nums">{suma.faltan}</td>
          <td className="py-1.5 tabular-nums">{suma.pct}%</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Las barras de un desglose, listas para la gráfica. */
const aBarras = (grupos: GrupoDesglosado[]) =>
  grupos.map((g) => ({ etiqueta: g.etiqueta, preinscritos: g.total, pagados: g.pagados }));

/**
 * El alto de una gráfica tumbada: un renglón por grupo.
 *
 * Fijo sería la trampa. Con veinte carreras en 200 px las barras quedan de un
 * píxel y los rótulos se montan unos sobre otros; creciendo con los datos, lo
 * que se gasta es papel, que es lo que sobra.
 */
const altoTumbada = (grupos: number) => Math.max(120, 26 * grupos + 40);

function HojaDeAvance() {
  const { participantes, configuracion, estadoDe, talleres } = useEstadoEvento();

  /*
   * El estado de cada concepto, en una función cada uno.
   *
   * `desglosar` los recibe así para poder cortar el evento o el taller con la
   * misma cuenta, y para que esa cuenta sea LA MISMA que pinta la insignia de
   * una ficha: este reporte no puede decir de alguien algo distinto de lo que
   * dice su ficha.
   */
  const estadoEvento = (p: Participante) => estadoDe(p).evento;
  const estadoTaller = (p: Participante) => estadoDe(p).taller ?? "pre_registrado";

  // La misma cuenta que la tarjeta del tablero y el CSV. Ver `lib/avance.ts`:
  // vive fuera para que las tres no puedan discrepar.
  const filas = avancePorDia(configuracion.dias, participantes, estadoEvento);
  const total = totalDelAvance(filas);

  const porPerfil = (["alumno", "docente", "externo"] as const).map((perfil) => ({
    perfil,
    etiqueta: perfil[0]!.toUpperCase() + perfil.slice(1) + "s",
    total: participantes.filter((p) => p.perfil === perfil).length,
  }));

  const porDia = ([1, 2, 3] as Dia[]).map((dia) => ({
    etiqueta: `Día ${dia}`,
    alumno: participantes.filter((p) => p.dia === dia && p.perfil === "alumno").length,
    docente: participantes.filter((p) => p.dia === dia && p.perfil === "docente").length,
    externo: participantes.filter((p) => p.dia === dia && p.perfil === "externo").length,
  }));

  const avance = filas.map((f) => ({
    etiqueta: f.etiqueta,
    meta: f.meta,
    preinscritos: f.total,
    pagados: f.pagados,
  }));

  /*
   * Los cortes académicos van sobre los alumnos, no sobre todo el mundo.
   *
   * Nivel, licenciatura, avance y plantel salen del padrón de Servicios
   * Escolares, y ese padrón solo tiene alumnos: al docente y al externo no se
   * los pregunta nadie. Metidos aquí, cada tabla abriría con una fila «Sin
   * dato» del tamaño de la carrera más grande que no significa nada. Los tres
   * perfiles ya están repartidos en la sección de arriba.
   */
  const alumnos = participantes.filter((p) => p.perfil === "alumno");
  const porNivel = desglosar(alumnos, (p) => p.nivel ?? "", estadoEvento);
  const porPrograma = desglosar(alumnos, (p) => p.programa ?? "", estadoEvento);
  const porSemestre = desglosar(
    alumnos,
    // «Semestre 6» o «Módulo 13»: cómo se cuenta depende del programa, y esa
    // precedencia ya la resuelve el catálogo. Ver `cuentaDeAvance`.
    (p) => avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
    estadoEvento,
    "etiqueta",
  );
  const porPlantel = desglosar(alumnos, (p) => p.plantel ?? "", estadoEvento);

  /*
   * El taller se cuenta por SU concepto de pago, no por el del evento.
   *
   * Son dos cobros —aunque el depósito sea uno solo desde el 2026-09-25—, y
   * alguien puede tener el evento pagado y el taller no. Contar aquí el estado
   * del evento daría por cobrados talleres que nadie pagó.
   *
   * Los apuntados salen de los participantes y no del `cupoOcupado` del
   * catálogo: ese lo cuenta la base incluyendo cortesías que no pasan por el
   * sistema, así que no cuadraría con las columnas de al lado.
   */
  const nombreDeTaller = new Map(talleres.map((t) => [t.id, `${t.id} · ${t.nombre}`]));
  const cupoDeTaller = new Map(talleres.map((t) => [`${t.id} · ${t.nombre}`, t.cupoTotal]));
  const porTaller = desglosar(
    participantes.filter((p) => p.tallerId),
    (p) => (p.tallerId ? (nombreDeTaller.get(p.tallerId) ?? p.tallerId) : ""),
    estadoTaller,
    "etiqueta",
  );
  const totalTalleres = sumaDelDesglose(porTaller);

  /*
   * El dinero, al importe ESPERADO de cada concepto confirmado.
   *
   * No se suma lo depositado. Lo que se cobra en ventanilla se registra por el
   * importe esperado —quien cobra tiene el voucher delante y confirma que
   * coincide—, y lo que no coincide queda en `discrepancia`, que aquí se aparta
   * en su propia columna en vez de contarse como cobrado. Así esta sección no
   * puede contradecir a la de arriba: cada peso cobrado corresponde a una
   * persona contada como pagada.
   */
  const dineroDe = (concepto: "evento" | "taller") => {
    let cobrado = 0;
    let pendiente = 0;
    let enRevision = 0;
    for (const p of participantes) {
      const e = estadoDe(p);
      const estado = concepto === "evento" ? e.evento : e.taller;
      if (!estado) continue;
      const monto = concepto === "evento" ? p.montoEsperadoEvento : (p.montoEsperadoTaller ?? 0);
      if (estado === "pagado") cobrado += monto;
      else if (estado === "discrepancia") enRevision += monto;
      else if (porCobrar(estado)) pendiente += monto;
    }
    return { cobrado, pendiente, enRevision };
  };
  const dinero = [
    { concepto: "Evento", ...dineroDe("evento") },
    { concepto: "Taller", ...dineroDe("taller") },
  ];
  const dineroTotal = {
    cobrado: dinero.reduce((n, d) => n + d.cobrado, 0),
    pendiente: dinero.reduce((n, d) => n + d.pendiente, 0),
    enRevision: dinero.reduce((n, d) => n + d.enRevision, 0),
  };

  const tarjetas = [
    { etiqueta: "Pre-registrados", valor: String(total.total), pie: `de ${total.meta} lugares` },
    {
      etiqueta: "Con pago confirmado",
      valor: String(total.pagados),
      pie: `${total.total > 0 ? Math.round((total.pagados / total.total) * 100) : 0}% de los apuntados`,
    },
    {
      etiqueta: "Faltan por pagar",
      valor: String(total.faltan),
      pie: total.exentos > 0 ? `${total.exentos} exentos aparte` : "sin exentos",
    },
    {
      etiqueta: "Ocupación",
      valor: total.meta > 0 ? `${total.pct}%` : "—",
      pie: total.meta > 0 ? "del aforo de las sedes" : "sin aforo configurado",
    },
    { etiqueta: "Cobrado", valor: moneda(dineroTotal.cobrado), pie: "a importe esperado" },
    { etiqueta: "Por cobrar", valor: moneda(dineroTotal.pendiente), pie: "de quien todavía debe" },
  ];

  return (
    /*
     * El gris de alrededor es solo de pantalla: en papel no hay «alrededor», y
     * `print:bg-white` evita que el navegador gaste tinta en un margen.
     */
    <div className="min-h-svh bg-neutral-100 p-4 print:bg-white print:p-0">
      {/*
        La barra de arriba NO se imprime. Es lo único de esta pantalla que no es
        el documento: por dónde volver y cómo sacarlo en papel.
      */}
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/reportes"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver a reportes
        </Link>
        {/*
          Una instrucción y no un botón, y no es pereza.

          Un botón de imprimir solo llamaría a `window.print()`, que es
          exactamente lo que hace `Ctrl+P`; ya se retiraron dos de esos en
          `/pago` y `/comprobante` por prometer algo propio y no hacer nada que
          el navegador no hiciera. Lo que de verdad hace falta saber aquí es que
          el destino de la impresión puede ser un archivo, y eso una instrucción
          lo dice y un botón no.
        */}
        <p className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm text-neutral-700 shadow-sm">
          <Printer className="size-4 shrink-0 text-neutral-500" aria-hidden />
          <span>
            Pulsa <kbd className="rounded border border-neutral-300 px-1 font-mono">Ctrl</kbd>+
            <kbd className="rounded border border-neutral-300 px-1 font-mono">P</kbd> y elige{" "}
            <strong className="font-semibold">Guardar como PDF</strong> como destino.
          </span>
        </p>
      </div>

      {/*
        El ancho fijo es lo que hace que la pantalla y el papel coincidan.

        `recharts` mide su contenedor al montarse, no al imprimir. Con un ancho
        elástico, la gráfica se dibuja del tamaño de la ventana y luego el
        navegador la encoge al A4: los rótulos de los ejes acaban ilegibles y las
        barras, aplastadas. Con 48rem —que es más o menos el ancho útil de un A4
        vertical— lo que se mide es ya la medida del papel.
      */}
      <article className="mx-auto max-w-[48rem] bg-white p-8 text-neutral-900 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-4">
          <h1 className="text-xl font-bold tracking-tight">Avance del pre-registro</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {configuracion.nombre}
            {configuracion.fechas ? ` · ${configuracion.fechas}` : ""}
          </p>
          {/*
            La fecha de generación va en la hoja y no es adorno: este papel
            circula, y una cifra de pre-registros sin fecha no significa nada
            dos semanas después.
          */}
          <p className="mt-0.5 text-xs text-neutral-500">Generado el {fechaHora()}</p>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-4 break-inside-avoid">
          {tarjetas.map((c) => (
            <div key={c.etiqueta} className="rounded-lg border border-neutral-300 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {c.etiqueta}
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{c.valor}</p>
              <p className="text-xs text-neutral-500">{c.pie}</p>
            </div>
          ))}
        </section>

        <Seccion
          titulo="Avance contra la meta"
          nota="Lo que cabe en cada sede, lo que hay apuntado y lo que ya se cobró."
        >
          <GraficaAvance
            datos={avance}
            alto={240}
            colores={{ meta: TINTA.meta, preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
          />
        </Seccion>

        <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
          <div>
            <h2 className="text-sm font-bold">Por perfil</h2>
            <p className="mb-2 text-xs text-neutral-500">Reparto de {participantes.length}</p>
            <div className="flex items-center gap-3">
              <GraficaPerfiles datos={porPerfil} color={TINTA} alto={160} ancho="55%" />
              <ul className="grid flex-1 gap-1.5">
                {porPerfil.map((d) => (
                  <li key={d.perfil} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ background: TINTA[d.perfil] }}
                      />
                      {d.etiqueta}
                    </span>
                    <span className="font-bold tabular-nums">{d.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold">Por día y perfil</h2>
            <p className="mb-2 text-xs text-neutral-500">Cada día es un grupo distinto</p>
            <GraficaPorDia datos={porDia} color={TINTA} alto={160} />
          </div>
        </section>

        <Seccion titulo="El detalle por sede" junta={false}>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-400 text-left">
                {[
                  "Día",
                  "Sede",
                  "Caben",
                  "Apuntados",
                  "Al.",
                  "Doc.",
                  "Ext.",
                  "Pagados",
                  "Exentos",
                  "Faltan",
                  "% aforo",
                ].map((h) => (
                  <th key={h} className="py-1.5 pr-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.dia} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-2 font-semibold">{f.etiqueta}</td>
                  <td className="py-1.5 pr-2">{f.sede}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.meta || "—"}</td>
                  <td className="py-1.5 pr-2 font-semibold tabular-nums">{f.total}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.alumnos}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.docentes}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.externos}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.pagados}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.exentos}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{f.faltan}</td>
                  <td className="py-1.5 tabular-nums">{f.meta > 0 ? `${f.pct}%` : ""}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-400 font-bold">
                <td className="py-1.5 pr-2">TOTAL</td>
                <td className="py-1.5 pr-2" />
                <td className="py-1.5 pr-2 tabular-nums">{total.meta || "—"}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.total}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.alumnos}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.docentes}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.externos}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.pagados}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.exentos}</td>
                <td className="py-1.5 pr-2 tabular-nums">{total.faltan}</td>
                <td className="py-1.5 tabular-nums">{total.meta > 0 ? `${total.pct}%` : ""}</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        <Seccion
          titulo="El dinero"
          nota="Al importe esperado de cada concepto. Lo que no cuadra no se cuenta como cobrado: espera en revisión."
        >
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-400 text-left">
                {["Concepto", "Cobrado", "Por cobrar", "En revisión"].map((h) => (
                  <th key={h} className="py-1.5 pr-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dinero.map((d) => (
                <tr key={d.concepto} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-2">{d.concepto}</td>
                  <td className="py-1.5 pr-2 font-semibold tabular-nums">{moneda(d.cobrado)}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{moneda(d.pendiente)}</td>
                  <td className="py-1.5 tabular-nums">{moneda(d.enRevision)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-400 font-bold">
                <td className="py-1.5 pr-2">TOTAL</td>
                <td className="py-1.5 pr-2 tabular-nums">{moneda(dineroTotal.cobrado)}</td>
                <td className="py-1.5 pr-2 tabular-nums">{moneda(dineroTotal.pendiente)}</td>
                <td className="py-1.5 tabular-nums">{moneda(dineroTotal.enRevision)}</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        <Seccion
          titulo="Por nivel académico"
          nota={`De los ${alumnos.length} alumnos apuntados. El docente y el externo no traen datos del padrón.`}
          nuevaPagina
        >
          <GraficaDesglose
            datos={aBarras(porNivel)}
            colores={{ preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
            alto={180}
          />
          <TablaDesglose columna="Nivel" grupos={porNivel} />
        </Seccion>

        <Seccion
          titulo="Por licenciatura"
          nota="Cuántos se apuntaron de cada programa y cuántos de esos ya pagaron."
          junta={false}
        >
          <GraficaDesglose
            datos={aBarras(porPrograma)}
            colores={{ preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
            alto={altoTumbada(porPrograma.length)}
            horizontal
            anchoEtiqueta={200}
          />
          <TablaDesglose columna="Licenciatura" grupos={porPrograma} />
        </Seccion>

        <Seccion
          titulo="Por semestre"
          nota="La licenciatura en Educación e Innovación Pedagógica va por módulos, y por eso aparece con su propia cuenta."
          junta={false}
          nuevaPagina
        >
          <GraficaDesglose
            datos={aBarras(porSemestre)}
            colores={{ preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
            alto={200}
          />
          <TablaDesglose columna="Avance" grupos={porSemestre} />
        </Seccion>

        <Seccion
          titulo="Por plantel de procedencia"
          nota="Dónde estudia el alumno. No es la sede del evento: esa se reparte por día y está en la tabla de arriba."
          junta={false}
        >
          <TablaDesglose columna="Plantel" grupos={porPlantel} />
        </Seccion>

        <Seccion
          titulo="Por taller"
          nota="El taller es un cobro aparte: aquí se cuenta su propio pago, no el del evento."
          junta={false}
          nuevaPagina
        >
          <GraficaDesglose
            datos={aBarras(porTaller)}
            colores={{ preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
            alto={altoTumbada(porTaller.length)}
            horizontal
            anchoEtiqueta={200}
          />
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-400 text-left">
                {["Taller", "Caben", "Apuntados", "Pagados", "Exentos", "Faltan", "% pagado"].map(
                  (h) => (
                    <th key={h} className="py-1.5 pr-2 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {porTaller.map((g) => (
                <tr key={g.etiqueta} className="border-b border-neutral-200">
                  <td className="py-1.5 pr-2">{g.etiqueta}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {cupoDeTaller.get(g.etiqueta) ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2 font-semibold tabular-nums">{g.total}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{g.pagados}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{g.exentos}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{g.faltan}</td>
                  <td className="py-1.5 tabular-nums">{g.pct}%</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-400 font-bold">
                <td className="py-1.5 pr-2">TOTAL</td>
                <td className="py-1.5 pr-2" />
                <td className="py-1.5 pr-2 tabular-nums">{totalTalleres.total}</td>
                <td className="py-1.5 pr-2 tabular-nums">{totalTalleres.pagados}</td>
                <td className="py-1.5 pr-2 tabular-nums">{totalTalleres.exentos}</td>
                <td className="py-1.5 pr-2 tabular-nums">{totalTalleres.faltan}</td>
                <td className="py-1.5 tabular-nums">{totalTalleres.pct}%</td>
              </tr>
            </tbody>
          </table>
        </Seccion>

        {/*
          Las notas al pie no son un descargo: son lo que impide que quien lea
          esta hoja persiga a gente que no debe nada, o que lea dos cifras
          parecidas como si fueran la misma.
        */}
        <footer className="mt-5 break-inside-avoid border-t border-neutral-300 pt-3 text-xs text-neutral-500">
          <p>
            <strong className="font-semibold text-neutral-700">Faltan</strong> = apuntados − pagados
            − exentos. Los exentos son los maestros que eligieron asistir sin constancia: no deben
            nada, así que no son un pendiente de cobro.
          </p>
          <p className="mt-1">
            <strong className="font-semibold text-neutral-700">% aforo</strong> es qué tanto de los
            lugares de esa sede está tomado; <strong className="font-semibold">% pagado</strong> es
            qué tanto de ese grupo ya depositó. Son dos preguntas distintas.
          </p>
          <p className="mt-1">
            <strong className="font-semibold text-neutral-700">Sin dato</strong> es un hueco del
            padrón, no un grupo: a esa gente le falta el dato con el que se corta esa tabla.
          </p>
          <p className="mt-1">
            El aforo de cada día sale de la configuración del evento, no de una cifra escrita en el
            sistema. Los datos académicos —nivel, licenciatura, semestre y plantel— vienen del
            padrón de Servicios Escolares.
          </p>
        </footer>
      </article>
    </div>
  );
}
