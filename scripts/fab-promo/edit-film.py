"""Compose the isolated FAB film with permanent URL, captions and game sounds."""
import json, math, wave, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]/'outputs/fab-promo-2026-11-02'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
TIMELINE=json.loads((ROOT/'timeline.json').read_text(encoding='utf-8'))
W,H=1080,1920
FONT='C:/Windows/Fonts/malgunbd.ttf'
OVER=ROOT/'overlays';OVER.mkdir(exist_ok=True)

CAPTIONS=[
 (0,1.25,'이거 눌러도 돼요?',''),(1.25,3.15,'아.',''),(3.15,4,'아.',''),
 (4,7,'다 같이 하면',''),(7,12,'사고도 단체전',''),
 (12,14,'협동 끝.',''),(14,18,'각자 살자',''),
 (18,22,'걸리면 수리','고치면 +3C'),
 (22,23.8,'조심히 내려놓을게요',''),(23.8,28,'와르르.','던지면 +1C'),
 (28,34,'갑자기 성실해짐','치우면 +2C'),
 (34,40,'출근길이 좀 특이함','OHT 탑승 10초마다 +1C'),
 (40,43.2,'열심히 번 칩으로',''),(43.2,48,'열심히 귀여워지는 중',''),
 (48,51,'잠깐 쉬고',''),(51,54,'또 같이 놀자',''),
 (54,58,'오늘도 평화로운 FAB','지금 놀러 오세요')
]

def text_center(draw,xy,text,size,fill,stroke=0,stroke_fill=None):
    font=ImageFont.truetype(FONT,size)
    draw.text(xy,text,font=font,anchor='mm',fill=fill,stroke_width=stroke,stroke_fill=stroke_fill)

def overlay_assets():
    watermark=Image.new('RGBA',(W,H));d=ImageDraw.Draw(watermark)
    d.rounded_rectangle((275,103,805,183),radius=34,fill=(20,57,65,236))
    text_center(d,(540,142),'< fab.semitoon.com >',37,'#ffffff')
    watermark.save(OVER/'watermark.png')
    for i,(start,end,title,sub) in enumerate(CAPTIONS):
        im=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im)
        font_size=64 if len(title)<15 else 56
        title_y=335 if 4<=start and end<=12 else 1538
        text_center(d,(540,title_y),title,font_size,'#163d46',5,'#ffffff')
        if sub:
            font=ImageFont.truetype(FONT,35);width=d.textbbox((0,0),sub,font=font)[2]+64
            d.rounded_rectangle((540-width/2,1600,540+width/2,1670),radius=28,fill=(245,251,250,235))
            text_center(d,(540,1633),sub,35,'#245862')
        if i==2:
            text_center(d,(750,1110),'+5C',62,'#d49113',5,'#ffffff')
        im.save(OVER/f'caption-{i:02}.png')
        im.alpha_composite(watermark)
        im.save(OVER/f'combined-{i:02}.png')
    sequence=[]
    for i,(start,end,_,_) in enumerate(CAPTIONS):
        sequence.extend(["file '"+str(OVER/f'combined-{i:02}.png').replace('\\','/')+"'",'duration '+str(end-start)])
    sequence.append("file '"+str(OVER/f'combined-{len(CAPTIONS)-1:02}.png').replace('\\','/')+"'")
    (OVER/'sequence.txt').write_text('\n'.join(sequence)+'\n',encoding='utf8')

def mix_audio():
    rate=48000;length=int(TIMELINE['duration']*rate)
    mix=np.zeros((length,2),np.float32);music=np.zeros_like(mix)
    def add(target,samples,start,gain=1,pan=0):
        begin=round(start*rate);end=min(length,begin+len(samples))
        if begin>=length or end<=begin:return
        p=(pan+1)*math.pi/4
        target[begin:end,0]+=samples[:end-begin]*(gain*math.cos(p))
        target[begin:end,1]+=samples[:end-begin]*(gain*math.sin(p))
    def mallet(midi,duration=.34):
        t=np.arange(round(rate*duration))/rate;hz=440*2**((midi-69)/12)
        return ((np.sin(2*np.pi*hz*t)*np.exp(-t*11)+.24*np.sin(2*np.pi*hz*3*t)*np.exp(-t*30))*np.minimum(1,t/.003)).astype(np.float32)
    rng=np.random.default_rng(20261102)
    # Original light comic cue; no third-party music or voice recording.
    chords=[(48,[72,76,79,76,74,76,79,76]),(45,[72,76,81,76,74,76,81,76]),(41,[69,72,77,72,69,72,77,79]),(43,[71,74,79,74,72,74,79,74])]
    for beat in range(112):
        start=2+beat*.5;root,notes=chords[(beat//4)%4]
        add(music,mallet(root,.4),start,.105,-.2)
        for half in range(2):
            when=start+half*.25+(0.025 if half else 0)
            note=notes[(beat%4)*2+half]
            add(music,mallet(note),when,.075 if half==0 else .055,math.sin(beat*.7)*.5)
        t=np.arange(round(rate*.16))/rate
        if beat%2==0:
            kick=np.sin(2*np.pi*(52*t+45*.025*(1-np.exp(-t/.025))))*np.exp(-t*28)
            add(music,kick,start,.12)
        else:
            click=rng.uniform(-1,1,len(t))*np.exp(-t*85)
            add(music,click,start,.055)
    env=np.minimum(1,np.arange(length)/rate/2)
    env*=np.minimum(1,np.maximum(0,(TIMELINE['duration']-np.arange(length)/rate)/.55))
    # A short comic silence lets the scattered wafers land.
    env[int(23.72*rate):int(24.55*rate)]*=.08
    mix+=music*env[:,None]
    for cue in TIMELINE['cues']:
        samples=np.fromfile(ROOT/(cue['kind']+'.f32'),dtype=np.float32)
        add(mix,samples,cue['t'],cue.get('gain',.6),cue.get('pan',0))
    add(mix,np.fromfile(ROOT/'chip.f32',dtype=np.float32),3.15,.6)
    peak=float(np.max(np.abs(mix)));mix*=.89/max(.89,peak)
    pcm=(np.clip(mix,-1,1)*32767).astype('<i2')
    with wave.open(str(ROOT/'film-audio.wav'),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes(pcm.tobytes())
    (ROOT/'audio-report.json').write_text(json.dumps({'rate':rate,'channels':2,'duration':len(mix)/rate,'unscaledPeak':peak,'peakDbFS':20*math.log10(float(np.max(np.abs(mix)))),'source':'Original game effects and newly synthesized music'},indent=2),encoding='utf8')

def compose():
    encoded=ROOT/'encoded';encoded.mkdir(exist_ok=True)
    for clip in TIMELINE['clips']:
        folder=ROOT/'frames'/clip['id'];frames=list(folder.glob('*.png'));expected=round(clip['duration']*TIMELINE['fps'])
        assert len(frames)==expected,(clip['id'],len(frames),expected)
        target=encoded/(clip['id']+'.mp4')
        if target.exists():continue
        subprocess.run([FFMPEG,'-hide_banner','-loglevel','warning','-y','-framerate',str(TIMELINE['fps']),'-i',str(folder/'%04d.png'),'-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
    concat=encoded/'concat.txt';concat.write_text(''.join("file '"+str(encoded/(c['id']+'.mp4')).replace('\\','/')+"'\n" for c in TIMELINE['clips']),encoding='utf8')
    base=encoded/'base.mp4'
    subprocess.run([FFMPEG,'-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy',str(base)],check=True)
    command=[FFMPEG,'-hide_banner','-loglevel','warning','-y','-i',str(base),'-i',str(ROOT/'film-audio.wav'),'-f','concat','-safe','0','-i',str(OVER/'sequence.txt')]
    filters=['[0:v]hqdn3d=2.0:1.8:4.0:3.6,eq=saturation=1.08[clean]','[2:v]fps=30[overlay]','[clean][overlay]overlay=0:0:eof_action=repeat[v]']
    filters.append('[1:a]loudnorm=I=-16:TP=-1.2:LRA=9,afade=t=out:st=57.65:d=0.35[a]')
    command+=['-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-t','58','-r','30','-c:v','libx264','-preset','medium','-crf','20','-maxrate','2800k','-bufsize','5600k','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(ROOT/'FAB-promo-58s-v1.mp4')]
    subprocess.run(command,check=True)

if __name__=='__main__':
    overlay_assets();mix_audio()
    if '--assets-only' not in sys.argv:compose()
    print('FILM_EDIT_READY',flush=True)
