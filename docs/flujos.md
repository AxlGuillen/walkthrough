# Flujos

Un flujo explica un proceso con pasos conectados que aparecen justo cuando la voz los nombra. El tour declara solo los pasos y la palabra de cada uno; el layout, la animación y el sonido salen del repo, iguales en todos los videos. El detalle técnico está en `docs/arquitectura.md`, «Flujos».

## Cuándo usar un flujo

| Sí | No |
|---|---|
| Un proceso que la app no muestra de un vistazo: una reserva de punta a punta, la vida de un ticket, quién aprueba qué | Algo que la pantalla ya enseña: ahí basta un `highlight` o un `label` |
| Antes de recorrer varias pantallas, para dar el mapa | Una lista de funciones sin orden: eso es un `lower-third` o una tarjeta |
| Al cerrar, para resumir lo que se vio | Más de 6 pasos: se parte en dos flujos o se agrupan |

Para elegir la forma: si el proceso siempre sigue el mismo camino, `linear`; si depende de una condición que cambia lo que pasa después, `decision`; si al terminar vuelve a empezar, `cycle`; si lo importante es quién hace cada paso, `lanes`; si lo importante es la diferencia con cómo era, `compare`.

## Modos

- **`full`** (por defecto): tapa la app. Es un interludio, para dar el mapa antes de entrar o para resumir al salir.
- **`card`**: un panel abajo, sobre la app. Sirve para acompañar lo que se ve, así que conviene sobre una pantalla quieta, sin clics en la franja inferior.
- **`aside`**: la pantalla se corre a un lado (`layout: aside-left`, por defecto, o `aside-right`) y el flujo se arma en vertical del otro lado, sin tapar nada; al terminar, la pantalla vuelve sola. Es el modo para **explicar mientras la app lo hace**: si cada paso usa la misma palabra que el clic que lo hace en la app, el paso se enciende justo cuando el cursor lo hace. El título espera a que la pantalla termine de apartarse, y el primer paso tiene que llegar por lo menos 1,2 s después de que empieza el flujo (`check` lo avisa). Un zoom dentro de la pantalla va antes de apartarla y sin `follow`: nada se mueve adentro mientras el flujo se arma. Sin `frame`, como los planos.

  ```yaml
  - say: Pick a day, set the party, choose a time, and review it before anything is confirmed.
    do:
      - click: { on: '[role=dialog] button:has-text("SAT")', at: day }
      - click: { on: '[role=dialog] button:text-is("+")', at: party }
    flow:
      mode: aside
      title: Booking an experience
      steps:
        - { text: Pick a day, emoji: calendar, at: day }
        - { text: Set the party, emoji: busts-in-silhouette, at: party }
        - { text: Choose a time, emoji: stopwatch, at: time }
        - { text: Review it, emoji: check-mark-button, at: review }
  ```

## Formas

| Forma | Para | Cómo se ve |
|---|---|---|
| `linear` (por defecto) | Un proceso de punta a punta | Pasos en fila (columna en 9:16) |
| `decision` | Un punto donde el proceso se bifurca: aprobaciones, disponibilidad, validaciones | La línea llega a una pregunta («?») y de ahí salen dos ramas con su etiqueta, una arriba y otra abajo (lado a lado en 9:16) |
| `cycle` | Algo que se repite: entregas semanales, sprints, un ciclo de feedback | En `full`, pasos alrededor de una elipse con una flecha que regresa al inicio; en `card`, una fila con la flecha de regreso por debajo |
| `lanes` | Quién hace qué: un proceso que pasa por varias personas o sistemas | Una franja por responsable, con su nombre; cada paso cae en la franja de quien lo hace y el tiempo corre de izquierda a derecha (en 9:16, franjas lado a lado y el tiempo hacia abajo) |
| `compare` | Antes y después: qué mejoró, cuántos pasos se ahorran | Dos columnas lado a lado con su etiqueta; la de antes, apagada; la de después, en el color de acento |

### Decisión

El último paso de `steps` es la pregunta. `branches` son exactamente dos, cada una con una etiqueta corta (`Sí`/`No`, `Hay`/`No hay`) y de 1 a 3 pasos. En total caben 6 cajas a lo ancho: los pasos antes de la pregunta, la pregunta y la rama más larga.

```yaml
flow:
  shape: decision
  title: ¿Hay mesa disponible?
  steps:
    - { text: Llega la solicitud, at: solicitud }
    - { text: ¿Quedan mesas?, at: quedan }       # la pregunta
  branches:
    - label: Sí
      steps:
        - { text: Se confirma, at: confirma }
        - { text: Se cobra el depósito, at: depósito }
    - label: "No"
      steps:
        - { text: Lista de espera, at: espera }
```

La narración recorre la primera rama completa y después la segunda: «Si hay, se confirma y se cobra el depósito. Si no, entra a la lista de espera». Las ramas se numeran desde el mismo número, porque cualquiera de las dos es el paso siguiente.

### Ciclo

De 3 a 6 pasos. `loop` es la palabra en que la flecha regresa al primer paso («y **volvemos** a empezar»), que se vuelve a marcar. Sin `loop`, se cierra 0,6 s después del último paso; conviene darle una frase propia.

```yaml
flow:
  shape: cycle
  title: Entrega semanal
  loop: volvemos
  steps:
    - { text: Planear, at: planeamos }
    - { text: Construir, at: construimos }
    - { text: Entregar, at: entregamos }
    - { text: Escuchar feedback, at: escuchamos }
```

### Carriles

De 2 a 4 `lanes` y de 2 a 6 pasos; cada paso nombra su carril en `lane`. Un mismo carril puede tener varios pasos, y cada paso ocupa su propia columna de tiempo, así que el ojo lee el orden de izquierda a derecha y el responsable por la franja.

```yaml
flow:
  shape: lanes
  title: ¿Quién hace qué?
  lanes: [Huésped, Venue, Host]
  steps:
    - { text: Elige su mesa, lane: Huésped, at: elige }
    - { text: Aprueba la reserva, lane: Venue, at: aprueba }
    - { text: Paga el depósito, lane: Huésped, at: paga }
    - { text: Prepara la mesa, lane: Host, at: prepara }
```

La narración nombra al responsable junto al paso («el **venue** aprueba la reserva»); el `at` va en el verbo, que distingue al paso.

### Antes y después

`before` y `after`, cada uno con su etiqueta y de 1 a 5 pasos; no lleva `steps`. La narración cuenta todo el antes y luego el después. Cada lado se numera desde 1, así que la diferencia de pasos se ve sola.

```yaml
flow:
  shape: compare
  title: Reservar una mesa
  before:
    label: Antes
    steps:
      - { text: Llamar al venue, at: llamar }
      - { text: Esperar respuesta, at: esperar }
      - { text: Mandar transferencia, at: transferencia }
  after:
    label: Ahora
    steps:
      - { text: Reservar en línea, at: línea }
      - { text: Pagar con tarjeta, at: tarjeta }
```

Funciona mejor cuando el después tiene menos pasos o pasos más simples: el contraste de columnas es el mensaje.

## Cómo escribir los pasos

- **De 3 a 5 pasos.** Se aceptan 2 a 6, pero 3 a 5 es lo que se lee cómodo.
- **Texto corto, con verbo:** «Elige una noche», «Paga el depósito». Por línea caben unos 15 caracteres en 16:9 con 3 pasos, 13 con 4 y 11 con 5 o 6; en 9:16, unos 35. Se permiten hasta tres líneas.
- **`detail` para el matiz**, en una frase corta: «Sección, capacidad y consumo mínimo». Si lleva comas, va entre comillas en el YAML.
- **Todos los pasos en el mismo tiempo verbal y la misma persona.**

## Cómo escribir la narración

El flujo va al ritmo de la voz, así que la frase se escribe pensando en los pasos:

- **Cada paso tiene su palabra en la frase, en orden.** «El huésped elige una **noche**, escoge su **mesa**, paga el **depósito**, y el host la **confirma**». El `at` de cada paso es esa palabra.
- **Ancla en el sustantivo o el verbo que distingue al paso**, no en palabras comunes («el», «y», «se»). Una palabra repetida sí se puede usar: cada `at` se busca después del paso anterior.
- **Al menos 0,7 s entre pasos**: unas cuatro o cinco palabras. Con menos, `check` avisa, porque la caja desaparece del foco antes de leerse.
- **Aire al final:** después del último paso, una frase corta o una pausa deja leerlo completo antes de que se vaya.
- **Un paso sin `at`** se reparte entre sus vecinos. Sirve para frases donde no hay una palabra clara, pero anclar todos da mejor sincronía.

## Ejemplo

```yaml
- say: Así funciona una reserva. El huésped elige una noche, escoge su mesa, paga el depósito, y el host la confirma antes de que llegue.
  flow:
    title: Cómo se reserva una mesa
    steps:
      - { text: Elige una noche, at: noche }
      - { text: Escoge su mesa, detail: "Sección, capacidad y consumo mínimo", at: mesa }
      - { text: Paga el depósito, at: depósito }
      - { text: El host confirma, at: confirma }
```

Más ejemplos en `tours/examples/flujos.yaml`.

## Revisar antes de entregar

1. `walkthrough check <tour>`: que el flujo salga `✓`, sin avisos de pasos juntos ni de textos cortados.
2. `walkthrough render <tour> --preview` y revisar un cuadro por paso: la caja entra con su palabra, el anillo marca el paso activo y nada se sale ni se encima.
3. Si solo cambió el texto o el diseño del flujo, `render --from=overlays` rehace el flujo sin volver a grabar la app.
