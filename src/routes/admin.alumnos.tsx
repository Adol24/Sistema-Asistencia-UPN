import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AtSign, Download, MessageCircle, Phone, UserSearch, X } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Fila, Paginacion, Tabla } from "@/components/tabla";
import { Buscador } from "@/components/buscador";
import { Campo, Rotulo } from "@/components/tipografia";
import { EstadoPagoBadge, PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEstadoEvento } from "@/lib/estado-evento";
import { descargarCsv } from "@/lib/exportar";
import { usePaginacion } from "@/lib/paginacion";
import { avanceTexto } from "@/dominio/catalogos";
import { meta } from "@/lib/seo";
import type { EstadoPago, Participante, Perfil } from "@/dominio/tipos";

/**
 * Los valores distintos de un campo entre los participantes, en orden.
 *
 * Vive fuera del componente para poder entrar en un `useMemo` sin volverse
 * dependencia suya: definida dentro, se rehace en cada pintada y el memo que la
 * usara se recalcularía siempre, que es justo lo que el memo venía a evitar.
 */
const unicos = (participantes: Participante[], dame: (p: Participante) => string | undefined) =>
  [...new Set(participantes.map(dame).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

export const Route = createFileRoute("/admin/alumnos")({
  head: () =>
    meta(
      "Alumnos — Administración del Encuentro",
      "Los datos de cada participante: nombre completo, licenciatura, grupo, plantel, correo y celular, con su ficha completa.",
    ),
  component: Alumnos,
});

/**
 * El directorio: quién es cada quien y cómo se le localiza.
 *
 * ---------------------------------------------------------------------------
 * Por qué hacía falta, habiendo ya cinco pantallas con gente
 * ---------------------------------------------------------------------------
 * Ninguna de las cinco contesta «¿cuál es el correo de esta persona?».
 *
 * - `/admin/padron` es lo que entrega Servicios Escolares, y ese archivo **no
 *   trae correo ni celular**: el contacto lo declara el alumno al
 *   pre-registrarse.
 * - `/admin/preinscritos` sí tiene los dos datos… pero no los PINTA. Se pueden
 *   teclear en su buscador y salen en su CSV, y en la tabla no hay columna.
 *   Buscar un correo que no se sabe de memoria es un callejón sin salida.
 * - `/financieros/ficha` enseña a una persona entera, pero está armada
 *   alrededor del depósito y vive en otra zona, con otro permiso.
 * - `/admin/elegibles` y `/admin/soporte` miran una condición —si le toca
 *   constancia, si tiene un caso abierto—, no a la persona.
 *
 * Así que el dato existía y solo salía en una celda de un archivo descargado.
 * Esta pantalla lo pone en la tabla, lo hace tecleable en el buscador y abre la
 * ficha completa de quien se elija.
 *
 * ---------------------------------------------------------------------------
 * Se llama «Alumnos» y enseña a los tres perfiles
 * ---------------------------------------------------------------------------
 * El filtro arranca en alumnos, que es a quien se busca el 95 % de las veces y
 * lo que se pidió. Pero el docente y el participante externo también dejan
 * correo y celular, y una pantalla de contacto que los escondiera obligaría a
 * volver al CSV justo para los dos perfiles de los que no hay padrón donde
 * mirar. Un desplegable, y deja de ser una decisión de nadie.
 */
function Alumnos() {
  const { participantes, configuracion, talleres, estadoDe, infoDia, registrarBitacora } =
    useEstadoEvento();

  const [q, setQ] = useState("");
  const [perfil, setPerfil] = useState<"todos" | Perfil>("alumno");
  const [programa, setPrograma] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  const [plantel, setPlantel] = useState("todos");
  /*
   * De quién está abierta la ficha, por FOLIO y no por el objeto.
   *
   * Es la misma razón que en `/admin/preinscritos`: el participante se rehace
   * en cada carga y en cada ajuste local, así que uno guardado aquí quedaría
   * congelado en cómo estaba al abrir la ficha, y un pago registrado en otra
   * ventanilla mientras tanto no se vería.
   */
  const [abierto, setAbierto] = useState<string | null>(null);

  /*
   * Los tres desplegables se arman con lo que de verdad hay en la lista, no con
   * el catálogo académico entero: ofrecer un programa del que nadie se
   * pre-registró es una opción que solo puede devolver cero resultados.
   */
  const programas = useMemo(() => unicos(participantes, (p) => p.programa), [participantes]);
  const grupos = useMemo(() => unicos(participantes, (p) => p.grupo), [participantes]);
  const planteles = useMemo(() => unicos(participantes, (p) => p.plantel), [participantes]);

  const filtrando =
    q.trim() !== "" ||
    perfil !== "alumno" ||
    programa !== "todos" ||
    grupo !== "todos" ||
    plantel !== "todos";

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return participantes
      .filter((p) => {
        if (perfil !== "todos" && p.perfil !== perfil) return false;
        if (programa !== "todos" && p.programa !== programa) return false;
        if (grupo !== "todos" && p.grupo !== grupo) return false;
        if (plantel !== "todos" && p.plantel !== plantel) return false;
        if (!t) return true;
        /*
         * El celular se busca sin separadores: quien lo copia de WhatsApp lo
         * trae con espacios o guiones, y el que está guardado casi nunca los
         * tiene. Sin esto, pegar un número encontrado en otro sitio no da nada.
         */
        const telefono = p.celular.replace(/\D/g, "");
        const buscado = t.replace(/\D/g, "");
        return (
          p.nombre.toLowerCase().includes(t) ||
          (p.matricula ?? "").toLowerCase().includes(t) ||
          p.folio.toLowerCase().includes(t) ||
          p.correo.toLowerCase().includes(t) ||
          (buscado.length >= 3 && telefono.includes(buscado))
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [participantes, q, perfil, programa, grupo, plantel]);

  const tramo = usePaginacion(visibles, 50, `${perfil}|${programa}|${grupo}|${plantel}|${q}`);

  const ficha = abierto ? (participantes.find((p) => p.folio === abierto) ?? null) : null;

  const limpiar = () => {
    setQ("");
    setPerfil("alumno");
    setPrograma("todos");
    setGrupo("todos");
    setPlantel("todos");
  };

  const exportar = () => {
    // Se exporta lo filtrado y no la lista entera: quien acotó a un grupo y
    // pulsa exportar espera ese grupo, y llevarse todo pasa inadvertido hasta
    // que alguien abre el archivo.
    const n = descargarCsv(
      "directorio.csv",
      [
        "folio",
        "matricula",
        "nombre",
        "perfil",
        "nivel",
        "programa",
        "avance",
        "grupo",
        "plantel",
        "institucion",
        "correo",
        "celular",
      ],
      visibles.map((p) => [
        p.folio,
        p.matricula ?? "",
        p.nombre,
        p.perfil,
        p.nivel ?? "",
        p.programa ?? "",
        avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa),
        p.grupo ?? "",
        p.plantel ?? "",
        p.institucion,
        p.correo,
        p.celular,
      ]),
    );
    registrarBitacora("Exportó el directorio", `${n} participantes`);
    toast.success(`Exportamos ${n} participantes.`);
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Alumnos"
      descripcion="Quién es cada quien y cómo se le localiza: nombre completo, licenciatura, grupo, correo y celular."
      acciones={
        <Button variant="outline" className="h-11" onClick={exportar}>
          <Download className="size-4" /> Exportar ({visibles.length})
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {participantes.length} participantes en total
        {filtrando ? (
          <>
            {" "}
            · <span className="font-semibold text-foreground">{visibles.length}</span> con estos
            filtros
          </>
        ) : null}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Buscador
          className="w-full max-w-xs"
          valor={q}
          alCambiar={setQ}
          marcador="Nombre, matrícula, folio, correo o celular"
          etiqueta="Buscar un participante"
        />
        <Campo etiqueta="Perfil">
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as "todos" | Perfil)}
            className="h-11 max-w-40 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="alumno">Alumnos</option>
            <option value="docente">Docentes</option>
            <option value="externo">Externos</option>
            <option value="todos">Todos</option>
          </select>
        </Campo>
        <Campo etiqueta="Licenciatura">
          <select
            value={programa}
            onChange={(e) => setPrograma(e.target.value)}
            className="h-11 max-w-64 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todas</option>
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
        <Campo etiqueta="Plantel">
          <select
            value={plantel}
            onChange={(e) => setPlantel(e.target.value)}
            className="h-11 max-w-56 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="todos">Todos</option>
            {planteles.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
        {filtrando ? (
          <Button variant="outline" className="h-11" onClick={limpiar}>
            <X className="size-4" /> Limpiar filtros
          </Button>
        ) : null}
      </div>

      <Tabla
        className="mt-3"
        anchoMinimo="78rem"
        columnas={[
          "Nombre",
          "Matrícula",
          "Licenciatura",
          "Avance",
          "Grupo",
          "Plantel",
          "Correo",
          "Celular",
          "",
        ]}
        vacio={
          visibles.length === 0 ? (
            <>
              <UserSearch className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-semibold">
                {participantes.length === 0
                  ? "Todavía no hay nadie pre-registrado"
                  : "Nadie coincide con estos filtros"}
              </p>
              <p className="text-sm text-muted-foreground">
                {participantes.length === 0
                  ? "Aparecerán en cuanto alguien cierre su pre-registro."
                  : "Prueba con menos filtros, o busca por matrícula."}
              </p>
            </>
          ) : null
        }
      >
        {tramo.visibles.map((p) => (
          <Fila key={p.folio}>
            <td className="px-3 py-2">
              <span className="font-medium">{p.nombre}</span>
              {/*
                La marca de nombre en revisión viaja con el nombre y no en una
                columna aparte: quien copie este nombre para un oficio o una
                constancia tiene que ver ahí mismo que está en duda.
              */}
              {p.nombreEnRevision ? (
                <span className="ml-2 text-xs font-semibold text-estado-discrepancia">
                  en revisión
                </span>
              ) : null}
            </td>
            <td className="px-3 py-2 font-mono text-xs">{p.matricula ?? "—"}</td>
            <td className="px-3 py-2">{p.programa ?? "—"}</td>
            <td className="px-3 py-2">
              {avanceTexto(configuracion.catalogoAcademico, p.nivel, p.avance, p.programa) || "—"}
            </td>
            <td className="px-3 py-2">{p.grupo ?? "—"}</td>
            <td className="px-3 py-2">{p.plantel ?? "—"}</td>
            {/*
              Correo y celular son enlaces, no texto.

              Es la mitad del motivo de esta pantalla: se entra a ella para
              escribirle a alguien. Con texto plano hay que seleccionar, copiar
              y cambiar de aplicación; con `mailto:` y `tel:` se abre el cliente
              de correo o se marca desde el propio teléfono, que es donde más se
              consulta esto durante el evento.
            */}
            <td className="px-3 py-2">
              <a href={`mailto:${p.correo}`} className="text-primary hover:underline">
                {p.correo}
              </a>
            </td>
            <td className="px-3 py-2 font-mono text-xs">
              <a href={`tel:${p.celular}`} className="text-primary hover:underline">
                {p.celular}
              </a>
            </td>
            <td className="px-3 py-2 text-right">
              <Button variant="outline" className="h-9" onClick={() => setAbierto(p.folio)}>
                Ver ficha
              </Button>
            </td>
          </Fila>
        ))}
      </Tabla>
      <Paginacion
        tramo={tramo}
        nota="La exportación se lleva estos mismos, con el filtro puesto."
      />

      {ficha ? (
        <FichaDelParticipante
          p={ficha}
          avance={avanceTexto(
            configuracion.catalogoAcademico,
            ficha.nivel,
            ficha.avance,
            ficha.programa,
          )}
          sede={infoDia(ficha.dia)}
          taller={talleres.find((t) => t.id === ficha.tallerId)?.nombre}
          estado={estadoDe(ficha)}
          onCerrar={() => setAbierto(null)}
        />
      ) : null}
    </PantallaPanel>
  );
}

/** Un renglón de la ficha: su rótulo y su valor. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <Rotulo como="span">{etiqueta}</Rotulo>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/**
 * La ficha completa de una persona.
 *
 * Todo lo que el sistema sabe de ella en una pantalla, agrupado por de dónde
 * viene cada cosa: lo que trae Servicios Escolares, lo que declaró ella y lo
 * que decidió el evento. Ese agrupado no es estético: cuando un dato está mal,
 * lo primero que hay que saber es a quién se le pide la corrección.
 *
 * Es solo de lectura. Cambiar el taller se hace en `/admin/preinscritos`,
 * registrar un pago en `/financieros/ficha` y corregir un nombre en
 * `/admin/soporte`; traer esas tres acciones aquí duplicaría tres flujos que ya
 * tienen su sitio, su permiso y su registro en la bitácora.
 */
function FichaDelParticipante({
  p,
  avance,
  sede,
  taller,
  estado,
  onCerrar,
}: {
  p: Participante;
  avance: string;
  sede: { etiqueta: string; lugar: string };
  taller: string | undefined;
  estado: { evento: EstadoPago };
  onCerrar: () => void;
}) {
  /*
   * El enlace de WhatsApp pide el número sin signos y con lada del país. Los
   * celulares se capturan a diez dígitos, que es como se dictan aquí; con menos
   * de diez no se arma el enlace en vez de armar uno roto que abre WhatsApp con
   * un número inexistente.
   */
  const digitos = p.celular.replace(/\D/g, "");
  const wa = digitos.length === 10 ? `https://wa.me/52${digitos}` : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <PerfilBadge perfil={p.perfil} />
          <EstadoPagoBadge estado={estado.evento} etiqueta="Evento" />
          {p.nombreEnRevision ? (
            <span className="text-xs font-semibold text-estado-discrepancia">
              Nombre en revisión
            </span>
          ) : null}
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <Dato etiqueta="Folio">
            <span className="font-mono">{p.folio}</span>
          </Dato>
          <Dato etiqueta="Matrícula">
            <span className="font-mono">{p.matricula ?? "No aplica"}</span>
          </Dato>
        </section>

        {/*
          Lo académico sale del padrón y el alumno no lo captura. Se rotula así
          para que quien vea un dato mal sepa que no se arregla aquí ni
          llamándole a él: se le pide a Servicios Escolares.
        */}
        <section className="grid gap-4 rounded-lg bg-muted p-4 sm:grid-cols-2">
          <p className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Lo que entrega Servicios Escolares
          </p>
          <Dato etiqueta="Nivel">{p.nivel ?? "—"}</Dato>
          <Dato etiqueta="Licenciatura">{p.programa ?? "—"}</Dato>
          <Dato etiqueta="Avance">{avance || "—"}</Dato>
          <Dato etiqueta="Grupo">{p.grupo ?? "—"}</Dato>
          <Dato etiqueta="Plantel">{p.plantel ?? "—"}</Dato>
          <Dato etiqueta="Institución">{p.institucion || "—"}</Dato>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <p className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Contacto, tal como lo declaró
          </p>
          <Dato etiqueta="Correo">
            <a
              href={`mailto:${p.correo}`}
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <AtSign className="size-3.5 shrink-0" aria-hidden />
              {p.correo}
            </a>
          </Dato>
          <Dato etiqueta="Celular">
            <span className="flex flex-wrap items-center gap-3">
              <a
                href={`tel:${p.celular}`}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Phone className="size-3.5 shrink-0" aria-hidden />
                {p.celular}
              </a>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </span>
          </Dato>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <p className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Lo que decidió el evento
          </p>
          <Dato etiqueta="Día y sede">
            {sede.etiqueta} — {sede.lugar}
          </Dato>
          <Dato etiqueta="Taller">{taller ?? "Sin taller"}</Dato>
          <Dato etiqueta="Pre-registro">{p.creadoEn}</Dato>
          {/*
            «No consta» y no un hueco: es quien se pre-registró antes de que el
            aviso se enseñara. La diferencia entre un dato que falta y un dato
            que no existe.
          */}
          <Dato etiqueta="Aviso de privacidad">
            {p.aceptoAvisoEn ? `Aceptado el ${p.aceptoAvisoEn}` : "No consta"}
          </Dato>
        </section>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
