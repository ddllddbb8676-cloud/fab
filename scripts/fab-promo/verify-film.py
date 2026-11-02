"""Decode the finished film and verify the URL across every delivered frame."""
import json, subprocess, math, shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]/'outputs/fab-promo-2026-11-02'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe();video=ROOT/'FAB-promo-58s-v1.mp4'
reader=imageio_ffmpeg.read_frames(str(video));metadata=next(reader);reader.close()
assert metadata['size']==(1080,1920),metadata
assert abs(metadata['fps']-30)<.01,metadata
assert 57.95<=metadata['duration']<=58.1,metadata

watermark=np.asarray(Image.open(ROOT/'overlays/watermark.png'))[103:183,275:805]
white=(np.min(watermark[:,:,:3],axis=2)>240)&(watermark[:,:,3]>250)
dark=(watermark[:,:,0]<25)&(watermark[:,:,1]<65)&(watermark[:,:,3]>230)
proc=subprocess.Popen([FFMPEG,'-hide_banner','-loglevel','error','-i',str(video),'-an','-vf','crop=530:80:275:103','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
frames=0;failures=[];minimum_white=255;minimum_contrast=255;frame_bytes=530*80*3
while True:
    raw=proc.stdout.read(frame_bytes)
    if not raw:break
    assert len(raw)==frame_bytes,'Incomplete decoded frame'
    rgb=np.frombuffer(raw,np.uint8).reshape((80,530,3));luma=rgb.mean(axis=2)
    white_mean=float(luma[white].mean());dark_mean=float(luma[dark].mean());contrast=white_mean-dark_mean
    minimum_white=min(minimum_white,white_mean);minimum_contrast=min(minimum_contrast,contrast)
    if white_mean<195 or contrast<105:failures.append(frames)
    frames+=1
assert proc.wait()==0,proc.stderr.read().decode(errors='replace')
assert frames==1740,frames
assert not failures,failures

pcm=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-i',str(video),'-vn','-ar','48000','-ac','2','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
audio=np.frombuffer(pcm,np.float32).reshape((-1,2));peak=float(np.max(np.abs(audio)))
assert .05<peak<1.0,peak
assert abs(len(audio)/48000-58)<.1,len(audio)
assert video.stat().st_size<25*1024*1024,video.stat().st_size

qa=ROOT/'qa';qa.mkdir(exist_ok=True)
times=[.6,2.6,6.5,10.7,15,20,24.5,30,36,42.4,44.7,47,50,52.5,56.5]
contact=Image.new('RGB',(270*5,506*3),'#153c45');draw=ImageDraw.Draw(contact);font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',17)
for i,t in enumerate(times):
    path=qa/f'frame-{t:04.1f}.jpg'
    subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1','-q:v','2',str(path)],check=True)
    im=Image.open(path).resize((270,480));x=(i%5)*270;y=(i//5)*506;contact.paste(im,(x,y));draw.text((x+10,y+482),f'{t:04.1f}s',font=font,fill='white')
contact.save(qa/'contact-sheet.jpg',quality=94)

report={'size':metadata['size'],'fps':metadata['fps'],'seconds':metadata['duration'],'frames':frames,'watermark':'< fab.semitoon.com >','watermarkFramesChecked':frames,'watermarkFailures':failures,'minimumWhiteTextLuma':minimum_white,'minimumTextContrast':minimum_contrast,'audioSampleRate':48000,'audioChannels':2,'audioPeakDbFS':20*math.log10(peak),'fileBytes':video.stat().st_size,'browserQa':'Unavailable: local browser disabled in Work settings','visualReview':'Pending final contact-sheet inspection'}
(qa/'verification.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
dist=ROOT/'mobile-preview/dist';shutil.copy2(video,dist/video.name)
shutil.copy2(qa/'frame-00.6.jpg',dist/'poster.jpg')
print(json.dumps(report,ensure_ascii=False),flush=True)
