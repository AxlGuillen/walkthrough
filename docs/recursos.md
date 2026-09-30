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
| Señalar algo que ya está en la pantalla | No es un recurso: `highlight` o `label` |
| Un texto corto encima de la app | `lower-third.html`; un atajo de teclado, `shortcut.html`; dos capturas lado a lado, `compare.html` |

Un recurso dice algo que la app no muestra por sí sola. Uno por frase, y no más de uno o dos seguidos antes de volver a la app.

## Probar y revisar

- **Un recurso suelto**, para diseñarlo sin armar un tour:

  ```bash
  bun run walkthrough overlay opening.html --params="title=Sunset Shores,style=brand" --beats="mark=0.3,title=1" --open
  ```

- **El catálogo completo** (`tours/examples/catalogo.yaml`, sin voz): todos los recursos y sus variantes en una pasada, con un video y una hoja de contacto (un cuadro por recurso) en `~/Library/Caches/walkthrough/catalog/`. Tarda unos 4 minutos por formato.

  ```bash
  bun run walkthrough catalog --device=both --open
  ```

  Al cambiar una plantilla o agregar un recurso, agrega su ejemplo al catálogo y revisa las hojas antes del commit. Una prueba de `verify` comprueba que cada entrada sea válida y quepa en 16:9 y 9:16.
- **Ejemplos narrados**, con voz y un sitio de fondo: `tours/examples/aperturas.yaml`, `graficas.yaml`, `codigo.yaml` y `flujos.yaml`.
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
