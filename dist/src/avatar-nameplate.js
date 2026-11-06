import {findTitle} from './destruction-titles.js?v=8a9c64ec02d8';
// A transparent, camera-facing name that clears the visible head and headwear.
export function createAvatarNameplate(THREE, scene, name, { resident = false, screenLabel = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d');let title=null,npcMarker=false,texture=makeTexture();
  function makeTexture(){const value=new THREE.CanvasTexture(canvas);value.colorSpace=THREE.SRGBColorSpace;value.minFilter=THREE.LinearFilter;value.generateMipmaps=false;return value;}
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: resident, depthWrite: false, toneMapped: false, fog: false });
  const sprite = new THREE.Sprite(material); sprite.name = 'visitor-nickname'; sprite.renderOrder = 20;
  sprite.scale.set(.96, .18, 1); scene.add(sprite);
  const bounds = new THREE.Box3(), extraBounds = new THREE.Box3(), center = new THREE.Vector3(), projected=new THREE.Vector3();
  const label=screenLabel?document.createElement('span'):null;let visible=false;
  if(label){label.className='visitor-nickname-label';label.hidden=true;label.setAttribute('aria-hidden','true');document.body.append(label);}
  function rename(next) {
    name = next;const band=title?80:0,width=npcMarker?768:512;
    if(canvas.height!==96+band||canvas.width!==width){canvas.width=width;canvas.height=96+band;texture.dispose();texture=makeTexture();material.map=texture;material.needsUpdate=true;}
    context.clearRect(0, 0, canvas.width, canvas.height);
    if(label){label.textContent=name;label.setAttribute('data-title',title?`〈${title.name}〉`:'');label.style.setProperty('--title-color',title?.color||'#204e55');}
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.lineJoin = 'round'; context.lineWidth = 5; context.strokeStyle = '#f4fbf8';
    if(title){context.font='700 38px "Noto Sans KR", system-ui, sans-serif';context.strokeText(`〈${title.name}〉`,width/2,36,480);context.fillStyle=title.color;context.fillText(`〈${title.name}〉`,width/2,36,480);}
    context.font = '700 48px "Noto Sans KR", system-ui, sans-serif';
    context.strokeText(name, width/2, 48+band, 480);
    context.fillStyle = '#204e55'; context.fillText(name, width/2, 48+band, 480);
    if(npcMarker){
      // Extra transparent space keeps the name/title centered at their original size.
      const x=width/2+Math.min(480,context.measureText(name).width)/2+12;
      context.beginPath();context.roundRect(x,24+band,100,48,12);context.fillStyle='#e1ebf5';context.fill();
      context.font='700 32px system-ui, sans-serif';context.fillStyle='#315c84';context.fillText('NPC',x+50,49+band,88);
    }
    texture.needsUpdate = true;
  }
  rename(name);
  return { rename, sprite,
    setTitle(id){const next=findTitle(id);if(next===title)return;title=next;rename(name);},
    setNpcMarker(enabled){const next=enabled===true&&!label;if(next===npcMarker)return;npcMarker=next;rename(name);},
    update(avatar, posture, { headwear = [], camera = null, viewportHeight = globalThis.innerHeight||844 } = {}) {
      visible=avatar.root.visible;sprite.visible=visible&&!label;
      const hood = avatar.root.getObjectByName('hood');
      if (hood) {
        hood.updateWorldMatrix(true, false); bounds.setFromObject(hood); bounds.getCenter(center);
        for (const item of headwear) if (item?.visible) { item.updateWorldMatrix(true, true); extraBounds.setFromObject(item); bounds.union(extraBounds); }
        sprite.position.set(center.x, Math.min(4.8, bounds.max.y + .16), center.z);
      } else sprite.position.set(avatar.root.position.x, avatar.root.position.y + (posture === 'lie' ? .67 : posture === 'sit' ? 1.21 : 1.68), avatar.root.position.z);
      let height=.18;
      if(camera&&!label){
        camera.updateMatrixWorld();projected.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse);
        const perPixel=2*Math.tan(camera.fov*Math.PI/360)*Math.max(.1,-projected.z)/Math.max(1,viewportHeight);
        height=Math.min(36*perPixel,Math.max(.18,28*perPixel));
        sprite.position.y=Math.min(4.8,sprite.position.y+Math.max(0,(height-.18)/2));
      }
      sprite.scale.set(height*canvas.width/96,height*canvas.height/96,1);
      // Keep the nickname's original size and anchor; the title extends upward.
      if(title&&!label)sprite.position.y+=height*80/96/2;
    },
    updateScreen(camera){
      if(!label)return;projected.copy(sprite.position).project(camera);
      label.hidden=!visible||document.hidden||projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
      if(!label.hidden)label.style.transform=`translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight-4}px) translate(-50%,-100%)`;
    },
    get name() { return name; },
    get titleId(){return title?.id??'';},
    dispose() { label?.remove();sprite.removeFromParent(); material.dispose(); texture.dispose(); }
  };
}
