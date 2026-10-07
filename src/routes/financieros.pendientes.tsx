/**
 * La hoja de pendientes: quién falta por pagar, con gráficas, hecha para el
 * papel.
 *
 * ---------------------------------------------------------------------------
 * Qué contesta, y qué no
 * ---------------------------------------------------------------------------
 * Cuánto se debe, por sede, por licenciatura y por módulo o semestre, y en qué
 * estado está cada adeudo —nunca entregó comprobante, lo entregó y espera
 * revisión, abonó y le falta el resto, se le venció el plazo, o depositó un
 * monto que no cuadra—. Es la foto agregada para repartir el trabajo de
 * cobro: a qué sede llamar primero, cuánta gente de LEIP sigue debiendo.
 *
 * NO lleva el nombre de cada alumno. Eso ya existe, es otro botón de
 * `/financieros` —«Faltan por pagar», un CSV— y es a propósito que sean dos
 * archivos distintos: esta hoja se imprime y circula, y una lista con nombre,
 * correo y celular de quien debe dinero no es algo que deba salir impreso
 * para quien solo necesita saber cuántos faltan en Teziutlán.
 *
 * ---------------------------------------------------------------------------
 * Por qué es una hoja y no un botón que escupe un PDF
 * ---------------------------------------------------------------------------
 * La misma razón que en `/admin/avance` y `/admin/leip`, y vale repetirla
 * porque es la que siempre se pregunta: generar el PDF desde el navegador pide
 * una librería que dibuje el documento y otra que convierta las gráficas en
 * imagen —medio mega entre las dos— y el resultado sería PEOR: una captura
 * rasterizada, con el texto vuelto píxeles, que no se puede seleccionar ni
 * buscar y que se ve borrosa al ampliar.
 *
 * `Ctrl+P` → «Guardar como PDF» produce un documento vectorial: las gráficas
 * salen como SVG, el texto sigue siendo texto y no hay nada que descargar.
 *
 * ---------------------------------------------------------------------------
 * Las mismas dos reglas de siempre
 * ---------------------------------------------------------------------------
 * Los colores van escritos —el panel tiene modo oscuro, y una hoja que
 * heredara el tema saldría con fondo negro en cuanto el navegador descarta los
 * fondos al imprimir—, y el ancho es fijo en 48rem —`recharts` mide su
 * contenedor al MONTARSE, no al imprimir—. Las gráficas se importan de forma
 * estática porque esta pantalla ES las gráficas: una carga diferida abre la
 * puerta a que alguien pulse `Ctrl+P` antes de que el trozo baje y se lleve
 * una hoja con huecos blancos donde iban los datos.
 */

import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Protegido } from "@/components/acceso";
import { GraficaConteo, GraficaPerfiles } from "@/components/graficas-panel";
import { desglosar, sumaDelDesglose, type GrupoDesglosado } from "@/lib/desglose";
import { alumnosPendientes, montoPendienteDe } from "@/lib/pendientes";
import { estadoDelDeposito, indexarPagos } from "@/lib/pagos-logica";
import { avanceTexto } from "@/dominio/catalogos";
import { useEstadoEvento } from "@/lib/estado-evento";
import { fechaHora, moneda } from "@/lib/formato";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { EstadoPago } from "@/dominio/tipos";

export const Route = createFileRoute("/financieros/pendientes")({
  head: () =>
    meta(
      "Hoja de pendientes",
      "Quién falta por pagar el evento o el taller, por sede, licenciatura y módulo o semestre, con gráficas, para imprimir o guardar como PDF.",
    ),
  component: () => (
    <Protegido area="financieros">
      <HojaDePendientes />
    </Protegido>
  ),
});

/*
 * La paleta clara del sistema, escrita. Ver la cabecera: esta hoja no se
 * tematiza. Son los valores de `:root` en `styles.css`, no los de `.dark`.
 *
 * `COLOR_FALTAN` es el único color de las gráficas de conteo: no hay nada con
 * qué contrastarlo.
 */
const COLOR_FALTAN = "oklch(0.52 0.12 75)";

/*
 * Las cinco formas en que un adeudo está pendiente, con los mismos colores
 * que su insignia en el resto del sistema —ver `estado-badges.tsx`—. `parcial`
 * toma prestado el color de `comprobante_recibido`: ahí también comparten
 * clase, porque los dos son «va en camino, falta terminar».
 *
 * Es un objeto aparte de `COLOR_FALTAN`, y no el mismo con una llave más: este
 * lo indexa `GraficaPerfiles` por una clave que solo se conoce en tiempo de
 * ejecución —el estado de cada quien—, así que necesita la forma de índice
 * abierto; `COLOR_FALTAN` se escribe siempre tal cual, sin indexar nada.
 */
const TINTA_ESTADO: Record<string, string> = {
  pre_registrado: "oklch(0.48 0.008 255.5)",
  comprobante_recibido: "oklch(0.443 0.193 261)",
  parcial: "oklch(0.443 0.193 261)",
  expirado: "oklch(0.5 0.05 300)",
  discrepancia: COLOR_FALTAN,
};

/** Cómo se rotula cada estado del adeudo en la leyenda del pastel. */
const ETIQUETA_ESTADO: Partial<Record<EstadoPago, string>> = {
  pre_registrado: "Sin comprobante",
  comprobante_recibido: "Comprobante recibido",
  parcial: "Abonó, falta el resto",
  expirado: "Expirado",
  discrepancia: "Discrepancia",
};

/**
 * Un bloque de la hoja. Repetido y no compartido con `/admin/avance` y
 * `/admin/leip`: sacarlo a un archivo común lo pondría fuera de las tres
 * rutas, y entonces cualquier otra pantalla del panel que lo importara se
 * traería con él la cadena de `recharts`. Son veinte líneas.
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

/** El alto de una gráfica tumbada: un renglón por grupo. Fijo sería la trampa. */
const altoTumbada = (grupos: number) => Math.max(140, 30 * grupos + 50);

/** Cómo se rotula un corte de sede + licenciatura + módulo en la gráfica. */
const rotuloDelGrupo = (g: GrupoDesglosado) => g.partes.join(" · ");

function HojaDePendientes() {
  const { participantes, pagos, configuracion, estadoDe } = useEstadoEvento();

  // La misma cuenta que los dos botones de `/financieros`. Vive en
  // `lib/pendientes.ts` para que las tres no puedan discrepar.
  const pendientes = alumnosPendientes(participantes, estadoDe);
  const indicePagos = indexarPagos(pagos);

  const porGrupo = desglosar(
    pendientes,
    (p) => [
      p.plantel || "",
      p.programa || "",
      avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
    ],
    (p) => estadoDe(p).evento,
    "cantidad",
  );
  const porSede = desglosar(
    pendientes,
    (p) => p.plantel || "",
    (p) => estadoDe(p).evento,
    "cantidad",
  );
  const porLicenciatura = desglosar(
    pendientes,
    (p) => p.programa || "",
    (p) => estadoDe(p).evento,
    "cantidad",
  );

  const montoTotal = pendientes.reduce((n, p) => n + montoPendienteDe(indicePagos, p), 0);

  /*
   * El pastel reparte por el estado del DEPÓSITO —uno solo por persona, el que
   * ya resuelve `estadoDelDeposito` tomando el menos avanzado de sus dos
   * conceptos—, no por el estado del evento a secas: alguien con el evento
   * pagado y el taller apenas pre-registrado está, para este pastel, en
   * «Sin comprobante», que es lo que de verdad hace falta resolverle.
   *
   * Las categorías en cero se quitan del pastel y de su leyenda: a diferencia
   * del de `/admin/leip`, aquí es normal que falte alguna —un evento sin
   * discrepancias no tiene por qué dibujar una rebanada vacía—.
   */
  const porEstado = (Object.keys(ETIQUETA_ESTADO) as EstadoPago[])
    .map((estado) => ({
      perfil: estado,
      etiqueta: ETIQUETA_ESTADO[estado]!,
      total: pendientes.filter((p) => estadoDelDeposito(estadoDe(p)) === estado).length,
    }))
    .filter((d) => d.total > 0);

  const sedes = new Set(pendientes.map((p) => p.plantel || "")).size;
  const licenciaturas = new Set(pendientes.map((p) => p.programa || "")).size;

  const tarjetas = [
    { etiqueta: "Faltan por pagar", valor: String(pendientes.length), pie: "alumnos" },
    { etiqueta: "Monto pendiente", valor: moneda(montoTotal), pie: "evento y taller sumados" },
    { etiqueta: "Sedes", valor: String(sedes), pie: "con adeudo" },
    { etiqueta: "Licenciaturas", valor: String(licenciaturas), pie: "con adeudo" },
  ];

  return (
    <div className="min-h-svh bg-neutral-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/financieros"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver a la ventanilla
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

      <article className="mx-auto max-w-[48rem] bg-white p-8 text-neutral-900 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-4">
          <h1 className="text-xl font-bold tracking-tight">Quién falta por pagar</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {configuracion.nombre}
            {configuracion.fechas ? ` · ${configuracion.fechas}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">Generado el {fechaHora()}</p>
        </header>

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

        {pendientes.length === 0 ? (
          <p className="mt-6 text-sm italic text-neutral-500">
            Nadie tiene un pago pendiente en este momento.
          </p>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
              <div>
                <h2 className="text-sm font-bold">Por sede</h2>
                <p className="mb-2 text-xs text-neutral-500">Cuántos faltan en cada plantel</p>
                <GraficaConteo
                  datos={porSede.map((g) => ({ etiqueta: g.etiqueta, cantidad: g.total }))}
                  color={COLOR_FALTAN}
                  alto={180}
                />
              </div>
              <div>
                <h2 className="text-sm font-bold">En qué estado está el adeudo</h2>
                <p className="mb-2 text-xs text-neutral-500">
                  Reparto de los {pendientes.length} que faltan
                </p>
                <div className="flex items-center gap-3">
                  <GraficaPerfiles datos={porEstado} color={TINTA_ESTADO} alto={160} ancho="55%" />
                  <ul className="grid flex-1 gap-1.5">
                    {porEstado.map((d) => (
                      <li
                        key={d.perfil}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: TINTA_ESTADO[d.perfil] }}
                          />
                          {d.etiqueta}
                        </span>
                        <span className="font-bold tabular-nums">{d.total}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <Seccion
              titulo="Por licenciatura"
              nota="Cuántos alumnos de cada programa faltan por pagar."
              junta={false}
            >
              <GraficaConteo
                datos={porLicenciatura.map((g) => ({ etiqueta: g.etiqueta, cantidad: g.total }))}
                color={COLOR_FALTAN}
                alto={altoTumbada(porLicenciatura.length)}
                horizontal
                anchoEtiqueta={200}
              />
            </Seccion>

            <Seccion
              titulo="Por sede, licenciatura y módulo o semestre"
              nota="El corte más fino: la combinación exacta, lista para repartir el trabajo de cobro."
              junta={false}
              nuevaPagina
            >
              <GraficaConteo
                datos={porGrupo.map((g) => ({ etiqueta: rotuloDelGrupo(g), cantidad: g.total }))}
                color={COLOR_FALTAN}
                alto={altoTumbada(porGrupo.length)}
                horizontal
                anchoEtiqueta={220}
              />
            </Seccion>

            <Seccion titulo="El detalle, por sede" junta={false}>
              <TablaDeCortes grupos={porSede} columna="Sede" />
            </Seccion>
          </>
        )}

        <footer className="mt-5 break-inside-avoid border-t border-neutral-300 pt-3 text-xs text-neutral-500">
          <p>
            <strong className="font-semibold text-neutral-700">Faltan por pagar</strong> cuenta a
            quien debe el evento, el taller, o los dos. Al exento no se le cuenta nada: su monto
            esperado es cero.
          </p>
          <p className="mt-1">
            <strong className="font-semibold text-neutral-700">Monto pendiente</strong> suma lo que
            falta del evento y lo que falta del taller como un solo número, igual que el depósito
            que esa persona entrega en ventanilla.
          </p>
          <p className="mt-1">
            Esta hoja no trae nombres. El detalle por alumno —folio, contacto, cuánto le falta— se
            descarga aparte desde «Faltan por pagar», en la ventanilla.
          </p>
        </footer>
      </article>
    </div>
  );
}

/** La tabla de un corte: su columna, cuántos faltan y el total. */
function TablaDeCortes({ grupos, columna }: { grupos: GrupoDesglosado[]; columna: string }) {
  const total = sumaDelDesglose(grupos).total;
  return (
    <table className="mt-2 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-neutral-400 text-left">
          <th className="py-1.5 pr-2 font-semibold">{columna}</th>
          <th className="py-1.5 font-semibold">Faltan por pagar</th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => (
          <tr key={g.etiqueta} className="border-b border-neutral-200">
            <td className="py-1.5 pr-2">{g.etiqueta}</td>
            <td className="py-1.5 font-semibold tabular-nums">{g.total}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-neutral-400 font-bold">
          <td className="py-1.5 pr-2">TOTAL</td>
          <td className="py-1.5 tabular-nums">{total}</td>
        </tr>
      </tbody>
    </table>
  );
}
