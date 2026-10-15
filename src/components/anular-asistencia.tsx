/**
 * El diálogo para anular una asistencia, con su motivo obligatorio.
 *
 * Vivía escrito a mano solo en `/admin` —el dashboard—, que hasta ahora era el
 * único lugar desde el que se podía anular. Al agregar `/admin/asistencias`
 * se repetía el mismo bloque, con el mismo texto y la misma regla de los diez
 * caracteres: se saca aparte para que las dos pantallas digan exactamente lo
 * mismo, siempre, y para que un cambio de redacción no se tenga que hacer dos
 * veces.
 */
import type { ReactNode } from "react";
import { DialogoConfirmar } from "@/components/dialogo-confirmar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface AsistenciaParaAnular {
  id: string;
  tipo: string;
  nombre: string;
  dia: number;
  hora: string;
}

export function AnularAsistenciaDialogo({
  anulando,
  motivo,
  onMotivo,
  onCerrar,
  onConfirmar,
}: {
  anulando: AsistenciaParaAnular | null;
  motivo: string;
  onMotivo: (v: string) => void;
  onCerrar: () => void;
  onConfirmar: () => void;
}): ReactNode {
  return (
    <DialogoConfirmar
      abierto={!!anulando}
      alCerrar={onCerrar}
      titulo={
        <>
          Anular la {anulando?.tipo} de {anulando?.nombre}
        </>
      }
      descripcion={
        <>
          Del día {anulando?.dia} a las {anulando?.hora}. El registro deja de contar para su
          asistencia y para los elegibles, pero queda en la bitácora con tu nombre y el motivo.
          Escribe por qué: sin eso, dentro de un mes nadie sabrá si fue un error o una corrección.
        </>
      }
      confirmar="Anular"
      deshabilitado={motivo.trim().length < 10}
      alConfirmar={onConfirmar}
    >
      <div>
        <Label htmlFor="motivo-anulacion">Motivo</Label>
        <Textarea
          id="motivo-anulacion"
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          placeholder="Cambió de día por corrección del padrón; esta entrada era del día anterior."
          rows={3}
          className="mt-1"
        />
      </div>
    </DialogoConfirmar>
  );
}
