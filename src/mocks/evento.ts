import { catalogoAcademico } from "./catalogos";

/**
 * Configuración del evento. La pantalla de administración la edita en memoria y
 * las pantallas públicas la leen del contexto, no de este objeto: así un cambio
 * de cuota o de fecha límite se ve donde se usa sin recargar.
 */
export const evento = {
  nombre: "XIV Encuentro Internacional de Educación",
  subtitulo: "Conocimiento, innovación y comunidad",
  fechas: "14, 15 y 16 de octubre de 2026",
  horario: "8:00 a 14:00 hrs",
  cuotaEvento: 650,
  fechaLimite: "viernes 9 de octubre, 18:00 hrs",
  /**
   * Cuánto tarda Servicios Financieros en validar un voucher entregado en
   * ventanilla. Es el plazo que se le promete al alumno antes de que su código
   * QR aparezca en el portal: nadie se lo envía, él lo descarga.
   */
  horasValidacion: 5,
  /**
   * Dominio que deben tener los correos de los alumnos. Vacío significa que
   * se acepta cualquiera: hay universidades que no dan cuenta institucional a
   * todos, y rechazar a quien no la tiene lo dejaría fuera del evento.
   *
   * Va vacío porque en esta universidad los alumnos NO tienen cuenta
   * institucional: usan su correo personal. Con un dominio aquí, la validación
   * de `completar-datos` rechazaba a todos y nadie podía terminar el
   * pre-registro. El campo se conserva —es editable en administración— para la
   * universidad que sí la exija.
   */
  dominioInstitucional: "",
  /** Niveles, programas y forma de contar el avance. Editable. */
  catalogoAcademico,
  whatsappSoporte: "5211234567890",
  correoSoporte: "soporte.encuentro@universidad.mx",
  horarioSoporte: "Lunes a viernes de 9:00 a 18:00 hrs",
  banco: {
    banco: "BBVA México",
    cuenta: "0123456789",
    clabe: "012320001234567897",
    beneficiario: "UNIVERSIDAD AUTONOMA - ENCUENTRO INTERNACIONAL",
  },
  ventanilla: {
    lugar: "Servicios Financieros, Edificio A, planta baja",
    horario: "Lunes a viernes de 9:00 a 17:00 hrs",
  },
  dias: [
    { dia: 1 as const, etiqueta: "DÍA 1", fecha: "Miércoles 14 de octubre", sede: "Salón SUTERM" },
    { dia: 2 as const, etiqueta: "DÍA 2", fecha: "Jueves 15 de octubre", sede: "Salón SUTERM" },
    {
      dia: 3 as const,
      etiqueta: "DÍA 3",
      fecha: "Viernes 16 de octubre",
      sede: "Teatro Victoria",
    },
  ],
  registroEntrada: "8:00 a 9:00 hrs",
  /*
   * La salida NO lleva hora: depende de cuánto se alarguen las ponencias de los
   * invitados, y anunciar un rango que no se cumple hace que la gente se vaya
   * antes de registrarse. El campo sigue siendo texto libre para que la
   * organización pueda escribir una hora si algún año sí la tiene.
   */
  registroSalida: "Al terminar las ponencias del día",
  avisoPrivacidad:
    "Los datos que proporciones se usan únicamente para tu registro, control de asistencia y emisión de constancia del XIV Encuentro Internacional de Educación. No se comparten con terceros. Puedes solicitar su corrección o baja escribiendo al correo de soporte.",
  terminos:
    "El cupo de talleres se asigna por orden de entrega del comprobante y se libera si no se entrega antes de la fecha límite. La cuota no es reembolsable una vez validado el pago. La constancia se emite a nombre del participante tal como aparece en su registro; las correcciones deben solicitarse a soporte antes del cierre del evento.",
};

export const infoDia = (dia: 1 | 2 | 3) => evento.dias.find((d) => d.dia === dia)!;

export type ConfiguracionEvento = typeof evento;
