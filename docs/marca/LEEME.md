# Marca del Encuentro

## `logo-encuentro-original.png`

El logotipo oficial tal como lo entregó la organización: 1458 × 1291, RGBA, 184 KB.
**No se sirve.** Vive aquí para que el original no exista solo en la carpeta de
descargas de una máquina: lo que la web usa es un derivado con pérdida, y de un
derivado no se vuelve al original.

El trazo es de un solo color, `#373435`, sobre transparente.

## `public/logo-encuentro.png`

Lo que la web sirve: 512 × 453, gris + alfa, 40 KB.

Se reduce de cuatro canales a dos porque el trazo es de un solo color: el plano
de color no aporta nada y solo el alfa lleva la forma. Eso solo baja de 184 KB a
40 KB sin tocar el dibujo.

Para regenerarlo desde el original:

```python
from PIL import Image
im = Image.open("docs/marca/logo-encuentro-original.png").convert("RGBA")
w, h = im.size
ancho = 512
r = im.resize((ancho, round(h * ancho / w)), Image.LANCZOS)
Image.merge("LA", (Image.new("L", r.size, 55), r.getchannel("A"))).save(
    "public/logo-encuentro.png", optimize=True
)
```

## Dónde se usa

Va en dos sitios:

| Dónde                                                 | Tamaño                  | Para qué                                           |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| Portada del pre-registro (`/bienvenida`)              | 96 px · 128 px de `lg:` | Es la primera pantalla que alguien ve              |
| Cabecera de la ficha del comprobante (`/comprobante`) | 64 px                   | Es el papel que la persona lleva a ventanilla      |
| Barra superior pública (`BarraPublica`)               | 36 px · 40 px de `lg:`  | Acompaña todo el flujo, junto al nombre del evento |

En el comprobante no es adorno: la barra superior, el pie y el riel son los tres
`print:hidden`, y entre los tres se llevaban el nombre del encuentro. Impreso
quedaba «Comprobante de pre-registro» y una ficha con un nombre, un folio y un
QR —ni el evento, ni el año, ni las fechas—. La cabecera lleva el logotipo, el
nombre y las fechas, así que el papel se identifica solo.

## El tamaño mínimo, que es la regla que gobierna todo lo de arriba

Son tres puños alrededor de un globo trazados a línea fina. Medido:

| Tamaño      | Cómo se ve                                              |
| ----------- | ------------------------------------------------------- |
| 28 px       | Borrón gris. No se distingue ninguna de las tres formas |
| 36 px       | Se reconoce la silueta                                  |
| 40 px       | Se distinguen los puños y el globo                      |
| 48 px       | Se lee bien                                             |
| 64 px y más | Se entiende el dibujo completo                          |

**Por debajo de 36 px no se pone.** La barra superior tenía un hueco de 28 px y
la respuesta no fue meter el logotipo encogido, sino agrandar el hueco: cambiar
un cuadro azul que al menos se veía por un borrón gris no habría sido una
mejora.

Que se lea mejor no es lo mismo que que quede mejor. En la barra estuvo un rato
a 40/48 y se veía más nítido, pero pesaba más que el nombre del encuentro que
lleva al lado: es una barra de utilidad, no una cabecera de marca, y ahí el
logotipo acompaña. Bajó a 36/40. En la portada y en el comprobante manda la
legibilidad, porque el logotipo sí es lo primero que se mira.

**En los iconos va invertido: trazo BLANCO sobre azul institucional.** Ahí el
sistema operativo manda el tamaño —48 px y menos en la pantalla de inicio— y no
hay hueco que agrandar, así que durante un tiempo los iconos siguieron con un
ojo localizador de código QR dibujado con aritmética, que sí estaba pensado para
ese tamaño.

**Eso cambió el 2026-09-24, y no por gusto.** Al pegar el enlace del sitio en un
chat, la tarjeta de vista previa salía con ese cuadro azul: no había `og:image`,
y el lector se quedaba con lo primero que encontraba, que era el icono de la
aplicación. El logotipo llevaba semanas en la portada y en el menú y era lo
único que no aparecía justo donde el enlace se comparte.

La tarjeta se arregla con su propia imagen —abajo—, pero dejar los iconos con
otro motivo habría sostenido dos marcas a la vez. Se unificaron. El trazo va en
blanco y no en su gris porque un icono se ve sobre el fondo de pantalla de cada
quien, y uno claro desaparece contra un papel tapiz claro.

Lo que se paga, dicho con el mismo metro que la tabla de arriba: a 48 px se lee
bien, y el favicon de 32 px queda en «se reconoce la silueta». Es el precio de
tener una sola marca, y se acepta a sabiendas.

## Lo que se dibuja solo

`bun run generar-iconos` saca seis imágenes del **original** —no del derivado de
512 px, que ampliar una reducción es lo que peor le sienta a un trazo fino—:

| Archivo                               | Tamaño     | Tratamiento                                   | Para qué                                              |
| ------------------------------------- | ---------- | --------------------------------------------- | ----------------------------------------------------- |
| `public/icons/icono-192.png`          | 192        | blanco sobre azul                             | Pantalla de inicio en Android                         |
| `public/icons/icono-512.png`          | 512        | blanco sobre azul                             | El grande del manifiesto                              |
| `public/icons/icono-maskable-512.png` | 512        | blanco sobre azul                             | Android lo recorta en círculo: el motivo va más chico |
| `public/icons/apple-touch-icon.png`   | 180        | blanco sobre azul                             | iOS ignora el manifiesto y usa este                   |
| `public/favicon.ico`                  | 32 y 48    | blanco sobre azul                             | La pestaña. Hasta ese día era un 404 en cada carga    |
| `public/og-encuentro.png`             | 1200 × 630 | trazo oscuro sobre blanco, franja azul al pie | La tarjeta del enlace en WhatsApp, Telegram, Slack    |

La tarjeta va en blanco con el trazo oscuro, al revés que los iconos, porque es
exactamente lo que se ve al abrir el sitio: quien reconoce la miniatura tiene
que reconocer la página al entrar. No lleva texto —aquí no hay con qué componer
tipografía— y no le hace falta: el título y la descripción los pone el propio
chat desde las etiquetas de la página.

Cambiar el motivo es cambiar `logo-encuentro-original.png` y volver a correr el
comando. No se editan los PNG a mano: un binario en git no se puede revisar,
nadie ve en un diff que alguien cambió el color.
