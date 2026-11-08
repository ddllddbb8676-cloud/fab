"""Cut the current FAB gameplay scenes into a 30-second portrait advertisement."""
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / 'outputs/fab-promo-2026-11-09'
TIMELINE = json.loads((ROOT / 'timeline.json').read_text(encoding='utf-8'))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WIDTH, HEIGHT, FPS = 1080, 1920, 30
FONT = 'C:/Windows/Fonts/malgunbd.ttf'
NAVY = '#123d46'
LIME = '#dfff68'
WHITE = '#ffffff'

# All feature names and rewards match the current game. Each card lasts long
# enough to read once, with the invitation held for the last 4.4 seconds.
CAPTIONS = [
    (0, 1.6, '팹뿌 업데이트!', '할 게 더 많아졌다', 'intro'),
    (1.6, 4.6, '60초 안에 20대!', '다 같이 베이 뿌시기', 'bay'),
    (4.6, 5.6, '성공하면 +200칩', '한 베이 완파!', 'win'),
    (5.6, 9.2, '흑백 풉 쟁탈전', '우리 색 원으로 던져!', 'contest'),
    (9.2, 11.6, '상대 풉도 뺏어!', '많이 모은 팀이 승리', 'steal'),
    (11.6, 14.8, '황금 풉을 찾아라', '찾았으면 들고 달려!', 'gold'),
    (14.8, 16.8, '스토커 IN → +200칩', '황금 풉 반납 성공!', 'in'),
    (16.8, 18.8, '풉 나옵니다~', '스토커 OUT', 'out'),
    (18.8, 20.4, '풉도 싣고', '카트 한 대에 풉 4개', 'cargo'),
    (20.4, 22.0, '친구도 태우고!', '아래 한 명 · 위에 한 명', 'board'),
    (22.0, 25.6, '같이 타자 ㄱㄱ!', '친구가 끄는 카트에 탑승', 'ride'),
    (25.6, 30.0, '세미툰 | 팹뿌', '하고 싶었던 거 다 하자', 'end'),
]


def font(size):
    return ImageFont.truetype(FONT, size)


def fit(text, size, width=936):
    while font(size).getlength(text) > width:
        size -= 2
    return font(size)


def centered(draw, text, y, size, fill=WHITE, stroke=0):
    draw.text((WIDTH / 2, y), text, font=fit(text, size), fill=fill,
              anchor='mt', stroke_width=stroke, stroke_fill=NAVY)


def overlay(t):
    img = Image.new('RGBA', (WIDTH, HEIGHT))
    d = ImageDraw.Draw(img)
    # Keep the site visible in every exported frame, inside Instagram safe areas.
    d.rounded_rectangle((60, 112, 1020, 204), 30, fill=(11, 47, 56, 239))
    d.text((92, 158), '팹뿌', font=font(40), fill=LIME, anchor='lm')
    d.text((978, 158), 'fab.semitoon.com', font=font(40), fill=WHITE, anchor='rm')
    start, end, title, line, kind = next(c for c in CAPTIONS if c[0] <= t < c[1])
    local = t - start
    settle = 1 - math.exp(-local * 24)
    text_y = 1360 + round(30 * (1 - settle))
    pixels = np.zeros((640, WIDTH, 4), dtype=np.uint8)
    pixels[:, :, :3] = [6, 30, 38]
    pixels[:, :, 3] = np.round(np.linspace(0, 217, 640))[:, None].astype(np.uint8)
    img.alpha_composite(Image.fromarray(pixels), (0, 1280))
    d = ImageDraw.Draw(img)
    if kind == 'end':
        centered(d, title, 292, 110, WHITE, 4)
        centered(d, line, 1370, 53)
        d.rounded_rectangle((65, 1485, 1015, 1613), 29, fill=LIME)
        centered(d, 'fab.semitoon.com', 1514, 75, NAVY)
        centered(d, '누구나 바로 플레이', 1660, 63, WHITE)
        centered(d, 'PC · 모바일', 1755, 36, '#bcd8d8')
    else:
        centered(d, title, text_y, 96 if kind != 'intro' else 114, LIME if kind in ('win', 'in', 'gold') else WHITE, 5)
        centered(d, line, text_y + 147, 49, WHITE, 2)
        if kind == 'contest':
            d.rounded_rectangle((266, 270, 814, 352), 20, fill=(13, 38, 48, 226))
            center_score = '흑 2     :     백 ' + ('4' if 1.6 < local < 2.8 else '3')
            centered(d, center_score, 286, 48, WHITE)
        if kind == 'steal':
            d.rounded_rectangle((266, 270, 814, 352), 20, fill=(13, 38, 48, 226))
            centered(d, '흑팀, 반격 중!', 286, 44, LIME)
        if kind == 'bay':
            centered(d, '베이 뿌시기', 294, 55, WHITE, 4)
    # Brief bright wipe at the scene cuts emphasizes the beat without a strobe.
    if 0 < local < .08 and start > 0:
        wipe = Image.new('RGBA', (WIDTH, HEIGHT), (205, 255, 223, int(60 * (1 - local / .08))))
        img = Image.alpha_composite(img, wipe)
        # Repaint the URL so it stays legible through transitions.
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((60, 112, 1020, 204), 30, fill=(11, 47, 56, 239))
        d.text((92, 158), '팹뿌', font=font(40), fill=LIME, anchor='lm')
        d.text((978, 158), 'fab.semitoon.com', font=font(40), fill=WHITE, anchor='rm')
    return img


def make_overlays():
    target = ROOT / 'titles'
    target.mkdir(exist_ok=True)
    for f in range(900):
        overlay(f / FPS).save(target / f'{f:04d}.png', compress_level=2)
    (ROOT / 'captions.json').write_text(json.dumps(CAPTIONS, ensure_ascii=False, indent=2), encoding='utf-8')


def make_audio():
    rate = 48000
    mix = np.zeros((30 * rate, 2), dtype=np.float32)
    rng = np.random.default_rng(20261109)

    def add(samples, start, volume=1, pan=0):
        begin = round(start * rate)
        end = min(len(mix), begin + len(samples))
        if begin < 0 or begin >= end:
            return
        angle = (pan + 1) * math.pi / 4
        mix[begin:end, 0] += samples[:end-begin] * volume * math.cos(angle)
        mix[begin:end, 1] += samples[:end-begin] * volume * math.sin(angle)

    def tone(midi, duration=.26, bass=False):
        t = np.arange(round(duration * rate)) / rate
        hz = 440 * 2 ** ((midi - 69) / 12)
        signal = np.sin(2*np.pi*hz*t) + .27*np.sin(2*np.pi*hz*2*t) + .12*np.sin(2*np.pi*hz*3*t)
        return signal * np.minimum(1, t/.004) * np.exp(-t * (9 if bass else 16))

    beat = .4  # Original 150 BPM instrumental, composed for this cut.
    chords = [(38, [74, 77, 81, 77]), (34, [70, 74, 77, 74]), (41, [72, 77, 81, 77]), (36, [72, 76, 79, 76])]
    for n in range(75):
        start = n * beat
        root, notes = chords[(n // 8) % len(chords)]
        t = np.arange(int(rate*.21)) / rate
        kick = np.sin(2*np.pi*(48*t + 55*.022*(1-np.exp(-t/.022)))) * np.exp(-t*21)
        add(kick, start, .30)
        add(tone(root, .30, True), start + .02, .16, -.13)
        if n % 2:
            noise = rng.normal(0, .6, len(t))
            snap = np.diff(noise, prepend=0) * np.exp(-t*38) + .2*np.sin(2*np.pi*185*t)*np.exp(-t*30)
            add(snap, start, .13, .05)
        for half in range(2):
            ticks = np.arange(int(.06*rate))/rate
            hats = np.diff(rng.normal(0,.4,len(ticks)),prepend=0)*np.exp(-ticks*90)
            add(hats,start+half*.2,.055,(-.5 if half else .5))
            note = notes[(n+half)%4] + (12 if n%8>=6 else 0)
            add(tone(note), start+half*.2, .092 if half==0 else .066, .4 if half else -.4)
    # Emphasize scene cuts with short stereo sweeps, plus the game's own impacts.
    for clip in TIMELINE['clips'][1:]:
        length = .19
        t = np.arange(int(rate*length))/rate
        whoosh = rng.normal(0,.35,len(t))*np.sin(np.pi*t/length)**2
        add(whoosh, max(0,clip['start']-.13), .15, -.35)
    for cue in TIMELINE['cues']:
        source = np.fromfile(ROOT/(cue['kind']+'.f32'),dtype=np.float32)
        add(source,cue['t'],cue.get('gain',.5),cue.get('pan',0))
    # The stocker's familiar short piano cue is the project's own rendition.
    piano = ROOT.parents[1] / 'audio/entertainer/fab-entertainer-stocker.mp3'
    if piano.exists():
        raw = subprocess.run([FFMPEG,'-v','error','-i',str(piano),'-t','1.8','-ac','1','-ar',str(rate),'-f','f32le','pipe:1'],capture_output=True,check=True).stdout
        start = int(16.8*rate); stop = int(18.6*rate)
        mix[start:stop] *= .4
        add(np.frombuffer(raw,dtype='<f4'),16.8,.8)
    env=np.minimum(1,np.arange(len(mix))/rate/.045)*np.minimum(1,(30-np.arange(len(mix))/rate)/.4)
    mix*=env[:,None]
    peak=float(np.max(np.abs(mix)))
    mix *= .82/max(.82,peak)
    with wave.open(str(ROOT/'update-audio.wav'),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate)
        out.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
    (ROOT/'audio-report.json').write_text(json.dumps({'duration':30,'sampleRate':rate,'channels':2,'bpm':150,'peakDbFS':20*math.log10(float(np.max(np.abs(mix)))),'music':'New instrumental composed for this advertisement','effects':'Current FAB effects and the existing original stocker piano rendition'},indent=2),encoding='utf-8')


def compose():
    encoded=ROOT/'encoded';encoded.mkdir(exist_ok=True)
    for clip in TIMELINE['clips']:
        count=round(clip['duration']*FPS)
        source=ROOT/'frames'/clip['id']
        assert all((source/f'{f:04d}.png').exists() for f in range(count)),clip['id']
        target=encoded/(clip['id']+'.mp4')
        if target.exists():
            continue
        subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(source/'%04d.png'),'-frames:v',str(count),'-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p',str(target)],check=True)
    concat=encoded/'concat.txt'
    concat.write_text(''.join("file '"+str(encoded/(c['id']+'.mp4')).replace('\\','/')+"'\n" for c in TIMELINE['clips']),encoding='utf-8')
    base=encoded/'base.mp4'
    subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy',str(base)],check=True)
    command=[FFMPEG,'-hide_banner','-loglevel','warning','-y','-i',str(base),'-framerate','30','-i',str(ROOT/'titles/%04d.png'),'-i',str(ROOT/'update-audio.wav')]
    filt='[0:v]scale=1080:1920:flags=lanczos,eq=contrast=1.04:saturation=1.18[base];[base][1:v]overlay=0:0:shortest=1[v];[2:a]loudnorm=I=-14:TP=-1.4:LRA=8[a]'
    command+=['-filter_complex',filt,'-map','[v]','-map','[a]','-t','30','-r','30','-c:v','libx264','-preset','medium','-crf','19','-maxrate','6M','-bufsize','12M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(ROOT/'FAB-update-30s.mp4')]
    subprocess.run(command,check=True)
    print('UPDATE_FILM_READY',flush=True)


if __name__=='__main__':
    if '--compose-only' not in sys.argv:
        make_overlays();make_audio()
    if '--assets-only' not in sys.argv:
        compose()
