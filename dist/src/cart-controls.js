import {CART_HOMES,CART_SIZE,cartPoint,cartSeatPose,pushCart} from './cart-layout.js?v=aed74b929a2a';
import {isBlocked} from './layout.js?v=aed74b929a2a';
import {createCartView} from './cart-view.js?v=aed74b929a2a';

export function createCartControls(options){
  let selected=null;
  const nearest=()=>controls.reduce((a,b)=>distance(a)<=distance(b)?a:b);
  const distance=c=>Math.hypot(options.explorer.state.position.x-c.state.x,options.explorer.state.position.z-c.state.z);
  const focused=()=>controls.find(c=>c.active)??controls.find(c=>c.state.id===selected&&distance(c)<2.2)??nearest();
  const controls=CART_HOMES.map(home=>createOneCart({...options,home,
    allowUi:()=>focused()?.state.id===home.id,
    anyActive:()=>controls.some(c=>c.active),select:()=>{selected=home.id;}
  }));
  return {
    frame(frame,initial){for(const c of controls)c.frame(frame,initial);},
    prepare(dt){options.avatar.root.userData.cartGrip=null;for(const c of controls)c.prepare(dt);},
    update(){for(const c of controls)c.update();},
    tap(ray){if(controls.some(c=>c.active))return false;for(const c of [...controls].sort((a,b)=>a.hitDistance(ray)-b.hitDistance(ray)))if(c.tap(ray))return true;return false;},
    riderPose:id=>controls.map(c=>c.riderPose(id)).find(Boolean)??null,
    grip:id=>controls.map(c=>c.grip(id)).find(Boolean)??null,
    disconnect(){for(const c of controls)c.disconnect();selected=null;},
    get active(){return controls.some(c=>c.active);},get riding(){return controls.some(c=>c.riding);},
    get state(){return {...focused().state,carts:controls.map(c=>c.state)};},
    target:(...args)=>focused().target(...args)
  };
}
function createOneCart({THREE,scene,explorer,avatar,store,network,getId,ready,toast,home,allowUi,anyActive,select,onOpen=()=>{}}){
  const view=createCartView(THREE,scene,home.id),c={...home,driver:null,riders:[null,null]};
  let goal=null,connected=false,open=false,busy=false,member=false,pending=null,before=null,collisionAt=0,paintAt=0;
  const panel=document.createElement('section');panel.className='cart-panel hidden';panel.setAttribute('aria-label','FOUP 카트');
  panel.innerHTML='<div class="cart-heading"><strong>FOUP 카트</strong><button type="button" aria-label="카트 닫기">×</button></div><p>FOUP 4개 · 사람은 위아래 한 명씩<br>사람이 타는 칸의 FOUP은 바닥으로 떨어져요</p><div class="cart-slots"></div><div class="cart-ride"><button type="button" data-level="0">아래칸 타기</button><button type="button" data-level="1">위칸 타기</button></div><button class="cart-pull" type="button">손잡이 잡기</button>';
  const quick=document.createElement('button');quick.type='button';quick.className='cart-quick hidden';quick.textContent='카트';
  const leave=document.createElement('button');leave.type='button';leave.className='cart-leave hidden';
  document.body.append(panel,quick,leave);
  const slots=panel.querySelector('.cart-slots'),buttons=[];
  for(let slot=0;slot<4;slot++){const b=document.createElement('button');b.type='button';b.dataset.slot=slot;slots.append(b);buttons.push(b);b.addEventListener('click',()=>{const r=cargo(slot),held=store.carried;send(held?'cart-load':'cart-take',{slot,recordId:held?.id??r?.id});});}
  function cargo(slot){return store.cartItems(c.id).find(r=>r.cartSlot===slot);}
  function close(){open=false;panel.classList.add('hidden');}
  function show(){if(!ready()||anyActive()||!connected)return;select();onOpen();explorer.stopWalk();open=true;paint();}
  const isDriver=()=>c.driver===getId()&&Boolean(getId());
  const level=()=>getId()?c.riders.indexOf(getId()):-1;
  const active=()=>isDriver()||level()>=0;
  function placeSelf(p){explorer.state.position.set(p.x,p.y??0,p.z);if(Number.isFinite(p.heading))explorer.state.heading=p.heading;avatar.root.position.copy(explorer.state.position);}
  async function send(kind,data={}){
    if(busy||!connected)return;
    busy=true;paint();explorer.stopWalk();
    try{
      const result=await network.command(kind,{id:c.id,...data});
      if(!result.ok){toast(result.message??'카트를 다시 눌러주세요');return;}
      if(result.cartHandle)placeSelf({...result.cartHandle,heading:c.yaw+Math.PI});
      if(result.cartExit){placeSelf(result.cartExit);explorer.state.posture='stand';}
      if(['cart-pull','cart-board','cart-leave'].includes(kind))close();
      if(kind==='cart-pull')toast('조이스틱으로 카트를 밀어요 · 놓기를 누르면 멈춰요');
      if(kind==='cart-board')toast('탑승했어요! 내리기를 누르면 바닥으로 내려와요');
    }catch{toast('연결을 확인하고 카트를 다시 눌러주세요');}finally{busy=false;paint();}
  }
  panel.querySelector('.cart-heading button').onclick=close;
  panel.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>send('cart-board',{level:Number(b.dataset.level)}));
  panel.querySelector('.cart-pull').onclick=()=>send('cart-pull');quick.onclick=show;leave.onclick=()=>send('cart-leave');
  function paint(){
    const allowed=ready()&&connected&&allowUi(),near=Math.hypot(explorer.state.position.x-c.x,explorer.state.position.z-c.z)<2.2;
    if(!allowed||active()||!near)close();
    quick.classList.toggle('hidden',!allowed||!near||active()||open);
    leave.classList.toggle('hidden',!allowed||!active());leave.textContent=isDriver()?'카트 놓기':'카트 내리기';leave.disabled=busy;
    panel.classList.toggle('hidden',!open);
    if(!open)return;
    const held=store.carried,locked=busy||Boolean(c.driver)||Boolean(c.returning);
    panel.querySelector('.cart-heading strong').textContent=c.returning?'NPC가 카트 정리 중':'FOUP 카트';
    buttons.forEach((b,slot)=>{const r=cargo(slot),person=c.riders[Math.floor(slot/2)];b.textContent=`${slot<2?'아래':'위'} ${slot%2+1} · ${person?'탑승 중':r?(r.gold?'황금 FOUP 꺼내기':'FOUP 꺼내기'):held?'FOUP 싣기':'빈칸'}`;b.disabled=locked||Boolean(person)||(held?Boolean(r):!r);});
    panel.querySelectorAll('[data-level]').forEach(b=>b.disabled=locked||Boolean(held)||Boolean(c.riders[Number(b.dataset.level)]));
    panel.querySelector('.cart-pull').disabled=locked||Boolean(held);
  }
  function frame(frame,initial){
    const next=frame.carts?.find(row=>row.id===c.id);if(!next)return;
    const was=active(),wasRider=level()>=0,wasDriver=isDriver();
    goal=next;connected=true;c.returning=next.returning;
    if(initial||wasDriver&&Math.hypot(c.x-next.x,c.z-next.z)>1)Object.assign(c,next);
    else if(!wasDriver||next.driver!==getId())Object.assign(c,{driver:next.driver,riders:next.riders});
    else {c.driver=next.driver;c.riders=[...next.riders];}
    if(initial){Object.assign(c,next);member=false;}
    if(was&&!active()){
      const self=frame.people?.find(p=>p[0]===getId());
      if(self&&wasRider)placeSelf({x:self[1],y:self[2],z:self[3],heading:self[4]});
      explorer.state.posture='stand';explorer.stopWalk();
    }
    if(!was&&active()){explorer.stopWalk();explorer.cancelEmo('cart');close();}
    member=active();
  }
  function riderPose(id){const l=c.riders.indexOf(id);return l>=0?cartSeatPose(c,l):null;}
  function grip(id){return id&&c.driver===id?{...cartPoint(c,0,.87,CART_SIZE.handle),yaw:c.yaw}:null;}
  function prepare(dt){
    if(goal&&!isDriver()){
      const f=1-Math.exp(-dt*14);c.x+=(goal.x-c.x)*f;c.z+=(goal.z-c.z)*f;c.yaw+=Math.atan2(Math.sin(goal.yaw-c.yaw),Math.cos(goal.yaw-c.yaw))*f;
    }
    if(level()>=0){explorer.stopWalk();explorer.state.posture='sit';placeSelf(cartSeatPose(c,level()));}
    if(isDriver())avatar.root.userData.cartGrip=grip(getId());
    before={x:explorer.state.position.x,z:explorer.state.position.z};
    if(pending){if(!ready()||anyActive())pending=null;else if(Math.hypot(explorer.state.position.x-c.x,explorer.state.position.z-c.z)<2.15){pending=null;show();}else if(!explorer.state.path.length)pending=null;}
  }
  function update(){
    if(isDriver()&&before){
      const state=explorer.state,next=pushCart(c,before,state.position,isBlocked);
      if(next){Object.assign(c,{x:next.x,z:next.z,yaw:next.yaw});}
      else{state.position.x=before.x;state.position.z=before.z;state.speed=0;avatar.root.position.copy(state.position);if(performance.now()>collisionAt){toast('카트가 지나가기엔 좁아요. 넓은 통로로 돌아가 주세요');collisionAt=performance.now()+5000;}}
      state.posture='stand';state.heading=c.yaw+Math.PI;
    }
    if(level()>=0){explorer.state.posture='sit';placeSelf(cartSeatPose(c,level()));}
    store.carts.set(c.id,c);store.moveCart(c);view.update(c);
    if(performance.now()>=paintAt){paint();paintAt=performance.now()+150;}
  }
  function tap(ray){
    if(!ready()||!connected||anyActive())return false;
    const hit=view.hit(ray);if(!hit||ray.origin.distanceTo(hit)>18)return false;
    if(Math.hypot(explorer.state.position.x-c.x,explorer.state.position.z-c.z)<2.2){show();return true;}
    // Walk to an open side. Leave camera orbit control with the normal walker.
    for(const [x,z]of [[-.95,0],[.95,0],[0,CART_SIZE.tow],[0,-1.1]]){
      const target=cartPoint(c,x,0,z);if(!isBlocked(target.x,target.z,.295)&&explorer.walkTo(target)){pending=c.id;return true;}
    }
    toast('카트 옆의 넓은 통로로 다가가 주세요');return true;
  }
  function disconnect(){connected=false;goal=null;pending=null;close();if(member){explorer.state.posture='stand';explorer.state.position.y=0;explorer.stopWalk();}member=false;c.driver=null;c.riders=[null,null];paint();}
  view.update(c);
  return {frame,prepare,update,tap,riderPose,grip,disconnect,hitDistance(ray){const p=view.hit(ray);return p?ray.origin.distanceTo(p):Infinity;},get active(){return active();},get riding(){return level()>=0;},get state(){return {...c,open};},target(camera,width,height){const p=new THREE.Vector3(c.x,.95,c.z).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};}};
}
