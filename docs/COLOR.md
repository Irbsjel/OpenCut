# Kleurcorrectie (tab Aanpassing / werkruimte Kleur)

Eigen ontwerp, geen code, assets of LUTs van andere tools overgenomen. Bestanden:
`apps/web/src/components/editor/color/**` (wiskunde, shader, scopes, UI) en
`apps/web/src/components/engine/grade-panel.tsx` (paneel).

## Keten per pixel (0..1, display-referred)
belichting (2^stops) -> temperatuur/tint (kanaalvermenigvuldiger) -> lift/gamma/gain per kanaal ->
contrast (rond 0,5) -> verzadiging (Rec. 709-luma) -> curves (master, daarna R/G/B).

- Wielen: puck = hue + hoeveelheid; offset is nulgemiddeld (zuivere tint). Luma-slider per wiel.
  `out = c*gain + lift*(1-c)`, daarna `c^(1/gamma)`.
- Curves: monotone kubische interpolatie (Fritsch-Carlson), 256-stappen LUT. Klik voegt punt toe, sleep wijzigt, dubbelklik verwijdert.
- `grade-math.ts` (CPU-referentie) en de WebGL-shader in `grade-renderer.ts` zijn dezelfde keten; de CPU-versie
  is ook de fallback zonder WebGL en de bron voor de .cube-export.

## Preview en scopes
Het paneel toont de gekozen bron (eigen testbeeld, engine-mediabak of eigen bestand/video) live via WebGL.
Waveform (RGB), histogram en vectorscope (Rec. 709 Cb/Cr, huidtoon-lijn, 75%-doelen) worden berekend uit
het gerenderde canvas (verkleind naar 256 px breed), ca. 15 fps tijdens afspelen.
De kanaalkleuren in histogram en curves (rood/groen/blauw) zijn functioneel en volgen niet de merktokens.

## Export en wat (nog) niet kan
| Pad | Status |
|---|---|
| Preview in het paneel | volledig, live |
| `.cube` 3D-LUT (33^3) met de volledige correctie | werkt, toepasbaar in elke editor met LUT-ondersteuning |
| Engine `/api/grade` | alleen LUT-id uit de engine-catalogus + helderheid/contrast/verzadiging/gamma (ffmpeg `eq`). Wielen en curves kunnen niet mee: de API kent geen LUT-upload. Sectie "Engine-render" blijft ongewijzigd beschikbaar |
| Hoofdpreview en client-export (wasm/wgpu) | **niet gekoppeld**. De GPU-pipeline (`rust/` + `src/effects`) kent alleen blur; een grade-effect vraagt een nieuwe shader in Rust |

Aanbevolen vervolg: `lut_cube` (inline of upload) toevoegen aan `/api/grade` en `/api/compose`, zodat
de engine de .cube uit dit paneel rendert; en een `color-grade`-effect in `rust/` met dezelfde uniforms
(`gradeToUniforms()`) zodat de hoofdpreview en export gelijk lopen.

## Responsief
Het paneel gebruikt container queries. Op telefoonbreedte (390 px) krimpt de zijbalk van de editor tot
ca. 44 px; onder 280 px breed toont het paneel daarom een knop "Kleur" die het volledige paneel als
schermvullende dialoog opent (state blijft behouden).

## Tests
`bun test src/components/editor/color` (wiskunde, curves, .cube, scopes). Playwright-controle: zie commit-notitie.
