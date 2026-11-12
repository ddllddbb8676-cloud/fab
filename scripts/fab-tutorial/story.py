"""Source of truth for the 90 second, Korean, mobile-first tutorial."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/tutorial-20261112'
OLD=ROOT/'outputs/fab-promo-2026-11-02'
UPDATE=ROOT/'outputs/fab-promo-2026-11-09'
NEW=OUT/'new-shots'

# id, seconds, headline, short practical instruction, exact narration, footage
ROWS=[
('intro',1.5,'팹뿌 90초 조작법','어디를 눌러야 할까?','팹뿌, 이렇게!','update','01-hook',0,1.6),
('move',3.5,'이동은 왼손','조이스틱 밀기 → 이동 / 떼기 → 정지','왼쪽 조이스틱을 밀면 이동, 떼면 정지!','new','move',0,3.5),
('look',2.5,'시점은 오른손','빈 화면 드래그 · 두 손가락으로 거리 조절','빈 화면 드래그로 시점 변경!','new','look',0,2.5),
('emo',4,'빨간 버튼 → EMO 누르기','선택창에서 한 번 더! 작동할 때까지 기다려요','빨간 버튼을 누르고, 이엠오 누르기!','old','01-emo',0,4),
('repair',3.5,'부서진 장비 → 수리하기','선택창의 ‘이 장비 수리하기’ · 완료 +3칩','부서진 장비를 누르고, 이 장비 수리하기!','old','04-repair',0,4),
('pickup',3.5,'장비 앞 상자가 풉!','풉 터치 → 집기 / 빈 로드포트 터치 → 놓기','상자를 누르면 집고, 빈 받침엔 내려놔요.','new','pickup',0,3.5),
('throw',4,'들었으면 던지기 ↗','조심히 놓고 싶다면 ‘바닥에 놓기’','든 풉은 던지기! 그냥 놓을 땐 바닥에 놓기.','old','05-foup',0,5),
('clean',3,'깨진 잔해도 터치','가서 빗자루로 청소 · 완료 +2칩','깨진 잔해를 누르면 청소, 이 칩!','old','06-clean',0,4.2),
('out',3.5,'풉 꺼내기 = OUT','에어샤워 앞 스토커 · 나오면 풉을 한 번 더!','입구 스토커 아웃! 나온 풉을 다시 눌러 집어요.','update','07-stocker-out',0,2),
('in',3.5,'풉 넣기 = IN','풉을 든 채 IN 터치 · IN / OUT은 서로 다른 포트','든 풉은 인을 눌러 넣어요. 아웃과 반대쪽!','update','06-stocker-in',0,2),
('cartpull',4,'카트 → 손잡이 잡기','가까이에서 열고 · 조이스틱으로 끌어요','가까이 가서 카트, 손잡이 잡기! 조이스틱으로 끌어요.','update','09-cart-ride',0,3.6),
('cartload',3,'카트에 풉 싣기','풉을 들고 카트 → 빈칸 ‘FOUP 싣기’ · 총 4개','풉을 들고 카트 메뉴의 싣기! 최대 네 개.','new','cartload',0,3),
('cartride',3.5,'친구 카트에 올라타!','가까이서 ‘카트 타기’ · 위아래 1명씩','친구가 끌 땐 카트 타기! 위아래 한 명씩.','update','08-cart-load',1.1,3.2),
('walkway',3,'무빙워크로 빠르게','이동 속도 2배 · 카트 OK · 옆으로 나가면 끝','무빙워크로 두 배 속도! 카트도 돼요.','new','walkway',0,3),
('oht',4,'천장 차량을 터치','빈 OHT에 점프! / ‘내리기 ↓’로 착지','천장 차량을 누르면 매달려요. 내리기로 착지!','old','07-oht',0,6),
('emoji',3,'감정표현은 아래쪽','이모지 터치 / 아래로 쓸어 다음 줄 · 9개씩','이모지는 눌러서! 아래로 쓸면 다음 아홉 개.','new','social',0,2.8),
('speech',3,'말풍선으로 한마디','오른쪽 아래 말풍선 → 최대 5글자 → 보내기','말풍선 버튼에서 다섯 글자 쓰고 보내기!','new','social',.2,2.7),
('rest',2,'앉기 · 눕기도 바로','오른쪽 아래 버튼에서 자세 선택','앉기, 눕기도 오른쪽 아래!','new','social',2.8,5),
('safety',3.5,'안전팀에게 잡혔다면?','장비 3대 수리 / 보유 쿠폰 1장으로 해제','잡혔다면 세 대 수리, 아니면 쿠폰으로 해제!','old','03-chase',1,5.8),
('shop',4,'메뉴 → 상점 · 옷장','시착 → 구매 → 착용 / 쿠폰은 ‘아이템’ 탭','메뉴, 상점 옷장! 입어보고 구매, 쿠폰은 아이템 탭!','old','08-fashion',0,7.5),
('bay',4,'베이로 가기 → 20대 완파','1분 예고 후 60초 도전! / 한 베이 성공 +200칩','베이로 가기를 누르고, 육십 초 안에 장비 스무 대!','update','02-bay',0,4),
('gold',4,'황금 풉은 입구로!','10분 안에 에어샤워 앞 스토커 IN → +200칩','황금 풉은 입구 스토커 인에 넣으면 이백 칩!','update','05-golden',0,3.2),
('contest',4.5,'참여하기 → 우리 색 원','던져도 안 깨져요! 상대 원의 풉도 가져와요','참여하기! 내 방진복 색 원에 던지고, 상대 풉도 뺏어요!','update','03-contest',0,3.6),
('photo',2.5,'카메라 = 사진 모드','메뉴·조작키를 숨기고 휴대폰으로 직접 캡처','카메라로 조작키 숨기고, 직접 캡처!','new','social',.3,2.8),
('menu',2.5,'더 둘러보고 싶다면?','메뉴에 팹 지도 · 전체 보기 · 자동 산책','지도와 자동 산책도 메뉴에!','new','look',0,2.5),
('google',5,'내 캐릭터 · 구글 연동','첫 연동 +1,000칩 · 다른 브라우저에서도 같은 캐릭터','내 캐릭터 구글 연동! 첫 연결 천 칩, 다른 브라우저에서도 그대로!','new','social',.3,2.7),
('end',2,'세미툰 | 팹뿌','하고싶었던거 다하자 ㄱㄱㄱ!!','팹뿌에서 만나요!','new','social',.5,2.5),
]
SCENES=[]
cursor=0
for n,(id,duration,title,detail,speech,group,clip,a,b) in enumerate(ROWS):
    SCENES.append(dict(number=n+1,id=id,start=cursor,duration=duration,title=title,detail=detail,speech=speech,group=group,clip=clip,a=a,b=b))
    cursor+=duration
assert cursor==90, cursor
if __name__=='__main__':
    OUT.mkdir(exist_ok=True,parents=True)
    (OUT/'story.json').write_text(json.dumps({'duration':cursor,'fps':30,'scenes':SCENES},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(SCENES)} scenes, {cursor}s')
