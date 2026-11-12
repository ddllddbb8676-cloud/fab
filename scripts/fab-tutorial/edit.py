"""Deterministic tutorial edit: actual model renders + source-checked UI callouts.

UI callouts are enlarged instructional reproductions, not a live screen recording.
The two shop excerpts are cropped from saved isolated QA screenshots. No player
names, accounts, production mutations, external stock footage or paid audio API.
"""
import functools,json,math,subprocess,sys,wave
from pathlib import Path
import numpy as np
import imageio_ffmpeg
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageFilter
from story import ROOT,OUT,OLD,UPDATE,NEW,SCENES

FF= imageio_ffmpeg.get_ffmpeg_exe()
W,H,FPS=1080,1920,30
NAVY='#123d46';DARK='#092b35';MINT='#dfff68';WHITE='#ffffff'
FONT='C:/Windows/Fonts/malgunbd.ttf'
TARGETS=json.loads((OUT/'targets.json').read_text(encoding='utf-8'))
GROUPS={'old':OLD,'update':UPDATE,'new':NEW}
@functools.lru_cache(80)
def font(n):return ImageFont.truetype(FONT,n)
def fit(text,n=44,width=930):
    while font(n).getlength(text)>width and n>20:n-=1
    return font(n)
def text(d,xy,value,size=44,fill=NAVY,anchor='mm',width=930):
    d.text(xy,value,font=fit(value,size,width),fill=fill,anchor=anchor)
def roundbox(d,box,fill=(248,253,252,238),radius=27,outline=None,width=2):
    d.rounded_rectangle(tuple(round(v) for v in box),radius,fill=fill,outline=outline,width=width)
def button(d,box,label,active=False,size=39):
    roundbox(d,box,NAVY if active else (250,255,253,247),19,'#c5d9d7',2)
    text(d,((box[0]+box[2])/2,(box[1]+box[3])/2),label,size,WHITE if active else NAVY,width=box[2]-box[0]-24)
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)

EMOJIS=[Image.open(OUT/f'ui/emote-{i}.png').convert('RGBA') for i in range(27)]
ICON=Image.open(OUT/'ui/icon.png').convert('RGBA')
@functools.lru_cache(40)
def meta(group,clip):return json.loads((GROUPS[group]/(clip+'.json')).read_text(encoding='utf-8'))
def source(s,t):
    g,c=s['group'],s['clip'];q=min(.9999,max(0,t/s['duration']));st=s['a']+(s['b']-s['a'])*q
    if s['id'] in ('emo','repair'):
        hold=1.4 if s['id']=='emo' else 1.0
        st=.02 if t<hold else (t-hold)/(s['duration']-hold)*(s['b']-.04)
    if s['id']=='cartpull':
        if t<1.6:g,c,st='update','08-cart-load',.1
        else:st=(t-1.6)/(s['duration']-1.6)*3.5
    if s['id']=='gold' and t>1.8:g,c,st='update','06-stocker-in',(t-1.8)/2.2*1.98
    if s['id']=='contest' and t>3.15:g,c,st='update','04-steal',(t-3.15)/1.35*2.35
    m=meta(g,c);f=min(m['frames']-1,round(st*30))
    return g,c,f,m

def project(point,shot):
    if isinstance(point,dict):point=[point['x'],point['y'],point['z']]
    p=np.asarray(shot['position']);fw=np.asarray(shot['target'])-p;fw=fw/np.linalg.norm(fw)
    right=np.cross(fw,np.asarray(shot['up']));right/=np.linalg.norm(right);up=np.cross(right,fw);delta=np.asarray(point)-p
    depth=float(np.dot(delta,fw));scale=1/math.tan(math.radians(shot['fov'])/2)
    return (W/2*(1+np.dot(delta,right)*scale/(depth*9/16)),H/2*(1-np.dot(delta,up)*scale/depth))

def marker(canvas,point,t,label=None,offset=(-170,-110)):
    x,y=point
    if not (-25<x<W+25 and -25<y<H+25):return
    layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
    phase=(t*1.7)%1;r=29+phase*38
    d.ellipse((x-r,y-r,x+r,y+r),outline=(10,56,66,int(190*(1-phase))),width=7)
    d.ellipse((x-30,y-30,x+30,y+30),fill=(223,255,104,80),outline=MINT,width=7)
    d.ellipse((x-9,y-9,x+9,y+9),fill=WHITE,outline=NAVY,width=2)
    if label:
        label_width=min(570,max(150,int(font(38).getlength(label)+42)))
        bx=max(16,min(W-label_width-16,x+offset[0]-label_width/2));by=max(170,min(1590,y+offset[1]-34))
        d.line((bx+label_width/2,by+68,x,y),fill=NAVY,width=5)
        roundbox(d,(bx,by,bx+label_width,by+68),MINT,17)
        text(d,(bx+label_width/2,by+34),label,38,width=label_width-25)
    canvas.alpha_composite(layer)

def arrow(d,a,b,color=MINT,width=13):
    d.line((*a,*b),fill=color,width=width);v=np.asarray(b)-a;v=v/max(1,np.linalg.norm(v));n=np.array([-v[1],v[0]])
    p=np.asarray(b);d.polygon([tuple(p),tuple(p-v*38+n*20),tuple(p-v*38-n*20)],fill=color)

def hud(canvas,s,t):
    if s['id'] in ('intro','end') or s['id']=='photo' and t>.8:return
    layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
    layer.alpha_composite(ICON.resize((90,90)),(27,24))
    text(d,(130,45),'FAB@semitoon',40,anchor='lm',width=390);text(d,(130,89),'조작 시연',26,anchor='lm')
    for box,label in [((540,25,692,115),'♪ 효과음'),((700,25,850,115),'공조음'),((858,25,945,115),'camera'),((953,25,1050,115),'menu')]:
        button(d,box,'' if label in ('camera','menu') else label,size=29)
        if label=='camera':
            d.rounded_rectangle((878,54,925,88),6,outline=NAVY,width=4);d.ellipse((891,60,912,81),outline=NAVY,width=4);d.line((889,51,914,51),fill=NAVY,width=4)
        if label=='menu':
            for yy in (54,72,90):d.line((976,yy,1026,yy),fill=NAVY,width=5)
    roundbox(d,(755,140,1050,212),(244,252,250,215),24)
    text(d,(883,175),'파괴 TOP 5',29);d.line((1005,181,1016,170,1027,181),fill=NAVY,width=3)
    roundbox(d,(25,1743,1055,1887),(246,253,250,231),40)
    row=1 if s['id']=='emoji' and t>1.9 else 0
    for i in range(9):layer.alpha_composite(EMOJIS[row*9+i].resize((88,88)),(37+i*106,1760))
    text(d,(1010,1824),f'{row+1}/3',26)
    d.ellipse((81,1370,339,1628),fill=(248,255,252,45),outline=(248,255,252,175),width=4)
    dx,dy=0,0
    if s['id']=='move':dy=-65*smooth(t/.6)
    d.ellipse((162+dx,1451+dy,258+dx,1547+dy),fill=(64,113,118,150))
    text(d,(210,1660),'이동',30)
    roundbox(d,(668,1608,1053,1715),(249,254,252,245),35)
    # Speech bubble, sit, lie match the game's right-bottom order.
    d.rounded_rectangle((701,1640,749,1679),12,outline=NAVY,width=4);d.line((711,1678,704,1692,728,1679),fill=NAVY,width=3)
    for xx in (713,725,737):d.ellipse((xx-2,1658,xx+2,1662),fill=NAVY)
    text(d,(837,1661),'앉기',36);text(d,(975,1661),'눕기',36)
    if s['id']=='throw':
        button(d,(460,1452,745,1557),'바닥에 놓기',size=32);button(d,(758,1452,1053,1557),'던지기 ↗',True,34)
    if s['id']=='oht':button(d,(779,1452,1053,1557),'내리기 ↓',size=34)
    if s['id'] in ('cartpull','cartload','cartride','walkway'):
        label='카트 놓기' if s['id'] in ('cartpull','walkway') and t>1.65 else '카트 타기' if s['id']=='cartride' else '카트'
        button(d,(785,1452,1053,1557),label,size=34)
    canvas.alpha_composite(layer)

def smallcard(canvas,title,rows,chosen=None,y=670):
    layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
    bottom=y+105+len(rows)*93+30
    roundbox(d,(185,y,1015,bottom),(246,252,250,251),30,'#a3bfbd',3)
    text(d,(230,y+53),title,43,anchor='lm',width=700);text(d,(960,y+53),'×',45)
    for i,row in enumerate(rows):button(d,(215,y+106+i*93,985,y+181+i*93),row,i==chosen,37)
    canvas.alpha_composite(layer)
    return [(600,y+143+i*93) for i in range(len(rows))]

@functools.lru_cache(4)
def shop_crop(kind):
    filename='clothing-final.png' if kind=='clothes' else 'items-final.png'
    im=Image.open(ROOT/'outputs/shop-oht-release'/filename).convert('RGBA')
    return im.crop((27,220,370,633)) if kind=='clothes' else im.crop((27,143,370,500))

def annotate(canvas,s,t,g,c,f,m):
    id=s['id'];d=ImageDraw.Draw(canvas);shot=m['cameras'][f]
    if id=='move':
        arrow(d,(210,1495),(210,1405));marker(canvas,(210,1430),t,'왼쪽을 밀어요',(250,-145))
    elif id=='look':
        q=smooth(t/2);x=650+210*q;arrow(d,(650,1000),(920,1000));marker(canvas,(x,1000),t,'빈 화면 드래그',(-65,-130))
    elif id in ('emo','repair'):
        if t<.65:marker(canvas,project(TARGETS['emo'],shot) if id=='emo' else (520,1100),t,'① 장비 터치',(70,-180))
        elif t<(1.4 if id=='emo' else 1.0):
            points=smallcard(canvas,'선택한 장비',['EMO 누르기' if id=='emo' else '이 장비 수리하기'],0,y=1110)
            marker(canvas,points[0],t,'② 이 버튼!',(-165,-190))
        else:
            label='+5칩' if id=='emo' else '+3칩'
            if t>s['duration']-.8:reward(canvas,label)
    elif id=='pickup':
        if t<1.3:marker(canvas,project(m['targets'][f],shot),t,'풉 = 이 상자',(190,-155))
        else:marker(canvas,project([TARGETS['port']['x'],1.46,TARGETS['port']['z']],shot),t,'빈 받침에 놓기',(170,-170))
    elif id=='throw':
        if t<1.3:marker(canvas,(905,1504),t,'던지기',(-100,-140))
        elif t>2.6:marker(canvas,(602,1504),t,'안 깨고 놓기',(-80,-150))
    elif id=='clean':
        if t<1.25:marker(canvas,project([-25.6,.12,.4],shot),t,'잔해 터치',(150,-180))
        if t>2.35:reward(canvas,'+2칩')
    elif id in ('in','out'):
        target=TARGETS[id]
        if t<1.1 or id=='out' and 2.45<t<2.95:
            marker(canvas,project(target,shot),t,'OUT 누르기' if id=='out' and t<1.1 else '나온 풉 터치' if id=='out' else 'IN 누르기',(190,-200))
    elif id=='cartpull':
        if t<.55:marker(canvas,(920,1504),t,'① 카트',(-100,-140))
        elif t<1.6:
            p=smallcard(canvas,'FOUP 카트',['아래칸 타기        위칸 타기','손잡이 잡기'],1,y=910);marker(canvas,p[1],t,'② 손잡이 잡기',(-140,-180))
        else:marker(canvas,(210,1440),t,'조이스틱으로 끌기',(285,-150))
    elif id=='cartload':
        if t<1.6:
            p=smallcard(canvas,'풉을 든 채 → 카트',['아래 1 · FOUP 꺼내기','아래 2 · FOUP 꺼내기','위 1 · FOUP 꺼내기','위 2 · FOUP 싣기'],3,y=910);marker(canvas,p[3],t,'빈칸을 선택',(-220,-150))
        else:badge(canvas,'아래 2개 + 위 2개 = 4개',y=1150)
    elif id=='cartride':
        if t<1.2:marker(canvas,(920,1504),t,'가까이서 카트 타기',(-160,-160))
        if t>2.0:badge(canvas,'사람은 위아래 한 명씩',y=1170)
    elif id=='walkway':badge(canvas,'×2 SPEED · 카트도 OK',y=1090)
    elif id=='oht':
        if t<1.5:
            st=f/30;marker(canvas,project([-30.4+st*2.1,3.71,-2.985],shot),t,'천장 차량 터치',(-130,170))
        elif t>2.7:marker(canvas,(920,1504),t,'내리기',(-100,-150))
    elif id=='emoji':
        if t<1.3:marker(canvas,(80,1800),t,'터치!',(220,-200))
        else:
            arrow(d,(580,1750),(580,1870));marker(canvas,(580,1775+65*smooth((t-1.3)/.8)),t,'아래로 쓸기',(-95,-185))
    elif id=='speech':
        if t<.65:marker(canvas,(725,1660),t,'말풍선',(-140,-160))
        else:
            p=smallcard(canvas,'말풍선 보내기',['같이놀자!                    5 / 5','보내기'],1,y=1030)
            if t<1.9:marker(canvas,p[1],t,'5글자까지',(-180,-190))
            else:badge(canvas,'같이놀자!',y=750)
    elif id=='rest':marker(canvas,(837 if t<.85 else 975,1660),t,'앉기' if t<.85 else '눕기',(-150,-160))
    elif id=='safety':
        p=smallcard(canvas,'안전팀 패널티',['수리할 장비 선택','해제 쿠폰 1장 사용'],1 if t>1.5 else 0,y=1110)
        marker(canvas,p[1 if t>1.5 else 0],t,'쿠폰은 상점 30칩' if t>1.5 else '3대 수리',(-200,-190))
    elif id=='shop':
        if t<.5:marker(canvas,(1000,72),t,'메뉴',(-170,150))
        elif t<1.15:
            p=smallcard(canvas,'팹 메뉴',['상점 · 옷장','내 캐릭터 · 구글 연동'],0,y=420);marker(canvas,p[0],t,'여기!',(-200,200))
        else:
            im=shop_crop('clothes' if t<2.65 else 'items');im=im.resize((790,round(im.height*790/im.width)),Image.Resampling.LANCZOS)
            canvas.alpha_composite(im,(145,400));badge(canvas,'입어보고 구매 → 착용' if t<2.65 else '쿠폰은 아이템 탭',y=1490)
            marker(canvas,(873,704) if t>=2.65 else (290,780),t,None)
    elif id=='bay':
        if t<1.25:
            p=smallcard(canvas,'베이 뿌시기 · 시작 예고',['5번 BAY로 가기'],0,y=1040);marker(canvas,p[0],t,'이벤트 이동 버튼',(-160,-180))
        else:badge(canvas,'60초 · 장비 20대 전부!',y=290)
        if t>3.1:reward(canvas,'성공 +200칩')
    elif id=='gold':
        if t<1.5:marker(canvas,(478,1090),t,'황금 풉 터치',(170,-150))
        elif t>2.2:marker(canvas,project(TARGETS['in'],shot),t,'입구 스토커 IN',(180,-170))
        if t>3.3:reward(canvas,'+200칩')
    elif id=='contest':
        if t<1:
            p=smallcard(canvas,'흑백 풉 쟁탈전 모집',['참여하기'],0,y=1070);marker(canvas,p[0],t,'먼저 참여!',(-180,-180))
        else:
            badge(canvas,'내 방진복 색 원에 던져!',y=290)
            if t<3.15:marker(canvas,(905,1504),t,'던져 넣어도 OK',(-170,-170))
            else:badge(canvas,'상대 풉도 뺏을 수 있어요',y=1080)
    elif id=='photo':
        if t<.8:marker(canvas,(902,72),t,'카메라',(-180,170))
        else:badge(canvas,'휴대폰 캡처 버튼으로 찰칵',y=1420)
    elif id=='menu':
        if t<.5:marker(canvas,(1000,72),t,'메뉴',(-150,170))
        else:
            p=smallcard(canvas,'팹 메뉴',['팹 지도','전체 보기','자동 산책','조작 방법'],min(3,int((t-.5)*2)),y=430)
            badge(canvas,'효과음 · 공조음은 맨 위에서',y=1330)
    elif id=='google':
        if t<1.2:
            p=smallcard(canvas,'팹 메뉴',['상점 · 옷장','내 캐릭터 · 구글 연동'],1,y=480);marker(canvas,p[1],t,'이 캐릭터 연결',(-170,190))
        else:
            p=smallcard(canvas,'내 캐릭터 · 구글 연동',['현재 캐릭터를 구글로 연결','구글로 로그인하기','현재 캐릭터 인증하기'],0,y=500)
            marker(canvas,p[0],t,'처음 연결할 땐 1번',(-140,350));badge(canvas,'연결 성공 · 최초 1회 +1,000칩',y=1220)
    elif id=='end':
        layer=Image.new('RGBA',(W,H),(6,31,40,80));ld=ImageDraw.Draw(layer)
        roundbox(ld,(85,1050,995,1390),NAVY,35);text(ld,(540,1135),'누구나 PC · 모바일로',48,WHITE);text(ld,(540,1240),'fab.semitoon.com',67,MINT,width=855)
        canvas.alpha_composite(layer)

def badge(canvas,label,y=1100):
    d=ImageDraw.Draw(canvas);roundbox(d,(85,y,995,y+95),(15,53,62,237),25);text(d,(540,y+48),label,44,MINT,width=870)
def reward(canvas,label):
    d=ImageDraw.Draw(canvas);roundbox(d,(300,680,940,810),MINT,32);text(d,(620,744),label,66,NAVY,width=590)

def compose_frame(s,t,preview=False):
    g,c,f,m=source(s,t);path=GROUPS[g]/'frames'/c/f'{f:04d}.png'
    if preview and not path.exists():
        variants=sorted((GROUPS[g]/'previews').glob(c+'-*.png'));assert variants,(c,'no preview');path=min(variants,key=lambda p:abs(int(p.stem.rsplit('-',1)[1])-f))
    im=Image.open(path).convert('RGB');im=ImageEnhance.Contrast(im).enhance(1.06);im=ImageEnhance.Color(im).enhance(1.18)
    if im.size!=(W,H):im=im.resize((W,H),Image.Resampling.LANCZOS)
    canvas=im.convert('RGBA');hud(canvas,s,t)
    if s['id']=='contest' and t>1 and t<3.15:button(ImageDraw.Draw(canvas),(758,1452,1053,1557),'던지기 ↗',True,34)
    annotate(canvas,s,t,g,c,f,m)
    # Thin edge frame separates educational titles from the source game viewport.
    out=Image.new('RGB',(W,H),DARK);d=ImageDraw.Draw(out)
    for x in range(-900,1600,145):d.line((x+int(t*15)%145,0,x+900,1920),fill='#123b45',width=2)
    view=canvas.convert('RGB').resize((912,1621),Image.Resampling.LANCZOS)
    out.paste(view,(84,250));d=ImageDraw.Draw(out)
    roundbox(d,(82,248,998,1873),None,25,'#75a3a5',3)
    text(d,(84,49),'팹뿌 · 90초 조작법',30,MINT,anchor='lm');text(d,(996,49),f'{s["number"]:02d} / 27',28,'#a8c9cb',anchor='rm')
    text(d,(540,119),s['title'],61,WHITE,width=960)
    # A maximum of two short caption lines; no dense paragraphs over controls.
    words=s['detail'].split(' ');lines=['']
    for word in words:
        candidate=(lines[-1]+' '+word).strip()
        if font(33).getlength(candidate)>960 and lines[-1]:lines.append(word)
        else:lines[-1]=candidate
    for i,line in enumerate(lines[:2]):text(d,(540,181+i*38),line,33,'#d9edeb',width=970)
    d.rectangle((84,237,996,241),fill='#325560');d.rectangle((84,237,84+912*(s['start']+t)/90,241),fill=MINT)
    text(d,(540,1898),'fab.semitoon.com',32,WHITE)
    return out

def make_previews():
    folder=OUT/'qa';folder.mkdir(exist_ok=True)
    selected=[]
    for s in SCENES:
        t=min(s['duration']-.1,.95 if s['id'] in ('emo','repair','cartpull','cartload') else s['duration']*.55)
        p=folder/(s['id']+'.jpg');compose_frame(s,t,True).save(p,quality=92);selected.append(p)
    for part in range(3):
        sheet=Image.new('RGB',(1080,1920),DARK)
        for n,path in enumerate(selected[part*9:part*9+9]):
            im=Image.open(path).resize((360,640));sheet.paste(im,((n%3)*360,(n//3)*640))
        sheet.save(folder/f'contact-{part+1}.jpg',quality=92)
    print('PREVIEWS_READY',flush=True)

def audio():
    rate=48000;length=rate*90;mix=np.zeros((length,2),dtype=np.float32);rng=np.random.default_rng(20261112)
    voice=np.zeros(length,dtype=np.float32);report=[]
    for s in SCENES:
        with wave.open(str(OUT/'voice'/f'{s["id"]}.wav')) as w:
            sr=w.getframerate();a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768
        nonzero=np.flatnonzero(np.abs(a)>.004);a=a[max(0,nonzero[0]-int(.035*sr)):min(len(a),nonzero[-1]+int(.07*sr))]
        speed=max(1,len(a)/sr/(s['duration']-.20));speed=min(1.35,speed)
        raw=subprocess.run([FF,'-v','error','-f','f32le','-ar',str(sr),'-ac','1','-i','pipe:0','-af',f'atempo={speed},aresample=48000','-f','f32le','-ac','1','pipe:1'],input=a.astype('<f4').tobytes(),capture_output=True,check=True).stdout
        a=np.frombuffer(raw,dtype='<f4').copy();a*=.69/max(.05,float(np.max(np.abs(a))))
        begin=round((s['start']+.08)*rate);assert begin+len(a)<round((s['start']+s['duration'])*rate)+960,(s['id'],len(a)/rate)
        voice[begin:begin+len(a)]+=a;report.append({'id':s['id'],'spokenSeconds':round(len(a)/rate,3),'speedAfterSilenceTrim':round(speed,3),'slotSeconds':s['duration']})
    def add(a,t,gain=1,pan=0):
        start=round(t*rate);end=min(length,start+len(a));ang=(pan+1)*math.pi/4
        if end>start:mix[start:end,0]+=a[:end-start]*gain*math.cos(ang);mix[start:end,1]+=a[:end-start]*gain*math.sin(ang)
    beat=.4
    for n in range(225):
        t=np.arange(round(.25*rate))/rate;root=[38,34,41,36][(n//8)%4]
        kick=np.sin(2*np.pi*(48*t+52*.02*(1-np.exp(-t/.02))))*np.exp(-22*t);add(kick,n*beat,.08)
        bass=np.sin(2*np.pi*440*2**((root-69)/12)*t)*np.exp(-12*t);add(bass,n*beat,.052,-.2)
        if n%2:add(rng.normal(0,.4,len(t))*np.exp(-42*t),n*beat,.035,.2)
        for k in range(2):
            note=[74,77,81,77][(n+k)%4];tone=np.sin(2*np.pi*440*2**((note-69)/12)*t)*np.exp(-20*t)
            add(tone,n*beat+k*.2,.025,.45 if k else -.45)
    for s in SCENES:
        t=np.arange(round(.10*rate))/rate;click=np.sin(2*np.pi*1450*t)*np.exp(-65*t);add(click,s['start']+.35,.09)
        if s['id'] in ('emo','bay'):
            a=np.fromfile(OLD/'explosion.f32',dtype=np.float32);add(a,s['start']+(2.1 if s['id']=='emo' else 1.3),.20)
        if s['id']=='throw':add(np.fromfile(OLD/'shatter.f32',dtype=np.float32),s['start']+1.7,.21)
        if s['id']=='clean':add(np.fromfile(OLD/'sweep.f32',dtype=np.float32),s['start']+1,.15)
        if s['id'] in ('repair','gold','google'):add(np.fromfile(OLD/'chip.f32',dtype=np.float32),s['start']+s['duration']-.45,.10)
    # The original instrumental and effects stay well below intelligible speech.
    mix+=voice[:,None]*.97;mix*=np.minimum(1,(90-np.arange(length)/rate)/.3)[:,None]
    peak=float(np.max(np.abs(mix)));mix*=.87/max(.87,peak)
    with wave.open(str(OUT/'tutorial-audio.wav'),'wb') as w:w.setparams((2,2,rate,0,'NONE','not compressed'));w.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
    (OUT/'audio-report.json').write_text(json.dumps({'duration':90,'voice':'Microsoft Heami Desktop, local synthesis','originalMusicBpm':150,'peakDbFS':20*math.log10(float(np.max(np.abs(mix)))),'segments':report},ensure_ascii=False,indent=2),encoding='utf-8')
    def stamp(t):
        ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (OUT/'FAB-controls-90s.ko.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(s["start"])} --> {stamp(s["start"]+s["duration"])}\n{s["speech"]}' for i,s in enumerate(SCENES))+'\n',encoding='utf-8')
    print('AUDIO_READY',flush=True)

def compose():
    target=OUT/'FAB-controls-90s.mp4'
    cmd=[FF,'-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','pipe:0','-i',str(OUT/'tutorial-audio.wav'),'-c:v','libx264','-preset','fast','-crf','19','-maxrate','7M','-bufsize','14M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-movflags','+faststart','-t','90',str(target)]
    with (OUT/'encode.log').open('w',encoding='utf-8') as log:
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for s in SCENES:
                print('ENCODING',s['number'],s['id'],flush=True)
                for f in range(round(s['duration']*FPS)):process.stdin.write(compose_frame(s,f/FPS).tobytes())
        finally:process.stdin.close()
        assert process.wait()==0,'Encoding failed; see encode.log'
    print('TUTORIAL_READY',target,flush=True)

if __name__=='__main__':
    if '--audio' in sys.argv:audio()
    elif '--preview' in sys.argv:make_previews()
    elif '--compose' in sys.argv:compose()
    else:audio();make_previews();compose()
