import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Keyboard, LogIn, LogOut, ScanBarcode, ShieldCheck, Zap } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PantallaCaptura, SelectorModo } from "@/components/captura-shell";
import { Rotulo } from "@/components/tipografia";
import { CamaraQR } from "@/components/camara-qr";
import { PerfilBadge, PuntoSemaforo } from "@/components/estado-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { useEstadoEvento } from "@/lib/estado-evento";
import { useSesion } from "@/lib/sesion";
import { CAMPO_MAYUSCULAS } from "@/lib/campos";
import { opcion } from "@/lib/estilos";
import { retroalimentar } from "@/lib/retro";
import { evaluarEscaneo, type Color, type ResultadoEscaneo } from "@/lib/escaneo";
import type { OpcionesEscaneo } from "@/lib/contrato-estado";
import { meta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/captura/escaneo")({
  head: () =>
    meta(
      "Escaneo — Captura de asistencia",
      "Escáner de asistencia con resultado tipo semáforo a pantalla completa, campo alterno y contador de la sesión.",
    ),
  component: PantallaEscaneo,
});

/*
 * Cuánto dura el resultado en pantalla. Son dos números porque son dos cosas
 * distintas, y antes era uno solo de dos segundos para todas.
 *
 * El verde no se lee: se oye. Quien captura ya está encuadrando a la siguiente
 * persona antes de que termine el destello, así que solo tiene que durar lo
 * suficiente para confirmar que algo pasó. Por esta puerta entran 700 personas
 * en una hora —una cada cinco segundos—, así que dos segundos de pantalla verde
 * por cabeza no eran un detalle de interfaz: eran la fila.
 *
 * El amarillo y el rojo SÍ se leen, y además hay que hacer algo con esa persona.
 * Esos se quedan más, y encima detienen la cámara: mientras se resuelve un caso,
 * la fila no debe seguir avanzando.
 */
const MS_VERDE = 900;
const MS_AVISO = 2500;

/*
 * El lector físico manda el código de tecla de EE.UU., y en un teclado
 * configurado en español esa tecla ya no es «-»: es «'». El folio llega como
 * PRE'00801 en vez de PRE-00801, y no es un dato distinto, es el mismo guion
 * mal traducido por la distribución del teclado del equipo.
 *
 * El arreglo de fondo es configurar el lector a distribución «Español
 * Latinoamérica» desde su manual; esto es la red de seguridad mientras eso no
 * esté hecho en cada equipo. No hay riesgo de corregir de más: ni un folio
 * (`PRE-00801`) ni una matrícula (solo dígitos) llevan apóstrofe nunca.
 */
const corrigeApostrofeDeEscaner = (valor: string) => valor.replace(/['’]/g, "-");

/*
 * Qué aparato lee el código. Vive en `localStorage` y no en el estado de la
 * sesión: es una preferencia del EQUIPO —la laptop de esa puerta trae un
 * lector USB enchufado, o no—, no de la sesión de captura, que cambia de
 * capturista varias veces en el día sin que el cable se mueva de sitio.
 */
const CLAVE_FUENTE = "captura.fuenteEntrada";
type FuenteEntrada = "camara" | "lector";

const fuenteGuardada = (): FuenteEntrada => {
  try {
    return window.localStorage.getItem(CLAVE_FUENTE) === "lector" ? "lector" : "camara";
  } catch {
    return "camara";
  }
};

const guardarFuente = (valor: FuenteEntrada): void => {
  try {
    window.localStorage.setItem(CLAVE_FUENTE, valor);
  } catch {
    /* Sin almacenamiento, el ajuste dura lo que la pestaña. */
  }
};

const FUENTES: { valor: FuenteEntrada; etiqueta: string; icono: typeof Camera }[] = [
  { valor: "camara", etiqueta: "Cámara", icono: Camera },
  { valor: "lector", etiqueta: "Lector externo", icono: ScanBarcode },
];

function PantallaEscaneo() {
  const {
    participantes,
    sesion,
    evaluar,
    registrar,
    descartarEscaneo,
    historial,
    enLinea,
    pendientes,
    estadoDe,
    asistencias,
    getTaller,
  } = useEstadoEvento();

  // El panel de pruebas evalúa con el mismo motor que la cámara, así que
  // necesita lo mismo que él: los días del taller de cada quien.
  const diasDelTaller = useCallback((id: string) => getTaller(id)?.dias ?? [], [getTaller]);
  const { modoPrototipo } = useSesion();
  const [entrada, setEntrada] = useState("");
  const [resultado, setResultado] = useState<ResultadoEscaneo | null>(null);
  /*
   * La admisión pasa por aquí antes de escribirse.
   *
   * El QR no prueba quién lo trae: prueba qué folio es. Mientras esto no sea
   * null, en pantalla está el nombre y la matrícula de esa persona esperando a
   * que quien captura los compare con la credencial que tiene en la mano. No
   * hay ninguna asistencia escrita todavía.
   */
  /*
   * Lo que espera a que el capturista coteje la credencial, CON sus opciones.
   *
   * Antes solo se guardaba el resultado y las opciones se descartaban, así que
   * una excepción autorizada por un supervisor —día equivocado, nota escrita,
   * credencial confirmada— se aparcaba aquí y al confirmar se llamaba a
   * `registrar(porVerificar)` sin nada: no se construía `asistencia.autorizacion`
   * y la entrada quedaba indistinguible de las demás. Sin nota, sin autor, y sin
   * mención en la bitácora, que depende de ese campo.
   *
   * O sea que la autorización desaparecía justo en el caso para el que existe.
   */
  const [porVerificar, setPorVerificar] = useState<{
    r: ResultadoEscaneo;
    extra?: OpcionesEscaneo | undefined;
  } | null>(null);
  const [fuente, setFuente] = useState<FuenteEntrada>("camara");

  // El ajuste se lee después de montar y no al crear el estado: en el servidor
  // no hay `localStorage`, y leerlo durante el render haría que la primera
  // pintura del cliente no coincidiera con la del servidor.
  useEffect(() => {
    setFuente(fuenteGuardada());
  }, []);

  const elegirFuente = (valor: FuenteEntrada) => {
    setFuente(valor);
    guardarFuente(valor);
  };
  const [retenido, setRetenido] = useState(false);
  const [autorizando, setAutorizando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  // Mismo antirrebote que la cámara (camara-qr.tsx), pero para el campo de
  // texto: un lector de QR físico (pistola USB o Bluetooth) no habla con la
  // app, le "teclea" el folio y un Intro al campo enfocado. Si queda apuntando
  // al mismo código, dispara ráfagas de Intro igual que la cámara con el
  // teléfono quieto frente al lente.
  const ultimoAMano = useRef<{ valor: string; en: number }>({ valor: "", en: 0 });

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
  const disparar = async (
    valor: string,
    opciones?: { autorizado?: boolean; nota?: string; aMano?: boolean },
  ) => {
    if (!valor.trim()) return;
    if (opciones?.aMano) {
      const limpio = valor.trim();
      const ahora = Date.now();
      if (limpio === ultimoAMano.current.valor && ahora - ultimoAMano.current.en < 5000) return;
      ultimoAMano.current = { valor: limpio, en: ahora };
    }
    const extra = {
      autorizado: opciones?.autorizado ?? false,
      ...(opciones?.nota ? { nota: opciones.nota, autorizadoPor: sesion.capturista } : {}),
    };
    const r = await evaluar(valor, extra);

    /*
     * La admisión no se escribe hasta que alguien mira la credencial.
     *
     * Tampoco suena: el aviso sonoro significa «resuelto», y aquí no hay nada
     * resuelto todavía. Quien captura está mirando la pantalla de todos modos,
     * porque su trabajo en este segundo es comparar un nombre.
     */
    if (r.verificar) {
      setPorVerificar({ r, extra });
      setEntrada("");
      return;
    }

    registrar(r, extra);
    retroalimentar(r);
    setResultado(r);
    setRetenido(false);
    setEntrada("");
    // El foco vuelve al campo SOLO si de ahí vino. Devolvérselo después de cada
    // lectura de cámara levanta el teclado del teléfono encima del vídeo, que es
    // justo lo que el capturista necesita ver.
    if (opciones?.aMano) campo.current?.focus();
  };

  /*
   * Lo que parte la pantalla en dos no es el color, es si el capturista tiene
   * algo que hacer con esa persona. Lo decide `escaneo.ts` con `detiene`, y de
   * ahí cuelga todo lo de abajo: cuánto dura el resultado, si tapa la pantalla y
   * si la cámara se detiene.
   *
   * El caso que obligó a separarlo es el del baño: quien vuelve y lo escanean
   * por reflejo sale en amarillo «YA REGISTRADO», cuya instrucción es «déjalo
   * pasar». Por color, eso paraba la fila. Por acción, no para nada.
   */
  const bloqueante = resultado !== null && resultado.detiene;

  /*
   * La cámara se detiene mientras se verifica. Si siguiera leyendo, la persona
   * de atrás entraría en pantalla mientras quien captura está comparando el
   * nombre de la de adelante, y confirmaría a la equivocada.
   *
   * Y no se activa en absoluto en modo lector: ni se pide permiso de cámara
   * ni se enciende el sensor. Con un lector USB o Bluetooth en la puerta, el
   * cuadro de vídeo no aporta nada y sí le quita pantalla al campo que sí
   * importa.
   */
  const camaraActiva = fuente === "camara" && !bloqueante && porVerificar === null;

  useEffect(() => {
    if (!resultado || retenido) return;
    const t = setTimeout(() => setResultado(null), resultado.detiene ? MS_AVISO : MS_VERDE);
    return () => clearTimeout(t);
  }, [resultado, retenido]);

  /*
   * El campo manual es el blanco de un lector USB o Bluetooth tipo pistola
   * (ver el comentario de `ultimoAMano` más arriba): ese aparato no abre
   * nada, solo teclea el folio y un Intro hacia donde esté el foco. Si el
   * foco se queda en cualquier otro lado —al cargar la pantalla, o tras
   * cerrar un aviso con el mouse— sus lecturas no llegan a ningún sitio.
   *
   * En escritorio se enfoca siempre. En el teléfono solo en modo lector: ahí
   * no hay cámara en pantalla con la que el teclado virtual se encime, y es
   * justo el aparato con el que se usa un lector Bluetooth.
   */
  const esMovil = useIsMobile();
  const listoParaEscanear = !bloqueante && porVerificar === null && !autorizando;
  useEffect(() => {
    if (listoParaEscanear && (fuente === "lector" || !esMovil)) campo.current?.focus();
  }, [esMovil, fuente, listoParaEscanear]);

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
        diasDelTaller,
      });
      const clave = `${r.color}:${r.titulo}`;
      if (!encontrado.has(clave)) encontrado.set(clave, { p, titulo: r.titulo });
    }
    const orden: Color[] = ["verde", "azul", "amarillo", "rojo"];
    return [...encontrado.entries()]
      .map(([clave, v]) => ({ color: clave.split(":")[0] as Color, ...v }))
      .sort((a, b) => orden.indexOf(a.color) - orden.indexOf(b.color));
  }, [participantes, sesion, asistencias, estadoDe, diasDelTaller]);

  // Se repite en los dos casos —cámara y lector— así que se arma una vez.
  const overlay = (
    <>
      <span className="absolute right-3 top-3 z-10 rounded-md bg-background/90 px-2 py-1 text-xs font-bold">
        {escaneosSesion} {escaneosSesion === 1 ? "escaneo" : "escaneos"}
      </span>
      {resultado && !resultado.detiene ? <Destello r={resultado} /> : null}
    </>
  );

  return (
    <PantallaCaptura titulo={`Escaneo · Día ${sesion.dia} · ${sesion.punto}`}>
      <div className="rounded-lg border border-border bg-card p-2">
        <SelectorModo compacto />
      </div>

      {/*
        No es una preferencia de la sesión de captura, es del equipo: la
        laptop de esta puerta trae un lector enchufado o no, y eso no cambia
        cuando entra el siguiente capturista. Por eso vive en `localStorage`
        y se ofrece aquí, fuera de `SelectorModo`.
      */}
      <div className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label="Fuente de lectura">
        {FUENTES.map((f) => (
          <button
            key={f.valor}
            onClick={() => elegirFuente(f.valor)}
            aria-pressed={fuente === f.valor}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-md border text-xs font-bold transition-colors",
              opcion(fuente === f.valor),
            )}
          >
            <f.icono className="size-3.5" aria-hidden /> {f.etiqueta}
          </button>
        ))}
      </div>

      {/*
        La cámara se pausa mientras hay un resultado en pantalla: si no, seguiría
        leyendo el mismo código del teléfono que aún está enfrente y volvería a
        disparar en cuanto pasara el antirrebote.
      */}
      {/*
        La cámara NO se desmonta al mostrar un resultado, y esa es la diferencia
        entre una puerta que fluye y una que no. Antes esta pantalla devolvía el
        semáforo en lugar del escáner, así que `CamaraQR` se destruía y se volvía
        a crear con cada persona: abrir la cámara tarda cerca de un segundo, y se
        pagaba 700 veces por jornada. Ahora el resultado va encima y el vídeo
        sigue vivo debajo.
      */}
      {fuente === "camara" ? (
        <CamaraQR onLeer={(valor) => void disparar(valor)} activa={camaraActiva}>
          {overlay}
        </CamaraQR>
      ) : (
        <PanelLector>{overlay}</PanelLector>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void disparar(entrada, { aMano: true });
        }}
      >
        <Input
          ref={campo}
          value={entrada}
          onChange={(e) => setEntrada(corrigeApostrofeDeEscaner(e.target.value))}
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
        El panel de pruebas solo existe en modo prototipo.

        Se pintaba siempre, y en la puerta del evento eso es un problema de tres
        filos: enseña en pantalla el folio y el nombre de participantes reales,
        un toque accidental REGISTRA la entrada de alguien que no está, y ocupa
        la mitad de la pantalla que más importa del día. Existe para poder
        disparar cada color durante la revisión, no para operar.
      */}
      {modoPrototipo ? (
        <section className="mt-5 rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <Rotulo className="flex items-center gap-2">
            <Zap className="size-3.5" aria-hidden /> Casos de prueba del prototipo
          </Rotulo>
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
      ) : null}

      <DialogoConfirmar
        abierto={!!autorizando}
        alCerrar={() => setAutorizando(null)}
        titulo="Autorización de supervisor"
        descripcion={
          <>
            Vas a registrar el paso de {autorizando} en un día que no es el suyo. Queda anotado con
            tu nota en el historial de la sesión.
          </>
        }
        confirmar="Autorizar y registrar"
        deshabilitado={nota.trim().length < 10}
        alCancelar={() => setNota("")}
        alConfirmar={() => {
          const folio = autorizando!;
          const texto = nota.trim();
          setAutorizando(null);
          setNota("");
          void disparar(folio, { autorizado: true, nota: texto });
        }}
      >
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
      </DialogoConfirmar>

      {porVerificar ? (
        <Verificacion
          r={porVerificar.r}
          onConfirmar={() => {
            // Con sus opciones: es lo que hace que la autorización del
            // supervisor llegue a la asistencia y a la bitácora.
            registrar(porVerificar.r, porVerificar.extra);
            retroalimentar(porVerificar.r);
            setResultado(porVerificar.r);
            setRetenido(false);
            setPorVerificar(null);
          }}
          onDescartar={() => {
            descartarEscaneo(porVerificar.r, "Los datos no coinciden con la credencial");
            setPorVerificar(null);
          }}
        />
      ) : null}

      {/*
        Solo tapan la pantalla los casos que exigen hacer algo. Los demás ya se
        resolvieron arriba con un destello sobre el vídeo, sin detener a nadie.
      */}
      {resultado && resultado.detiene ? (
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
      ) : null}
    </PantallaCaptura>
  );
}

/**
 * El segundo filtro de la admisión: comparar contra la credencial.
 *
 * El QR no prueba quién lo trae, solo qué folio es. Alguien puede llegar con el
 * código de otro en el teléfono y el sistema no tendría cómo saberlo, así que la
 * identidad la pone una persona mirando una credencial física. Esta pantalla es
 * el momento en que eso ocurre, y por eso no hay nada escrito todavía.
 *
 * Está construida para leerse en dos segundos con ruido alrededor y la
 * credencial en la otra mano:
 *
 * - La matrícula va primera y en monoespaciado, que es lo que de verdad se
 *   compara. El nombre confirma, pero el que distingue a dos personas parecidas
 *   es el número.
 * - No hay color de semáforo. Verde significa «resuelto» en el resto de la
 *   aplicación, y aquí no hay nada resuelto: hay una pregunta.
 * - Confirmar y descartar no se parecen. Están separados y el de descartar no
 *   imita al de confirmar, porque quien pulsa cientos de veces al día acaba
 *   pulsando por reflejo, y el reflejo tiene que caer del lado seguro.
 */
function Verificacion({
  r,
  onConfirmar,
  onDescartar,
}: {
  r: ResultadoEscaneo;
  onConfirmar: () => void;
  onDescartar: () => void;
}) {
  const p = r.participante;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verifica los datos contra la credencial"
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-background p-5"
    >
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Compara con su credencial
        </p>

        <p className="mt-5 font-mono text-4xl font-extrabold leading-none sm:text-5xl">
          {p?.matricula ?? p?.folio ?? r.entradaCruda}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{p?.matricula ? "Matrícula" : "Folio"}</p>

        <p className="mt-6 text-2xl font-extrabold leading-tight sm:text-4xl">{p?.nombre ?? "—"}</p>

        {p ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PerfilBadge perfil={p.perfil} />
            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{p.folio}</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">Día {p.dia}</span>
          </div>
        ) : null}

        {/*
          El aviso de la discrepancia de pago viaja hasta aquí. Es la única
          admisión que llega con algo que decirle a la persona, y decírselo
          mientras se la tiene enfrente es la diferencia entre que pase por
          Servicios Financieros y que no se entere hasta octubre.
        */}
        {r.color !== "verde" && r.motivo ? (
          <div className="mt-5 rounded-lg bg-semaforo-amarillo p-3 text-semaforo-amarillo-fg">
            <p className="text-sm font-extrabold">{r.titulo}</p>
            <p className="mt-1 text-sm font-medium">{r.motivo}</p>
            {r.accion ? <p className="mt-1 text-sm font-bold">{r.accion}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        {/*
          Sin `autoFocus`. Enfocar el botón de confirmar abre un camino para
          confirmar con el teclado, y por esta pantalla pasa un campo donde se
          teclean folios a mano: un Intro de más admitiría a quien todavía no se
          ha mirado. Confirmar tiene que costar un dedo sobre el botón.
        */}
        <button
          onClick={onConfirmar}
          className="flex min-h-20 items-center justify-center gap-3 rounded-lg bg-semaforo-verde text-xl font-extrabold text-semaforo-verde-fg"
        >
          {/* La misma flecha que verá en el destello: un solo vocabulario. */}
          <LogIn className="size-7" aria-hidden /> REGISTRAR ENTRADA
        </button>
        <button
          onClick={onDescartar}
          className="min-h-14 rounded-lg border-2 border-semaforo-rojo bg-background text-sm font-bold text-semaforo-rojo"
        >
          No coincide — pasar a incidencias
        </button>
      </div>
    </div>
  );
}

/**
 * El mismo marco que `CamaraQR`, sin video: para cuando quien captura trae un
 * lector USB o Bluetooth enchufado y no necesita —ni quiere— la cámara
 * encendida.
 *
 * Mismo tamaño y mismas esquinas que el cuadro de la cámara a propósito: el
 * resultado (`Destello`, `Semaforo`) y el contador de escaneos se dibujan
 * encima con las mismas clases en los dos casos, así que el marco tiene que
 * medir igual para que no salten de sitio al cambiar de fuente.
 */
function PanelLector({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative mt-3 flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg bg-foreground/90 px-6 text-center">
      <ScanBarcode className="size-8 text-background/70" aria-hidden />
      <p className="text-sm font-semibold text-background">Lector externo activo</p>
      <p className="text-xs text-background/80">
        Apunta el lector al código. El campo de abajo lo recibe solo, sin que le des clic.
      </p>
      {children}
    </div>
  );
}

/**
 * Resultado que no exige hacer nada, encima de la imagen de la cámara.
 *
 * No ocupa la pantalla ni detiene el vídeo. Casi siempre es el verde —«esta
 * persona entró»— y para eso bastan el color, el nombre y el sonido: quien
 * captura no lee esto, lo confirma de reojo mientras mueve el teléfono.
 *
 * También cae aquí el amarillo de quien ya estaba registrado, que es el que
 * vuelve del baño. Conserva su color, para que se vea que no es una entrada
 * nueva, pero no roba la pantalla ni frena a los que vienen detrás.
 *
 * Reservar la pantalla completa para lo que exige una decisión es lo que deja
 * pasar a los cientos que no exigen ninguna.
 */
function Destello({ r }: { r: ResultadoEscaneo }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center",
        FONDO[r.color],
      )}
    >
      {/*
       * La flecha, y no una palomita.
       *
       * La palomita decía «bien», que es lo que ya dice el color, y callaba lo
       * único que el color no podía decir: hacia dónde va esta persona. Además
       * el color solo no basta —el daltonismo rojo-verde es el más común y hay
       * uno de cada doce hombres en la fila del capturista—, así que la
       * dirección tiene que estar dicha también con una forma.
       */}
      <Flecha tipo={r.tipo} color={r.color} className="size-10" />
      <p className="text-xl font-extrabold leading-tight">
        {r.participante?.nombre ?? r.entradaCruda}
      </p>
      <p className="text-sm font-bold uppercase tracking-wider opacity-90">{r.titulo}</p>
      {r.accion ? <p className="text-sm font-semibold">{r.accion}</p> : null}
    </div>
  );
}

/**
 * Hacia dónde va esta persona, dicho con una forma y no solo con un color.
 *
 * Se dibuja únicamente cuando hay un movimiento de verdad que enseñar. En lo
 * que no registra nada —un rojo, un «ya escaneado»— no hay dirección que
 * comunicar, y poner una flecha ahí sería afirmar un paso que no ocurrió.
 *
 * El pase de lista del taller no es un paso por la puerta: no entra ni sale,
 * así que tampoco lleva flecha.
 */
function Flecha({
  tipo,
  color,
  className,
}: {
  tipo: ResultadoEscaneo["tipo"];
  color: Color;
  className?: string;
}) {
  if (color === "rojo" || color === "amarillo" || tipo === "taller") return null;
  const Icono = tipo === "salida" ? LogOut : LogIn;
  return (
    <>
      <Icono className={className} aria-hidden />
      {/* El lector de pantalla necesita la palabra: la flecha es solo visual. */}
      <span className="sr-only">{tipo === "salida" ? "Sale del recinto" : "Entra al recinto"}</span>
    </>
  );
}

/**
 * Cada color trae su propio color de texto, fijo en claro y oscuro. Antes el
 * amarillo usaba `text-foreground`, que en modo oscuro es casi blanco y dejaba
 * el aviso en 1.65:1: ilegible justo en la pantalla que se lee a un metro.
 */
const FONDO: Record<Color, string> = {
  verde: "bg-semaforo-verde text-semaforo-verde-fg",
  azul: "bg-semaforo-azul text-semaforo-azul-fg",
  amarillo: "bg-semaforo-amarillo text-semaforo-amarillo-fg",
  rojo: "bg-semaforo-rojo text-semaforo-rojo-fg",
};

/**
 * Resultado a pantalla completa, legible a un metro de distancia.
 *
 * Va como capa encima del escáner —`fixed`— y no en lugar de él: la cámara
 * sigue montada debajo, apagada mientras esto esté visible, y vuelve a leer sin
 * tener que reabrirse en cuanto se cierra. Solo lo ven el amarillo y el rojo,
 * que son los casos donde detener la fila es exactamente lo que se quiere.
 */
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
      className={cn(
        "fixed inset-0 z-50 flex cursor-pointer flex-col justify-between overflow-y-auto p-6",
        FONDO[r.color],
      )}
    >
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] opacity-80">
          {retenido ? "Retenido — toca cerrar" : "Vuelve al escáner solo"}
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
        {r.registra ? (
          <p className="mt-3 flex items-center gap-2 text-2xl font-bold">
            <Flecha tipo={r.tipo} color={r.color} className="size-7" />{" "}
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
