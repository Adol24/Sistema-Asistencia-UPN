import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * «¿Seguro?» antes de algo que no se puede deshacer.
 *
 * Siete pantallas lo pintaban entero: las mismas nueve piezas de `alert-dialog`
 * importadas una por una —ocho líneas de importación por archivo— y el mismo
 * armazón de veinte. Lo único que cambiaba de una a otra era el título, la
 * explicación, lo que dice el botón y lo que hace.
 *
 * El botón de confirmar nunca dice «Aceptar»: dice lo que va a pasar —«Sí,
 * eliminar», «Autorizar y registrar»—, porque quien lee el diálogo a medias
 * solo lee el botón.
 *
 * @param disparador El botón que lo abre. Con él el diálogo se abre y cierra
 *   solo; sin él lo controla la pantalla con `abierto` y `alCerrar`, que es lo
 *   que hace falta cuando el diálogo pregunta por una fila concreta y necesita
 *   saber cuál.
 * @param children Lo que va entre la explicación y los botones: la nota de
 *   autorización, el motivo de una anulación.
 * @param deshabilitado Para cuando confirmar exige haber escrito algo antes.
 */
export function DialogoConfirmar({
  abierto,
  alCerrar,
  disparador,
  titulo,
  descripcion,
  confirmar,
  alConfirmar,
  alCancelar,
  deshabilitado,
  children,
}: {
  abierto?: boolean;
  alCerrar?: () => void;
  disparador?: ReactNode;
  titulo: ReactNode;
  descripcion: ReactNode;
  confirmar: ReactNode;
  alConfirmar: () => void;
  alCancelar?: () => void;
  deshabilitado?: boolean;
  children?: ReactNode;
}) {
  const control = disparador
    ? {}
    : {
        open: abierto ?? false,
        onOpenChange: (abriendo: boolean) => {
          if (!abriendo) alCerrar?.();
        },
      };

  return (
    <AlertDialog {...control}>
      {disparador ? <AlertDialogTrigger asChild>{disparador}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={alCancelar}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={deshabilitado} onClick={alConfirmar}>
            {confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
