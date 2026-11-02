export const items = [
  { id: 'helmet-white', name: '흰색 헬멧', slot: 'head', price: null },
  { id: 'helmet-orange', name: '주황 헬멧', slot: 'head', price: null },
  { id: 'sprout', name: '작은 새싹', slot: 'head', price: null },
  { id: 'crown', name: '작은 왕관', slot: 'head', price: null },
  { id: 'glasses', name: '안경', slot: 'face', price: null },
  { id: 'goggles', name: '보안경', slot: 'face', price: null },
  { id: 'sunglasses', name: '선글라스', slot: 'face', price: null },
  { id: 'bag-turtle', name: '거북이 등껍질', slot: 'bag', price: null },
  { id: 'bag-wings', name: '날개 가방', slot: 'bag', price: null },
  { id: 'bag-bear', name: '곰돌이 가방', slot: 'bag', price: null },
  { id: 'bag-basic', name: '일반 방진가방', slot: 'bag', price: null },
  { id: 'suit-default', name: '기본 방진복', slot: 'suit', price: 0 },
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
  'helmet-white': 150, 'helmet-orange': 150, sprout: 50, crown: 7000,
  glasses: 200, goggles: 400, sunglasses: 1200,
  'bag-turtle': 1800, 'bag-wings': 5000, 'bag-bear': 3000, 'bag-basic': 600,
  'suit-black': 10000, 'eyes-round': 100, 'eyes-smile': 150,
  'eyes-sparkle': 1500, 'eyes-squeeze': 300, 'eyes-angry': 400,
  'eyes-cry': 800, 'eyes-sideeye': 500, 'eyes-flat': 100, 'eyes-wink': 600
};
for (const item of items) if (item.price !== 0) item.price = PRICES[item.id];

export const DEFAULT_OUTFIT = Object.freeze({head:null,face:null,bag:null,suit:'suit-default',beauty:'eyes-default'});
export const findItem = id => items.find(item => item.id === id);
export const suitColor = outfit => outfit?.suit === 'suit-black' ? '#35434f' : '#ffffff';
