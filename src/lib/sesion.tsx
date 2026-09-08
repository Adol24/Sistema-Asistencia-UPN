import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { hayBaseDeDatos } from "@/lib/supabase-config";
import { rolDesdeBase } from "@/lib/roles";
import type { RolInterno } from "@/mocks/tipos";

export interface PersonaInterna {
  id: string;
  nombre: string;
  correo: string;
  rol: RolInterno;
}

interface Sesion {
  /** Quién está dentro, o `null` si nadie. */
  persona: PersonaInterna | null;
  /** Todavía averiguando si hay sesión. Ni dentro ni fuera: sin saber. */
  cargando: boolean;
  /**
   * No hay base configurada, así que la aplicación corre con datos simulados y
   * no exige credenciales. Se expone para poder DECIRLO en pantalla: un modo sin
   * autenticación que no se anuncia es una trampa esperando a que alguien
   * publique el prototipo creyendo que las pantallas internas están cerradas.
   */
  modoPrototipo: boolean;
  entrar: (correo: string, contrasena: string) => Promise<string | null>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

/**
 * La sesión del personal interno.
 *
 * Se apoya en Supabase Auth, pero la cuenta de Auth por sí sola no basta: para
 * entrar hay que tener además una fila **activa** en `usuarios_internos`, que es
 * donde vive el rol. Así, dar de baja a alguien —`activo = false`— lo deja fuera
 * sin tener que borrar su cuenta, y sus firmas en la bitácora siguen teniendo
 * autor.
 *
 * Esto es la puerta, no la cerradura. Quien manda es la base: sus políticas
 * comprueban el rol en cada escritura y no confían en lo que diga el navegador.
 * Lo que hace esta capa es que la interfaz no ofrezca lo que la base va a
 * rechazar, y que nadie se pasee por las pantallas internas sin identificarse.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<PersonaInterna | null>(null);
  const [cargando, setCargando] = useState(hayBaseDeDatos);

  const leerPerfil = useCallback(async (): Promise<PersonaInterna | null> => {
    const { supabase } = await import("@/lib/supabase");
    if (!supabase) return null;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    // La fila interna es la que decide. Sin ella —o dada de baja— hay cuenta de
    // Auth pero no permiso, y eso es exactamente «fuera».
    const { data, error } = await supabase
      .from("usuarios_internos")
      .select("id, nombre, correo, rol, activo")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error || !data || !data.activo) return null;
    return {
      id: data.id as string,
      nombre: data.nombre as string,
      correo: data.correo as string,
      rol: rolDesdeBase(data.rol as string),
    };
  }, []);

  useEffect(() => {
    if (!hayBaseDeDatos) return;
    let vigente = true;

    void leerPerfil()
      .then((p) => vigente && setPersona(p))
      .catch(() => vigente && setPersona(null))
      .finally(() => vigente && setCargando(false));

    return () => {
      vigente = false;
    };
  }, [leerPerfil]);

  const entrar = useCallback<Sesion["entrar"]>(
    async (correo, contrasena) => {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase) return "No hay base de datos configurada.";

      const { error } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      });
      // Un mensaje único para credenciales malas: distinguir «ese correo no
      // existe» de «esa contraseña no es» convierte el acceso en un buscador de
      // correos válidos del personal.
      if (error) return "Correo o contraseña incorrectos.";

      const p = await leerPerfil();
      if (!p) {
        await supabase.auth.signOut();
        return "Esa cuenta no tiene acceso al sistema. Habla con administración.";
      }
      setPersona(p);
      return null;
    },
    [leerPerfil],
  );

  const salir = useCallback(async () => {
    const { supabase } = await import("@/lib/supabase");
    await supabase?.auth.signOut();
    setPersona(null);
  }, []);

  const valor = useMemo<Sesion>(
    () => ({ persona, cargando, modoPrototipo: !hayBaseDeDatos, entrar, salir }),
    [persona, cargando, entrar, salir],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// Mismo patrón que `estado-evento` y `prototipo`: el proveedor y su hook viven
// juntos porque separarlos obliga a importar de dos sitios lo que siempre se usa
// a la vez.
// eslint-disable-next-line react-refresh/only-export-components
export function useSesion(): Sesion {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSesion fuera de SesionProvider");
  return ctx;
}
