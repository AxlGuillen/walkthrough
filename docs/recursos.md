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
| Una lista de pendientes que se escribe y se va tachando | `board.html` (pizarrón) |
| Ideas, temas o pendientes sueltos, sin orden | `corkboard.html` (notas en un corcho) |
| Señalar algo que ya está en la pantalla | No es un recurso: `highlight` (con su `style`, ver «Resaltar») o `label` |
| Que la app se vea dentro de un navegador, una laptop o un teléfono | `frame:` en el tour (ver «Marco de dispositivo») |
| Darle profundidad al recorrido, ver la app desde un ángulo | `shot:` en el segmento (ver «Planos») |
| Explicar algo con texto junto a la app, sin taparla | `aside:` en el segmento (ver «Aparte») |
| Un proceso explicado mientras la app lo hace | Un flujo con `mode: aside` (`docs/flujos.md`, «Modos») |
| Títulos con más carácter | `typeface: editorial` en el tour (ver «Tipografía») |
| Que los cambios de pantalla se vean distintos a la disolvencia | `transition:` en el tour o el segmento (ver «Transiciones») |
| Un texto corto encima de la app | `lower-third.html`; un atajo de teclado, `shortcut.html`; dos capturas lado a lado, `compare.html` |
| Subrayar un momento («¡Listo!») | `sticker.html`, un emoji con un texto breve |
| Que el video se vea del proyecto | `brand:` y `texture:` en el tour (ver «Marcas» y «Texturas») |

Un recurso dice algo que la app no muestra por sí sola. Uno por frase, y no más de uno o dos seguidos antes de volver a la app.

## Probar y revisar

- **Un recurso suelto**, para diseñarlo sin armar un tour:

  ```bash
  bun run walkthrough overlay opening.html --params="title=Sunset Shores,style=brand" --beats="mark=0.3,title=1" --open
  ```

- **El catálogo completo** (`tours/examples/catalogo.yaml`, sin voz): todos los recursos y sus variantes en una pasada, con un video y una hoja de contacto (un cuadro por recurso) en `<caché>/catalog/` (ver `docs/arquitectura.md`). Tarda unos 4 minutos por formato.

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

## Pizarrón

`board.html` es una lista en un pizarrón colgado en la pared: cada renglón se escribe a mano en su palabra (`at`), con un cuadrito antes, y se tacha y se palomea en otra (`done`). Es una escena con profundidad (ver «Escenas con profundidad»).

```yaml
- say: Esta semana había tres pendientes. La nómina ya quedó, el perfil también, y el filtro de vencidas sigue en revisión.
  overlays:
    - src: board.html
      data:
        title: Pendientes de la semana
        items:
          - { text: Nómina por corte, at: tres, done: quedó }
          - { text: Mi perfil, at: perfil, done: también }
          - { text: Filtro Vencida, at: filtro }
```

| `style` | Cómo se ve |
|---|---|
| `chalk` (por defecto) | Pizarrón verde con marco de madera, escrito con gis que se rompe un poco |
| `white` | Pizarrón blanco con marco de aluminio, escrito con plumón azul y tachado en rojo |

- **De 1 a 7 renglones, cortos:** unas 3 o 4 palabras. Un título largo se encoge hasta caber; `check` avisa si queda muy chico o si un renglón no cabe.
- **La mano escribe a unas 16 letras por segundo.** Deja aire entre un renglón y el siguiente: `check` avisa si uno empieza mientras el otro sigue escribiéndose, si algo se tacha antes de escribirse o si el pizarrón se va antes de terminar.
- **Tachar es lo importante:** dilo con la voz («ya quedó»), y deja sin `done` lo que sigue pendiente.

## Corcho

`corkboard.html` clava notas de papel en un corcho, cada una en su palabra (`at`): caen desde cerca de la cámara con una sombra larga, se asientan y les entra la chinche. Cada nota lleva `text` y, si hace falta, `detail`, `emoji` y `color` (`yellow`, `pink`, `blue`, `green`, `white`; sin color se alternan).

```yaml
- say: Para la próxima entrega hay cuatro ideas. Planos de cámara, transiciones, un pizarrón y notas como estas.
  overlays:
    - src: corkboard.html
      data:
        title: Ideas para la próxima entrega
        notes:
          - { text: Planos de cámara, emoji: sparkles, at: Planos }
          - { text: Transiciones, detail: push · flip · fly, at: transiciones }
          - { text: Un pizarrón que se tacha, at: pizarrón }
          - { text: Notas en un corcho, emoji: pushpin, at: notas }
```

- **De 1 a 6 notas,** de pocas palabras. `check` avisa si una no cabe en su papel.
- **Para cosas sin orden.** Si tienen orden o fecha, es una línea de tiempo; si se van cumpliendo, un pizarrón.

## Escenas con profundidad

El pizarrón y el corcho no son tarjetas planas: cuelgan en una pared con el fondo del tour, con marco, luz desde arriba, sombra proyectada y piezas a distintas distancias (la repisa del pizarrón, las notas y sus chinches). La cámara entra desde un ángulo más abierto y deriva despacio mientras están en pantalla, así lo cercano se mueve más que lo lejano.

- **Una por sección, como interludio.** Tapan la app, como una gráfica a pantalla completa.
- **Cuestan render:** unas dos o tres veces lo de una tabla por segundo en pantalla.
- **Letras vendorizadas:** Permanent Marker (plumón: pizarrón blanco, título del corcho) y Kalam (a mano: gis, con su filtro, y notas), en `templates/overlays/vendor/fonts/`. Se ven igual en macOS y Windows; las plantillas las piden con `var(--marker)` y `var(--hand)`.

Ejemplos de los tres en `tours/examples/catalogo.yaml`.

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

## Planos

`shot:` mueve la cámara sobre toda la grabación: la encoge y la inclina dentro de un escenario con el fondo del tour (su tema, textura y marca), con sombra y esquinas redondeadas. Se escribe en `do`, con su palabra como cualquier acción:

| `shot` | Cómo se ve |
|---|---|
| `flat` | De frente, a pantalla completa: la grabación tal cual |
| `wide` | De frente, un poco más chica, con el escenario alrededor |
| `left` / `right` | Girada: el lado izquierdo (o el derecho) queda más cerca |
| `top` | Inclinada hacia atrás, como vista desde arriba |

```yaml
- say: Equipo reúne a todas las personas, con su rol, su jornada y su número del checador.
  do:
    - shot: { to: left, at: Equipo }
- say: Y abajo, los días feriados del equipo.
  do:
    - highlight: { on: '[data-tour=team-excused]', at: feriados }   # ya de frente
```

`angle` (de 3° a 12°, 8° por defecto) inclina `left`, `right` y `top`; `duration` (1,2 s por defecto) es lo que tarda en llegar. Un plano dura hasta el siguiente.

### Cómo escribirlos

- **De frente para leer.** Antes de cada `highlight`, `label`, `click` o `type`, la cámara se endereza sola y se queda de frente hasta el siguiente plano. Un plano luce en una frase que habla de la pantalla en general; la marca llega después, ya de frente.
- **Con aire.** Entre el plano y la primera marca, por lo menos 2,5 s: 1,2 para llegar, uno para verse y 0,8 para enderezarse. `check` avisa si no alcanza.
- **6° a 8°.** Se lee igual que de frente; 12° ya se siente inclinado. Uno o dos planos por sección, no uno por frase.
- **Sin `frame` por ahora:** el schema rechaza un tour con planos y marco.
- **Cuesta render:** cada segundo fuera de frente es un pase más del navegador; de frente no cuesta nada.

Ejemplo de los cinco en `tours/examples/planos.yaml`.

## Aparte

`aside:` en un segmento hace sitio en el escenario: la pantalla se corre a un lado (o baja, bajo un título) y en el espacio que deja entran un eyebrow, un título y hasta cuatro puntos, cada uno en su palabra. Al terminar, el texto sale y la pantalla vuelve sola a pantalla completa. Es un plano y un overlay (`aside.html`) coordinados por las mismas palabras.

| `layout` | La pantalla | El texto |
|---|---|---|
| `aside-left` (por defecto) | A la izquierda, al 60 %, girada 4° hacia el texto | A la derecha |
| `aside-right` | A la derecha | A la izquierda |
| `inset` | Abajo, inclinada hacia atrás como foto de producto | Arriba, centrado: un título, sin puntos |

En 9:16, `aside-left` y `aside-right` ponen la pantalla arriba y el texto abajo.

```yaml
- say: Every frame is placed, not recorded. A virtual camera, a scroll planned ahead, and marks that follow the page.
  aside:
    at: placed
    until: page              # por defecto, el fin del segmento
    eyebrow: The camera
    title: Every frame is *placed*, not recorded
    points:
      - { text: A virtual camera, emoji: eyes, at: camera }
      - { text: Smooth scroll ahead of time, at: scroll }
      - { text: Marks that follow the page, emoji: pushpin, at: marks }
```

- ***Palabras entre asteriscos*** van en cursiva y en el color de acento (con `typeface: editorial`; en Inter, solo en el acento). Una o dos por título.
- **De lado se lee:** con `aside-left` o `aside-right` la pantalla no se endereza antes de un `highlight`, así que puedes resaltar algo mientras el texto lo explica. `inset` sí se endereza.
- **Una entrada desde fuera del cuadro:** `shot: { to: away, duration: 0.4, at: 0 }` al inicio deja el escenario vacío y el `inset` siguiente sube la pantalla a su sitio, bajo el título. Así abre `tours/examples/aparte.yaml`.
- **Uno por sección, no dos seguidos:** entre dos `aside` la pantalla vuelve a pantalla completa y se aparta otra vez. Si quieres dos ideas juntas, ponlas en un solo `aside` con puntos.
- `check` avisa si el título no cabe, si hay más texto que espacio o si un punto llega tarde para leerse. Sin `frame` por ahora, como los planos.

## Tipografía

`typeface: editorial` en el tour pone los títulos (aperturas, capítulos, cierres, apartes, gráficas, tablas…) en **Instrument Serif**, una serif de exhibición (OFL, en `templates/overlays/vendor/fonts/`). El texto corrido sigue en Inter. Por defecto, `system`, que es **Inter** (el nombre se queda por compatibilidad). Sirve para videos con tono de presentación; para entregas de trabajo, Inter es más neutra.

La letra de todos los recursos es **Inter**, y el código va en **JetBrains Mono**, con su cursiva para los comentarios. Las dos son OFL y están vendorizadas en `templates/overlays/vendor/fonts/`, así un video sale igual en macOS y en Windows; las plantillas las piden con `var(--font)` y `var(--mono)`. Reemplazaron a SF Pro y SF Mono, que no se pueden usar fuera de equipos Apple y en Windows salían en Arial y Consolas.

## Transiciones

`transition:` decide cómo un cambio de pantalla (un `goto` después del inicio o un `click` con `wait`) da paso al siguiente. Va en el tour, para todo el video, o en un segmento, para los cambios de ese segmento:

| `transition` | Cómo se ve |
|---|---|
| `dissolve` (por defecto) | La pantalla vieja se desvanece sobre la nueva, 0,5 s |
| `cut` | Corte seco, sin transición: para cuando el guion pide cortar |
| `push` | La vieja sale por la izquierda y la nueva entra por la derecha, un poco más chicas a medio camino |
| `flip` | Gira como una tarjeta y aterriza en la nueva |
| `fly` | La vieja se aleja y se apaga; la nueva llega de más cerca |

Las tres del escenario duran 0,8 s, toman el fondo del tour y respetan el plano en que esté la cámara.

- **Una por video, o una para las secciones.** `push` es la más tranquila para un recorrido; `flip` y `fly` marcan un cambio de tema (al entrar a un módulo). Todas iguales cansan menos que alternarlas.
- **Nada de marcas en los 0,8 s después del cambio:** la auditoría lo avisa.
- **Solo donde cambia la página.** Un clic con `wait` que abre un panel o avanza un paso en la misma página no lleva transición del escenario: el escenario solo dibuja las navegaciones que la captura registró.
- **Sin `frame` por ahora,** como los planos.

Ejemplo de las cuatro en `tours/examples/transiciones.yaml`.

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
