"""Review-site asset integrity and alternate-angle sheet; no game connection."""
import hashlib
import json
import re
from pathlib import Path
from html.parser import HTMLParser
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]/'outputs/cosmetics-20261109'
dist=ROOT/'site/dist'
catalog=json.loads((dist/'catalog.json').read_text(encoding='utf-8'))
assert len(catalog)==30
assert [i['number'] for i in catalog]==list(range(1,31))
refs=[]
ids=set()
class Inspector(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key=='id':
                assert value not in ids,value
                ids.add(value)
            if key in ('href','src','poster') and value and not value.startswith(('http:','https:','#')):
                refs.append(value)
Inspector().feed((dist/'index.html').read_text(encoding='utf-8'))
for ref in refs:assert (dist/ref).is_file(),ref
source=(Path(__file__).parent/'preview.js').read_text(encoding='utf-8')
for ref in re.findall(r"\$\('([^']+)'\)",source):assert ref in ids,ref
contact=Image.new('RGB',(1000,1500),'#e6eadf')
draw=ImageDraw.Draw(contact)
font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',16)
image_hashes={}
for index,item in enumerate(catalog):
    code=str(item['number']).zfill(2)
    for suffix in ('','-alt'):
        path=dist/'thumbs'/(code+suffix+'.webp')
        image=Image.open(path).convert('RGBA')
        assert image.size==(600,750)
        assert image.getbbox(),path
        image_hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    x=index%5*200;y=index//5*250
    image=Image.open(dist/'thumbs'/(code+'-alt.webp')).resize((200,250),Image.Resampling.LANCZOS).convert('RGBA')
    contact.paste(image,(x,y),image)
    draw.text((x+8,y+6),code,font=font,fill='#163a30')
contact.save(ROOT/'alternate-angles.jpg',quality=94)
report={'candidates':30,'images':60,'sourceModelTests':'31 passed',
        'pageAssetIntegrity':'All media, styles, scripts, links and static element IDs checked',
        'visualReview':'Primary angles reviewed; alternate sheet pending',
        'browserUI':'Unverified: local browser use disabled in Work settings',
        'physicalPhone':'Not tested','gameIntegration':'Not applied; awaiting item approval',
        'bundleBytes':(dist/'preview.js').stat().st_size,'assetHashes':image_hashes}
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='assetHashes'},ensure_ascii=False))
