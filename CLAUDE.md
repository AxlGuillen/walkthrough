# CLAUDE.md

Herramienta personal que convierte una app web real en un video narrado: recorre pantallas, hace zoom a lo importante, dibuja cada clic y narra qué se ve. La definición completa (qué, para qué, flujo y decisiones) está en `docs/arranque.md`; léela antes de proponer cambios de alcance.

Repo **privado**. Contiene tours de proyectos de clientes.

## Idioma

| Qué | Idioma |
|---|---|
| Código: identificadores, archivos, claves de configuración y de los tours | Inglés |
| Comentarios en código | Inglés |
| Commits | Inglés |
| Documentación (`docs/`, este archivo) | Español |
| Narración de los videos | Español por defecto; inglés solo si el tour lo indica |

## Código

- **El código se explica solo.** Nombres claros y funciones pequeñas antes que comentarios.
- Comentarios solo para lo que el código no puede decir: una restricción externa, un gotcha, una decisión no obvia. Una o dos líneas. Nada de cabeceras largas, narración paso a paso ni JSDoc que repita la firma.
- Calidad antes que rapidez: la solución correcta antes que la rápida.
- La lógica nueva llega con pruebas. Todo lo que se pueda (tiempos, guion, subtítulos, cálculo de zoom) va en funciones puras que se prueban sin navegador.
- Nada de dependencias en runtime por CDN. Si algo hace falta dentro de la página grabada, se vendoriza.

## Commits

Convencionales (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), concisos y en inglés. **Sin `Co-Authored-By` ni ninguna atribución a IA.**

## Arquitectura

El detalle vive en `docs/arquitectura.md`. Lo que no se puede olvidar:

- **Stack:** TypeScript sobre Node 24 (`.node-version`, vía `fnm`), `playwright-core` con el Chrome del sistema, YAML + zod, ffmpeg del sistema, Vitest. El código que corre en la página son funciones autocontenidas que Playwright serializa, sin paso de build.
- **Node 24 nativo:** `fnm` instala Intel si su binario es Intel (Homebrew en `/usr/local`), así que `FNM_ARCH=arm64` va en `~/.zshrc`. Los shells no interactivos no cargan fnm: antepón `eval "$(fnm env --shell bash)" && fnm use`.
- **Bun es el gestor de paquetes** (`bun install`, `bun run …`, `bun.lock`); el runtime sigue siendo Node 24 porque todo depende del type stripping y de APIs de Node.
- **`bun run verify`** (typecheck + todas las pruebas) pasa antes de cada commit, y cada commit pasa por sí solo.
- **Type stripping:** Node ejecuta los `.ts` directo, así que solo vale sintaxis borrable. Nada de `enum`, `namespace` ni parameter properties; imports con extensión `.ts` e `import type` para tipos.
- **Pipeline:** voice → timeline → capture → overlays → compose → publish. Cada etapa escribe en la carpeta de trabajo del tour y solo lee lo de la anterior.
- **Nada generado en el repo.** El trabajo y la caché de voz van a `~/Library/Caches/walkthrough/`; los videos finales, uno por render, a `~/Movies/walkthrough/<project>/<tour>/` con un `.json` al lado. `walkthrough gallery` los muestra y `walkthrough clean` limpia. Los videos solo se mandan a la Papelera, nunca se borran.
- **La timeline es la única que calcula tiempos.** Es una función pura; las demás etapas ejecutan lo que dice.
- **Voz intercambiable.** Todo proveedor implementa `VoiceProvider.synthesize()` y devuelve audio + palabras con tiempos. Nada fuera de `src/voice/<provider>/` conoce al proveedor. Su `defaultVoice` (hoy «Drez» en Fish) mantiene una sola voz en toda la narración.
- **Efectos de sonido sintetizados** con ffmpeg en `src/compose/sfx.ts` (7 sonidos, con variantes), sin archivos ni licencias, y sacados de `events.json`, lo que realmente pasó en la captura. Una fuente por evento: `asplit` → `adelay` → `amix` cuelga ffmpeg 8.1.
- **Plantillas de overlay** en `templates/overlays/`; la carpeta del tour tiene prioridad. **Etiquetas** (`label`) en la capa de efectos, no como overlay, porque siguen al elemento.
- **Loudness en dos pasadas** (medir, luego `linear=true`). En una pasada `loudnorm` es un AGC y deshace los cambios de volumen de la música.
- **Zoom = cámara virtual.** Se captura con densidad alta (`deviceScaleFactor` calculado en `devices.ts`) y cada cuadro es un `screenshot({ clip })` del rectángulo de la cámara; la página nunca se transforma. El anillo y el clic dibujado sí van en el DOM. El zoom es proporcional al objetivo (1,2×–2×) y `follow: true` sigue al cursor.
- **Scroll y cursor preparados de antemano** (`prep.ts`): hasta 1,6 s antes de cada acción se hace scroll suave hacia el objetivo y el cursor viaja en curva a donde quedará. El scroll se aplica cuadro a cuadro con `behavior: 'instant'`, nunca con el smooth del navegador.
- **Efectos sin estado en la página.** Node calcula la escena de cada cuadro (`src/effects/`) y la página solo pinta el SVG en una capa `popover` del top layer. El cursor y la acción apuntan al centro del texto del elemento, no a su centro geométrico.
- **Flujos** (`flow:` en el segmento): pasos que aparecen con su palabra de la narración. La timeline los vuelve un overlay de `flow.html`; layout y coreografía son puros en `src/flow/`. Reglas en `docs/flujos.md`; la skill `flow` del repo guía cómo escribirlos.
- **Overlays en ffmpeg.** Cada HTML se renderiza aparte, con fondo transparente y su propio reloj desde cero, y se compone encima; nunca se inyecta en la app. `params` llegan como query string.
- **`<video>` sincronizado.** Tampoco obedece a `page.clock`: la sincronía lo pausa y lo busca al instante de cada cuadro, en la app y en los overlays.
- **Captura determinista.** El reloj de la página se congela y avanza 1/fps por cuadro; las esperas de red ocurren fuera del tiempo del video.
- **Antes de un render largo:** `walkthrough check <tour>` (segundos) y `walkthrough render --preview` (~5× más rápido). Para un proyecto nuevo, `walkthrough inspect <url> --session=<s>` da las anclas estables con las que escribir el tour.
- **Dispositivo:** `desktop` → 16:9, `mobile` → 9:16 con emulación.

## Sesión y secretos

- `FISH_API_KEY` y cualquier otra clave van en `.env`, nunca al repo.
- **Login.** `walkthrough login <session> <url>` abre Chrome con un perfil propio en `.auth/<session>/` (ignorado por git). El autor inicia sesión a mano y cierra la ventana; los renders reutilizan ese perfil. Es un perfil persistente y no una foto con `storageState`, porque Supabase rota el refresh token en cada uso y una foto caduca tras el primer render. Un perfil admite un solo navegador a la vez.
- Claude nunca teclea credenciales en sitios reales. Las credenciales no van en tours, en código ni en commits.
- **Sesión caducada:** si una navegación termina en un login, el render se detiene con el comando `walkthrough login` exacto.
- **Onboardings:** se declaran en el `setup:` del tour (`storage` y `dismiss`), no se cierran a mano en el perfil.
- **`walkthrough doctor`** revisa Node, ffmpeg, Chrome, Fish y las sesiones antes de un render.

## Música

- Las pistas viven en `tours/<project>/assets/music/`, con un `CREDITOS.md` al lado: pista, autor, fuente, licencia y fecha.
- La Pixabay Content License sirve porque el repo es privado: permite usar la pista en videos, pero no redistribuir el archivo suelto. **Pixabay no es CC0.**
- Se evitan pistas registradas en Content ID, que darían reclamos al subir el video a YouTube.
- Bajar cualquier pista requiere permiso del autor antes de la descarga.

## Relación con `presentations`

`presentations` (repo hermano) hace decks; este repo hace tours. **No se comparte código ni se crea un paquete común.** `presentations/tools/` sirve solo de referencia: se leen sus soluciones y se reescriben aquí, en inglés, con la forma que pida este proyecto.

Lo aprendido allá que aplica aquí:

- **Fish Audio.**
  - Endpoint: `POST https://api.fish.audio/v1/tts/stream/with-timestamp` con header `model: s2.1-pro-free`. Es gratis y devuelve timestamps por palabra en eventos SSE, agrupados por chunk con `chunk_audio_offset_sec`.
  - Qué cobra: el modelo `s1` y el ASR (`/v1/asr`).
  - Las voces del catálogo (`reference_id`) también son gratis y también devuelven timestamps.
- **El stream de Fish** (verificado el 28/sep/2026):
  - Solo el primer pedazo de audio trae cabecera WAV, y su tamaño es un placeholder (`0xFFFFFFxx`).
  - Los pedazos siguientes son PCM crudo y **no siguen al `chunk_seq`** de las palabras.
  - Las palabras vienen acumuladas por chunk; la última de cada `chunk_seq` es la completa, desplazada por `chunk_audio_offset_sec`.
  - Por eso el adaptador junta todo el PCM y reescribe la cabecera. **La duración sale de los bytes de PCM**, no de la que reporta la API.
  - Las palabras llegan sin puntuación, y las etiquetas `[excited]` ya no aparecen en `content`.
- **Etiquetas de expresión.** Fish acepta etiquetas como `[excited]` o `[break]` en el texto. El adaptador las filtra de las palabras por si alguna vuelve en el alignment.
- **Aire alrededor de la voz.** Un margen antes y después de cada frase (allá 0,35 s y 0,65 s) evita cortes secos entre segmentos.
- **Render determinista.** Allá las animaciones se renderizan cuadro a cuadro con seeks exactos en vez de grabar en tiempo real, así no se pierden frames. Es el enfoque preferido aquí si se puede aplicar a una app viva.
- **Karaoke.** Los subtítulos se generan en ASS con `{\k}`, en líneas de 3 palabras. En vertical, la letra y el margen inferior son mayores para no quedar bajo la interfaz de las redes.
- **Música con ducking.** Se hace con `sidechaincompress`. Referencia: voz a unos −16 LUFS y música entre −26 y −30 LUFS. Se cierra con `loudnorm`.
- **Captura determinista** (validada el 28/sep/2026):
  - `page.clock` controla timers, `Date`, `performance.now` y rAF, pero **no las animaciones CSS**. Esas las pausa y avanza un script en la página vía `document.getAnimations()`.
  - Instalar el reloj con la hora real: con la fecha por defecto, Supabase invalida la sesión.
  - En headless con perfil persistente, `document.hidden` es `false`, así que las animaciones corren.
- **Pestañas ocultas.** Con `document.hidden`, `requestAnimationFrame` no corre y las View Transitions se abortan. En headless, verificar que la página se considere visible.
