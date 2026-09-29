---
name: flow
description: Agrega a un tour de walkthrough un flujo de pasos conectados que aparecen al ritmo de la narración. Úsala cuando el autor pida explicar un proceso, un flujo, un ciclo de vida o «cómo funciona» algo en un video, o pida un diagrama de pasos en un tour.
---

# Flujos en un tour

1. **Lee `docs/flujos.md`.** Tiene las reglas: cuándo conviene un flujo, qué modo usar, cuántos pasos caben y cómo escribir texto y narración. Síguelas; no las repitas al autor.
2. **Decide dónde va.** Un `full` abre o cierra una parte del recorrido (el mapa antes de entrar, el resumen al salir); un `card` acompaña una pantalla quieta. Si el proceso ya se ve en la app, propón un `highlight` o un `label` en su lugar y dilo.
3. **Escribe la frase y los pasos juntos.** Primero la frase con una palabra distinta por paso, en orden; luego cada paso con su `at` en esa palabra. Mismo idioma que el tour (`language`).
4. **Valida:** `bun run walkthrough check <tour>`. Corrige todo aviso del flujo: pasos a menos de 0,7 s (alarga la frase entre ellos) o texto cortado (acórtalo o pásalo a `detail`).
5. **Revisa el resultado tú mismo** antes de enseñarlo: `bun run walkthrough render <tour> --preview`, luego saca un cuadro poco después de cada paso con `ffmpeg -ss <tiempo> -i <preview>/video.mp4 -frames:v 1` (los tiempos están en `timeline.json`, `overlays[].flow.steps[].time`) y míralos. Comprueba que la caja entra con su palabra, que el anillo marca el paso activo y que nada se sale ni se encima.
6. **Entrega** el tour para revisión con lo que verificaste. El render final lo lanza el autor o se lanza cuando lo apruebe.

Si el proceso necesita una forma que aún no existe (decisión, ciclo, carriles, antes/después; fase 6.3 de `docs/plan.md`), cuéntalo por su camino principal, nombra la bifurcación en la voz y avisa al autor que esa forma está pendiente.
