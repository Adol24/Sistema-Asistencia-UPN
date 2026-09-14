import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Estaba apagada, y en el silencio se acumularon treinta y siete
      // importaciones que ya no usaba nadie: iconos de una versión anterior de
      // la pantalla, ayudantes de cuando los datos eran simulados. Eso no se ve
      // leyendo el archivo —el bloque de importaciones se salta— y la única
      // forma de que no vuelva a pasar es que falle el `lint`.
      //
      // `_` delante perdona a propósito: un parámetro que el contrato obliga a
      // recibir y el cuerpo no necesita se nombra `_algo` y se queda.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Código generado por el registro de shadcn/ui, sin modificar por nosotros.
    // Exporta a propósito helpers junto a los componentes (`badgeVariants`,
    // `buttonVariants`, `toggleVariants`, `useFormField`, `useSidebar`,
    // `navigationMenuTriggerStyle`), que es lo que dispara
    // `react-refresh/only-export-components`.
    //
    // No lo corregimos: separarlos nos desviaría del registro y rompería las
    // actualizaciones posteriores con `shadcn add`. La regla solo afecta a la
    // ergonomía de Fast Refresh en desarrollo, no a la corrección del código.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintPluginPrettier,
);
