#!/usr/bin/env python3
"""
Fast local word-level Whisper transcription script for OpenCut.
Automatically selects the fastest available local faster-whisper model
on M1 or M2 and returns segments + word-level timestamps as JSON.
"""
import json
import os
import sys
import time
from pathlib import Path

HOME_DIR = os.path.expanduser("~")
MODEL_CANDIDATES = [
    os.path.join(HOME_DIR, ".cache/huggingface/hub/models--Systran--faster-whisper-base/snapshots/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"),
    os.path.join(HOME_DIR, ".cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/536b0662742c02347bc0e980a01041f333bce120"),
    os.path.join(HOME_DIR, ".cache/huggingface/hub/models--Systran--faster-whisper-tiny/snapshots/d90ca5fe260221311c53c58e660288d3f33fb607"),
    os.path.join(HOME_DIR, ".local/share/opencut/models/faster-whisper-large-v3-turbo"),
]


def resolve_model_path() -> tuple[str, str]:
    env_model = os.environ.get("OPENCUT_WHISPER_MODEL", "").strip()
    if env_model and os.path.isdir(env_model):
        return env_model, os.path.basename(os.path.dirname(os.path.dirname(env_model))) or "custom"
    for candidate in MODEL_CANDIDATES:
        if os.path.isdir(candidate) and os.path.isfile(os.path.join(candidate, "model.bin")):
            label = "faster-whisper-small"
            if "base" in candidate:
                label = "faster-whisper-base"
            elif "turbo" in candidate:
                label = "faster-whisper-large-v3-turbo"
            elif "tiny" in candidate:
                label = "faster-whisper-tiny"
            return candidate, label
    return "small", "faster-whisper-small"


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing audio file path"}))
        return 1

    audio_path = sys.argv[1]
    language_arg = sys.argv[2].strip().lower() if len(sys.argv) > 2 else "auto"
    language = None if language_arg in ("", "auto", "undefined", "null") else language_arg

    if not Path(audio_path).is_file():
        print(json.dumps({"ok": False, "error": f"Audio file not found: {audio_path}"}))
        return 1

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"faster_whisper unavailable: {exc}"}))
        return 1

    t0 = time.monotonic()
    model_path, model_label = resolve_model_path()

    try:
        cpu_threads = min(8, max(2, (os.cpu_count() or 4)))
        model = WhisperModel(
            model_path,
            device="cpu",
            compute_type="int8",
            cpu_threads=cpu_threads,
        )
        segments_iter, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
            word_timestamps=True,
            condition_on_previous_text=False,
        )

        segments_out = []
        full_text_parts = []

        for seg in segments_iter:
            seg_text = (getattr(seg, "text", "") or "").strip()
            if not seg_text:
                continue
            full_text_parts.append(seg_text)
            seg_start = round(float(getattr(seg, "start", 0.0) or 0.0), 3)
            seg_end = round(float(getattr(seg, "end", seg_start) or seg_start), 3)
            words_out = []
            raw_words = getattr(seg, "words", None) or []
            for w in raw_words:
                w_text = (getattr(w, "word", "") or "").strip()
                if not w_text:
                    continue
                w_start = round(float(getattr(w, "start", seg_start) or seg_start), 3)
                w_end = round(float(getattr(w, "end", max(w_start + 0.08, seg_end)) or seg_end), 3)
                words_out.append({
                    "word": w_text,
                    "start": w_start,
                    "end": max(w_start + 0.04, w_end),
                })

            segments_out.append({
                "start": seg_start,
                "end": max(seg_start + 0.1, seg_end),
                "text": seg_text,
                "words": words_out,
            })

        duration = round(float(getattr(info, "duration", 0.0) or 0.0), 3)
        detected_lang = str(getattr(info, "language", language or "es") or "es")
        elapsed = round(time.monotonic() - t0, 3)

        print(json.dumps({
            "ok": True,
            "engine": model_label,
            "language": detected_lang,
            "duration": duration,
            "elapsedSeconds": elapsed,
            "text": " ".join(full_text_parts).strip(),
            "segments": segments_out,
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
