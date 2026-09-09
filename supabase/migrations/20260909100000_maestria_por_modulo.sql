-- En maestría el avance se llama «Módulo», no «Cuatrimestre».
--
-- La etiqueta no es decorativa: es la palabra que el alumno lee en su pantalla
-- («Módulo 5»), la que sale en los reportes y la que aparece en los mensajes de
-- error de la importación. Con la palabra equivocada, quien revisa un archivo no
-- reconoce lo que el sistema le está diciendo.
update niveles_academicos
   set etiqueta_avance = 'Módulo'
 where nivel = 'Maestría';
