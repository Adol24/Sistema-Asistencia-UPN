import { useCallback, useMemo, useRef, useState } from "react";
import { simularLatencia } from "@/lib/formato";
import { leerLibro, type HojaXlsx } from "@/lib/xlsx";
import type { OrigenTabla } from "@/lib/csv";

/**
 * La mecánica común de las dos pantallas que importan un archivo: el padrón de
 * alumnos y la carga masiva de pagos.
 *
 * Las dos hacen lo mismo —soltar un CSV, analizarlo, revisar la vista previa con
 * su semáforo, filtrar, confirmar y aplicar— y lo hacían con el mismo código
 * escrito dos veces, con los mismos nombres de variable. Dos copias del mismo
 * flujo son dos oportunidades de que una se arregle y la otra no.
 *
 * Lo que cambia entre ellas es qué analiza el archivo y qué columnas se pintan.
 * Eso se queda en cada pantalla; el resto vive aquí.
 *
 * **Nada se aplica hasta confirmar.** Es la regla que hace usable una
 * importación: se revisa antes, no se descubre después.
 */

/** Toda fila analizada tiene un semáforo: eso es lo que el flujo necesita saber. */
export interface FilaConSemaforo {
  semaforo: "listo" | "advertencia" | "error";
}

export interface Importador<F extends FilaConSemaforo> {
  arrastrando: boolean;
  leyendo: boolean;
  archivo: string | null;
  filas: F[] | null;
  errorArchivo: string | null;
  filtro: "todas" | F["semaforo"];
  confirmando: boolean;
  aplicando: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;

  /**
   * Las hojas del libro, cuando el archivo es un Excel con más de una.
   *
   * `null` cuando el archivo es un CSV o trae una sola hoja: ahí no hay nada que
   * elegir y preguntarlo sería un paso de más.
   */
  hojas: HojaXlsx[] | null;
  /** Qué pestaña se está mirando. */
  hoja: string | null;
  /** Analiza otra pestaña del mismo libro, sin volver a leer el archivo. */
  elegirHoja: (nombre: string) => void;

  /** Las filas que pasan el filtro elegido. */
  visibles: F[];
  /** Cuántas hay de cada color, y cuántas se aplicarían. */
  resumen: { listo: number; advertencia: number; error: number; aplicables: number };

  setArrastrando: (v: boolean) => void;
  setFiltro: (f: "todas" | F["semaforo"]) => void;
  setConfirmando: (v: boolean) => void;

  /** Lee el archivo y lo analiza. Deja el error en pantalla si no se pudo. */
  cargar: (f: File) => Promise<void>;
  /** Aplica lo analizado con la función que le pase la pantalla. */
  aplicar: (accion: (filas: F[]) => Promise<void> | void) => Promise<void>;
  /** Vuelve al estado inicial, para soltar otro archivo. */
  limpiar: () => void;
}

export function useImportador<F extends FilaConSemaforo>(
  analizar: (origen: OrigenTabla) => F[],
): Importador<F> {
  const [arrastrando, setArrastrando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<F[] | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | F["semaforo"]>("todas");
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [hojas, setHojas] = useState<HojaXlsx[] | null>(null);
  const [hoja, setHoja] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Un `.xlsx` es un ZIP y empieza por «PK». Se mira el contenido y no solo la
   * extensión porque el archivo puede llegar renombrado, y el error de un ZIP
   * leído como texto —celdas de símbolos raros— no se parece en nada a la
   * causa.
   */
  const esExcel = async (f: File) => {
    if (/\.xlsx?$/i.test(f.name)) return true;
    const cabecera = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    return cabecera[0] === 0x50 && cabecera[1] === 0x4b;
  };

  const cargar = useCallback(
    async (f: File) => {
      setErrorArchivo(null);
      setFilas(null);
      setHojas(null);
      setHoja(null);
      setArchivo(f.name);
      setLeyendo(true);
      try {
        if (await esExcel(f)) {
          const libro = await leerLibro(await f.arrayBuffer());
          await simularLatencia();
          setHojas(libro);
          // Con varias pestañas se abre la primera y se deja elegir. Analizarlas
          // todas juntas mezclaría hojas que la universidad separó a propósito, y
          // no analizar ninguna obligaría a un clic antes de ver nada.
          const primera = libro[0]!;
          setHoja(primera.nombre);
          setFilas(analizar(primera.filas));
        } else {
          const texto = await f.text();
          await simularLatencia();
          setFilas(analizar(texto));
        }
      } catch (e) {
        setErrorArchivo(e instanceof Error ? e.message : "No se pudo leer el archivo.");
      } finally {
        setLeyendo(false);
      }
    },
    [analizar],
  );

  const elegirHoja = useCallback(
    (nombre: string) => {
      const elegida = hojas?.find((h) => h.nombre === nombre);
      if (!elegida) return;
      setErrorArchivo(null);
      setFilas(null);
      setHoja(nombre);
      setFiltro("todas");
      try {
        setFilas(analizar(elegida.filas));
      } catch (e) {
        // Una pestaña vacía o con otro encabezado no invalida el libro: se dice
        // qué pasa con ESA y las demás siguen a un clic.
        setErrorArchivo(e instanceof Error ? e.message : "No se pudo leer esa hoja.");
      }
    },
    [analizar, hojas],
  );

  const limpiar = useCallback(() => {
    setFilas(null);
    setArchivo(null);
    setErrorArchivo(null);
    setHojas(null);
    setHoja(null);
    setFiltro("todas");
  }, []);

  const aplicar = useCallback(
    async (accion: (filas: F[]) => Promise<void> | void) => {
      setConfirmando(false);
      setAplicando(true);
      await simularLatencia();
      await accion(filas ?? []);
      setAplicando(false);
      limpiar();
    },
    [filas, limpiar],
  );

  const resumen = useMemo(() => {
    const f = filas ?? [];
    const listo = f.filter((x) => x.semaforo === "listo").length;
    const advertencia = f.filter((x) => x.semaforo === "advertencia").length;
    const error = f.filter((x) => x.semaforo === "error").length;
    // Las de error se omiten al aplicar: por eso «aplicables» no es el total.
    return { listo, advertencia, error, aplicables: listo + advertencia };
  }, [filas]);

  const visibles = useMemo(
    () => (filtro === "todas" ? (filas ?? []) : (filas ?? []).filter((f) => f.semaforo === filtro)),
    [filas, filtro],
  );

  return {
    arrastrando,
    leyendo,
    archivo,
    filas,
    errorArchivo,
    filtro,
    confirmando,
    aplicando,
    inputRef,
    hojas,
    hoja,
    elegirHoja,
    visibles,
    resumen,
    setArrastrando,
    setFiltro,
    setConfirmando,
    cargar,
    aplicar,
    limpiar,
  };
}
