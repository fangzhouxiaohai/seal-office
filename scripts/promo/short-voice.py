"""Generate the Seal Office 2.1.2 short-promo narration with the supplied sample's voice.

The supplied 女声配音试听.mp3 is a 聚百果ERP tutorial sample. With the user's
confirmation, this script re-records a Seal Office script with the same Xiaoxiao
voice, rate and pitch; it does not reuse the sample's words or waveform.
"""
import asyncio
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "release/promo/work-2.1.2-short"
WORK.mkdir(parents=True, exist_ok=True)
VOICE = {"name": "zh-CN-XiaoxiaoNeural", "rate": "+5%", "pitch": "+4Hz"}
SEGMENTS = [
    ("intro", "海豹办公，把文字、表格、演示和常用工具，放进同一个工作区。"),
    ("home", "最近文件集中查看，打开的多份文档随时切换。"),
    ("edit", "文字排版、表格公式、演示模板，都保留可编辑的内容和格式。"),
    ("diagram", "脑图和流程图分别管理项目；四种海豹专属格式，在电脑、网页和移动端统一识别。"),
    ("ai", "登录已验证的手机号账号，就能安全使用生成式 AI。"),
    ("outro", "访问网页版，或下载适合你的版本。"),
]
LEAD, GAP, TAIL = 0.35, 0.25, 0.65
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def probe_duration(file):
    result = subprocess.run([FFMPEG, "-hide_banner", "-i", str(file), "-f", "null", "-"], capture_output=True, text=True)
    for line in result.stderr.splitlines():
        if "time=" in line:
            stamp = line.split("time=")[1].split()[0]
            h, m, s = stamp.split(":")
            return round(int(h) * 3600 + int(m) * 60 + float(s), 4)
    raise RuntimeError("duration not found")


def measure(file):
    result = subprocess.run([FFMPEG, "-hide_banner", "-i", str(file), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    level = json.loads(re.search(r"\{\s*\"input_i\"[\s\S]*?\}", result.stderr)[0])
    return float(level["input_i"]), float(level["input_tp"])


async def synth(key, text):
    mp3 = WORK / f"{key}.mp3"
    communicate = edge_tts.Communicate(text, VOICE["name"], rate=VOICE["rate"], pitch=VOICE["pitch"])
    with mp3.open("wb") as stream:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                stream.write(chunk["data"])
    wav = WORK / f"{key}.wav"
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)
    return {"id": key, "text": text, "file": wav.name, "seconds": probe_duration(wav)}


async def main():
    segments = []
    cursor = LEAD
    for key, text in SEGMENTS:
        item = await synth(key, text)
        item["start"] = round(cursor, 4)
        item["end"] = round(cursor + item["seconds"], 4)
        cursor = item["end"] + GAP
        segments.append(item)
        print(json.dumps({k: item[k] for k in ("id", "seconds", "start", "end")}, ensure_ascii=False), flush=True)
    total = round(cursor - GAP + TAIL, 4)

    inputs = []
    filters = []
    for index, item in enumerate(segments):
        inputs += ["-i", str(WORK / item["file"])]
        delay = round(item["start"] * 1000)
        filters.append(f"[{index}:a]adelay={delay}|{delay}[a{index}]")
    filters.append("".join(f"[a{i}]" for i in range(len(segments))) + f"amix=inputs={len(segments)}:normalize=0:duration=longest,apad=whole_dur={total},atrim=0:{total}[mix]")
    mixed = WORK / "narration-mixed.wav"
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters), "-map", "[mix]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(mixed)], check=True)

    raw = WORK / "narration.wav"
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mixed), "-af", f"volume=0dB,afade=t=in:st=0:d=0.12,afade=t=out:st={max(0,total-0.35):.3f}:d=0.35", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(raw)], check=True)
    final = WORK / "narration-final.wav"
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(final)], check=True)

    mix_lufs, mix_tp = measure(raw)
    final_lufs, final_tp = measure(final)
    payload = {
        "voice": VOICE,
        "speechSource": "Same voice, rate and pitch as the supplied 女声配音试听.mp3 (zh-CN-XiaoxiaoNeural, +5%, +4Hz); new Seal Office 2.1.2 script.",
        "lead": LEAD, "gap": GAP, "tail": TAIL,
        "total": total,
        "segments": segments,
        "mixIntegratedLufs": mix_lufs,
        "mixTruePeakDb": mix_tp,
        "integratedLufs": final_lufs,
        "truePeakDb": final_tp,
        "file": final.name,
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
    }
    (WORK / "voice.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in ("total", "integratedLufs", "truePeakDb", "sha256")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
