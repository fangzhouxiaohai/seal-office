"""Render the Seal Office 2.1.2 36-second landscape feature promo.

Frames come from the deterministic HTML stage; narration and timing come from
work-2.1.2-short/voice.json (same Xiaoxiao voice parameters as the supplied sample).
"""
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "release/promo/work-2.1.2-short"
OUT = ROOT / "release/promo"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
DURATION = 36.0
FPS = 30
FRAMES = WORK / "frames"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
NAME = f"seal-office-{VERSION}-pc-feature-1080p"
CUES = [
    (0.30, 6.80, "海豹办公，把文字、表格、演示和常用工具，放进同一个工作区。"),
    (6.95, 11.73, "最近文件集中查看，打开的多份文档随时切换。"),
    (11.88, 18.00, "文字排版、表格公式、演示模板，都保留可编辑的内容和格式。"),
    (18.15, 22.00, "脑图和流程图分别管理项目；"),
    (22.05, 26.43, "四种海豹专属格式，在电脑、网页和移动端统一识别。"),
    (26.58, 31.60, "登录已验证的手机号账号，就能安全使用生成式 AI。"),
    (31.75, 35.42, "访问网页版，或下载适合你的版本。"),
]


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:])
    return result


def clock(seconds):
    ms = round(seconds * 1000)
    return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"


def write_srt():
    lines = []
    for index, (start, end, text) in enumerate(CUES, 1):
        lines.append(f"{index}\n{clock(start)} --> {clock(end)}\n{text}\n")
    (OUT / f"{NAME}.srt").write_text("\n".join(lines), encoding="utf-8")


def render_frames():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--force-device-scale-factor=1", "--hide-scrollbars"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto((WORK / "stage.html").as_uri(), wait_until="load")
        page.wait_for_timeout(1000)
        count = round(DURATION * FPS)
        for index in range(count):
            page.evaluate("t => window.renderAt(t)", index / FPS)
            page.screenshot(path=str(FRAMES / f"f{index:05d}.png"))
            if index % 90 == 0:
                print(json.dumps({"frame": index, "of": count}), flush=True)
        if errors:
            raise RuntimeError("Stage errors: " + " | ".join(errors[:5]))
        # Clean cover and contact sheet, without burned-in subtitles.
        page.evaluate("t => window.renderAt(t)", 1.6)
        page.evaluate("document.getElementById('subtitle').style.display='none'")
        page.screenshot(path=str(WORK / "cover-raw.png"))
        browser.close()
    print(json.dumps({"frames": count, "cover": "cover-raw.png"}), flush=True)


def encode():
    video = OUT / f"{NAME}.mp4"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
         "-framerate", str(FPS), "-i", str(FRAMES / "f%05d.png"),
         "-i", str(WORK / "narration-final.wav"),
         "-t", str(DURATION), "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
         "-shortest", "-movflags", "+faststart", str(video)])
    return video


def make_cover():
    raw = cv2.imdecode(__import__("numpy").fromfile(str(WORK / "cover-raw.png"), dtype="uint8"), cv2.IMREAD_COLOR)
    cover = OUT / f"{NAME}-cover.jpg"
    cv2.imwrite(str(cover), raw, [int(cv2.IMWRITE_JPEG_QUALITY), 94])
    return cover


def make_contact(video):
    times = [1.2, 3.6, 7.8, 10.5, 12.9, 15.2, 17.2, 19.4, 23.6, 25.4, 28.8, 33.4]
    capture = cv2.VideoCapture(str(video))
    thumbs = []
    for t in times:
        capture.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = capture.read()
        if not ok:
            raise RuntimeError(f"Cannot read contact frame at {t}")
        thumbs.append(cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA))
    capture.release()
    sheet = __import__("numpy").zeros((270 * 3, 480 * 4, 3), dtype="uint8")
    for index, thumb in enumerate(thumbs):
        sheet[(index // 4) * 270:(index // 4 + 1) * 270, (index % 4) * 480:(index % 4 + 1) * 480] = thumb
    contact = OUT / f"{NAME}-contact.jpg"
    cv2.imwrite(str(contact), sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return contact


def measure_loudness(path):
    result = run([FFMPEG, "-hide_banner", "-i", str(path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"])
    level = json.loads(re.search(r"\{\s*\"input_i\"[\s\S]*?\}", result.stderr)[0])
    return float(level["input_i"]), float(level["input_tp"])


def verify(video, cover, contact):
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError("Video did not open")
    width = round(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    count = round(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    decoded = 0
    while True:
        ok, _ = capture.read()
        if not ok:
            break
        decoded += 1
    capture.release()
    if (width, height) != (1920, 1080):
        raise AssertionError(f"Unexpected dimensions {width}x{height}")
    if abs(fps - FPS) > 0.01:
        raise AssertionError(f"Unexpected fps {fps}")
    if abs(count / fps - DURATION) > 0.1 or decoded != count:
        raise AssertionError(f"Unexpected frame count {decoded}/{count}")

    run([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(video), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"])
    probe = run([FFMPEG, "-hide_banner", "-i", str(video), "-f", "null", "-"])
    if "Audio: aac" not in probe.stderr or "48000 Hz, stereo" not in probe.stderr:
        raise AssertionError("Audio stream is not 48 kHz stereo AAC")
    measured = run([FFMPEG, "-hide_banner", "-i", str(video), "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"])
    level = json.loads(re.search(r"\{\s*\"input_i\"[\s\S]*?\}", measured.stderr)[0])
    integrated, peak = float(level["input_i"]), float(level["input_tp"])
    if not (-17.5 <= integrated <= -14.5) or peak > -0.5:
        raise AssertionError(f"Loudness out of range: {integrated} / {peak}")

    capture = cv2.VideoCapture(str(video))
    for boundary in (14.3, 16.3, 18.1, 22.1, 26.0):
        capture.set(cv2.CAP_PROP_POS_MSEC, boundary * 1000)
        ok, frame = capture.read()
        if not ok:
            raise AssertionError(f"Cannot read boundary frame at {boundary}")
        mean = float(frame[:700].mean())
        if mean < 30:
            raise AssertionError(f"Scene boundary {boundary} is too dark ({mean:.1f})")
    capture.release()

    capture = cv2.VideoCapture(str(video))
    capture.set(cv2.CAP_PROP_POS_MSEC, 34.0 * 1000)
    ok, last = capture.read()
    capture.release()
    if not ok:
        raise AssertionError("Cannot read final frame")
    decoded_qr, _, _ = cv2.QRCodeDetector().detectAndDecode(last[300:740, 1340:1800])
    if decoded_qr != "https://seal.xingmasoft.com/office/":
        raise AssertionError(f"QR decode failed: {decoded_qr!r}")

    srt = (OUT / f"{NAME}.srt").read_text(encoding="utf-8")
    def stamp(value):
        h, m, rest = value.split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000
    pairs = []
    for block in srt.strip().split("\n\n"):
        times = re.findall(r"\d{2}:\d{2}:\d{2},\d{3}", block)
        if len(times) != 2:
            raise AssertionError("Invalid SRT block")
        pairs.append((stamp(times[0]), stamp(times[1])))
    if len(pairs) != len(CUES) or any(a >= b for a, b in pairs):
        raise AssertionError("Invalid SRT timing")
    if any(b > DURATION for _, b in pairs):
        raise AssertionError("SRT exceeds video duration")

    return {
        "width": width, "height": height, "fps": fps, "frames": count,
        "durationSeconds": round(count / fps, 3),
        "videoAndAudioFullyDecoded": True,
        "audio": "AAC 48 kHz stereo 192 kbps",
        "integratedLufs": integrated, "truePeakDb": peak,
        "qrUrl": decoded_qr, "subtitles": len(CUES),
        "cover": cover.name, "coverSha256": sha(cover),
        "contact": contact.name, "contactSha256": sha(contact),
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    write_srt()
    render_frames()
    video = encode()
    cover = make_cover()
    contact = make_contact(video)
    metrics = verify(video, cover, contact)
    voice = json.loads((WORK / "voice.json").read_text(encoding="utf-8"))
    mix_lufs, mix_tp = measure_loudness(WORK / "narration.wav")
    final_lufs, final_tp = measure_loudness(WORK / "narration-final.wav")
    capture = json.loads((WORK / "capture.json").read_text(encoding="utf-8"))
    report = {
        "passed": True,
        "version": VERSION,
        "video": video.name,
        "videoSha256": sha(video),
        "bytes": video.stat().st_size,
        "srt": f"{NAME}.srt",
        "srtSha256": sha(OUT / f"{NAME}.srt"),
        "script": [cue[2] for cue in CUES],
        "metrics": metrics,
        "voice": {
            "sourceSample": r"D:\yewu\女声配音试听.mp3",
            "sourceSampleSha256": sha(r"D:\yewu\女声配音试听.mp3"),
            "engine": "edge-tts",
            "name": voice["voice"]["name"],
            "rate": voice["voice"]["rate"],
            "pitch": voice["voice"]["pitch"],
            "note": "Same voice, rate and pitch as the supplied sample; the narration was re-recorded with a Seal Office 2.1.2 script and is not the sample's original audio.",
            "speechSeconds": round(sum(segment["seconds"] for segment in voice["segments"]), 3),
            "mixIntegratedLufs": mix_lufs,
            "mixTruePeakDb": mix_tp,
            "integratedLufs": final_lufs,
            "truePeakDb": final_tp,
            "sha256": sha(WORK / "narration-final.wav"),
        },
        "ui": {
            "build": capture["version"],
            "captureManifest": "release/promo/work-2.1.2-short/capture.json",
            "captureManifestSha256": sha(WORK / "capture.json"),
            "screens": [{**item, "sha256": item["sha256"]} for item in capture["captures"]],
            "source": "Production responsive PC Web build at 1920x1080 in an isolated Electron profile; demo documents generated by the capture script; no real account login, upload or model call.",
        },
        "stage": {"file": "release/promo/work-2.1.2-short/stage.html", "sha256": sha(WORK / "stage.html")},
        "disclosure": "Landscape feature promo for Seal Office 2.1.2. UI frames are real 1920x1080 screenshots of the production Web build. The supplied MP3 is a 聚百果ERP tutorial sample; with the user's confirmation, its voice (Xiaoxiao +5% +4Hz) was used to re-record a new Seal Office script. The delivered narration is therefore not the source MP3 audio.",
        "visualReview": "pending contact sheet inspection",
    }
    (OUT / f"{NAME}-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "video": video.name, "bytes": video.stat().st_size, "sha256": report["videoSha256"], "metrics": metrics}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
