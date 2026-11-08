// Review candidates only. This catalog is not imported by the game or server.
export const candidates = [
  [1,'suit-prism','프리즘 무지개 방진복','suit',12000,'후드부터 바지까지, 일곱 색이 이어지는 무지개.','rainbow','#e5ddff','SIGNATURE'],
  [2,'suit-aurora','오로라 방진복','suit',9000,'짙은 밤색 바탕에 민트와 보라 오로라가 흐르는 패턴.','aurora','#d4f1ed',''],
  [3,'suit-blacklight','블랙라이트 방진복','suit',8500,'차콜 바탕을 가르는 민트·핑크 네온 라인.','blacklight','#dddffa',''],
  [4,'suit-duotone','반반 네온 방진복','suit',4800,'왼쪽은 사이언, 오른쪽은 핫핑크. 한눈에 보이는 반반.','split','#ffe0ed',''],
  [5,'suit-stardust','별가루 방진복','suit',6500,'네이비 방진복 위에 촘촘히 뿌린 작은 별빛.','stardust','#dbe3f8',''],
  [6,'suit-checker','레트로 체커 방진복','suit',3200,'크림색과 딥그린 체크로 채운 레이싱 무드.','checker','#e4ebd6',''],
  [7,'suit-magma','마그마 방진복','suit',7800,'검은 바탕 사이로 붉은 주황빛이 갈라지는 패턴.','magma','#ffdfce',''],
  [8,'suit-holosilver','홀로 실버 방진복','suit',9500,'은색 바탕에 핑크·민트 사선이 반짝이는 메탈 룩.','silver','#dbe9ef',''],
  [9,'head-wafer-ring','웨이퍼 링','head',2400,'머리 위를 기울어져 감싸는 보라색 웨이퍼 링.','wafer','#e5dff6','FAB PICK'],
  [10,'head-ufo','UFO 미니 관제탑','head',3600,'동그란 비행접시와 작은 안테나. 은근하게 둥실.','ufo','#d8eeea',''],
  [11,'head-thunder','플라즈마 번개뿔','head',2200,'핑크와 민트, 양쪽으로 솟은 번개 두 개.','thunder','#eadffd',''],
  [12,'head-rainbow-cloud','구름 위 무지개','head',2800,'양쪽 구름에서 피어오른 입체 무지개 아치.','cloudbow','#e0f0f5',''],
  [13,'head-dino','다이노 크레스트','head',1600,'후드 뒤쪽을 따라 이어지는 라임색 공룡 돌기.','dino','#e5efd5',''],
  [14,'head-mini-oht','미니 OHT 왕관','head',4200,'머리 위 작은 레일에서 OHT가 천천히 왕복.','oht','#e0e8ee','FAB PICK'],
  [15,'head-propeller','빙글 프로펠러','head',900,'알록달록한 날개가 천천히 도는 작은 프로펠러.','propeller','#fff0cf',''],
  [16,'head-pixel-ghost','픽셀 고스트','head',1800,'머리 위에 살짝 떠 있는 사각사각 유령.','ghost','#e5dff5',''],
  [17,'face-pixel','픽셀 딜러 선글라스','face',1400,'검은 픽셀 렌즈와 하얀 반사점. 표정은 시크하게.','pixel','#e2e9dd',''],
  [18,'face-cyber','사이버 단안경','face',2100,'한쪽 눈에 민트 렌즈와 작게 켜진 상태 표시등.','cyber','#d5eeef',''],
  [19,'face-lightning','번개 안경','face',1800,'노랑과 핑크 번개가 양쪽 눈을 감싸는 프레임.','lightning','#ffead5',''],
  [20,'face-saturn','토성 고글','face',2600,'둥근 렌즈마다 궤도 링이 한 겹씩.','saturn','#e1ddf6',''],
  [21,'face-stars','반짝 별테 안경','face',1500,'속이 뚫린 금빛 별 프레임, 눈은 그대로 보여요.','stars','#fff0cd',''],
  [22,'face-x','네온 X 고글','face',2300,'어두운 고글 위에 선명한 사이언 X 두 개.','x','#e4e0f7',''],
  [23,'bag-stocker','미니 스토커 가방','bag',4400,'IN·OUT 포트와 황금 풉까지, 등에 메는 작은 STK.','stocker','#d9e9e7','FAB PICK'],
  [24,'bag-golden-foup','황금 풉 백팩','bag',5000,'손잡이와 옆 리브까지 살린 반짝 금색 풉 가방.','foup','#fff0d0',''],
  [25,'bag-rockets','쌍둥이 로켓 가방','bag',4800,'두 개의 작은 로켓과 짧은 불꽃 장식. 비행은 안 해요.','rockets','#e1e7fa',''],
  [26,'bag-prism-wings','프리즘 나비 날개','bag',6200,'민트·분홍·보라 조각으로 만든 가벼운 입체 날개.','wings','#eadef7',''],
  [27,'bag-blackhole','블랙홀 가방','bag',7200,'검은 중심과 기울어진 주황빛 고리. 살짝 회전해요.','blackhole','#eadfd7',''],
  [28,'bag-pixel-heart','픽셀 하트 가방','bag',2000,'두툼한 빨간 픽셀 하트와 핑크색 하이라이트.','heart','#f9dfe5',''],
  [29,'bag-emo','뿌시기 비상버튼 가방','bag',3300,'노랑 베이스 위 커다란 빨간 EMO. 누르고 싶은 뒤태.','emo','#f6e6c9','FAB PICK'],
  [30,'bag-rainbow-roll','무지개 롤백팩','bag',3800,'캔디처럼 둥근 몸통을 감싸는 무지개 띠.','roll','#e8e3f5','']
].map(([number,id,name,slot,price,description,design,background,badge]) =>
  Object.freeze({number,id,name,slot,price,description,design,background,badge,status:'proposal'}));
export const slotLabels = {suit:'방진복',head:'머리',face:'안경·고글',bag:'가방'};
export const findCandidate = id => candidates.find(item => item.id === id);
