"""Wait for this run's foreground render jobs, then edit and verify once."""
import json, time, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]/'outputs/fab-promo-2026-11-02'
SCRIPT=Path(__file__).parent
timeline=json.loads((ROOT/'timeline.json').read_text())
expected={c['id']:round(c['duration']*timeline['fps']) for c in timeline['clips']}
while True:
    counts={k:len(list((ROOT/'frames'/k).glob('*.png'))) for k in expected}
    logs=[(ROOT/f'render-{s}.log').read_text(errors='replace') for s in 'abcd']
    if any('Traceback (most recent call last)' in log for log in logs):raise RuntimeError('Render failed; inspect render logs')
    complete=all('FILM_RENDER_DONE' in log for log in logs)
    print(json.dumps({'frames':sum(counts.values()),'total':sum(expected.values()),'clips':counts,'rendersComplete':complete}),flush=True)
    if complete and counts==expected:break
    time.sleep(30)
subprocess.run([sys.executable,str(SCRIPT/'edit-film.py')],check=True)
subprocess.run([sys.executable,str(SCRIPT/'verify-film.py')],check=True)
print('FILM_READY_FOR_VISUAL_REVIEW',flush=True)
