/**
 * La hoja de LEIP: la estadística del programa con gráficas, hecha para el
 * papel.
 *
 * ---------------------------------------------------------------------------
 * Por qué LEIP tiene hoja propia
 * ---------------------------------------------------------------------------
 * `/admin/avance` ya corta por licenciatura, por avance y por grupo, pero lo
 * hace sobre los TRES mil y pico de todos los programas: la licenciatura en
 * Educación e Innovación Pedagógica es una fila entre veinte, y sus grupos
 * aparecen revueltos con los de las demás carreras. Su coordinación no
 * pregunta eso. Pregunta por sus sedes y sus grupos, uno por uno, y contra
 * cuánta gente le entregó Servicios Escolares.
 *
 * Esa es la diferencia que justifica la hoja: aquí el techo de cada barra no es
 * el aforo del evento, es el PADRÓN del grupo. Un grupo de treinta con tres
 * apuntados y uno de cuatro con tres apuntados se dibujan igual en cualquier
 * reporte que no traiga el padrón detrás, y son dos situaciones opuestas.
 *
 * ---------------------------------------------------------------------------
 * Por qué es una hoja y no un botón que escupe un PDF
 * ---------------------------------------------------------------------------
 * Lo mismo que en `/admin/avance`, y vale la pena repetirlo porque es la
 * pregunta que siempre vuelve: generar el PDF desde el navegador pide una
 * librería que dibuje el documento y otra que convierta las gráficas en imagen
 * —medio mega entre las dos— y el resultado sería PEOR: una captura
 * rasterizada, con el texto vuelto píxeles, que no se puede seleccionar ni
 * buscar y que se ve borrosa al ampliar.
 *
 * `Ctrl+P` → «Guardar como PDF» produce un documento vectorial: las gráficas
 * salen como SVG, el texto sigue siendo texto y no hay nada que descargar.
 *
 * ---------------------------------------------------------------------------
 * Las dos reglas que sostienen que lo que se ve sea lo que sale
 * ---------------------------------------------------------------------------
 * **Los colores van escritos.** El panel tiene modo oscuro, y una hoja que
 * heredara el tema saldría con fondo negro; en cuanto el navegador descarta los
 * fondos al imprimir —que es lo que hace por omisión— quedaría texto claro
 * sobre papel blanco. Los `oklch` de abajo son los valores CLAROS de
 * `styles.css`: si allí cambia el azul de la universidad, aquí hay que venir a
 * cambiarlo.
 *
 * **El ancho es fijo en 48rem.** `recharts` mide su contenedor al MONTARSE, no
 * al imprimir: con un ancho elástico la gráfica se dibuja del tamaño de la
 * ventana y luego el navegador la encoge al A4, y los rótulos acaban
 * ilegibles.
 *
 * Y las gráficas se importan de forma estática a propósito. En `/admin` van
 * perezosas porque `recharts` pesa 375 KB; aquí no, porque esta pantalla ES las
 * gráficas y una carga diferida abre la puerta al peor fallo posible: alguien
 * pulsa `Ctrl+P` antes de que el trozo baje y se lleva una hoja con huecos
 * blancos donde iban los datos. Como es su propia ruta, `recharts` solo llega a
 * quien entra aquí.
 */

import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Protegido } from "@/components/acceso";
import { GraficaAvance, GraficaPerfiles } from "@/components/graficas-panel";
import {
  estadisticaLeip,
  nombreOficialLeip,
  porSedeLeip,
  totalLeip,
  type FilaLeip,
} from "@/lib/leip";
import { useEstadoEvento } from "@/lib/estado-evento";
import { fechaHora } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/leip")({
  head: () =>
    meta(
      "Hoja de LEIP",
      "Estadística de la licenciatura en Educación e Innovación Pedagógica por sede y grupo, contra el padrón de Servicios Escolares, con gráficas, para imprimir o guardar como PDF.",
    ),
  component: () => (
    <Protegido area="admin">
      <HojaDeLeip />
    </Protegido>
  ),
});

/*
 * La paleta clara del sistema, escrita. Ver la cabecera: esta hoja no se
 * tematiza. Son los valores de `:root` en `styles.css`, no los de `.dark`.
 */
const TINTA = {
  /** El padrón, en gris: es el fondo contra el que se leen las otras barras. */
  padron: "oklch(0.87 0.005 255)",
  preinscritos: "oklch(0.443 0.193 261)",
  pagados: "oklch(0.506 0.142 149)",
  exentos: "oklch(0.509 0.007 255.5)",
  faltan: "oklch(0.52 0.12 75)",
};

/** Cómo se llaman las tres barras aquí. El techo es el padrón, no un aforo. */
const NOMBRES = {
  meta: "En el padrón",
  preinscritos: "Pre-registrados",
  pagados: "Pagados",
};

/**
 * Un bloque de la hoja. Mismo componente que en `/admin/avance`, repetido y no
 * compartido: sacarlo a un archivo común obligaría a que ese archivo viviera
 * fuera de las dos rutas, y entonces cualquier otra pantalla del panel que lo
 * importara se traería con él la cadena de `recharts`. Son veinte líneas.
 *
 * @param junta Que el navegador no parta el bloque entre dos páginas. Va
 *   apagado en las tablas largas: una tabla de treinta grupos que no se puede
 *   partir se empuja entera a la página siguiente y deja media hoja en blanco.
 * @param nuevaPagina Empieza página.
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
 * El alto de una gráfica tumbada: un renglón por grupo.
 *
 * Fijo sería la trampa. Con treinta grupos en 200 px las barras quedan de un
 * píxel y los rótulos se montan unos sobre otros; creciendo con los datos, lo
 * que se gasta es papel, que es lo que sobra.
 */
const altoTumbada = (grupos: number) => Math.max(140, 34 * grupos + 50);

/** Cómo se rotula un grupo en la gráfica: la sede y el grupo, juntos. */
const rotulo = (f: FilaLeip) => f.sede + " · " + f.grupo;

function HojaDeLeip() {
  const { participantes, padron, configuracion, estadoDe } = useEstadoEvento();

  /*
   * El estado del evento, en una función. La misma que pinta la insignia de
   * una ficha: así esta hoja no puede decir de alguien algo distinto de lo que
   * dice su ficha.
   */
  const estadoEvento = (p: Participante) => estadoDe(p).evento;

  // La misma cuenta que la pestaña y el CSV de `/admin/reportes`. Vive en
  // `lib/leip.ts` para que las tres no puedan discrepar.
  const grupos = estadisticaLeip(padron, participantes, estadoEvento);
  const sedes = porSedeLeip(grupos);
  const total = totalLeip(grupos);
  const oficial = nombreOficialLeip(configuracion.catalogoAcademico);

  const barrasSede = sedes.map((s) => ({
    etiqueta: s.sede,
    meta: s.enPadron,
    preinscritos: s.preinscritos,
    pagados: s.pagados,
  }));

  const barrasGrupo = grupos.map((g) => ({
    etiqueta: rotulo(g),
    meta: g.enPadron,
    preinscritos: g.preinscritos,
    pagados: g.pagados,
  }));

  /*
   * El pastel reparte a los PRE-REGISTRADOS, no al padrón.
   *
   * Pagados, exentos y los que todavía deben son las tres piezas en que se
   * parte quien ya se apuntó, y suman exactamente eso. Meter ahí a los del
   * padrón que no se han apuntado convertiría el pastel en otra cosa —la
   * cobertura— que ya cuentan las dos gráficas de barras de arriba.
   */
  const reparto = [
    { perfil: "pagados", etiqueta: "Pagados", total: total.pagados },
    { perfil: "exentos", etiqueta: "Exentos", total: total.exentos },
    { perfil: "faltan", etiqueta: "Faltan por pagar", total: total.faltan },
  ];

  const tarjetas = [
    {
      etiqueta: "En el padrón",
      valor: String(total.enPadron),
      pie: sedes.length === 1 ? "en 1 sede" : "en " + sedes.length + " sedes",
    },
    {
      etiqueta: "Pre-registrados",
      valor: String(total.preinscritos),
      pie: total.enPadron > 0 ? total.pct + "% del padrón" : "sin padrón cargado",
    },
    {
      etiqueta: "Con pago confirmado",
      valor: String(total.pagados),
      pie:
        total.preinscritos > 0
          ? Math.round((total.pagados / total.preinscritos) * 100) + "% de los apuntados"
          : "nadie apuntado todavía",
    },
    {
      etiqueta: "Faltan por pagar",
      valor: String(total.faltan),
      pie: total.exentos > 0 ? total.exentos + " exentos aparte" : "sin exentos",
    },
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

        El botón abre la impresión del navegador y no fabrica ningún archivo:
        quien lo pulse tiene que elegir «Guardar como PDF» como destino, y esa
        frase es la que convierte una ventana de impresión en la descarga que
        esperaba. Por eso el letrero se queda; sin él, el botón miente a medias.
      */}
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/reportes"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver a reportes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-neutral-600">
            Elige <strong className="font-semibold">Guardar como PDF</strong> como destino.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-700"
          >
            <Printer className="size-4" aria-hidden /> Descargar PDF
          </button>
        </div>
      </div>

      {/* El ancho fijo es lo que hace que la pantalla y el papel coincidan. */}
      <article className="mx-auto max-w-[48rem] bg-white p-8 text-neutral-900 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-4">
          <h1 className="text-xl font-bold tracking-tight">LEIP por sede y grupo</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {oficial ?? "Licenciatura en Educación e Innovación Pedagógica"}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">
            {configuracion.nombre}
            {configuracion.fechas ? " · " + configuracion.fechas : ""}
          </p>
          {/*
            La fecha de generación va en la hoja y no es adorno: este papel
            circula, y una cifra de pre-registros sin fecha no significa nada
            dos semanas después.
          */}
          <p className="mt-0.5 text-xs text-neutral-500">Generado el {fechaHora()}</p>
        </header>

        {/*
          Si el programa no está en el catálogo, la hoja lo dice en vez de salir
          vacía. Una tabla sin filas porque el programa no está dado de alta se
          parece demasiado a una tabla sin filas porque nadie se ha apuntado, y
          son dos problemas con arreglos opuestos.
        */}
        {!oficial ? (
          <p className="mt-5 rounded-md border border-neutral-400 bg-neutral-100 p-3 text-xs">
            El catálogo académico del evento no tiene dado de alta ningún programa de Innovación
            Pedagógica. Si esta hoja sale vacía es por eso, no porque nadie se haya pre-registrado.
          </p>
        ) : null}

        <section className="mt-5 grid grid-cols-4 gap-4 break-inside-avoid">
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
          titulo="Cobertura por sede"
          nota="Cuánta gente entregó Servicios Escolares de cada sede, cuánta se apuntó y cuánta ya pagó."
        >
          <GraficaAvance
            datos={barrasSede}
            alto={240}
            colores={{
              meta: TINTA.padron,
              preinscritos: TINTA.preinscritos,
              pagados: TINTA.pagados,
            }}
            nombres={NOMBRES}
          />
        </Seccion>

        <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
          <div>
            <h2 className="text-sm font-bold">Cómo va el cobro</h2>
            <p className="mb-2 text-xs text-neutral-500">
              Reparto de los {total.preinscritos} ya apuntados
            </p>
            <div className="flex items-center gap-3">
              <GraficaPerfiles datos={reparto} color={TINTA} alto={160} ancho="55%" />
              <ul className="grid flex-1 gap-1.5">
                {reparto.map((d) => (
                  <li key={d.perfil} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ background: TINTA[d.perfil as keyof typeof TINTA] }}
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
            <h2 className="text-sm font-bold">Las sedes, en números</h2>
            <p className="mb-2 text-xs text-neutral-500">
              {sedes.length === 1 ? "1 sede" : sedes.length + " sedes"} ·{" "}
              {grupos.length === 1 ? "1 grupo" : grupos.length + " grupos"}
            </p>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-400 text-left">
                  {["Sede", "Grupos", "Padrón", "Apuntados", "%"].map((h) => (
                    <th key={h} className="py-1.5 pr-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sedes.map((s) => (
                  <tr key={s.sede} className="border-b border-neutral-200">
                    <td className="py-1.5 pr-2">{s.sede}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{s.grupos}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{s.enPadron}</td>
                    <td className="py-1.5 pr-2 font-semibold tabular-nums">{s.preinscritos}</td>
                    <td className="py-1.5 tabular-nums">{s.enPadron > 0 ? s.pct + "%" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Seccion
          titulo="Cobertura por grupo"
          nota="Cada grupo contra su propio padrón. Es el corte con el que la coordinación sabe a quién ir a buscar."
          junta={false}
          nuevaPagina
        >
          {grupos.length === 0 ? (
            <p className="mt-1 text-xs italic text-neutral-500">Todavía no hay nadie que contar.</p>
          ) : (
            <GraficaAvance
              datos={barrasGrupo}
              alto={altoTumbada(grupos.length)}
              colores={{
                meta: TINTA.padron,
                preinscritos: TINTA.preinscritos,
                pagados: TINTA.pagados,
              }}
              nombres={NOMBRES}
              horizontal
              anchoEtiqueta={200}
            />
          )}
        </Seccion>

        <Seccion titulo="El detalle, grupo por grupo" junta={false}>
          <TablaDeGrupos grupos={grupos} total={total} />
        </Seccion>

        {/*
          Las notas al pie no son un descargo: son lo que impide que quien lea
          esta hoja persiga a gente que no debe nada, o que confunda dos cifras
          parecidas.
        */}
        <footer className="mt-5 break-inside-avoid border-t border-neutral-300 pt-3 text-xs text-neutral-500">
          <p>
            <strong className="font-semibold text-neutral-700">Padrón</strong> es cuánta gente
            entregó Servicios Escolares para ese grupo, y es el denominador de todo lo demás. Sin él
            un grupo de cuatro con tres apuntados se vería igual de bien que uno de treinta con
            tres.
          </p>
          <p className="mt-1">
            <strong className="font-semibold text-neutral-700">Faltan</strong> = apuntados − pagados
            − exentos. Los exentos no deben nada, así que no son un pendiente de cobro.
          </p>
          <p className="mt-1">
            <strong className="font-semibold text-neutral-700">Sede</strong> es el plantel donde
            estudia el alumno, no la sede del evento: esa se reparte por día y está en la hoja de
            avance.
          </p>
          <p className="mt-1">
            Un grupo con <strong className="font-semibold text-neutral-700">0 en el padrón</strong>{" "}
            es alguien que se pre-registró con una sede o un grupo que el padrón no trae. No se
            esconde: cuadrar ese dato es trabajo de Servicios Escolares.
          </p>
        </footer>
      </article>
    </div>
  );
}

/** La tabla completa: una fila por sede y grupo, con la de totales. */
function TablaDeGrupos({
  grupos,
  total,
}: {
  grupos: FilaLeip[];
  total: ReturnType<typeof totalLeip>;
}) {
  if (grupos.length === 0)
    return <p className="mt-1 text-xs italic text-neutral-500">Todavía no hay nadie que contar.</p>;

  return (
    <table className="mt-2 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-neutral-400 text-left">
          {[
            "Sede",
            "Grupo",
            "Módulo",
            "Padrón",
            "Apuntados",
            "%",
            "Pagados",
            "Exentos",
            "Faltan",
          ].map((h) => (
            <th key={h} className="py-1.5 pr-2 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => (
          <tr key={g.sede + g.grupo} className="border-b border-neutral-200">
            <td className="py-1.5 pr-2">{g.sede}</td>
            <td className="py-1.5 pr-2">{g.grupo}</td>
            <td className="py-1.5 pr-2">{g.modulos}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.enPadron}</td>
            <td className="py-1.5 pr-2 font-semibold tabular-nums">{g.preinscritos}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.enPadron > 0 ? g.pct + "%" : ""}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.pagados}</td>
            <td className="py-1.5 pr-2 tabular-nums">{g.exentos}</td>
            <td className="py-1.5 tabular-nums">{g.faltan}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-neutral-400 font-bold">
          <td className="py-1.5 pr-2" colSpan={3}>
            TOTAL
          </td>
          <td className="py-1.5 pr-2 tabular-nums">{total.enPadron}</td>
          <td className="py-1.5 pr-2 tabular-nums">{total.preinscritos}</td>
          <td className="py-1.5 pr-2 tabular-nums">{total.enPadron > 0 ? total.pct + "%" : ""}</td>
          <td className="py-1.5 pr-2 tabular-nums">{total.pagados}</td>
          <td className="py-1.5 pr-2 tabular-nums">{total.exentos}</td>
          <td className="py-1.5 tabular-nums">{total.faltan}</td>
        </tr>
      </tbody>
    </table>
  );
}
