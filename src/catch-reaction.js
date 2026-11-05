export const CAUGHT_SECONDS=1.15,CATCH_REACH_SECONDS=.65;
// Transient reaction only: no new profile fields, reward or camera movement.
export function markCatch(guard,person){
  person.caughtLeft=CAUGHT_SECONDS;guard.catchLeft=CATCH_REACH_SECONDS;
}
export function createCatchReaction({THREE,avatar,explorer,toast}){
  let left=0,point=null;
  const notice=document.createElement('div');notice.className='catch-notice hidden';notice.textContent='들켰다!';notice.setAttribute('role','status');document.body.append(notice);
  const projected=new THREE.Vector3();
  function receive(p){
    if(!p)return;
    const next=Math.max(0,p.caughtLeft||0);
    if(next>0&&left<=0){explorer.stopWalk();explorer.cancelEmo('caught');toast('들켰다! 장비 3대를 수리하면 다시 팹뿌할 수 있어요');}
    left=next;point=next?{x:p.x,y:p.y,z:p.z}:null;
    avatar.root.userData.catchLeft=p.catchLeft||0;
  }
  function prepare(dt){
    left=Math.max(0,left-dt);avatar.root.userData.caughtLeft=left;
    avatar.root.userData.catchLeft=Math.max(0,(avatar.root.userData.catchLeft||0)-dt);
    if(left&&point){explorer.stopWalk();explorer.state.posture='stand';explorer.state.position.set(point.x,point.y,point.z);}
  }
  function render(camera,visible){
    notice.classList.toggle('hidden',!left||!visible);
    if(!left||!visible)return;
    projected.copy(avatar.root.position);projected.y+=1.72;projected.project(camera);
    notice.classList.toggle('hidden',projected.z>1||Math.abs(projected.x)>1.1||Math.abs(projected.y)>1.1);
    notice.style.left=`${(projected.x+1)*innerWidth/2}px`;notice.style.top=`${(1-projected.y)*innerHeight/2}px`;
  }
  function reset(){left=0;point=null;avatar.root.userData.caughtLeft=avatar.root.userData.catchLeft=0;notice.classList.add('hidden');}
  return {receive,prepare,render,reset,get active(){return left>0;}};
}
