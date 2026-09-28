# Arquitectura

Decidida el 28/sep/2026. Complementa a `docs/arranque.md` (qué y para qué); aquí va el cómo.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto sobre **Node 24** | Node 24 ejecuta `.ts` directo (type stripping): sin paso de build. |
| Versión de Node | `fnm` + `.node-version` | Node 24 solo para este repo; el Node global de los otros proyectos no se toca. |
| Navegador | `playwright-core` con el Chrome del sistema (`channel: 'chrome'`) | Emulación de dispositivos, perfiles persistentes, locators, `boundingBox()`, control del reloj. No descarga navegadores. |
| Tours | YAML (`yaml`) validado con `zod` | Cómodo de revisar a mano; zod da errores claros y los tipos salen del esquema. |
| Voz | Adaptador Fish Audio + caché en disco | Un cambio de cámara no vuelve a pedir la voz. |
| Montaje | `ffmpeg` / `ffprobe` del sistema | Llamados directo con `execFile`, sin wrappers. |
| Efectos en página | TypeScript propio empaquetado con `esbuild` | Se inyecta como un solo script; sin CDN ni GSAP. |
| Pruebas | Vitest | Lógica pura sin navegador; integración contra una página fixture local. |
| CLI | `node:util` `parseArgs` | Pocos comandos, cero dependencias. |

**Restricción del type stripping:** solo sintaxis borrable. Nada de `enum`, `namespace` ni parameter properties; imports con extensión `.ts` e `import type` para tipos. `tsconfig` lo impone con `erasableSyntaxOnly` y `verbatimModuleSyntax`.

## Pipeline

```
tour.yaml ──┐
            ├─► timeline ─► capture ─► compose ─► video.mp4
voice ──────┘   (pure)      frames     ffmpeg
```

| Etapa | Entrada | Salida en `out/<project>/<tour>/` | ¿Pura? |
|---|---|---|---|
| **voice** | narración de cada segmento | `voice/NN.wav` + `voice/NN.json` (palabras) | No: red, con caché |
| **timeline** | tour + resultado de voz | `timeline.json` | **Sí** |
| **capture** | timeline + sesión | `capture.mp4` (solo video, a tamaño de salida) | No: navegador |
| **overlays** | timeline + HTML de overlays | `overlays/` (cuadros con alfa) | No: navegador |
| **compose** | todo lo anterior | `video.mp4` | No: ffmpeg; los argumentos se construyen con funciones puras |

Cada etapa lee solo archivos de la anterior, así que se puede repetir por separado. Cambiar un overlay repite `overlays` y `compose`, sin volver a entrar a la app.

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
- **Adelanto de las animaciones ya presentes al cargar.** Corren con el reloj real hasta que la primera sincronía las pausa: unos milisegundos, hasta ~50 ms con la máquina cargada. Las que dispara una acción se sincronizan en el mismo cuadro.
- **El reloj falso arranca en la hora real** (`clock.install({ time: Date.now() })`). Con la fecha por defecto, Supabase daría el token por inválido.

El plan B (screencast de Chrome) queda descartado mientras esto aguante.

## Overlays

Cada overlay es un HTML propio en la carpeta del tour, con sus assets. Se renderiza en una página aparte, a tamaño de salida y con fondo transparente, cuadro a cuadro durante su intervalo. ffmpeg lo pone encima con `overlay`.

Por vivir fuera de la app: no le afecta su CSS, no se escala con la cámara y cambiarlo no obliga a recapturar.

## Voz

```ts
interface VoiceProvider {
  synthesize(request: { text: string; language: Language; voice?: string }): Promise<Speech>;
}
// Speech = { audio: Buffer, words: { text, start, end }[] }
```

- **Caché** en `out/.cache/voice/<sha256>`. La clave incluye proveedor, modelo, voz, idioma, texto y prosodia.
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
walkthrough render <tour> [--from=capture|overlays|compose]
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
.auth/<session>/  out/  .env   ignored by git
```

## Pruebas

- **Unitarias (la mayoría):** esquema, anclas por palabra, timeline, cámara, subtítulos ASS, argumentos de ffmpeg, clave de caché, parser del stream SSE de Fish (con un fixture grabado).
- **Integración:** captura contra `tests/fixtures/`, una página local mínima. Nunca contra apps reales.
- Las apps reales solo se tocan al renderizar tours, a mano.
