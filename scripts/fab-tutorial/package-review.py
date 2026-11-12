"""Copy only verified deliverables into the existing owner-private review Site."""
import argparse,hashlib,html,json,re,shutil
from pathlib import Path
from story import ROOT,OUT,SCENES

parser=argparse.ArgumentParser();parser.add_argument('--site-directory',required=True);args=parser.parse_args()
site=Path(args.site_directory).resolve();manifest=json.loads((site/'.openai/hosting.json').read_text())
assert manifest['project_id']=='appgprj_6ae87980eb548191ad253c10ebff1f43'
dist=site/manifest['static']['directory'];assert (dist/'index.html').exists()
verification=json.loads((OUT/'verification.json').read_text(encoding='utf-8'))
assert verification['decodedFrames']==2700 and verification['visualReviewComplete']
movie=OUT/verification['file'];assert hashlib.sha256(movie.read_bytes()).hexdigest()==verification['sha256']
if not (dist/'2026-11-09.html').exists():
    old=(dist/'index.html').read_text(encoding='utf-8');assert 'FAB-update-30s.mp4' in old
    shutil.copy2(dist/'index.html',dist/'2026-11-09.html')
for name in [movie.name,'tutorial-poster.jpg','FAB-controls-90s.ko.srt']:shutil.copy2(OUT/name,dist/name)
sub=(OUT/'FAB-controls-90s.ko.srt').read_text(encoding='utf-8')
(dist/'FAB-controls-90s.ko.vtt').write_text('WEBVTT\n\n'+re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',sub),encoding='utf-8')
chapters='\n'.join(f'<button type="button" data-seek="{s["start"]}"><time>{int(s["start"])//60}:{int(s["start"])%60:02}</time><span>{html.escape(s["title"])}</span></button>' for s in SCENES[1:-1])
page=(ROOT/'scripts/fab-tutorial/review-page.html').read_text(encoding='utf-8').replace('{{CHAPTERS}}',chapters).replace('{{VIDEO_REVISION}}',verification['sha256'][:12])
(dist/'index.html').write_text(page,encoding='utf-8')
for path in re.findall(r'(?:src|href|poster)="([^"#]+)"',page):
    if not path.startswith(('https://','http://')):assert (dist/path.split('?')[0]).is_file(),path
assert page.count('data-seek=')==25
assert hashlib.sha256((dist/movie.name).read_bytes()).hexdigest()==verification['sha256']
print(json.dumps({'projectId':manifest['project_id'],'movieSha256':verification['sha256'],'chapterButtons':25,'preservedPreviousFilms':[(dist/n).exists() for n in ['FAB-update-30s.mp4','FAB-promo-58s-v1.mp4','2026-11-09.html','2026-11-02.html']]},indent=2))
