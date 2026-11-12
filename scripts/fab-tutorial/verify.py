"""Decode the delivered file, check all frames/audio, and extract review frames."""
import hashlib,json,math,subprocess
from datetime import datetime,timezone
import imageio_ffmpeg
import numpy as np
from PIL import Image
from story import OUT,SCENES

FF=imageio_ffmpeg.get_ffmpeg_exe()
TARGET=OUT/'FAB-controls-90s.mp4'
QA=OUT/'qa/final';QA.mkdir(exist_ok=True,parents=True)
samples={}
for s in SCENES:
    t=.95 if s['id'] in ('emo','repair','cartpull','cartload') else s['duration']*.55
    samples[round((s['start']+t)*30)]=f'{s["number"]:02}-{s["id"]}'
for id,t in [('look',.45),('emo',.35),('repair',.35),('out',.45),('out',2.65),('in',.45),('cartpull',.4),('cartload',2.35),('oht',.35),('emoji',.35),('shop',.45),('shop',3.5),('bay',.45),('contest',.45),('photo',.35),('google',.45)]:
    s=next(s for s in SCENES if s['id']==id)
    samples[round((s['start']+t)*30)]=f'tap-{s["number"]:02}-{id}-{round(t*100):03}'

stream=imageio_ffmpeg.read_frames(str(TARGET),pix_fmt='rgb24',output_params=['-vf','scale=540:960'])
metadata=next(stream);assert metadata['source_size']==(1080,1920),metadata
assert abs(metadata['fps']-30)<.001,metadata
assert abs(metadata['duration']-90)<.05,metadata
count=0;bad_footer=[]
for n,raw in enumerate(stream):
    a=np.frombuffer(raw,dtype=np.uint8).reshape(960,540,3)
    footer=a[940:955,180:360].astype(float).mean(axis=2)
    if footer.max()-np.quantile(footer,.1)<140:bad_footer.append(n)
    if n in samples:Image.fromarray(a).save(QA/f'{samples[n]}.jpg',quality=94)
    if n==52:Image.fromarray(a).save(OUT/'tutorial-poster.jpg',quality=94)
    count=n+1
assert count==2700,count
assert not bad_footer,bad_footer[:20]
assert len(list(QA.glob('*.jpg')))==len(samples),'missing extracted frames'
for prefix in ('chapter','tap'):
    paths=sorted(p for p in QA.glob('*.jpg') if p.name.startswith('tap-')==(prefix=='tap'))
    for part in range(math.ceil(len(paths)/9)):
        sheet=Image.new('RGB',(1080,1920),'#092b35')
        for i,p in enumerate(paths[part*9:part*9+9]):sheet.paste(Image.open(p).resize((360,640)),((i%3)*360,(i//3)*640))
        sheet.save(QA/f'../final-{prefix}-{part+1}.jpg',quality=92)
raw=subprocess.run([FF,'-v','error','-i',str(TARGET),'-vn','-f','f32le','-ac','2','-ar','48000','pipe:1'],capture_output=True,check=True).stdout
audio=np.frombuffer(raw,dtype='<f4');assert np.isfinite(audio).all()
peak=float(np.max(np.abs(audio)));assert peak<.999,peak
seconds=audio.size/2/48000;assert abs(seconds-90)<.05,seconds
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'file':TARGET.name,'bytes':TARGET.stat().st_size,'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'durationSeconds':metadata['duration'],'width':1080,'height':1920,'fps':metadata['fps'],'decodedFrames':count,'footerContrastPassFrames':count-len(bad_footer),'audioRate':48000,'audioChannels':2,'decodedAudioPeakDbFS':round(20*math.log10(peak),3),'decodedAudioSeconds':seconds,'extractedReviewFrames':len(samples),'gameSourceRevision':json.loads((OUT/'new-shots/timeline.json').read_text())['sourceRevision'],'method':'Offline game-model rendering, source-checked enlarged instructional UI, two cropped saved local QA shop screenshots, local Korean TTS, original music and game effects. Not a recording of live play.','physicalPhonePlaybackTested':False,'browserPlaybackTested':False,'visualReviewComplete':False}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
