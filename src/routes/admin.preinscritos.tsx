import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { Buscador } from "@/components/buscador";
import { Campo } from "@/components/tipografia";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstadoEvento } from "@/lib/estado-evento";
import { descargarCsv } from "@/lib/exportar";
import { usePaginacion } from "@/lib/paginacion";
import { avanceTexto } from "@/dominio/catalogos";
import { meta } from "@/lib/seo";
import type { Dia, EstadoPago, Perfil } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/preinscritos")({
  head: () =>
    meta(
      "Preinscritos — Administración del Encuentro",
      "Quién completó su pre-registro, con su matrícula, programa, grupo, día y sede, y la fecha y hora en que lo cerró.",
    ),
  component: Preinscritos,
});

/**
 * De «DD/MM/AAAA HH:mm» a «AAAA-MM-DDTHH:mm», que sí se ordena comparando
 * cadenas.
 *
 * `Participante.creadoEn` llega ya formateado por `aFechaHora`, y en ese formato
 * el día va delante: ordenar por él juntaría todos los días 1 de cualquier mes.
 * No se reconstruye un `Date` a propósito —`new Date` con una fecha suelta se
 * corre de zona— y para ordenar y para comparar con un `<input type="date">`
 * basta el texto reacomodado.
 */
function aOrdenable(fechaHora: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}))?/.exec(fechaHora);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00:00"}`;
}

/** Solo el día, para comparar con los dos `<input type="date">` del filtro. */
const soloFecha = (fechaHora: string): string => aOrdenable(fechaHora).slice(0, 10);

function Preinscritos() {
  const { participantes, configuracion, infoDia, registrarBitacora } = useEstadoEvento();
  const [q, setQ] = useState("");
  const [perfil, setPerfil] = useState<"todos" | Perfil>("todos");
  const [dia, setDia] = useState<"todos" | Dia>("todos");
  const [programa, setPrograma] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  const [pago, setPago] = useState<"todos" | EstadoPago>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  /*
   * El más reciente arriba.
   *
   * Esta lista se consulta para saber quién acaba de entrar —«¿ya se preinscribió
   * este grupo?»—, y en ese uso el último es el que importa. El orden de la base
   * es el de alta ascendente, que enterraría lo de hoy debajo de todo lo demás.
   */
  const ordenados = useMemo(
    () =>
      [...participantes].sort((a, b) =>
        aOrdenable(b.creadoEn).localeCompare(aOrdenable(a.creadoEn)),
      ),
    [participantes],
  );

  /*
   * Los dos desplegables se arman con lo que de verdad hay en la lista y no con
   * el catálogo académico entero: ofrecer un programa del que nadie se
   * preinscribió es una opción que solo puede devolver cero.
   */
  const programas = useMemo(
    () => [...new Set(participantes.map((p) => p.programa).filter((x): x is string => !!x))].sort(),
    [participantes],
  );
  const grupos = useMemo(
    () => [...new Set(participantes.map((p) => p.grupo).filter((x): x is string => !!x))].sort(),
    [participantes],
  );

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ordenados.filter((p) => {
      if (perfil !== "todos" && p.perfil !== perfil) return false;
      if (dia !== "todos" && p.dia !== dia) return false;
      if (programa !== "todos" && p.programa !== programa) return false;
      if (grupo !== "todos" && p.grupo !== grupo) return false;
      if (pago !== "todos" && p.estadoPagoEvento !== pago) return false;
      const f = soloFecha(p.creadoEn);
      if (desde && f && f < desde) return false;
      if (hasta && f && f > hasta) return false;
      if (!t) return true;
      return (
        p.nombre.toLowerCase().includes(t) ||
        (p.matricula ?? "").toLowerCase().includes(t) ||
        p.folio.toLowerCase().includes(t) ||
        p.correo.toLowerCase().includes(t) ||
        p.celular.toLowerCase().includes(t)
      );
    });
  }, [ordenados, perfil, dia, programa, grupo, pago, desde, hasta, q]);

  /*
   * De treinta en treinta, y la cuenta de arriba sigue hablando de la lista
   * filtrada completa: es lo que se está mirando al filtrar, no la página.
   *
   * La clave del tramo lleva los ocho filtros para volver a la página 1 en
   * cuanto cambie cualquiera. Sin eso, filtrar estando en la página seis deja a
   * la vista un tramo que ya no existe.
   */
  const tramo = usePaginacion(
    visibles,
    30,
    `${perfil}|${dia}|${programa}|${grupo}|${pago}|${desde}|${hasta}|${q}`,
  );

  const conPagoConfirmado = visibles.filter((p) => p.estadoPagoEvento === "pagado").length;
  const conTaller = visibles.filter((p) => p.tallerId).length;

  const filtrando =
    perfil !== "todos" ||
    dia !== "todos" ||
    programa !== "todos" ||
    grupo !== "todos" ||
    pago !== "todos" ||
    desde !== "" ||
    hasta !== "" ||
    q !== "";

  const limpiar = () => {
    setQ("");
    setPerfil("todos");
    setDia("todos");
    setPrograma("todos");
    setGrupo("todos");
    setPago("todos");
    setDesde("");
    setHasta("");
  };

  /*
   * La exportación se lleva las columnas de la tabla Y el contacto, los montos
   * derivados y el aviso: en pantalla ocuparían un ancho que no hay, pero son lo
   * primero que pide quien tiene que llamar a alguien o cuadrar una cifra.
   */
  const exportar = () => {
    const n = descargarCsv(
      "preinscritos.csv",
      [
        "preregistrado_en",
        "folio",
        "matricula",
        "nombre",
        "perfil",
        "nivel",
        "programa",
        "avance",
        "grupo",
        "plantel",
        "dia",
        "sede",
        "taller",
        "correo",
        "celular",
        "institucion",
        "estado_pago_evento",
        "estado_pago_taller",
        "acepto_aviso_en",
      ],
      visibles.map((p) => [
        p.creadoEn,
        p.folio,
        p.matricula ?? "",
        p.nombre,
        p.perfil,
        p.nivel ?? "",
        p.programa ?? "",
        avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
        p.grupo ?? "",
        p.plantel ?? "",
        p.dia,
        p.lugar,
        p.tallerId ?? "",
        p.correo,
        p.celular,
        p.institucion,
        p.estadoPagoEvento,
        p.estadoPagoTaller ?? "",
        // Vacío y «no consta» no son lo mismo: quien se preinscribió antes de que
        // el aviso se enseñara no tiene fecha, y eso hay que poder decirlo.
        p.aceptoAvisoEn ?? "no consta",
      ]),
    );
    registrarBitacora("Exportó los preinscritos", `${n} participantes`);
    toast.success(`Exportamos ${n} participantes.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Preinscritos"
      descripcion="Quién cerró su pre-registro, con qué datos y a qué hora."
      acciones={
        <Button variant="outline" className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar ({visibles.length})
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {participantes.length} preinscritos en total
        {filtrando ? <> · {visibles.length} con estos filtros</> : null} ·{" "}
        <span className="font-semibold text-foreground">
          {conPagoConfirmado} con pago confirmado
        </span>{" "}
        · {conTaller} con taller
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Buscador
          className="w-full max-w-xs"
          valor={q}
          alCambiar={setQ}
          marcador="Nombre, matrícula, folio o contacto"
          etiqueta="Buscar entre los preinscritos"
        />
        <Campo etiqueta="Perfil">
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as "todos" | Perfil)}
            className="h-11 max-w-40 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="alumno">Alumnos</option>
            <option value="docente">Docentes</option>
            <option value="externo">Externos</option>
          </select>
        </Campo>
        <Campo etiqueta="Día">
          <select
            value={dia}
            onChange={(e) =>
              setDia(e.target.value === "todos" ? "todos" : (Number(e.target.value) as Dia))
            }
            className="h-11 max-w-56 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {configuracion.dias.map((d) => (
              <option key={d.dia} value={d.dia}>
                {d.etiqueta} — {d.lugar}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Programa">
          <select
            value={programa}
            onChange={(e) => setPrograma(e.target.value)}
            className="h-11 max-w-64 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {programas.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Grupo">
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            className="h-11 max-w-32 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {grupos.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Pago del evento">
          <select
            value={pago}
            onChange={(e) => setPago(e.target.value as "todos" | EstadoPago)}
            className="h-11 max-w-52 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="pre_registrado">Sin comprobante</option>
            <option value="comprobante_recibido">Comprobante recibido</option>
            <option value="pagado">Pagado</option>
            <option value="expirado">Expirado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Campo>
        <Campo etiqueta="Desde">
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-11 w-40"
          />
        </Campo>
        <Campo etiqueta="Hasta">
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-11 w-40"
          />
        </Campo>
        {filtrando ? (
          <Button variant="outline" className="h-11" onClick={limpiar}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <Tabla
        className="mt-3"
        anchoMinimo="86rem"
        columnas={[
          "Pre-registro",
          "Folio",
          "Matrícula",
          "Nombre",
          "Perfil",
          "Programa",
          "Grupo",
          "Plantel",
          "Día y sede",
          "Taller",
          "Pago",
        ]}
        vacio={
          visibles.length === 0 ? (
            <>
              <UserSearch className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold">
                {participantes.length === 0
                  ? "Todavía no hay nadie preinscrito"
                  : "Nadie coincide con estos filtros"}
              </p>
              <p className="text-sm text-muted-foreground">
                {participantes.length === 0
                  ? "El pre-registro se cierra al elegir taller o al continuar sin taller: hasta ese paso no se crea a nadie."
                  : "Prueba con un rango de fechas más amplio o limpia los filtros."}
              </p>
            </>
          ) : null
        }
      >
        {tramo.visibles.map((p) => {
          const d = infoDia(p.dia);
          const avance = avanceTexto(
            configuracion.catalogoAcademico,
            p.nivel,
            p.avance,
            p.programa,
          );
          return (
            <Fila key={p.id}>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.creadoEn}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.folio}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                {p.matricula ?? "—"}
              </td>
              <td className="px-3 py-2">
                <span className="font-medium">{p.nombre}</span>
                {p.nombreEnRevision ? (
                  <span className="block text-xs text-estado-comprobante">Nombre en revisión</span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <PerfilBadge perfil={p.perfil} />
              </td>
              <td className="px-3 py-2">
                {p.programa ?? "—"}
                {avance ? (
                  <span className="block text-xs text-muted-foreground">{avance}</span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{p.grupo ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.plantel ?? "—"}</td>
              {/*
               * El día y la sede van juntos porque la sede se deriva del día. En
               * columnas separadas, con el plantel al lado, invita a leer «UPN
               * Unidad 241» como el sitio donde asiste, que es justo lo que no
               * es: uno lo entrega la universidad y el otro lo asigna la
               * organización al repartir los días.
               */}
              <td className="px-3 py-2">
                {d.etiqueta}
                <span className="block text-xs text-muted-foreground">{p.lugar}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.tallerId ?? "—"}</td>
              <td className="px-3 py-2">
                <EstadoPagoBadge estado={p.estadoPagoEvento} />
                {p.estadoPagoTaller ? (
                  <EstadoPagoBadge className="mt-1" estado={p.estadoPagoTaller} etiqueta="Taller" />
                ) : null}
              </td>
            </Fila>
          );
        })}
      </Tabla>
      <Paginacion
        tramo={tramo}
        nota="Exportar se lleva a quienes pasan el filtro, no solo esta página, y añade el contacto."
      />
    </PantallaPanel>
  );
}
