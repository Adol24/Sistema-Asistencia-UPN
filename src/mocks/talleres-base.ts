/**
 * Datos fijos de los 11 talleres, SIN el cupo ocupado.
 *
 * `ocupadosPrevios` son las personas ya inscritas fuera del conjunto simulado
 * de 60 participantes: el evento espera entre 2,100 y 2,500 asistentes, así que
 * los 60 del prototipo son una muestra. El cupo ocupado real se calcula en
 * `talleres.ts` como `ocupadosPrevios + participantes con ese tallerId`, para
 * que el catálogo nunca pinte CUPO LLENO con datos que lo desmientan.
 *
 * Este archivo no importa `participantes.ts` a propósito: participantes lee de
 * aquí el costo del taller, y meter la dependencia inversa crearía un ciclo.
 */
import type { TallerBase } from "./tipos";

export const talleresBase: TallerBase[] = [
  {
    id: "T01",
    nombre: "Inteligencia artificial aplicada a la investigación",
    ponente: "DRA. MARIANA SOLIS RENTERIA",
    descripcion:
      "Uso responsable de modelos generativos para revisión de literatura, análisis de datos y redacción académica.",
    dias: [1, 2],
    horario: "10:00 a 13:00 hrs",
    lugar: "Aula Magna, Edificio B",
    cupoTotal: 30,
    ocupadosPrevios: 20,
    costo: 350,
    activo: true,
  },
  {
    id: "T02",
    nombre: "Análisis de datos con R para ciencias sociales",
    ponente: "MTRO. HECTOR PEÑA GALVAN",
    descripcion:
      "Introducción práctica a limpieza, visualización y modelos básicos con R y tidyverse.",
    dias: [1],
    horario: "10:00 a 13:00 hrs",
    lugar: "Laboratorio de Cómputo 3",
    cupoTotal: 25,
    ocupadosPrevios: 21,
    costo: 300,
    activo: true,
  },
  {
    id: "T03",
    nombre: "Redacción de artículos científicos en inglés",
    ponente: "DR. ANDREW MILLER",
    descripcion:
      "Estructura IMRyD, estrategias de publicación y errores frecuentes en manuscritos.",
    dias: [2, 3],
    horario: "10:00 a 13:00 hrs",
    lugar: "Salón SUTERM, Anexo 1",
    cupoTotal: 30,
    ocupadosPrevios: 16,
    costo: 400,
    activo: true,
  },
  {
    id: "T04",
    nombre: "Diseño de proyectos con enfoque de sostenibilidad",
    ponente: "DRA. LUCIA MUÑOZ ARREDONDO",
    descripcion:
      "Marco lógico, indicadores ODS y evaluación de impacto para proyectos universitarios.",
    dias: [1, 2],
    horario: "10:00 a 13:00 hrs",
    lugar: "Sala de Usos Múltiples",
    cupoTotal: 28,
    ocupadosPrevios: 7,
    costo: 300,
    activo: true,
  },
  {
    id: "T05",
    nombre: "Estadística aplicada con SPSS",
    ponente: "MTRA. GABRIELA NUÑEZ TREVIÑO",
    descripcion: "Pruebas de hipótesis, correlación y regresión con interpretación de resultados.",
    dias: [3],
    horario: "10:00 a 13:00 hrs",
    lugar: "Teatro Victoria, Sala Anexa",
    cupoTotal: 25,
    ocupadosPrevios: 22,
    costo: 350,
    activo: true,
  },
  {
    id: "T06",
    nombre: "Oratoria y presentación de resultados",
    ponente: "LIC. RODRIGO ESQUIVEL BAÑUELOS",
    descripcion: "Técnicas de voz, estructura narrativa y manejo de sesiones de preguntas.",
    dias: [2],
    horario: "10:00 a 13:00 hrs",
    lugar: "Auditorio Chico",
    cupoTotal: 30,
    ocupadosPrevios: 18,
    costo: 250,
    activo: true,
  },
  {
    id: "T07",
    nombre: "Gestión de referencias con Zotero y Mendeley",
    ponente: "MTRO. JAVIER CARRASCO LIMA",
    descripcion: "Organización de bibliografía, citas automáticas y trabajo colaborativo.",
    dias: [1],
    horario: "10:00 a 13:00 hrs",
    lugar: "Laboratorio de Cómputo 1",
    cupoTotal: 30,
    ocupadosPrevios: 4,
    costo: 250,
    activo: true,
  },
  {
    id: "T08",
    nombre: "Innovación educativa y aprendizaje activo",
    ponente: "DRA. PATRICIA VILLALOBOS SANTANA",
    descripcion:
      "Diseño de secuencias didácticas centradas en el estudiante y evaluación formativa.",
    dias: [2, 3],
    horario: "10:00 a 13:00 hrs",
    lugar: "Salón SUTERM, Anexo 2",
    cupoTotal: 28,
    ocupadosPrevios: 19,
    costo: 300,
    activo: true,
  },
  {
    id: "T09",
    nombre: "Propiedad intelectual y transferencia de tecnología",
    ponente: "LIC. SUSANA ORTEGA MEDRANO",
    descripcion: "Patentes, derechos de autor y rutas de vinculación con la industria.",
    dias: [3],
    horario: "10:00 a 13:00 hrs",
    lugar: "Teatro Victoria, Foyer",
    cupoTotal: 25,
    ocupadosPrevios: 13,
    costo: 300,
    activo: true,
  },
  {
    id: "T10",
    nombre: "Ciberseguridad para entornos universitarios",
    ponente: "ING. OMAR ZAVALA IBARRA",
    descripcion: "Buenas prácticas, protección de datos personales y respuesta a incidentes.",
    dias: [1, 2],
    horario: "10:00 a 13:00 hrs",
    lugar: "Laboratorio de Redes",
    cupoTotal: 26,
    ocupadosPrevios: 23,
    costo: 350,
    activo: true,
  },
  {
    id: "T11",
    nombre: "Divulgación científica en redes sociales",
    ponente: "MTRA. DANIELA ESCOBAR PEREZ",
    descripcion: "Guion, formatos cortos y métricas para comunicar ciencia a públicos amplios.",
    dias: [3],
    horario: "10:00 a 13:00 hrs",
    lugar: "Teatro Victoria, Sala B",
    cupoTotal: 30,
    ocupadosPrevios: 16,
    costo: 250,
    activo: true,
  },
];

export const getTallerBase = (id?: string) => talleresBase.find((t) => t.id === id);
