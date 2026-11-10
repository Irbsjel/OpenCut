# Credits & Community Acknowledgements

This unified edition of **OpenCut** builds upon the original [OpenCut](https://github.com/OpenCut-app/OpenCut) / [opencut-classic](https://github.com/OpenCut-app/opencut-classic) project and consolidates features, performance optimizations, bug fixes, and architectural enhancements from across the global open-source community under the **MIT License**.

---

## 1. Original Project & Core Architecture
- **OpenCut (`OpenCut-app/OpenCut` & `OpenCut-app/opencut-classic`)**
  - Copyright (c) 2025-2026 OpenCut (`@MazeWinther` and all upstream contributors)
  - License: MIT

---

## 2. Unified Edition Enhancements (`@Irbsjel`)
- **1-Click Viral Captions Engine (`ViralCaptionsPanel`)**:
  - Live 9:16 canvas preview card with real-time typography, stroke, shadow, pill background, and vertical Y-offset (`20%`–`90%`) controls.
  - Built-in viral presets: **Hormozi Classic** (yellow/white high-impact), **White Box / Pill** (high-contrast rounded badge), and **Clean Stroke** (no background with crisp outline).
  - Non-destructive live style synchronization (`applyLiveStyleToExistingCaptions`) that updates existing caption tracks without re-transcribing.
- **Parallel 30-Second Chunk Audio Transcription (`/api/transcribe`)**:
  - Server-side `ffmpeg` 16 kHz mono WAV chunking (`30s` segments) with 3x parallel transcription via Groq Whisper (`whisper-large-v3-turbo`) and automatic fallback to local `faster-whisper`, reducing 5-minute video transcription time to ~6–8 seconds.
- **AI Contextual Meme & Sticker Engine (`/api/memes/*`)**:
  - Transcript-aware meme recommendation and 1-click overlay insertion onto the timeline.
- **WebCodecs B-Frame Export Fix**:
  - Monotonic timestamp normalization in `video-frame-source` to prevent `EncodingError` on videos containing B-frames.
- **Multi-Node Persistent Cloud Storage (`/api/cloud-storage`)**:
  - Server-backed project & media-pool persistence (`OPFS` + server disk sync) enabling seamless multi-device and multi-node access.

---

## 3. Integrated Community Forks (MIT License)

We gratefully acknowledge and credit the authors of the following open-source forks whose modules and optimizations are integrated in this repository:

| Fork Repository | Author / Maintainer | Integrated Contributions |
| :--- | :--- | :--- |
| **[`nvxtien/opencut-classic`](https://github.com/nvxtien/opencut-classic)** | `@nvxtien` | **Headless Render & MCP Server (`packages/headless-render`, `packages/mcp-server`, `packages/project-schema`)**: 17x faster per-element video decoding, overlay duration calculation fixes, and overlapping clip rendering fixes. |
| **[`adamhasani/opencut-classic`](https://github.com/adamhasani/opencut-classic)** | `@adamhasani` | **Self-Hosting & Portable Packages**: Optional `NEXT_PUBLIC_MARBLE_API_URL` / `FREESOUND_*` environment variables (`env/web.ts`), `.zip` project package importer (`project/import-package.ts`), and CapCut template structure mirror (`src/capcut/*`). |
| **[`DGDH-OS/dgdh-cut`](https://github.com/DGDH-OS/dgdh-cut)** | `@DGDH-OS` (David) | **Professional NLE Timeline Interchange & Color Grading**: Export to **EDL (CMX3600)**, **Final Cut Pro FCPXML 1.10**, and **OpenTimelineIO (`.otio`)** (`services/interchange/*`), plus 3-way Lift/Gamma/Gain color math, curves, and video scopes (`components/editor/color/*`). |
| **[`fullvaluedan/vibecut`](https://github.com/fullvaluedan/vibecut)** | `@fullvaluedan` (Dan) | **Smart Silence, Dead-Air & Filler Detection**: Voice Activity Detection (VAD) interval math (`services/vad/intervals.ts`), emphasis-pause preservation (`emphasis-pause.ts`), silence boundary refinement (`silence-refine.ts`), and deterministic filler/dead-air detectors (`dead-air.ts`, `filler-words.ts`). |
| **[`Blueturboguy07/kneecap`](https://github.com/Blueturboguy07/kneecap)** | `@Blueturboguy07` | **Mobile & Touch Timeline Ergonomics**: Web Vibration API haptic feedback helper (`timeline/haptics.ts`) for timeline snapping and playhead scrubbing on touch devices. |
| **[`Ekaanth/OpenCut-AI`](https://github.com/Ekaanth/OpenCut-AI)** | `@Ekaanth` | **AI Post-Production Utilities & GLSL Shaders**: YouTube chapter formatter (`lib/chapters/youtube-chapters.ts`), auto-color profiles (`lib/color/auto-color-profiles.ts`), frame-difference scene cut detector (`lib/scene-detection/*`), and 20 GLSL transition fragment shaders (`lib/transitions/shaders/*`). |

---

## 4. Integrated Upstream Pull Requests & Issue Contributors

We also thank and credit the following community developers whose Pull Requests and Issue reports on `OpenCut-app/OpenCut` were reviewed and integrated:

- **`@oguzhancttnky` ([PR #800](https://github.com/OpenCut-app/OpenCut/pull/800))**: Shift+Click range selection for timeline elements (`use-element-selection.ts`, `use-element-interaction.ts`).
- **`@avillagran` ([PR #796](https://github.com/OpenCut-app/OpenCut/pull/796) & [PR #795](https://github.com/OpenCut-app/OpenCut/pull/795))**: Distinct timeline element background tints for video vs. image clips (`timeline/components/theme.ts`) and Loop Playback toggle button in the preview toolbar (`preview/components/toolbar.tsx`, `playback-manager.ts`).
- **`@delta6626` ([PR #780](https://github.com/OpenCut-app/OpenCut/pull/780))**: Trimmed string validation fix in `delete-project-dialog.tsx`.
- **`@gewu2022` ([PR #777](https://github.com/OpenCut-app/OpenCut/pull/777))**: Fixed `SaveManager` race condition (`getActiveOrNull`) when navigating away from the editor (`save-manager.ts`).
- **`@MB-Ndhlovu` ([PR #773](https://github.com/OpenCut-app/OpenCut/pull/773))**: Detailed export progress UI showing `Frame X / Y`, elapsed time, estimated time remaining (`ETA`), and cancel confirmation before discarding an active export (`export-button.tsx`).
- **`@chinhkrb113` ([PR #758](https://github.com/OpenCut-app/OpenCut/pull/758) & [PR #757](https://github.com/OpenCut-app/OpenCut/pull/757))**: Bounded LRU `ImageBitmap` frame cache (`MAX_IMAGE_CACHE_ENTRIES = 50`) with explicit `.close()` GPU memory disposal (`media-manager.ts`), and runtime WebCodecs AAC/Opus/PCM audio encoder negotiation (`lib/export/audio-codec-support.ts`).
- **`@iknizzz1807` ([PR #661](https://github.com/OpenCut-app/OpenCut/pull/661))**: Raised tooltip `z-index` (`z-100`) to prevent overlap with adjacent UI panels (`components/ui/tooltip.tsx`).
- **Community Issue Reporters**:
  - `@theSatvik` ([Issue #799](https://github.com/OpenCut-app/OpenCut/issues/799) — CapCut-grade caption animations & viral presets)
  - `@Haspriwww` ([Issue #798](https://github.com/OpenCut-app/OpenCut/issues/798) — Non-blocking export & progress transparency)
  - `@quertiusx` ([Issue #794](https://github.com/OpenCut-app/OpenCut/issues/794) — Project package export/import portability)
  - `@aquilesszeiko-prog` ([Issue #793](https://github.com/OpenCut-app/OpenCut/issues/793) — Multi-node / cloud project synchronization)
