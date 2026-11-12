"""Replace only the 46–50 s OHT scene; preserve original timing and AAC audio."""
import json,shutil,subprocess
from pathlib import Path
from edit import compose_frame,FF,FPS
from story import OUT,SCENES

s=next(s for s in SCENES if s['id']=='oht');assert s['start']==46 and s['duration']==4
final=OUT/'FAB-controls-90s.mp4';base=OUT/'FAB-controls-90s-before-oht.mp4'
if not base.exists():
    shutil.copy2(final,base)
    shutil.copy2(OUT/'verification.json',OUT/'verification-before-oht.json')
replacement=OUT/'oht-replacement.mp4'
cmd=[FF,'-v','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p',str(replacement)]
with (OUT/'oht-replace.log').open('w',encoding='utf-8') as log:
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        for f in range(120):p.stdin.write(compose_frame(s,f/FPS).tobytes())
    finally:p.stdin.close()
    assert p.wait()==0
    print('OHT_SEGMENT_ENCODED',flush=True)
    changed=OUT/'FAB-controls-90s-updated.mp4'
    filters='[0:v]trim=end_frame=1380,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[0:v]trim=start_frame=1500:end_frame=2700,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]'
    subprocess.run([FF,'-v','warning','-y','-i',str(base),'-i',str(replacement),'-filter_complex',filters,'-map','[v]','-map','0:a','-r','30','-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','19','-maxrate','7M','-bufsize','14M','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart','-t','90',str(changed)],stderr=log,check=True)
    changed.replace(final)
print('OHT_REPLACED',final,flush=True)
