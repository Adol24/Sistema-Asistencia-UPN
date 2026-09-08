import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * La raíz ya no muestra un índice de pantallas: el prototipo se recorre como
 * lo haría un participante, así que `/` entra directo al flujo público.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/bienvenida" });
  },
});
