// Offline instructional staging. No browser, network, accounts or live events.
import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FilmExporter,installCanvas} from '../fab-promo/export-utils.mjs';
import {createFilmWorld} from '../fab-promo/source-world.mjs';
import {createAvatar} from '../../src/avatar.js';
import {createAvatarAppearance} from '../../src/avatar-appearance.js';
import {DEFAULT_OUTFIT} from '../../src/cosmetics-catalog.js';
import {createMovingWalkwayView} from '../../src/moving-walkway-view.js';
import {createCartView} from '../../src/cart-view.js';
import {createEmoteView} from '../../src/emote-view.js';
import {cartPoint,cartSeatPose,cartCargoPose,CART_SIZE} from '../../src/cart-layout.js';
import {machines,SEATED_FOUP_Y} from '../../src/layout.js';

installCanvas();
const makeCanvas=document.createElement;
document.createElement=tag=>{const c=makeCanvas(tag);c.setAttribute=()=>{};c.style={};return c;};
document.body={append(){}};
const root=fileURLToPath(new URL('../../outputs/tutorial-20261112/new-shots/',import.meta.url)).replaceAll('\\','/');
const exporter=new FilmExporter(root);await exporter.init();
const m=machines.find(m=>m.bayId===4&&m.sign===1&&m.column===5),port=m.ports[1];
const world=await createFilmWorld({bayIds:[4,5,13,14],omitPortIds:[port.id]});
const walkways=createMovingWalkwayView(THREE,world.scene);
walkways.root.traverse(o=>{if(o.isMesh&&o.material.map){const uv=o.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i),uv.getY(i)*o.material.map.repeat.y);o.material.map.repeat.set(1,1);}});
world.rails.visible=false;
const staticObjects=exporter.collect(world.scene),fps=30,dt=1/fps;
const clamp=v=>Math.min(1,Math.max(0,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);},lerp=(a,b,t)=>a+(b-a)*t;
const camera=(position,target,fov=58)=>({position,target,fov,up:[0,1,0],ortho:null});
const clips=[{id:'move',duration:3.5},{id:'look',duration:2.5},{id:'pickup',duration:3.5},{id:'walkway',duration:3},{id:'social',duration:5},{id:'cartload',duration:3}];
function actor(stage,outfit={}){const avatar=createAvatar(THREE),appearance=createAvatarAppearance(THREE,avatar);stage.add(avatar.root);appearance.setOutfit({...DEFAULT_OUTFIT,head:'helmet-orange',suit:'suit-blue',...outfit},'visitor');return {avatar,set(x,z,heading,opts={}){avatar.root.position.set(x,opts.y??0,z);avatar.update(dt,{heading,...opts});appearance.update();},dispose(){appearance.dispose();avatar.dispose();}};}
for(const clip of clips){
  const stage=new THREE.Group(),a=actor(stage),frames=[],cameras=[],hidden=[],targets=[];
  let run;
  if(clip.id==='move')run=t=>{const z=14-t*3.2;a.set(0,z,Math.PI,{speed:3.2});return camera([0,3.3,z+6.0],[0,.85,z-.1]);};
  if(clip.id==='look')run=t=>{a.set(0,2,Math.PI);const q=smooth(t/2.5),yaw=lerp(-.28,.55,q);return camera([Math.sin(yaw)*6,3.25,2+Math.cos(yaw)*6],[0,.85,2]);};
  if(clip.id==='pickup'){
    const foup=world.foup();stage.add(foup);
    run=t=>{const q=smooth((t-.8)/.5),back=smooth((t-1.3)/1.6);a.set(port.x,port.z+1.1+back*.9,Math.PI,{carrying:t>.8,speed:back>0&&back<1?1:0});
      const hand={x:port.x,y:.82,z:a.avatar.root.position.z-.36};foup.position.set(lerp(port.x,hand.x,q),lerp(SEATED_FOUP_Y,hand.y,q),lerp(port.z,hand.z,q));foup.rotation.y=0;
      targets.push(foup.position.toArray());return camera([port.x-2.15,2.8,port.z+4.8],[port.x,1.0,port.z+.55],49);
    };
  }
  let rider;
  if(clip.id==='walkway'){
    const cart=createCartView(THREE,stage);rider=actor(stage,{head:'bunny-ears',suit:'suit-pink'});
    run=t=>{const c={x:1.05,z:18-t*6.4,yaw:Math.PI};cart.update(c);const p=cartPoint(c,0,0,CART_SIZE.tow),grip=cartPoint(c,0,.87,CART_SIZE.handle);
      a.avatar.root.userData.cartGrip={...grip,yaw:c.yaw};a.set(p.x,p.z,Math.PI,{speed:3.2});const seat=cartSeatPose(c,1);rider.set(seat.x,seat.z,seat.heading,{y:seat.y,posture:'sit',snap:true});
      return camera([c.x+3.3,4.2,c.z+6.6],[c.x,.7,c.z-1.2],56);
    };
  }
  let friend,emote;
  if(clip.id==='cartload'){
    const pose={x:-28.7,z:0,yaw:Math.PI},cart=createCartView(THREE,stage);cart.update(pose);
    const carriers=[0,1,2,3].map(()=>{const obj=world.foup();stage.add(obj);return obj;});
    run=t=>{const q=smooth((t-1.2)/.45);a.set(-27.45,.55,-Math.PI/2,{carrying:t<1.6});
      carriers.forEach((obj,i)=>{const p=cartCargoPose(pose,i);if(i<3)obj.position.set(p.x,p.y,p.z);else obj.position.set(lerp(-27.81,p.x,q),lerp(.82,p.y,q),lerp(.55,p.z,q));obj.rotation.y=p.yaw;});
      return camera([-25.2,2.65,4.8],[-28.5,.94,0],48);
    };
  }
  if(clip.id==='social'){
    friend=actor(stage,{head:'bunny-ears',suit:'suit-pink'});emote=createEmoteView(THREE,stage);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide}));stage.add(plane);
    run=t=>{const posture=t<2.8?'stand':t<3.8?'sit':'lie';a.set(-29.2,0,.12,{posture});friend.set(-28.1,-.1,-.14,{posture:t<2.8?'stand':'sit'});
      const shot=camera([-28.65,2.7,4.5],[-28.65,.78,0],49),lens=new THREE.PerspectiveCamera(49,9/16,.02,200);lens.position.fromArray(shot.position);lens.lookAt(...shot.target);lens.updateMatrixWorld();
      if(t>.3&&t<2.8)emote.set(t<1.8?'wave':'heart',1,3);emote.update(a.avatar,posture,dt);plane.visible=t>.3&&t<2.8&&emote.sprite.visible;plane.position.copy(emote.sprite.position);plane.quaternion.copy(lens.quaternion);plane.scale.copy(emote.sprite.scale);plane.material.map=emote.sprite.material.map;plane.material.opacity=emote.sprite.material.opacity;return shot;
    };
  }
  for(let f=0;f<Math.round(clip.duration*fps);f++){cameras.push(run(f/fps));frames.push(exporter.collect(stage));hidden.push(['pickup','social','cartload'].includes(clip.id)?world.allMachines.filter(n=>n.z>2&&n.z<10).map(n=>n.id):clip.id==='walkway'?world.allMachines.filter(n=>n.x>0&&n.x<12).map(n=>n.id):[]);}
  await exporter.saveClip(clip.id,frames,cameras,{hiddenEquipment:hidden,targets});a.dispose();rider?.dispose();friend?.dispose();emote?.dispose();
}
await exporter.save(staticObjects);
await writeFile(root+'/timeline.json',JSON.stringify({clips,fps,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Offline current game model and animation export for tutorial; no live game actions'},null,2));
console.log('TUTORIAL_SHOTS_READY');
