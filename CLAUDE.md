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

- **Stack:** TypeScript sobre Node 24 (`.node-version`, vía `fnm`), `playwright-core` con el Chrome del sistema, YAML + zod, ffmpeg del sistema, esbuild para el script que se inyecta en la página, Vitest.
- **Type stripping:** Node ejecuta los `.ts` directo, así que solo vale sintaxis borrable. Nada de `enum`, `namespace` ni parameter properties; imports con extensión `.ts` e `import type` para tipos.
- **Pipeline:** voice → timeline → capture → overlays → compose. Cada etapa escribe en `out/<project>/<tour>/` y solo lee lo de la anterior.
- **La timeline es la única que calcula tiempos.** Es una función pura; las demás etapas ejecutan lo que dice.
- **Voz intercambiable.** Todo proveedor implementa `VoiceProvider.synthesize()` y devuelve audio + palabras con tiempos. Nada fuera de `src/voice/<provider>/` conoce al proveedor.
- **Zoom = cámara virtual.** Se captura con densidad alta (`deviceScaleFactor` calculado en `devices.ts`) y cada cuadro es un `screenshot({ clip })` del rectángulo de la cámara; la página nunca se transforma. El anillo y el clic dibujado sí van en el DOM.
- **Overlays en ffmpeg.** Se renderizan aparte con fondo transparente y se componen encima; nunca se inyectan en la app.
- **Captura determinista.** El reloj de la página se congela y avanza 1/fps por cuadro; las esperas de red ocurren fuera del tiempo del video.
- **Dispositivo:** `desktop` → 16:9, `mobile` → 9:16 con emulación.

## Sesión y secretos

- `FISH_API_KEY` y cualquier otra clave van en `.env`, nunca al repo.
- **Login.** `walkthrough login <session> <url>` abre Chrome con un perfil propio en `.auth/<session>/` (ignorado por git). El autor inicia sesión a mano y cierra la ventana; los renders reutilizan ese perfil. Es un perfil persistente y no una foto con `storageState`, porque Supabase rota el refresh token en cada uso y una foto caduca tras el primer render. Un perfil admite un solo navegador a la vez.
- Claude nunca teclea credenciales en sitios reales. Las credenciales no van en tours, en código ni en commits.

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
