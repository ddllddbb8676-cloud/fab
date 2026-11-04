import {stockers,stockerPoint,STOCKER_SIZE,STOCKER_TRANSFER_SECONDS} from './stocker-layout.js';

// Shared boxes keep six tall cabinets inexpensive on mobile. The narrow front
// and long, panelled sides follow carrier-stockers, not a tool's wide EFEM.
export function createStockerView(THREE,scene,{makeCanvas=()=>document.createElement('canvas')}={}){
  const root=new THREE.Group();root.name='carrier-stockers';scene.add(root);
  const geometry=new THREE.BoxGeometry(1,1,1),batches=new Map(),labels=[],moving=[];
  const mats={
    shell:new THREE.MeshStandardMaterial({color:0xe0e7e8,roughness:.68}),
    trim:new THREE.MeshStandardMaterial({color:0x8a9ea4,metalness:.35,roughness:.4}),
    dark:new THREE.MeshStandardMaterial({color:0x344b57,roughness:.6}),
    panel:new THREE.MeshStandardMaterial({color:0xc4d1d5,roughness:.72}),
    teal:new THREE.MeshBasicMaterial({color:0x33757d}),
    glass:new THREE.MeshBasicMaterial({color:0x8eb5be,transparent:true,opacity:.16,depthWrite:false}),
    light:new THREE.MeshBasicMaterial({color:0xb2dfd7})
  };
  const dummy=new THREE.Object3D();
  function box(s,kind,x,y,z,w,h,d){
    const p=stockerPoint(s,x,y,z);dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,s.yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();
    if(!batches.has(kind))batches.set(kind,[]);batches.get(kind).push(dummy.matrix.clone());
  }
  function label(s,text,x,y,z,w,h){
    const canvas=makeCanvas();canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');
    c.fillStyle='#edf2f2';c.fillRect(0,0,512,128);c.fillStyle='#284e59';c.textAlign='center';c.textBaseline='middle';c.font='700 82px Arial,sans-serif';c.fillText(text,256,68);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture}),plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material),p=stockerPoint(s,x,y,z);
    plane.position.set(p.x,p.y,p.z);plane.rotation.y=s.yaw;root.add(plane);labels.push(plane);
  }
  for(const s of stockers){
    const h=STOCKER_SIZE.height;
    box(s,'dark',0,.12,0,2.6,.24,6.2);
    box(s,'shell',0,h-.12,0,2.6,.24,6.2);
    box(s,'shell',0,h/2,-3.04,2.6,h,.12);
    // Tall uninterrupted upper front, small lower transfer openings.
    box(s,'shell',0,3.5,3.04,2.6,2.76,.12);
    box(s,'shell',0,.73,3.04,2.6,1.46,.12);
    for(const x of [-1.23,0,1.23])box(s,'trim',x,h/2,3.108,.065,h,.045);
    for(const y of [2.12,3.03,3.94])box(s,'trim',0,y,3.108,2.6,.025,.025);
    label(s,s.id,0,4.4,3.115,1.72,.43);
    // Long side panels with slender inspection panes; no exposed wafer faces.
    for(const side of [-1,1]){
      box(s,'shell',side*1.25,.44,0,.1,.64,6.2);
      box(s,'shell',side*1.25,4.52,0,.1,.48,6.2);
      for(const z of [-3,-1.48,.04,1.56,3])box(s,'shell',side*1.25,2.49,z,.1,3.5,.24);
      for(const z of [-2.25,-.73,.79,2.28]){
        box(s,'glass',side*1.25,2.49,z,.025,3.5,1.25);
        for(const y of [.76,4.25])box(s,'trim',side*1.27,y,z,.035,.035,1.25);
      }
      for(let level=0;level<6;level++)box(s,'trim',side*.82,.475+level*.65,-.63,.65,.035,4.85);
    }
    // Internal vertical lift, visible through inspection windows.
    box(s,'trim',0,2.44,-.25,.12,4.6,.12);
    const lift=new THREE.Mesh(geometry,mats.panel),p=stockerPoint(s,0,1.47,1.7);
    lift.position.set(p.x,p.y,p.z);lift.rotation.y=s.yaw;lift.scale.set(.7,.08,.78);root.add(lift);
    const shutters=[];
    for(let i=0;i<2;i++){
      const x=(i-.5)*1.24;
      box(s,'dark',x,1.8,3.05,.91,.65,.13);
      box(s,'panel',x,.8,3.4,.66,1.34,.6);
      box(s,'trim',x,1.425,3.45,.74,.075,.7);
      box(s,'dark',x,1.474,3.45,.57,.02,.48);
      box(s,'teal',x,1.23,3.715,.42,.06,.012);
      label(s,i?'OUT':'IN',x,2.3,3.12,.76,.25);
      // Slide behind the upper front panel so an open door never covers IN/OUT.
      const shutter=new THREE.Mesh(geometry,mats.panel),p=stockerPoint(s,x,1.81,3.08);
      shutter.position.set(p.x,p.y,p.z);shutter.rotation.y=s.yaw;shutter.scale.set(.84,.62,.035);root.add(shutter);shutters.push(shutter);
    }
    box(s,'light',1.08,4.57,3.12,.06,.13,.03);
    moving.push({s,lift,shutters});
  }
  for(const [kind,matrices]of batches){const mesh=new THREE.InstancedMesh(geometry,mats[kind],matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);}
  function update(store){
    const active=new Map(),ready=new Set();
    for(const r of store.records.values()){if(r.mode==='stocking'||r.mode==='retrieving')active.set(r.stockerId,r);else if(r.mode==='stocker-out')ready.add(r.stockerId);}
    for(const {s,lift,shutters}of moving){
      const r=active.get(s.id);
      const t=r?Math.min(1,r.stockAge/STOCKER_TRANSFER_SECONDS):0;
      const inOpen=r?.mode==='stocking'&&t<.55,outOpen=r?.mode==='retrieving'&&t>.35||ready.has(s.id);
      shutters[0].position.y=inOpen?2.43:1.81;shutters[1].position.y=outOpen?2.43:1.81;
      if(r){lift.position.y=r.y-.23;const p=stockerPoint(s,0,0,(r.mode==='retrieving'?t:1-t)*2.4-.2);lift.position.x=p.x;lift.position.z=p.z;}
    }
  }
  return {root,update,dispose(){scene.remove(root);geometry.dispose();for(const m of Object.values(mats))m.dispose();for(const p of labels){p.material.map.dispose();p.material.dispose();p.geometry.dispose();}}};
}
