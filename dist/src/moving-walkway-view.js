import { WALKWAY_LANES, WALKWAY_SPEED } from './moving-walkway.js?v=35964c9802b1';

export function createMovingWalkwayView(THREE, scene) {
  const root = new THREE.Group(); root.name = 'moving-walkways'; scene.add(root);
  const overlay=document.createElement('canvas');overlay.setAttribute('aria-hidden','true');overlay.className='walkway-overview-arrows';
  overlay.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:1';document.body.append(overlay);
  const projected=new THREE.Vector3(),projectedAhead=new THREE.Vector3();let lastOverlay=0;
  const belts = [];
  for (const lane of WALKWAY_LANES) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#567079'; ctx.fillRect(0,0,128,128);
    ctx.fillStyle = '#70858b';
    for (let y=0;y<128;y+=16) ctx.fillRect(0,y,128,2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1,(lane.maxZ-lane.minZ)/2);
    const length = lane.maxZ-lane.minZ;
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(lane.width,length), new THREE.MeshBasicMaterial({map:texture}));
    belt.rotation.x = -Math.PI/2; belt.position.set(lane.x,.008,(lane.minZ+lane.maxZ)/2); root.add(belt);
    belts.push({texture,lane});
    const border = new THREE.MeshBasicMaterial({color:lane.colour});
    for (const side of [-1,1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(.055,length),border);
      line.rotation.x = -Math.PI/2; line.position.set(lane.x+side*(lane.width/2-.0275),.012,belt.position.z); root.add(line);
    }
    // Broad, repeated arrows remain readable from a full-hall top view.
    const shape = new THREE.Shape();
    shape.moveTo(0,.85); shape.lineTo(-.49,.12); shape.lineTo(-.21,.12);
    shape.lineTo(-.21,-.65); shape.lineTo(.21,-.65); shape.lineTo(.21,.12); shape.lineTo(.49,.12); shape.closePath();
    const count = Math.floor(length/7), arrows = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({color:'#e8f8eb'}),count);
    const marker = new THREE.Object3D(); marker.rotation.x=-Math.PI/2; marker.rotation.z=lane.direction<0?0:Math.PI;
    for(let i=0;i<count;i++){marker.position.set(lane.x,.016,lane.minZ+4+i*7);marker.updateMatrix();arrows.setMatrixAt(i,marker.matrix);}
    root.add(arrows);
  }
  let time=0;
  return {root, update(dt,paused=false,reducedMotion=false){if(paused||reducedMotion)return;time=(time+dt)%100;for(const {texture,lane} of belts)texture.offset.y=lane.direction*time*WALKWAY_SPEED/2;},
    overview(camera,visible,width,height){
      overlay.style.display=visible?'block':'none';if(!visible)return;
      const now=performance.now();if(now-lastOverlay<100&&overlay.width===width&&overlay.height===height)return;lastOverlay=now;
      if(overlay.width!==width||overlay.height!==height){overlay.width=width;overlay.height=height;}
      const ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);
      WALKWAY_LANES.forEach((lane,index)=>{
        // Stagger opposite directions so both remain legible at full-hall scale.
        for(const z of index?[-30,20,65]:[-55,-5,45]){
          projected.set(lane.x,.02,z).project(camera);projectedAhead.set(lane.x,.02,z+lane.direction*2).project(camera);
          if(projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)continue;
          const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
          const dx=(projectedAhead.x-projected.x)*width,dz=-(projectedAhead.y-projected.y)*height;
          ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dz,dx)+Math.PI/2);
          ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,0);ctx.lineTo(2.5,0);ctx.lineTo(2.5,7);ctx.lineTo(-2.5,7);ctx.lineTo(-2.5,0);ctx.lineTo(-6,0);ctx.closePath();
          ctx.strokeStyle='#f8ffff';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();ctx.fillStyle=lane.colour;ctx.fill();ctx.restore();
        }
      });
    }};
}

export function drawWalkwayMap(ctx,mx,mz,sx,sz) {
  for(const lane of WALKWAY_LANES){
    ctx.fillStyle=lane.colour;
    ctx.fillRect(mx(lane.x-lane.width/2),mz(lane.minZ),Math.max(2,lane.width*sx),(lane.maxZ-lane.minZ)*sz);
    ctx.strokeStyle='#254f5b';ctx.lineWidth=1.5;
    for(let z=lane.minZ+12;z<lane.maxZ;z+=25){const x=mx(lane.x),y=mz(z),d=lane.direction;ctx.beginPath();ctx.moveTo(x-2,y-d*3);ctx.lineTo(x,y);ctx.lineTo(x+2,y-d*3);ctx.stroke();}
  }
}
