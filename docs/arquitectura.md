# Arquitectura

Decidida el 28/sep/2026. Complementa a `docs/arranque.md` (qué y para qué); aquí va el cómo.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto sobre **Node 24** | Node 24 ejecuta `.ts` directo (type stripping): sin paso de build. |
| Paquetes | Bun (`bun install`, `bun run`, `bun.lock`) | Instala y corre los scripts rápido. No es el runtime: los scripts llaman a `node`, y Vitest corre sobre Node. |
| Versión de Node | `fnm` + `.node-version`, con `FNM_ARCH=arm64` | Node 24 solo para este repo; el Node global de los otros proyectos no se toca. Sin `FNM_ARCH`, un fnm de Homebrew Intel baja Node x64 y corre en Rosetta. |
| Navegador | `playwright-core` con el Chrome del sistema (`channel: 'chrome'`) | Emulación de dispositivos, perfiles persistentes, locators, `boundingBox()`, control del reloj. No descarga navegadores. |
| Tours | YAML (`yaml`) validado con `zod` | Cómodo de revisar a mano; zod da errores claros y los tipos salen del esquema. |
| Voz | Adaptador Fish Audio + caché en disco | Un cambio de cámara no vuelve a pedir la voz. |
| Montaje | `ffmpeg` / `ffprobe` del sistema | Llamados directo con `execFile`, sin wrappers. |
| Código en la página | Funciones TypeScript autocontenidas que Playwright serializa (`addInitScript`) | Sin build ni CDN. Si algún día necesita módulos o dependencias, se empaqueta con esbuild. |
| Pruebas | Vitest | Lógica pura sin navegador; integración contra una página fixture local. |
| CLI | `node:util` `parseArgs` | Pocos comandos, cero dependencias. |

**Restricción del type stripping:** solo sintaxis borrable. Nada de `enum`, `namespace` ni parameter properties; imports con extensión `.ts` e `import type` para tipos. `tsconfig` lo impone con `erasableSyntaxOnly` y `verbatimModuleSyntax`.

## Pipeline

```
tour.yaml ──┐
            ├─► timeline ─► capture ─► compose ─► video.mp4
voice ──────┘   (pure)      frames     ffmpeg
```

| Etapa | Entrada | Salida en la carpeta de trabajo del tour | ¿Pura? |
|---|---|---|---|
| **voice** | narración de cada segmento | `voice/NN.wav` + `voice/NN.json` (palabras) | No: red, con caché |
| **timeline** | tour + resultado de voz | `timeline.json` | **Sí** |
| **capture** | timeline + sesión | `capture.mp4` (solo video, a tamaño de salida) | No: navegador |
| **overlays** | timeline + HTML de overlays | `overlays/` (cuadros con alfa) | No: navegador |
| **stage** | timeline + `capture.mp4` | `stage/NN.mp4`, solo los tramos con la cámara fuera de frente | No: navegador; el plan es puro |
| **compose** | todo lo anterior | `video.mp4` | No: ffmpeg; los argumentos se construyen con funciones puras |

Cada etapa lee solo archivos de la anterior, así que se puede repetir por separado. Cambiar un overlay repite `overlays` y `compose`, sin volver a entrar a la app.

**Etapas en paralelo.** `overlays` no necesita la captura, así que corre al mismo tiempo que `capture`, en los núcleos que deja libres el Chrome de la captura, ocupado en uno solo. `stage` sí la necesita y arranca en cuanto termina, aunque los overlays sigan. Si una etapa falla, las demás se detienen en el siguiente cuadro (`together`, en `src/cli/parallel.ts`). Ver «Rendimiento».

## Almacenamiento

Nada generado vive en el repo. Cada sistema tiene su carpeta de caché (`<caché>`) y su carpeta de videos (`<videos>`):

| Sistema | `<caché>` | `<videos>` | Papelera |
|---|---|---|---|
| macOS | `~/Library/Caches/walkthrough` | `~/Movies/walkthrough` | `~/.Trash` |
| Windows | `%LOCALAPPDATA%\walkthrough` | `~\Videos\walkthrough` | Papelera de reciclaje |
| Linux | `$XDG_CACHE_HOME/walkthrough` (o `~/.cache`) | `~/Videos/walkthrough` | `~/.local/share/Trash/files` |

| Qué | Dónde | Se puede borrar |
|---|---|---|
| Archivos de trabajo (voz por segmento, timeline, captura, overlays) | `<caché>/tours/<project>/<tour>/` | Sí; se regeneran |
| Caché de voz | `<caché>/voice/` | Sí; cuesta volver a pedir la voz |
| Videos finales | `<videos>/<project>/<tour>/<fecha_hora>.mp4` + `.json` con título, duración, dispositivo y tamaño | Solo a la Papelera |

- Se cambian con `WALKTHROUGH_WORK` y `WALKTHROUGH_VIDEOS`.
- **Abrir, mostrar y tirar** pasan por `src/desktop/`: `open` en macOS, `Start-Process` y el Explorador en Windows, `xdg-open` en Linux. En Windows la ruta viaja en una variable de entorno, así PowerShell nunca la interpreta.
- **Cada render es un archivo nuevo**, así se pueden comparar versiones.
- **`walkthrough gallery`** abre `http://localhost:4717`, una página local para ver los videos por proyecto, mostrarlos en el Finder o el Explorador, mandarlos a la Papelera o limpiar la caché. Solo escucha en `127.0.0.1` y rechaza acciones cuyo `Origin` no sea el suyo, para que otra página no pueda borrar nada. Sirve el video con `Range`, que Safari exige para reproducir.
- **Diseño de la galería:** la línea «Acid Grid» de Reels Analytics (tinta y casi-blanco, el lima #D9F24A como único color y siempre como fondo bajo tinta, tarjetas de 22 px con sombra), con tema claro y oscuro (sigue al sistema y recuerda la elección en `localStorage`) y el icono 4XL como favicon. Arriba, tarjetas de resumen (videos, último render, minutos generados); luego una sección por proyecto y las vistas previas, con estado vacío. Space Grotesk y JetBrains Mono se piden por nombre, con fuentes del sistema de respaldo: nada se carga de internet.
- **Imágenes fijas** (`src/library/poster.ts`): el navegador pinta mal el cuadro de un video en pausa, así que `/poster` corta uno con ffmpeg al 20 % del video (entre 2 y 20 s, pasada la tarjeta de título), lo guarda en `<caché>/posters/` y lo vuelve a cortar si el video es más nuevo. Los videos llevan `preload="none"` y solo se cargan al darles play. `clean` borra los posters con el resto de la caché de trabajo.
- **`render --open`** abre la galería directo en el video recién hecho (o en la vista previa): cada tarjeta tiene un ancla estable (`#v-…`, `#p-…`) y la página baja hasta ella y la resalta. Si la galería no está corriendo, se arranca en segundo plano y queda viva después del comando. Se reconoce por su título, así que otra app en el puerto 4717 no se confunde con ella.
- **`walkthrough clean`** borra los archivos de trabajo. Con `--voice` también borra la caché de voz, y con `--keep=<n>` manda a la Papelera todo menos los *n* renders más nuevos de cada tour. La carpeta vieja `out/` del repo, si existe, también va a la Papelera.
- **Nunca se borra un video de forma permanente**: va a la Papelera del sistema; en macOS y Linux, con un nombre que no pisa lo que ya haya ahí.

## El tour

```yaml
title: Tablero de uws-tasks
url: https://uws-tasks.vercel.app
session: uws-tasks          # .auth/uws-tasks.json
device: desktop             # desktop | mobile
language: es                # es | en
voice: 35199d5438854f5d9157c500479ab684   # opcional
music: { track: calm.mp3, volume: 0.15 }  # opcional
subtitles: karaoke          # karaoke | none

segments:
  - say: "Este es el tablero, con los tickets de la semana."
    do:
      - goto: /board
  - say: "Aquí está la tarjeta del ticket, con su estimado."
    do:
      - zoom: { to: "[data-tour=card] >> nth=0", at: "tarjeta", follow: true }
      - click: { on: "[data-tour=card] >> nth=0", at: "estimado", wait: "[data-tour=detail]" }
      - scroll: { to: "[data-tour=column-done]", within: "[data-tour=board]" }
    overlays:
      - { src: overlays/nuevo.html, from: "tarjeta" }
  - hold: 1.5               # segmento sin voz
    do:
      - zoom: { to: out }
```

**Cuándo ocurre cada cosa (`at`, `from`, `to`):**
- **Sin valor:** al inicio del segmento (`to`: al final).
- **Número:** segundos desde el inicio del segmento.
- **Texto:** cuando se dice esa palabra o frase. No distingue mayúsculas, acentos ni puntuación. Si no aparece en la narración, el tour no valida.

**Duración de un segmento:** margen previo + voz + margen posterior, o `hold` si es mayor. Sin `say`, `hold` es obligatorio.

**Apps lentas y pestañas:**
- **`waitTimeout`** (segundos, 15 por defecto): cuánto puede tardar una espera (`wait:`, el `wait` de un clic o una pestaña nueva) antes de que el render se rinda. Corre fuera del tiempo del video, así que subirlo para un servidor de pruebas lento no alarga el video. `check` usa el mismo límite.
- **`click: { on, tab: true }`:** para un botón que abre otra pestaña (una vista previa). El tour espera la pestaña, toma su dirección, la cierra y la carga en la misma página: se graba una sola, y el cambio de pantalla lleva su disolvencia, su corte o su transición como cualquier otro.

## Timeline

Es el corazón: una función pura `buildTimeline(tour, voices)` que devuelve todos los tiempos absolutos:
- inicio y fin de cada segmento, y dónde arranca su audio;
- cada acción con su instante;
- los movimientos de cámara (instante, duración, destino);
- los intervalos de cada overlay;
- cada palabra, para los subtítulos.

Todo lo que viene después solo ejecuta lo que dice la timeline; nadie más calcula tiempos.

## Cámara virtual

El zoom no toca la página:
1. Se captura con la densidad justa para que el zoom máximo quede a un píxel de origen por píxel de salida: desktop es un viewport de 1600×900 a 2,4× (3840×2160) para salir a 1920×1080; mobile es 405×720 a 5,33× para salir a 1080×1920.
2. La cámara es un rectángulo en px CSS: cada cuadro es una captura de ese rectángulo (`shooter`, ver «Rendimiento»), y ffmpeg la escala a la salida (reconstruye el filtro `scale` cuando cambia el tamaño del recorte).
3. **Zoom proporcional** (`fitRect`): el objetivo ocupa ~60 % del cuadro (`FILL`), con zoom entre 1,2× (`MIN_ZOOM`) y 2× (`MAX_ZOOM`). Si ni a 1,2× cabe, no se hace zoom: un acercamiento tan leve se lee como temblor. `zoom: { to, scale }` fija el zoom a mano.
4. **Centrado:** antes de un zoom, el objetivo se centra con scroll suave si la página o su contenedor lo permiten. Contra un borde que no hace scroll (el sidebar, por ejemplo) la cámara sigue topando con el límite de la pantalla, porque ahí no hay píxeles.
5. **Seguimiento** (`zoom: { to, follow: true }`): mientras dura ese zoom, la cámara se desplaza lo justo para mantener el cursor dentro de una zona segura (18 % de margen). La transición siguiente parte del cuadro ya desplazado, así que salir del zoom no brinca.
6. Entre destinos la cámara interpola con easing.

El anillo de resaltado y el clic dibujado **sí** van en la página: se inyectan en el DOM y quedan dentro del recorte de forma natural.

## Escenario y planos

`shot:` mueve la cámara sobre la grabación entera, después de capturar; la página nunca se entera. Es otra cámara, aparte del zoom: el zoom recorta la app, el plano inclina o aleja la grabación dentro de un escenario con el fondo del tour.

1. **La timeline los separa.** `shot` se escribe en `do` con su palabra, pero la timeline lo guarda en `timeline.shots` y no en `actions`, así que la captura no cambia.
2. **El plan es puro** (`src/stage/plan.ts`). `pose()` da la pose de cada plano (`flat`, `wide`, `left`, `right`, `top`; `angle` entre 3° y 12°, 8° por defecto) y `stagePlan()` arma los movimientos con easing (1,2 s por defecto), los tramos fuera de frente y los avisos.
3. **De frente para leer.** Antes de un `highlight`, `label`, `click` o `type`, la cámara se endereza sola (0,8 s) y queda de frente 0,2 s antes; ahí se queda hasta el siguiente plano. Si no le da tiempo, o si el plano duraría menos de 1 s antes de enderezarse, `check` y la auditoría del render lo avisan.
4. **Solo se renderizan los tramos fuera de frente** o con un cambio de pantalla del escenario (`transition`, ver «Transiciones entre pantallas»). `stage.html` reproduce `capture.mp4` en un `<video>` que se busca a la mitad de cada cuadro (sin reloj virtual: la página no anima nada por su cuenta) y aplica la pose que Node calculó con un `transform` 3D. Cada tramo empieza y termina en cuadros enteros (`spanFrames`).
5. **El montaje** pone cada tramo sobre la captura en su segundo, antes de los overlays. Al principio y al final de un tramo la pose es de frente, así que el corte no se nota.
6. **Planos con espacio** (fase 11): `aside-left`, `aside-right` e `inset` dejan una parte del escenario libre, y `room()` la calcula a partir de la misma pose, así el texto nunca pisa la pantalla. En 9:16 el aparte va arriba y abajo. `away` saca la pantalla del cuadro. Un `aside` no se endereza antes de una marca (está casi de frente); `inset` sí. El `aside:` de un segmento es azúcar: `load.ts` lo vuelve un overlay `aside.html` con su `data` (validada como recurso), y la timeline agrega dos planos, el que aparta la pantalla en `at` y el que la regresa 0,35 s antes de `until`.
7. **Con `frame` todavía no:** el marco se compone plano encima de la captura, y el schema rechaza un tour con `frame` y planos o transiciones del escenario.

La prueba 10.1 (`docs/plan.md`) midió unos 0,16 s por cuadro a 1080p; por eso el escenario no se renderiza de frente.

## Movimiento y scroll

- **Preparación anticipada** (`prepSchedule`, `prep.ts`): cada acción con selector se prepara hasta 1,6 s antes (`PREP_LEAD`), nunca antes de la acción anterior, porque esa puede cambiar de pantalla.
  1. Si el objetivo está fuera de la vista (o descentrado, en un zoom), se programa un scroll suave que termina antes de la acción.
  2. El cursor viaja hacia la posición que tendrá el objetivo *después* del scroll.
- **Cursor natural:** trayectoria Bézier con una comba lateral de 8–18 % (sembrada por acción) y duración según la distancia, entre 0,35 s y 0,9 s. El movimiento arranca justo a tiempo para llegar cuando corre la acción.
- **Scroll determinista:** Node interpola cada contenedor (la ventana o un elemento con `overflow` que se marca con `data-walkthrough-scroll`) cuadro por cuadro con easing de seno, y lo aplica con `scrollTo({ behavior: 'instant' })`. Así el `scroll-behavior: smooth` del CSS de la app, que correría en tiempo real, nunca interviene. El seno tiene una velocidad pico de ~1,6 veces la promedio; el cúbico, de 3, y se veía como un jalón.
- **Acción `scroll`:** `scroll: { to: <selector> | top | bottom, within: <contenedor>, duration }`. Sirve para recorrer contenedores horizontales como las columnas del Board.
- **Ritmo del scroll** (`scrollDuration`): 0,35 s más 1 s por cada 1 200 px, entre 0,6 s y 3,2 s, así el promedio no pasa de ~1 200 px/s y el texto se alcanza a leer al pasar. Antes el tope era 1,1 s y 3 000 px volaban a casi 2 700 px/s. Un scroll más largo que eso lleva su `duration` o se parte en varios.
- **Un scroll por contenedor a la vez:** uno nuevo corta al que está en curso y arranca desde donde iba. La preparación de la siguiente acción espera a que la página se detenga (`scrollBusyUntil`); si el scroll sigue en curso cuando llega la acción, no calcula ningún ajuste. Medido a media animación, el ajuste apuntaba a donde el objetivo iba pasando y cortaba el scroll bueno.
- **Marcas que siguen al contenido:** en cada cuadro, los anillos, etiquetas y círculos visibles se vuelven a medir, no solo tras nuestros scrolls, porque la app también mueve la página (un menú que sube hasta arriba al abrirse).
- **Marcas que se retiran:** si el elemento marcado queda tapado (tres de cinco puntos le pegan a otro elemento, como un menú abierto encima), sale de la pantalla (menos de la mitad visible) o desaparece (una navegación), su marca se desvanece en ese momento en vez de flotar sobre lo que lo reemplazó (`endRingAt`, `endLabelAt`). Queda un evento `cut` con cuánto se vio.

## Etiquetas

`label: { on, text, side, duration }` dibuja en la capa de efectos una burbuja del color de acento, con letra de plumón (Permanent Marker, vendorizada; la captura se la pasa a la página como bytes con `FontFace`, así el CSP de la app no la bloquea), y una flecha a mano hacia el elemento.

- **Colocación:** una función pura (`layoutLabel`) prueba arriba, abajo, derecha e izquierda y se queda con el primer lado donde cabe; `side` lo fija a mano. El ancho del texto se estima en Node, antes de que exista.
- **Texto:** se ajusta por palabras, con 3 líneas como máximo.
- **Animación:** la burbuja aparece con un pop, la flecha se traza y al final su punta; todo se desvanece junto.
- **Movimiento:** como va en la capa de efectos y no como overlay, se mueve con la cámara y sigue al elemento durante el scroll.

## Transiciones entre pantallas

`click: { on, wait: <selector> }` y la acción `wait: { until: <selector> }` esperan a que la siguiente pantalla muestre ese elemento con el reloj corriendo, fuera del tiempo del video, como `goto`. En el video, el elemento ya está en el cuadro del clic: no se ven estados de carga a medias.

**Disolvencia en vez de corte** (`TRANSITION`, 0,5 s): antes de un `goto` o de un clic con `wait`, se toma una captura de la página sin la capa de efectos. Ya cargada la nueva, esa imagen se pone encima en el top layer (`transitionLayer`) y se desvanece con una animación que la sincronía congela cuadro a cuadro. La capa de efectos se vuelve a subir en cada cuadro, así las marcas siguen vivas encima de la disolvencia.

**Corte seco** (`transition: cut`): ni disolvencia en la página ni escenario; la pantalla nueva aparece en el cuadro del cambio. Para cuando el guion pide un corte, como de un checkout a su confirmación.

**Transiciones del escenario** (`transition: push | flip | fly` en el tour o en el segmento; `dissolve` es la de arriba y la de siempre): la timeline marca esas navegaciones (`TimedAction.transition`) y la captura no hace su disolvencia, corta. El escenario dibuja el cambio en 0,8 s (`CHANGE_LENGTH`): la pantalla vieja es un segundo `<video>` detenido en el último cuadro antes del corte, y la nueva corre en vivo. Dónde va cada una en cada momento lo calcula `changeLayers()` (puro), dentro de la pose de la cámara; ver «Escenario y planos».

## Efectos en la página

Cursor, circulito de clic y anillo de resaltado.

- **La página no guarda estado.** En cada cuadro, Node calcula la escena a partir del tiempo del video (`src/effects/`, funciones puras) y la página solo pinta el SVG que recibe (`effectsLayer` en `src/capture/runtime.ts`). Así sobreviven a navegaciones y se prueban sin navegador.
- **La capa es un `popover` en el top layer**, con `pointer-events: none`. Se vuelve a mostrar en cada cuadro para quedar encima de los diálogos que abra la app.
- **El cursor sale antes** para llegar al objetivo justo cuando corre la acción; la trayectoria y el tiempo están en «Movimiento y scroll». Si el objetivo aparece tarde, el viaje se acorta.
- **Se apunta al texto del elemento**, no a su centro geométrico. El centro de una fila de ancho completo puede quedar lejos de lo que se lee, e incluso fuera de la cámara. Playwright hace el clic o el hover en ese mismo punto.
- **Trazos a mano:** círculo con 1,1 vueltas y rectángulo redondeado con ruido suave y sembrado por acción (siempre igual en cada render). Se dibujan con `pathLength` + `stroke-dashoffset`.
- **Estilos de resaltado** (`src/effects/marks.ts`, puro): `markPieces` vuelve un estilo (`ring`, `circle`, `underline`, `marker`, `box`, `brackets`, `spotlight`, `arrow`) en piezas: trazos que se revelan a lo largo, cada uno en su tramo del tiempo de dibujo (la punta de una flecha después del asta), o un relleno `evenodd` que aparece con opacidad (el oscurecido de `spotlight`). `underline` y `marker` siguen cada línea del texto: la captura mide los rectángulos de un `Range` sobre el elemento y los junta por línea. La flecha llega del primer lado con espacio (izquierda, abajo, derecha, arriba) o del que pida `side`.
- **Mobile:** sin cursor; solo el circulito en cada toque.
- **Tecleo visible:** `type` escribe a 14 caracteres por segundo, repartidos entre cuadros.
- **Color:** `accent` del tour (`#FF3B5C` por defecto); un resaltado puede llevar uno propio (`markColor`), y `marker` es amarillo por defecto.

⚠️ La capa usa `innerHTML`: una app con Trusted Types estrictos la bloquearía.

## Captura determinista

El video no se graba en tiempo real. El tiempo del video avanza solo cuando se toma un cuadro:
- **Entre cuadros**, el reloj de la página está congelado (timers, `requestAnimationFrame`, animaciones CSS/WAAPI) y se avanza exactamente 1/fps.
- **Las esperas** (navegación, red, carga de una pantalla) ocurren fuera del tiempo del video: la app corre libre hasta quedar lista y la captura sigue. Los spinners no salen en el video.
- **Los efectos inyectados** (anillo, clic) se animan con el mismo reloj, así que también son deterministas.

**Validado el 28/sep/2026** contra una página fixture y contra uws-tasks real (`/tickets`: lista → hover → vista Board, 105 cuadros):

| Qué | Cómo se controla | Resultado |
|---|---|---|
| Timers, `Date`, `performance.now`, `requestAnimationFrame` | `page.clock` de Playwright | ✅ ±1 tick de rAF (< 1 cuadro) |
| Animaciones y transiciones CSS / WAAPI | **No** las controla `page.clock`. Un script en la página las pausa y fija su `currentTime` con `performance.now()` antes de cada cuadro; al pasar su fin llama a `finish()` para que salgan los eventos `transitionend`/`finish` | ✅ idénticas con o sin esperas aleatorias entre cuadros |
| Esperas de red | `clock.resume()`, esperar a que la app esté lista y `pauseAt()` de nuevo | ✅ sin spinners en el video |

- **Costo:** ~180 ms por cuadro a 3840×2160 (desktop con zoom máximo 2×): unos 5,5 s reales por segundo de video. Un tour de un minuto tarda unos 5–6 minutos.
- **Animaciones y videos nuevos.** Hasta que la sincronía los ve, corren con el reloj real. Al pasar cuadro a cuadro arrancan en el cuadro en que aparecen: es exacto para lo que disparan las acciones y tiene menos de un cuadro de error para los timers. Justo después de un `settle()`, cuando la página corrió libre, se usa el tiempo real, que ahí es el correcto. Tomar siempre el tiempo real filtraba la velocidad de captura al cuadro: hasta ~50 ms de diferencia entre corridas.
- **El reloj falso arranca en la hora real** (`clock.install({ time: Date.now() })`). Con la fecha por defecto, Supabase daría el token por inválido.

El plan B (screencast de Chrome) queda descartado mientras esto aguante.

## Overlays

Cada overlay es un HTML propio en la carpeta del tour, con sus assets (imágenes, fuentes, `<video>`):

```yaml
overlays:
  - src: overlays/lower-third.html
    from: tarjeta            # como `at`: segundos o palabra; por defecto, el inicio del segmento
    to: 2.5                  # por defecto, el fin del segmento
    fade: 0.3                # fade de entrada y salida, en segundos
    params: { title: Tablero, subtitle: Semana 38 }   # llegan como query string
```

- **Plantillas compartidas** en `templates/overlays/`. `src` busca primero en la carpeta del tour y después ahí, así que un proyecto puede reemplazar cualquiera. Todas reciben `accent` (el del tour) y `base` (la carpeta del tour, para que `asset()` cargue sus imágenes), y comparten `base.css` y `params.js`. Usan `vmin`, así que sirven en 16:9 y en 9:16.
- **Texto sobre el acento** (`--on-accent` en las plantillas, `onAccent()` en `src/effects/color.ts` para las etiquetas): blanco, salvo con un acento claro (luminancia > 0,4, como un lima o un amarillo), donde va casi negro. `params.js` repite la regla porque las plantillas no importan código de Node.

  | Plantilla | Params |
  |---|---|
  | `lower-third.html` | `title`, `subtitle` |
  | `title-card.html` (pantalla completa) | `eyebrow`, `title`, `subtitle` |
  | `outro.html` | `title`, `subtitle`, `url` |
  | `chapter.html` | `index`, `total`, `label`, `position` (`top-right` por defecto; en uws-tasks conviene `bottom-right`, porque arriba tapa «New ticket») |
  | `shortcut.html` | `keys` («⌘ + K»), `label` |
  | `compare.html` | `before`, `after` (imágenes del tour), `beforeLabel`, `afterLabel` |
  | `code.html` | Código en editor, terminal o diff, con resaltado de sintaxis propio (`src/code/`), líneas señaladas en su palabra y acercamiento; guía en `docs/recursos.md` |
  | `chart.html` | Gráficas (`bar`, `line`, `donut`, `stat`, `compare`) con `data`; ver «Recursos con datos» abajo y `docs/recursos.md` |
  | `table.html` | Tabla de comparación (`src/table/`): filas en su palabra, ✓ y ✕ dibujados, una columna destacada |
  | `roadmap.html` | Línea de tiempo (`src/roadmap/`): hitos `done`, `now` y `next`, horizontal en 16:9 y vertical en 9:16 |
  | `opening.html`, `chapter-card.html`, `closing.html` | Aperturas, capítulos y cierres en tres estilos (`kinetic`, `over-app`, `brand`), con `beats`; comparten `titles.css` y las coreografías de `titles.js`. Guía en `docs/recursos.md` |
- **Render aparte** (`src/overlays/render.ts`): cada overlay se abre en su propia página, al tamaño de salida, con `deviceScaleFactor: 1` y fondo transparente. Se guarda como `overlays/NN.mov` en QuickTime Animation (`qtrle`), sin pérdida y con alfa. Varios se renderizan a la vez (`--jobs`), los más largos primero.
- **Overlays fijos:** si la página no registró nada que se mueva (`walkthrough.still()` en `params.js`: ni timelines, ni animaciones CSS, ni `<video>`), se captura una vez y ffmpeg repite el cuadro (`loop`). Así sale la marca de agua. Una plantilla que cambie con el tiempo lo registra con `walkthrough.timeline()` o `walkthrough.gsap()`; si no, se renderiza como fija.
- **Reloj propio que empieza en cero.** La página se carga con el reloj congelado, no vía `settle()`, así que sus animaciones de entrada arrancan justo cuando el overlay aparece en el video. Antes del primer cuadro se espera a las fuentes, imágenes y videos, por evento, porque los timers están congelados.
- **`params`** reutiliza una plantilla con distintos textos: el HTML los lee con `URLSearchParams`.
- **Montaje:** `setpts` desplaza el overlay a su inicio, `fade` con `alpha=1` lo desvanece y `overlay=eof_action=pass` lo compone en el orden del tour. Los subtítulos van encima de todo.
- **Lo que no le afecta:** el CSS de la app ni la cámara. Cambiar un overlay solo requiere `render --from=overlays`.
- **El lienzo** es el video completo (1920×1080 o 1080×1920). La posición la decide el CSS del overlay; los subtítulos ocupan la franja inferior.
- **Palabras clave y datos** (fase 7.1): cualquier overlay acepta `beats` y `data`:

  ```yaml
  overlays:
    - src: title-card.html
      beats: { title: Sunset, line: every }   # palabra de la narración o segundos del segmento
      data: { series: [{ label: Lun, value: 3 }] }
  ```

  La timeline busca cada palabra después de la anterior, como en los flujos, y la plantilla recibe los segundos en su propio reloj (`?beats=` y `?data=` como JSON). Un beat fuera del overlay o una palabra que no se dice detienen el render.
- **Animación por posición:** `params.js` expone `walkthrough` (`beats`, `data`, `theme`, `beat(nombre)`) y dos formas de registrar una animación en pausa: `walkthrough.timeline(t => …)` o `walkthrough.gsap(timeline)`. En cada cuadro el render llama `__walkthroughSeek(t)` antes de la captura, así la animación cae en el segundo exacto y dos renders dan los mismos cuadros (lo comprueba una prueba con `framemd5`). Las plantillas que animan con CSS siguen con la sincronía de siempre.
- **GSAP vendorizado** en `templates/overlays/vendor/gsap/` (3.15.0: núcleo, SplitText, DrawSVG, MorphSVG, CustomEase; licencia en su `AVISO.md`).
- **Kit de movimiento** (`templates/overlays/kit.js`): curvas y duraciones de la familia, `kit.timeline()`, `kit.split()` (letras o palabras, nunca líneas, para no depender de que carguen las fuentes), `kit.count()` (números en `es-MX` o `en-US` según el tour), `kit.draw()` y `kit.drift()`, la cámara de las escenas con profundidad.
- **Escenas con profundidad** (`templates/overlays/scene.css`, fase 10.4): un cuarto con luz y viñeta, un `rig` en perspectiva que guarda cada pieza a su profundidad (`translateZ`: la sombra en la pared detrás, el tablero, la repisa más al frente) y `kit.drift()`, que entra desde un ángulo más abierto y luego deriva despacio todo lo que dura el overlay, así lo cercano se mueve más que lo lejano. Las letras de gis y de plumón son Kalam y Permanent Marker, vendorizadas en `templates/overlays/vendor/fonts/` y declaradas en `base.css`; el gis se rompe con un filtro SVG. Cuestan más que una tabla: unos 0,5–0,75 s por cuadro a 1080p, por capturar sin pérdida un cuadro opaco lleno de degradados.
- **Duración y acento como texto:** la plantilla recibe `?duration=` (sus segundos en pantalla, para calcular una salida desde el final) y `--accent-ink`, el acento para texto y líneas finas: con un acento claro en tema claro pasa a tinta, porque el lima no se lee sobre blanco.
- **Tema** (`theme: dark | light` en el tour): llega como `?theme=` junto con el acento y el idioma (`lang`). `base.css` define los tokens (`--stage`, `--panel`, `--surface`, `--line`, `--stroke`, `--scrim`) y las plantillas, flujos incluidos, solo usan tokens.
- **Recursos con datos** (`src/resources/registry.ts`): una plantilla que toma `data` (`chart.html`, `code.html`, `table.html`, `roadmap.html`, `board.html`, `corkboard.html`) declara su esquema, los beats de sus partes, su escena y sus avisos. `check` calcula la escena como el render y reporta lo que no se leería (etiquetas cortadas, código que no cabe o que sigue escribiéndose cuando el overlay se va). Al cargar el tour se valida `data` y cada `at` de dentro se vuelve un beat (`p0`, `p1`… en una serie; `value`, `before`, `after`); los beats escritos a mano ganan. Al renderizar, Node calcula la escena con los beats ya en segundos y la pasa como `?scene=`. Las gráficas (`src/charts/`) reparten los puntos sin palabra entre sus vecinos con el mismo `spreadTimes` de los flujos, con su propio ritmo mínimo.
- **Marcas** (`src/brands/`, `assets/brands/<marca>/brand.yaml`): al cargar el tour, la marca llena el acento, el tema y la textura que el tour no fija. `tourLook` pasa a cada overlay el nombre, los dos colores (`--brand-1`, `--brand-2`, y el tinte del fondo oscuro, `--stage-tint`) y sus imágenes como URL: la más ancha (`brandLogo`, sobre el eyebrow) y la más cuadrada (`brandMark` con `markShape`, al centro de `style: brand` y en la marca de agua). `watermark: true` hace que la timeline agregue `watermark.html` entre el primer y el último segmento, sin sonido (`silent`).
- **Tipografía** (`typeface: editorial`): `data-typeface` en `<html>` cambia `--display` a Instrument Serif (vendorizada con `@font-face` en `base.css`) y pone todo `.title` en esa letra, a peso regular.
- **Texturas** (`texture`): `data-texture` en `<html>` cambia `--stage` por capas de CSS sobre `--stage-base` (grano en un SVG `feTurbulence` en línea, puntos, líneas, mallas de color). Todo fondo propio usa `--stage`.
- **Emojis** (`src/emoji/emoji.ts`, `templates/overlays/vendor/fluent-emoji/`): `emojiName` valida un nombre contra `index.json` y sugiere parecidos; `params.emoji` se valida al cargar. En la página, `walkthrough.emoji(nombre)` da la URL en el estilo del tour (`emojiStyle`).
- **Probador:** `walkthrough overlay <plantilla> --beats=… --params=… --data=archivo --theme=… --device=…` renderiza un overlay suelto sobre gris medio en `<caché>/probe/`, para diseñar un recurso sin armar un tour. Las rutas relativas se resuelven desde la carpeta actual.

## Flujos

Pasos conectados que aparecen cuando la narración los nombra. Reglas de uso y de escritura en `docs/flujos.md`.

```yaml
- say: El huésped elige una noche, escoge su mesa, paga el depósito, y el host la confirma.
  flow:
    title: Cómo se reserva una mesa      # opcional
    mode: full                           # full (interludio, tapa la app) o card (panel abajo)
    steps:
      - { text: Elige una noche, at: noche }
      - { text: Escoge su mesa, detail: "Sección y consumo mínimo", at: mesa }
      - Paga el depósito                 # sin `at`: se reparte entre sus vecinos
      - { text: El host confirma, at: confirma }
```

- **Formas** (`shape`): `linear`, `decision` (el último paso es la pregunta y `branches` son dos ramas con etiqueta), `cycle` (`loop` es la palabra en que se cierra), `lanes` (`lanes` y un `lane` por paso) y `compare` (`before` y `after`; en la timeline van como las ramas, `branch` 0 y 1). Internamente todas son un grafo: `src/flow/graph.ts` da las aristas y los números de cada caja, y los pasos de las ramas van en `steps` en orden de narración, con su `branch`.
- **Es un overlay más.** La timeline lo convierte en un overlay de `templates/overlays/flow.html` con los tiempos de cada paso, así el render, el fade, el montaje y `--from=overlays` funcionan igual.
- **Tiempos** (`src/timeline/build.ts`): cada `at` se busca en la narración *después* del paso anterior (`findPhrase(…, after)`), así una palabra repetida ancla dos pasos. Los pasos sin `at` se reparten entre sus vecinos anclados (`spreadTimes`), el primero a 0,4 s del inicio y el último a 0,8 s del fin como mínimo. Palabras en desorden detienen el render.
- **Layout puro** (`src/flow/layout.ts`): en unidades `u` (1/100 del lado corto del lienzo), fila en 16:9 y columna en 9:16. La decisión abre sus ramas arriba y abajo (lado a lado en columna); el ciclo pone los pasos en una elipse casi redonda y achica las cajas hasta que ninguna toca a otra, y en `card` es una fila con el regreso por debajo. Los carriles son franjas (`groups`) con una columna de tiempo por paso; la comparación, dos columnas con cajas en línea (número al lado del texto) y el lado de antes atenuado. Las franjas y los lados aparecen antes que sus pasos: los carriles al inicio, cada lado justo antes de su primer paso. Las flechas salen del borde de cada caja hacia el centro de la siguiente; alrededor de un ciclo y desde una pregunta se curvan hacia afuera. Calcula cajas de alto uniforme, cortes de línea (`wrapText`, con `CHAR_EM` generoso para que el navegador nunca desborde), flechas (`arrowPaths`) y anillos (`sketchRect`) de la capa de efectos. Una prueba en Chrome confirma que ninguna línea sale de su caja.
- **Coreografía pura** (`src/flow/cues.ts`): la flecha hacia un paso se dibuja en los 0,45 s previos a su palabra (nunca antes de 0,2 s después de la caja anterior), la caja entra con la palabra, un anillo marca el paso activo hasta que llega el siguiente y los anteriores bajan a 50 %. La flecha de una rama se dibuja cuando llega su paso, aunque la pregunta haya sido mucho antes; la que cierra un ciclo, en `loop`, y devuelve el anillo al primer paso.
- **La plantilla solo pinta.** Recibe `?scene=` con el layout y los tiempos ya en el reloj del overlay; todo se anima con CSS (`animation-delay`), que la sincronía de animaciones congela cuadro a cuadro.
- **Sonido:** un solo *pop* al aparecer, como cualquier overlay. Un sonido por paso saturaba la voz y no seguía el ritmo del diagrama.
- **`check`** avisa de pasos a menos de 0,7 s del anterior y de textos que no caben en su caja.

## Video dentro de la página

`<video>` tampoco obedece a `page.clock`: corría con el reloj real y en la captura se veía acelerado. La misma sincronía que fija las animaciones CSS lo pausa y lo busca (`currentTime`) al instante exacto de cada cuadro, y espera `seeked` antes del screenshot. Respeta `loop`. Aplica a la app y a los overlays.

## Montaje (compose)

Una sola pasada de ffmpeg, ejecutada desde la carpeta de trabajo del tour con rutas relativas, porque las reglas de escape del filtro `ass` vuelven frágiles las rutas absolutas.

- **Video:** `capture.mp4` + subtítulos karaoke (`subs.ass`) quemados con libass.
- **Karaoke:** líneas de hasta 3 palabras; una pausa de más de 0,5 s abre línea nueva. Cada palabra pasa de blanco al `accent` mientras se dice, y `{\k}` dura hasta que empieza la siguiente. En vertical la letra es más grande y más alta, para no quedar bajo la interfaz de las redes. Se desactivan con `subtitles: none`.
- **Voz:** cada clip entra con `adelay` en el `speechStart` de su segmento.
- **Música opcional** (`music: { track, volume }`, ruta relativa a la carpeta del tour; `volume` 0,04 por defecto, que deja la música unos 15 dB bajo la voz en las pausas): en loop, con fade de entrada y salida y ducking con `sidechaincompress` bajo la voz.
- **Efectos de sonido** (`sfx: true | false | { volume, mute: [...] }`), todos sintetizados con ffmpeg (`aevalsrc`, `anoisesrc` con semilla fija): sin licencias, sin archivos y sonando igual en cada render. Entran después del ducking, así que no bajan la música.

  | Sonido | Cuándo |
  |---|---|
  | `click` | cada clic y al entrar a escribir; 3 variantes elegidas por acción |
  | `keys` | cada carácter de `type` |
  | `draw` | anillos y etiquetas, mientras se trazan |
  | `pop` | al aparecer un overlay; 2 variantes |
  | `whoosh` | zoom: crece al acercar, se apaga al alejar |
  | `swipe` | cambio de pantalla (`goto` después del inicio, `click` con `wait`) |
  | `scroll` | durante cada scroll de 0,3 s o más |

  ⚠️ Cada evento tiene su propia fuente: en ffmpeg 8.1, `asplit` → `adelay` → `amix` se queda girando para siempre, incluso con dos eventos.
- **Loudness en dos pasadas.** Primero se mide solo el audio (`loudnorm` con `print_format=json`) y luego se monta aplicando esa medición con `linear=true`: una sola ganancia hasta −16 LUFS que respeta la proporción entre voz, música y efectos. En una pasada, `loudnorm` actúa como control automático de ganancia y levanta los pasajes quietos: bajar la música no se notaba.
- **Efectos desde lo que pasó:** la captura escribe `events.json` (clics, tecleo, anillos, etiquetas, zooms, scrolls y navegaciones), y el montaje saca de ahí los sonidos. Así también suenan los scrolls automáticos, que la timeline no conoce. Una captura sin ese archivo se aproxima desde la timeline.
- **Tiempo máximo.** El montaje tiene un límite de 10 veces la duración (mínimo 2 minutos) y se mata con SIGKILL: un grafo atorado ignora SIGTERM.
- **Marco de dispositivo** (`frame: browser | laptop | phone`, `src/frame/`): `captureDevice` decide cómo se graba la app (un teléfono emulado o un escritorio), independiente del formato del video, que sigue siendo `device`. `frameLayout` (puro) calcula el cuerpo del dispositivo y su pantalla, con el aspecto de la grabación y en pixeles pares. `frame.html` se renderiza una vez como `frame.png` (fondo del tour y dispositivo, con la pantalla transparente gracias a una máscara SVG `evenodd`) y el montaje escala la captura a la pantalla (`scale`, `setsar=1`, `pad`) y pone el marco encima, antes de los overlays.
- **Silencio:** un tour sin voz, música ni efectos mide −inf y `loudnorm` lo rechaza, así que el audio pasa sin normalizar.
- **Repetir solo el montaje:** `render --from=compose` reutiliza `capture.mp4`. Sirve para cambiar subtítulos, música o color sin recapturar.

## Voz

```ts
interface VoiceProvider {
  synthesize(request: { text: string; language: Language; voice?: string }): Promise<Speech>;
}
// Speech = { audio: Buffer, words: { text, start, end }[] }
```

- **Una sola voz en todo el tour.** Sin `reference_id`, Fish puede elegir una voz distinta en cada llamada. El adaptador expone `defaultVoice` («Drez», `47a92a11ad4a4b79aac40ad587fa61b1`, español, narrador calmado) y un tour la cambia con `voice:`.
- **Caché** en `<caché>/voice/<sha256>`. La clave incluye proveedor, modelo, voz, idioma, texto y prosodia.
- **Duración real** calculada de los bytes de PCM, después de reconstruir la cabecera WAV del stream.
- **Etiquetas de expresión** (`[excited]`) filtradas de las palabras dentro del adaptador.

## Sesión

`walkthrough login <session> <url>` abre Chrome con un perfil propio en `.auth/<session>/`, ignorado por git. El autor inicia sesión a mano y cierra la ventana. La captura abre ese mismo perfil con `launchPersistentContext`.

**Por qué un perfil y no `storageState`.** Supabase rota el refresh token cada vez que lo usa. Una foto de la sesión quedaría vieja después del primer render, y el perfil se mantiene al día solo. El costo es un navegador a la vez por perfil.

**No sirve la sesión del Chrome personal.** Ese perfil está bloqueado mientras Chrome está abierto, y automatizarlo mezclaría la navegación real con la herramienta.

**Sesión caducada.** Después de cada navegación (`goto`, `click` con `wait`), si la app cayó en un login (un campo de contraseña, o una ruta con `login`, `sign-in` o `auth` distinta de la pedida), el render se detiene con el comando exacto para volver a iniciar sesión. `check` lo reporta igual.

## Onboarding de la app

```yaml
setup:
  storage: { uws_tour_seen:dashboard: 1 }   # localStorage antes de cada carga
  dismiss: ["button[aria-label=Close]"]      # se cierra si aparece tras navegar
```

- `storage` se escribe con un init script antes de que cargue cada documento del origen del tour. Se compara protocolo y host, no `origin`, porque para `file://` Node dice `"null"` y Chrome `"file://"`.
- `origins` hace lo mismo para otros sitios que el tour visita con su dirección completa: `{ "https://portal.test": { clave: valor } }`. Sirve cuando un tour cruza dos apps (una consola y su portal) y la segunda recuerda una preferencia, como la última vista elegida.
- `dismiss` se aplica dentro del `settle()` de cada navegación: el diálogo y su animación de cierre quedan fuera del tiempo del video.
- `check` aplica el mismo `setup`, así que no reporta como abiertos los onboardings ya resueltos.
- Con `storage` declarado, un tour funciona igual con un perfil recién creado.

## Salud del entorno

`walkthrough doctor` revisa:
- Node 24, y que sea `arm64` en Apple Silicon;
- ffmpeg con los filtros del pipeline (sin libass solo advierte, porque los subtítulos son opcionales), y ffprobe;
- que Chrome arranque en headless;
- que la clave de Fish funcione, consultando la voz por defecto;
- las sesiones guardadas, y las que algún tour pide pero nadie ha guardado;
- el tamaño de la caché.

## Rendimiento

Auditado el 6/oct/2026 sobre el showcase (2:25, 18 frases, 13 overlays, planos y transiciones) en un M2 de 8 núcleos y 8 GB. Lo caro no era dibujar, sino comprimir y mover imágenes. Todo lo siguiente da **los mismos píxeles**; las pruebas lo comparan.

| Etapa | Antes | Después |
|---|---|---|
| Captura | 44,0 min | 16,4 min (con los overlays dentro) |
| Overlays | 20,3 min | En paralelo con la captura |
| Escenario | 7,7 min | 4,4 min |
| Montaje | 3,7 min | 2,7 min |
| **Total** | **75,8 min** | **23,5 min** |
| Overlays en disco | ~8 GB | 2,3 GB |

Entre los dos videos finales: SSIM 0,995 y PSNR promedio de 48,9 dB. Solo 2 de 4 327 cuadros quedan por debajo de 35 dB, y caen a mitad de un fundido del menú del sitio; lado a lado se ven iguales.

- **Capturas con el PNG rápido de Chrome** (`src/capture/shot.ts`): `Page.captureScreenshot` con `optimizeForSpeed`, que sigue siendo PNG sin pérdida pero comprime menos. Un cuadro 4K pasó de 1 064 a 167 ms; uno de overlay, de 239 a 85 ms; uno del escenario, de 193 a 47 ms. Además se salta lo que Playwright hace en cada captura: recorrer todo el DOM para ocultar el cursor de texto (aquí se oculta una vez, con `hideCaret`) y volver a poner el fondo. Igual que Playwright, espera a las fuentes y recorta en coordenadas de página con escala igual a la densidad.
- **Overlays en `qtrle` en vez de PNG:** codificar pasó de 160 a 9 ms por cuadro y decodificar en el montaje de 33 a 1 ms; ocupa un tercio.
- **Overlays fijos de un cuadro** y **overlays en paralelo con la captura** (ver «Overlays» y «Pipeline»).
- **`--jobs`:** overlays a la vez. Por omisión sale de la memoria (`defaultJobs`): 1 con 8 GB, porque la captura en 4K ya lleva la Mac al swap; 2 con 16 GB; hasta 4 con más.
- **Nada que dependa del reloj real dentro de un cuadro.** `presence()` le daba 150 ms a la página para decir si una marca seguía visible; en una Mac cargada, la respuesta llegaba tarde y la marca se retiraba sola. Ahora pregunta sin esperar si el elemento existe y, si existe, lo mide sin límite corto.
- **Ruido conocido:** Chrome aplica *dithering* a los degradados y dos rasterizados de la misma página pueden diferir en un nivel, lo capture quien lo capture. Las pruebas de píxeles usan colores sólidos.
- **Pruebas:** Vitest usa la mitad de los núcleos (`vitest.config.ts`); con uno por núcleo, las suites que abren Chrome agotaban los 8 GB.

## Iterar sin renderizar

- **`walkthrough check <tour>`** recorre el tour con el reloj normal y sin capturar cuadros, así que tarda segundos: el de uws-tasks, 9 s. Hace los mismos clics que el render y reporta por acción:
  - ✗ si un selector no existe, con sugerencias sacadas de las anclas estables de la pantalla;
  - ✗ si está oculto;
  - ✗ si una navegación terminó en un login (sesión caducada);
  - ⚠ si hay varios resultados, si el selector depende de datos (una clave de ticket, un número largo) o si hay un diálogo abierto.

  Antes de declarar que algo no existe espera hasta 5 s: las pantallas a las que se llega con un clic del lado del cliente no disparan `load`. Sale con código 1 si hay fallas.
- **`walkthrough inspect <url> [--session] [--device]`** es solo lectura: navega sin hacer clics y escribe un reporte Markdown con captura en `<caché>/inspect/<host>/`. Por pantalla lista encabezados, anclas estables (`data-tour` > `data-testid` > enlaces internos > `aria-label` > ids no generados > texto corto), diálogos abiertos, zonas con scroll y claves de `localStorage` que parecen de onboarding.
  - Sigue solo los enlaces de navegación y una vez por ruta, ignorando el query.
  - Los controles por fila («Edit <título>») se agrupan en un selector de prefijo, porque llevan datos en la etiqueta.
- **Auditoría de tiempos** (`src/check/timing.ts`): al terminar cada render, lee `events.json` (lo que de verdad pasó en la captura) y avisa de lo que se vería a destiempo:
  - un scroll de más de 1 500 px/s;
  - un anillo o una etiqueta que aparece con la página todavía en movimiento (hasta 0,3 s después de que para) o durante una disolvencia;
  - dos clics a menos de 0,8 s (abrir un menú y su enlace), porque no se alcanza a ver qué abrió el primero;
  - una marca que un flujo a pantalla completa o una tarjeta de título tapa antes de 1,2 s, o que se retiró antes de ese tiempo porque la taparon.

  Cada aviso dice cómo corregirlo, casi siempre moviendo `at` a una palabra posterior. Las reglas de escritura están en `docs/guiones.md`.
- **`walkthrough render --preview`** mantiene el viewport (la app se ve idéntica) y reduce la salida a la mitad y a 15 fps. Los overlays se diseñan sobre el lienzo completo y se escalan. Queda en `…/<tour>/preview/`, fuera de `<videos>`, y la galería lo muestra en «Vistas previas». Comparte voz y timeline con el render final.
  - En uws-tasks tardó 2 min 10 s contra unos 11 min del final: 5× más rápido.
  - Por cuadro ya domina el costo fijo (sincronía, efectos, reloj) más que los píxeles: 132 ms contra ~360 ms.

## CLI

```
walkthrough login  <session> <url>     iniciar sesión a mano, una vez
walkthrough voice  <tour>              solo voz: para oírla y revisar tiempos
walkthrough doctor                      revisar el entorno
walkthrough check  <tour>               validar sin renderizar
walkthrough inspect <url> [--session=<s>] [--device=mobile]
walkthrough render <tour> [--preview] [--open] [--from=overlays|compose] [--jobs=N]
walkthrough overlay <plantilla> [--beats --params --data --theme --device --open]   probar un overlay suelto
walkthrough catalog [--device=mobile|both] [--theme=light] [--open]           todos los recursos y una hoja de contacto
walkthrough gallery [--no-open]           ver los videos generados
walkthrough clean [--voice] [--keep=<n>]  limpiar caché y renders viejos
```

## Estructura

```
src/
  cli/          commands
  tour/         schema, loading, validation
  timeline/     pure: segments, anchors, camera, overlays
  voice/        VoiceProvider, fish/, cache
  capture/      playwright, session, clock, page-runtime/
  overlays/     transparent rendering
  flow/         pure: flow layout and cues
  charts/ code/ table/ roadmap/ board/ corkboard/   pure: data resources (schema, layout)
  frame/        device frames: pure layout and the still
  stage/        pure camera plan for shots, and the stretches rendered on the stage
  compose/      ffmpeg args, subtitles (ASS), music
tests/fixtures/ local page for integration tests
tours/<project>/<tour>.yaml + overlays/ + assets/
tours/examples/  catálogo de flujos
.auth/<session>/  .env          ignored by git
```

## Pruebas

- **Unitarias (la mayoría):** esquema, anclas por palabra, timeline, cámara, subtítulos ASS, argumentos de ffmpeg, clave de caché, parser del stream SSE de Fish (con un fixture grabado).
- **Integración:** captura contra `tests/fixtures/`, una página local mínima. Nunca contra apps reales.
- Las apps reales solo se tocan al renderizar tours, a mano.
