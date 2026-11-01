export const VISITOR_ADJECTIVES = ['느긋한', '반짝이는', '씩씩한', '졸린', '부지런한', '차분한', '신나는', '포근한', '꼼꼼한', '용감한', '말랑한', '든든한', '해맑은', '즐거운', '다정한', '똑똑한', '큰', '흰', '새', '작은', '고운', '밝은'];
export const VISITOR_NOUNS = ['웨이퍼', '트랜지스터', '포토팀', '식각팀', '증착팀', '세정팀', 'CMP팀', '소터', 'FOUP', 'OHT', '마스크', '포토레지스트', '실리콘', '칩', '게이트', '비트라인', '워드라인', '캐패시터', '공정팀', '계측팀', '확산팀', '이온주입팀', '메탈팀', '클린룸', '엔지니어', '다이', 'DRAM', 'NAND'];

export const VISITOR_NAMES = VISITOR_ADJECTIVES.flatMap(adjective => VISITOR_NOUNS.map(noun => `${adjective} ${noun}`)).filter(name => [...name].length <= 7);
export function createVisitorName(random = Math.random, excluded = []) {
  const available = VISITOR_NAMES.filter(name => !excluded.includes(name));
  const pool = available.length ? available : VISITOR_NAMES;
  const n = random(); return pool[Math.floor(Math.max(0, Math.min(.999999, Number.isFinite(n) ? n : 0)) * pool.length)];
}

export function createVisitorBadge(THREE, scene, name, { resident = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: resident, depthWrite: false });
  const sprite = new THREE.Sprite(material); sprite.name = 'visitor-nickname'; sprite.renderOrder = 20; sprite.scale.set(1.18, .22125, 1); scene.add(sprite);
  function rename(next) {
    name = next; context.clearRect(0, 0, 512, 96);
    context.fillStyle = '#f6fbf5ed'; context.beginPath(); context.roundRect(5, 6, 502, 84, 42); context.fill();
    context.fillStyle = '#366b70'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '600 32px "Noto Sans KR", sans-serif';
    context.fillText(name, 256, 49, 464); texture.needsUpdate = true;
  }
  rename(name);
  return { rename, sprite,
    update(avatar, posture) {
      sprite.visible = avatar.root.visible;
      const height = posture === 'lie' ? .67 : posture === 'sit' ? 1.21 : 1.68;
      sprite.position.set(avatar.root.position.x, Math.min(4.8, avatar.root.position.y + height), avatar.root.position.z);
    },
    get name() { return name; },
    dispose() { sprite.removeFromParent(); material.dispose(); texture.dispose(); }
  };
}
