"""Re-export corrected native UI segments after a completed render.

Optional one-time edit accelerator. A normal edit-native.py --compose already
includes these fixes. Keeps the source movie and copies its AAC unchanged.
"""
import importlib.util,subprocess,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_edit',Path(__file__).with_name('edit-native.py'))
edit=importlib.util.module_from_spec(spec);spec.loader.exec_module(edit)
segments=sorted([next(s for s in edit.SCENES if s['id']==id) for id in ('out','cartload','walkway','oht','shop')],key=lambda s:s['start'])
only=next((arg.split('=',1)[1].split(',') for arg in sys.argv if arg.startswith('--only=')),None)
for s in segments:
    target=edit.REV/f'patch-{s["id"]}.mp4'
    if only and s['id'] not in only:
        assert target.exists(),target
        continue
    p=subprocess.Popen([edit.FF,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','15','-pix_fmt','yuv420p',str(target)],stdin=subprocess.PIPE)
    for f in range(round(s['duration']*30)):p.stdin.write(edit.compose_frame(s,f/30).tobytes())
    p.stdin.close();assert p.wait()==0
    print('PATCH_READY',s['id'],flush=True)
before=edit.REV/'FAB-controls-92s-before-state-fix.mp4'
target=edit.REV/'FAB-controls-92s-native.mp4'
if not before.exists():target.replace(before)
parts=[f'[0:v]split={len(segments)+1}'+''.join(f'[b{i}]' for i in range(len(segments)+1))]
cursor=0;names=[]
for i,s in enumerate(segments):
    parts.append(f'[b{i}]trim=start={cursor}:end={s["start"]},setpts=PTS-STARTPTS[v{i*2}]')
    parts.append(f'[{i+1}:v]setpts=PTS-STARTPTS[v{i*2+1}]')
    names.extend([f'[v{i*2}]',f'[v{i*2+1}]']);cursor=s['start']+s['duration']
parts.append(f'[b{len(segments)}]trim=start={cursor},setpts=PTS-STARTPTS[last]');names.append('[last]')
parts.append(''.join(names)+f'concat=n={len(names)}:v=1:a=0[v]')
cmd=[edit.FF,'-hide_banner','-loglevel','warning','-y','-i',str(before)]
for s in segments:cmd.extend(['-i',str(edit.REV/f'patch-{s["id"]}.mp4')])
cmd.extend(['-filter_complex',';'.join(parts),'-map','[v]','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','18','-maxrate','8M','-bufsize','16M','-r','30','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart','-t','92',str(target)])
with (edit.REV/'patch-native.log').open('w') as log:subprocess.run(cmd,stderr=log,check=True)
print('PATCHED_NATIVE_STATES',target,flush=True)
