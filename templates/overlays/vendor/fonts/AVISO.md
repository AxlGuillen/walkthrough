# Fuentes a mano

Letras de plumón y de escritura a mano que se ven igual en macOS y Windows, en lugar de Marker Felt, Noteworthy y Chalkduster, que solo trae macOS. Bajadas el 4/oct/2026 de [google/fonts](https://github.com/google/fonts) con permiso del autor del repo.

| Archivo | Fuente | Licencia | Dónde se usa |
|---|---|---|---|
| `PermanentMarker-Regular.ttf` | Permanent Marker (Font Diner) | Apache 2.0 (`LICENSE-PermanentMarker.txt`) | Etiquetas (`label`), pizarrón blanco, título del corcho |
| `Kalam-Bold.ttf` | Kalam Bold (Indian Type Foundry) | SIL OFL 1.1 (`OFL-Kalam.txt`) | Pizarrón de gis (con su filtro), notas del corcho |

- `fonts.css` las declara y `base.css` lo importa; las plantillas las piden con `var(--marker)` y `var(--hand)`.
- Las etiquetas se dibujan dentro de la app grabada, así que la captura le pasa los bytes de Permanent Marker a la página con `FontFace` (`src/effects/font.ts`): nada se pide por red y el CSP de la app no lo bloquea.
- Ambas licencias permiten redistribuirlas con el proyecto siempre que la licencia vaya al lado; no se venden sueltas.
