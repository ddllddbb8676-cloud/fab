"""Native-UI revision timeline; retain the first edit for comparison."""
import hashlib,json
from story import SCENES, OUT

REVISION=OUT/'ui-revision'
NATIVE_TARGETS={
    'move':['#joystick-zone'],
    'look':['#world'],
    'emo':['#tool-card','#tool-emo'],
    'repair':['#tool-card','#tool-repair'],
    'throw':['#foup-throw','#foup-drop'],
    'cartpull':['.cart-quick','.cart-panel .cart-pull','.cart-leave'],
    'cartload':['.cart-panel .cart-slots [data-slot]'],
    'cartride':['.cart-quick','.cart-panel [data-level]','.cart-leave'],
    'oht':['#oht-dismount'],
    'emoji':['#emote-controls'],
    'speech':['#speech-quick-open','.speech-dialog #speech-input','.speech-dialog [type=submit]'],
    'rest':['#posture-sit','#posture-lie'],
    'safety':['#safety-panel','#safety-repairs','#safety-pass-use'],
    'shop':['#controls-toggle','#wardrobe-open'],
    'bay':['#world-event-card .event-bay button'],
    'gold':['#world-event-card .event-golden'],
    'photo':['#photo-toggle'],
    'menu':['#controls-toggle','#map-toggle','#overview','#tour'],
    'google':['#controls-toggle','#google-account-link']
}
SCENES_V2=[]
cursor=0
for original in SCENES:
    scene={k:v for k,v in original.items() if k!='speech'}
    if scene['id']=='throw':
        scene.update(duration=6,title='상대 쪽을 보고 던지기 ↗',
                     detail='걷거나 가만히 있는 상대에게 명중 → 😡 2초 헤롱헤롱',
                     group='hit',clip='throw-hit',a=0,b=6)
    if scene['id']=='intro':
        scene.update(title='팹뿌 조작법',detail='누를 곳부터 결과까지, 화면으로!')
    scene['start']=cursor
    scene['captureStatus']='pending-native-ui'
    scene['nativeTargets']=NATIVE_TARGETS.get(scene['id'],[])
    SCENES_V2.append(scene)
    cursor+=scene['duration']
DURATION=cursor
assert DURATION==92

def write_plan():
    REVISION.mkdir(parents=True,exist_ok=True)
    proof=REVISION/'verification.json'
    verification=json.loads(proof.read_text(encoding='utf-8')) if proof.exists() else {}
    movie=REVISION/verification.get('file','unverified.mp4')
    complete=bool(verification.get('visualReviewComplete') and movie.is_file() and
                  hashlib.sha256(movie.read_bytes()).hexdigest()==verification.get('sha256'))
    provenance=REVISION/'native/provenance.json'
    native=json.loads(provenance.read_text(encoding='utf-8')) if provenance.exists() else {}
    captured=bool(native.get('states')) and all((REVISION/'native'/f'{state}-{matte}.jpg').exists()
                 for state in native.get('states',[]) for matte in ('black','white'))
    scenes=[{**s,'captureStatus':'native-ui-captured' if captured else 'pending-native-ui'} for s in SCENES_V2]
    plan=dict(duration=DURATION,fps=30,narration=False,scenes=scenes,
              ui='Use original game DOM/CSS and actual button positions. No drawn replacement buttons.',
              overlays='Only click rings, brief arrows and short captions; never obscure the clicked native control.',
              hitEligibility='On foot, standing/walking, outside rest zones; working, cart/OHT riding and caught states excluded.',
              oht='Keep verified controller sequence: click, approach, climb, jump, hang/travel, dismount, land.',
              status='verified final media' if complete else 'native UI captured; final media verification pending' if captured else 'native UI capture pending',
              finalVideoComplete=complete)
    (REVISION/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    return plan

if __name__=='__main__':
    plan=write_plan()
    print(f'{len(SCENES_V2)} scenes, {DURATION} seconds, no narration. {plan["status"]}.')
