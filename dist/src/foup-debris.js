// Deterministic fragments: every screen sees the same settled wafer shards.
const TAU=Math.PI*2;
export function foupDebrisPattern(id,sequence=0){
  let seed=2166136261;for(const c of `${id}:${sequence}`)seed=Math.imul(seed^c.charCodeAt(0),16777619);
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  return Array.from({length:8},(_,i)=>({angle:i/8*TAU+(random()-.5)*.4,distance:.34+random()*.52,delay:.055*i,lift:.36+random()*.38,spin:(random()-.5)*8,shade:i%3}));
}

export function createFoupDebris(THREE,scene,{capacity=1200,reducedMotion=false}={}){
  const group=new THREE.Group();group.name='FOUP wafer debris';scene.add(group);
  const transform=new THREE.Object3D(),color=new THREE.Color(),patterns=new Map(),previous=new Map(),clouds=new Map(),billboard=new THREE.Quaternion();
  const box=new THREE.BoxGeometry(1,1,1),disc=new THREE.CylinderGeometry(.155,.155,.012,24);
  // Four wafer sectors have a jagged broken edge and a small, real thickness.
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.022,.012);
  for(let i=0;i<=8;i++){const a=i/8*Math.PI*.47;shape.lineTo(Math.cos(a)*.155,Math.sin(a)*.155);}
  shape.lineTo(-.008,.02);shape.closePath();
  const shard=new THREE.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:false,steps:1});shard.rotateX(-Math.PI/2);
  const puff=new THREE.PlaneGeometry(2,2),pixels=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),alpha=Math.max(0,1-r*r)**2;const i=(y*32+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(alpha*255);pixels[i+3]=255;}
  const dustTexture=new THREE.DataTexture(pixels,32,32);dustTexture.needsUpdate=true;dustTexture.magFilter=THREE.LinearFilter;
  const shellMat=new THREE.MeshStandardMaterial({color:'#c8b995',roughness:.65,metalness:.12});
  const waferMat=new THREE.MeshStandardMaterial({color:'#8e91c8',roughness:.36,metalness:.4});
  const dustMat=new THREE.MeshBasicMaterial({color:'#a5a297',transparent:true,opacity:.68,alphaMap:dustTexture,depthWrite:false,side:THREE.DoubleSide});
  function batch(name,geometry,material,count){const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;}
  const panels=batch('FOUP broken case',box,shellMat,capacity*6),wafers=batch('Spilling wafers',disc,waferMat,64*8),shards=batch('Broken wafer pieces',shard,waferMat,capacity*3+64*32),dust=batch('Sweeping particle clouds',puff,dustMat,96*10);
  let clock=0,lastSignature='';
  function put(mesh,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,tint=null){
    if(mesh.count>=mesh.instanceMatrix.count)return;
    transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);if(mesh===dust)transform.quaternion.copy(billboard);transform.scale.set(sx,sy,sz);transform.updateMatrix();mesh.setMatrixAt(mesh.count,transform.matrix);
    if(tint)mesh.setColorAt(mesh.count,color.set(tint));mesh.count++;
  }
  const waferColors=['#8b79bb','#5e99a6','#b0a0d7'];
  const panelsSpec=[[.12,.025,.08,.42,.035,.31],[.26,.05,-.12,.30,.025,.24],[-.24,.04,.14,.20,.025,.31],[-.1,.045,-.22,.27,.028,.19],[.06,.06,.31,.32,.02,.12],[-.32,.055,-.10,.14,.045,.09]];
  function update(records,{dt=.016,focus={x:0,z:0},overview=false,camera=null}={}){
    clock+=Math.min(.1,Math.max(0,dt));
    if(camera)billboard.copy(camera.quaternion);
    const broken=[];let moving=false;
    for(const r of records){
      const prior=previous.get(r.id);if(prior?.mode==='broken'&&r.mode==='cleared')clouds.set(r.id,{x:prior.x,z:prior.z,at:clock});
      previous.set(r.id,{mode:r.mode,x:r.x,z:r.z});
      if(r.mode==='broken'){broken.push(r);if((r.damageAge||0)<2||r.cleaner)moving=true;}
    }
    for(const [id,c]of clouds)if(clock-c.at>1.1)clouds.delete(id);
    broken.sort((a,b)=>Math.hypot(a.x-focus.x,a.z-focus.z)-Math.hypot(b.x-focus.x,b.z-focus.z));
    const signature=`${overview}:${Math.round(focus.x/2)}:${Math.round(focus.z/2)}:`+broken.map(r=>`${r.id}/${r.breakSeq}/${r.x}/${r.z}`).join('|');
    if(!moving&&!clouds.size&&signature===lastSignature)return;
    lastSignature=moving||clouds.size?'':signature;
    panels.count=wafers.count=shards.count=dust.count=0;
    broken.slice(0,capacity).forEach((r,index)=>{
      const near=!overview&&index<64&&Math.hypot(r.x-focus.x,r.z-focus.z)<28;
      const key=`${r.id}:${r.breakSeq}`;let pattern=patterns.get(r.id);if(pattern?.key!==key){pattern={key,items:foupDebrisPattern(r.id,r.breakSeq)};patterns.set(r.id,pattern);}
      const age=reducedMotion?2:r.damageAge??2,progress=r.cleanProgress||0,fade=1-Math.max(0,(progress-.62)/.38),size=Math.max(.001,fade);
      for(let i=0;i<(near?6:2);i++){
        const [x,y,z,sx,sy,sz]=panelsSpec[i],t=Math.min(1,age/.65),fly=near?Math.sin(t*Math.PI)*(.24+i*.025):0;
        put(panels,r.x+x*t,r.y+y+fly,r.z+z*t,sx*size,sy*size,sz*size,Math.sin(t*Math.PI)*2,i*.8+(1-t)*2,0,i===1?'#9c7a48':'#c8b995');
      }
      for(const [i,p]of pattern.items.entries()){
        if(!near&&i>=3)break;
        const t=Math.max(0,Math.min(1,(age-p.delay)/.78)),spread=t*(2-t),x=r.x+Math.sin(p.angle)*p.distance*spread,z=r.z+Math.cos(p.angle)*p.distance*spread;
        if(t<.88&&near){
          put(wafers,x,.07+Math.sin(t*Math.PI)*p.lift+(1-t)*.14,z,size,size,size,t*.9,0,t*p.spin,waferColors[p.shade]);
        }else{
          const split=Math.min(1,Math.max(0,(t-.88)/.12));
          for(let j=0;j<(near?4:1);j++){const a=p.angle+j*Math.PI/2,drift=.075*split;
            put(shards,x+Math.cos(a+Math.PI/4)*drift,.025+i*.0015+Math.sin(split*Math.PI)*.045,z-Math.sin(a+Math.PI/4)*drift,size,size,size,0,a,0,waferColors[p.shade]);}
        }
      }
      if(r.cleaner&&near&&!reducedMotion){
        for(let i=0;i<10;i++){
          const life=(clock*1.05+i*.17)%1,scale=Math.sin(life*Math.PI)*(.20+i*.016),heading=r.cleanHeading||0;
          const direction=Math.cos((progress*3.2-life*.6)*TAU*1.25),side=direction*(.2+life*.85),forward=Math.sin(i*2.4)*life*.25;
          put(dust,r.x+Math.cos(heading)*side+Math.sin(heading)*forward,.08+life*.65,r.z-Math.sin(heading)*side+Math.cos(heading)*forward,scale*1.25,scale,scale);
        }
      }
    });
    if(!reducedMotion)for(const c of [...clouds.values()].slice(0,48)){
      const t=Math.min(1,(clock-c.at)/1.1);for(let i=0;i<9;i++){const a=i/9*TAU,s=(1-t)*(.22+t*.18);put(dust,c.x+Math.sin(a)*(.22+t*.7),.17+t*.7,c.z+Math.cos(a)*(.2+t*.6),s*1.3,s,s);}
    }
    for(const mesh of [panels,wafers,shards,dust]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  return {group,update,get counts(){return {panels:panels.count,wafers:wafers.count,shards:shards.count,dust:dust.count};},dispose(){group.removeFromParent();for(const mesh of [panels,wafers,shards,dust])mesh.dispose();for(const g of [box,disc,shard,puff])g.dispose();shellMat.dispose();waferMat.dispose();dustMat.dispose();dustTexture.dispose();}};
}
