# Auditoría Windows

Lo que falta para que un render en Windows sea igual de confiable que en la Mac. Revisado el 8/oct/2026 en un Ryzen 5 9600X (12 hilos, 32 GB, RTX 5070) con Windows 11, sobre todo lo que llegó de la Mac hasta `b24855e`.

## Estado

- `bun run verify` pasa en Windows: 73 archivos, 564 pruebas.
- Lo nuevo de la Mac que no depende del sistema y ya funciona aquí: `upload` (la ruta se resuelve con `path.resolve`), el idioma de la app (`locale`, con su prueba), `setup.origins`, clics que abren otra pestaña, la transición `cut`, flujos en el aparte, `clickStyle` y la auditoría de tiempos con overlays que tapan.
- Ya resuelto antes: carpetas de caché y videos, Papelera de reciclaje, Explorador, rutas con `/` y fuentes a mano vendorizadas (ver `docs/arquitectura.md`, «Almacenamiento» y «Rendimiento»).

## Pendientes

### P1 · Bloquean un render o cambian el resultado

1. **Ningún render completo con un sitio real en Windows.** La captura solo se probó con fixtures locales. Sunset Shores responde 401, así que el showcase y casi todos los ejemplos no corren sin sesión.
   - Hacer: `walkthrough login gpm <url>` y un `render --preview` de un tour de GPM.
   - Listo cuando termina sin errores y la auditoría de tiempos sale limpia.

2. **Los clips de GPM no existen en esta PC.** `global.yaml` y `global-v2.yaml` reproducen `phone-hero.mp4`, `phone-booking(-v2).mp4` y `phone-itinerary(-v2).mp4`. Están en `.gitignore` y se generan a mano: se renderizan los `phone-*.yaml`, se copian a `tours/gpm/assets/` y se recortan con los comandos de los comentarios de `global-v2.yaml`.
   - **Riesgo:** si falta un clip, `mediaReady` resuelve igual con el error del `<video>`, y el render termina sin avisar con el teléfono vacío.
   - **Decidido:** los clips no viajan entre máquinas. El tour declara de qué tour sale cada clip y cómo se recorta, y cada entorno lo arma con sus propios renders (plan, 13.1 y 13.2).

3. **La letra base de los overlays depende del sistema.** `--font` (SF Pro) sale en Arial y `--mono` (SF Mono/Menlo) sale en Consolas. Afecta títulos, gráficas, tablas, flujos, apartes, cierre y código.
   - SF Pro no se puede vendorizar: su licencia no permite usarla fuera de equipos Apple.
   - **Decisión pendiente:** vendorizar Inter y JetBrains Mono (OFL) para que salga igual en los dos sistemas, como se hizo con Permanent Marker y Kalam. Esto cambia un poco el aspecto actual en la Mac.
   - Medido en Windows: Arial negrita promedia 0,45 em (0,53 en frases con mayúsculas) y Consolas 0,55 em. Las constantes de layout (`CHAR_EM` 0,5 en el aparte, 0,58 en gráficas, `MONO_EM` 0,62) alcanzan en promedio, pero falta compararlo a ojo (punto 5).

### P2 · Sin probar

4. **`upload` no tiene prueba de integración** con un selector de archivos real, en ningún sistema; solo de horario y de carga del tour. Hacer: un fixture local con `<input type="file">` y una prueba que suba un archivo y lo verifique en la página.
5. **Comparar el catálogo de los dos sistemas.** `walkthrough catalog --device=both` en cada máquina, y revisar las hojas de contacto lado a lado. Depende de la decisión del punto 3.
6. **Medir un render completo en Windows** (tiempos por etapa) para la tabla de «Rendimiento». Depende del punto 1.

### P3 · Mantenimiento

7. **`walkthrough clean` no borra `catalog/`, `probe/` ni `inspect/`**, que también son caché regenerable.
8. **Los comandos de los comentarios de `global-v2.yaml` cortan líneas con `\`.** Funcionan en Git Bash, pero no en PowerShell. Desaparecen con los clips declarados (punto 2).
9. **Fin de línea.** Git en Windows usa `autocrlf=true` y no hay `.gitattributes`, así que la copia de trabajo queda en CRLF y cada commit avisa. No rompe nada (las pruebas pasan). Un `.gitattributes` con `* text=auto eol=lf` lo dejaría igual en las dos máquinas.
10. **Linux sin probar.** Las rutas y la Papelera ya tienen su rama, pero nada se ha corrido ahí.

## Ojo con las fechas

- `global-v2.yaml`: la estancia del huésped va del 5 al 11 de octubre de 2026. Después, el panel de reserva ya no ofrece fechas, así que ese video se renderiza a más tardar el 11/oct, en cualquiera de las dos máquinas.

## Plan

El plan de desarrollo está en `docs/plan.md`, «Fase 13 — Mismo esquema, entornos distintos».

| Punto | Paso del plan |
|---|---|
| 1 y 6 | 13.3 |
| 2 y 8 | 13.1 y 13.2 |
| 3 y 5 | 13.4 |
| 4 | 13.5 |
| 7 y 9 | 13.6 |
| 10 | Fuera de la fase |
