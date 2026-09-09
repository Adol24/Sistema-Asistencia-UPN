import type { NivelAcademico } from "@/dominio/catalogos";

export interface DiaEvento {
  dia: 1 | 2 | 3;
  etiqueta: string;
  fecha: string;
  lugar: string;
}

/**
 * La configuración del evento, tal como vive en la base.
 *
 * Antes el tipo se derivaba de un objeto de ejemplo —`typeof evento`—, así que
 * los valores de demostración eran también la definición: no se podía borrar el
 * ejemplo sin perder el tipo. Aquí la forma se declara aparte de cualquier dato.
 */
export interface ConfiguracionEvento {
  nombre: string;
  subtitulo: string;
  fechas: string;
  horario: string;
  cuotaEvento: number;
  fechaLimite: string;
  /**
   * Cuánto tarda Servicios Financieros en validar un voucher entregado en
   * ventanilla. Es el plazo que se le promete al alumno antes de que su código
   * QR aparezca en el portal: nadie se lo envía, él lo descarga.
   */
  horasValidacion: number;
  /**
   * Dominio que deben tener los correos de los alumnos. Vacío significa que se
   * acepta cualquiera: hay universidades que no dan cuenta institucional a
   * todos, y rechazar a quien no la tiene lo dejaría fuera del evento.
   */
  dominioInstitucional: string;
  catalogoAcademico: NivelAcademico[];
  whatsappSoporte: string;
  correoSoporte: string;
  horarioSoporte: string;
  banco: { banco: string; cuenta: string; clabe: string; beneficiario: string };
  ventanilla: { lugar: string; horario: string };
  dias: DiaEvento[];
  registroEntrada: string;
  /**
   * La salida no lleva hora: depende de cuánto se alarguen las ponencias, y
   * anunciar un rango que no se cumple hace que la gente se vaya antes de
   * registrarse. Es texto libre por si algún año sí la tiene.
   */
  registroSalida: string;
  avisoPrivacidad: string;
  terminos: string;
}

/**
 * La configuración antes de que la base responda.
 *
 * Está vacía a propósito. Antes había aquí un evento de ejemplo completo —con
 * nombre, fechas, cuota y datos bancarios inventados—, y como la aplicación
 * arrancaba con él, una base mal configurada no se notaba: las pantallas se
 * veían llenas y plausibles. Un campo en blanco se ve raro y se pregunta; un
 * dato inventado se cree.
 *
 * Los tres días existen con la forma correcta pero sin contenido, porque el
 * resto del sistema los indexa por número y quedarse sin ellos rompería
 * pantallas que solo estaban esperando datos.
 */
export const CONFIGURACION_VACIA: ConfiguracionEvento = {
  nombre: "",
  subtitulo: "",
  fechas: "",
  horario: "",
  cuotaEvento: 0,
  fechaLimite: "",
  horasValidacion: 0,
  dominioInstitucional: "",
  catalogoAcademico: [],
  whatsappSoporte: "",
  correoSoporte: "",
  horarioSoporte: "",
  banco: { banco: "", cuenta: "", clabe: "", beneficiario: "" },
  ventanilla: { lugar: "", horario: "" },
  dias: [
    { dia: 1, etiqueta: "DÍA 1", fecha: "", lugar: "" },
    { dia: 2, etiqueta: "DÍA 2", fecha: "", lugar: "" },
    { dia: 3, etiqueta: "DÍA 3", fecha: "", lugar: "" },
  ],
  registroEntrada: "",
  registroSalida: "",
  avisoPrivacidad: "",
  terminos: "",
};
