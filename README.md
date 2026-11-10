# OpenCut — Community Unified Edition

**The open-source CapCut alternative — unifying the full Next.js/TypeScript + Rust/WASM web video editor with the best active community forks, open Pull Requests, and AI subtitle & editing workflows under the MIT License.**

Upstream repository: [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) · Full attribution & license history: [`CREDITS.md`](./CREDITS.md) & [`LICENSE`](./LICENSE)

## Highlights in the Community Unified Edition

- **AI Viral Subtitles & Live In-Place Editing (`apps/web/src/subtitles/`)**:
  - 1-click multi-source audio transcription (Full timeline, selected clip, or voiceover mic) with parallel 30-second chunking and zero gaps.
  - **In-place subtitle updates**: Editing text, style presets, fonts, colors, stroke, background, vertical alignment, or word pacing (`1–3 words`, `4–6 words`, `Sentence`) updates existing timeline subtitles directly without duplicating tracks.
  - **Transparent Die-Cut Stickers (`White` / `Black` outline)**: Backgroundless images (transparent PNG/WebP or generated contextual stickers) preserve 100% transparency and render with a configurable crisp white (`#FFFFFF`) or black (`#000000`) die-cut silhouette border.
  - **Single-Image Real Reaction Memes**: AI-assisted and searchable catalog of real single-image reaction memes (excluding blank multi-panel templates) with contextual Impact captions.
  - **Configurable Overlay Image & Meme Animations**: 9 animation presets (`Pop Zoom`, `Elastic Drop`, `Slide Up`, `Spin`, `Fade In/Out`, `Active Pulse`, `Float Hover`, `Handheld Shake`, `None`) with live in-place updates on existing timeline overlays.
- **Professional NLE Timeline Interchange (`DGDH-OS/dgdh-cut`)**:
  - Export timelines to **CMX 3600 EDL (`.edl`)**, **Final Cut Pro X XML v1.11 (`.fcpxml`)**, and **OpenTimelineIO (`.otio`)** for DaVinci Resolve, Premiere Pro, and Final Cut Pro.
- **3-Way Color Grading, Curves & Video Scopes (`DGDH-OS/dgdh-cut` + `Ekaanth/OpenCut-AI`)**:
  - Lift / Gamma / Gain color wheels, RGB curves editor, waveform/parade/histogram scopes, and auto-color profiles (`apps/web/src/components/editor/color/`, `apps/web/src/lib/color/`).
- **AI Director & VAD Audio Editing (`fullvaluedan/vibecut`)**:
  - Voice Activity Detection (VAD) interval analysis, silence refinement, dead-air detection, filler-word detection, and emphasis pauses (`apps/web/src/services/vad/`, `apps/web/src/features/`).
- **20 GLSL Transition Shaders, Frame-Differ Scene Detection & YouTube Chapters (`Ekaanth/OpenCut-AI`)**:
  - 20 GPU fragment shaders (`apps/web/src/lib/transitions/shaders/`), automatic cut/scene detection (`apps/web/src/lib/scene-detection/`), and YouTube chapter generator (`apps/web/src/lib/chapters/`).
- **Headless Renderer & Model Context Protocol Server (`nvxtien/opencut-classic`)**:
  - `packages/project-schema`, `packages/headless-render`, and `packages/mcp-server` for programmatic AI agent video editing and headless rendering.
- **Portable `.zip` Project Packages & CapCut Template Importer (`adamhasani/opencut-classic`)**:
  - Import/export self-contained `.zip` project bundles and search/convert CapCut templates (`apps/web/src/project/import-package.ts`, `apps/web/src/capcut/`).
- **Mobile Timeline Haptics (`Blueturboguy07/kneecap`) & 9 Community PRs (`#800`, `#796`, `#795`, `#780`, `#777`, `#773`, `#758`, `#757`, `#661`)**:
  - Haptic feedback on touch snap points, audio codec verification on export, multi-select delete confirmation fixes, timeline drag-out restoration, and Linux/macOS setup improvements.
- **Resumable Cloud Project & Media Pool Sync (`/api/cloud-storage`)**:
  - Chunked upload/download API for synchronizing projects and media assets across nodes.

## Sponsors

Thanks to [Vercel](https://vercel.com?utm_source=github-opencut&utm_campaign=oss) and [fal.ai](https://fal.ai?utm_source=github-opencut&utm_campaign=oss) for their support of open-source software.

<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

<a href="https://fal.ai">
  <img alt="Powered by fal.ai" src="https://img.shields.io/badge/Powered%20by-fal.ai-000000?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCAxMEwxMy4wOSAxNS43NEwxMiAyMkwxMC45MSAxNS43NEw0IDEwTDEwLjkxIDguMjZMMTIgMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=" />
</a>

## Why?

- **Privacy**: Your videos stay on your device
- **Free features**: Most basic CapCut features are now paywalled 
- **Simple**: People want editors that are easy to use - CapCut proved that

## Project Structure

- `apps/web/`: Next.js web application
- `apps/desktop/`: Native desktop app built with GPUI (in progress)
- `rust/`: Platform-agnostic core: GPU compositor, effects, masks, and WASM bindings. We're actively migrating business logic here from TypeScript.
- `docs/`: Architecture and subsystem documentation

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

> **Note:** Docker is optional but recommended for running the local database and Redis. If you only want to work on frontend features, you can skip it.

### Setup

1. Fork and clone the repository

2. Copy the environment file:

   ```bash
   # Unix/Linux/Mac
   cp apps/web/.env.example apps/web/.env.local

   # Windows PowerShell
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

3. Start the database and Redis:

   ```bash
   docker compose up -d db redis serverless-redis-http
   ```

4. Install dependencies and start the dev server:

   ```bash
   bun install
   bun dev:web
   ```

The application will be available at [http://localhost:3000](http://localhost:3000).

The `.env.example` has sensible defaults that match the Docker Compose config — it should work out of the box.

### Desktop setup

Desktop is opt-in. If you're only working on the web app, skip this entirely.

If you want to get ready for `apps/desktop`, see [`apps/desktop/README.md`](apps/desktop/README.md). It's a two-step setup: Rust toolchain first, then desktop native dependencies.

### Local WASM development

Only needed if you're editing `rust/wasm` and want the web app to use your local build instead of the published package.

**Prerequisites** — install these once before anything else:

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# build the WASM package
cargo install wasm-pack

# reruns the build on file changes, used by bun dev:wasm
cargo install cargo-watch
```

1. Build the package once from the repo root:

   ```bash
   bun run build:wasm
   ```

2. Register the generated package for linking:

   ```bash
   cd rust/wasm/pkg
   bun link
   ```

3. Link `apps/web` to the local package:

   ```bash
   cd apps/web
   bun link opencut-wasm
   ```

4. Rebuild on changes while you work:

   ```bash
   bun dev:wasm
   ```

To switch `apps/web` back to the published package, run:

```bash
cd apps/web
bun add opencut-wasm
```

### Self-Hosting with Docker

To run everything (including a production build of the app) in Docker:

```bash
docker compose up -d
```

The app will be available at [http://localhost:3100](http://localhost:3100).

## Contributing

We welcome contributions! While we're actively developing and refactoring certain areas, there are plenty of opportunities to contribute effectively.

**🎯 Focus areas:** Timeline functionality, project management, performance, bug fixes, and UI improvements outside the preview panel.

**⚠️ Avoid for now:** Preview panel enhancements (fonts, stickers, effects) and export functionality - we're refactoring these with a new binary rendering approach.

See our [Contributing Guide](.github/CONTRIBUTING.md) for detailed setup instructions, development guidelines, and complete focus area guidance.

**Quick start for contributors:**

- Fork the repo and clone locally
- Follow the setup instructions in CONTRIBUTING.md
- Working on `apps/desktop`? See [`apps/desktop/README.md`](apps/desktop/README.md) for setup
- Create a feature branch and submit a PR

## License

[MIT LICENSE](LICENSE)

---

![Star History Chart](https://api.star-history.com/svg?repos=opencut-app/opencut&type=Date)

