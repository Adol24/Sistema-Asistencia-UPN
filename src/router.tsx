import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/*
 * Aquí se creaba un `QueryClient` y se metía en el contexto del router.
 *
 * Nunca lo usó nadie: en los 155 archivos de `src/` no hay un solo `useQuery`,
 * `useMutation` ni `useQueryClient`. Los datos los trae `cargarTodo` y los
 * reparte `estado-evento`. Pero el import ataba `@tanstack/react-query` al
 * chunk de ENTRADA, que es el que descarga todo el mundo —el alumno anónimo
 * incluido— antes de ver la primera pantalla.
 *
 * Si algún día se adopta de verdad, vuelve; mientras tanto era peso que se
 * pagaba en cada visita para no hacer nada.
 */
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
