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
8. **Fase 7 — Biblioteca de recursos animados.** Aperturas, gráficas y código como piezas reutilizables que se declaran en el YAML y van al ritmo de la voz (añadida el 30/sep/2026).
9. **Fase 8 — Marca, texturas y emojis.** Logos y colores por proyecto, fondos con textura y emojis cuidados dentro de los recursos (añadida el 1/oct/2026).
10. **Fase 9 — Resaltar con variedad, tablas, líneas de tiempo y marcos.** Más formas de señalar lo que importa en la app y tres recursos nuevos (añadida el 1/oct/2026).
11. **Fase 10 — Escenario 3D.** Propuesta, sin empezar: la grabación dentro de un escenario HTML con cámara en perspectiva, transiciones propias y escenas con profundidad (añadida el 2/oct/2026).

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

## Fase 4 — Robustez ✅ (29/sep/2026)

Hecho el 29/sep/2026: datos que cambian, sesión caducada, onboardings (`setup:`), `doctor` y el primer tour real en móvil (`tours/portfolio/axl13.yaml`, 9:16, con un flujo de carriles). Salió de ahí el texto sobre el acento: con un acento claro (el lima del portafolio) el blanco no se leía.

| Tarea | Detalle |
|---|---|
| Datos que cambian | Preferir selectores por estructura (`[data-tour=card] >> nth=0`) a selectores por dato (`UWS-8324`). `check` avisa cuando un selector depende de datos. |
| Sesión caducada | Después de cada navegación, si la app redirige al login, el render se detiene con «corre `walkthrough login <sesión>`». |
| Onboardings | `setup:` a nivel tour: claves de `localStorage` o selectores que se cierran después de cada navegación. Ya no hay que cerrarlos a mano en el perfil. |
| `walkthrough doctor` | Revisa Node, ffmpeg (y la versión con el bug de `asplit`), Chrome, `FISH_API_KEY`, la voz por defecto y las sesiones guardadas. |
| Móvil ✅ | Primer tour real en 9:16: el portafolio (axl13.dev), con taps en la barra inferior, scroll, etiqueta, carriles y cierre. |

## Fase 5 — Tour de uws-tasks v2

Con `inspect`, scroll, etiquetas y la biblioteca de overlays:

- Recorrer más vistas: Cards, los filtros abiertos, «What is this?», el Board completo con scroll horizontal y el detalle de Reports.
- Indicador de capítulo por sección.
- Selectores estables, validados con `check` antes de renderizar.

## Fase 6 — Flujos sincronizados con la voz ✅ (30/sep/2026)

Hecho el 29/sep/2026: 6.1, 6.2 y 6.3. El catálogo (6.4) quedó dentro del catálogo de recursos de la fase 7.5.

Explicar un proceso («cómo se reserva una mesa», «cómo se asigna un ticket») con pasos conectados que aparecen justo cuando la narración los nombra. El autor del tour escribe solo los pasos y la palabra de cada uno; el layout, la coreografía y el sonido salen del repo, iguales en todos los videos.

### 6.1 Motor y forma lineal ✅

- **`flow:` en el segmento**, al lado de `say`: `steps` (texto, detalle opcional y `at`, la palabra en que aparece), `title`, `mode` (`full` o `card`) y `from`/`to` como los overlays.
- **La timeline resuelve los tiempos.** Cada `at` se busca en la narración después del paso anterior, así una palabra repetida no se confunde. Sin `at`, los pasos se reparten a lo largo de la frase.
- **Layout puro** en `src/flow/`: posiciones, cortes de texto y flechas a partir de la forma y del tamaño del cuadro. Horizontal en 16:9 y vertical en 9:16. Probado sin navegador: nada se encima, todo cabe y el texto no se corta.
- **Coreografía pura:** la flecha se dibuja hacia el paso justo antes de la palabra, la caja entra con la palabra, un anillo a mano marca el paso activo y los anteriores bajan de intensidad.
- **Plantilla `templates/overlays/flow.html`**: solo pinta lo que calcula Node, con el color de acento del tour y las flechas y anillos a mano de la capa de efectos.
- **Sonido:** un solo *pop* al aparecer, como cualquier overlay (el 29/sep/2026 se quitó el sonido por paso: saturaba y no seguía al diagrama).
- **`check`** avisa de pasos demasiado juntos para leerse y de textos que no caben.

### 6.2 Directrices ✅

- **Skill del repo** (`.claude/skills/flow/`): cuándo usar un flujo y qué forma, cómo escribir la narración para que cada paso tenga su palabra, cuántos pasos caben y cómo revisar el resultado antes de entregarlo.
- **Guía** en `docs/flujos.md`, con las mismas reglas para el autor.

### 6.3 Más formas ✅

- **Decisión** ✅: un paso que se bifurca en «sí» y «no».
- **Ciclo** ✅: pasos que regresan al inicio (entregas semanales, sprints).
- **Carriles** ✅: quién hace qué (huésped, venue, host).
- **Antes y después** ✅: dos flujos lado a lado.

### 6.4 Catálogo ✅

Un tour de ejemplos con todas las formas en 16:9 y 9:16: catálogo visual para elegir y prueba de regresión.

Referencia visual: [archify](https://github.com/tt-a1i/archify) (MIT). Se toman ideas (esquema por forma, validación del layout, carriles y fases), no código: su visor es interactivo, no va al ritmo de la voz y su estética es de documentación técnica.

## Fase 7 — Biblioteca de recursos animados ✅ (30/sep/2026)

Hecho el 30/sep/2026: todo. El catálogo es `tours/examples/catalogo.yaml` (sin voz), que renderiza `walkthrough catalog` en 16:9 y 9:16 con una hoja de contacto; la guía, `docs/recursos.md`, y la skill, `recursos`. `docs/recursos.md` ya reúne la guía de lo hecho.

Escrita el 30/sep/2026. Los overlays pueden ser cualquier HTML, pero hoy solo los flujos saben ir al ritmo de la voz, y cada plantilla anima a mano con CSS. La meta es una **biblioteca de recursos**: piezas que se declaran en el YAML con sus datos y sus palabras clave, y que sirven igual en un demo, en documentación o en una entrega semanal, sin escribir código por video.

### Principios

- **Declarativo.** Un recurso se usa con `src`, datos y palabras clave. Si un video necesita código propio, falta un recurso o una opción, no un parche.
- **Al ritmo de la voz.** Todo momento importante de una animación cae en una palabra de la narración, como los pasos de un flujo.
- **Determinista.** La animación se coloca en el segundo exacto de cada cuadro, nunca corre en tiempo real: dos renders dan los mismos cuadros.
- **De la marca del tour.** Tema, acento y tipografía salen del tour, no de cada plantilla.
- **16:9 y 9:16** desde el primer día, con zonas seguras.
- **Cada recurso llega con** pruebas, un ejemplo en el catálogo y su sección en la guía.

### 7.1 Base: palabras clave y animación por posición ✅

- **`beats` en cualquier overlay:** `beats: { title: Sunset, line: every }`. La timeline resuelve cada palabra (después de la anterior, como en los flujos) y la plantilla recibe los segundos en su propio reloj. `check` avisa si una palabra no está en la narración.
- **`data` estructurada:** hoy los `params` son solo texto. Las gráficas y el código necesitan listas y objetos, así que el overlay acepta `data` (YAML que llega como JSON), validada por el esquema de cada recurso.
- **Protocolo de seek:** la plantilla registra su animación en pausa (`walkthrough.timeline(t => …)` o una timeline de GSAP) y el render la coloca en el segundo de cada cuadro antes de la captura. Las plantillas con CSS siguen funcionando con la sincronía actual.
- **GSAP copiado al repo** (`templates/vendor/`), sin CDN, con su licencia revisada antes para videos de clientes: timelines, escalonados, texto por letras, trazos de SVG y números que cuentan.
- **Kit compartido** (`templates/overlays/kit/`): tokens de tema, curvas y duraciones de movimiento, y ayudas para partir texto, contar números y dibujar trazos. Así las piezas se sienten de la misma familia.
- **Tema de overlays por tour:** `theme: dark | light` más el acento y, opcional, una tipografía de marca. Resuelve de paso que los flujos tengan siempre fondo morado.
- **Probador:** `walkthrough overlay <plantilla> [--data archivo] [--device]` renderiza un recurso suelto en segundos, con palabras clave de prueba, para diseñarlo sin armar un tour.
- **Pruebas:** dos renders del mismo overlay dan cuadros idénticos; las palabras clave llegan resueltas; el seek cae en el cuadro correcto.

### 7.2 Aperturas y cierres cinéticos ✅

La apertura es lo más visible del video y hoy es una tarjeta estática. Una familia de 3 aperturas, cada una con su cierre y su separador de capítulo en el mismo estilo:

- **Cinética:** el título se arma letra por letra, la línea de acento se dibuja y el subtítulo entra en la palabra que lo nombra.
- **Sobre la app:** el título aparece encima de la primera pantalla grabada con un velo, y al salir revela la app. Funciona porque los overlays se componen con transparencia.
- **Marca:** el logo del proyecto (un asset del tour) se dibuja o se arma, luego el nombre y el tagline.
- **Capítulos:** separadores cinéticos («02 · Reservas») en el estilo de la apertura elegida.

Todas reciben `beats` para que el título, el subtítulo y el logo caigan en sus palabras.

### 7.3 Gráficas ✅

- **Tipos:** barras, línea, dona o progreso, cifra grande que cuenta («de 45 min a 3 min») y comparación de dos cifras.
- **Datos en el YAML** (`data: { series, unit, format }`), validados por esquema, con formato de números por idioma (es/en).
- **Cálculo puro en Node** (`src/charts/`): escalas, marcas del eje con números redondos, etiquetas que caben y colores del tema. Probado sin navegador, como el layout de los flujos. La plantilla solo pinta y anima.
- **Al ritmo de la voz:** cada barra, punto o cifra puede tener su palabra, y la línea se dibuja hasta el punto que se está nombrando.

### 7.4 Código ✅

- **Resaltado en Node** al preparar el render (sin librerías en la página), con un tema que sigue al tema del tour.
- **Modos:** editor (con nombre de archivo), terminal (comando y salida) y diff (líneas agregadas y quitadas).
- **Animación:** el código se escribe solo o aparece por bloques, y se resaltan líneas en sus palabras («este **endpoint**…»). Con zoom a la línea activa si el bloque es largo.
- **Validación:** `check` avisa si una línea no cabe o si el bloque no entra en el cuadro.

### 7.5 Catálogo y guía ✅

- **`tours/examples/`:** un tour por familia (aperturas, gráficas, código) en 16:9 y 9:16, que sirve de catálogo y de prueba de regresión. Se une al catálogo de flujos (6.4).
- **`docs/recursos.md`:** qué recurso usar en cada caso, sus datos y cómo escribir la narración para sus palabras clave.
- **Skill `recursos`** del repo, como la de flujos: elegir el recurso, escribirlo, validarlo y revisar los cuadros antes de entregar.

### Orden

1. **7.1 Base.** Sin ella, cualquier animación nueva corre a su ritmo.
2. **7.2 Aperturas.** Es lo que más mejora a todos los videos, desde el primero.
3. **7.3 Gráficas.**
4. **7.4 Código.**
5. **7.5 Catálogo y guía**, que se completa con cada recurso nuevo.

Después, y solo si un video lo pide: novedades de la semana (una lista al ritmo de la voz, para las entregas a dymmsa), pantalla dividida y marcos de dispositivo.

## Fase 8 — Marca, texturas y emojis ✅ (1/oct/2026)

Escrita el 1/oct/2026. Los recursos de la fase 7 se ven todos iguales: el mismo fondo morado o claro y solo el acento cambia. La meta es que cada proyecto se vea como suyo en todos sus videos y que haya más variedad visual sin perder el orden, siempre declarado en el YAML.

### 8.1 Marcas ✅

- **`assets/brands/<marca>/`**, compartida por todos los tours: `brand.yaml` (nombre, acento, tema y textura preferidos), el logo, un isotipo cuadrado si lo hay y `FUENTE.md` (de dónde salió y cómo se puede usar).
- **`brand: dymmsa` en el tour:** da el acento, el tema y la textura por defecto (el tour puede cambiarlos) y el logo a las aperturas `brand`, los capítulos y el cierre.
- **Marca de agua opcional** (`watermark: true`): el isotipo en una esquina durante el recorrido, sin tapar la apertura ni el cierre.
- **Primeras marcas:** 4XL (`portafoliov3`), UrVenue (`uvme-microsite`) y DYMMSA (`DYMMSA-WEB`), copiadas de los repos locales. Los logos de terceros solo en su contexto: DYMMSA en sus entregas, UrVenue en lo interno.

### 8.2 Texturas ✅

- **Fondos generados por código** (sin imágenes ni licencias): `plain`, `grain`, `dots`, `lines`, `mesh` y `brand` (la malla con el color de la marca). Se eligen con `texture:` en el tour o vienen de la marca.
- **Donde haya un fondo propio:** aperturas, capítulos, cierres, flujos, gráficas y código a pantalla completa. Mismos tokens, así sirven en tema claro y oscuro.

### 8.3 Emojis ✅

- **Fluent Emoji de Microsoft** (MIT), una selección curada de 71 en `templates/overlays/vendor/fluent-emoji/`, en estilo Color (vectorial) y 3D. Se escriben por nombre (`emoji: rocket`) y el esquema rechaza uno que no exista.
- **Dentro de los recursos, nunca sueltos:** en los pasos de un flujo, en una cifra o comparación, en un capítulo y en la apertura. Entran con una animación corta.
- **Sticker** (`sticker.html`): un emoji con un texto breve que aparece en su palabra para subrayar un momento («🎉 Listo»), en una esquina o junto al centro.

### 8.4 Catálogo y guía ✅

Las variantes nuevas (marcas, texturas, emojis) se agregan a `tours/examples/catalogo.yaml`; `docs/recursos.md` y la skill `recursos` explican cuándo usarlas.

## Fase 9 — Resaltar con variedad, tablas, líneas de tiempo y marcos ✅ (1/oct/2026)

Escrita el 1/oct/2026. Todo se resalta igual (el rectángulo a mano en el acento) y faltan recursos para comparar opciones, contar una historia en el tiempo y presentar la app como producto.

### 9.1 Formas de resaltar ✅

- **`highlight: { on, style, color }`** con `style`: `ring` (el de hoy), `circle` (óvalo a mano), `underline` (subrayado a mano), `marker` (resaltador detrás del texto), `box` (recuadro limpio), `brackets` (esquinas), `spotlight` (oscurece el resto) y `arrow` (una flecha que llega desde donde haya espacio).
- **`color`:** el acento por defecto, o `yellow`, `green`, `red`, `blue`, `white` o un `#RRGGBB`. El resaltador es amarillo por defecto.
- **`highlightStyle` en el tour:** el estilo por defecto de sus `highlight`, para que cada video tenga su carácter.
- Todo en la capa de efectos, calculado en Node, siguiendo al elemento y retirándose si lo tapan, como las marcas de hoy.

### 9.2 Tabla de comparación ✅

- **`table.html`** con `data`: columnas, filas y celdas (`yes`, `no`, `partial` o un texto). Una columna se puede destacar (la del producto).
- Las filas aparecen en su palabra; las marcas ✓ y ✕ se dibujan al llenarse. Hasta 6 columnas en 16:9 y 3 en 9:16, validado por `check`.

### 9.3 Línea de tiempo ✅

- **`roadmap.html`** con hitos (`date`, `title`, `detail`, `emoji`, `status`: `done`, `now`, `next`). La línea se dibuja de hito en hito al ritmo de la voz y el actual se marca.
- Horizontal en 16:9 y vertical en 9:16; hasta 7 hitos.

### 9.4 Marco de dispositivo ✅

- **`frame: laptop | browser | phone`** en el tour: la grabación va dentro del dispositivo, sobre el fondo de la marca y su textura. El cursor, las marcas y el zoom quedan dentro de la pantalla; los overlays, sobre todo el cuadro.
- Las medidas del marco y de su pantalla se calculan en Node; el marco se dibuja una vez como imagen y ffmpeg compone la captura dentro.
- Al implementarlo: el marco también decide cómo se graba la app (`phone` como teléfono, `browser` y `laptop` como escritorio), así que un sitio móvil cabe en un video 16:9 y una laptop en uno vertical. El teléfono lleva una barra de estado propia, para que la cámara no tape el encabezado de la app.

### 9.5 Catálogo y guía ✅

Ejemplos en `tours/examples/catalogo.yaml` (tablas y líneas de tiempo), `resaltar.yaml` (los ocho estilos sobre un sitio) y `marco.yaml`; la guía en `docs/recursos.md` y la skill `recursos`.

## Fase 10 — Escenario 3D (propuesta)

Anotada el 2/oct/2026, después de la entrega de DYMMSA de la semana 40. Hoy la app siempre se ve de frente: el zoom recorta y el marco de dispositivo es una imagen fija sobre la que ffmpeg escala la captura. La idea es darle profundidad al video sin tocar la app grabada.

### Idea

- **Cámara desde varios ángulos.** La grabación se encoge un poco y queda como un plano dentro de un escenario HTML que la envuelve: se inclina, gira o se aleja en perspectiva, con sombra y fondo de la marca, y vuelve de frente cuando hay algo que leer.
- **Transiciones de nuestro lado.** En los cambios de página y entre secciones, la transición la hace el escenario (la pantalla se empuja, se voltea o se aleja y entra la siguiente) en lugar de la disolvencia de hoy.
- **Cosas que aparecen entre secciones.** Textos y recursos que entran en el escenario, alrededor de la grabación, no encima de ella.
- **Escenas con profundidad y variedad.** Recursos que no son tarjetas planas: una lista de pendientes en un pizarrón, notas en un corcho, papeles en un escritorio, con capas a distinta distancia, sombras y luz.

### Cómo encaja en la arquitectura

- **Una etapa nueva, `stage`, entre overlays y compose.** Es una página HTML que se renderiza cuadro a cuadro como los overlays (`__walkthroughSeek`) y lleva dentro la captura como `<video>` sincronizado, que ya se sabe buscar al instante de cada cuadro. Su salida reemplaza a la captura en el montaje.
- **Node calcula la cámara; la página solo la aplica.** Ángulo, escala, distancia y transición de cada cuadro salen de funciones puras (`src/stage/`) a partir de la timeline, igual que la escena de efectos. La página pone un `transform` en CSS 3D, sin estado.
- **El marco de dispositivo pasa a ser una capa del escenario.** Así la laptop o el teléfono giran junto con la pantalla.
- **La captura ya viene con densidad alta** (`deviceScaleFactor`), así que encogerla e inclinarla no pierde nitidez.

### Reglas que conviene fijar desde el inicio

- **De frente para leer.** Mientras hay una marca, un clic o una etiqueta, la cámara está de frente o casi. La timeline la endereza antes de cada marca y la auditoría avisa si no le da tiempo.
- **Ángulos chicos.** Entre 6° y 12° basta para que se sienta 3D; más cansa y deforma el texto.
- **Un movimiento por frase,** como el scroll y las marcas: la cámara no se mueve mientras la voz nombra algo en pantalla.

### Pasos

1. **10.1 Prueba de escenario.** Diez segundos de una captura real (la de DYMMSA sirve) dentro de un escenario fijo inclinado, para medir cuánto se tarda el render y si el texto se sigue leyendo. Esto decide si se sigue con el resto.
   **Resultado (2/oct/2026).** Diez segundos de la captura de DYMMSA (Mi semana) dentro de un escenario con la textura de la marca, de frente → 12° → 6° → de frente, con sombra y esquinas que crecen con la distancia:
   - **Se lee.** A 6° el texto chico (fechas, ejes) se lee igual que de frente; a 12° también, pero ya se siente inclinado. 6°–8° es el rango cómodo y 12° el tope.
   - **Cuesta 0,16 s por cuadro a 1080p**, el 70 % en la captura de pantalla: unos 10 minutos más para un video de 2 minutos. Como de frente el escenario no aporta nada, conviene renderizarlo solo en los tramos con cámara inclinada o en transición, y que ffmpeg una esos tramos con la captura.
   - **La sincronía de `<video>` sirve tal cual,** con una condición: el reloj toma el primer cuadro en que ve el video como su segundo 0, así que el escenario cubre la captura desde el inicio o recibe el tramo ya recortado.
   - **La captura en 1080p alcanza** para encogerla al 78 % e inclinarla sin perder nitidez.
2. **10.2 Planos ✅ (2/oct/2026).** `shot:` en `do` (`flat`, `wide`, `left`, `right`, `top`, con `angle` y `duration`) y su palabra. La cámara se endereza sola antes de cada marca, clic o tecleo; `check` y la auditoría avisan si no alcanza. Solo se renderizan los tramos fuera de frente, y todavía no se combinan con `frame`. Ejemplo en `tours/examples/planos.yaml`.
3. **10.3 Transiciones del escenario ✅ (2/oct/2026).** `transition:` en el tour o el segmento (`dissolve`, la de siempre; `push`, `flip`, `fly`, de 0,8 s). La captura corta en esas navegaciones y el escenario dibuja el cambio: la pantalla vieja detenida en su último cuadro y la nueva en vivo, dentro de la pose de la cámara. Ejemplo en `tours/examples/transiciones.yaml`.
4. **10.4 Escenas con profundidad ✅ (2/oct/2026).** `scene.css` y `kit.drift()` (cuarto con luz, piezas a su profundidad y una cámara que deriva) y dos recursos con datos: `board.html` (pizarrón de gis o blanco; cada renglón se escribe en su palabra y se tacha con `done`) y `corkboard.html` (notas que caen y se clavan). Letras de macOS, sin archivos. Cuestan unas dos o tres veces lo de una tabla. **Pendiente:** los capítulos entrando al escenario, que necesitan que un overlay y el escenario se coordinen.
5. **10.5 Catálogo y guía.** Ejemplos en `tours/examples/catalogo.yaml`, reglas en `docs/recursos.md` y en la skill `recursos`.

### Riesgos

- **Tiempo de render.** El escenario es un pase más a pantalla completa, del orden de lo que ya cuestan los overlays. `--preview` puede saltarlo o hacerlo a la mitad.
- **Legibilidad.** Por eso las reglas de arriba y la prueba 10.1 antes de comprometerse.

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
| 7 | Grande: 7.1 mediana, cada recurso de 7.2 a 7.4 mediano |
| 8 | Mediana |
| 9 | Mediana-grande (9.4 toca el montaje) |
| 10 | Grande: 10.1 chica, 10.2 y 10.3 medianas, 10.4 mediana por escena |
