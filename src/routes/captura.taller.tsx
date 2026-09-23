import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Users } from "lucide-react";
import { Buscador } from "@/components/buscador";
import { PantallaCaptura } from "@/components/captura-shell";
import { Campo } from "@/components/tipografia";
import { EstadoVacio } from "@/components/tipografia";
import { PerfilBadge } from "@/components/estado-badges";
import { Checkbox } from "@/components/ui/checkbox";
import { useEstadoEvento } from "@/lib/estado-evento";
import { retroalimentar } from "@/lib/retro";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/captura/taller")({
  head: () =>
    meta(
      "Modo taller — Captura de asistencia",
      "Pase de lista manual por taller, con búsqueda y contador de asistentes marcados.",
    ),
  component: ModoTaller,
});

function ModoTaller() {
  const { participantes, sesion, escanear, asistencias, quitarAsistencia, talleres } =
    useEstadoEvento();
  const delDia = useMemo(
    () => talleres.filter((t) => t.dias.includes(sesion.dia)),
    [talleres, sesion.dia],
  );
  const [tallerId, setTallerId] = useState<string>(() => delDia[0]?.id ?? "");
  const [q, setQ] = useState("");

  const taller = talleres.find((t) => t.id === tallerId);

  const inscritos = useMemo(
    () => participantes.filter((p) => p.tallerId === tallerId && p.dia === sesion.dia),
    [participantes, tallerId, sesion.dia],
  );

  const marcados = useMemo(() => {
    const s = new Set(
      asistencias.filter((a) => a.tipo === "taller" && a.dia === sesion.dia).map((a) => a.folio),
    );
    return s;
  }, [asistencias, sesion.dia]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return inscritos;
    return inscritos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(t) ||
        p.folio.toLowerCase().includes(t) ||
        (p.matricula ?? "").toLowerCase().includes(t),
    );
  }, [inscritos, q]);

  const marcar = async (folio: string) => {
    /*
     * Reutiliza el mismo motor del escáner: pase de lista y escaneo aplican las
     * mismas reglas de negocio, solo cambia cómo se dispara.
     *
     * El modo va EXPLÍCITO, y es lo que faltaba. Sin él se usaba el de la
     * sesión, que por omisión es `"puerta"` y esta pantalla no ofrece dónde
     * cambiarlo: marcar a los inscritos de un taller les registraba a todos una
     * SALIDA del recinto —ya tenían su entrada de la mañana—, ninguna casilla se
     * encendía, el capturista volvía a tocar, y el segundo toque les registraba
     * una entrada. Cero asistencias de taller y el doble de movimientos de
     * puerta inventados.
     */
    const r = await escanear(folio, { modo: "taller" });
    retroalimentar(r);
  };

  // Con 25 casillas, corregir un error tiene que ser tan directo como marcarlo.
  const desmarcar = (folio: string) => {
    const suya = asistencias.find(
      (a) => a.folio === folio && a.tipo === "taller" && a.dia === sesion.dia,
    );
    if (suya) quitarAsistencia(suya.id);
  };

  const nMarcados = inscritos.filter((p) => marcados.has(p.folio)).length;

  return (
    <PantallaCaptura titulo={`Pase de lista · Día ${sesion.dia}`}>
      <p className="text-sm text-muted-foreground">
        Con grupos de 25 a 30 personas, marcar una lista es más rápido que escanear uno por uno.
      </p>

      {delDia.length === 0 ? (
        <EstadoVacio
          className="mt-6"
          icono={<Users className="size-8" aria-hidden />}
          titulo={`No hay talleres el día ${sesion.dia}`}
        >
          Cambia el día en la configuración de sesión para ver otro grupo.
        </EstadoVacio>
      ) : (
        <>
          <Campo etiqueta="Taller" className="mt-4">
            <select
              value={tallerId}
              onChange={(e) => setTallerId(e.target.value)}
              className="h-14 rounded-md border border-input bg-card px-3 text-base font-semibold"
            >
              {delDia.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.nombre}
                </option>
              ))}
            </select>
          </Campo>

          {taller ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {taller.ponente} · {taller.horario} · {taller.lugar}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" aria-hidden /> Asistentes marcados
            </span>
            <span className="text-2xl font-extrabold tabular-nums">
              {nMarcados}
              <span className="text-base font-medium text-muted-foreground">
                {" "}
                / {inscritos.length}
              </span>
            </span>
          </div>

          <Buscador
            className="mt-3"
            alto="h-12"
            valor={q}
            alCambiar={setQ}
            marcador="Buscar por nombre, folio o matrícula"
            etiqueta="Buscar en la lista"
          />

          <ul className="mt-3 grid gap-2">
            {visibles.map((p) => {
              const listo = marcados.has(p.folio);
              return (
                <li key={p.folio}>
                  <button
                    onClick={() => (listo ? desmarcar(p.folio) : void marcar(p.folio))}
                    aria-pressed={listo}
                    title={listo ? "Tocar para desmarcar" : "Tocar para marcar asistencia"}
                    className={cn(
                      "flex w-full min-h-16 items-center gap-3 rounded-lg border px-3 text-left transition-colors",
                      listo
                        ? "border-estado-pagado/40 bg-estado-pagado-bg"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <Checkbox checked={listo} className="pointer-events-none size-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.folio} · {p.matricula ?? p.correo}
                      </span>
                    </span>
                    <PerfilBadge perfil={p.perfil} />
                    {listo ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-estado-pagado">
                        <Check className="size-5" aria-hidden /> Desmarcar
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {visibles.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-semibold">
                  {inscritos.length === 0
                    ? `Nadie inscrito en ${tallerId} el día ${sesion.dia}`
                    : `Sin coincidencias para «${q}»`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {inscritos.length === 0
                    ? "Elige otro taller o cambia el día de la sesión."
                    : "Busca por apellido o por los últimos dígitos del folio."}
                </p>
              </li>
            ) : null}
          </ul>
        </>
      )}
    </PantallaCaptura>
  );
}
