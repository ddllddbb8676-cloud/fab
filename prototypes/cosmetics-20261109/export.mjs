import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createAvatar} from '../../src/avatar.js';
import {FilmExporter,installCanvas} from '../../scripts/fab-promo/export-utils.mjs';
import {candidates} from './catalog.js';
import {equipCandidate} from './models.js';

installCanvas();
const root=fileURLToPath(new URL('../../outputs/cosmetics-20261109/',import.meta.url)).replaceAll('\\','/');
await mkdir(root,{recursive:true});
const exporter=new FilmExporter(root);await exporter.init();
const stats=[];
for(const item of candidates){
  const avatar=createAvatar(THREE);avatar.setSuitColor('#f6f8ef');
  avatar.update(0,{snap:true});const equipped=equipCandidate(THREE,avatar,item);
  equipped.update(.7);avatar.root.updateMatrixWorld(true);
  const objects=exporter.collect(avatar.root);
  let triangles=0,draws=0;avatar.root.traverse(o=>{if(o.isMesh&&o.name!=='shadow'){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const box=new THREE.Box3().setFromObject(avatar.root);
  const accessoryMeshes=[];equipped.root?.traverse(o=>{if(o.isMesh)accessoryMeshes.push(o);});
  stats.push({...item,avatarTriangles:triangles,avatarDrawCalls:draws,
    accessoryTriangles:accessoryMeshes.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3,0),
    accessoryDrawCalls:accessoryMeshes.length,bounds:box.getSize(new THREE.Vector3()).toArray()});
  const full={position:[2.1,1.65,4],target:[0,.88,0],up:[0,1,0],ortho:2.0,fov:45};
  let primary=full;
  if(item.slot==='head')primary={...full,position:[1.8,1.9,4],target:[0,1.26,0],ortho:1.15};
  if(item.slot==='face')primary={...full,position:[.65,1.4,4],target:[0,1.15,0],ortho:.79};
  if(item.slot==='bag')primary={...full,position:[1.3,1.5,-4],target:[0,.88,-.10],ortho:1.45};
  const alternate={...full,position:item.slot==='bag'?[-1.8,1.7,4]:[-2.1,1.65,-4]};
  const clip='item-'+String(item.number).padStart(2,'0');
  await exporter.saveClip(clip,[objects,objects],[primary,alternate],{hiddenEquipment:[[],[]],background:item.background});
  equipped.dispose();avatar.dispose();
}
await exporter.save([]);
await writeFile(root+'/manifest.json',JSON.stringify({count:candidates.length,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  status:'Unreleased review candidates',items:stats},null,2));
console.log('CATALOG_EXPORTED',stats.length);
