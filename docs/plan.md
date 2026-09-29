# Plan de mejoras

Escrito el 28/sep/2026, después de la primera versión completa (tour de uws-tasks con voz, música, efectos de sonido y overlays).

**Fuera por ahora:** los subtítulos. Siguen en el código, pero se apagan por defecto (fase 0).

## Orden y por qué

1. **Fase 0 — Limpieza.** Deja el terreno parejo antes de crecer.
2. **Fase 1 — Iterar barato.** Validar, previsualizar y explorar. Hace que todo lo demás cueste menos de probar.
3. **Fase 2 — Mejor video.** Cámara, cursor, scroll y transiciones.
4. **Fase 3 — Variedad.** Más sonidos y una biblioteca de elementos HTML.
5. **Fase 4 — Robustez.** Datos que cambian, sesiones que caducan, onboardings y móvil.
6. **Fase 5 — Tour de uws-tasks v2.** Aplica todo lo anterior y recorre más vistas.
7. **Fase 6 — Flujos.** Diagramas de pasos que aparecen al ritmo de la voz, con directrices para usarlos en cualquier video (añadida el 29/sep/2026).

Cada fase termina con pruebas en verde, documentación al día y commits que compilan por separado.

---

## Fase 0 — Limpieza ✅ (28/sep/2026)

De paso apareció y se corrigió una carrera al congelar el reloj: `pauseAt` rechazaba el objetivo cuando la máquina tardaba más de 1 ms entre leer y pausar. Ahora usa un margen de 25 ms y reintenta.

| Tarea | Detalle |
|---|---|
| Subtítulos apagados | `subtitles: none` por defecto; un tour puede pedir `karaoke`. |
| Node 24 | Instalado con `fnm` (v24.21.0, `arm64`, con `FNM_ARCH=arm64`). |
| Documentación | Quitar esbuild del stack (no se usa: el runtime se serializa como función) y marcar el primer hito de `arranque.md` como hecho. |
| Dividir `capture.ts` | Separar en `actions.ts` (qué hace cada acción), `cursor.ts` (plan del puntero) y el ciclo de cuadros. |
| Dividir el CLI | Un archivo por comando en `src/cli/commands/`. |
| Commits sanos | Cada commit pasa `tsc` y las pruebas por sí solo. |

## Fase 1 — Iterar barato ✅ (28/sep/2026)

Resultados en uws-tasks: `check` en 9 s (18 ✓, 1 ⚠ por el selector `UWS-8324`), `inspect` de 6 rutas en 45 s y vista previa en 2 min 10 s contra ~11 min del render final.

### 1.1 `walkthrough check <tour>`

Valida en segundos lo que hoy se descubre a mitad de una captura de 6 minutos.

- Abre la sesión en headless, **sin capturar cuadros** y con el reloj corriendo normal.
- Ejecuta las acciones en orden, porque cada selector depende de la pantalla en la que se está.
- Reporta por acción: ✓ encontrado y visible, ✗ no existe, ⚠ existe pero oculto o con varios resultados.
- Si un selector falla, sugiere elementos parecidos: mismo texto, mismo `data-tour`.
- Detecta la sesión caducada (redirección al login) y onboardings abiertos.
- Si la voz ya está en caché, valida también las anclas por palabra.

Hace los mismos clics que el render, así que no agrega riesgo nuevo. Por la misma razón, los tours no deben tener acciones destructivas.

### 1.2 `walkthrough render --preview`

- Captura a densidad 1, 15 fps y salida de 960×540 (o 540×960 en móvil).
- Objetivo: 4 a 5 veces más rápido que el render final.
- No se publica en `~/Movies`: queda en la carpeta de trabajo y la galería lo muestra aparte como «Vista previa».

### 1.3 `walkthrough inspect <url> [--session=<nombre>]`

Convierte en comando los scripts improvisados que usé para explorar uws-tasks.

- **Solo lectura:** navega, pero no hace clics.
- **Reúne por ruta:** enlaces de navegación; anclas estables (`data-tour`, `data-testid`, `aria-label`, roles); encabezados, botones y campos; diálogos u onboardings abiertos; contenedores con scroll horizontal o vertical.
- **Salida:** un reporte Markdown con captura por pantalla en la carpeta de trabajo. Es la base para que Claude escriba tours nuevos (dymmsa, portafolio, Reel Express).

## Fase 2 — Mejor video ✅ (28/sep/2026)

Detalle en `docs/arquitectura.md`: «Cámara virtual», «Movimiento y scroll» y «Transiciones entre pantallas». El centrado horizontal contra un borde sin scroll (el sidebar) sigue siendo un límite: ahí no hay píxeles fuera de la pantalla.

### 2.1 Encuadre de la cámara

- **Zoom proporcional:** el elemento ocupa ~60 % del ancho del cuadro, entre 1,2× y 2×, en vez de ir siempre al máximo. Se puede fijar con `zoom: { to, scale }`.
- **Centrado real:** si el elemento está pegado al borde, primero se hace scroll suave para alejarlo del borde y luego se encuadra. Hoy la cámara choca con el límite y mete medio sidebar.
- **Seguimiento:** con `zoom: { to, follow: true }`, mientras hay zoom la cámara se desplaza para mantener el cursor en una zona segura.

### 2.2 Cursor natural

- Trayectoria en curva suave (Bézier con un arco leve), no en línea recta.
- Duración según la distancia: entre 0,35 s y 0,9 s, en vez de 0,7 s fijos.
- Sigue sembrado por acción: el mismo tour produce el mismo movimiento.

### 2.3 Scroll suave

- **Acción nueva:** `scroll: { to: <selector> | top | bottom, within: <contenedor>, duration }`. Anima `scrollTop` o `scrollLeft` cuadro por cuadro con easing, de forma determinista.
- **Automático:** si el objetivo de un clic o un zoom está fuera de pantalla, se desplaza suave en vez de saltar.
- **Horizontal:** permite recorrer las columnas del Board (`within: "[data-tour=board]"`).

### 2.4 Transiciones entre pantallas

- `click: { on, wait: <selector> }` y una acción `wait` esperan a que la siguiente pantalla esté lista fuera del tiempo del video, como ya hace `goto`. Así no aparecen estados de carga a medias.

## Fase 3 — Variedad ✅ (28/sep/2026)

Detalle en `docs/arquitectura.md`: «Montaje» (efectos), «Overlays» (plantillas) y «Etiquetas».

### 3.1 Efectos de sonido

- **Variantes por sonido** (3 de clic, 2 de pop), elegidas de forma determinista por acción, para que no suene repetitivo.
- **Trazo proporcional:** el rasgueo dura lo mismo que el trazo, también en anillos largos.
- **Sonidos nuevos, todos sutiles:**
  - *whoosh* al hacer zoom;
  - barrido suave al cambiar de pantalla;
  - teclitas en `type`, una por carácter;
  - roce leve en el scroll.
- **Configuración por tour:** `sfx: false | true | { volume, disable: [zoom, scroll] }`.

### 3.2 Biblioteca de elementos HTML

- **Plantillas compartidas** en `templates/overlays/`. `src` busca primero en la carpeta del tour y después en la común.
  - *lower-third*, que se mueve ahí desde uws-tasks;
  - tarjeta de título a pantalla completa para abrir;
  - cierre con llamado a la acción;
  - indicador de capítulo («2/6 · Board»);
  - chip de atajo de teclado;
  - comparación antes/después con dos imágenes.
- **Etiquetas pegadas a un elemento:** `label: { on, text }`, una flecha y un texto a mano junto al elemento. Va en la capa de efectos de la página, no como overlay, porque tiene que moverse con la cámara y con el scroll.

## Fase 4 — Robustez (en curso)

Hecho el 29/sep/2026: datos que cambian, sesión caducada, onboardings (`setup:`) y `doctor`. Falta el primer tour real en móvil.

| Tarea | Detalle |
|---|---|
| Datos que cambian | Preferir selectores por estructura (`[data-tour=card] >> nth=0`) a selectores por dato (`UWS-8324`). `check` avisa cuando un selector depende de datos. |
| Sesión caducada | Después de cada navegación, si la app redirige al login, el render se detiene con «corre `walkthrough login <sesión>`». |
| Onboardings | `setup:` a nivel tour: claves de `localStorage` o selectores que se cierran después de cada navegación. Ya no hay que cerrarlos a mano en el perfil. |
| `walkthrough doctor` | Revisa Node, ffmpeg (y la versión con el bug de `asplit`), Chrome, `FISH_API_KEY`, la voz por defecto y las sesiones guardadas. |
| Móvil | Primer tour real en 9:16 (portafolio o Reel Express) y corrección de lo que salga. |

## Fase 5 — Tour de uws-tasks v2

Con `inspect`, scroll, etiquetas y la biblioteca de overlays:

- Recorrer más vistas: Cards, los filtros abiertos, «What is this?», el Board completo con scroll horizontal y el detalle de Reports.
- Indicador de capítulo por sección.
- Selectores estables, validados con `check` antes de renderizar.

## Fase 6 — Flujos sincronizados con la voz

Explicar un proceso («cómo se reserva una mesa», «cómo se asigna un ticket») con pasos conectados que aparecen justo cuando la narración los nombra. El autor del tour escribe solo los pasos y la palabra de cada uno; el layout, la coreografía y el sonido salen del repo, iguales en todos los videos.

### 6.1 Motor y forma lineal

- **`flow:` en el segmento**, al lado de `say`: `steps` (texto, detalle opcional y `at`, la palabra en que aparece), `title`, `mode` (`full` o `card`) y `from`/`to` como los overlays.
- **La timeline resuelve los tiempos.** Cada `at` se busca en la narración después del paso anterior, así una palabra repetida no se confunde. Sin `at`, los pasos se reparten a lo largo de la frase.
- **Layout puro** en `src/flow/`: posiciones, cortes de texto y flechas a partir de la forma y del tamaño del cuadro. Horizontal en 16:9 y vertical en 9:16. Probado sin navegador: nada se encima, todo cabe y el texto no se corta.
- **Coreografía pura:** la flecha se dibuja hacia el paso justo antes de la palabra, la caja entra con la palabra, un anillo a mano marca el paso activo y los anteriores bajan de intensidad.
- **Plantilla `templates/overlays/flow.html`**: solo pinta lo que calcula Node, con el color de acento del tour y las flechas y anillos a mano de la capa de efectos.
- **Sonido:** un *pop* por caja y un trazo por flecha, en vez de un solo *pop* por overlay.
- **`check`** avisa de pasos demasiado juntos para leerse y de textos que no caben.

### 6.2 Directrices

- **Skill del repo** (`.claude/skills/flow/`): cuándo usar un flujo y qué forma, cómo escribir la narración para que cada paso tenga su palabra, cuántos pasos caben y cómo revisar el resultado antes de entregarlo.
- **Guía** en `docs/flujos.md`, con las mismas reglas para el autor.

### 6.3 Más formas

- **Decisión:** un paso que se bifurca en «sí» y «no».
- **Ciclo:** pasos que regresan al inicio (entregas semanales, sprints).
- **Carriles:** quién hace qué (huésped, venue, host).
- **Antes y después:** dos flujos lado a lado.

### 6.4 Catálogo

Un tour de ejemplos con todas las formas en 16:9 y 9:16: catálogo visual para elegir y prueba de regresión.

Referencia visual: [archify](https://github.com/tt-a1i/archify) (MIT). Se toman ideas (esquema por forma, validación del layout, carriles y fases), no código: su visor es interactivo, no va al ritmo de la voz y su estética es de documentación técnica.

## Estimación

| Fase | Tamaño |
|---|---|
| 0 | Chica |
| 1 | Mediana (lo más valioso) |
| 2 | Mediana-grande (2.1 y 2.3 son lo más delicado) |
| 3 | Mediana |
| 4 | Mediana |
| 5 | Chica, una vez hecho lo anterior |
| 6 | Mediana (6.1 es lo más grande) |
