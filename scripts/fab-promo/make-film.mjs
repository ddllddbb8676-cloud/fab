import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FilmExporter,installCanvas} from './export-utils.mjs';
import {createFilmWorld} from './source-world.mjs';
import {createAvatar} from '../../src/avatar.js';
import {createAvatarAppearance} from '../../src/avatar-appearance.js';
import {DEFAULT_OUTFIT} from '../../src/cosmetics-catalog.js';
import {createEquipmentDestruction} from '../../src/equipment-destruction.js';
import {getEmoApproach,emoPressCameraFrame} from '../../src/emo-interaction.js';
import {createFoupDebris} from '../../src/foup-debris.js';
import {createEmoteView} from '../../src/emote-view.js';
import {createMotionSound,createExplosionSound,createEmoPressSound} from '../../src/ambience.js';
installCanvas();
const ROOT=fileURLToPath(new URL('../../outputs/fab-promo-2026-11-02/',import.meta.url)).replaceAll('\\','/');
const exporter=new FilmExporter(ROOT);await exporter.init();const world=await createFilmWorld();
const staticObjects=exporter.collect(world.scene),FPS=30,dt=1/FPS,center={x:-28.7,z:0};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);},mix=(a,b,t)=>a+(b-a)*t;
const selected=process.argv[2]?.split(',');
const clips=[{id:'01-emo',duration:4},{id:'02-bay',duration:8},{id:'03-chase',duration:6},{id:'04-repair',duration:4},{id:'05-foup',duration:6},{id:'06-clean',duration:6},{id:'07-oht',duration:6},{id:'08-fashion',duration:8},{id:'09-rest',duration:6},{id:'10-end',duration:4}];
const actorOutfits=[{head:'helmet-orange'},{head:'bunny-ears',face:'heart-glasses'},{head:'sprout',bag:'bag-basic'},{head:'baby-chick',bag:'bag-star'},{head:'helmet-white',face:'glasses'},{face:'sunglasses',bag:'bag-turtle'},{bag:'bag-bear'},{head:'crown',bag:'bag-wings',suit:'suit-black'}];
function actor(scene,index,options={}){const a=createAvatar(THREE),appearance=createAvatarAppearance(THREE,a);scene.add(a.root);appearance.setOutfit({...DEFAULT_OUTFIT,...actorOutfits[index%actorOutfits.length],...options.outfit},options.role||'visitor');a.update(dt,{repairTime:0});a.update(dt,{cleanTime:0});a.update(dt,{snap:true});return {a,appearance,set(x,z,heading,opts={}){a.root.position.set(x,opts.y||0,z);a.update(dt,{heading,...opts});appearance.update();},dispose(){appearance.dispose();a.dispose();}};}
function camera(position,target,{fov=50,up=[0,1,0],ortho=null}={}){return {position,target,fov,up,ortho};}
function lookCamera(data){const c=new THREE.PerspectiveCamera(data.fov,9/16,.02,200);c.position.fromArray(data.position);c.up.fromArray(data.up);c.lookAt(...data.target);c.updateMatrixWorld();return c;}
const cue=[];
let offset=0;
for(const clip of clips){clip.start=offset;offset+=clip.duration;if(selected&&!selected.includes(clip.id))continue;
  const stage=new THREE.Group(),actors=[],frames=[],cameras=[],hidden=[],events=[];const damage=createEquipmentDestruction({THREE,scene:stage,machines:world.machines});
  const spawn=(i,options)=>{const a=actor(stage,i,options);actors.push(a);return a;};
  const m=world.machines.find(m=>m.sign===1&&m.column===5),plan=getEmoApproach(m),p=plan.destination;
  let run;
  if(clip.id==='01-emo'){
    const a=spawn(0),framing=emoPressCameraFrame(plan,9/16,58);let broken=false;
    cue.push({t:clip.start+.55,kind:'press',gain:.8},{t:clip.start+1.2,kind:'explosion',gain:.8});
    run=t=>{if(t>=1.2&&!broken){damage.trigger(m.id);broken=true;}const retreat=smooth((t-1.6)/1.1);a.set(p.x+retreat*.55,p.z+retreat*.85,plan.heading+retreat*.35,{pressTarget:t<1.2?plan.button:null,pressProgress:clamp(t/.5),speed:t>1.6&&t<2.5?1:0});
      const pull=smooth((t-1.15)/1.1);return camera([mix(framing.position.x,m.x-4.3,pull),mix(framing.position.y,4.3,pull),mix(framing.position.z,m.z+11,pull)],[mix(framing.target.x,m.x,pull),mix(framing.target.y,1.2,pull),mix(framing.target.z,m.z+1.2,pull)],{fov:framing.fov||58});};
  }else if(clip.id==='02-bay'){
    const sorted=[...world.machines].sort((a,b)=>a.column-b.column||b.sign-a.sign),people=sorted.map((_,i)=>spawn(i)),done=new Set();
    const timing=sorted.map((m,i)=>.7+m.column*.46+(m.sign===-1?.18:0));timing.forEach((time,i)=>cue.push({t:clip.start+time,kind:'explosion',gain:.18,pan:(i%2)*1.2-.6}));
    run=t=>{for(let i=0;i<sorted.length;i++){const machine=sorted[i],ap=getEmoApproach(machine),hit=timing[i],after=t-hit;if(after>=0&&!done.has(machine.id)){damage.trigger(machine.id);done.add(machine.id);}const back=clamp(after-.5,0,.8);people[i].set(ap.destination.x,ap.destination.z+machine.sign*back,ap.heading,{pressTarget:after<0?ap.button:null,pressProgress:clamp((t-(hit-.65))/.48),speed:after>.5&&after<1.3?1:0});}
      const pull=smooth((t-4.7)/2.6),track=mix(-45,-13,clamp((t-.5)/4.4)),x=mix(track,-28.7,pull);return camera([x,48+pull*18,2.5],[x,0,0],{up:[1,0,0],ortho:mix(32,61,pull)});};
  }else if(clip.id==='03-chase'){
    const people=Array.from({length:8},(_,i)=>spawn(i)),guards=[spawn(4,{role:'safety-red',outfit:{head:'helmet-white'}}),spawn(4,{role:'safety-orange',outfit:{head:'helmet-orange'}})];
    run=t=>{const panic=smooth((t-1)/.35);people.forEach((a,i)=>{const move=clamp(t-1,0,4),side=i%2?1:-1;a.set(-35+i*.9+move*(i===0?1.1:2.9),side*(.5+panic*Math.min(1.25,move*.45)),Math.PI/2+Math.sin(t*4+i)*.12,{speed:t>1?3.2:0});});guards.forEach((a,i)=>a.set(-40+clamp(t,0,5)*3.1,i?1.3:-1.2,Math.PI/2,{speed:3.1}));return camera([-25+t*2.1,4.4,8],[-32+t*2.1,.6,0],{fov:52});};
  }else if(clip.id==='04-repair'){
    damage.trigger(m.id,{age:5,silent:true});const a=spawn(0,{outfit:{beauty:'eyes-cry'}}),guard=spawn(4,{role:'safety-red',outfit:{head:'helmet-white'}});let fixed=false;
    cue.push({t:clip.start+3.25,kind:'complete',gain:.7},{t:clip.start+3.35,kind:'chip',gain:.6});
    run=t=>{if(t>3.2&&!fixed){damage.reset(m.id);fixed=true;}if(!fixed){damage.beginRepair(m.id,'film');damage.setRepairProgress(m.id,clamp(t/3.2));}a.set(p.x,p.z,plan.heading,{repairTime:t<3.2?t:null,pressTarget:{...plan.button,y:.96+.16*Math.sin(t*15)},pressProgress:t<3.2?1:0});guard.set(p.x+1,p.z+.8,-Math.PI*.75,{});return camera([p.x-3.3,2.4,p.z+4.1],[p.x-.2,.9,p.z-.6],{fov:51});};
  }else if(clip.id==='05-foup'||clip.id==='06-clean'){
    const a=spawn(2,{outfit:{head:'bunny-ears',bag:'bag-basic'}}),b=spawn(4,{outfit:{face:'glasses'}}),foup=world.foup();stage.add(foup);const debris=createFoupDebris(THREE,stage,{capacity:8});const landing={x:-25.6,z:.4},origin={x:-28,z:0};let cleared=false;
    const initial=clip.id==='06-clean';if(initial)foup.visible=false;
    if(!initial)cue.push({t:clip.start+.9,kind:'throw',gain:.65},{t:clip.start+1.8,kind:'shatter',gain:.9},{t:clip.start+2.55,kind:'chip',gain:.65});else{for(let t=.5;t<3.6;t+=.52)cue.push({t:clip.start+t,kind:'sweep',gain:.48});cue.push({t:clip.start+3.7,kind:'chip',gain:.75});}
    run=t=>{let point,record;
      if(!initial){const fly=clamp((t-.9)/.9);foup.visible=t<1.8;foup.position.set(mix(origin.x+.34,landing.x,fly),t<.9?.82:.82+Math.sin(fly*Math.PI)*.9-.78*fly,mix(origin.z,landing.z,fly));foup.rotation.set(fly*4,Math.PI/2,fly*2);a.set(origin.x,origin.z,Math.PI/2,{carrying:t<.9,pressProgress:0});b.set(-25,-1.3,0);record={id:'film-foup',mode:t<1.8?'flying':'broken',x:landing.x,y:.035,z:landing.z,breakSeq:1,damageAge:Math.max(0,t-1.8)};const q=smooth((t-1.1)/1.2);point=camera([mix(-24.5,-23.8,q),mix(2.1,3.2,q),mix(5.4,4.1,q)],[mix(-27,-25.8,q),.45,.4],{fov:49});}
      else{const clean=Math.max(0,t-.4);a.set(landing.x-.8,landing.z,Math.PI/2,{cleanTime:t>.4&&t<3.6?clean:null});b.set(landing.x+.9,landing.z-1.5,0,{posture:t>4.2?'sit':'stand'});record={id:'film-foup',mode:t<3.6?'broken':'cleared',x:landing.x,y:.035,z:landing.z,breakSeq:1,damageAge:2,cleaner:t>.4&&t<3.6?'film':null,cleanHeading:Math.PI/2,cleanProgress:clamp(clean/3.2)};point=camera([landing.x+3,2.5,landing.z+4],[landing.x,.65,landing.z],{fov:49});}
      const c=lookCamera(point);debris.update([record],{dt,focus:landing,camera:c});return point;};
  }else if(clip.id==='07-oht'){
    const group=Array.from({length:4},(_,i)=>{const a=spawn(i),car=world.oht();stage.add(car);return {a,car};});
    run=t=>{group.forEach(({a,car},i)=>{const x=-34+t*2.1+i*1.8,z=-2.985;car.position.set(x,3.71,z);car.rotation.y=Math.PI/2;a.set(x,z,Math.PI/2,{hanging:true,y:2.16});});return camera([-25.2+t*2.1,4.2,1.4],[-29.6+t*2.1,2.95,-2.985],{fov:43});};
  }else if(clip.id==='08-fashion'){
    const variants=[{head:'sprout',beauty:'eyes-round'},{head:'helmet-orange',face:'glasses'},{head:'bunny-ears',face:'heart-glasses',beauty:'eyes-squeeze'},{bag:'bag-star',head:'baby-chick'},{bag:'bag-turtle',face:'goggles'},{bag:'bag-bear'},{head:'crown',bag:'bag-wings',suit:'suit-black',face:'sunglasses'}].map((outfit,i)=>spawn(i,{outfit}));
    for(let i=0;i<7;i++)cue.push({t:clip.start+i*1.05+.1,kind:'chip',gain:.3});
    run=t=>{const index=Math.min(6,Math.floor(t/1.05)),local=t-index*1.05;variants.forEach((a,i)=>{a.a.root.visible=i===index;const back=[3,4,5].includes(index);a.set(-28.7,0,(back?Math.PI:0)+Math.sin(local*2)*.35,{posture:'stand',snap:true});});const close=t>7.25;return camera([-28.7+(close?.15:1),close?1.35:1.7,close?2.1:3.5],[-28.7,close?1.15:.9,0],{fov:close?42:43});};
  }else{
    const people=Array.from({length:8},(_,i)=>spawn(i));
    const emotes=people.map((a,i)=>{const view=createEmoteView(THREE,stage),plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide}));plane.visible=false;stage.add(plane);return {view,plane,id:['heart','laugh','wave','cry','angry','surprise','heart','laugh'][i]};});
    run=t=>{const end=clip.id==='10-end',shot=camera([-28.7+(end?.3:1.2),end?4.1:3.3,end?6.9:6],[-28.7,.55,0],{fov:48}),lens=lookCamera(shot);people.forEach((a,i)=>{const x=-28.7+(i%4-1.5)*.85,z=(Math.floor(i/4)-.5)*1.05;const pose=end?(i%3===0?'sit':'stand'):t>1+i*.13?(i%3===0?'lie':'sit'):'stand';a.set(x,z,Math.sin(i)*.2,{posture:pose});const e=emotes[i];if(t>(end?.3:1.5)+i*.11)e.view.set(e.id,1,3);e.view.update(a.a,pose,dt);e.plane.visible=e.view.sprite.visible;e.plane.position.copy(e.view.sprite.position);e.plane.quaternion.copy(lens.quaternion);e.plane.scale.copy(e.view.sprite.scale);e.plane.material.map=e.view.sprite.material.map;e.plane.material.opacity=e.view.sprite.material.opacity;});return shot;};
  }
  // Like a removable set wall, omit the foreground row only for close cameras.
  // The game, model shapes and its collision/navigation data are unchanged.
  const foreground=Number(clip.id.slice(0,2))>=3?world.allMachines.filter(m=>m.z>2&&m.z<10).map(m=>m.id):[];
  for(let f=0;f<Math.round(clip.duration*FPS);f++){const t=f/FPS,view=run(t);damage.update(dt);frames.push(exporter.collect(stage));cameras.push(view);hidden.push([...damage.state.destroyedIds,...foreground]);}
  await exporter.saveClip(clip.id,frames,cameras,{start:clip.start,hiddenEquipment:hidden});
  for(const a of actors)a.dispose();damage.dispose();
}
await exporter.save(staticObjects);
await writeFile(ROOT+'/timeline.json',JSON.stringify({fps:FPS,width:1080,height:1920,duration:offset,watermark:'< fab.semitoon.com >',clips,cues:cue,sourceRevision:'58810de',method:'Original Three.js game geometry and animation sampled for an isolated Blender film scene'},null,2));
for(const kind of ['press','explosion','throw','shatter','sweep','chip','complete']){const data=kind==='press'?createEmoPressSound():kind==='explosion'?createExplosionSound():createMotionSound(kind);await writeFile(`${ROOT}/${kind}.f32`,Buffer.from(data.buffer));}
console.log(JSON.stringify({done:true,clips:clips.filter(c=>!selected||selected.includes(c.id)).map(c=>c.id),geometries:exporter.geometries.length,materials:exporter.materials.length,textures:exporter.textures.length}));
