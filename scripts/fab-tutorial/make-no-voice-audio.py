"""Original instrumental and game effects only. Never loads voice recordings."""
import hashlib,json,math,wave
import numpy as np
from story import OLD
from revision_plan import SCENES_V2,REVISION,DURATION,write_plan

write_plan()
rate=48000
length=round(rate*DURATION)
mix=np.zeros((length,2),dtype=np.float32)
rng=np.random.default_rng(20261112)
cues=[]

def add(samples,at,gain=1,pan=0):
    start=round(at*rate)
    end=min(length,start+len(samples))
    angle=(pan+1)*math.pi/4
    if end>start:
        mix[start:end,0]+=samples[:end-start]*gain*math.cos(angle)
        mix[start:end,1]+=samples[:end-start]*gain*math.sin(angle)

def effect(kind,at,gain):
    add(np.fromfile(OLD/(kind+'.f32'),dtype=np.float32),at,gain)
    cues.append(dict(kind=kind,at=round(at,4),gain=gain))

# Keep the existing original 150 BPM instrumental without any voice layer.
beat=.4
for n in range(math.ceil(DURATION/beat)):
    t=np.arange(round(.25*rate))/rate
    root=[38,34,41,36][(n//8)%4]
    add(np.sin(2*np.pi*(48*t+52*.02*(1-np.exp(-t/.02))))*np.exp(-22*t),n*beat,.11)
    add(np.sin(2*np.pi*440*2**((root-69)/12)*t)*np.exp(-12*t),n*beat,.07,-.2)
    if n%2:
        add(rng.normal(0,.4,len(t))*np.exp(-42*t),n*beat,.04,.2)
    for k in range(2):
        note=[74,77,81,77][(n+k)%4]
        add(np.sin(2*np.pi*440*2**((note-69)/12)*t)*np.exp(-20*t),n*beat+k*.2,.035,.45 if k else -.45)

hit=json.loads((REVISION/'hit/verification.json').read_text(encoding='utf-8'))
for scene in SCENES_V2:
    start=scene['start']
    t=np.arange(round(.1*rate))/rate
    add(np.sin(2*np.pi*1450*t)*np.exp(-65*t),start+.35,.07)
    if scene['id'] in ('emo','bay'):
        effect('explosion',start+(2.1 if scene['id']=='emo' else 1.3),.20)
    if scene['id']=='throw':
        effect('throw',start+hit['throwAt'],.22)
        effect('shatter',start+hit['impact']['at'],.24)
    if scene['id']=='clean':
        effect('sweep',start+1,.15)
    if scene['id'] in ('repair','gold','google'):
        effect('chip',start+scene['duration']-.45,.10)

mix*=np.clip((DURATION-np.arange(length)/rate)/.35,0,1)[:,None]
peak=float(np.max(np.abs(mix)))
mix*=.87/max(.87,peak)
target=REVISION/'tutorial-no-voice.wav'
with wave.open(str(target),'wb') as output:
    output.setparams((2,2,rate,0,'NONE','not compressed'))
    output.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
with wave.open(str(target)) as output:
    assert output.getnframes()==length and output.getnchannels()==2 and output.getframerate()==rate
assert np.isfinite(mix).all() and np.max(np.abs(mix))<1
(REVISION/'audio-report.json').write_text(json.dumps(dict(duration=DURATION,rate=rate,channels=2,narration=False,voiceFilesRead=0,originalMusicBpm=150,peakDbFS=20*math.log10(float(np.max(np.abs(mix)))),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),cues=cues),ensure_ascii=False,indent=2),encoding='utf-8')

def stamp(t):
    ms=round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

(REVISION/'captions-draft.ko.srt').write_text('\n\n'.join(
    f'{i+1}\n{stamp(s["start"])} --> {stamp(s["start"]+s["duration"])}\n{s["title"]}\n{s["detail"]}'
    for i,s in enumerate(SCENES_V2))+'\n',encoding='utf-8')
print(f'NO_VOICE_AUDIO_READY: {DURATION}s, 0 voice files, peak {20*math.log10(float(np.max(np.abs(mix)))):.2f} dBFS')
