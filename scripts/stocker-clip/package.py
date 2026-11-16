import argparse,hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/stocker-clip-20261116'
p=argparse.ArgumentParser();p.add_argument('site');a=p.parse_args();site=Path(a.site).resolve()
manifest=json.loads((site/'.openai/hosting.json').read_text())
assert manifest['project_id']=='appgprj_6ae87980eb548191ad253c10ebff1f43'
dist=site/manifest['static']['directory'];report=json.loads((OUT/'verification.json').read_text(encoding='utf-8'))
assert report['visualReviewComplete'] and report['decodedFrames']==450 and report['clippedSamples']==0
before={n:hashlib.sha256((dist/n).read_bytes()).hexdigest() for n in ['FAB-controls-92s-native.mp4','FAB-controls-90s.mp4','FAB-update-30s.mp4','FAB-promo-58s-v1.mp4']}
movie=OUT/report['file'];assert hashlib.sha256(movie.read_bytes()).hexdigest()==report['sha256']
shutil.copy2(movie,dist/movie.name);shutil.copy2(OUT/'poster.jpg',dist/'stocker-poster.jpg')
page=(ROOT/'scripts/stocker-clip/review.html').read_text(encoding='utf-8').replace('{{HASH}}',report['sha256'][:12])
(dist/'stocker.html').write_text(page,encoding='utf-8')
index=(dist/'index.html').read_text(encoding='utf-8')
if 'href="stocker.html"' not in index:index=index.replace('</main>','<p class="archive"><a href="stocker.html">스토커 풉 출고 · 음악 크게 · 15초 →</a></p>\n</main>')
(dist/'index.html').write_text(index,encoding='utf-8')
assert all(hashlib.sha256((dist/n).read_bytes()).hexdigest()==h for n,h in before.items())
assert hashlib.sha256((dist/movie.name).read_bytes()).hexdigest()==report['sha256']
print(json.dumps({'page':'stocker.html','mediaSha256':report['sha256'],'preservedPreviousMovies':list(before)},ensure_ascii=False))
