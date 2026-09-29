# walkthrough — definición

Reescrito el 28/sep/2026 a partir del informe de arranque original, con el qué y el para qué ya decididos. El cómo (voz, zoom en el DOM, sesión) se conserva del informe.

## Qué es

Una herramienta personal que toma una app web real y produce un **video narrado** que la recorre: navega entre pantallas, hace zoom a lo importante, marca cada clic con un circulito dibujado y explica con voz qué se ve y qué se agregó.

No es una herramienta de QA ni de pruebas e2e. Es para **mostrar** trabajo.

## Para qué

| Proyecto | Quién lo ve | Para qué |
|---|---|---|
| uws-tasks | Compañeros | Enseñar la app rápido |
| dymmsa | Cliente | Entrega semanal: qué botones y módulos se agregaron, sin ir paso a paso en vivo |
| Portafolio, Reel Express | Cualquiera | Tours cortos y demostrativos del trabajo propio |

Fuera de alcance por ahora: Reel Editor (no es web; segundo alcance) y la generación automática desde PRs o Jira (posible a futuro, no cerrarle la puerta).

## Flujo

1. **Explorar.** Claude recorre la app con el navegador y ubica pantallas y selectores.
2. **Guion.** Claude escribe el tour: segmentos con narración + acciones. El autor lo revisa antes de renderizar.
3. **Voz primero.** Se sintetiza la narración; la duración de cada frase fija cuánto dura cada segmento. La sincronía sale del audio, no de tiempos puestos a mano.
4. **Grabar.** El navegador ejecuta las acciones con esos tiempos. Resaltado y clic dibujado van inyectados en el DOM; el zoom es una cámara virtual que recorta la captura. Todo apunta a selectores.
5. **Montar.** MP4 con voz, efectos de sonido y, si se pide, música. Los subtítulos karaoke existen, pero están apagados por defecto.

Se ejecuta a mano, desde la terminal.

## Decisiones

**Formato según el tour.** Cada tour declara su dispositivo:
- `desktop` → horizontal 16:9.
- `mobile` → vertical 9:16, con emulación de móvil (viewport, touch, user agent).

**Voz intercambiable.** Hoy Fish Audio (`s2.1-pro-free`, gratis, con timestamps por palabra). Queda detrás de una interfaz mínima:

```
sintetizar(texto, idioma) → { audio, palabras: [{ texto, inicio, fin }] }
```

Nada fuera del adaptador sabe qué proveedor se usa. Si uno futuro no da timestamps, se obtienen del audio con un alineador forzado, dentro de su adaptador.

**Idioma.** Español por defecto; inglés solo cuando el tour lo indique.

**Música opcional.** Stock, muy sutil, con ducking bajo la voz. Se activa por tour. Cada pista con su licencia anotada en `CREDITOS.md` al lado.

**Overlays.** Cualquier segmento puede poner cuadros HTML propios encima del video: títulos, notas, logos, imágenes, clips. Viven en la carpeta del tour, declaran cuándo entran y salen, y no se escalan con el zoom de la app.

**Repo privado.** Los tours de todos los proyectos, clientes incluidos, viven aquí en `tours/<proyecto>/`.

**Sesión.** uws-tasks usa Google; dymmsa y Reel Express, correo y contraseña. En todos los casos:
- Un comando abre Chrome con un perfil propio, **el autor inicia sesión a mano** y el perfil queda guardado en `.auth/`, ignorado por git.
- Cada render reutiliza ese perfil; nunca teclea credenciales.
- Credenciales y estados de sesión nunca van al repo ni al guion.

## Relación con presentations

`presentations/tools/` ya resolvió voz, timestamps, subtítulos karaoke y render cuadro a cuadro. **No se comparte código ni se crea un paquete:** allá se hacen decks y aquí tours. Se usa solo como referencia; lo aprendido está resumido en `CLAUDE.md`.

De narrated-web-app-demo (sobre `splitbrain/ndemo`) se toma la arquitectura, no el código: guion por segmentos, captura de sesión y su lista de gotchas (`<select>` nativos, subida de archivos, cuelgues del render).

## Gotchas conocidos

- `document.hidden` detiene `requestAnimationFrame` y aborta View Transitions. En headless, verificar que la página se considere visible.
- Zoom, resaltado y overlays apuntan a selectores o a tiempos, nunca a píxeles puestos a mano. Así sobreviven a cambios de CSS. El detalle está en `docs/arquitectura.md`.

## Reglas de desarrollo

- Código, comentarios y commits en inglés; documentación en español.
- Comentarios breves, solo para lo que el código no puede decir.
- Calidad antes que rapidez.
- La lógica nueva llega con pruebas; funciones puras que se prueben sin navegador.
- Commits convencionales, concisos, en inglés, sin atribución a IA.
- Sin dependencias en runtime por CDN; se vendoriza.

## Primer hito — hecho el 28/sep/2026

Un caso de punta a punta antes de construir andamiaje, sobre uws-tasks en desktop. Resultó en `tours/uws-tasks/tablero.yaml`: 55 s con voz, música, efectos y overlays. Lo siguiente está en `docs/plan.md`.

1. Sesión restaurada.
2. Dos pantallas: login y tablero.
3. Zoom a una tarjeta de ticket y clic dibujado.
4. Dos frases narradas con Fish.
5. MP4 montado con ffmpeg.

## Pregunta técnica resuelta

La captura determinista funciona sobre una app viva: se validó con uws-tasks el 28/sep/2026. El detalle está en `docs/arquitectura.md`, «Captura determinista».
