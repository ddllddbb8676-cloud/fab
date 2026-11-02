import {createAvatarAppearance} from './avatar-appearance.js';
import {suitColor} from './cosmetics-catalog.js';
import {isSafety} from './safety-team.js';
import { createAvatar } from './avatar.js';
import { createVisitorBadge } from './visitor-name.js';
import { getEmoApproach } from './emo-interaction.js';
import { machines } from './layout.js';
import { safetyColor, isSuitMesh } from './safety-team.js';
import {createEmoteView} from './emote-view.js';
import {npcDestructionTitle} from './destruction-titles.js';

// A shared pool of articulated bodies; distant visitors use two tiny instances.
export function createRemotePeople({THREE,scene,store,fleet=null,maxDetailed=40}) {
  const actors=new Map(),roster=new Map(),pool=[],groups=new Map(),zero=new THREE.Matrix4().makeScale(0,0,0),dummy=new THREE.Object3D();
  const softMaterial=new THREE.MeshStandardMaterial({color:'#c8dbdf',roughness:.8});
  const tint=new THREE.Color(),white=new THREE.Color('#ffffff');
  const ball=new THREE.SphereGeometry(1,8,5),proxy=new THREE.InstancedMesh(ball,softMaterial,280);proxy.count=0;proxy.frustumCulled=false;scene.add(proxy);
  function createSlot() {
    const avatar=createAvatar(THREE);avatar.update(0,{repairTime:0});avatar.update(0,{cleanTime:0});avatar.update(0,{});
    const badge=createVisitorBadge(THREE,scene,'',{resident:true});
    const slot={avatar,badge,appearance:createAvatarAppearance(THREE,avatar,{scene,external:true}),emote:createEmoteView(THREE,scene),actor:null,clock:1,resetPose:true};
    avatar.root.traverse(mesh=>{if(!mesh.isMesh||mesh.name==='face')return;const key=mesh.parent.name==='sweep-broom'?mesh.name:mesh.parent.name==='repair-hammer'?`hammer:${mesh.geometry.type}`:mesh.geometry.uuid+mesh.material.uuid;
      if(!groups.has(key)){const instance=new THREE.InstancedMesh(mesh.geometry,mesh.material,maxDetailed*2);instance.count=0;instance.frustumCulled=false;instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(instance);groups.set(key,{instance,sources:[]});}
      groups.get(key).sources.push({mesh,slot});});
    pool.push(slot);return slot;
  }
  function setRoster(rows){roster.clear();for(const [id,name,role,outfit]of rows)roster.set(id,{name,role,outfit});for(const a of actors.values())Object.assign(a,roster.get(a.id));}
  function synchronize(rows) {
    const live=new Set(rows.map(r=>r.id));for(const id of actors.keys())if(!live.has(id))actors.delete(id);
    for(const row of rows){let a=actors.get(row.id);if(!a){a={...row,...roster.get(row.id)};actors.set(row.id,a);}a.goal=row;Object.assign(a,{role:row.role,phase:row.phase,posture:row.posture,targetId:row.targetId,vehicleId:row.vehicleId,carrying:row.carrying,hidden:row.hidden,titleId:row.titleId??npcDestructionTitle(row.id,row.role)?.id??''});}
  }
  function update(dt,camera,overview=false) {
    const f=1-Math.exp(-dt*14),visible=[];
    for(const a of actors.values()) {
      if(a.goal){for(const k of ['x','y','z','speed','time'])a[k]+=(a.goal[k]-a[k])*f;a.heading+=Math.atan2(Math.sin(a.goal.heading-a.heading),Math.cos(a.goal.heading-a.heading))*f;}
      const car=a.phase==='riding'&&fleet?.vehicles[a.vehicleId]?.state.car;
      if(car)Object.assign(a,{x:car.x,y:2.16,z:car.z,heading:car.yaw,speed:0});
      a.distance=Math.hypot(a.x-camera.position.x,a.z-camera.position.z);if(!a.hidden&&(overview||a.distance<95))visible.push(a);
      const held=store.getCarried(a.id);if(held)Object.assign(held,{x:a.x+Math.sin(a.heading)*.34,y:a.y+(a.posture==='sit'?.48:a.posture==='lie'?.62:.82),z:a.z+Math.cos(a.heading)*.34,yaw:a.heading+Math.PI});
    }
    visible.sort((a,b)=>a.distance-b.distance);const detailed=visible.filter(a=>!overview&&a.distance<32).slice(0,maxDetailed);
    while(pool.length<detailed.length)createSlot();
    const wanted=new Set(detailed.map(a=>a.id)),assigned=new Set();
    for(const slot of pool){
      if(slot.actor&&wanted.has(slot.actor.id)){slot.actor=actors.get(slot.actor.id);assigned.add(slot.actor.id);}
      else slot.actor=null;
    }
    // Distance determines detail eligibility, not which body owns each person.
    // Keep ownership stable while two nearby visitors exchange distance order.
    for(const actor of detailed)if(!assigned.has(actor.id)){
      const slot=pool.find(s=>!s.actor);slot.actor=actor;slot.resetPose=true;slot.clock=1;assigned.add(actor.id);
    }
    const labelled=new Set(detailed.slice(0,10).map(a=>a.id));
    for(let i=0;i<pool.length;i++) {
      const slot=pool[i],a=slot.actor;slot.badge.sprite.visible=false;slot.emote.sprite.visible=false;if(!a){slot.emote.set('');slot.appearance.update(false);continue;}
      slot.appearance.setOutfit(a.outfit,a.role);
      if(slot.badge.name!==a.name)slot.badge.rename(a.name??'방문자');
      slot.badge.setTitle(a.titleId);
      slot.clock+=dt;const near=a.distance<14;
      if(slot.clock>=(near?1/30:1/15)){
        const avatar=slot.avatar;avatar.root.position.set(a.x,a.y,a.z);
        const working=a.phase==='repair',pressing=a.phase==='press',plan=Number.isInteger(a.targetId)?getEmoApproach(machines[a.targetId]):null;
        const target=plan&&(working?{...plan.button,y:.96+.16*Math.sin(a.time*15),z:plan.button.z+plan.button.sign*.09}:pressing?plan.button:null);
        avatar.update(Math.min(.1,slot.clock),{speed:a.speed,heading:a.heading,posture:a.posture,hanging:a.phase==='riding'||a.role==='rider',carrying:a.carrying,snap:slot.resetPose,
          repairTime:working?a.time:null,cleanTime:a.phase==='cleaning'?a.time:null,pressTarget:target,pressProgress:working?1:pressing?Math.min(1,a.time/.48):0,crouch:a.phase==='climb'?.7:0});slot.clock=0;slot.resetPose=false;
      }
      slot.appearance.update(true);
      slot.badge.update(slot.avatar,a.posture,{headwear:slot.appearance.headwear,camera});slot.badge.sprite.visible=a.distance<18&&labelled.has(a.id);
      const expression=a.goal??a;slot.emote.set(expression.emote,expression.emoteSeq,expression.emoteLeft,a.id);
      slot.emote.update(slot.avatar,a.posture,dt,a.distance<24,{camera,anchor:slot.badge.sprite.position,title:Boolean(a.titleId)});
    }
    for(const group of groups.values()){group.instance.count=group.sources.length;group.sources.forEach(({mesh,slot},i)=>{let shown=Boolean(slot.actor);for(let n=mesh;n&&shown;n=n.parent)shown=n.visible;group.instance.setMatrixAt(i,shown?mesh.matrixWorld:zero);group.instance.setColorAt(i,isSuitMesh(mesh.name)?tint.set(isSafety(slot.actor?.role)?safetyColor(slot.actor.role):suitColor(slot.actor?.outfit)):white);});group.instance.instanceMatrix.needsUpdate=true;if(group.instance.instanceColor)group.instance.instanceColor.needsUpdate=true;}
    const full=new Set(detailed.map(a=>a.id));let n=0;
    for(const a of visible)if(!full.has(a.id)) {
      tint.set(isSafety(a.role)?safetyColor(a.role):suitColor(a.outfit));proxy.setColorAt(n,tint);proxy.setColorAt(n+1,tint);
      const lie=a.posture==='lie',sit=a.posture==='sit',base=a.y+(sit?-.32:0);
      dummy.rotation.set(0,a.heading,0);dummy.position.set(a.x,base+(lie?.26:.66),a.z);dummy.scale.set(.22,lie?.22:.35,lie?.5:.16);dummy.updateMatrix();proxy.setMatrixAt(n++,dummy.matrix);
      dummy.position.set(a.x+(lie?Math.sin(a.heading)*.5:0),base+(lie?.27:1.15),a.z+(lie?Math.cos(a.heading)*.5:0));dummy.scale.setScalar(.27);dummy.updateMatrix();proxy.setMatrixAt(n++,dummy.matrix);
    }
    proxy.count=n;if(n){proxy.instanceMatrix.needsUpdate=true;proxy.instanceColor.needsUpdate=true;}
  }
  return {setRoster,synchronize,update,get safetyActors(){return [...actors.values()].filter(a=>a.role==='safety-red'||a.role==='safety-orange');},get state(){return {total:actors.size,details:pool.filter(p=>p.actor).length,people:[...actors.values()].map(a=>({id:a.id,name:a.name,role:a.role,x:a.x,y:a.y,z:a.z,phase:a.phase,posture:a.posture}))};},
    dispose(){for(const g of groups.values()){g.instance.removeFromParent();g.instance.dispose();}for(const s of pool){s.badge.dispose();s.emote.dispose();s.appearance.dispose();s.avatar.dispose();}proxy.removeFromParent();proxy.dispose();ball.dispose();softMaterial.dispose();}};
}
