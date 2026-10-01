# Recursos

Piezas animadas que se declaran en el YAML con sus datos y sus palabras clave, y sirven igual en un demo, en documentación o en una entrega. Todas van al ritmo de la voz (`beats`), toman el acento, el tema (`theme`) y el idioma del tour, y funcionan en 16:9 y 9:16. El mecanismo está en `docs/arquitectura.md`, «Overlays»; los flujos tienen su propia guía en `docs/flujos.md`.

## Qué recurso usar

| Quiero… | Recurso |
|---|---|
| Abrir el video, separar sus partes, cerrarlo | `opening.html`, `chapter-card.html`, `closing.html` (un mismo `style` en los tres) |
| Explicar un proceso con pasos, quién hace qué, antes/después de un proceso | Un flujo (`flow:` en el segmento; `docs/flujos.md`) |
| Comparar cantidades entre categorías | `chart.html` con `type: bar` |
| Mostrar cómo evolucionó algo en el tiempo | `chart.html` con `type: line` |
| Una parte de un total (ocupación, avance) | `chart.html` con `type: donut` |
| Una cifra que impresione | `chart.html` con `type: stat` |
| El cambio entre dos cifras («de 45 a 3 min») | `chart.html` con `type: compare` |
| Enseñar código, un comando o un cambio | `code.html` con `view: editor`, `terminal` o `diff` |
| Comparar opciones, planes o un antes y después punto por punto | `table.html` |
| Un plan, una historia o el avance de un proyecto por hitos | `roadmap.html` |
| Señalar algo que ya está en la pantalla | No es un recurso: `highlight` (con su `style`, ver «Resaltar») o `label` |
| Que la app se vea dentro de un navegador, una laptop o un teléfono | `frame:` en el tour (ver «Marco de dispositivo») |
| Un texto corto encima de la app | `lower-third.html`; un atajo de teclado, `shortcut.html`; dos capturas lado a lado, `compare.html` |
| Subrayar un momento («¡Listo!») | `sticker.html`, un emoji con un texto breve |
| Que el video se vea del proyecto | `brand:` y `texture:` en el tour (ver «Marcas» y «Texturas») |

Un recurso dice algo que la app no muestra por sí sola. Uno por frase, y no más de uno o dos seguidos antes de volver a la app.

## Probar y revisar

- **Un recurso suelto**, para diseñarlo sin armar un tour:

  ```bash
  bun run walkthrough overlay opening.html --params="title=Sunset Shores,style=brand" --beats="mark=0.3,title=1" --open
  ```

- **El catálogo completo** (`tours/examples/catalogo.yaml`, sin voz): todos los recursos y sus variantes en una pasada, con un video y una hoja de contacto (un cuadro por recurso) en `~/Library/Caches/walkthrough/catalog/`. Tarda unos 4 minutos por formato.

  ```bash
  bun run walkthrough catalog --device=both --open
  ```

  Al cambiar una plantilla o agregar un recurso, agrega su ejemplo al catálogo y revisa las hojas antes del commit. Una prueba de `verify` comprueba que cada entrada sea válida y quepa en 16:9 y 9:16.
- **Ejemplos narrados**, con voz y un sitio de fondo: `tours/examples/aperturas.yaml`, `graficas.yaml`, `codigo.yaml` y `flujos.yaml`. Sin voz, sobre un sitio: `resaltar.yaml` (los ocho estilos de resaltar) y `marco.yaml` (el marco de dispositivo).
- **La skill `recursos`** del repo guía cómo elegirlos, escribirlos y revisarlos.

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

## Gráficas

Una plantilla, `chart.html`, con los datos en `data`. Node los valida al cargar el tour (un dato mal escrito falla antes de renderizar, diciendo cuál) y calcula la escena: escala con números redondos, posiciones, textos que caben y números en formato de México (`es`) o de EE. UU. (`en`). La plantilla solo dibuja y anima.

| `type` | Para | Datos |
|---|---|---|
| `bar` | Comparar cantidades entre categorías | `series` (1–12 `{ label, value, at }`), `highlight` (una etiqueta, en el color de acento) |
| `line` | Una evolución en el tiempo | `series` (2–24 puntos) |
| `donut` | Una parte de un total | `label`, `value`, `total` (100 por defecto), `at` |
| `stat` | Una cifra que impresiona | `label`, `value`, `from` (desde dónde cuenta; 0), `at` |
| `compare` | Antes y después | `before` y `after` (`{ label, value, at }`); muestra el cambio («−93%») |

Todas aceptan `title`, `unit` («min», «%», «MXN»; un símbolo va pegado al número y una palabra con espacio), `prefix` («$»), `decimals` y `mode` (`full`, que tapa la app, o `card`, un panel sobre la mitad derecha en 16:9 y la inferior en 9:16).

```yaml
- say: El lunes hubo pocas reservas, el viernes subieron, y el sábado fue el mejor día.
  overlays:
    - src: chart.html
      data:
        type: bar
        title: Reservas por día
        highlight: Sáb
        series:
          - { label: Lun, value: 42, at: lunes }
          - { label: Mar, value: 38 }
          - { label: Vie, value: 128, at: viernes }
          - { label: Sáb, value: 163, at: sábado }
```

### Cómo escribirlas

- **`at` en los puntos que la voz nombra.** Los demás se reparten solos entre sus vecinos, en orden, como los pasos de un flujo. Sin ningún `at`, las barras entran en cascada y la línea se dibuja de punto en punto.
- **La cifra cuenta mientras se dice.** Pon el `at` de un `stat` o una `donut` en la palabra que la presenta («este mes **llevamos**…»), no en el número dicho, que llega tarde.
- **En una comparación**, `before` y `after` en sus palabras («**Antes**… **Ahora**…»), con por lo menos un segundo y medio entre ellas: la primera cifra cuenta, la flecha se dibuja y luego cuenta la segunda.
- **Etiquetas cortas** en las series (hasta 24 letras; «Lun», «S1», «Vera»); si no caben en su espacio se cortan con «…». `label` de una dona o una cifra puede ser una frase.
- **Datos reales o marcados como ejemplo.** Una gráfica de un video para cliente usa cifras que se pueden respaldar.

Ejemplos de los cinco tipos en `tours/examples/graficas.yaml`.

## Código

Una plantilla, `code.html`, con el código en `data`. Node lo valida, lo colorea (un resaltador propio en `src/code/highlight.ts`, sin dependencias: TypeScript/JavaScript, JSON, YAML, shell, CSS, SQL, HTML y Python) y calcula el tamaño de letra para que todo quepa.

| `view` | Para | Cómo se escribe `code` |
|---|---|---|
| `editor` (por defecto) | Un archivo, con números de línea | El código tal cual |
| `terminal` | Comandos y su salida | Las líneas con `$ ` son comandos que se escriben solos; las demás, su salida |
| `diff` | Qué cambió | Cada línea empieza con `+`, `-` o un espacio (usa `code: \|2` para que YAML respete el espacio inicial) |

Otros campos: `language` (el editor y el diff), `file` o `title` (la barra de la ventana), `reveal` (`lines`, por defecto; `type`, que lo teclea; `all`), `run` (las palabras en que empieza cada comando de una terminal), `highlight` y `mode` (`full` o `card`).

`highlight` es una lista de líneas que señalar, cada una en su palabra y con una nota corta que aparece en la barra de la ventana: `{ lines: "5-8", at: cupo, note: Revisa el cupo }`. Las líneas se cuentan como las ve el espectador, desde 1 (`3`, `"3-5"` o `"3-5, 8"`). Mientras una está activa el resto se atenúa; en código de más de 14 líneas la cámara se acerca a ella sin que ninguna línea salga por la derecha.

```yaml
- say: Primero revisa que la mesa tenga cupo, y si lo tiene, la aparta para el huésped.
  overlays:
    - src: code.html
      data:
        language: ts
        file: src/api/reservations.ts
        code: |
          const taken = await db.count('reservations', { table: table.id });
          if (taken >= table.capacity) throw new Error('This table is full');
          return db.insert('reservations', { guest: guest.id, table: table.id });
        highlight:
          - { lines: "1-2", at: cupo, note: Revisa el cupo }
          - { lines: 3, at: aparta, note: Aparta la mesa }
```

### Cómo escribirlo

- **Poco código.** Lo que la voz alcanza a explicar: hasta unas 20 líneas en 16:9 y 12 en 9:16. Las líneas, de hasta ~90 caracteres en 16:9 y ~70 en 9:16; más largas encogen la letra y `check` avisa. Recorta imports y lo que no se nombra.
- **Una nota por resaltado, de pocas palabras:** qué hace esa parte, no cómo.
- **Los comandos se teclean a unas 22 letras por segundo** y el código con `reveal: type` a unas 38. `check` avisa si el overlay termina antes de que acabe de escribirse; alarga la frase, dale un `hold` o escribe menos.
- **Resaltados con aire:** por lo menos un segundo entre uno y otro, y el último no en el último segundo del overlay.
- **Las notas con comas van entre comillas** en YAML (`note: "1,200 px/s como máximo"`).
- **Código real o marcado como ejemplo**, sin claves ni datos de clientes.

Ejemplos de las tres vistas en `tours/examples/codigo.yaml`.

## Tablas

`table.html` compara opciones en una tabla: columnas, filas y, en cada celda, `yes` (✓), `no` (✕), `partial` (una raya) o un texto corto. Las marcas se dibujan como trazos cuando entra su fila. También valen `true` y `false`, y los números se muestran tal cual.

```yaml
- say: Con Excel no hay video ni se actualiza solo. Con walkthrough sí, y cada demo toma diez minutos.
  overlays:
    - src: table.html
      data:
        title: Antes y ahora
        columns: [Excel, Walkthrough]
        highlight: Walkthrough
        rows:
          - { label: Video narrado, values: [no, yes], emoji: microphone, at: video }
          - { label: Se actualiza solo, values: [no, yes], at: actualiza }
          - { label: Tiempo por demo, values: [3 h, 10 min], at: diez }
```

- **`highlight`** destaca una columna (la del producto, el plan recomendado) con una banda del color de acento. Tiene que ser una de `columns`.
- **Hasta 6 columnas y 8 filas** en 16:9, y 3 columnas en 9:16; `check` avisa si una columna, una fila o una celda no caben. Etiquetas cortas: una fila de hasta ~24 letras y una celda de una o dos palabras.
- **`at` en la palabra que nombra cada fila.** Las que no lo tienen entran solas detrás de la anterior.
- `emoji` por fila y `mode: card` (un panel sobre la mitad derecha en 16:9 y la inferior en 9:16), como en las gráficas.

## Líneas de tiempo

`roadmap.html` pone hitos en una línea que se dibuja de uno al siguiente, al ritmo de la voz: horizontal en 16:9 y vertical en 9:16. Cada hito lleva `title` y, si hace falta, `date`, `detail`, `emoji` y `status`:

| `status` | Cómo se ve |
|---|---|
| `done` (por defecto) | Un nodo lleno del color de acento |
| `now` | Lleno, con un pulso y la etiqueta «Hoy» («Now» en inglés) |
| `next` | Un nodo hueco, con el texto atenuado y la línea que llega a él más tenue |

```yaml
- say: Empezamos en enero con el primer tour, en marzo llegó la voz, y hoy estamos en los recursos animados.
  overlays:
    - src: roadmap.html
      data:
        title: Hacia la versión 2
        milestones:
          - { date: Ene, title: Primer tour, emoji: rocket, at: enero }
          - { date: Mar, title: Voz y subtítulos, emoji: microphone, at: marzo }
          - { date: Jun, title: Recursos animados, emoji: sparkles, status: now, at: hoy }
          - { date: Sep, title: Marcos y tablas, emoji: laptop, status: next }
```

- **De 2 a 7 hitos**, uno `now` como mucho. Títulos de hasta ~3 palabras y `detail` de una frase corta; `check` avisa si un título pasa de dos líneas o un detalle de tres.
- **`at` en la palabra que nombra cada hito.** La línea llega a él justo en ese momento.
- `mode: card` deja la app arriba (16:9) o encima del panel (9:16).

## Resaltar

`highlight` señala un elemento de la app con uno de ocho estilos. `highlightStyle:` en el tour pone el de todo el video y cada `highlight` puede cambiarlo:

| `style` | Para |
|---|---|
| `ring` (por defecto) | Un recuadro a mano alzada, para casi todo |
| `circle` | Un óvalo a pluma, para un dato o un ícono |
| `underline` | Un subrayado bajo cada línea del texto |
| `marker` | Un resaltador translúcido sobre cada línea, amarillo por defecto |
| `box` | Un rectángulo limpio, de líneas rectas |
| `brackets` | Cuatro esquinas, para un bloque grande |
| `spotlight` | Oscurece todo lo demás, para lo más importante |
| `arrow` | Una flecha que llega desde el lado con espacio; `side: top \| left \| bottom \| right` la fuerza |

```yaml
- highlight: { on: 'h1', at: mejor, style: marker }
- highlight: { on: 'a:has-text("Check availability")', at: disponibilidad, style: box, color: green }
```

`color` es `accent` (por defecto, salvo en `marker`), `yellow`, `green`, `red`, `blue`, `white` o un `#hex`. Varía el estilo según lo que se señala, no por variar: un video usa dos o tres. `spotlight` no hace sonido; los demás, el de dibujar.

## Marco de dispositivo

`frame:` en el tour mete la grabación en un dispositivo, sobre el fondo del tour (su tema, textura y marca):

| `frame` | Graba la app como | Para |
|---|---|---|
| `none` (por defecto) | El formato del video | La app a pantalla completa |
| `browser` | Escritorio | Una ventana con la barra y el dominio del tour |
| `laptop` | Escritorio | Un portafolio o una presentación |
| `phone` | Teléfono (emulado) | Un sitio móvil, también en un video 16:9 |

`device` sigue decidiendo el formato del video, así que `device: desktop` con `frame: phone` da un teléfono al centro de un video 16:9, y `device: mobile` con `frame: laptop`, una laptop en un video vertical. Las marcas, el cursor y el zoom quedan dentro de la pantalla; los overlays y los subtítulos, encima de todo el cuadro.

La pantalla ocupa menos que el video, así que la app se ve más chica: con `frame`, acércate (`zoom`) a lo que se nombra. Una laptop o un navegador en un video vertical son para mostrar el sitio, no para leerlo.

## Marcas

Cada proyecto con identidad propia tiene su carpeta en `assets/brands/<marca>/`: `brand.yaml`, sus logos y `FUENTE.md` (de dónde salió y dónde se puede usar).

```yaml
title: Entrega semana 40
brand: dymmsa        # acento, tema y textura de la marca; el tour puede cambiar cualquiera
watermark: true      # el isotipo en una esquina durante el recorrido
```

| Marca | Acento | Textura | Uso |
|---|---|---|---|
| `4xl` | Lima #D9F24A | `grain` | Tus videos y tu portafolio |
| `urvenue` | Morado #9646D8 (degradado a azul) | `brand` | Solo videos internos o de productos de UrVenue |
| `dymmsa` | Rojo #DC2626 | `lines` | Solo videos para DYMMSA |

Con `brand`, las aperturas y el cierre muestran el logo sobre el eyebrow (en `style: brand`, al centro y en grande), el fondo oscuro toma el color de la marca y la marca de agua aparece entre la apertura y el cierre. Los capítulos no repiten el logo.

**Agregar una marca:** su carpeta con `brand.yaml` (`name`, `accent`, `colors` (dos), `theme`, `texture`, `logo` y/o `mark`; cada imagen puede ser una sola o `{ dark, light }`), los archivos, preferentemente SVG o PNG/WebP con fondo transparente y sin márgenes, y `FUENTE.md`. Logos de terceros solo con su permiso y en su contexto.

## Texturas

`texture:` en el tour (o la de su marca) da textura a todo fondo propio: aperturas, capítulos, cierres, flujos, gráficas y código a pantalla completa. Se dibujan con CSS, sin imágenes.

| `texture` | Cómo se ve |
|---|---|
| `plain` (por defecto) | El degradado del tema |
| `grain` | Grano fino, como papel |
| `dots` | Una retícula de puntos |
| `lines` | Líneas diagonales finas |
| `mesh` | Dos manchas suaves del color de acento |
| `brand` | Dos manchas con los dos colores de la marca |

Una textura por video. `grain` y `dots` son las más discretas; `mesh` y `brand`, las más vistosas, para aperturas de marca.

## Emojis

Fluent Emoji de Microsoft (MIT), una selección de 71 en `templates/overlays/vendor/fluent-emoji/`; la lista con su glifo está en `index.json`. Se escriben por nombre (`rocket`, `check-mark-button`, `party-popper`…); un nombre que no existe falla al cargar el tour y sugiere los parecidos. `emojiStyle: 3d` en el tour usa la versión 3D; por defecto, la Color (vectorial).

Dónde van:

| Dónde | Cómo |
|---|---|
| Un paso de un flujo | `{ text: Se entrega, emoji: rocket, at: … }`, en lugar del número |
| Una cifra o una comparación | `emoji:` en el `data` del `stat` o el `compare` |
| Apertura, capítulo, cierre | `params: { emoji: bar-chart }`, sobre el logo y el eyebrow |
| Subrayar un momento | `sticker.html` con `params: { emoji, text, position }` y `beats: { in: … }` |

```yaml
overlays:
  - src: sticker.html
    params: { emoji: party-popper, text: ¡Listo!, position: top-right }
    beats: { in: listo }
```

### Cómo usarlos

- **Pocos y con sentido:** uno por recurso, que diga lo mismo que el texto (📈 en «subió», 🔒 en «seguro»). Nada de emojis de adorno.
- **Un sticker por momento importante,** no uno por frase. Dura lo que su frase y sale solo.
- **Mismo estilo en todo el video:** Color o 3D, no los dos.
- **Agregar uno:** sigue `templates/overlays/vendor/fluent-emoji/AVISO.md`.
