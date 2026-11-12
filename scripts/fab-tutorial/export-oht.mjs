// Record the real local game's boarding / riding / dismount state machine.
// No browser, multiplayer connection, hand-animated substitute or live account.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {FilmExporter,installCanvas} from '../fab-promo/export-utils.mjs';
import {createFilmWorld} from '../fab-promo/source-world.mjs';
import {createAvatar} from '../../src/avatar.js';
import {createAvatarAppearance} from '../../src/avatar-appearance.js';
import {DEFAULT_OUTFIT} from '../../src/cosmetics-catalog.js';
import {createFleet} from '../../src/network-transport.js';
import {createExplorer} from '../../src/explorer.js';
import {createPlayActions,boardingMachine,boardingApproach} from '../../src/play-actions.js';
import {VEHICLE_Y,RAIL_Y,isBlocked} from '../../src/layout.js';

installCanvas();Object.assign(document,{hidden:false,getElementById:()=>({classList:{contains:()=>true,add(){},remove(){}}}),addEventListener(){},removeEventListener(){}});
globalThis.window={addEventListener(){}};
const root=fileURLToPath(new URL('../../outputs/tutorial-20261112/oht-boarding/',import.meta.url)).replaceAll('\\','/');
const exporter=new FilmExporter(root);await exporter.init();
const fleet=createFleet(1),vehicle=fleet.vehicles[0],machine=boardingMachine(vehicle.state.car),approach=boardingApproach(vehicle.state.car);
fleet.detachCargo(vehicle.id);fleet.holdVehicle(vehicle.id,true);
const world=await createFilmWorld({bayIds:[machine.bayId]}),stage=new THREE.Scene();
world.rails.visible=false;
const railZ=vehicle.state.car.z;
for(const side of [-1,1]){
  const rail=new THREE.Mesh(new THREE.BoxGeometry(59,.12,.075),new THREE.MeshStandardMaterial({color:'#8da5a6',metalness:.6,roughness:.35}));
  rail.position.set(-30,RAIL_Y,railZ+side*.19);world.scene.add(rail);
}
const avatar=createAvatar(THREE),appearance=createAvatarAppearance(THREE,avatar);stage.add(avatar.root);
appearance.setOutfit({...DEFAULT_OUTFIT,head:'helmet-orange',suit:'suit-blue'},'visitor');
const carModel=world.oht();stage.add(carModel);
const camera=new THREE.PerspectiveCamera(55,9/16,.05,200),listeners=new Map(),messages=[];
const canvas={addEventListener(k,v){listeners.set(k,v);},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920})};
let play;
const explorer=createExplorer({THREE,camera,scene:stage,canvas,avatar,orbit:{target:new THREE.Vector3(),update(){}},colliders:[],vehicles:[{state:vehicle.state}],onMode(){},onInspect(){},onToast:t=>messages.push(t),onActionTap:ray=>play.tap(ray)});
explorer.state.position.set(approach.x,0,approach.z+.16);
const materials=Object.fromEntries(['foup','foupDoor','dark','foupRib'].map(k=>[k,new THREE.MeshStandardMaterial()]));
play=createPlayActions({THREE,scene:stage,materials,fleet,explorer,avatar,initialPortIds:[],hideOriginal(){},showOriginal(){},isDestroyed:()=>false,toast:t=>messages.push(t)});
const frames=[],cameras=[],phases=[],poses=[],targets=[],hiddenEquipment=[];
let boarded=false,dismounted=false;
for(let f=0;f<120;f++){
  if(f===6){assert.equal(play.requestBoard(vehicle.id),true);boarded=true;}
  if(f===88){assert.equal(play.state.phase,'riding');assert.equal(play.dismount(),true);dismounted=true;}
  // 2x playback of the original state machine; each game step stays at 60 Hz.
  for(let k=0;k<4;k++){if(boarded){fleet.step(1/60);play.update(1/60);}explorer.update(1/60);}
  appearance.update();
  const car=vehicle.state.car,p=explorer.state.position;
  carModel.position.set(car.x,VEHICLE_Y,car.z);carModel.rotation.y=car.yaw;
  cameras.push({position:[p.x-3.8,3.9,railZ+7.1],target:[p.x,2.05,railZ],fov:55,up:[0,1,0],ortho:null});
  phases.push(play.state.phase);poses.push({x:p.x,y:p.y,z:p.z,carX:car.x,carZ:car.z,passenger:Boolean(vehicle.passenger)});
  targets.push([car.x,VEHICLE_Y+.23,car.z]);frames.push(exporter.collect(stage));
  hiddenEquipment.push(world.allMachines.filter(m=>m.z>railZ+1&&m.z<railZ+12).map(m=>m.id));
}
assert(boarded&&dismounted);assert(phases.includes('climb')&&phases.includes('riding')&&phases.includes('fall'));
assert.equal(phases.at(-1),'idle');assert.equal(poses.at(-1).y,0);
assert(!isBlocked(poses.at(-1).x,poses.at(-1).z,.295));
const ride=poses.filter((p,i)=>phases[i]==='riding'),distance=Math.hypot(ride.at(-1).x-ride[0].x,ride.at(-1).z-ride[0].z);assert(distance>2);
await exporter.saveClip('boarding',frames,cameras,{phases,poses,targets,hiddenEquipment});
await exporter.save(exporter.collect(world.scene));
await writeFile(root+'/verification.json',JSON.stringify({frames:120,seconds:4,playbackSpeed:2,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actualModules:['src/play-actions.js','src/explorer.js','src/network-transport.js','src/avatar.js'],phases:[...new Set(phases)],ridingDistance:distance,landedOnWalkableFloor:true,network:false,method:'Local game controller simulation rendered offline; not a browser screen recording'},null,2));
play.dispose();appearance.dispose();avatar.dispose();for(const material of Object.values(materials))material.dispose();
console.log('OHT_BOARDING_READY',JSON.stringify({phases:[...new Set(phases)],distance,final:poses.at(-1)}));
