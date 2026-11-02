import {EMOTES,EMOTE_SECONDS,HEART_PATH,HEART_COLOR} from './emotes.js';

// Small textures are created on demand and shared by all visitors.
const textures=new Map();let users=0;
function textureFor(THREE,id){
  if(textures.has(id))return textures.get(id);
  const emote=EMOTES.find(e=>e.id===id);if(!emote)return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,128,128);
  ctx.fillStyle='#f9fcf6e8';ctx.beginPath();ctx.roundRect(7,7,114,114,34);ctx.fill();
  if(id==='heart'){
    ctx.fillStyle=HEART_COLOR;ctx.fill(new Path2D(HEART_PATH));
  }else{
    ctx.fillStyle='#294b53';ctx.font='76px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emote.emoji,64,68);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.set(id,texture);return texture;
}
export function createEmoteView(THREE,scene,{self=false}={}){
  users++;
  const material=new THREE.SpriteMaterial({transparent:true,depthTest:!self,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.name='visitor-emote';sprite.visible=false;sprite.renderOrder=21;scene.add(sprite);
  let key='',left=0;
  function set(id,sequence,remaining=EMOTE_SECONDS,owner='self'){
    const texture=textureFor(THREE,id);
    if(!texture||!(remaining>0)){left=0;sprite.visible=false;key='';return;}
    const next=`${owner}:${sequence}:${id}`;
    if(next!==key){key=next;left=Math.min(EMOTE_SECONDS,remaining);material.map=texture;material.needsUpdate=true;}
    else left=Math.min(left,remaining);
  }
  function update(avatar,posture,dt,visible=true){
    left=Math.max(0,left-dt);sprite.visible=visible&&avatar.root.visible&&left>0;if(!sprite.visible)return;
    const age=EMOTE_SECONDS-left,height=posture==='lie'?.67:posture==='sit'?1.21:1.68;
    sprite.position.set(avatar.root.position.x,Math.min(4.82,avatar.root.position.y+height+.48+Math.min(.15,age*.05)),avatar.root.position.z);
    sprite.scale.setScalar(.5*(.85+.15*Math.min(1,age/.12)));material.opacity=Math.min(1,left/.4);
  }
  return {set,update,sprite,dispose(){sprite.removeFromParent();material.dispose();if(--users===0){for(const texture of textures.values())texture.dispose();textures.clear();}}};
}
