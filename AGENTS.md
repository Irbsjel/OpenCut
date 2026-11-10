# Agents.md

## Architecture

An ongoing migration is moving all business logic into `rust/`. Each app under `apps/` is a UI shell — it owns rendering, interaction, and platform-specific concerns, but never owns logic. The UI framework for any given app is a replaceable detail.

### `rust/`

The single source of truth for all non-UI code. Everything platform-agnostic belongs here: no components, no hooks, no framework imports.

### `apps/`

Each app is a frontend that calls into Rust. Logic is never duplicated between apps — only UI is, because each platform may use an entirely different framework and language to build it.

- `web/` — Next.js
- `desktop/` — GPUI

## Web

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.


## Subtítulos: límites y composición (2026-11-10)

- **El tamaño original de las letras se conserva**. Para caber se redistribuyen las palabras en renglones y se acomoda el bloque verticalmente. Nunca reducir todo el subtítulo por tener muchas palabras o renglones.
- Solo una palabra que exceda por sí sola el ancho seguro puede reducirse: se aísla en su propio renglón y se guarda su escala en `subtitleLineScales`. Las demás palabras conservan exactamente el tamaño. Medición, render estático y karaoke comparten esas escalas.
- `apps/web/src/subtitles/fit-layout.ts` reserva márgenes laterales, contorno, sombra y énfasis karaoke. Si el bloque todavía excede la zona vertical, se reporta; no se vuelve diminuto para ocultar el problema.
- Ajustar composición nunca cambia palabras, tiempos de entrada/salida, identificadores, karaoke ni pistas ajenas. Conservar la exclusión mutua previa entre subtítulos e imágenes contextuales.
- Reparaciones de proyectos guardados: ejecutar primero `apps/web/scripts/fit-project-subtitles.ts` en modo lectura; `--write <backup-dir> [original-bundle.json]` guarda copia previa y rechaza cambios concurrentes. Verificar con la fuente real y revisar el resultado en el editor.
