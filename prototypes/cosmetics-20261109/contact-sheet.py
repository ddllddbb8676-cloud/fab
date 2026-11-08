import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]/'outputs/cosmetics-20261109'
dist=ROOT/'site/dist'
(dist/'thumbs').mkdir(parents=True,exist_ok=True)
items=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))['items']
font=lambda size: ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',size)
cellw,cellh=330,452
sheet=Image.new('RGB',(cellw*5,cellh*6+144),'#f1f2e9')
d=ImageDraw.Draw(sheet)
d.text((25,20),'FAB뿌  /  신규 아이템 30종',font=font(40),fill='#203d36')
d.text((28,82),'실제 3D 장착 시안 · 가격은 칩 기준 제안가 · 컨펌 후 상점 반영',font=font(21),fill='#6c7c6d')
for i,item in enumerate(items):
    code=str(item['number']).zfill(2)
    for variant,suffix in [('main',''),('alt','-alt')]:
        image=Image.open(ROOT/'renders'/('item-'+code+'-'+variant+'.png')).convert('RGBA')
        image.save(dist/'thumbs'/(code+suffix+'.webp'),quality=92,method=6)
    x=(i%5)*cellw+15;y=(i//5)*cellh+144
    d.rounded_rectangle((x,y,x+300,y+365),radius=20,fill=item['background'])
    img=Image.open(dist/'thumbs'/(code+'.webp')).resize((300,375),Image.Resampling.LANCZOS)
    sheet.paste(img,(x,y-5),img)
    d.rounded_rectangle((x+10,y+10,x+56,y+43),radius=6,fill='#f7f8ef')
    d.text((x+20,y+12),code,font=font(20),fill='#233e35')
    title=item['name'];size=20
    while font(size).getlength(title)>300:size-=1
    d.text((x,y+376),title,font=font(size),fill='#233e35')
    d.text((x,y+410),format(item['price'],',')+'칩',font=font(18),fill='#65775f')
sheet.save(dist/'FAB-items-30.jpg',quality=94)
sheet.resize((1100,1904)).save(ROOT/'contact-sheet-preview.jpg',quality=94)
print('THUMBNAILS_AND_SHEET_READY')
