# Flujos

Un flujo explica un proceso con pasos conectados que aparecen justo cuando la voz los nombra. El tour declara solo los pasos y la palabra de cada uno; el layout, la animación y el sonido salen del repo, iguales en todos los videos. El detalle técnico está en `docs/arquitectura.md`, «Flujos».

## Cuándo usar un flujo

| Sí | No |
|---|---|
| Un proceso que la app no muestra de un vistazo: una reserva de punta a punta, la vida de un ticket, quién aprueba qué | Algo que la pantalla ya enseña: ahí basta un `highlight` o un `label` |
| Antes de recorrer varias pantallas, para dar el mapa | Una lista de funciones sin orden: eso es un `lower-third` o una tarjeta |
| Al cerrar, para resumir lo que se vio | Más de 6 pasos: se parte en dos flujos o se agrupan |

## Modos

- **`full`** (por defecto): tapa la app. Es un interludio, para dar el mapa antes de entrar o para resumir al salir.
- **`card`**: un panel abajo, sobre la app. Sirve para acompañar lo que se ve, así que conviene sobre una pantalla quieta, sin clics en la franja inferior.

## Formas

Hoy existe `linear` (A → B → C). Decisión, ciclo, carriles y antes/después vienen en la fase 6.3 del plan. Mientras tanto, un proceso con bifurcación se cuenta por su camino principal y la bifurcación se nombra en la voz.

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
