// Approved 2026-11-09: only these 19 numbered review candidates are released.
export const collectionItems = Object.freeze([
  {
    "id": "suit-prism",
    "name": "프리즘 무지개 방진복",
    "slot": "suit",
    "price": 12000,
    "design": "rainbow",
    "reviewNumber": 1
  },
  {
    "id": "suit-aurora",
    "name": "오로라 방진복",
    "slot": "suit",
    "price": 9000,
    "design": "aurora",
    "reviewNumber": 2
  },
  {
    "id": "suit-duotone",
    "name": "반반 네온 방진복",
    "slot": "suit",
    "price": 4800,
    "design": "split",
    "reviewNumber": 4
  },
  {
    "id": "suit-checker",
    "name": "레트로 체커 방진복",
    "slot": "suit",
    "price": 3200,
    "design": "checker",
    "reviewNumber": 6
  },
  {
    "id": "suit-magma",
    "name": "마그마 방진복",
    "slot": "suit",
    "price": 7800,
    "design": "magma",
    "reviewNumber": 7
  },
  {
    "id": "suit-holosilver",
    "name": "홀로 실버 방진복",
    "slot": "suit",
    "price": 9500,
    "design": "silver",
    "reviewNumber": 8
  },
  {
    "id": "head-ufo",
    "name": "UFO 미니 관제탑",
    "slot": "head",
    "price": 3600,
    "design": "ufo",
    "reviewNumber": 10
  },
  {
    "id": "head-thunder",
    "name": "플라즈마 번개뿔",
    "slot": "head",
    "price": 2200,
    "design": "thunder",
    "reviewNumber": 11
  },
  {
    "id": "head-dino",
    "name": "다이노 크레스트",
    "slot": "head",
    "price": 1600,
    "design": "dino",
    "reviewNumber": 13
  },
  {
    "id": "head-propeller",
    "name": "빙글 프로펠러",
    "slot": "head",
    "price": 900,
    "design": "propeller",
    "reviewNumber": 15
  },
  {
    "id": "face-pixel",
    "name": "픽셀 딜러 선글라스",
    "slot": "face",
    "price": 1400,
    "design": "pixel",
    "reviewNumber": 17
  },
  {
    "id": "face-saturn",
    "name": "토성 고글",
    "slot": "face",
    "price": 2600,
    "design": "saturn",
    "reviewNumber": 20
  },
  {
    "id": "face-stars",
    "name": "반짝 별테 안경",
    "slot": "face",
    "price": 1500,
    "design": "stars",
    "reviewNumber": 21
  },
  {
    "id": "face-x",
    "name": "네온 X 고글",
    "slot": "face",
    "price": 2300,
    "design": "x",
    "reviewNumber": 22
  },
  {
    "id": "bag-golden-foup",
    "name": "황금 풉 백팩",
    "slot": "bag",
    "price": 5000,
    "design": "foup",
    "reviewNumber": 24
  },
  {
    "id": "bag-rockets",
    "name": "쌍둥이 로켓 가방",
    "slot": "bag",
    "price": 4800,
    "design": "rockets",
    "reviewNumber": 25
  },
  {
    "id": "bag-prism-wings",
    "name": "프리즘 나비 날개",
    "slot": "bag",
    "price": 6200,
    "design": "wings",
    "reviewNumber": 26
  },
  {
    "id": "bag-emo",
    "name": "뿌시기 비상버튼 가방",
    "slot": "bag",
    "price": 3300,
    "design": "emo",
    "reviewNumber": 29
  },
  {
    "id": "bag-rainbow-roll",
    "name": "무지개 롤백팩",
    "slot": "bag",
    "price": 3800,
    "design": "roll",
    "reviewNumber": 30
  }
].map(Object.freeze));
const byId=new Map(collectionItems.map(item=>[item.id,item]));
export const getCollectionItem=id=>byId.get(id);
export const collectionSuitColors=Object.freeze({"suit-prism":"#7ac7ba","suit-aurora":"#758acd","suit-duotone":"#e575b6","suit-checker":"#73a48b","suit-magma":"#e67439","suit-holosilver":"#c7d5e1"});
export const isPatternedSuit=id=>getCollectionItem(id)?.slot==='suit';
