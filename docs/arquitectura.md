# Arquitectura

Decidida el 28/sep/2026. Complementa a `docs/arranque.md` (qué y para qué); aquí va el cómo.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto sobre **Node 24** | Node 24 ejecuta `.ts` directo (type stripping): sin paso de build. |
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
| **compose** | todo lo anterior | `video.mp4` | No: ffmpeg; los argumentos se construyen con funciones puras |

Cada etapa lee solo archivos de la anterior, así que se puede repetir por separado. Cambiar un overlay repite `overlays` y `compose`, sin volver a entrar a la app.

## Almacenamiento

Nada generado vive en el repo:

| Qué | Dónde | Se puede borrar |
|---|---|---|
| Archivos de trabajo (voz por segmento, timeline, captura, overlays) | `~/Library/Caches/walkthrough/tours/<project>/<tour>/` | Sí; se regeneran |
| Caché de voz | `~/Library/Caches/walkthrough/voice/` | Sí; cuesta volver a pedir la voz |
| Videos finales | `~/Movies/walkthrough/<project>/<tour>/<fecha_hora>.mp4` + `.json` con título, duración, dispositivo y tamaño | Solo a la Papelera |

- Se cambian con `WALKTHROUGH_WORK` y `WALKTHROUGH_VIDEOS`.
- **Cada render es un archivo nuevo**, así se pueden comparar versiones.
- **`walkthrough gallery`** abre `http://localhost:4717`, una página local para ver los videos por proyecto, mostrarlos en Finder, mandarlos a la Papelera o limpiar la caché. Solo escucha en `127.0.0.1` y rechaza acciones cuyo `Origin` no sea el suyo, para que otra página no pueda borrar nada. Sirve el video con `Range`, que Safari exige para reproducir.
- **`walkthrough clean`** borra los archivos de trabajo. Con `--voice` también borra la caché de voz, y con `--keep=<n>` manda a la Papelera todo menos los *n* renders más nuevos de cada tour. La carpeta vieja `out/` del repo, si existe, también va a la Papelera.
- **Nunca se borra un video de forma permanente**: va a `~/.Trash` con un nombre que no pisa lo que ya haya ahí.

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
      - zoom: { to: "[data-ticket='UWS-142']", at: "tarjeta" }
      - click: { on: "[data-ticket='UWS-142']", at: "estimado" }
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
2. La cámara es un rectángulo en px CSS: cada cuadro es un `screenshot({ clip })` de ese rectángulo, y ffmpeg lo escala a la salida (reconstruye el filtro `scale` cuando cambia el tamaño del recorte).
3. El destino de un zoom es el `boundingBox()` del selector, con margen, ajustado a la proporción del video y limitado a la pantalla.
4. Entre destinos, la cámara interpola con easing.

El zoom máximo sin pérdida es 2×. Calcular el rectángulo por cuadro (`cameraAt`) y ajustar un destino (`fitRect`) son funciones puras.

El anillo de resaltado y el clic dibujado **sí** van en la página: se inyectan en el DOM y quedan dentro del recorte de forma natural.

## Efectos en la página

Cursor, circulito de clic y anillo de resaltado.

- **La página no guarda estado.** En cada cuadro, Node calcula la escena a partir del tiempo del video (`src/effects/`, funciones puras) y la página solo pinta el SVG que recibe (`effectsLayer` en `src/capture/runtime.ts`). Así sobreviven a navegaciones y se prueban sin navegador.
- **La capa es un `popover` en el top layer**, con `pointer-events: none`. Se vuelve a mostrar en cada cuadro para quedar encima de los diálogos que abra la app.
- **El cursor sale antes** (`TIMING.travel`, 0,7 s) para llegar al objetivo justo cuando corre la acción, sin salir antes de la acción de puntero anterior. Si el objetivo aparece tarde, salta.
- **Se apunta al texto del elemento**, no a su centro geométrico. El centro de una fila de ancho completo puede quedar lejos de lo que se lee, e incluso fuera de la cámara. Playwright hace el clic o el hover en ese mismo punto.
- **Trazos a mano:** círculo con 1,1 vueltas y rectángulo redondeado con ruido suave y sembrado por acción (siempre igual en cada render). Se dibujan con `pathLength` + `stroke-dashoffset`.
- **Mobile:** sin cursor; solo el circulito en cada toque.
- **Tecleo visible:** `type` escribe a 14 caracteres por segundo, repartidos entre cuadros.
- **Color:** `accent` del tour (`#FF3B5C` por defecto).

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

- **Render aparte** (`src/overlays/render.ts`): cada overlay se abre en su propia página, al tamaño de salida, con `deviceScaleFactor: 1` y fondo transparente (`omitBackground`). Se guarda como `overlays/NN.mov` con PNG por cuadro, sin pérdida y con alfa.
- **Reloj propio que empieza en cero.** La página se carga con el reloj congelado, no vía `settle()`, así que sus animaciones de entrada arrancan justo cuando el overlay aparece en el video. Antes del primer cuadro se espera a las fuentes, imágenes y videos, por evento, porque los timers están congelados.
- **`params`** reutiliza una plantilla con distintos textos: el HTML los lee con `URLSearchParams`.
- **Montaje:** `setpts` desplaza el overlay a su inicio, `fade` con `alpha=1` lo desvanece y `overlay=eof_action=pass` lo compone en el orden del tour. Los subtítulos van encima de todo.
- **Lo que no le afecta:** el CSS de la app ni la cámara. Cambiar un overlay solo requiere `render --from=overlays`.
- **El lienzo** es el video completo (1920×1080 o 1080×1920). La posición la decide el CSS del overlay; los subtítulos ocupan la franja inferior.

## Video dentro de la página

`<video>` tampoco obedece a `page.clock`: corría con el reloj real y en la captura se veía acelerado. La misma sincronía que fija las animaciones CSS lo pausa y lo busca (`currentTime`) al instante exacto de cada cuadro, y espera `seeked` antes del screenshot. Respeta `loop`. Aplica a la app y a los overlays.

## Montaje (compose)

Una sola pasada de ffmpeg, ejecutada desde la carpeta de trabajo del tour con rutas relativas, porque las reglas de escape del filtro `ass` vuelven frágiles las rutas absolutas.

- **Video:** `capture.mp4` + subtítulos karaoke (`subs.ass`) quemados con libass.
- **Karaoke:** líneas de hasta 3 palabras; una pausa de más de 0,5 s abre línea nueva. Cada palabra pasa de blanco al `accent` mientras se dice, y `{\k}` dura hasta que empieza la siguiente. En vertical la letra es más grande y más alta, para no quedar bajo la interfaz de las redes. Se desactivan con `subtitles: none`.
- **Voz:** cada clip entra con `adelay` en el `speechStart` de su segmento.
- **Música opcional** (`music: { track, volume }`, ruta relativa a la carpeta del tour; `volume` 0,055 por defecto, que deja la música unos 12 dB bajo la voz en las pausas): en loop, con fade de entrada y salida y ducking con `sidechaincompress` bajo la voz.
- **Efectos de sonido** (`sfx: true` por defecto): «tic» en cada `click` y `type`, rasgueo de plumón al dibujar un `highlight` (dura lo mismo que el trazo) y «pop» al aparecer un overlay. Se sintetizan con ffmpeg (`aevalsrc`, `anoisesrc` con semilla fija): sin licencias, sin archivos y sonando igual en cada render. Entran después del ducking, así que no bajan la música. ⚠️ Cada evento tiene su propia fuente: en ffmpeg 8.1, `asplit` → `adelay` → `amix` se queda girando para siempre, incluso con dos eventos.
- **Loudness en dos pasadas.** Primero se mide solo el audio (`loudnorm` con `print_format=json`) y luego se monta aplicando esa medición con `linear=true`: una sola ganancia hasta −16 LUFS que respeta la proporción entre voz, música y efectos. En una pasada, `loudnorm` actúa como control automático de ganancia y levanta los pasajes quietos: bajar la música no se notaba.
- **Tiempo máximo.** El montaje tiene un límite de 10 veces la duración (mínimo 2 minutos) y se mata con SIGKILL: un grafo atorado ignora SIGTERM.
- **Repetir solo el montaje:** `render --from=compose` reutiliza `capture.mp4`. Sirve para cambiar subtítulos, música o color sin recapturar.

## Voz

```ts
interface VoiceProvider {
  synthesize(request: { text: string; language: Language; voice?: string }): Promise<Speech>;
}
// Speech = { audio: Buffer, words: { text, start, end }[] }
```

- **Una sola voz en todo el tour.** Sin `reference_id`, Fish puede elegir una voz distinta en cada llamada. El adaptador expone `defaultVoice` («Drez», `47a92a11ad4a4b79aac40ad587fa61b1`, español, narrador calmado) y un tour la cambia con `voice:`.
- **Caché** en `~/Library/Caches/walkthrough/voice/<sha256>`. La clave incluye proveedor, modelo, voz, idioma, texto y prosodia.
- **Duración real** calculada de los bytes de PCM, después de reconstruir la cabecera WAV del stream.
- **Etiquetas de expresión** (`[excited]`) filtradas de las palabras dentro del adaptador.

## Sesión

`walkthrough login <session> <url>` abre Chrome con un perfil propio en `.auth/<session>/`, ignorado por git. El autor inicia sesión a mano y cierra la ventana. La captura abre ese mismo perfil con `launchPersistentContext`.

**Por qué un perfil y no `storageState`.** Supabase rota el refresh token cada vez que lo usa. Una foto de la sesión quedaría vieja después del primer render, y el perfil se mantiene al día solo. El costo es un navegador a la vez por perfil.

**No sirve la sesión del Chrome personal.** Ese perfil está bloqueado mientras Chrome está abierto, y automatizarlo mezclaría la navegación real con la herramienta.

## CLI

```
walkthrough login  <session> <url>     iniciar sesión a mano, una vez
walkthrough voice  <tour>              solo voz: para oírla y revisar tiempos
walkthrough render <tour> [--from=overlays|compose]
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
  compose/      ffmpeg args, subtitles (ASS), music
tests/fixtures/ local page for integration tests
tours/<project>/<tour>.yaml + overlays/ + assets/
.auth/<session>/  .env          ignored by git
```

## Pruebas

- **Unitarias (la mayoría):** esquema, anclas por palabra, timeline, cámara, subtítulos ASS, argumentos de ffmpeg, clave de caché, parser del stream SSE de Fish (con un fixture grabado).
- **Integración:** captura contra `tests/fixtures/`, una página local mínima. Nunca contra apps reales.
- Las apps reales solo se tocan al renderizar tours, a mano.
