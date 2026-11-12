"""92s tutorial: original DOM screenshots over isolated game-model footage.

No replacement controls, narration or production network. Click rings/subtitles
are editorial annotations. A black/white matte pair preserves native UI alpha.
"""
import functools,json,math,subprocess,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageEnhance
import imageio_ffmpeg
from story import ROOT,OUT,OLD,UPDATE,NEW
from revision_plan import SCENES_V2 as SCENES,DURATION,REVISION as REV

W,H,FPS=1080,1920,30
NATIVE=REV/'native'; QA=REV/'qa';QA.mkdir(parents=True,exist_ok=True)
GROUPS={'old':OLD,'update':UPDATE,'new':NEW,'oht':OUT/'oht-boarding','hit':REV/'hit'}
TARGETS=json.loads((OUT/'targets.json').read_text(encoding='utf-8'))
FF=imageio_ffmpeg.get_ffmpeg_exe()
DARK='#092b35';MINT='#dfff68';WHITE='#ffffff';NAVY='#123d46'

@functools.lru_cache(80)
def font(n):return ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',n)
def text(d,xy,value,size=44,fill=WHITE,anchor='mm',width=960):
    while font(size).getlength(value)>width and size>20:size-=1
    d.text(xy,value,font=font(size),fill=fill,anchor=anchor)
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
@functools.lru_cache(40)
def meta(group,clip):return json.loads((GROUPS[group]/(clip+'.json')).read_text(encoding='utf-8'))
@functools.lru_cache(25)
def rects(state):return json.loads((NATIVE/f'{state}-rects.json').read_text(encoding='utf-8'))
def point(state,key):
    matches=[e for e in rects(state) if e['id']==key or e['label']==key or key in e['classes'].split()]
    assert matches,(state,key)
    r=matches[0]['rect'];return ((r['x']+r['width']/2)*W/390,(r['y']+r['height']/2)*H/694)
@functools.lru_cache(25)
def overlay(state):
    a=np.asarray(Image.open(NATIVE/f'{state}-black.jpg').convert('RGB')).astype(np.float32)
    b=np.asarray(Image.open(NATIVE/f'{state}-white.jpg').convert('RGB')).astype(np.float32)
    assert a.shape==b.shape==(694,390,3),(state,a.shape,b.shape)
    alpha=np.clip(1-np.median(b-a,axis=2)/255,0,1)
    alpha[alpha<.012]=0
    color=np.clip(a/np.maximum(alpha[:,:,None],.001),0,255)
    pixels=np.dstack([color,alpha*255]).astype(np.uint8)
    im=Image.fromarray(pixels,'RGBA')
    im.save(NATIVE/f'{state}-alpha.png')
    return im.resize((W,H),Image.Resampling.LANCZOS)

def source(s,t):
    g,c=s['group'],s['clip'];q=min(.9999,max(0,t/s['duration']));st=s['a']+(s['b']-s['a'])*q
    if s['id'] in ('emo','repair'):
        hold=1.4 if s['id']=='emo' else 1.25
        st=.02 if t<hold else (t-hold)/(s['duration']-hold)*(s['b']-.04)
    if s['id']=='cartpull':
        if t<1.6:g,c,st='update','08-cart-load',.1
        else:st=(t-1.6)/(s['duration']-1.6)*3.5
    if s['id']=='cartload':st=.02 if t<1.5 else (t-1.5)/(s['duration']-1.5)*2.98
    if s['id']=='out':
        st=0 if t<.5 else (t-.5)/1.8*1.4 if t<2.3 else 1.43 if t<2.85 else min(1.98,1.51+(t-2.85)/.65*.47)
    if s['id']=='gold' and t>1.8:g,c,st='update','06-stocker-in',(t-1.8)/2.2*1.98
    if s['id']=='contest' and t>3.15:g,c,st='update','04-steal',(t-3.15)/1.35*2.35
    m=meta(g,c);f=min(m['frames']-1,round(st*30));return g,c,f,m

def project(point,shot):
    if isinstance(point,dict):point=[point['x'],point['y'],point['z']]
    p=np.asarray(shot['position']);fw=np.asarray(shot['target'])-p;fw=fw/np.linalg.norm(fw)
    right=np.cross(fw,np.asarray(shot['up']));right/=np.linalg.norm(right);up=np.cross(right,fw);delta=np.asarray(point)-p
    depth=float(np.dot(delta,fw));scale=1/math.tan(math.radians(shot['fov'])/2)
    return (W/2*(1+np.dot(delta,right)*scale/(depth*9/16)),H/2*(1-np.dot(delta,up)*scale/depth))

def marker(canvas,xy,t):
    x,y=xy
    if not(-25<x<W+25 and -25<y<H+25):return
    layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer);phase=t*1.7%1;r=33+phase*32
    d.ellipse((x-r,y-r,x+r,y+r),outline=(9,43,53,round(200*(1-phase))),width=7)
    d.ellipse((x-30,y-30,x+30,y+30),outline=MINT,width=7)
    d.ellipse((x-8,y-8,x+8,y+8),fill=WHITE,outline=NAVY,width=2)
    canvas.alpha_composite(layer)
def arrow(canvas,a,b):
    d=ImageDraw.Draw(canvas);d.line((*a,*b),fill=MINT,width=10)
    v=np.asarray(b)-a;v=v/max(1,np.linalg.norm(v));n=np.array([-v[1],v[0]]);p=np.asarray(b)
    d.polygon([tuple(p),tuple(p-v*30+n*17),tuple(p-v*30-n*17)],fill=MINT)
def note(canvas,label,y=1200):
    d=ImageDraw.Draw(canvas);width=min(940,max(240,font(44).getlength(label)+64));x=(W-width)/2
    d.rounded_rectangle((x,y,x+width,y+90),radius=22,fill=NAVY)
    text(d,(540,y+45),label,44,MINT,width=width-40)

def native_state(id,t,m,f):
    if id in ('intro','end'):return None
    if id=='photo':return 'default' if t<.65 else 'photo'
    if id=='emoji':return 'default' if t<1.85 else 'emoji2'
    if id=='speech':return 'speech' if .55<t<2.2 else 'default'
    if id in ('emo','repair'):return id if .55<t<(1.4 if id=='emo' else 1.25) else 'default'
    if id=='throw':return 'throw' if t<1.4 else 'default'
    if id=='oht':return 'oht' if m['phases'][f]=='riding' else 'oht-climb' if m['phases'][f]=='climb' else 'oht-descend' if m['phases'][f] in ('fall','step-off') else 'default'
    if id=='cartpull':return 'cartidle' if t<.5 else 'cartmenu' if t<1.6 else 'cartdriver'
    if id=='cartload':return 'cartload' if t<1.5 else 'cartidle'
    if id=='cartride':return 'cartquick' if t<1.1 else 'cartrider'
    if id=='walkway':return 'cartdriver'
    if id=='safety':return 'safety'
    if id=='shop':return 'default' if t<.4 else 'menu' if t<1 else 'shop' if t<1.5 else 'shoptrial' if t<2.7 else 'items'
    if id=='bay':return 'bay' if t<1.3 else 'default'
    if id=='gold':return 'gold'
    if id=='contest':return 'contest' if t<1.05 else 'throw' if t<3.15 else 'default'
    if id in ('menu','google'):return 'default' if t<.35 else 'menu'
    return 'default'

def annotations(canvas,s,t,g,c,f,m,state):
    id=s['id'];shot=m['cameras'][f]
    def tap(key,fromstate=None):marker(canvas,point(fromstate or state,key),t)
    if id=='move':
        p=point('default','joystick-zone');q=(p[0],p[1]-110*smooth(t/.6));arrow(canvas,p,q);marker(canvas,q,t)
    elif id=='look':
        q=(630+220*smooth(t/2),970);arrow(canvas,(630,970),(880,970));marker(canvas,q,t)
    elif id in ('emo','repair'):
        if t<.55:marker(canvas,project(TARGETS['emo'],shot) if id=='emo' else (520,1110),t)
        elif state in ('emo','repair'):tap('tool-emo' if id=='emo' else 'tool-repair')
    elif id=='pickup':marker(canvas,project(m['targets'][f] if t<1.3 else [TARGETS['port']['x'],1.46,TARGETS['port']['z']],shot),t)
    elif id=='throw':
        if t<1.4:tap('foup-throw')
        elif 1.85<t<3.85:note(canvas,'명중! 2초 헤롱헤롱',y=1165)
    elif id=='clean' and t<1.25:marker(canvas,project([-25.6,.12,.4],shot),t)
    elif id in ('in','out'):
        if t<1.1:marker(canvas,project(TARGETS[id],shot),t)
        elif id=='out' and 2.3<t<2.85:marker(canvas,project({**TARGETS[id],'y':TARGETS[id]['y']+.25},shot),t)
    elif id=='cartpull':
        if t<.5:tap('cart-quick')
        elif t<1.6:tap('cart-pull')
        else:tap('joystick-zone')
    elif id=='cartload' and t<1.5:tap('위 2 · FOUP 싣기')
    elif id=='cartride':
        if t<1.1:tap('cart-quick')
        elif t>2.8:tap('cart-leave')
    elif id=='walkway':note(canvas,'×2 SPEED · 카트도 OK',y=1120)
    elif id=='oht':
        phase=m['phases'][f]
        if t<.45:marker(canvas,project(m['targets'][f],shot),t)
        elif phase=='climb':note(canvas,'장비를 딛고 → 점프!',y=1300)
        elif phase=='riding' and t>2.6:tap('oht-dismount')
        elif phase=='riding':note(canvas,'매달려서 같이 이동',y=1300)
    elif id=='emoji':
        if t<1.2:tap('인사')
        else:
            p=point(state,'emote-controls');arrow(canvas,(p[0],p[1]-90),(p[0],p[1]+50));marker(canvas,(p[0],p[1]-60+80*smooth((t-1.2)/.65)),t)
    elif id=='speech':
        if t<.55:tap('speech-quick-open')
        elif t<1.5:tap('speech-input')
        elif t<2.2:tap('보내기')
    elif id=='rest':tap('posture-sit' if t<1 else 'posture-lie')
    elif id=='safety':tap('safety-repairs' if t<1.8 else 'safety-pass-use')
    elif id=='shop':
        if t<.4:tap('controls-toggle')
        elif t<1:tap('wardrobe-open')
        elif t<1.5:tap('방진복')
        elif t<2.7:tap('wardrobe-buy')
        else:tap('아이템')
    elif id=='bay' and t<1.3:tap('5번 BAY로 가기')
    elif id=='gold':
        if t<1.5:marker(canvas,(478,1090),t)
        elif t>2.2:marker(canvas,project(TARGETS['in'],shot),t)
    elif id=='contest':
        if t<1.05:tap('참여하기')
        elif t<3.15:tap('foup-throw')
        else:note(canvas,'상대 원의 풉도 가져와요',y=1270)
    elif id=='photo' and t<.65:tap('photo-toggle')
    elif id=='menu':tap('controls-toggle' if t<.35 else 'map-toggle' if t<1.15 else 'overview' if t<1.8 else 'tour')
    elif id=='google':tap('controls-toggle' if t<.35 else 'google-account-link')
    elif id=='end':
        layer=Image.new('RGBA',(W,H),(6,31,40,90));canvas.alpha_composite(layer)
        note(canvas,'누구나 PC · 모바일로!',y=1000)
        d=ImageDraw.Draw(canvas);text(d,(540,1180),'fab.semitoon.com',70,MINT)

def compose_frame(s,t):
    g,c,f,m=source(s,t)
    im=Image.open(GROUPS[g]/'frames'/c/f'{f:04d}.png').convert('RGB')
    im=ImageEnhance.Contrast(im).enhance(1.04);im=ImageEnhance.Color(im).enhance(1.12)
    if im.size!=(W,H):im=im.resize((W,H),Image.Resampling.LANCZOS)
    canvas=im.convert('RGBA');state=native_state(s['id'],t,m,f)
    if state:canvas.alpha_composite(overlay(state))
    annotations(canvas,s,t,g,c,f,m,state)
    out=Image.new('RGB',(W,H),DARK);d=ImageDraw.Draw(out)
    view=canvas.convert('RGB').resize((912,1621),Image.Resampling.LANCZOS);out.paste(view,(84,250))
    d.rounded_rectangle((82,248,998,1873),radius=24,outline='#75a3a5',width=3)
    text(d,(84,49),'팹뿌 · 눌러보면 바로 끝!',30,MINT,'lm')
    text(d,(996,49),f'{s["number"]:02d} / 27',28,'#a8c9cb','rm')
    text(d,(540,119),s['title'],60)
    lines=['']
    for word in s['detail'].split():
        candidate=(lines[-1]+' '+word).strip()
        if font(33).getlength(candidate)>970 and lines[-1]:lines.append(word)
        else:lines[-1]=candidate
    for i,line in enumerate(lines[:2]):text(d,(540,181+i*38),line,33,'#d9edeb')
    d.rectangle((84,237,996,241),fill='#325560');d.rectangle((84,237,84+912*(s['start']+t)/DURATION,241),fill=MINT)
    text(d,(540,1898),'fab.semitoon.com',32)
    return out

def previews():
    selected=[]
    for s in SCENES:
        t=.95 if s['id'] in ('emo','repair','cartpull','cartload','cartride','contest','bay') else s['duration']*.55
        p=QA/f'{s["number"]:02}-{s["id"]}.jpg';compose_frame(s,t).save(p,quality=94);selected.append(p)
    for i in range(3):
        sheet=Image.new('RGB',(1080,1920),DARK)
        for j,p in enumerate(selected[i*9:(i+1)*9]):sheet.paste(Image.open(p).resize((360,640)),(j%3*360,j//3*640))
        sheet.save(QA/f'contact-{i+1}.jpg',quality=93)
    print('NATIVE_PREVIEWS_READY',len(selected),flush=True)

def compose():
    report=json.loads((REV/'audio-report.json').read_text(encoding='utf-8'))
    assert report['narration'] is False and report['voiceFilesRead']==0
    target=REV/'FAB-controls-92s-native.mp4'
    cmd=[FF,'-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','pipe:0','-i',str(REV/'tutorial-no-voice.wav'),'-c:v','libx264','-preset','fast','-crf','18','-maxrate','8M','-bufsize','16M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-18:TP=-1.5:LRA=8','-ar','48000','-movflags','+faststart','-t',str(DURATION),str(target)]
    with (REV/'encode-native.log').open('w',encoding='utf-8') as log:
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for s in SCENES:
                print('ENCODING',s['number'],s['id'],flush=True)
                for f in range(round(s['duration']*FPS)):process.stdin.write(compose_frame(s,f/FPS).tobytes())
        finally:process.stdin.close()
        assert process.wait()==0,'See encode-native.log'
    print('NATIVE_TUTORIAL_READY',target,flush=True)

if __name__=='__main__':
    if '--compose' in sys.argv:compose()
    else:previews()
