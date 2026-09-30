# Guiones

Cómo escribir un tour que se vea tranquilo y con las marcas a tiempo. El motor ya hace su parte (scroll pausado, disolvencias, marcas que esperan y se retiran solas; ver `docs/arquitectura.md`), pero el ritmo lo decide el guion. Los flujos tienen su propia guía en `docs/flujos.md`.

## Una idea por frase

- **Una frase, un movimiento.** Cada segmento hace una cosa: un scroll, una navegación o una marca. Varias paradas en una sola frase se atropellan: seis scrolls a 0,6 s uno del otro se atrasaron frente a la voz en el tour de Sunset Shores.
- **La voz nombra lo que se ve, cuando se ve.** Si la frase dice «el restaurante», el scroll hacia el restaurante empieza en esa palabra.
- **Aire en la entrada.** La primera pantalla de una página merece un segmento sin acciones (`hold`), o por lo menos una frase antes del primer scroll.

## Scroll

- **Distancia razonable.** Hasta unos 3 000 px por scroll; más lejos, se parte en dos frases o se navega a la sección.
- **`duration` solo para alargar.** El motor ya calcula un ritmo legible; forzarlo a menos de eso es lo que se ve «muy rápido».
- **Mejor pocos destinos bien elegidos** que recorrer toda la página. Un inicio largo se cuenta con 2 o 3 secciones.

## Marcas (`highlight`, `label`)

- **Después de que la página se detiene.** El `at` de una marca va en una palabra que llega por lo menos 0,3 s después de que termina el scroll hacia su elemento: normalmente, una palabra de la siguiente frase o el final de la misma.
- **Sobre lo que la voz está diciendo.** El anillo en el formulario llega con «dates», no con «availability» si la frase sigue hablando de otra cosa.
- **Tiempo para leerse.** Una marca necesita unos 1,5 s en pantalla. No la pongas justo antes de un clic que abre un menú encima, de una navegación o de un flujo a pantalla completa. Si pasa, la marca se retira sola y la auditoría avisa.
- **Una marca por frase.** Dos marcas seguidas compiten por la mirada.

## Navegar

- **Como un usuario.** Se navega con los menús y enlaces de la app (`click` con `wait`), no con `goto`, salvo que no haya un camino natural. Cada cambio de pantalla se disuelve, sea `goto` o clic.
- **Menús con pausa.** Entre abrir un menú y hacer clic en su enlace va por lo menos 1 s: la voz nombra la sección («under relax and play») y luego el destino («Emerald Pool»).
- **No marques en la disolvencia.** Nada de marcas en los 0,5 s después de una navegación.

## Revisar antes de entregar

1. `walkthrough check <tour>`: sin fallas ni avisos.
2. `walkthrough render <tour> --preview` y leer la auditoría de tiempos del final. Cada aviso se corrige y se vuelve a renderizar hasta que diga «nothing off-beat».
3. Sacar cuadros con `ffmpeg` en cada evento de `preview/events.json`: 0,7 s después de cada marca, a la mitad de cada disolvencia y 0,5 s después de cada clic. Revisar que la marca esté sobre lo que dice la voz, que el menú se vea abierto antes de su clic y que nada flote sobre la pantalla siguiente.
4. Solo entonces enseñar la vista previa.
