import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {machines,bays,TOOL_SCALE_X,SEATED_FOUP_Y,VEHICLE_Y,RAIL_Y} from '../../src/layout.js';
import {processFamilies,buildEquipmentCatalog} from '../../src/equipment-catalog.js';
import {reservedPortIds} from '../../src/network-transport.js';
import {railPaths} from '../../src/rail-network.js';
import {createEmoControls} from '../../src/emo-controls.js';

// Reuse the shipped cabinet/FOUP/OHT builders verbatim in a separate film scene.
// This module never imports the live main entry point or contacts a game server.
export async function createFilmWorld({bayIds=[3,4,5,13]}={}) {
  const source=await readFile(new URL('../../src/main.js',import.meta.url),'utf8');
  const slice=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);if(start<0||end<0)throw new Error('Game builder boundary changed: '+a);return source.slice(start,end);};
  const scene=new THREE.Group(),roots=new Map();
  const code=`${slice('const mat =','const boxGeometry =')}
    const boxGeometry=new THREE.BoxGeometry(1,1,1),cylinderGeometry=new THREE.CylinderGeometry(1,1,1,16),planeGeometry=new THREE.PlaneGeometry(1,1);
    let currentRoot=scene,buildingPortId=null;const initialPortIds=[],colliders=[],machinePositions=[],vehicles=[];
    const equipmentById=new Map(buildEquipmentCatalog(machines).map(m=>[m.id,m]));
    const renderer={capabilities:{getMaxAnisotropy:()=>1}};
    function solid(geometry,material,x,y,z,sx,sy,sz,rotationY=0){const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.y=rotationY;o.userData.portId=buildingPortId;currentRoot.add(o);return o;}
    const box=(m,x,y,z,sx,sy,sz,ry=0)=>solid(boxGeometry,m,x,y,z,sx,sy,sz,ry);
    const cyl=(m,x,y,z,r,h)=>solid(cylinderGeometry,m,x,y,z,r,h,r);
    function mesh(parent,g,m,x,y,z,sx,sy,sz){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);if(g===planeGeometry&&m===aoMat)o.name='shadow';(parent===scene?currentRoot:parent).add(o);return o;}
    ${slice('function canvasTexture(','// A continuous cleanroom floor.')}
    ${slice('const screenTexture =','for (const layout of layoutMachines)')}
    ${slice('function movingFoup(','const fleet = createFleet()')}
    ${slice('function createOHT(','for (const controller of fleet.vehicles)')}
    return {M,scene,build(layout){const root=new THREE.Group();root.name='equipment:'+layout.id;scene.add(root);currentRoot=root;machine(layout,{...processFamilies[layout.familyIndex],material:M[processFamilies[layout.familyIndex].materialKey]});return root;},
      foup(){const p=new THREE.Group();const o=movingFoup(p);return o;},oht(){currentRoot=scene;createOHT({state:{car:{x:0,z:0}}});const v=vehicles.pop();v.root.removeFromParent();v.foup.removeFromParent();return v.root;}};`;
  const model=new Function('THREE','scene','machines','TOOL_SCALE_X','SEATED_FOUP_Y','VEHICLE_Y','reservedPortIds','processFamilies','buildEquipmentCatalog',code)(THREE,scene,machines,TOOL_SCALE_X,SEATED_FOUP_Y,VEHICLE_Y,reservedPortIds,processFamilies,buildEquipmentCatalog);
  for(const m of machines.filter(m=>bayIds.includes(m.bayId))){const root=model.build(m);roots.set(m.id,root);const emo=createEmoControls({THREE,scene:root,machines:[m]});root.userData.emo=emo;}
  scene.updateMatrixWorld(true);
  // Merge static parts by material inside each cabinet. Whole cabinets can still
  // disappear independently when the original destruction animation takes over.
  for(const root of roots.values()){
    const batches=new Map(),remove=[],matrix=new THREE.Matrix4();
    root.traverse(o=>{if(!o.isMesh||o.material.transparent)return;if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);const g=o.geometry.clone().applyMatrix4(o.matrixWorld.clone().multiply(matrix));const list=batches.get(o.material)??[];list.push(g);batches.set(o.material,list);}}else{const list=batches.get(o.material)??[];list.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batches.set(o.material,list);}remove.push(o);});
    for(const o of remove)o.removeFromParent();
    for(const [material,parts]of batches){const geometry=mergeGeometries(parts,false);const mesh=new THREE.Mesh(geometry,material);mesh.name=root.name;root.add(mesh);for(const p of parts)p.dispose();}
  }
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,180),new THREE.MeshStandardMaterial({color:'#cedcde',roughness:.7,metalness:.12}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;floor.name='cleanroom-floor';scene.add(floor);
  function cube(material,x,y,z,sx,sy,sz,ry=0){const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);o.position.set(x,y,z);o.rotation.y=ry;scene.add(o);return o;}
  const seam=new THREE.MeshStandardMaterial({color:'#b0c5c9',roughness:.9});
  for(let x=-60;x<=60;x+=1.2)cube(seam,x,-.012,0,.009,.003,180);
  for(let z=-90;z<=90;z+=1.2)cube(seam,0,-.012,z,120,.003,.009);
  for(let z=-87;z<88;z+=3)for(const x of [-2.35,2.35])cube(model.M.accent,x,.002,z,.045,.004,1.55);
  const rails=new THREE.Group();rails.name='OHT rail network';scene.add(rails);
  for(const path of railPaths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];if(Math.abs((a.z+b.z)/2)>30)continue;
    const angle=Math.atan2(b.x-a.x,b.z-a.z),length=Math.hypot(b.x-a.x,b.z-a.z);
    for(const offset of [-.19,.19]){const o=cube(model.M.rail,(a.x+b.x)/2+Math.cos(angle)*offset,RAIL_Y,(a.z+b.z)/2-Math.sin(angle)*offset,.075,.12,length+.008,angle);rails.attach(o);}
  }
  return {...model,roots,rails,bay:bays[4],machines:machines.filter(m=>m.bayId===4),allMachines:machines.filter(m=>bayIds.includes(m.bayId))};
}
