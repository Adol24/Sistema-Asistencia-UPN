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

## Dónde se usa, y dónde no

Va en dos sitios:

| Dónde | Tamaño | Para qué |
| --- | --- | --- |
| Portada del pre-registro (`/bienvenida`) | 96 px · 128 px de `lg:` | Es la primera pantalla que alguien ve |
| Cabecera de la ficha del comprobante (`/comprobante`) | 64 px | Es el papel que la persona lleva a ventanilla |

En el comprobante no es adorno: la barra superior, el pie y el riel son los tres
`print:hidden`, y entre los tres se llevaban el nombre del encuentro. Impreso
quedaba «Comprobante de pre-registro» y una ficha con un nombre, un folio y un
QR —ni el evento, ni el año, ni las fechas—. La cabecera lleva el logotipo, el
nombre y las fechas, así que el papel se identifica solo.

**No va en la barra superior ni en los iconos de la aplicación instalable.** Son
tres puños alrededor de un globo trazados a línea fina: a 28 px —el hueco de la
barra— no se distingue ninguna de las tres formas y queda un borrón gris que
parece un fallo de carga. A 64 px se empieza a leer y a 128 px se entiende. La
barra y los iconos siguen con el ojo localizador de QR que dibuja
`scripts/generar-iconos.ts`, que sí está pensado para tamaños pequeños.
