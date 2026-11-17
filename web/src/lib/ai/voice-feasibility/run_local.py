"""Offline feasibility experiment; no app integration, credentials, or audio upload.

Requires macOS say, ffmpeg, and a separately installed whisper.cpp CLI/model.
Outputs synthetic audio, raw transcripts, logs and process wall-clock timings.
Semantic scoring is deliberately manual; a successful process is not accuracy.
"""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import time
import wave


def run(command, **kwargs):
    return subprocess.run(command, check=True, capture_output=True, text=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--whisper-cli", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Choose a new output directory to preserve previous results.")
    for name in ("say", "ffmpeg"):
        if not shutil.which(name):
            parser.error(f"Required local tool is missing: {name}")
    for path in (args.whisper_cli, args.model):
        if not path.is_file():
            parser.error(f"Required local file is missing: {path}")
    args.output.mkdir(parents=True, exist_ok=True)
    cases = json.loads(Path(__file__).with_name("cases.json").read_text())
    result = {
        "data_source": "synthetic; not human/microphone/clinical validation",
        "platform": platform.platform(),
        "processor": platform.machine(),
        "model": args.model.name,
        "model_sha1": hashlib.file_digest(args.model.open("rb"), "sha1").hexdigest(),
        "language": "ko",
        "threads": 4,
        "timing_scope": "one CLI process per clip, including model loading and transcription; excludes speech duration, recording, upload, editing, AI draft and final save",
        "prompt": None,
        "semantic_assessment": "pending manual review",
        "cases": [],
    }
    for case in cases:
        stem = args.output / case["id"]
        wav = stem.with_suffix(".wav")
        if case["voice"]:
            aiff = stem.with_suffix(".aiff")
            run(["say", "-v", case["voice"], "-r", "170", "-o", str(aiff), case["spoken_text"]])
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(aiff), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)])
        else:
            with wave.open(str(wav), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(16000)
                audio.writeframes(b"\0\0" * 16000 * 5)
        with wave.open(str(wav), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        if case["voice"] and duration < .2:
            raise RuntimeError(f"{case['id']}: system speech synthesis produced empty audio; no transcription score is valid. Check access to the macOS speech service.")
        command = [str(args.whisper_cli), "-m", str(args.model), "-l", "ko", "-t", "4", "-ng", "-nt", "-otxt", "-oj", "-of", str(stem), "-f", str(wav)]
        started = time.perf_counter()
        try:
            process = subprocess.run(command, capture_output=True, text=True, timeout=180)
            elapsed = time.perf_counter() - started
            stem.with_suffix(".log").write_text(process.stderr)
            transcript = stem.with_suffix(".txt").read_text().strip() if process.returncode == 0 else None
            row = {**case, "audio_seconds": round(duration, 3), "wall_seconds": round(elapsed, 3), "exit_code": process.returncode, "transcript": transcript}
        except subprocess.TimeoutExpired:
            row = {**case, "audio_seconds": round(duration, 3), "wall_seconds": round(time.perf_counter() - started, 3), "exit_code": None, "transcript": None, "error": "timeout"}
        result["cases"].append(row)
        (args.output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(row, ensure_ascii=False), flush=True)
    if any(row.get("exit_code") != 0 for row in result["cases"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
