import {collectionItems,collectionSuitColors} from './collection-catalog.js?v=67abbb4d1e8e';
export const items = [
  { id: 'helmet-white', name: '흰색 헬멧', slot: 'head', price: null },
  { id: 'helmet-orange', name: '주황 헬멧', slot: 'head', price: null },
  { id: 'helmet-red', name: '빨강 헬멧', slot: 'head', price: null },
  { id: 'helmet-blue', name: '파랑 헬멧', slot: 'head', price: null },
  { id: 'sprout', name: '작은 새싹', slot: 'head', price: null },
  { id: 'crown', name: '작은 왕관', slot: 'head', price: null },
  { id: 'glasses', name: '안경', slot: 'face', price: null },
  { id: 'goggles', name: '보안경', slot: 'face', price: null },
  { id: 'sunglasses', name: '선글라스', slot: 'face', price: null },
  { id: 'bag-turtle', name: '거북이 등껍질', slot: 'bag', price: null },
  { id: 'bag-wings', name: '날개 가방', slot: 'bag', price: null },
  { id: 'bag-bear', name: '곰돌이 가방', slot: 'bag', price: null },
  { id: 'bag-basic', name: '일반 방진가방', slot: 'bag', price: null },
  { id: 'bunny-ears', name: '토끼귀', slot: 'head', price: null },
  { id: 'heart-glasses', name: '핫핑크 하트 안경', slot: 'face', price: null },
  { id: 'baby-chick', name: '머리 위 병아리', slot: 'head', price: null },
  { id: 'bag-star', name: '별 모양 방진가방', slot: 'bag', price: null },
  { id: 'cat-ears', name: '까만 고양이귀', slot: 'head', price: null },
  { id: 'puppy-ears', name: '축 처진 강아지귀', slot: 'head', price: null },
  { id: 'moon-cap', name: '졸린 달 모자', slot: 'head', price: null },
  { id: 'flower-glasses', name: '꽃테 안경', slot: 'face', price: null },
  { id: 'spiral-glasses', name: '뱅뱅 안경', slot: 'face', price: null },
  { id: 'bag-axolotl', name: '우파루파 가방', slot: 'bag', price: null },
  { id: 'bag-peach', name: '복숭아 가방', slot: 'bag', price: null },
  { id: 'bag-jellyfish', name: '해파리 가방', slot: 'bag', price: null },
  { id: 'bag-cloud', name: '몽실 구름 가방', slot: 'bag', price: null },
  { id: 'bag-gamepad', name: '게임패드 가방', slot: 'bag', price: null },
  { id: 'bag-whale', name: '아기 고래 가방', slot: 'bag', price: null },
  { id: 'suit-default', name: '기본 방진복', slot: 'suit', price: 0 },
  { id: 'suit-pink', name: '분홍 방진복', slot: 'suit', price: null },
  { id: 'suit-blue', name: '파랑 방진복', slot: 'suit', price: null },
  { id: 'suit-green', name: '초록 방진복', slot: 'suit', price: null },
  { id: 'suit-black', name: '검정 방진복', slot: 'suit', price: null, proposedPrice: 10000 },
  { id: 'eyes-default', name: '기본 눈', slot: 'beauty', price: 0 },
  { id: 'eyes-round', name: '큰 동그란 눈', slot: 'beauty', price: null },
  { id: 'eyes-smile', name: '반달 웃는 눈', slot: 'beauty', price: null },
  { id: 'eyes-sparkle', name: '초롱초롱 눈', slot: 'beauty', price: null },
  { id: 'eyes-squeeze', name: '>< 찡긋', slot: 'beauty', price: null },
  { id: 'eyes-angry', name: '화난 눈', slot: 'beauty', price: null },
  { id: 'eyes-cry', name: '우는 눈', slot: 'beauty', price: null },
  { id: 'eyes-sideeye', name: '째려보는 눈', slot: 'beauty', price: null },
  { id: 'eyes-flat', name: 'ㅡㅡ 무표정', slot: 'beauty', price: null },
  { id: 'eyes-wink', name: '윙크', slot: 'beauty', price: null }
];
const PRICES = {
  'helmet-white': 150, 'helmet-orange': 150, 'helmet-red': 200, 'helmet-blue': 200, sprout: 50, crown: 7000,
  glasses: 200, goggles: 400, sunglasses: 1200,
  'bag-turtle': 1800, 'bag-wings': 5000, 'bag-bear': 3000, 'bag-basic': 600,
  'suit-pink': 50, 'suit-blue': 50, 'suit-green': 50, 'suit-black': 10000, 'eyes-round': 100, 'eyes-smile': 150,
  'eyes-sparkle': 1500, 'eyes-squeeze': 300, 'eyes-angry': 400,
  'eyes-cry': 800, 'eyes-sideeye': 500, 'eyes-flat': 100, 'eyes-wink': 600,
  'bunny-ears':300,'heart-glasses':600,'baby-chick':900,'bag-star':2200,
  'cat-ears':300,'puppy-ears':400,'moon-cap':800,
  'flower-glasses':500,'spiral-glasses':700,
  'bag-axolotl':2800,'bag-peach':1200,'bag-jellyfish':4000,
  'bag-cloud':1600,'bag-gamepad':2400,'bag-whale':3400
};
for (const item of items) if (item.price !== 0) item.price = PRICES[item.id];
items.push(...collectionItems);

export const DEFAULT_OUTFIT = Object.freeze({head:null,face:null,bag:null,suit:'suit-default',beauty:'eyes-default'});
export const findItem = id => items.find(item => item.id === id);
const SUIT_COLORS = Object.freeze({
  'suit-pink': '#f6d1dc', 'suit-blue': '#9ecde3', 'suit-green': '#a7d5bd', 'suit-black': '#35434f'
});
export const suitColor = outfit => SUIT_COLORS[outfit?.suit] ?? collectionSuitColors[outfit?.suit] ?? '#ffffff';
