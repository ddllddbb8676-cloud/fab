// Local game physics and hit reaction for the revised tutorial.
// No browser controls, network, real accounts or persistent game state.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FilmExporter,installCanvas} from '../fab-promo/export-utils.mjs';
import {createFilmWorld} from '../fab-promo/source-world.mjs';
import {createAvatar} from '../../src/avatar.js';
import {createAvatarAppearance} from '../../src/avatar-appearance.js';
import {DEFAULT_OUTFIT} from '../../src/cosmetics-catalog.js';
import {createFoupStore} from '../../src/foup-play.js';
import {createFoupDebris} from '../../src/foup-debris.js';
import {createEmoteView} from '../../src/emote-view.js';
import {firstFoupFlightHit} from '../../server/safety-flight-hit.js';
import {isFoupHitTarget,markFoupDizzy,SAFETY_DIZZY_SECONDS} from '../../src/safety-dizzy.js';
import {isBlocked} from '../../src/layout.js';
import {canWalkSegment} from '../../src/walking.js';

installCanvas();
const root=fileURLToPath(new URL('../../outputs/tutorial-20261112/ui-revision/hit/',import.meta.url)).replaceAll('\\','/');
const exporter=new FilmExporter(root);await exporter.init();
const world=await createFilmWorld({bayIds:[4,5]});world.rails.visible=false;
const stage=new THREE.Group(),frames=[],cameras=[],poses=[],phases=[],targets=[];
const shot={position:[-25.5,3.1,8.2],target:[-25.5,.95,0],fov:50,up:[0,1,0],ortho:null};
const lens=new THREE.PerspectiveCamera(shot.fov,9/16,.05,200);lens.position.fromArray(shot.position);lens.lookAt(...shot.target);lens.updateMatrixWorld();
const thrower={id:'demo-thrower',role:'visitor',x:-27,y:0,z:0,heading:Math.PI/2,phase:'idle',posture:'stand'};
const friend={id:'demo-friend',role:'visitor',x:-24,y:0,z:0,heading:-Math.PI/2,phase:'idle',posture:'stand'};
assert(!isBlocked(thrower.x,thrower.z,.295)&&!isBlocked(friend.x,friend.z,.295));
assert(canWalkSegment(thrower,friend)&&isFoupHitTarget(friend));
function person(actor,outfit){
  const avatar=createAvatar(THREE),appearance=createAvatarAppearance(THREE,avatar);stage.add(avatar.root);
  appearance.setOutfit({...DEFAULT_OUTFIT,...outfit},actor.role);
  return {avatar,update(dt,carrying=false){avatar.root.position.set(actor.x,actor.y,actor.z);avatar.root.userData.dizzyLeft=actor.dizzyLeft||0;avatar.update(dt,{heading:actor.heading,carrying,speed:0,posture:'stand'});appearance.update();},dispose(){appearance.dispose();avatar.dispose();}};
}
const a=person(thrower,{head:'helmet-orange',suit:'suit-blue'}),b=person(friend,{head:'bunny-ears',suit:'suit-pink'});
const foup=world.foup();stage.add(foup);
const debris=createFoupDebris(THREE,stage,{capacity:8}),emote=createEmoteView(THREE,stage);
// FilmExporter exports meshes; copy the game's billboard texture and transform.
const bubble=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide}));stage.add(bubble);
let time=0,impact=null;
const store=createFoupStore({ports:[],hitFlight:(record,from,to)=>firstFoupFlightHit(record,from,to,[thrower,friend]),onShatter:(record,targetId)=>{
  assert.equal(targetId,friend.id,'A body, rather than the floor, must stop the FOUP');
  assert(markFoupDizzy(friend,friend,time));
  impact={at:time,point:{x:record.x,y:record.y,z:record.z},reaction:friend.emote,dizzySeconds:friend.dizzyUntil-time};
}});
const record=store.adopt('demo-foup',{x:thrower.x+.34,y:.82,z:thrower.z,yaw:Math.PI/2});
assert(store.pickup(record.id,thrower.id));
const fps=30,seconds=6,throwAt=1.4;
for(let frame=0;frame<fps*seconds;frame++){
  if(frame===Math.round(throwAt*fps))assert(store.launch(record,{x:thrower.x+.34,y:.82,z:thrower.z,yaw:thrower.heading+Math.PI},{x:4.7,y:3.1,z:0},{shatter:true}));
  for(let step=0;step<2;step++){
    time+=1/60;store.step(1/60);
    friend.dizzyLeft=Math.max(0,(friend.dizzyUntil||0)-time);
    a.update(1/60,record.mode==='carried');b.update(1/60);
  }
  foup.visible=record.mode!=='broken';foup.position.set(record.x,record.y,record.z);foup.rotation.y=record.yaw;
  debris.update([record],{dt:1/fps,focus:friend,camera:lens});
  emote.set(friend.emote,friend.emoteSeq,friend.dizzyLeft,friend.id);emote.update(b.avatar,'stand',1/fps);
  bubble.visible=emote.sprite.visible;bubble.position.copy(emote.sprite.position);bubble.quaternion.copy(lens.quaternion);bubble.scale.copy(emote.sprite.scale);bubble.material.map=emote.sprite.material.map;bubble.material.opacity=emote.sprite.material.opacity;
  phases.push(record.mode==='carried'?'holding':record.mode==='flying'?'flight':friend.dizzyLeft>0?'dizzy':'recovered');
  poses.push({time,foup:{x:record.x,y:record.y,z:record.z,mode:record.mode},dizzyLeft:friend.dizzyLeft,angryVisible:bubble.visible});
  targets.push([friend.x,1.1,friend.z]);cameras.push(shot);frames.push(exporter.collect(stage));
}
assert(impact&&impact.at>throwAt&&impact.at<throwAt+1);assert.equal(impact.reaction,'angry');assert.equal(impact.dizzySeconds,SAFETY_DIZZY_SECONDS);assert.equal(phases.at(-1),'recovered');
assert(phases.includes('flight')&&phases.includes('dizzy'));
const hidden=world.allMachines.filter(m=>m.z>2&&m.z<10).map(m=>m.id);
await exporter.saveClip('throw-hit',frames,cameras,{phases,poses,targets,hiddenEquipment:frames.map(()=>hidden)});
await exporter.save(exporter.collect(world.scene));
await writeFile(root+'/verification.json',JSON.stringify({frames:frames.length,seconds,fps,throwAt,impact,phases:[...new Set(phases)],sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actualModules:['src/foup-play.js','server/safety-flight-hit.js','src/safety-dizzy.js','src/avatar.js','src/foup-debris.js','src/emote-view.js'],network:false,browserScreenRecording:false,method:'Local game physics and original avatar reaction; offline rendered insert. Current native UI capture remains separate.'},null,2));
a.dispose();b.dispose();debris.dispose();emote.dispose();bubble.geometry.dispose();bubble.material.dispose();
console.log('THROW_HIT_READY',JSON.stringify({seconds,impact,phases:[...new Set(phases)]}));
