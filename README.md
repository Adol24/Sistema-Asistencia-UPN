# Encuentro UI

CAMBIO DE ALCANCE — CONSTANCIAS

El sistema NO genera constancias. Esa decisión se tomó después de escribir esta
especificación, así que lo relativo a emisión de documentos quedó desactualizado
y está corregido más abajo.

Lo que el sistema sí hace: calcular quién es elegible y entregar el listado a
quien elabore los documentos. Es la única pieza que nadie más puede hacer, porque
solo el sistema sabe quién pagó, quién asistió y quién tiene sus evidencias
aprobadas.

Fuera de alcance, y por tanto ausentes del prototipo a propósito: generación o
vista previa de PDF, folio de constancia, QR de verificación, página pública
`/verificar/{folio}`, emisión individual o masiva, y anulación de constancias.

ALCANCE — LEE ESTO PRIMERO

Construye únicamente la interfaz de usuario. No implementes backend, base de datos, autenticación real, envío de correos ni integraciones.

Concretamente:

No uses Supabase ni ningún servicio backend

No crees esquemas de base de datos ni migraciones

No hagas llamadas de red

Toda la información viene de archivos de datos simulados (/src/mocks/) con datos realistas en español de México

El estado vive en memoria con React (useState, useContext). Al recargar se reinicia; es correcto

Las acciones (guardar, marcar pagado, aprobar) solo modifican el estado local y muestran la retroalimentación visual correspondiente

Los formularios validan del lado del cliente y muestran los mensajes de error tal como se especifican aquí

Simula latencia con un setTimeout de 600–900 ms en las acciones para que los estados de carga sean visibles y evaluables

El objetivo es un prototipo navegable y completo visualmente: cada pantalla, cada estado y cada mensaje listos para revisión y para que después un equipo conecte la lógica real.

Stack: React + Vite + TypeScript + Tailwind CSS + shadcn/ui + React Router. Todo en español de México, formato de fecha DD/MM/AAAA HH:mm, mobile-first, contraste AA, targets táctiles de 44px.

CONTEXTO PARA ENTENDER LAS PANTALLAS

Un Encuentro Internacional universitario de 3 días, de 8:00 a 14:00 hrs. El registro de entrada es de 8:00 a 9:00 y el de salida de 13:00 a 14:00. Asisten entre 2,100 y 2,500 personas repartidas en tres grupos de unas 700, uno por día. Los días 1 y 2 en el Salón SUTERM, el día 3 en el Teatro Victoria.

Hay tres perfiles de participante: alumno (se identifica con matrícula contra un padrón precargado), docente y externo (ambos llenan formulario). Las cuotas son iguales para los tres.

Hay 11 talleres con cupo de 25 a 30 personas, con costo adicional, algunos de un día y otros de dos. Cada persona elige máximo uno, o ninguno.

El pago se hace por depósito bancario y el voucher físico se entrega en ventanilla de Servicios Financieros, donde se marca en el sistema. Evento y taller son pagos separados: dos vouchers. Al marcarse el pago, se genera el QR de acceso.

DATOS SIMULADOS A CREAR

En /src/mocks/ genera archivos con datos realistas:

participantes.ts — 60 registros que cubran todas las combinaciones: los tres perfiles, los tres días, los seis estados de pago, algunos con taller y otros sin, algunos con nombreEnRevision: true, algunos con discrepancia. Nombres mexicanos verosímiles, incluyendo al menos tres con Ñ (MUÑOZ, PEÑA, NÚÑEZ) para validar visualmente la normalización.

alumnosPadron.ts — 40 registros con matrícula de 11 dígitos, nombre completo en una columna, nivel, programa, avance, grupo y plantel, más el día que la organización les asignó. (Corregido durante el desarrollo: Servicios Escolares entrega los datos académicos completos; el alumno solo verifica su nombre y declara su correo y su celular. **El día lo reparte la organización**, no viene en el archivo. El **plantel** es dónde estudia, distinto de la **sede** del evento.)

talleres.ts — los 11 talleres con nombre, ponente, descripción, días, horario, lugar, cupo total, cupo ocupado y costo. Deja dos con cupo lleno y uno con solo 2 lugares para probar esos estados.

asistencias.ts — registros de entrada y salida, algunos con cierreAutomatico: true.

evidencias.ts — unas 80 evidencias en los cuatro estados, con al menos dos pares de hash duplicado.

usuariosInternos.ts — usuarios de los cinco roles.

casosSoporte.ts — casos abiertos, en proceso y resueltos.

Usa imágenes de marcador de posición para vouchers y evidencias.

ESTADOS QUE LA UI DEBE SABER PINTAR

Estos estados no se calculan, se leen de los datos simulados. Cada uno necesita su propio tratamiento visual (color, ícono, etiqueta):

Estado de pago: pre_registrado, comprobante_recibido, pagado, discrepancia, expirado, cancelado. El estado del taller es independiente del estado del evento, así que la ficha muestra dos indicadores separados.

Estado de evidencia: pendiente, aprobada, rechazada, no_entregada.

Resultado de escaneo: verde, amarillo, rojo (detalle más abajo).

PANTALLAS PÚBLICAS

1. Bienvenida

Nombre del evento, fechas, sedes. Dos botones grandes: "Soy alumno de la universidad" y "No soy alumno".

2. Identificación de alumno

Campo de matrícula. Botón de buscar con estado de carga. (Corregido durante el desarrollo: el padrón no trae correos contra los que verificar, así que la matrícula es el único dato de entrada; la identidad se confirma en la pantalla siguiente, donde el alumno ve su nombre.)

Resultados a manejar visualmente:

Encontrado → pasa a la pantalla de confirmación de nombre

No encontrado → mensaje: "No encontramos esa matrícula en el padrón. Verifica que esté bien escrita o contacta a soporte." con botón de WhatsApp

Formato inválido → "La matrícula son 11 dígitos, sin letras ni espacios." (Corregido durante el desarrollo: ya no hay correo contra el que comparar, y la matrícula real de la universidad es numérica de 11 dígitos, como 20262122031.)

3. Confirmación de nombre

Recuadro destacado con el nombre en tipografía grande:

┌─────────────────────────────────────────┐
│ Verifica que tu nombre sea correcto │
│ │
│ JUAN CARLOS PEREZ MUÑOZ │
│ │
│ Formato: Nombre(s), Apellido Paterno, │
│ Apellido Materno — todo en MAYÚSCULAS │
│ y sin acentos. │
│ │
│ Así aparecerá en tu constancia. │
└─────────────────────────────────────────┘

☐ Confirmo que mi nombre es correcto
☐ Mi nombre aparece incorrecto

     [ Contactar a soporte por WhatsApp ]

Comportamiento de la UI: las dos casillas son mutuamente excluyentes y debe marcarse una para habilitar el botón de continuar. El nombre no es editable en ningún caso: no pongas campos de texto ahí.

Si marca "Mi nombre aparece incorrecto", el botón de continuar sigue habilitado y aparece un aviso informativo: "Tu registro continuará normalmente. Tu caso se enviará a soporte y tu constancia quedará en espera hasta que se corrija." Este flujo nunca bloquea el avance.

El botón de WhatsApp abre https://wa.me/52XXXXXXXXXX?text=... con matrícula, nombre mostrado y folio precargados en el texto. Junto al botón, horario de atención y correo de respaldo visibles.

Nota de normalización para los datos simulados: los nombres mostrados van en mayúsculas sin tildes, pero la Ñ se conserva (MUÑOZ, no MUNOZ). Refleja esto en los mocks.

4. Formulario de docente / externo

Campos: selector de perfil (docente / externo), nombre(s), apellido paterno, apellido materno marcado como opcional, correo, celular, institución de procedencia.

Aviso permanente arriba del formulario: "Escribe tu nombre en MAYÚSCULAS y sin acentos. Verifica bien tus datos: así aparecerán en tu constancia."

(Retirado durante el desarrollo: la verificación por código de 6 dígitos se quitó. Protegía poco —el QR se descarga del portal, y al portal se entra con folio y matrícula— y a cambio podía dejar a alguien atorado a media inscripción si el código no llegaba. En su lugar se confirma la dirección en pantalla, que atrapa el error de dedo sin depender de que un correo llegue.)

Cierra con pantalla de confirmación mostrando el nombre completo tal como quedará impreso y casilla obligatoria de confirmación.

5. Día y sede asignados

Tarjeta destacada, informativa, sin opción de elegir:

Tu asistencia presencial es:
DÍA 2 — Martes 15 de octubre
Salón SUTERM
Registro de entrada: 8:00 a 9:00 hrs

6. Catálogo de talleres

Los 11 talleres en tarjetas. Cada una: nombre, ponente, días y horario, lugar, contador de lugares disponibles, costo adicional, insignia de duración (1 DÍA / 2 DÍAS).

Estados visuales requeridos:

Disponible — seleccionable

Pocos lugares (menos de 5) — contador en color de advertencia

Cupo lleno — tarjeta en gris con etiqueta CUPO LLENO, visible pero no seleccionable (no la ocultes)

Seleccionado — resaltado, y los demás atenuados con opción de cambiar

Selección de máximo uno. Botón claramente visible: "Continuar sin taller".

Al seleccionar, aviso: "Tu lugar queda apartado hasta el viernes 10 de octubre a las 18:00 hrs. Si no entregas tu comprobante antes, el lugar se libera."

7. Instrucciones de pago

Pantalla larga, imprimible, con botón de descargar PDF y de reenviar por correo (ambos simulados).

Bloque de folio en tipografía muy grande, legible sin zoom, acompañado de un QR del folio:

TU FOLIO: PRE-00842

Aviso destacado de pagos separados:

⚠️ IMPORTANTE: son DOS depósitos por separado.
Debes presentar DOS vouchers distintos.

Seguido del desglose en dos bloques: evento (concepto ENCUENTRO-{folio}, monto) y taller si aplica (concepto TALLER-{folio}, monto).

Datos bancarios — banco, número de cuenta, CLABE, beneficiario, cada campo con botón de copiar que muestra confirmación al pulsarse.

Las dos imágenes de ejemplo de cómo presentar el voucher (correcta e incorrecta), en posición prominente, ampliables al tocar. Usa marcadores de posición etiquetados claramente.

Ubicación y horario de Servicios Financieros.

Fecha límite con día y hora exactos, destacada:

Fecha límite de entrega: viernes 10 de octubre, 18:00 hrs

Qué llevar: credencial vigente, voucher original, folio impreso o en pantalla.

Aviso del QR — bloque "Tu código QR lo descargas tú", con los 4 pasos: dejar el voucher, esperar las horas de validación configuradas, entrar al portal y descargar el QR con captura de pantalla. (Corregido durante el desarrollo: el QR no se envía por correo. Mandarle el código a cada alumno es inviable de operar; el alumno lo recoge en su portal pasadas unas horas.)

8. Comprobante de pre-registro

Resumen final con todos los datos, folio, botón de descarga y confirmación de envío por correo.

PORTAL DEL PARTICIPANTE

Acceso simulado con folio más matrícula (o folio más correo). Sin contraseña.

Vista de estado — línea de tiempo horizontal con cuatro nodos: Pre-registrado → Comprobante recibido → Pagado → QR generado. Cada nodo con estado completado, actual o pendiente.

Mi código QR — visible solo si el estado es pagado. QR grande con nombre y folio debajo, botones de descargar y guardar, y el aviso de tomar captura de pantalla porque no se necesitará internet en la entrada. Si aún no está pagado, muestra el estado actual y qué falta hacer, sin QR.

Mis evidencias (solo perfil alumno) — tres tarjetas, una por día:

┌──────────────────────────────────┐
│ DÍA 1 — Lunes 14 oct │
│ 🟦 PRESENCIAL │
│ ✓ Entrada 8:34 ✓ Salida 13:47 │
├──────────────────────────────────┤
│ DÍA 2 — Martes 15 oct │
│ 📷 Evidencia requerida │
│ Estado: PENDIENTE DE REVISIÓN │
├──────────────────────────────────┤
│ DÍA 3 — Miércoles 16 oct │
│ 📷 Evidencia requerida │
│ ⏱ Podrás subirla el 16/10 │
│ de 8:00 a 16:00 hrs │
└──────────────────────────────────┘

Estados a representar en las tarjetas: fuera de ventana horaria (bloqueada con explicación), disponible para subir, subida y en revisión, aprobada, rechazada con motivo visible y botón de volver a subir, y no entregada por vencimiento.

Componente de subida con vista previa de la imagen, indicador de progreso y contador de intentos restantes (máximo 3).

Mi constancia — muestra si cumple los requisitos y, si no, qué le falta. No hay descarga: el documento lo elabora la institución a partir del listado de elegibles.

PANEL DE SERVICIOS FINANCIEROS

Se usa con fila de gente esperando. Prioriza velocidad: campos grandes, foco automático al cargar, atajos de teclado visibles.

Búsqueda — un campo único que acepta folio, matrícula, nombre o correo, con foco automático, más un botón grande de escanear QR que abre una vista de cámara simulada.

Ficha del participante — nombre, folio, badge de color del perfil, día asignado, sede, monto esperado mostrado por el sistema, indicadores separados del estado de pago del evento y del taller, taller seleccionado si aplica, y alerta destacada si el nombre está en revisión.

Formulario de registro de pago — un bloque por concepto (evento / taller) con monto del voucher, referencia bancaria, fecha del depósito y captura de foto del voucher (componente de cámara/carga simulado con vista previa).

Estados de validación que la UI debe mostrar:

SituaciónTratamiento visualReferencia duplicadaError bloqueante en rojo: "Esa referencia bancaria ya fue registrada con el folio PRE-00291." Botón deshabilitado.Monto menor al esperadoAdvertencia en amarillo, campo de nota obligatorio, permite continuarMonto mayor al esperadoAdvertencia en amarillo, campo de nota obligatorio, permite continuarMonto exactoConfirmación en verde, pasa a pagado, muestra aviso de QR generado y correo enviado

Carga masiva por Excel — pantalla con zona de arrastrar y soltar, plantilla descargable y las columnas requeridas visibles: folio, concepto, monto, referencia_bancaria, fecha_deposito.

Después de cargar, una vista previa obligatoria antes de aplicar: tabla con semáforo por fila (🟢 listo, 🟡 advertencia por monto distinto o taller sin cupo, 🔴 error por folio inexistente, referencia duplicada o formato inválido), banner de resumen del tipo "142 registros listos, 8 con advertencia, 3 con error", filtros por tipo de resultado, botón "Aplicar solo los válidos" y botón de descargar el archivo de errores. Modal de confirmación final antes de aplicar. Nada cambia de estado hasta confirmar.

Vista de conciliación — tarjetas de total recaudado, desglose evento/taller, pagos en discrepancia, referencias duplicadas detectadas y pre-registros por vencer. Tabla filtrable y botón de exportar.

APP DE CAPTURA DE ASISTENCIA

Interfaz para celular, usada de pie y con prisa.

Configuración de sesión — selectores grandes de día (1, 2, 3), modo (ENTRADA / SALIDA / TALLER) y punto de captura. El modo debe poder cambiarse en cualquier momento desde un control siempre visible en la pantalla de escaneo.

Pantalla de escaneo — cámara simulada a pantalla completa, con campo alterno para teclear folio o matrícula. Contador de escaneos de la sesión visible.

Resultado tipo semáforo, ocupando toda la pantalla y legible a un metro de distancia:

ColorContenido🟢 VERDENombre grande, badge de perfil, "ENTRADA REGISTRADA", hora🟡 AMARILLONombre, motivo (ya registrado / discrepancia de pago / reingreso dentro de 15 min), acción sugerida🔴 ROJONombre, motivo (sin pagar / día equivocado / folio inválido), y en grande: "PASAR A MESA DE INCIDENCIAS"

El resultado se muestra 2 segundos y vuelve al escáner, con opción de tocar para mantenerlo en pantalla. Incluye vibración y sonido distinto por color (usa la API de vibración y un audio breve).

Indicador de conexión permanente en la barra superior: EN LÍNEA o SIN CONEXIÓN — 23 pendientes. Incluye un botón oculto de desarrollo para alternar entre ambos estados y poder evaluar visualmente el modo sin conexión.

Modo taller — además del escáner, una vista de lista con casillas para pase de lista manual, con búsqueda y contador de asistentes marcados.

Historial de la sesión — lista de los últimos escaneos, con opción de deshacer el más reciente.

PANEL DE REVISIÓN DE EVIDENCIAS

Diseñado para volumen alto (unas 5,000 imágenes). El ritmo importa más que la estética.

Imagen a pantalla completa con zoom, panel lateral con nombre, matrícula, día y hora de subida, y dos botones grandes de aprobar y rechazar.

Atajos de teclado visibles en pantalla: A aprobar, R rechazar, ←/→ navegar, Z deshacer. Avance automático a la siguiente imagen al decidir.

Alerta destacada de hash duplicado cuando aplique, mostrando ambas imágenes lado a lado con los datos de ambos alumnos.

Contador de progreso: "312 de 4,847 revisadas", con barra.

Filtros: por día, por estado, por revisor, solo duplicados.

Modal de rechazo con motivos seleccionables y obligatorios: no se distingue a la persona / no se ve la transmisión / imagen ilegible o muy oscura / imagen duplicada / fuera del horario permitido / otro (con campo de texto).

Enlace permanente y visible a los criterios de aprobación, que abre un panel lateral con el texto de referencia.

PANEL DE ADMINISTRACIÓN

Dashboard con tarjetas de indicadores y gráficas: pre-registros por perfil y por día, embudo de pagos (pre-registrado → comprobante → pagado), ocupación de los 11 talleres con barras de progreso, asistencia en vivo, avance de revisión de evidencias, y constancias emitidas contra elegibles.

Monitoreo en vivo de asistencia — total escaneado contra esperado, ritmo por minuto, desempeño por punto de captura, y panel de alertas de anomalías (un capturista con 50 registros en dos minutos, escaneos en horario improbable).

Módulos de gestión:

CRUD de talleres con formulario completo

Configuración del evento: fechas, sedes, cuotas, datos bancarios, fechas límite, WhatsApp de soporte, textos legales

Importación del padrón de alumnos con la misma mecánica de vista previa

Gestión de usuarios internos y roles

Bandeja de casos de soporte con estados y detalle

Bitácora — tabla filtrable por usuario, acción y rango de fechas. Registra lo que ocurre en la sesión, no solo lo histórico: pagos, cambios de configuración, altas de usuario, resolución de casos y exportaciones

Reportes con vista de tabla y botón de exportar: padrón, pagos, asistencia por día, ocupación de talleres, evidencias y elegibles

REQUISITOS DE ELEGIBILIDAD

Alumno — pago del evento en pagado, entrada y salida registradas en su día, y 2 evidencias aprobadas.

Docente y externo — pago del evento en pagado, entrada y salida registradas en su día.

Taller — pago del taller en pagado y asistencia registrada en todos los días del taller. Es un listado independiente del listado del evento.

El cierre automático de salida cuenta como salida válida: no salir escaneando es lo normal cuando el evento termina y la gente se va en bloque.

Listado de elegibles — vista de quién cumple los requisitos por perfil y, para quien no, qué requisito le falta con el detalle suficiente para responder sin abrir otra pantalla. Filtrable por perfil, día y estado de elegibilidad, con conteos por grupo.

Exportación pensada para quien elabora los documentos: nombre_constancia ya normalizado —mayúsculas, sin tildes, con la Ñ preservada—, perfil, día, sede y una columna que señale el nombre en revisión. Se exporta solo elegibles, y por separado el listado de talleres.

Marca destacada para quienes tienen el nombre en revisión con caso de soporte abierto. Ese campo existe desde el pre-registro para que no se imprima un nombre que ya se sabe incorrecto; como el sistema no emite documentos, su función es que quien los elabore aparte esos casos. La marca viaja también en la exportación, y desaparece al resolver el caso en la bandeja de soporte.

SISTEMA DE DISEÑO

Identidad profesional, institucional y sobria: es un evento académico internacional, no un festival. Define tokens de color, tipografía y espaciado desde el inicio. Paleta de dos colores principales sobre neutros, alto contraste, tipografía legible tipo Inter, espaciado generoso.

Colores semánticos consistentes en toda la aplicación para los estados de pago, los estados de evidencia y el semáforo de escaneo.

Badges de perfil con color propio para ALUMNO, DOCENTE y EXTERNO, usados igual en todos los paneles.

Adapta la densidad al contexto: el pre-registro público prioriza claridad, con un paso por pantalla y textos breves; el panel de financieros prioriza velocidad, con campos grandes y atajos; la app de captura prioriza legibilidad a distancia; el panel de revisión prioriza ritmo, con mínimo movimiento de mouse; el panel admin prioriza densidad de información.

Diseña los tres estados en todas las vistas: vacío, cargando (con skeletons, no spinners genéricos) y error. Nunca dejes una pantalla en blanco sin explicación.

Textos de error concretos. No "Ocurrió un error" sino "Esa referencia bancaria ya fue registrada con el folio PRE-00291".

Confirmación explícita en toda acción irreversible: cancelar registro, aplicar carga masiva, emitir constancias en lote.

NAVEGACIÓN Y ENTREGA

Incluye una pantalla de índice en / que liste todas las rutas del prototipo agrupadas por módulo, para que quien revise pueda saltar directamente a cualquier pantalla sin recorrer el flujo completo.

Agrega un selector de participante de prueba flotante (visible solo en el prototipo) que permita cambiar entre perfiles y estados de pago para ver cómo se comporta cada pantalla sin tener que rehacer el flujo.

Todas las rutas deben ser navegables directamente por URL.

RECORDATORIO FINAL

Esto es exclusivamente la capa de presentación. Sin backend, sin base de datos, sin llamadas de red. Datos simulados en memoria y estado local de React. La prioridad es que cada pantalla y cada estado existan y se vean correctos, listos para que después se conecte la lógica real.

## Documentación del prototipo

- **`docs/ESTADO-DEL-PROYECTO.md`** — qué está construido, con ruta y línea, y el
  registro tanda por tanda de cómo se llegó hasta aquí. Es el punto de partida
  para quien retome el proyecto.
- **`docs/RECORRIDO-DEMO.md`** — guion para enseñar el prototipo: qué abrir, en
  qué orden y con qué folios concretos, todos verificados contra los datos
  simulados.

Comandos de verificación: `bun run verificar-mocks`, `bun run typecheck`,
`bun run lint`, `bun run build`.

## Cómo trabajarlo

Necesitas [bun](https://bun.sh). Es el gestor de paquetes del proyecto y el
único lockfile válido es `bun.lock`: no uses npm ni pnpm, porque generan su
propio lockfile y terminan resolviendo versiones distintas.

```sh
bun install
bun run dev      # servidor de desarrollo
bun run build    # compila para producción
```

El proyecto usa TanStack Start sobre Vite, con Tailwind CSS v4 y componentes de
shadcn/ui. La configuración de compilación está completa en `vite.config.ts`; no
depende de ningún servicio externo.
