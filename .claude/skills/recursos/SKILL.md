---
name: recursos
description: Agrega a un tour de walkthrough recursos animados que van al ritmo de la voz: aperturas, capítulos y cierres, gráficas (barras, línea, dona, cifra, antes/después) y código (editor, terminal, diff). Úsala cuando el autor pida abrir o cerrar un video, mostrar cifras o datos, enseñar código o comandos, o mejorar cómo se ve un tour más allá de recorrer la app.
---

# Recursos en un tour

1. **Lee `docs/recursos.md`** (qué recurso usar en cada caso, sus datos, sus beats y cómo escribir la narración) y `docs/guiones.md` (ritmo). Para un proceso con pasos, usa la skill `flow`. Síguelas; no las repitas al autor.
2. **Elige con la tabla de `docs/recursos.md`.** Un recurso tiene que decir algo que la app no muestra por sí sola; si la pantalla ya lo enseña, un `highlight` o un `label` basta. Todo video lleva apertura y cierre del mismo estilo; capítulos solo si el video tiene partes.
3. **Escribe la frase y el recurso juntos.** Cada momento que importa (el título, una barra, una cifra, un comando, una línea de código) va en una palabra de la frase con `at` o `beats`, en orden y con aire. Mismo idioma que el tour (`language`). Datos reales o marcados como ejemplo; nunca claves ni datos privados de clientes en el código.
4. **Valida:** `bun run walkthrough check <tour>`. Corrige todo aviso de los recursos (texto cortado, código que no cabe, que sigue escribiéndose o que queda chico en ese formato) y de los flujos.
5. **Diseña rápido si hace falta:** `bun run walkthrough overlay <plantilla> --data=<archivo> --beats=… --device=… --theme=…` renderiza un recurso suelto en segundos, sin armar el tour.
6. **Revisa tú mismo** antes de enseñarlo: `bun run walkthrough render <tour> --preview`, lee la auditoría de tiempos del final y saca cuadros con `ffmpeg -ss <tiempo> -i <preview>/video.mp4 -frames:v 1` poco después de cada beat (los tiempos están en `timeline.json`, `overlays[].beats`, en segundos desde el inicio del overlay). Comprueba que cada parte entra con su palabra, que nada se corta ni se sale y que se lee en el formato del tour.
7. **Entrega** el tour para revisión con lo que verificaste.

Si cambias una plantilla o agregas un recurso o una variante: agrega su ejemplo a `tours/examples/catalogo.yaml` (la prueba del catálogo lo valida en 16:9 y 9:16) y revisa `bun run walkthrough catalog --device=both --open` antes de hacer el commit. Si ningún recurso encaja, cuéntalo con el más cercano y dile al autor qué faltaría.
