#!/usr/bin/env python3
"""Motores de voz (TTS) para el AI Studio de OpenCut.

Uso:
  tts_engines.py list                 -> JSON con motores, disponibilidad y voces
  tts_engines.py synth < peticion.json -> sintetiza y responde JSON {ok, path, mime}

Peticion de synth:
  {"engine": "edge", "voice": "es-MX-DaliaNeural", "voice2": "es-MX-JorgeNeural",
   "multiSpeaker": false, "text": "...", "rate": 0, "pitch": 0, "outDir": "/tmp/..."}

En modo 2 voces, cada renglón es un turno. Si el renglón empieza con "Nombre:",
el primer nombre que aparezca usa la voz 1 y el segundo la voz 2; si no hay
nombres, los renglones alternan voz 1 / voz 2. El prefijo "Nombre:" no se lee.

Las llaves de API se leen del pool de NERV (solo en el servidor), nunca del cliente.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import wave
from pathlib import Path

HOME = Path.home()
KEYS_POOL = Path(
    os.environ.get(
        "OPENCUT_KEYS_POOL", HOME / "sistema/tools/nerv-sinapsis/keys_pool.json"
    )
)
HTTP_TIMEOUT = 90

GEMINI_VOICES = [
    ("Kore", "Femenina · firme"), ("Puck", "Masculina · animada"),
    ("Charon", "Masculina · informativa"), ("Aoede", "Femenina · ligera"),
    ("Fenrir", "Masculina · enérgica"), ("Zephyr", "Femenina · brillante"),
    ("Leda", "Femenina · juvenil"), ("Orus", "Masculina · firme"),
    ("Callirrhoe", "Femenina · relajada"), ("Autonoe", "Femenina · brillante"),
    ("Enceladus", "Masculina · susurrante"), ("Iapetus", "Masculina · clara"),
    ("Umbriel", "Masculina · relajada"), ("Algieba", "Masculina · tersa"),
    ("Despina", "Femenina · tersa"), ("Erinome", "Femenina · clara"),
    ("Algenib", "Masculina · grave"), ("Rasalgethi", "Masculina · informativa"),
    ("Laomedeia", "Femenina · animada"), ("Achernar", "Femenina · suave"),
    ("Alnilam", "Masculina · firme"), ("Schedar", "Masculina · pareja"),
    ("Gacrux", "Femenina · madura"), ("Pulcherrima", "Femenina · directa"),
    ("Achird", "Masculina · amigable"), ("Zubenelgenubi", "Masculina · casual"),
    ("Vindemiatrix", "Femenina · gentil"), ("Sadachbia", "Masculina · vivaz"),
    ("Sadaltager", "Masculina · conocedora"), ("Sulafat", "Femenina · cálida"),
]
OPENAI_VOICES = [
    "alloy", "ash", "ballad", "coral", "echo", "fable",
    "nova", "onyx", "sage", "shimmer", "verse",
]
GTTS_ACCENTS = [
    ("com.mx", "Español · México"), ("es", "Español · España"),
    ("us", "Español · EE. UU."), ("com", "Español · genérico"),
]
ESPEAK_VOICES = [
    ("es-419", "Español latino · masculina"), ("es-419+f3", "Español latino · femenina"),
    ("es", "Español España · masculina"), ("es+f3", "Español España · femenina"),
    ("en-us", "Inglés EE. UU."),
]
MELO_LANGS = [("es", "Español"), ("en", "Inglés"), ("fr", "Francés")]

EDGE_FALLBACK = [
    ("es-MX-DaliaNeural", "México · Dalia (F)"), ("es-MX-JorgeNeural", "México · Jorge (M)"),
    ("es-US-PalomaNeural", "EE. UU. · Paloma (F)"), ("es-US-AlonsoNeural", "EE. UU. · Alonso (M)"),
    ("es-ES-ElviraNeural", "España · Elvira (F)"), ("es-ES-AlvaroNeural", "España · Álvaro (M)"),
]


# ---------------------------------------------------------------- utilidades

def _pool_key(provider: str) -> str | None:
    env_names = {
        "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "openai": ["OPENAI_API_KEY"],
        "cloudflare": ["CLOUDFLARE_API_TOKEN"],
    }.get(provider, [])
    for name in env_names:
        if os.environ.get(name):
            return os.environ[name]
    try:
        data = json.loads(KEYS_POOL.read_text())
        keys = data["providers"][provider]["keys"]
        for k in keys:
            if isinstance(k, str) and k.strip():
                return k.strip()
            if isinstance(k, dict) and (k.get("key") or k.get("value")):
                return k.get("key") or k.get("value")
    except Exception:
        return None
    return None


def _cloudflare_account() -> str | None:
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        return os.environ["CLOUDFLARE_ACCOUNT_ID"]
    try:
        data = json.loads(KEYS_POOL.read_text())
        endpoint = data["providers"]["cloudflare"]["endpoint"]
        m = re.search(r"/accounts/([0-9a-f]+)/", endpoint)
        return m.group(1) if m else None
    except Exception:
        return None


def _post_json(url: str, body: dict, headers: dict) -> tuple[int, bytes, str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return resp.status, resp.read(), resp.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), ""


def _api_error(engine: str, status: int, payload: bytes) -> RuntimeError:
    try:
        msg = json.loads(payload).get("error", {})
        msg = msg.get("message") if isinstance(msg, dict) else str(msg)
    except Exception:
        msg = payload[:200].decode("utf-8", "replace")
    hint = ""
    if status in (402, 429) and re.search(r"credit|quota|billing", msg or "", re.I):
        hint = " (sin crédito o cuota agotada)"
    return RuntimeError(f"{engine}: HTTP {status}{hint}: {msg}")


def _write_pcm_wav(path: Path, pcm: bytes, rate: int = 24000) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def _concat_to_mp3(parts: list[Path], out: Path, gap: float = 0.35) -> None:
    """Une segmentos con un silencio corto entre turnos y normaliza a MP3 mono 44.1 kHz."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg no está instalado")
    inputs: list[str] = []
    filters: list[str] = []
    n = 0
    for i, p in enumerate(parts):
        inputs += ["-i", str(p)]
        filters.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=mono[a{i}]")
    labels = []
    for i in range(len(parts)):
        labels.append(f"[a{i}]")
        if i < len(parts) - 1 and gap > 0:
            filters.append(
                f"anullsrc=r=44100:cl=mono,atrim=duration={gap}[s{i}]"
            )
            labels.append(f"[s{i}]")
    n = len(labels)
    filters.append(f"{''.join(labels)}concat=n={n}:v=0:a=1[out]")
    cmd = [
        "ffmpeg", "-v", "error", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", str(out),
    ]
    subprocess.run(cmd, check=True, timeout=180)


def _split_turns(text: str, multi: bool) -> list[tuple[int, str]]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return []
    if not multi:
        return [(0, "\n".join(lines))]
    speakers: dict[str, int] = {}
    turns: list[tuple[int, str]] = []
    for idx, line in enumerate(lines):
        m = re.match(r"^([A-Za-zÁÉÍÓÚÑáéíóúñü0-9 ._-]{1,24}):\s*(.+)$", line)
        if m:
            name = m.group(1).strip().lower()
            if name not in speakers:
                speakers[name] = len(speakers) % 2
            turns.append((speakers[name], m.group(2).strip()))
        else:
            turns.append((idx % 2, line))
    return turns


# ---------------------------------------------------------------- motores

def synth_edge(text: str, voice: str, rate: int, pitch: int, out: Path) -> None:
    import edge_tts  # noqa: PLC0415

    async def run() -> None:
        comm = edge_tts.Communicate(
            text=text, voice=voice or "es-MX-DaliaNeural",
            rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz",
        )
        await comm.save(str(out))

    asyncio.run(run())


def synth_gtts(text: str, voice: str, rate: int, _pitch: int, out: Path) -> None:
    from gtts import gTTS  # noqa: PLC0415

    gTTS(text=text, lang="es", tld=voice or "com.mx", slow=rate < -25).save(str(out))


def synth_espeak(text: str, voice: str, rate: int, pitch: int, out: Path) -> None:
    binary = shutil.which("espeak-ng") or shutil.which("espeak")
    if not binary:
        raise RuntimeError("espeak-ng no está instalado")
    speed = max(80, min(400, int(165 * (1 + rate / 100))))
    pit = max(0, min(99, 50 + pitch))
    subprocess.run(
        [binary, "-v", voice or "es-419", "-s", str(speed), "-p", str(pit),
         "-w", str(out), text],
        check=True, timeout=120,
    )


def synth_melotts(text: str, voice: str, _rate: int, _pitch: int, out: Path) -> None:
    key, acct = _pool_key("cloudflare"), _cloudflare_account()
    if not key or not acct:
        raise RuntimeError("cloudflare: falta llave o account id")
    status, payload, ctype = _post_json(
        f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/myshell-ai/melotts",
        {"prompt": text, "lang": voice or "es"},
        {"Authorization": f"Bearer {key}"},
    )
    if status != 200:
        raise _api_error("cloudflare", status, payload)
    if "json" in ctype or payload[:1] == b"{":
        data = json.loads(payload)
        audio_b64 = (data.get("result") or {}).get("audio") or data.get("audio")
        if not audio_b64:
            raise RuntimeError("cloudflare: respuesta sin audio")
        out.write_bytes(base64.b64decode(audio_b64))
    else:
        out.write_bytes(payload)


def synth_gemini_native(turns: list[tuple[int, str]], v1: str, v2: str,
                        multi: bool, out_wav: Path) -> None:
    key = _pool_key("gemini")
    if not key:
        raise RuntimeError("gemini: falta llave")
    if multi:
        prompt = "\n".join(f"{'Hablante1' if s == 0 else 'Hablante2'}: {t}" for s, t in turns)
        speech = {"multiSpeakerVoiceConfig": {"speakerVoiceConfigs": [
            {"speaker": "Hablante1", "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v1 or "Kore"}}},
            {"speaker": "Hablante2", "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v2 or "Charon"}}},
        ]}}
        prompt = "Lee este diálogo en español de México, natural:\n" + prompt
    else:
        prompt = "\n".join(t for _, t in turns)
        speech = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v1 or "Kore"}}}
    status, payload, _ = _post_json(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash-preview-tts:generateContent?key={key}",
        {"contents": [{"parts": [{"text": prompt}]}],
         "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": speech}},
        {},
    )
    if status != 200:
        raise _api_error("gemini", status, payload)
    data = json.loads(payload)
    inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
    m = re.search(r"rate=(\d+)", inline.get("mimeType", ""))
    _write_pcm_wav(out_wav, base64.b64decode(inline["data"]), int(m.group(1)) if m else 24000)


def synth_openai(text: str, voice: str, rate: int, _pitch: int, out: Path) -> None:
    key = _pool_key("openai")
    if not key:
        raise RuntimeError("openai: falta llave")
    status, payload, _ = _post_json(
        "https://api.openai.com/v1/audio/speech",
        {"model": "gpt-4o-mini-tts", "voice": voice or "coral", "input": text,
         "instructions": "Habla en español de México, con naturalidad.",
         "speed": max(0.5, min(2.0, 1 + rate / 100)), "response_format": "mp3"},
        {"Authorization": f"Bearer {key}"},
    )
    if status != 200:
        raise _api_error("openai", status, payload)
    out.write_bytes(payload)


SEGMENT_ENGINES = {
    "edge": (synth_edge, ".mp3"),
    "gtts": (synth_gtts, ".mp3"),
    "espeak": (synth_espeak, ".wav"),
    "melotts": (synth_melotts, ".mp3"),
    "openai": (synth_openai, ".mp3"),
}


# ---------------------------------------------------------------- catálogo

def _edge_voices() -> list[dict]:
    try:
        import edge_tts  # noqa: PLC0415

        voices = asyncio.run(edge_tts.list_voices())
        out = []
        for v in voices:
            short = v.get("ShortName", "")
            if not (short.startswith("es-") or short.startswith("en-US")):
                continue
            gender = "F" if v.get("Gender") == "Female" else "M"
            name = short.split("-")[-1].replace("Neural", "").replace("Multilingual", " multilingüe")
            region = v.get("Locale", "")
            out.append({"id": short, "label": f"{region} · {name} ({gender})"})
        # México primero, luego el resto del español, luego inglés.
        out.sort(key=lambda x: (0 if x["id"].startswith("es-MX") else 1 if x["id"].startswith("es-") else 2, x["id"]))
        return out or [{"id": i, "label": l} for i, l in EDGE_FALLBACK]
    except Exception:
        return [{"id": i, "label": l} for i, l in EDGE_FALLBACK]


def _module_ok(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def list_engines() -> dict:
    espeak_ok = bool(shutil.which("espeak-ng") or shutil.which("espeak"))
    has = {p: bool(_pool_key(p)) for p in ("gemini", "openai", "cloudflare")}
    engines = [
        {"id": "edge", "label": "Microsoft Edge Neural", "kind": "gratis · en línea",
         "available": _module_ok("edge_tts"), "rate": True, "pitch": True, "nativeMulti": False,
         "defaultVoice": "es-MX-DaliaNeural", "defaultVoice2": "es-MX-JorgeNeural",
         "voices": _edge_voices() if _module_ok("edge_tts") else []},
        {"id": "gemini", "label": "Google Gemini TTS (30 voces)", "kind": "API · requiere crédito",
         "available": has["gemini"], "rate": False, "pitch": False, "nativeMulti": True,
         "defaultVoice": "Kore", "defaultVoice2": "Charon",
         "voices": [{"id": i, "label": f"{i} — {d}"} for i, d in GEMINI_VOICES]},
        {"id": "openai", "label": "OpenAI gpt-4o-mini-tts", "kind": "API · requiere crédito",
         "available": has["openai"], "rate": True, "pitch": False, "nativeMulti": False,
         "defaultVoice": "coral", "defaultVoice2": "onyx",
         "voices": [{"id": v, "label": v.capitalize()} for v in OPENAI_VOICES]},
        {"id": "melotts", "label": "Cloudflare MeloTTS", "kind": "API · Workers AI",
         "available": has["cloudflare"] and bool(_cloudflare_account()),
         "rate": False, "pitch": False, "nativeMulti": False,
         "defaultVoice": "es", "defaultVoice2": "es",
         "voices": [{"id": i, "label": l} for i, l in MELO_LANGS]},
        {"id": "gtts", "label": "Google Translate (gTTS)", "kind": "gratis · en línea",
         "available": _module_ok("gtts"), "rate": False, "pitch": False, "nativeMulti": False,
         "defaultVoice": "com.mx", "defaultVoice2": "es",
         "voices": [{"id": i, "label": l} for i, l in GTTS_ACCENTS]},
        {"id": "espeak", "label": "eSpeak NG (sin internet)", "kind": "local · robótica",
         "available": espeak_ok, "rate": True, "pitch": True, "nativeMulti": False,
         "defaultVoice": "es-419", "defaultVoice2": "es-419+f3",
         "voices": [{"id": i, "label": l} for i, l in ESPEAK_VOICES]},
    ]
    return {"ok": True, "engines": engines}


# ---------------------------------------------------------------- síntesis

def synth(req: dict) -> dict:
    engine = str(req.get("engine") or "edge")
    text = str(req.get("text") or "").strip()
    if not text:
        raise RuntimeError("El guion está vacío")
    if len(text) > 12000:
        raise RuntimeError("El guion supera 12 000 caracteres; divídelo")
    v1 = str(req.get("voice") or "")
    v2 = str(req.get("voice2") or v1)
    multi = bool(req.get("multiSpeaker"))
    rate = int(max(-50, min(100, int(req.get("rate") or 0))))
    pitch = int(max(-40, min(40, int(req.get("pitch") or 0))))
    out_dir = Path(req.get("outDir") or tempfile.mkdtemp(prefix="opencut-tts-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "voz.mp3"

    turns = _split_turns(text, multi)
    if engine == "gemini":
        wav = out_dir / "gemini.wav"
        synth_gemini_native(turns, v1, v2, multi, wav)
        _concat_to_mp3([wav], out, gap=0)
        return {"ok": True, "path": str(out), "mime": "audio/mpeg"}

    if engine not in SEGMENT_ENGINES:
        raise RuntimeError(f"Motor desconocido: {engine}")
    fn, ext = SEGMENT_ENGINES[engine]
    parts: list[Path] = []
    for i, (speaker, line) in enumerate(turns):
        part = out_dir / f"seg_{i:03d}{ext}"
        fn(line, v2 if speaker == 1 else v1, rate, pitch, part)
        if not part.exists() or part.stat().st_size == 0:
            raise RuntimeError(f"{engine}: no generó audio en el turno {i + 1}")
        parts.append(part)
    _concat_to_mp3(parts, out, gap=0.35 if len(parts) > 1 else 0)
    for p in parts:
        p.unlink(missing_ok=True)
    return {"ok": True, "path": str(out), "mime": "audio/mpeg"}


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    try:
        if cmd == "list":
            result = list_engines()
        elif cmd == "synth":
            result = synth(json.loads(sys.stdin.read() or "{}"))
        else:
            raise RuntimeError(f"Comando desconocido: {cmd}")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
