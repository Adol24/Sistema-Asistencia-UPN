import type { UsuarioInterno } from "./tipos";

export const usuariosInternos: UsuarioInterno[] = [
  {
    id: "U01",
    nombre: "SOFIA RAMIREZ BAÑUELOS",
    correo: "sofia.ramirez@universidad.mx",
    rol: "administrador",
    activo: true,
    ultimoAcceso: "05/09/2026 09:14",
  },
  {
    id: "U02",
    nombre: "JORGE ALBERTO PEÑA SOTO",
    correo: "jorge.pena@universidad.mx",
    rol: "servicios_financieros",
    activo: true,
    ultimoAcceso: "05/09/2026 08:52",
  },
  {
    id: "U03",
    nombre: "LETICIA BAÑOS MORALES",
    correo: "leticia.banos@universidad.mx",
    rol: "servicios_financieros",
    activo: true,
    ultimoAcceso: "04/09/2026 17:31",
  },
  {
    id: "U04",
    nombre: "MARIO CANTU GALLARDO",
    correo: "mario.cantu@universidad.mx",
    rol: "capturista",
    activo: true,
    ultimoAcceso: "05/09/2026 07:45",
  },
  {
    id: "U05",
    nombre: "JOSUE PALOMO NUÑEZ",
    correo: "josue.palomo@universidad.mx",
    rol: "capturista",
    activo: false,
    ultimoAcceso: "28/08/2026 14:02",
  },
  {
    id: "U06",
    nombre: "ANA LAURA VIDAL CASTRO",
    correo: "ana.vidal@universidad.mx",
    rol: "revisor_evidencias",
    activo: true,
    ultimoAcceso: "05/09/2026 10:20",
  },
  {
    id: "U07",
    nombre: "PEDRO SEGOVIA MUÑOZ",
    correo: "pedro.segovia@universidad.mx",
    rol: "revisor_evidencias",
    activo: true,
    ultimoAcceso: "05/09/2026 10:05",
  },
  {
    id: "U08",
    nombre: "MARTHA ELENA RIOS DIAZ",
    correo: "martha.rios@universidad.mx",
    rol: "soporte",
    activo: true,
    ultimoAcceso: "05/09/2026 09:58",
  },
];

export const etiquetaRol: Record<UsuarioInterno["rol"], string> = {
  administrador: "Administrador",
  servicios_financieros: "Servicios Financieros",
  capturista: "Capturista",
  revisor_evidencias: "Revisor de evidencias",
  soporte: "Soporte",
};
