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

| Dónde | Tamaño | Para qué |
| --- | --- | --- |
| Portada del pre-registro (`/bienvenida`) | 96 px · 128 px de `lg:` | Es la primera pantalla que alguien ve |
| Cabecera de la ficha del comprobante (`/comprobante`) | 64 px | Es el papel que la persona lleva a ventanilla |
| Barra superior pública (`BarraPublica`) | 36 px · 40 px de `lg:` | Acompaña todo el flujo, junto al nombre del evento |

En el comprobante no es adorno: la barra superior, el pie y el riel son los tres
`print:hidden`, y entre los tres se llevaban el nombre del encuentro. Impreso
quedaba «Comprobante de pre-registro» y una ficha con un nombre, un folio y un
QR —ni el evento, ni el año, ni las fechas—. La cabecera lleva el logotipo, el
nombre y las fechas, así que el papel se identifica solo.

## El tamaño mínimo, que es la regla que gobierna todo lo de arriba

Son tres puños alrededor de un globo trazados a línea fina. Medido:

| Tamaño | Cómo se ve |
| --- | --- |
| 28 px | Borrón gris. No se distingue ninguna de las tres formas |
| 36 px | Se reconoce la silueta |
| 40 px | Se distinguen los puños y el globo |
| 48 px | Se lee bien |
| 64 px y más | Se entiende el dibujo completo |

**Por debajo de 36 px no se pone.** La barra superior tenía un hueco de 28 px y
la respuesta no fue meter el logotipo encogido, sino agrandar el hueco: cambiar
un cuadro azul que al menos se veía por un borrón gris no habría sido una
mejora.

Que se lea mejor no es lo mismo que que quede mejor. En la barra estuvo un rato
a 40/48 y se veía más nítido, pero pesaba más que el nombre del encuentro que
lleva al lado: es una barra de utilidad, no una cabecera de marca, y ahí el
logotipo acompaña. Bajó a 36/40. En la portada y en el comprobante manda la
legibilidad, porque el logotipo sí es lo primero que se mira.

**No va en los iconos de la aplicación instalable.** Ahí el sistema operativo
manda el tamaño —48 px y menos en la pantalla de inicio— y no hay hueco que
agrandar. Siguen con el ojo localizador de QR que dibuja
`scripts/generar-iconos.ts`, que sí está pensado para eso.
