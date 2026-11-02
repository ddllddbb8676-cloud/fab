// A transparent, camera-facing name that clears the visible head and headwear.
export function createAvatarNameplate(THREE, scene, name, { resident = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: resident, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material); sprite.name = 'visitor-nickname'; sprite.renderOrder = 20;
  sprite.scale.set(.96, .18, 1); scene.add(sprite);
  const bounds = new THREE.Box3(), extraBounds = new THREE.Box3(), center = new THREE.Vector3();
  function rename(next) {
    name = next; context.clearRect(0, 0, 512, 96);
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = '600 48px "Noto Sans KR", system-ui, sans-serif';
    context.lineJoin = 'round'; context.lineWidth = 5; context.strokeStyle = '#f4fbf8';
    context.strokeText(name, 256, 48, 480);
    context.fillStyle = '#204e55'; context.fillText(name, 256, 48, 480);
    texture.needsUpdate = true;
  }
  rename(name);
  return { rename, sprite,
    update(avatar, posture, { headwear = [] } = {}) {
      sprite.visible = avatar.root.visible;
      const hood = avatar.root.getObjectByName('hood');
      if (hood) {
        hood.updateWorldMatrix(true, false); bounds.setFromObject(hood); bounds.getCenter(center);
        for (const item of headwear) if (item?.visible) { item.updateWorldMatrix(true, true); extraBounds.setFromObject(item); bounds.union(extraBounds); }
        sprite.position.set(center.x, Math.min(4.8, bounds.max.y + .16), center.z);
      } else sprite.position.set(avatar.root.position.x, avatar.root.position.y + (posture === 'lie' ? .67 : posture === 'sit' ? 1.21 : 1.68), avatar.root.position.z);
    },
    get name() { return name; },
    dispose() { sprite.removeFromParent(); material.dispose(); texture.dispose(); }
  };
}
