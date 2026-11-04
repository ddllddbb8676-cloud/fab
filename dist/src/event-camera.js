// Temporary presentation only: the regular explorer keeps its own mode,
// position, joystick and camera rig. Restore its last camera before each update.
export function bayTopFrame(bay,aspect){
  const portrait=aspect<1,fov=55,tan=Math.tan(fov*Math.PI/360);
  const height=Math.max((portrait?54:19)/2/tan,(portrait?19:54)/2/tan/Math.max(.1,aspect))*1.25;
  return {fov,position:{x:bay.x,y:height,z:bay.z},target:{x:bay.x,y:0,z:bay.z},up:portrait?{x:1,y:0,z:0}:{x:0,y:0,z:-1}};
}
export function createEventCamera({camera,bays,now=()=>performance.now(),onOverview=()=>{}}){
  let until=0,bay=null,normal=null,presented=false;
  function restore(){
    if(normal){camera.position.copy(normal.position);camera.quaternion.copy(normal.quaternion);camera.up.copy(normal.up);camera.fov=normal.fov;camera.updateProjectionMatrix();normal=null;}
    if(presented&&now()>=until){presented=false;onOverview(false);}
  }
  return {
    start(id){if(!bays[id])return;bay=bays[id];until=now()+3000;},restore,
    cancel(){until=0;restore();},
    apply(){
      if(!bay||now()>=until)return false;
      normal={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),fov:camera.fov};
      if(!presented){presented=true;onOverview(true);}
      const frame=bayTopFrame(bay,camera.aspect);camera.fov=frame.fov;camera.up.set(frame.up.x,frame.up.y,frame.up.z);camera.position.set(frame.position.x,frame.position.y,frame.position.z);camera.lookAt(frame.target.x,frame.target.y,frame.target.z);camera.updateProjectionMatrix();return true;
    },
    get active(){return Boolean(bay&&now()<until);}
  };
}
