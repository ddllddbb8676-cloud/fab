import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {REST_AREAS} from './rest-area.js';

export function createRestAreaView(THREE,scene) {
  RectAreaLightUniformsLib.init();
  const root=new THREE.Group();root.name='Green rest zones';scene.add(root);
  const ceiling=new THREE.Group();root.add(ceiling);
  const floorMaterial=new THREE.MeshStandardMaterial({color:'#c4e4d0',roughness:.9,metalness:0});
  const lineMaterial=new THREE.MeshBasicMaterial({color:'#40976d'}),lampMaterial=new THREE.MeshStandardMaterial({color:'#b2ffd0',emissive:'#4aff8b',emissiveIntensity:2,roughness:.5});
  const plane=new THREE.PlaneGeometry(1,1),cube=new THREE.BoxGeometry(1,1,1);
  const floors=new THREE.InstancedMesh(plane,floorMaterial,REST_AREAS.length),lines=new THREE.InstancedMesh(cube,lineMaterial,REST_AREAS.length*4),lamps=new THREE.InstancedMesh(cube,lampMaterial,REST_AREAS.length*2);
  root.add(floors,lines);ceiling.add(lamps);const transform=new THREE.Object3D();let lineIndex=0,lampIndex=0;
  function box(mesh,index,x,y,z,w,h,d){transform.position.set(x,y,z);transform.rotation.set(0,0,0);transform.scale.set(w,h,d);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);}
  let signMaterial;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#e6f5eb';ctx.fillRect(0,0,1024,256);ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#286a48';ctx.font='600 72px Arial, sans-serif';ctx.fillText('초록 ZONE',512,94);
    ctx.font='36px Arial, sans-serif';ctx.fillText('안전팀 출입 금지 · 편하게 쉬세요',512,187);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    signMaterial=new THREE.MeshBasicMaterial({map:texture});
  }
  for(const [i,area] of REST_AREAS.entries()){
    const width=area.maxX-area.minX,depth=area.maxZ-area.minZ,x=(area.minX+area.maxX)/2,z=(area.minZ+area.maxZ)/2;
    transform.position.set(x,.008,z);transform.rotation.set(-Math.PI/2,0,0);transform.scale.set(width,depth,1);transform.updateMatrix();floors.setMatrixAt(i,transform.matrix);
    for(const edge of [area.minX+.06,area.maxX-.06])box(lines,lineIndex++,edge,.014,z,.07,.008,depth-.12);
    for(const edge of [area.minZ+.06,area.maxZ-.06])box(lines,lineIndex++,x,.014,edge,width-.12,.008,.07);
    for(const edge of [area.minX+.6,area.maxX-.6])box(lamps,lampIndex++,edge,4.87,z,.17,.04,depth-.5);
    if(signMaterial){const sign=new THREE.Mesh(plane,signMaterial),w=Math.min(3.6,width-.3);sign.scale.set(w,w/4,1);sign.position.set(x,.022,z);sign.rotation.x=-Math.PI/2;root.add(sign);}
  }
  for(const mesh of [floors,lines,lamps])mesh.computeBoundingSphere();
  const glowMaterial=new THREE.MeshBasicMaterial({color:'#42ff99',transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
  const beams=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.34,3.5,12,1,true),glowMaterial,REST_AREAS.length);
  const beaconMaterial=new THREE.MeshBasicMaterial({color:'#6affad',fog:false});
  const beacons=new THREE.InstancedMesh(new THREE.TorusGeometry(.45,.055,6,24),beaconMaterial,REST_AREAS.length);
  beams.name='Green refuge light columns';beacons.name='Green refuge ceiling beacons';root.add(beams);ceiling.add(beacons);
  for(const [i,area] of REST_AREAS.entries()){
    const x=(area.minX+area.maxX)/2,z=(area.minZ+area.maxZ)/2;
    transform.position.set(x,2.45,z);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);transform.updateMatrix();beams.setMatrixAt(i,transform.matrix);
    transform.position.y=4.25;transform.rotation.x=-Math.PI/2;transform.updateMatrix();beacons.setMatrixAt(i,transform.matrix);
  }
  beams.computeBoundingSphere();beacons.computeBoundingSphere();
  // Reuse one actual light near the camera; distant zones retain green lamps
  // and beacons without adding a light calculation per zone on mobile.
  const light=new THREE.RectAreaLight('#48ff8b',7,4,7.5);light.name='Nearby green zone light';light.rotation.x=-Math.PI/2;ceiling.add(light);
  function update(point){
    const area=REST_AREAS.reduce((best,a)=>Math.hypot(point.x-(a.minX+a.maxX)/2,point.z-(a.minZ+a.maxZ)/2)<Math.hypot(point.x-(best.minX+best.maxX)/2,point.z-(best.minZ+best.maxZ)/2)?a:best);
    light.position.set((area.minX+area.maxX)/2,4.8,(area.minZ+area.maxZ)/2);
    light.width=area.maxX-area.minX-.4;light.height=area.maxZ-area.minZ-.5;
    light.intensity=7*Math.max(0,Math.min(1,(28-Math.hypot(point.x-light.position.x,point.z-light.position.z))/10));
  }
  update({x:0,z:78.8});
  return {root,light,update,setOverview(value){ceiling.visible=!value;beams.visible=!value;}};
}
