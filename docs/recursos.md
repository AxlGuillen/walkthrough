# Recursos

Piezas animadas que se declaran en el YAML con sus datos y sus palabras clave, y sirven igual en un demo, en documentación o en una entrega. Todas van al ritmo de la voz (`beats`), toman el acento, el tema (`theme`) y el idioma del tour, y funcionan en 16:9 y 9:16. El mecanismo está en `docs/arquitectura.md`, «Overlays»; los flujos tienen su propia guía en `docs/flujos.md`.

Para diseñar o revisar uno sin armar un tour:

```bash
bun run walkthrough overlay opening.html --params="title=Sunset Shores,style=brand" --beats="mark=0.3,title=1" --open
```

## Aperturas, capítulos y cierres

Tres plantillas, un estilo compartido:

| Plantilla | Para | Params | Beats |
|---|---|---|---|
| `opening.html` | Abrir el video | `eyebrow`, `title`, `subtitle`, `style`, `logo` | `mark`, `title`, `subtitle`, `reveal`, `out` |
| `chapter-card.html` | Separar partes | `index`, `total`, `title`, `eyebrow`, `style`, `logo` | `title`, `out` |
| `closing.html` | Cerrar, con la dirección | `title`, `subtitle`, `url`, `eyebrow`, `style`, `logo` | `mark`, `title`, `subtitle`, `url` |

Los tres estilos (`style`):

| Estilo | Cómo se ve | Cuándo |
|---|---|---|
| `kinetic` (por defecto) | Fondo propio; el título sube letra por letra, la línea de acento se dibuja y al salir el fondo sube y deja ver la app | Casi siempre; es el más legible |
| `over-app` | El título aparece sobre un fondo propio que luego se retira hacia la izquierda y deja ver la primera pantalla, con un velo detrás del texto | Cuando la primera pantalla es vistosa (una foto, un hero) y conviene mostrarla desde el inicio |
| `brand` | Centrado: el logo entra con un anillo que se dibuja, luego el nombre | Proyectos con marca propia; `logo` es una imagen de la carpeta del tour (sin ella, un monograma con la inicial) |

Usa el mismo estilo en la apertura, los capítulos y el cierre de un video.

```yaml
- say: Esta es Sunset Shores, un microsite de resort hecho en UrVenue.
  do:
    - goto: /
  overlays:
    - src: opening.html
      params: { style: kinetic, eyebrow: UrVenue · Resort microsite, title: Sunset Shores, subtitle: Un recorrido guiado }
      beats: { title: Sunset, subtitle: microsite }
```

### Cómo escribirlas

- **La apertura dura su frase.** Sin `out`, sale 0,8 s antes de que termine el overlay; con `kinetic` el fondo sube después y deja ver la app. Pon `out` solo si la frase sigue hablando de la app ya visible.
- **Entre `title` y `out`, por lo menos 1,5 s**, para que el título se lea. Entre `reveal` y `out` (`over-app`), otro segundo: el velo tarda 0,9 s en retirarse.
- **`title` en la palabra que nombra al proyecto** y `subtitle` unas palabras después. En `brand`, `mark` va antes que `title`.
- **Títulos cortos:** caben unas 15 letras por línea antes de partirse. `eyebrow` es una línea en mayúsculas pequeñas: el cliente o el tipo de proyecto.
- **El cierre no sale**: se queda hasta el final. Dale un `hold` al último segmento para que se lea (5 s va bien) y su `url` en una palabra de la frase.
- **Los capítulos** duran lo que su frase; `index` y `total` se muestran con dos dígitos («02 / 05»).

Ejemplos de los tres estilos en `tours/examples/aperturas.yaml`.
