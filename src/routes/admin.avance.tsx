/**
 * La hoja de avance: el reporte con gráficas, hecho para el papel.
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Protegido } from "@/components/acceso";
import { GraficaAvance, GraficaPerfiles, GraficaPorDia } from "@/components/graficas-panel";
import { avancePorDia, totalDelAvance } from "@/lib/avance";
import { useEstadoEvento } from "@/lib/estado-evento";
import { fechaHora } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { Dia } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/avance")({
  head: () =>
    meta(
      "Hoja de avance",
      "Avance del pre-registro del XIV Encuentro Internacional de Educación contra el aforo de cada sede, con gráficas, para imprimir o guardar como PDF.",
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

function HojaDeAvance() {
  const { participantes, configuracion, estadoDe } = useEstadoEvento();

  // La misma cuenta que la tarjeta del tablero y el CSV. Ver `lib/avance.ts`:
  // vive fuera para que las tres no puedan discrepar.
  const filas = avancePorDia(configuracion.dias, participantes, (p) => estadoDe(p).evento);
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
          {[
            { etiqueta: "Pre-registrados", valor: total.total, pie: `de ${total.meta} lugares` },
            { etiqueta: "Con pago confirmado", valor: total.pagados, pie: "depósito validado" },
            {
              etiqueta: "Faltan por pagar",
              valor: total.faltan,
              pie: total.exentos > 0 ? `${total.exentos} exentos aparte` : "sin exentos",
            },
          ].map((c) => (
            <div key={c.etiqueta} className="rounded-lg border border-neutral-300 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {c.etiqueta}
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{c.valor}</p>
              <p className="text-xs text-neutral-500">{c.pie}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-sm font-bold">Avance contra la meta</h2>
          <p className="mb-2 text-xs text-neutral-500">
            Lo que cabe en cada sede, lo que hay apuntado y lo que ya se cobró.
          </p>
          <GraficaAvance
            datos={avance}
            alto={240}
            colores={{ meta: TINTA.meta, preinscritos: TINTA.alumno, pagados: TINTA.pagado }}
          />
        </section>

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

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-sm font-bold">El detalle</h2>
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
                  "%",
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
        </section>

        {/*
          La nota al pie no es un descargo: es lo que impide que quien lea esta
          hoja persiga a gente que no debe nada. «Faltan» resta los exentos, y
          si no se dice, la columna se lee como morosidad.
        */}
        <footer className="mt-5 border-t border-neutral-300 pt-3 text-xs text-neutral-500">
          <p>
            <strong className="font-semibold text-neutral-700">Faltan</strong> = apuntados − pagados
            − exentos. Los exentos son los maestros que eligieron asistir sin constancia: no deben
            nada, así que no son un pendiente de cobro.
          </p>
          <p className="mt-1">
            El aforo de cada día sale de la configuración del evento, no de una cifra escrita en el
            sistema.
          </p>
        </footer>
      </article>
    </div>
  );
}
