"""Mux the original stocker cue prominently; verify the complete standalone clip."""
import hashlib,json,math,subprocess
from pathlib import Path
import imageio_ffmpeg,numpy as np
from PIL import Image,ImageOps,ImageDraw

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/stocker-clip-20261116'
FF=imageio_ffmpeg.get_ffmpeg_exe()
capture=json.loads((OUT/'capture.json').read_text())
assert capture['renderedFrames']==450,capture
assert [p['phase'] for p in capture['phases']]==['stored','retrieving','stocker-out','carried']
assert 2.6<capture['cueAt']<3.2
cue=ROOT/'audio/entertainer/fab-entertainer-stocker.mp3'
movie=OUT/'FAB-stocker-OUT-music.mp4'
delay=round(capture['cueAt']*1000)
audio=f'aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000,afade=t=out:st=10:d=0.2,adelay={delay}|{delay},apad=whole_dur=15'
cmd=[FF,'-hide_banner','-loglevel','warning','-y','-fflags','+genpts','-r','30','-i',str(OUT/'capture.h264'),'-i',str(cue),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',audio,'-c:a','aac','-b:a','192k','-ar','48000','-t','15','-movflags','+faststart','-metadata','title=FAB Stocker OUT - The Entertainer',str(movie)]
subprocess.run(cmd,check=True,capture_output=True)
reader=imageio_ffmpeg.read_frames(str(movie),pix_fmt='rgb24');meta=next(reader);count=0
qa=OUT/'qa';qa.mkdir(exist_ok=True)
chosen={0,70,105,135,195,300,420};images=[]
for n,data in enumerate(reader):
    count+=1
    if n in chosen:
        img=Image.frombytes('RGB',meta['size'],data);img.save(qa/f'frame-{n:04d}.jpg',quality=94);images.append((n,img.copy()))
assert count==450 and meta['size']==(1080,1920),(count,meta)
decoded=subprocess.run([FF,'-v','error','-i',str(movie),'-vn','-f','f32le','-ac','2','-ar','48000','pipe:1'],check=True,capture_output=True).stdout
samples=np.frombuffer(decoded,dtype='<f4');peak=float(np.max(np.abs(samples)))
assert 0<peak<1,peak
sheet=Image.new('RGB',(350*len(images),680),'#142d35')
for i,(n,img) in enumerate(images):
    thumb=img.resize((350,622),Image.Resampling.LANCZOS);sheet.paste(thumb,(i*350,40));ImageDraw.Draw(sheet).text((i*350+10,12),f'{n/30:.2f}s',fill='white')
sheet.save(qa/'contact.jpg',quality=92)
Image.open(qa/'frame-0135.jpg').save(OUT/'poster.jpg',quality=94)
report={'file':movie.name,'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'bytes':movie.stat().st_size,'duration':15,'dimensions':[1080,1920],'fps':30,'decodedFrames':count,'audioPeakDbFS':20*math.log10(peak),'clippedSamples':int(np.count_nonzero(np.abs(samples)>=1)),'cueAt':capture['cueAt'],'sound':'Existing game rendition of The Entertainer, loudness target -14 LUFS, true peak target -1.5 dBTP','originalCueIntegratedLufs':-22.42,'narration':False,'method':'Original game renderer and stocker/playActions captured in an isolated local scene, fixed camera, 450 fixed simulation frames','liveServer':False,'visualReviewComplete':False}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
