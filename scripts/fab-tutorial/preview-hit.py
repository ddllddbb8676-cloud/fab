"""Review the new FOUP hit insert; this is not the completed UI tutorial."""
import hashlib,json,subprocess,wave
import imageio_ffmpeg
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from story import OLD
from revision_plan import REVISION

root=REVISION/'hit'
meta=json.loads((root/'verification.json').read_text(encoding='utf-8'))
frames=root/'frames/throw-hit'
assert len(list(frames.glob('*.png')))==180
rate=48000
samples=np.zeros(rate*6,dtype=np.float32)
for kind,at,gain in [('throw',meta['throwAt'],.36),('shatter',meta['impact']['at'],.40)]:
    effect=np.fromfile(OLD/(kind+'.f32'),dtype=np.float32)
    start=round(at*rate);end=min(len(samples),start+len(effect))
    samples[start:end]+=effect[:end-start]*gain
assert np.max(np.abs(samples))<1
with wave.open(str(root/'effects.wav'),'wb') as output:
    output.setparams((1,2,rate,0,'NONE','not compressed'))
    output.writeframes((samples*32767).astype('<i2').tobytes())

ff=imageio_ffmpeg.get_ffmpeg_exe()
target=REVISION/'FOUP-hit-scene-6s.mp4'
font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',45)
small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',27)
command=[ff,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','pipe:0','-i',str(root/'effects.wav'),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-t','6',str(target)]
with (root/'preview-encode.log').open('w',encoding='utf-8') as log:
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        for n in range(180):
            frame=Image.open(frames/f'{n:04}.png').convert('RGB')
            draw=ImageDraw.Draw(frame)
            caption='상대 쪽을 보고 던지기 ↗' if n<42 else '날아가는 풉도 명중!' if n<56 else '명중! 2초 헤롱헤롱' if n<116 else '걷거나 가만히 있는 상대에게'
            draw.text((540,150),caption,font=font,fill='#123d46',anchor='mm',stroke_width=4,stroke_fill='white')
            draw.text((540,1855),'추가 장면 시연 · 실제 UI 촬영 전',font=small,fill='#123d46',anchor='mm',stroke_width=2,stroke_fill='white')
            process.stdin.write(frame.tobytes())
    finally:
        process.stdin.close()
    assert process.wait()==0
stream=imageio_ffmpeg.read_frames(str(target),pix_fmt='rgb24',output_params=['-vf','scale=270:480'])
info=next(stream)
assert info['source_size']==(1080,1920) and abs(info['fps']-30)<.001 and abs(info['duration']-6)<.05
count=sum(1 for _ in stream)
assert count==180
(root/'preview-verification.json').write_text(json.dumps(dict(file=target.name,decodedFrames=count,duration=6,narration=False,nativeUiCaptured=False,completeTutorial=False,sha256=hashlib.sha256(target.read_bytes()).hexdigest()),indent=2),encoding='utf-8')
print('HIT_PREVIEW_READY',target)
