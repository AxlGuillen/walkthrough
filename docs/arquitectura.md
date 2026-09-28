# Arquitectura

Decidida el 28/sep/2026. Complementa a `docs/arranque.md` (qué y para qué); aquí va el cómo.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto sobre **Node 24** | Node 24 ejecuta `.ts` directo (type stripping): sin paso de build. |
| Versión de Node | `fnm` + `.node-version` | Node 24 solo para este repo; el Node global de los otros proyectos no se toca. |
| Navegador | `playwright-core` con el Chrome del sistema (`channel: 'chrome'`) | Emulación de dispositivos, `storageState`, locators, `boundingBox()`, control del reloj. No descarga navegadores. |
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
| **capture** | timeline + sesión | `frames/` | No: navegador |
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
1. Se captura a doble resolución (`deviceScaleFactor: 2`).
2. La cámara es un rectángulo sobre esa captura: para cada cuadro se recorta y se escala a la salida.
3. El destino de un zoom es el `boundingBox()` del selector, con margen, ajustado a la proporción del video y limitado a la pantalla.
4. Entre destinos, la cámara interpola con easing.

El zoom máximo sin pérdida es 2×. Calcular el rectángulo por cuadro (`cameraAt`) y ajustar un destino (`fitRect`) son funciones puras.

El anillo de resaltado y el clic dibujado **sí** van en la página: se inyectan en el DOM y quedan dentro del recorte de forma natural.

## Captura determinista

El video no se graba en tiempo real. El tiempo del video avanza solo cuando se toma un cuadro:
- **Entre cuadros**, el reloj de la página está congelado (timers, `requestAnimationFrame`, animaciones CSS/WAAPI) y se avanza exactamente 1/fps.
- **Las esperas** (navegación, red, carga de una pantalla) ocurren fuera del tiempo del video: la app corre libre hasta quedar lista y la captura sigue. Los spinners no salen en el video.
- **Los efectos inyectados** (anillo, clic) se animan con el mismo reloj, así que también son deterministas.

⚠️ **Es la hipótesis más riesgosa y la valida el primer hito.** Plan B: screencast de Chrome (`Page.startScreencast`), más simple pero con fps irregulares.

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
- **Duración real** con `ffprobe`.
- **Etiquetas de expresión** (`[excited]`) filtradas de las palabras dentro del adaptador.

## Sesión

`walkthrough login <session> <url>` abre Chrome visible; el autor inicia sesión a mano y al cerrar se guarda `storageState` en `.auth/<session>.json` (ignorado por git). La captura lo restaura.

## CLI

```
walkthrough login  <session> <url>     guardar sesión
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
.auth/  out/  .env            ignored by git
```

## Pruebas

- **Unitarias (la mayoría):** esquema, anclas por palabra, timeline, cámara, subtítulos ASS, argumentos de ffmpeg, clave de caché, parser del stream SSE de Fish (con un fixture grabado).
- **Integración:** captura contra `tests/fixtures/`, una página local mínima. Nunca contra apps reales.
- Las apps reales solo se tocan al renderizar tours, a mano.
