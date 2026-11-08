import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FilmExporter, installCanvas} from './export-utils.mjs';
import {createFilmWorld} from './source-world.mjs';
import {createAvatar} from '../../src/avatar.js';
import {createAvatarAppearance} from '../../src/avatar-appearance.js';
import {DEFAULT_OUTFIT} from '../../src/cosmetics-catalog.js';
import {createEquipmentDestruction} from '../../src/equipment-destruction.js';
import {getEmoApproach, emoPressCameraFrame} from '../../src/emo-interaction.js';
import {createContestZones} from '../../src/foup-contest-view.js';
import {createFoupRenderer} from '../../src/foup-play.js';
import {createStockerView} from '../../src/stocker-view.js';
import {stockers, stockerSlot, stockerRecordPose} from '../../src/stocker-layout.js';
import {createCartView} from '../../src/cart-view.js';
import {cartPoint, cartCargoPose, cartSeatPose, CART_SIZE} from '../../src/cart-layout.js';
import {createEmoteView} from '../../src/emote-view.js';
import {createMotionSound, createExplosionSound, createEmoPressSound} from '../../src/ambience.js';

// Promotional staging only. All geometry and poses come from the game builders.
// No production connection, player records, event controls or deployment.
installCanvas();
const {GlobalFonts} = await import('../../outputs/fab-promo-2026-11-02/tools/node_modules/@napi-rs/canvas/index.js');
GlobalFonts.registerFromPath('C:/Windows/Fonts/malgunbd.ttf','sans-serif');
GlobalFonts.registerFromPath('C:/Windows/Fonts/malgunbd.ttf','system-ui');
const root = fileURLToPath(new URL('../../outputs/fab-promo-2026-11-09/', import.meta.url)).replaceAll('\\', '/');
const exporter = new FilmExporter(root);
await exporter.init();
const world = await createFilmWorld({bayIds:[4,5,8,13,14,17]});
world.rails.visible=false;
const staticObjects = exporter.collect(world.scene);
const FPS = 30, dt = 1 / FPS;
const clamp = (v, min=0, max=1) => Math.max(min, Math.min(max, v));
const smooth = v => {const p=clamp(v); return p*p*(3-2*p);};
const lerp = (a,b,t) => a+(b-a)*t;
const camera = (position,target,options={}) => ({position,target,fov:48,up:[0,1,0],ortho:null,...options});
const clips = [
  {id:'01-hook',duration:1.6}, {id:'02-bay',duration:4},
  {id:'03-contest',duration:3.6}, {id:'04-steal',duration:2.4},
  {id:'05-golden',duration:3.2}, {id:'06-stocker-in',duration:2},
  {id:'07-stocker-out',duration:2}, {id:'08-cart-load',duration:3.2},
  {id:'09-cart-ride',duration:3.6}, {id:'10-end',duration:4.4}
];
const outfits = [
  {head:'helmet-orange',suit:'suit-blue'},
  {head:'bunny-ears',face:'heart-glasses',suit:'suit-pink'},
  {head:'cat-ears',suit:'suit-black',bag:'bag-turtle'},
  {head:'helmet-red',suit:'suit-green'},
  {head:'helmet-blue',suit:'suit-default'},
  {head:'sprout',face:'glasses',suit:'suit-green'},
  {head:'baby-chick',bag:'bag-star',suit:'suit-pink'},
  {head:'crown',face:'sunglasses',suit:'suit-black'}
];
function actor(stage,index,outfit={}) {
  const avatar=createAvatar(THREE), appearance=createAvatarAppearance(THREE,avatar);
  stage.add(avatar.root);
  appearance.setOutfit({...DEFAULT_OUTFIT,...outfits[index%outfits.length],...outfit},'visitor');
  return {avatar, set(x,z,heading,options={}) {
    avatar.root.position.set(x,options.y??0,z);
    avatar.update(dt,{heading,...options}); appearance.update();
  }, dispose(){appearance.dispose();avatar.dispose();}};
}
function carrier(id,pose,gold=false) {
  return {id,mode:'ground',yaw:0,...pose,...(gold?{gold:{eventId:'film'}}:{})};
}
function carried(id,a,gold=false) {
  const r=a.avatar.root, h=a.avatar.body.rotation.y;
  return carrier(id,{mode:'carried',x:r.position.x+Math.sin(h)*.36,y:r.position.y+.82,z:r.position.z+Math.cos(h)*.36,yaw:h},gold);
}
function stock(store,view,s,id,mode,age,slot=0,gold=false) {
  const record={id,mode,stockAge:age,stockerId:s.id,stockSlot:slot};
  Object.assign(record,stockerRecordPose(record));
  if(gold)record.gold={eventId:'film'};
  store.records.set(id,record);view.update(store);
  return record;
}
function stockSet(stage) {
  const store={records:new Map()},view=createStockerView(THREE,stage);
  const stored=[];
  for (const s of stockers) for (let n=0;n<22;n++) {
    stored.push(carrier(s.id+':'+n,{...stockerSlot(s,n),mode:'stored'}));
  }
  return {store,view,stored};
}

let offset=0;
const cues=[];
for(const clip of clips) {
  clip.start=offset; offset+=clip.duration;
  const stage=new THREE.Group(), actors=[], frames=[], cameras=[], hidden=[];
  const spawn=(n,outfit)=>{const a=actor(stage,n,outfit);actors.push(a);return a;};
  const renderer=createFoupRenderer(THREE,stage,world.M,96);
  const damage=createEquipmentDestruction({THREE,scene:stage,machines:world.machines});
  let run;
  const foreground=[];
  if(clip.id==='01-hook') {
    const m=world.machines.find(m=>m.sign===1&&m.column===7);
    const plan=getEmoApproach(m),p=plan.destination,a=spawn(0);
    const close=emoPressCameraFrame(plan,9/16,58);let destroyed=false;
    cues.push({t:.18,kind:'press',gain:.8},{t:.50,kind:'explosion',gain:.75});
    run=t=>{
      if(t>=.5&&!destroyed){damage.trigger(m.id);destroyed=true;}
      a.set(p.x,p.z+smooth((t-.7)/.7)*.65,plan.heading,{pressTarget:t<.5?plan.button:null,pressProgress:clamp(t/.12),speed:t>.7?1:0});
      const q=smooth((t-.45)/.8),shake=t>.5?.06*Math.sin(t*96)*Math.exp(-(t-.5)*5):0;
      return camera([lerp(close.position.x,m.x-4,q)+shake,lerp(close.position.y,3.3,q),lerp(close.position.z,m.z+9,q)], [lerp(close.target.x,m.x,q),lerp(close.target.y,1,q),lerp(close.target.z,m.z+.9,q)],{fov:58});
    };
  } else if(clip.id==='02-bay') {
    const sorted=[...world.machines].sort((a,b)=>a.column-b.column||b.sign-a.sign);
    const people=sorted.map((_,i)=>spawn(i)),done=new Set();
    const timings=sorted.map(m=>.48+m.column*.245+(m.sign===-1?.1:0));
    timings.forEach((t,i)=>cues.push({t:clip.start+t,kind:'explosion',gain:.16,pan:i%2?.5:-.5}));
    cues.push({t:clip.start+3.3,kind:'chip',gain:.7});
    run=t=>{
      sorted.forEach((m,i)=>{const p=getEmoApproach(m),after=t-timings[i];
        if(after>=0&&!done.has(m.id)){damage.trigger(m.id);done.add(m.id);}
        const back=clamp(after-.25,0,.65);
        people[i].set(p.destination.x,p.destination.z+m.sign*back,p.heading,{pressTarget:after<0?p.button:null,pressProgress:1,speed:after>.25&&after<.9?1:0});
      });
      const q=smooth((t-1.8)/1.4),x=lerp(-41,-28.7,smooth(t/3.6));
      return camera([x,45,1.8],[x,0,0],{ortho:lerp(32,61,q),up:[1,0,0]});
    };
  } else if(clip.id==='03-contest') {
    createContestZones(THREE,stage)(true);
    const whiteA=spawn(1,{suit:'suit-default'}),whiteB=spawn(4,{suit:'suit-default'}),black=spawn(2,{suit:'suit-black'});
    const ball=carrier('shot',{x:-1.1,y:.82,z:13.6}),still=[
      carrier('one',{x:-.65,y:.225,z:18.5}),carrier('two',{x:.3,y:.225,z:17.5}),carrier('three',{x:1.1,y:.225,z:18.1})
    ];
    cues.push({t:clip.start+.65,kind:'throw',gain:.65},{t:clip.start+1.6,kind:'chip',gain:.65});
    run=t=>{
      const f=clamp((t-.65)/.9);whiteA.set(-1.1,13.25,0,{carrying:t<.65});whiteB.set(.9,14.6,-.25,{carrying:true});
      black.set(2.35-clamp(t-1.5,0,1.3)*1.2,18.7-clamp(t-1.5,0,1.3)*.45,-2.0,{speed:t>1.5?2:0,carrying:t>2.8});
      Object.assign(ball,{x:lerp(-1.1,-.4,f),z:lerp(13.6,17.9,f),y:lerp(.82,.225,f)+Math.sin(f*Math.PI)*1.2,yaw:f*1.2});
      renderer.update([ball,...still.slice(0,2),t>2.8?carried('three',black):still[2],carried('other',whiteB)]);
      return camera([5.2-t*.25,6.4,23.8-t*.2],[0,.45,17.0],{fov:52});
    };
  } else if(clip.id==='04-steal') {
    createContestZones(THREE,stage)(true);
    const thief=spawn(2,{suit:'suit-black'}),ally=spawn(7,{suit:'suit-black'}),chaser=spawn(1,{suit:'suit-default'});
    cues.push({t:clip.start+.1,kind:'throw',gain:.25});
    run=t=>{
      const z=11.1-t*3.4;
      thief.set(-.55,z,Math.PI,{speed:3.2,carrying:true});ally.set(.85,z-.9,Math.PI,{speed:3.2});chaser.set(.45,z+2.5,Math.PI,{speed:3.2});
      renderer.update([carried('stolen',thief)]);
      return camera([3.4,2.5,z-4.7],[-.2,.85,z+.2],{fov:49});
    };
  } else if(clip.id==='05-golden') {
    const a=spawn(3),b=spawn(1),items=[carrier('gold',{x:-.35,y:.225,z:73},true),carrier('gold2',{x:1.3,y:.225,z:76.2},true)];
    cues.push({t:clip.start+.7,kind:'chip',gain:.55});
    const stk=stockSet(stage);
    run=t=>{
      const p=smooth((t-.55)/.45),walk=Math.max(0,t-1)*1.9;
      a.set(-.35,72.25+walk,0,{carrying:t>.55,speed:t>1?2.6:0});b.set(1.5,71.4+walk,0,{speed:t>1?2.6:0});
      renderer.update([t<.55?items[0]:carried('gold',a,true),items[1],...stk.stored]);
      return camera([4.0,2.1+p*1.5,76.1+walk],[-.3,.6,73+walk],{fov:48});
    };
  } else if(clip.id==='06-stocker-in'||clip.id==='07-stocker-out') {
    const {store,view,stored}=stockSet(stage),s=stockers[0],a=spawn(3),isOut=clip.id==='07-stocker-out';
    const port=s.ports[isOut?1:0],approach=port.approach;
    cues.push({t:clip.start+(isOut?1.15:.75),kind:isOut?'complete':'chip',gain:.65});
    run=t=>{
      const age=clamp(t/(isOut?1.4:1.6))*3;
      a.set(approach.x,approach.z,s.yaw+Math.PI,{carrying:isOut&&t>1.5,pressTarget:t<.4?{x:port.x,y:1.45,z:port.z}:null,pressProgress:clamp(t/.2)});
      let record;
      if(isOut&&t>1.5){store.records.clear();view.update(store);record=carried('stocker',a);}
      else record=stock(store,view,s,'stocker',isOut?(age>=3?'stocker-out':'retrieving'):'stocking',age,17,!isOut);
      renderer.update([...stored,record]);
      const q=smooth(t/clip.duration);
      if(isOut)return camera([.2,2.55,86.5],[-3.9,1.5,83.0],{fov:45});
      return camera([lerp(2.9,.4,q),lerp(4.1,2.65,q),87.4],[-5.3,lerp(2.2,1.5,q),83.3],{fov:52});
    };
  } else if(clip.id==='08-cart-load') {
    const cart=createCartView(THREE,stage),pose={x:-.2,z:77,yaw:Math.PI};cart.update(pose);
    const a=spawn(1),b=spawn(0),props=[0,1,2,3].map(i=>carrier('cargo'+i,{...cartCargoPose(pose,i),mode:'cart'}));
    cues.push({t:clip.start+.6,kind:'chip',gain:.3},{t:clip.start+1.7,kind:'chip',gain:.4});
    run=t=>{
      const q=smooth((t-1.4)/.5),seat=cartSeatPose(pose,1);
      a.set(lerp(-1.65,seat.x,q),lerp(76.6,seat.z,q),lerp(1.2,seat.heading,q),{y:seat.y*q,posture:t>1.6?'sit':'stand',speed:t<1.4?0:1,snap:t>=1.9});
      b.set(1.25,77.8,Math.PI*.7,{carrying:true});
      const cargo=props.map(r=>({...r}));
      if(t>1.4){for(const i of [2,3]){const f=clamp((t-1.4)/.6);cargo[i].x+=Math.sin(i*2)*f*1.25;cargo[i].z+=.9*f;cargo[i].y=lerp(props[i].y,.225,f)+Math.sin(f*Math.PI)*.3;cargo[i].yaw+=f*2;}}
      renderer.update([...cargo,carried('load',b)]);
      return camera([3.5-t*.12,2.6,81.8],[-.05,1.05,77.1],{fov:43});
    };
  } else if(clip.id==='09-cart-ride') {
    const cart=createCartView(THREE,stage),driver=spawn(2),riders=[spawn(0),spawn(1)],friend=spawn(3);
    run=t=>{
      const c={x:.2+Math.sin(t*.45)*.35,z:64-t*3.2,yaw:Math.PI};cart.update(c);
      const handle=cartPoint(c,0,.87,CART_SIZE.handle),driverPoint=cartPoint(c,0,0,CART_SIZE.tow);
      driver.avatar.root.userData.cartGrip={...handle,yaw:c.yaw};
      driver.set(driverPoint.x,driverPoint.z,Math.PI,{speed:3.2});
      riders.forEach((a,i)=>{const s=cartSeatPose(c,i);a.set(s.x,s.z,s.heading,{y:s.y,posture:'sit',snap:true});});
      friend.set(-1.7,c.z-.25,Math.PI,{speed:3.2});
      return camera([c.x+3.6,2.6,c.z+4.9],[c.x,1.05,c.z-.2],{fov:46});
    };
  } else {
    const stk=stockSet(stage),cart=createCartView(THREE,stage),c={x:1.05,z:79,yaw:Math.PI};cart.update(c);
    const people=[spawn(2),spawn(1),spawn(0),spawn(3),spawn(6),spawn(4)];
    const icons=people.slice(0,4).map((a,i)=>{const view=createEmoteView(THREE,stage),plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide}));stage.add(plane);return {view,plane,id:['wave','heart','laugh','surprise'][i]};});
    run=t=>{
      const q=smooth(t/4.4);const shot=camera([-.3,3.1+q*.4,87.1+q*.45],[-.25,1.25,79],{fov:47});
      const lens=new THREE.PerspectiveCamera(shot.fov,9/16,.02,200);lens.position.fromArray(shot.position);lens.lookAt(...shot.target);lens.updateMatrixWorld();
      people.forEach((a,i)=>{if(i<2){const s=cartSeatPose(c,i);a.set(s.x,s.z,s.heading,{y:s.y,posture:'sit',snap:true});}
        else a.set(-1.75+(i-2)*.70,80.0-(i%2)*.6,Math.sin(i)*.18,{posture:'stand'});
        const icon=icons[i];if(icon){icon.view.set(icon.id,1,4.4);icon.view.update(a.avatar,i<2?'sit':'stand',dt);icon.plane.visible=true;icon.plane.position.copy(icon.view.sprite.position);icon.plane.quaternion.copy(lens.quaternion);icon.plane.scale.copy(icon.view.sprite.scale);icon.plane.material.map=icon.view.sprite.material.map;icon.plane.material.opacity=icon.view.sprite.material.opacity;}
      });renderer.update(stk.stored);return shot;
    };
  }
  // Omit front-facing cabinets only when they would mask the close action.
  if(clip.id==='01-hook')foreground.push(...world.allMachines.filter(m=>m.bayId===4&&m.sign===1).map(m=>m.id).filter(id=>id!==world.machines.find(m=>m.sign===1&&m.column===7).id));
  if(['04-steal','05-golden','09-cart-ride'].includes(clip.id))foreground.push(...world.allMachines.filter(m=>m.x>0&&m.x<12).map(m=>m.id));
  for(let f=0;f<Math.round(clip.duration*FPS);f++) {
    const view=run(f/FPS);damage.update(dt);
    frames.push(exporter.collect(stage));cameras.push(view);hidden.push([...damage.state.destroyedIds,...foreground]);
  }
  await exporter.saveClip(clip.id,frames,cameras,{start:clip.start,hiddenEquipment:hidden});
  for(const a of actors)a.dispose();damage.dispose();renderer.dispose();
}
await exporter.save(staticObjects);
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await writeFile(root+'/timeline.json',JSON.stringify({fps:FPS,width:1080,height:1920,duration:offset,clips,cues,sourceRevision:revision,method:'Cinematic staging with current game models, avatar poses, stocker transfer and cart seat coordinates'},null,2));
for(const kind of ['press','explosion','throw','chip','complete']) {
  const data=kind==='press'?createEmoPressSound():kind==='explosion'?createExplosionSound():createMotionSound(kind);
  await writeFile(`${root}/${kind}.f32`,Buffer.from(data.buffer));
}
console.log('UPDATE_FILM_EXPORTED',offset,exporter.geometries.length,exporter.materials.length);
