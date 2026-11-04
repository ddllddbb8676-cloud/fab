"""Render a fresh, sample-free digital piano performance of a public-domain score."""
from pathlib import Path
import sys, json, math, wave, hashlib, subprocess, collections
import numpy as np
from scipy.signal import butter, sosfilt
import imageio_ffmpeg

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'outputs' / 'entertainer-audio-20261104'
ROOT.mkdir(parents=True, exist_ok=True)
SOURCE = PROJECT / 'audio' / 'entertainer' / 'source'
sys.path.insert(0, str(ROOT / 'python-lib'))
import mido

SR = 44100
BPM = 100
INTRO_PAD = 0.08
OUT = ROOT / 'audio'
OUT.mkdir(exist_ok=True)
score = mido.MidiFile(SOURCE / 'entertainer.mid')
notes = []
for track_index, track in enumerate(score.tracks):
    ticks = 0
    opened = collections.defaultdict(list)
    for event in track:
        ticks += event.time
        if event.type == 'note_on' and event.velocity:
            opened[(event.channel, event.note)].append((ticks, event.velocity))
        elif event.type == 'note_off' or event.type == 'note_on' and not event.velocity:
            key = (event.channel, event.note)
            if not opened[key]:
                continue
            begin, velocity = opened[key].pop(0)
            notes.append(dict(beat=begin/score.ticks_per_beat,
                              beats=(ticks-begin)/score.ticks_per_beat,
                              pitch=event.note, track=track_index, velocity=velocity))
    assert not any(opened.values()), 'All notes must have a matching release'
notes.sort(key=lambda n: (n['beat'], n['track'], n['pitch']))
assert len(notes) == 2621

# Gentle phrasing and a held final cadence; keep the syncopated score intact.
last_beat = max(n['beat'] + n['beats'] for n in notes)
def seconds(beat):
    straight = beat * 60 / BPM
    phrase = .022 * math.sin(beat * math.pi / 16)
    ending = max(0, beat - (last_beat - 4))
    return INTRO_PAD + straight + phrase + .025 * ending * ending

duration = seconds(last_beat) + 1.7
audio = np.zeros((math.ceil(duration * SR), 2), dtype=np.float64)
rng = np.random.default_rng(20261104)
samples = {}

def piano_sample(pitch):
    if pitch in samples:
        return samples[pitch]
    frequency = 440 * 2 ** ((pitch - 69) / 12)
    t = np.arange(int(SR * 4), dtype=np.float64) / SR
    signal = np.zeros_like(t)
    # Inharmonic, slightly detuned strings with frequency-dependent decay.
    stiffness = .000055 * (frequency / 440) ** .72
    decay = 1.9 * (220 / frequency) ** .22
    amplitudes = [1, .64, .32, .19, .12, .085, .062, .044, .032, .024, .018, .013]
    for harmonic, amplitude in enumerate(amplitudes, 1):
        partial = frequency * harmonic * math.sqrt(1 + stiffness * harmonic ** 2)
        if partial > SR * .44:
            continue
        tau = decay / (1 + .17 * (harmonic - 1) ** 1.22)
        envelope = np.exp(-t / tau) * (1 - np.exp(-t / (.0028 + harmonic * .0001)))
        cents = .65 + (pitch - 29) * .012
        strings = np.sin(2 * np.pi * partial * t) * .56
        strings += np.sin(2 * np.pi * partial * 2 ** (cents / 1200) * t + .025) * .23
        strings += np.sin(2 * np.pi * partial * 2 ** (-cents / 1200) * t - .025) * .21
        signal += amplitude * envelope * strings
    hammer = rng.standard_normal(len(t))
    hammer = sosfilt(butter(2, [1000, 6000], btype='bandpass', fs=SR, output='sos'), hammer)
    signal += hammer * .018 * np.exp(-t / .009) * (1 - np.exp(-t / .0007))
    signal /= max(np.max(np.abs(signal)), 1e-9)
    samples[pitch] = signal.astype(np.float32)
    return samples[pitch]

high_by_onset = {}
for n in notes:
    if n['track'] == 1:
        high_by_onset[n['beat']] = max(n['pitch'], high_by_onset.get(n['beat'], 0))

for index, note in enumerate(notes):
    start = seconds(note['beat'])
    end = seconds(note['beat'] + note['beats'])
    # Subtle timing/velocity variation; no source recording or instrument sample.
    start += rng.uniform(-.0025, .0025)
    held = max(.035, end - start)
    release = .13 + max(0, 60 - note['pitch']) * .0025
    count = min(len(piano_sample(note['pitch'])), int((held + release * 6) * SR))
    sound = piano_sample(note['pitch'])[:count].astype(np.float64)
    t = np.arange(count) / SR
    sound *= np.exp(-np.maximum(0, t - held * .96) / release)
    sound[-min(220, count):] *= np.linspace(1, 0, min(220, count))
    melody = note['track'] == 1 and note['pitch'] == high_by_onset.get(note['beat'])
    gain = .39 if note['track'] == 2 else .48
    if melody:
        gain *= 1.12
    if note['track'] == 2 and note['pitch'] < 48:
        gain *= .84
    gain *= 1 + .045 * math.cos(note['beat'] * math.pi) + rng.uniform(-.027, .027)
    pan = np.clip((note['pitch'] - 62) / 130, -.24, .24)
    left = math.sqrt((1 - pan) / 2)
    right = math.sqrt((1 + pan) / 2)
    position = round(start * SR)
    count = min(count, len(audio) - position)
    audio[position:position+count, 0] += sound[:count] * gain * left
    audio[position:position+count, 1] += sound[:count] * gain * right
    if index and index % 600 == 0:
        print(f'Rendered {index}/{len(notes)} notes', flush=True)

# Small room reflections keep the instrument natural without hiding game SFX.
dry = audio.copy()
for channel, taps in enumerate([[(.013,.065),(.031,.041),(.059,.026),(.101,.014)],
                                [(.019,.065),(.037,.041),(.071,.026),(.113,.014)]]):
    for delay, level in taps:
        offset = round(delay * SR)
        audio[offset:, channel] += dry[:-offset, 1-channel] * level
audio = sosfilt(butter(2, 48, btype='highpass', fs=SR, output='sos'), audio, axis=0)
audio = sosfilt(butter(2, 8500, btype='lowpass', fs=SR, output='sos'), audio, axis=0)
audio *= .82 / np.max(np.abs(audio))
audio[:220] *= np.linspace(0, 1, 220)[:, None]
fade = int(.3 * SR)
audio[-fade:] *= np.linspace(1, 0, fade)[:, None]
raw = OUT / 'render-raw.wav'
with wave.open(str(raw), 'wb') as target:
    target.setnchannels(2); target.setsampwidth(2); target.setframerate(SR)
    target.writeframes(np.clip(audio * 32767, -32768, 32767).astype('<i2').tobytes())

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
measure = subprocess.run([ffmpeg, '-hide_banner', '-nostats', '-i', str(raw), '-af',
    'loudnorm=I=-19:TP=-2:LRA=8:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
stats = json.JSONDecoder().raw_decode(measure.stderr[measure.stderr.rfind('{'):])[0]
normalizer = (f"loudnorm=I=-19:TP=-2:LRA=8:measured_I={stats['input_i']}:"
              f"measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
              f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true")
master = OUT / 'fab-entertainer-piano-master.wav'
metadata = ['-metadata','title=The Entertainer - FAB Piano', '-metadata','artist=SEMITOON',
            '-metadata','composer=Scott Joplin', '-metadata','comment=Fresh sample-free synthesis from the public-domain Mutopia score, ID 263.']
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(raw),'-af',normalizer,
                '-ar',str(SR),'-c:a','pcm_s24le',*metadata,str(master)],check=True)
for filename, options in [
    ('fab-entertainer-piano.mp3',['-c:a','libmp3lame','-b:a','128k']),
    ('fab-entertainer-piano-game.mp3',['-c:a','libmp3lame','-b:a','96k']),
    ('fab-entertainer-piano-game.ogg',['-c:a','libvorbis','-q:a','3']),
    ('fab-entertainer-preview.mp3',['-t','30','-af','afade=t=out:st=28:d=2','-c:a','libmp3lame','-b:a','96k'])]:
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(master),*options,*metadata,str(OUT/filename)],check=True)

manifest = {'title':'The Entertainer - FAB Piano','composer':'Scott Joplin','tempoBpm':BPM,
            'durationSeconds':round(duration,3),'sampleRate':SR,'channels':2,'scoreNotes':len(notes),
            'recording':'New deterministic digital-piano synthesis; no third-party recording or instrument samples',
            'score':'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263',
            'scoreLicense':'Public Domain','targetLufs':-19,'targetTruePeakDb':-2,
            'sourceMeasurement':stats,'files':[]}
for path in OUT.glob('fab-*'):
    manifest['files'].append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in manifest.items() if k not in ['sourceMeasurement','files']}),flush=True)
print(json.dumps(manifest['files']),flush=True)
