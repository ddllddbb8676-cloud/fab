"""Decode final native-UI edit, check media, and extract visual-review evidence."""
import hashlib,json,math,subprocess
from datetime import datetime,timezone
import imageio_ffmpeg
import numpy as np
from PIL import Image
from story import OUT,ROOT
from revision_plan import SCENES_V2 as SCENES,DURATION,REVISION as REV

FF=imageio_ffmpeg.get_ffmpeg_exe();TARGET=REV/'FAB-controls-92s-native.mp4'
QA=REV/'qa/final';QA.mkdir(parents=True,exist_ok=True)
samples={}
for s in SCENES:
    t=.95 if s['id'] in ('emo','repair','cartpull','cartload','cartride','contest','bay') else s['duration']*.55
    samples[round((s['start']+t)*30)]=f'{s["number"]:02}-{s["id"]}'
extra=[('look',.45),('emo',.35),('repair',.35),('out',.45),('out',2.6),('in',.45),('cartpull',.3),('cartload',2.8),('cartride',2.3),('oht',.35),('oht',.75),('oht',1.45),('oht',2.83),('oht',3.25),('oht',3.96),('emoji',.35),('emoji',2.4),('speech',.2),('shop',.25),('shop',.65),('shop',1.25),('shop',3.5),('bay',.45),('contest',2),('photo',.35),('google',.2),('throw',.8),('throw',1.63),('throw',2.7),('throw',4.7),('safety',.5)]
for id,t in extra:
    s=next(s for s in SCENES if s['id']==id);samples[round((s['start']+t)*30)]=f'tap-{s["number"]:02}-{id}-{round(t*100):03}'
s=next(s for s in SCENES if s['id']=='out')
samples[round((s['start']+3.1)*30)]='tap-09-out-310'
stream=imageio_ffmpeg.read_frames(str(TARGET),pix_fmt='rgb24',output_params=['-vf','scale=540:960'])
metadata=next(stream);assert metadata['source_size']==(1080,1920),metadata
assert abs(metadata['fps']-30)<.001 and abs(metadata['duration']-DURATION)<.05,metadata
count=0;bad_footer=[]
for n,raw in enumerate(stream):
    a=np.frombuffer(raw,dtype=np.uint8).reshape(960,540,3)
    footer=a[940:955,180:360].astype(float).mean(axis=2)
    if footer.max()-np.quantile(footer,.1)<140:bad_footer.append(n)
    if n in samples:Image.fromarray(a).save(QA/f'{samples[n]}.jpg',quality=94)
    if n==55:Image.fromarray(a).save(REV/'tutorial-native-poster.jpg',quality=94)
    count=n+1
assert count==DURATION*30,count
assert not bad_footer,bad_footer[:20]
for name in samples.values():assert (QA/f'{name}.jpg').is_file(),name
for prefix in ('chapter','tap'):
    paths=sorted(p for p in QA.glob('*.jpg') if p.name.startswith('tap-')==(prefix=='tap'))
    for part in range(math.ceil(len(paths)/9)):
        sheet=Image.new('RGB',(1080,1920),'#092b35')
        for i,p in enumerate(paths[part*9:part*9+9]):sheet.paste(Image.open(p).resize((360,640)),(i%3*360,i//3*640))
        sheet.save(QA/f'../final-{prefix}-{part+1}.jpg',quality=93)
raw=subprocess.run([FF,'-v','error','-i',str(TARGET),'-vn','-f','f32le','-ac','2','-ar','48000','pipe:1'],capture_output=True,check=True).stdout
audio=np.frombuffer(raw,dtype='<f4');assert np.isfinite(audio).all()
peak=float(np.max(np.abs(audio)));assert peak<.999,peak
seconds=audio.size/2/48000;assert abs(seconds-DURATION)<.05,seconds
audio_source=json.loads((REV/'audio-report.json').read_text(encoding='utf-8'))
assert audio_source['narration'] is False and audio_source['voiceFilesRead']==0
native=json.loads((REV/'native/provenance.json').read_text(encoding='utf-8'))
for file,digest in native['files'].items():assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest,file
for state in native['states']:
    for matte in ('black','white'):assert (REV/'native'/f'{state}-{matte}.jpg').is_file(),(state,matte)
def stamp(t):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(REV/'FAB-controls-92s-native.ko.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(s["start"])} --> {stamp(s["start"]+s["duration"])}\n{s["title"]}\n{s["detail"]}' for i,s in enumerate(SCENES))+'\n',encoding='utf-8')
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'file':TARGET.name,'bytes':TARGET.stat().st_size,'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'durationSeconds':metadata['duration'],'width':1080,'height':1920,'fps':metadata['fps'],'decodedFrames':count,'footerContrastPassFrames':count-len(bad_footer),'audioRate':48000,'audioChannels':2,'decodedAudioPeakDbFS':round(20*math.log10(peak),3),'decodedAudioSeconds':seconds,'narration':False,'voiceFilesRead':0,'nativeUiStates':len(native['states']),'nativeUiProvenance':native,'extractedReviewFrames':len(samples),'method':'Original production HTML/CSS/component screenshots in a local isolated browser fixture, matted over offline game-model/controller footage. Click rings and subtitles are editorial overlays. No replacement controls or narration. Not a recording of a live server or physical phone.','physicalPhonePlaybackTested':False,'browserPlaybackTested':False,'visualReviewComplete':False}
report['ohtBoarding']=json.loads((OUT/'oht-boarding/verification.json').read_text(encoding='utf-8'))
report['foupHit']=json.loads((REV/'hit/verification.json').read_text(encoding='utf-8'))
(REV/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ('nativeUiProvenance','ohtBoarding','foupHit')},ensure_ascii=False,indent=2),flush=True)
