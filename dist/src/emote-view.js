import {EMOTES,EMOTE_SECONDS,HEART_PATH,HEART_COLOR} from './emotes.js?v=fc4534498d97';

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
  const material=new THREE.SpriteMaterial({transparent:true,depthTest:!self,depthWrite:false,toneMapped:false,fog:false});
  const sprite=new THREE.Sprite(material);sprite.name='visitor-emote';sprite.visible=false;sprite.renderOrder=21;scene.add(sprite);
  const cameraPoint=new THREE.Vector3();
  let key='',left=0,preview=null,previewSequence=0,serverSequence=0;
  function set(id,sequence,remaining=EMOTE_SECONDS,owner='self'){
    if(Number.isFinite(sequence))serverSequence=sequence;
    const next=`${owner}:${sequence}:${id}`;
    if(preview&&!preview.confirmed&&left>0){
      // A queued snapshot from before the tap must not erase its immediate
      // feedback. Adopt the real echo without restarting the three-second timer.
      if(id!==preview.id||!(sequence>preview.baseline))return;
      preview.confirmed=true;key=next;left=Math.min(left,Math.max(0,remaining));return;
    }
    const texture=textureFor(THREE,id);
    if(!texture||!(remaining>0)){left=0;sprite.visible=false;key='';return;}
    if(next!==key){key=next;left=Math.min(EMOTE_SECONDS,remaining);material.map=texture;material.needsUpdate=true;}
    else left=Math.min(left,remaining);
  }
  function play(id){
    if(!EMOTES.some(emote=>emote.id===id))return null;
    const token=++previewSequence,baseline=serverSequence;
    preview=null;set(id,`local-${token}`);preview={token,id,baseline,confirmed:false};
    return token;
  }
  function cancel(token){
    if(token!==preview?.token)return;
    preview=null;left=0;key='';sprite.visible=false;
  }
  function reset(){preview=null;serverSequence=0;left=0;key='';sprite.visible=false;}
  function update(avatar,posture,dt,visible=true,{camera=null,anchor=null,title=false,viewportHeight=globalThis.innerHeight||844}={}){
    left=Math.max(0,left-dt);if(!left)preview=null;
    sprite.visible=visible&&avatar.root.visible&&left>0;if(!sprite.visible)return;
    const age=EMOTE_SECONDS-left,height=posture==='lie'?.67:posture==='sit'?1.21:1.68;
    sprite.position.set(avatar.root.position.x,Math.min(4.82,avatar.root.position.y+height+.48+Math.min(.15,age*.05)),avatar.root.position.z);
    let scale=.5*(.85+.15*Math.min(1,age/.12));sprite.center.set(.5,.5);
    if(camera){
      if(anchor)sprite.position.copy(anchor);
      camera.updateMatrixWorld();cameraPoint.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse);
      const depth=-cameraPoint.z;
      if(depth<=0){sprite.visible=false;return;}
      const perPixel=2*Math.tan(camera.fov*Math.PI/360)*depth/Math.max(1,viewportHeight);
      const pixels=self?38:32;
      scale=Math.max(self?0:scale,pixels*perPixel);
      if(anchor)sprite.center.y=-(title?42:26)*perPixel/scale;
    }
    sprite.scale.setScalar(scale);material.opacity=Math.min(1,left/.4);
  }
  return {set,play,cancel,reset,update,sprite,dispose(){sprite.removeFromParent();material.dispose();if(--users===0){for(const texture of textures.values())texture.dispose();textures.clear();}}};
}
