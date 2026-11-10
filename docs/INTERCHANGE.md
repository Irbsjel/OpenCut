# Tijdlijn-uitwisseling: EDL, FCPXML, OTIO

Code: `apps/web/src/services/interchange/**`. UI: paneel Kleur -> sectie "Tijdlijn uitwisselen"
(`components/editor/color/interchange-export.tsx`). Alles op basis van publieke specificaties
(CMX3600, FCPXML 1.10 DTD/referentie, OpenTimelineIO-schema's).

## Model
`buildInterchangeTimeline()` zet de hoofdscène om naar een neutraal model in **hele frames** van de
projectsnelheid: video (hoofdtrack + overlay-videotracks), afbeeldingen en audio. Tekst, stickers, graphics,
effecten, maskers en keyframes worden niet geexporteerd. Retime wordt als snelheid meegenomen.
Tijdlijnstart is 01:00:00:00 (gangbaar voor EDL/FCPXML), 29.97 en 59.94 krijgen drop-frame timecode.

## Formaten
| Formaat | Schrijven | Lezen | Opmerkingen |
|---|---|---|---|
| EDL (CMX3600) | ja | ja | alleen cuts (`C`); V-events, A/A2.. voor audio; `M2` voor snelheid; `* FROM CLIP NAME`/`SOURCE FILE` |
| FCPXML 1.10 | ja | ja | hoofdtrack in de spine met `gap`; overige clips als verbonden clips (`lane`); `timeMap` voor snelheid; asset-`media-rep` is `file:///<bestandsnaam>` (relink in de doelapp) |
| OTIO (JSON) | ja | ja | Timeline.1 / Stack.1 / Track.1 / Clip.2 / Gap.1 / ExternalReference.1; `LinearTimeWarp.1` voor snelheid |

Lezen levert het neutrale model (`parseEdl`, `parseFcpxml`, `parseOtio`). **Import in een project is niet
gekoppeld**: een geimporteerde tijdlijn verwijst naar mediabestanden die eerst aan de mediabibliotheek
gebonden moeten worden (naam -> asset). Vervolg: koppelstap op bestandsnaam + `InsertElement`-commando's.

## Bekende beperkingen
- EDL kent geen meerdere videotracks: overlay-video wordt als overlappende V-events geschreven en bij lezen track 0.
- Bron-timecode begint op 00:00:00:00; de bronsnelheid van een asset wordt niet apart bijgehouden (projectsnelheid).
- EDL-overgangen anders dan `C` (dissolve, wipe) geven een foutmelding bij lezen.
- FCPXML-validatie: well-formed gecontroleerd met `xmllint --noout`; geen schema-validatie tegen de Apple-DTD uitgevoerd.

## Tests
`bun test src/services/interchange`: timecode (24/25/29.97 NDF+DF/30/59.94, drop-frame-roundtrip over 3 uur),
export -> parse -> zelfde cuts/tijden voor alle drie de formaten bij 24/25/30/29.97 NDF/DF, snelheid, randgevallen.
