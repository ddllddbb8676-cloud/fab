// A transparent, camera-facing name that clears the visible head and headwear.
export function createAvatarNameplate(THREE, scene, name, { resident = false, screenLabel = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: resident, depthWrite: false, toneMapped: false, fog: false });
  const sprite = new THREE.Sprite(material); sprite.name = 'visitor-nickname'; sprite.renderOrder = 20;
  sprite.scale.set(.96, .18, 1); scene.add(sprite);
  const bounds = new THREE.Box3(), extraBounds = new THREE.Box3(), center = new THREE.Vector3(), projected=new THREE.Vector3();
  const label=screenLabel?document.createElement('span'):null;let visible=false;
  if(label){label.className='visitor-nickname-label';label.hidden=true;label.setAttribute('aria-hidden','true');document.body.append(label);}
  function rename(next) {
    name = next; context.clearRect(0, 0, 512, 96);
    if(label)label.textContent=name;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = '700 48px "Noto Sans KR", system-ui, sans-serif';
    context.lineJoin = 'round'; context.lineWidth = 5; context.strokeStyle = '#f4fbf8';
    context.strokeText(name, 256, 48, 480);
    context.fillStyle = '#204e55'; context.fillText(name, 256, 48, 480);
    texture.needsUpdate = true;
  }
  rename(name);
  return { rename, sprite,
    update(avatar, posture, { headwear = [], camera = null, viewportHeight = globalThis.innerHeight||844 } = {}) {
      visible=avatar.root.visible;sprite.visible=visible&&!label;
      const hood = avatar.root.getObjectByName('hood');
      if (hood) {
        hood.updateWorldMatrix(true, false); bounds.setFromObject(hood); bounds.getCenter(center);
        for (const item of headwear) if (item?.visible) { item.updateWorldMatrix(true, true); extraBounds.setFromObject(item); bounds.union(extraBounds); }
        sprite.position.set(center.x, Math.min(4.8, bounds.max.y + .16), center.z);
      } else sprite.position.set(avatar.root.position.x, avatar.root.position.y + (posture === 'lie' ? .67 : posture === 'sit' ? 1.21 : 1.68), avatar.root.position.z);
      if(camera&&!label){
        camera.updateMatrixWorld();projected.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse);
        const perPixel=2*Math.tan(camera.fov*Math.PI/360)*Math.max(.1,-projected.z)/Math.max(1,viewportHeight);
        const height=Math.min(36*perPixel,Math.max(.18,28*perPixel));
        sprite.scale.set(height*512/96,height,1);sprite.position.y=Math.min(4.8,sprite.position.y+Math.max(0,(height-.18)/2));
      }
    },
    updateScreen(camera){
      if(!label)return;projected.copy(sprite.position).project(camera);
      label.hidden=!visible||document.hidden||projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
      if(!label.hidden)label.style.transform=`translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight-4}px) translate(-50%,-100%)`;
    },
    get name() { return name; },
    dispose() { label?.remove();sprite.removeFromParent(); material.dispose(); texture.dispose(); }
  };
}
