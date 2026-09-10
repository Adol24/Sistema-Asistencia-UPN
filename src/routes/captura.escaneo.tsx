import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Keyboard, ScanLine, ShieldCheck, Volume2, VolumeX, Zap } from "lucide-react";
import { PantallaCaptura, SelectorModo } from "@/components/captura-shell";
import { CamaraQR } from "@/components/camara-qr";
import { PerfilBadge, PuntoSemaforo } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEstadoEvento } from "@/lib/estado-evento";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { estaSilenciado, probar, retroalimentar, silenciar, type Aviso } from "@/lib/retro";
import { evaluarEscaneo, type Color, type ResultadoEscaneo } from "@/lib/escaneo";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Los siete avisos, con el nombre que usa quien está en la puerta. */
const PRUEBAS: [Aviso, string][] = [
  ["correcto", "Registrada"],
  ["folio_invalido", "Folio inválido"],
  ["dia_equivocado", "Día equivocado"],
  ["denegado", "Sin pagar"],
  ["ya_registrado", "Ya registrado"],
  ["reingreso", "Reingreso"],
  ["advertencia", "Pasa con aviso"],
];

export const Route = createFileRoute("/captura/escaneo")({
  head: () =>
    meta(
      "Escaneo — Captura de asistencia",
      "Escáner de asistencia con resultado tipo semáforo a pantalla completa, campo alterno y contador de la sesión.",
    ),
  component: PantallaEscaneo,
});

/** El resultado se muestra 2 segundos y vuelve al escáner. */
const MS_RESULTADO = 2000;

function PantallaEscaneo() {
  const { participantes, sesion, escanear, historial, enLinea, pendientes, estadoDe, asistencias } =
    useEstadoEvento();
  const [entrada, setEntrada] = useState("");
  const [resultado, setResultado] = useState<ResultadoEscaneo | null>(null);
  const [mudo, setMudo] = useState(false);

  // El ajuste se lee después de montar y no al crear el estado: en el servidor
  // no hay `localStorage`, y leerlo durante el render haría que la primera
  // pintura del cliente no coincidiera con la del servidor.
  useEffect(() => {
    setMudo(estaSilenciado());
  }, []);
  const [retenido, setRetenido] = useState(false);
  const [autorizando, setAutorizando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  const escaneosSesion = historial.length;

  /*
   * Espera a la base cuando hay conexión.
   *
   * Antes respondía al instante con lo que este teléfono conocía. Es más rápido
   * y a veces está mal: un folio escaneado hace un momento en otro punto salía
   * verde. En una puerta, dejar pasar dos veces cuesta más que un cuarto de
   * segundo. Sin conexión sigue siendo instantáneo, porque decide el motor
   * local.
   */
  const disparar = async (valor: string, autorizado = false, notaAutorizacion?: string) => {
    if (!valor.trim()) return;
    const r = await escanear(valor, {
      autorizado,
      ...(notaAutorizacion ? { nota: notaAutorizacion, autorizadoPor: sesion.capturista } : {}),
    });
    retroalimentar(r);
    setResultado(r);
    setRetenido(false);
    setEntrada("");
    campo.current?.focus();
  };

  useEffect(() => {
    if (!resultado || retenido) return;
    const t = setTimeout(() => setResultado(null), MS_RESULTADO);
    return () => clearTimeout(t);
  }, [resultado, retenido]);

  // Accesos rápidos a casos representativos: la cámara es simulada, así que sin
  // esto no habría forma cómoda de disparar cada color durante la revisión.
  // Los candidatos se evalúan con el mismo motor del escáner, no se adivinan:
  // así la etiqueta siempre coincide con lo que va a pasar al pulsarla.
  const casos = useMemo(() => {
    const encontrado = new Map<string, { p: (typeof participantes)[number]; titulo: string }>();
    for (const p of participantes) {
      const r = evaluarEscaneo({
        entrada: p.folio,
        sesion,
        participantes,
        asistencias,
        estadoDe,
        ahora: Date.now(),
      });
      const clave = `${r.color}:${r.titulo}`;
      if (!encontrado.has(clave)) encontrado.set(clave, { p, titulo: r.titulo });
    }
    const orden: Color[] = ["verde", "amarillo", "rojo"];
    return [...encontrado.entries()]
      .map(([clave, v]) => ({ color: clave.split(":")[0] as Color, ...v }))
      .sort((a, b) => orden.indexOf(a.color) - orden.indexOf(b.color));
  }, [participantes, sesion, asistencias, estadoDe]);

  if (resultado) {
    return (
      <Semaforo
        r={resultado}
        retenido={retenido}
        onTocar={() => setRetenido(true)}
        onCerrar={() => {
          setResultado(null);
          setRetenido(false);
        }}
        onAutorizar={() => {
          setAutorizando(resultado.participante?.folio ?? resultado.entradaCruda);
          setResultado(null);
        }}
      />
    );
  }

  return (
    <PantallaCaptura titulo={`Escaneo · Día ${sesion.dia} · ${sesion.punto}`}>
      <div className="rounded-lg border border-border bg-card p-2">
        <SelectorModo compacto />
      </div>

      {/*
        La cámara se pausa mientras hay un resultado en pantalla: si no, seguiría
        leyendo el mismo código del teléfono que aún está enfrente y volvería a
        disparar en cuanto pasara el antirrebote.
      */}
      <CamaraQR onLeer={(valor) => void disparar(valor)} activa={!resultado}>
        <span className="absolute right-3 top-3 rounded-md bg-background/90 px-2 py-1 text-xs font-bold">
          {escaneosSesion} {escaneosSesion === 1 ? "escaneo" : "escaneos"}
        </span>
      </CamaraQR>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void disparar(entrada);
        }}
      >
        <Input
          ref={campo}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          {...CAMPO_MAYUSCULAS}
          placeholder="Folio o matrícula"
          aria-label="Capturar folio o matrícula a mano"
          className="h-14 font-mono text-base uppercase"
        />
        <Button type="submit" className="h-14 px-6 text-base font-bold" disabled={!entrada.trim()}>
          <Keyboard className="size-5" /> Registrar
        </Button>
      </form>
      <p className="mt-1 text-xs text-muted-foreground">
        El campo es el plan B para quien llega sin código.
        {!enLinea ? ` Sin conexión: ${pendientes} escaneos esperando sincronización.` : ""}
      </p>

      {/*
        La prueba de sonido va aquí, en la pantalla donde se usa.
        El volumen de la puerta se ajusta ANTES de que llegue la fila, no
        descubriendo a media jornada que el teléfono estaba en silencio.
      */}
      <section className="mt-5 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Volume2 className="size-3.5" aria-hidden /> Avisos sonoros
          </h2>
          <Button
            type="button"
            variant={mudo ? "destructive" : "outline"}
            size="sm"
            onClick={() => {
              const v = !mudo;
              silenciar(v);
              setMudo(v);
              // Al reactivar suena, para confirmar que el altavoz responde.
              if (!v) probar("correcto");
            }}
          >
            {mudo ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {mudo ? "Sonido apagado" : "Sonido encendido"}
          </Button>
        </div>
        {mudo ? (
          <p className="mt-2 text-xs font-medium text-destructive">
            Con el sonido apagado tendrás que mirar la pantalla en cada escaneo. La vibración sigue
            funcionando.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Escúchalos antes de abrir la puerta: cada situación suena distinto para no tener que
              leer la pantalla.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PRUEBAS.map(([aviso, etiqueta]) => (
                <button
                  key={aviso}
                  type="button"
                  onClick={() => probar(aviso)}
                  className="min-h-11 rounded-md border border-border bg-muted/40 px-3 text-left text-xs font-medium hover:bg-muted"
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-dashed border-border bg-muted/40 p-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Zap className="size-3.5" aria-hidden /> Casos de prueba del prototipo
        </h2>
        <div className="mt-2 grid gap-2">
          {casos.map((c) => (
            <button
              key={`${c.color}-${c.titulo}`}
              onClick={() => void disparar(c.p.folio)}
              className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-left text-xs hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{c.titulo}</span>
                <span className="block truncate text-muted-foreground">
                  {c.p.folio} · {c.p.nombre}
                </span>
              </span>
              <PuntoSemaforo color={c.color} />
            </button>
          ))}
          <p className="text-xs text-muted-foreground">
            Escanea dos veces al mismo participante para ver la ventana de reingreso.
          </p>
        </div>
      </section>

      <AlertDialog open={!!autorizando} onOpenChange={(o) => !o && setAutorizando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Autorización de supervisor</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a registrar el paso de {autorizando} en un día que no es el suyo. Queda anotado
              con tu nota en el historial de la sesión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="Motivo de la excepción, por ejemplo: cambió de día por permiso laboral, autoriza SOFIA RAMIREZ."
            aria-label="Nota de autorización"
          />
          <p className="text-xs text-muted-foreground">
            {nota.trim().length < 10
              ? `Escribe al menos 10 caracteres (llevas ${nota.trim().length}).`
              : "Nota lista."}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNota("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={nota.trim().length < 10}
              onClick={() => {
                const folio = autorizando!;
                const texto = nota.trim();
                setAutorizando(null);
                setNota("");
                void disparar(folio, true, texto);
              }}
            >
              Autorizar y registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PantallaCaptura>
  );
}

/**
 * Cada color trae su propio color de texto, fijo en claro y oscuro. Antes el
 * amarillo usaba `text-foreground`, que en modo oscuro es casi blanco y dejaba
 * el aviso en 1.65:1: ilegible justo en la pantalla que se lee a un metro.
 */
const FONDO: Record<Color, string> = {
  verde: "bg-semaforo-verde text-semaforo-verde-fg",
  amarillo: "bg-semaforo-amarillo text-semaforo-amarillo-fg",
  rojo: "bg-semaforo-rojo text-semaforo-rojo-fg",
};

/** Resultado a pantalla completa, legible a un metro de distancia. */
function Semaforo({
  r,
  retenido,
  onTocar,
  onCerrar,
  onAutorizar,
}: {
  r: ResultadoEscaneo;
  retenido: boolean;
  onTocar: () => void;
  onCerrar: () => void;
  onAutorizar: () => void;
}) {
  return (
    <div
      onClick={onTocar}
      role="status"
      aria-live="assertive"
      className={cn("flex min-h-svh cursor-pointer flex-col justify-between p-6", FONDO[r.color])}
    >
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] opacity-80">
          {retenido ? "Retenido — toca cerrar" : "Vuelve al escáner en 2 s"}
        </p>
        <p className="mt-6 text-3xl font-extrabold leading-tight sm:text-5xl">
          {r.participante?.nombre ?? r.entradaCruda}
        </p>
        {r.participante ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PerfilBadge
              perfil={r.participante?.perfil}
              className="border-white/40 bg-white/20 text-inherit"
            />
            <span className="rounded-md bg-black/15 px-2 py-1 font-mono text-xs">
              {r.participante?.folio}
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-4xl font-extrabold leading-none sm:text-6xl">{r.titulo}</p>
        {r.color === "verde" ? (
          <p className="mt-3 flex items-center gap-2 text-2xl font-bold">
            <CheckCircle2 className="size-7" aria-hidden />{" "}
            {new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : null}
        {r.motivo ? <p className="mt-3 text-lg font-medium sm:text-xl">{r.motivo}</p> : null}
        {r.accion ? (
          <p
            className={cn(
              "mt-4 font-extrabold",
              r.color === "rojo" ? "text-3xl sm:text-4xl" : "text-lg sm:text-xl",
            )}
          >
            {r.accion}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {r.autorizable ? (
          <button
            onClick={onAutorizar}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-black/25 px-4 text-sm font-bold hover:bg-black/35"
          >
            <ShieldCheck className="size-5" aria-hidden /> Autorización de supervisor
          </button>
        ) : null}
        <button
          onClick={onCerrar}
          className="min-h-14 flex-1 rounded-lg bg-white/90 px-4 text-sm font-bold text-foreground hover:bg-white"
        >
          Siguiente persona
        </button>
      </div>
    </div>
  );
}
