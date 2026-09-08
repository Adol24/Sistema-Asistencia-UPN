import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * El orden de los plugins importa: `tanstackStart` genera el árbol de rutas y
 * tiene que correr antes que el plugin de React, y `nitro` va al final porque
 * empaqueta lo que los demás produjeron.
 */
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // El servidor arranca desde `src/server.ts`, que envuelve el SSR para
      // registrar los errores. Nitro construye a partir de ahí.
      server: { entry: "server" },
    }),
    viteReact(),
    nitro({ preset: "cloudflare-module" }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // Una segunda copia de React rompe los hooks en cuanto algo la importa desde
    // otra ruta. Se fuerza una sola, igual que con el router.
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
});
