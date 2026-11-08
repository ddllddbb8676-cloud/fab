"""Decode the deliverable and check dimensions, readable URL, audio and duration."""
import hashlib
import json
import math
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / 'outputs/fab-promo-2026-11-09'
VIDEO = ROOT / 'FAB-update-30s.mp4'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
QA = ROOT / 'qa'
QA.mkdir(exist_ok=True)

reader = imageio_ffmpeg.read_frames(str(VIDEO))
metadata = next(reader)
reader.close()
assert metadata['size'] == (1080, 1920), metadata
assert abs(metadata['fps'] - 30) < .01, metadata
assert abs(metadata['duration'] - 30) < .05, metadata

reference = np.asarray(Image.open(ROOT / 'titles/0000.png'))[112:204, 370:1010]
bright = (np.min(reference[:, :, :3], axis=2) > 245) & (reference[:, :, 3] > 250)
dark = (reference[:, :, 0] < 20) & (reference[:, :, 1] < 60) & (reference[:, :, 3] > 230)
command = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-i', str(VIDEO), '-an',
           '-vf', 'crop=640:92:370:112', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']
proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
frames, minimum_contrast = 0, 255
while True:
    data = proc.stdout.read(640 * 92 * 3)
    if not data:
        break
    assert len(data) == 640 * 92 * 3
    rgb = np.frombuffer(data, dtype=np.uint8).reshape((92, 640, 3))
    luma = rgb.mean(axis=2)
    contrast = float(luma[bright].mean() - luma[dark].mean())
    minimum_contrast = min(minimum_contrast, contrast)
    assert contrast > 120, (frames, contrast)
    frames += 1
assert proc.wait() == 0, proc.stderr.read().decode(errors='replace')
assert frames == 900, frames

audio = subprocess.run([FFMPEG, '-v', 'error', '-i', str(VIDEO), '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', 'pipe:1'], capture_output=True, check=True).stdout
pcm = np.frombuffer(audio, dtype='<f4').reshape((-1, 2))
peak = float(np.max(np.abs(pcm)))
assert .05 < peak < 1, peak
assert abs(len(pcm) / 48000 - 30) < .1
assert VIDEO.stat().st_size < 25 * 1024 * 1024

times = [.15, .9, 2.3, 4.0, 5.2, 6.7, 8.6, 10.3, 12.0, 13.7,
         15.0, 16.2, 18.1, 19.4, 21.2, 23.0, 25.2, 26.7, 28.2, 29.6]
contact = Image.new('RGB', (270 * 5, 510 * 4), '#153a43')
draw = ImageDraw.Draw(contact)
font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 17)
for i, t in enumerate(times):
    path = QA / f'frame-{t:04.1f}.jpg'
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-ss', str(t), '-i', str(VIDEO), '-frames:v', '1', '-q:v', '2', str(path)], check=True)
    x, y = i % 5 * 270, i // 5 * 510
    contact.paste(Image.open(path).resize((270, 480)), (x, y))
    draw.text((x + 10, y + 482), f'{t:.1f}s', font=font, fill='white')
contact.save(QA / 'contact-sheet.jpg', quality=95)
report = {'width':1080, 'height':1920, 'fps':30, 'duration':metadata['duration'],
          'decodedFrames':frames, 'url':'fab.semitoon.com', 'urlFramesChecked':frames,
          'minimumUrlContrast':round(minimum_contrast, 2),
          'audioPeakDbFS':round(20 * math.log10(peak), 2), 'stereo':True,
          'fileBytes':VIDEO.stat().st_size, 'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),
          'visualReview':'Pending final frame review',
          'footage':'Staged using current game geometry and animations',
          'sourceRevision':json.loads((ROOT / 'timeline.json').read_text())['sourceRevision']}
(QA / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report), flush=True)
