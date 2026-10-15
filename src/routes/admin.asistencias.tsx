import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LogIn, LogOut, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PantallaPanel } from "@/components/layouts";
import { Buscador } from "@/components/buscador";
import { EstadoVacio, Tarjeta } from "@/components/tipografia";
import { PerfilBadge } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { AnularAsistenciaDialogo, type AsistenciaParaAnular } from "@/components/anular-asistencia";
import { useEstadoEvento } from "@/lib/estado-evento";
import { buscarEnParticipantes } from "@/lib/busqueda";
import { movimientosDe } from "@/lib/escaneo";
import { diaRealDeHoy } from "@/lib/formato";
import { meta } from "@/lib/seo";
import type { Asistencia, Dia, Participante } from "@/dominio/tipos";

export const Route = createFileRoute("/admin/asistencias")({
  head: () =>
    meta(
      "Asistencias — Administración del Encuentro",
      "Entrada, salida y reintegro de cada alumno, día por día. Anular deja que su siguiente escaneo se trate como el primero.",
    ),
  component: Asistencias,
});

const DIAS: Dia[] = [1, 2, 3];

/** La etiqueta de un movimiento, por su posición y su tipo. Ver `movimientosDe`. */
function etiquetaDe(indice: number, m: Asistencia): { texto: string; icono: typeof LogIn } {
  if (indice === 0) return { texto: "Entrada", icono: LogIn };
  if (m.tipo === "salida") return { texto: "Salida", icono: LogOut };
  return { texto: "Reintegro", icono: RotateCcw };
}

function Asistencias() {
  const { participantes, asistencias, configuracion, anularAsistencia } = useEstadoEvento();
  const [q, setQ] = useState("");
  const [anulando, setAnulando] = useState<AsistenciaParaAnular | null>(null);
  const [motivo, setMotivo] = useState("");

  /*
   * El día que de verdad está corriendo, no el asignado a nadie.
   *
   * Anular es irreversible para efectos prácticos —el siguiente escaneo de esa
   * persona se trata como si fuera el primero del día—, así que solo tiene
   * sentido ofrecerlo sobre el día que está en curso. Reescribir un día ya
   * cerrado desde aquí sería tocar historia que el torniquete ya no puede
   * volver a comprobar contra nada.
   */
  const hoy = diaRealDeHoy(configuracion.dias);

  const encontrados = useMemo(() => buscarEnParticipantes(participantes, q), [participantes, q]);

  const abrirAnular = (a: Asistencia) => {
    setAnulando(a);
    setMotivo("");
  };

  return (
    <PantallaPanel
      area="admin"
      titulo="Asistencias"
      descripcion="Entrada, salida y reintegro de cada alumno, día por día."
    >
      <Buscador
        className="max-w-md"
        valor={q}
        alCambiar={setQ}
        marcador="Nombre, folio o matrícula"
        etiqueta="Buscar un participante"
      />

      {hoy === null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Hoy no es ninguno de los tres días del evento: por ahora no se puede anular nada, solo
          consultar.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {q.trim() === "" ? (
          <EstadoVacio icono={<Search className="size-8" aria-hidden />} titulo="Busca a alguien">
            Escribe un nombre, folio o matrícula para ver su historial.
          </EstadoVacio>
        ) : encontrados.length === 0 ? (
          <EstadoVacio icono={<Search className="size-8" aria-hidden />} titulo="Nadie coincide">
            Prueba con otro nombre, folio o matrícula.
          </EstadoVacio>
        ) : (
          encontrados.map((p) => (
            <FichaDeAsistencia
              key={p.id}
              p={p}
              asistencias={asistencias}
              hoy={hoy}
              dias={configuracion.dias}
              onAnular={abrirAnular}
            />
          ))
        )}
      </div>

      <AnularAsistenciaDialogo
        anulando={anulando}
        motivo={motivo}
        onMotivo={setMotivo}
        onCerrar={() => setAnulando(null)}
        onConfirmar={() => {
          if (!anulando) return;
          anularAsistencia(anulando.id, motivo.trim());
          toast.success(`Anulada la ${anulando.tipo} de ${anulando.nombre}.`);
          setAnulando(null);
        }}
      />
    </PantallaPanel>
  );
}

/** El historial de una persona, los tres días, con un botón de anular por movimiento de hoy. */
function FichaDeAsistencia({
  p,
  asistencias,
  hoy,
  dias,
  onAnular,
}: {
  p: Participante;
  asistencias: Asistencia[];
  hoy: Dia | null;
  dias: { dia: Dia; etiqueta: string; fecha: string }[];
  onAnular: (a: Asistencia) => void;
}) {
  return (
    <Tarjeta padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{p.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {p.folio}
            {p.matricula ? ` · ${p.matricula}` : ""}
          </p>
        </div>
        <PerfilBadge perfil={p.perfil} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {DIAS.map((dia) => {
          const info = dias.find((d) => d.dia === dia);
          const movs = movimientosDe(asistencias, p.folio, dia);
          return (
            <div key={dia} className="rounded-md border border-border p-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {info?.etiqueta ?? `Día ${dia}`}
              </p>
              {movs.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Sin movimientos</p>
              ) : (
                <ul className="mt-1 grid gap-1">
                  {movs.map((m, i) => {
                    const { texto, icono: Icono } = etiquetaDe(i, m);
                    const puedeAnular = dia === hoy;
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <Icono className="size-3.5 text-muted-foreground" aria-hidden />
                          {texto} {m.hora}
                        </span>
                        {puedeAnular ? (
                          <Button
                            variant="outline"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => onAnular(m)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}
