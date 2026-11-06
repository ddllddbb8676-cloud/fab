import {CART_SIZE} from './cart-layout.js?v=35964c9802b1';

export function createCartView(THREE,scene,id='CART01'){
  const root=new THREE.Group();root.name=`FOUP trolley ${id}`;scene.add(root);
  const steel=new THREE.MeshStandardMaterial({color:'#b5c8cb',metalness:.72,roughness:.26});
  const tray=new THREE.MeshStandardMaterial({color:'#d7e3e1',metalness:.4,roughness:.36});
  const dark=new THREE.MeshStandardMaterial({color:'#375b63',roughness:.7});
  const rubber=new THREE.MeshStandardMaterial({color:'#687d80',roughness:.85});
  const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3();
  const tubes=[],plates=[],pads=[];
  const tube=(x,y,z,X,Y,Z,r=.027)=>{start.set(x,y,z);end.set(X,Y,Z);transform.position.copy(start).add(end).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,end.clone().sub(start).normalize());transform.scale.set(r,start.distanceTo(end),r);transform.updateMatrix();tubes.push(transform.matrix.clone());};
  const box=(list,x,y,z,w,h,d)=>{transform.position.set(x,y,z);transform.rotation.set(0,0,0);transform.scale.set(w,h,d);transform.updateMatrix();list.push(transform.matrix.clone());};
  for(const x of [-.48,.48])for(const z of [-.77,.77])tube(x,.20,z,x,1.5,z);
  for(const y of [CART_SIZE.lower,CART_SIZE.upper]){
    box(plates,0,y-.025,0,1,.045,1.62);
    for(const x of [-.49,.49])tube(x,y+.045,-.8,x,y+.045,.8,.018);
    tube(-.49,y+.045,.8,.49,y+.045,.8,.018);
    for(const z of [-.44,.44])box(pads,0,y+.005,z,.52,.014,.47);
  }
  for(const x of [-.48,.48])tube(x,.95,.77,x,.87,CART_SIZE.handle);
  tube(-.48,.87,CART_SIZE.handle,.48,.87,CART_SIZE.handle,.033);
  box(pads,0,.87,CART_SIZE.handle,.65,.062,.064);
  function instances(geometry,material,matrices){const mesh=new THREE.InstancedMesh(geometry,material,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));root.add(mesh);return mesh;}
  instances(new THREE.CylinderGeometry(1,1,1,8),steel,tubes);
  instances(new THREE.BoxGeometry(1,1,1),tray,plates);
  instances(new THREE.BoxGeometry(1,1,1),dark,pads);
  const wheels=[],hubs=[];
  for(const x of [-.48,.48])for(const z of [-.77,.77]){
    transform.position.set(x,.115,z);transform.rotation.set(0,0,Math.PI/2);transform.scale.set(1,1,1);transform.updateMatrix();wheels.push(transform.matrix.clone());
    transform.scale.set(.72,1.08,.72);transform.updateMatrix();hubs.push(transform.matrix.clone());
  }
  instances(new THREE.CylinderGeometry(.115,.115,.075,12),rubber,wheels);
  instances(new THREE.CylinderGeometry(.115,.115,.075,12),steel,hubs);
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#32626b';ctx.fillRect(0,0,384,96);ctx.fillStyle='#f7fbfa';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(id.replace('CART','CART '),192,50);
  const label=new THREE.Mesh(new THREE.PlaneGeometry(.61,.15),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));
  label.position.set(0,CART_SIZE.upper-.085,-.82);label.rotation.y=Math.PI;root.add(label);
  const bounds=new THREE.Box3(new THREE.Vector3(-.58,0,-.87),new THREE.Vector3(.58,1.56,1.27));
  const inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),point=new THREE.Vector3();
  return {root,update(c){root.position.set(c.x,0,c.z);root.rotation.y=c.yaw;root.updateMatrixWorld(true);},
    hit(ray){inverse.copy(root.matrixWorld).invert();localRay.copy(ray).applyMatrix4(inverse);return localRay.intersectBox(bounds,point)?point.clone().applyMatrix4(root.matrixWorld):null;}};
}
