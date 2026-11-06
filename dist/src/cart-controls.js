import {CART_HOMES,CART_SIZE,CART_USE_RANGE,CART_BOARD_RANGE,cartPoint,cartSeatPose,pullCart} from './cart-layout.js?v=0aef8956b0b4';
import {isBlocked} from './layout.js?v=0aef8956b0b4';
import {createCartView} from './cart-view.js?v=0aef8956b0b4';

export function createCartControls(options){
  let selected=null,lastFrameTime=-Infinity;
  const nearest=()=>controls.reduce((a,b)=>distance(a)<=distance(b)?a:b);
  const distance=c=>Math.hypot(options.explorer.state.position.x-c.state.x,options.explorer.state.position.z-c.state.z);
  const focused=()=>controls.find(c=>c.active)??controls.find(c=>c.state.id===selected&&c.isOpen&&distance(c)<=CART_BOARD_RANGE)??nearest();
  const controls=CART_HOMES.map(home=>createOneCart({...options,home,
    allowUi:()=>focused()?.state.id===home.id,
    anyActive:()=>controls.some(c=>c.active),select:()=>{selected=home.id;}
  }));
  return {
    frame(frame,initial){
      if(!initial&&frame.t<lastFrameTime)return;
      if(Number.isFinite(frame.t))lastFrameTime=frame.t;
      for(const c of controls)c.frame(frame,initial);
    },
    prepare(dt,playbackTime){options.avatar.root.userData.cartGrip=null;for(const c of controls)c.prepare(dt,playbackTime);},
    update(){for(const c of controls)c.update();},
    tap(ray){if(controls.some(c=>c.active))return false;for(const c of [...controls].sort((a,b)=>a.hitDistance(ray)-b.hitDistance(ray)))if(c.tap(ray))return true;return false;},
    occupantPose(id){for(const c of controls){const pose=c.occupantPose(id);if(pose)return pose;}return null;},
    grip(id){for(const c of controls){const handle=c.grip(id);if(handle)return handle;}return null;},
    disconnect(){for(const c of controls)c.disconnect();selected=null;lastFrameTime=-Infinity;},
    get active(){return controls.some(c=>c.active);},get riding(){return controls.some(c=>c.riding);},
    get state(){return {...focused().state,carts:controls.map(c=>c.state)};},
    target:(...args)=>focused().target(...args)
  };
}
function createOneCart({THREE,scene,explorer,avatar,store,network,getId,ready,toast,home,allowUi,anyActive,select,onOpen=()=>{}}){
  const view=createCartView(THREE,scene,home.id),c={...home,driver:null,riders:[null,null]};
  const samples=[];
  let drawnDriver=null,lastPacketTime=null,items=[];
  let goal=null,connected=false,open=false,busy=false,member=false,pending=null,before=null,collisionAt=0,paintAt=0;
  const panel=document.createElement('section');panel.className='cart-panel hidden';panel.setAttribute('aria-label','FOUP 카트');
  panel.innerHTML='<div class="cart-heading"><strong>FOUP 카트</strong><button type="button" aria-label="카트 닫기">×</button></div><p>FOUP 4개 · 사람은 위아래 한 명씩<br>사람이 타는 칸의 FOUP은 바닥으로 떨어져요</p><div class="cart-slots"></div><div class="cart-ride"><button type="button" data-level="0">아래칸 타기</button><button type="button" data-level="1">위칸 타기</button></div><button class="cart-pull" type="button">손잡이 잡기</button>';
  const quick=document.createElement('button');quick.type='button';quick.className='cart-quick hidden';quick.textContent='카트';
  const leave=document.createElement('button');leave.type='button';leave.className='cart-leave hidden';
  document.body.append(panel,quick,leave);
  const slots=panel.querySelector('.cart-slots'),buttons=[];
  for(let slot=0;slot<4;slot++){const b=document.createElement('button');b.type='button';b.dataset.slot=slot;slots.append(b);buttons.push(b);b.addEventListener('click',()=>{const r=cargo(slot),held=store.carried;send(held?'cart-load':'cart-take',{slot,recordId:held?.id??r?.id});});}
  function cargo(slot){return items.find(r=>r.cartSlot===slot);}
  function close(){open=false;panel.classList.add('hidden');}
  function show(){if(!ready()||anyActive()||!connected)return;open=true;select();onOpen();explorer.stopWalk();paint();}
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
      if(result.cartExit){placeSelf(result.cartExit);explorer.state.posture='stand';}
      if(['cart-pull','cart-board','cart-leave'].includes(kind))close();
      if(kind==='cart-pull')toast('조이스틱으로 카트를 끌어요 · 놓기를 누르면 멈춰요');
      if(kind==='cart-board')toast('탑승했어요! 드래그로 둘러보기 · 내리기로 내려와요');
    }catch{toast('연결을 확인하고 카트를 다시 눌러주세요');}finally{busy=false;paint();}
  }
  panel.querySelector('.cart-heading button').onclick=close;
  panel.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>send('cart-board',{level:Number(b.dataset.level)}));
  const distance=()=>Math.hypot(explorer.state.position.x-c.x,explorer.state.position.z-c.z);
  const boardQuickly=()=>!c.returning&&(Boolean(c.driver)||distance()>CART_USE_RANGE);
  panel.querySelector('.cart-pull').onclick=()=>send('cart-pull');
  quick.onclick=()=>{
    if(!ready()||!connected||anyActive()||distance()>CART_BOARD_RANGE)return;
    if(boardQuickly()&&!store.carried){select();onOpen();send('cart-board',{level:'any'});}
    else show();
  };
  leave.onclick=()=>send('cart-leave');
  function paint(){
    const allowed=ready()&&connected&&allowUi(),range=distance(),near=range<=CART_BOARD_RANGE;
    if(!allowed||active()||!near)close();
    quick.classList.toggle('hidden',!allowed||!near||active()||open);
    const direct=boardQuickly()&&!store.carried,full=c.riders.every(Boolean);
    quick.textContent=direct?(full?'카트 만석':'카트 타기'):'카트';quick.disabled=busy||(direct&&full);
    leave.classList.toggle('hidden',!allowed||!active());leave.textContent=isDriver()?'카트 놓기':'카트 내리기';leave.disabled=busy;
    panel.classList.toggle('hidden',!open);
    if(!open)return;
    const held=store.carried,locked=busy||Boolean(c.returning),handlingLocked=locked||Boolean(c.driver)||range>CART_USE_RANGE;
    panel.querySelector('.cart-heading strong').textContent=c.returning?'NPC가 카트 정리 중':'FOUP 카트';
    buttons.forEach((b,slot)=>{const r=cargo(slot),person=c.riders[Math.floor(slot/2)];b.textContent=`${slot<2?'아래':'위'} ${slot%2+1} · ${person?'탑승 중':r?(r.gold?'황금 FOUP 꺼내기':'FOUP 꺼내기'):held?'FOUP 싣기':'빈칸'}`;b.disabled=handlingLocked||Boolean(person)||(held?Boolean(r):!r);});
    panel.querySelectorAll('[data-level]').forEach(b=>b.disabled=locked||Boolean(held)||Boolean(c.riders[Number(b.dataset.level)]));
    panel.querySelector('.cart-pull').disabled=handlingLocked||Boolean(held);
  }
  function frame(frame,initial){
    const next=frame.carts?.find(row=>row.id===c.id);if(!next)return;
    const was=active(),wasRider=level()>=0,driving=Boolean(next.driver)&&next.driver===getId();
    const takingHandle=driving&&(initial||!isDriver());
    const corrected=driving&&next.correction&&next.correction!==goal?.correction;
    if(initial||next.driver!==c.driver||next.correction!==goal?.correction||(lastPacketTime!==null&&frame.t-lastPacketTime>3)){
      samples.length=0;drawnDriver=null;
    }
    if(!driving&&Number.isFinite(frame.t)){
      const t=Number.isFinite(next.towTime)?Math.min(frame.t,next.towTime):frame.t;
      const previous=samples.at(-1);
      if(previous?.t===t)samples.pop();
      else if(previous&&t-previous.t>.75&&lastPacketTime>previous.t&&lastPacketTime<t){
        // A cart that was parked for a while starts from its last visible stop.
        samples.push({...previous,t:lastPacketTime});
      }
      const driver=next.driver?frame.people?.find(row=>row[0]===next.driver):null;
      samples.push({t,cart:next,driver});
      while(samples.length>12)samples.shift();
    }
    lastPacketTime=frame.t;
    items=store.cartItems(c.id);
    // While towing, the local cart and driver advance in the same render step.
    // A regular snapshot describes an earlier pose, especially on a fast belt.
    if(initial||takingHandle||corrected)Object.assign(c,{x:next.x,z:next.z,yaw:next.yaw});
    Object.assign(c,{driver:next.driver,riders:[...next.riders],returning:next.returning});
    goal=next;connected=true;
    if(takingHandle||corrected){
      const self=frame.people?.find(p=>p[0]===getId());
      const driver=self?{x:self[1],z:self[3]}:cartPoint(c,0,0,CART_SIZE.tow);
      placeSelf({...driver,heading:takingHandle?c.yaw:undefined});
    }
    if(was&&!active()){
      const self=frame.people?.find(p=>p[0]===getId());
      if(self&&wasRider)placeSelf({x:self[1],y:self[2],z:self[3],heading:self[4]});
      explorer.state.posture='stand';explorer.stopWalk();
    }
    if(!was&&active()){if(explorer.state.mode==='tour')explorer.setMode('walk');explorer.stopWalk();explorer.cancelEmo('cart');close();}
    member=active();
  }
  function occupantPose(id){
    if(id&&id===c.driver)return drawnDriver;
    const l=c.riders.indexOf(id);return l>=0?cartSeatPose(c,l):null;
  }
  function grip(id){return id&&c.driver===id?{...cartPoint(c,0,.87,CART_SIZE.handle),yaw:c.yaw}:null;}
  function prepare(dt,playbackTime){
    if(goal&&!isDriver()){
      // Play cart and handle samples on the same clock as the rest of the fab.
      // The local driver still advances immediately from joystick movement.
      // A driver's own pose sends are less frequent than room broadcasts.
      const delay=Number.isFinite(goal.towTime)?0.16:0;
      const time=Number.isFinite(playbackTime)?playbackTime-delay:null;
      while(time!==null&&samples.length>1&&samples[1].t<=time)samples.shift();
      const first=samples[0],last=samples[1]??first;
      if(first&&time!==null){
        const f=last.t>first.t?Math.max(0,Math.min(1,(time-first.t)/(last.t-first.t))):0;
        const mix=(a,b)=>a+(b-a)*f,angle=(a,b)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;
        c.x=mix(first.cart.x,last.cart.x);c.z=mix(first.cart.z,last.cart.z);c.yaw=angle(first.cart.yaw,last.cart.yaw);
        const a=first.driver,b=last.driver;
        drawnDriver=a&&b?{x:mix(a[1],b[1]),y:mix(a[2],b[2]),z:mix(a[3],b[3]),heading:angle(a[4],b[4])}:null;
      }else{
        const f=1-Math.exp(-dt*14);c.x+=(goal.x-c.x)*f;c.z+=(goal.z-c.z)*f;c.yaw+=Math.atan2(Math.sin(goal.yaw-c.yaw),Math.cos(goal.yaw-c.yaw))*f;
      }
    }
    // Boarding clears movement once; keep camera drag/pinch pointers between frames.
    if(level()>=0){explorer.state.posture='sit';placeSelf(cartSeatPose(c,level()));}
    if(isDriver())avatar.root.userData.cartGrip=grip(getId());
    before={x:explorer.state.position.x,z:explorer.state.position.z};
    if(pending){if(!ready()||anyActive())pending=null;else if(distance()<=(c.driver?CART_BOARD_RANGE:CART_USE_RANGE)){pending=null;show();}else if(!explorer.state.path.length)pending=null;}
  }
  function update(){
    if(isDriver()&&before){
      const state=explorer.state,next=pullCart(c,before,state.position,isBlocked);
      if(next&&Math.hypot(state.position.x-next.x,state.position.z-next.z)>=.85){Object.assign(c,{x:next.x,z:next.z,yaw:next.yaw});}
      else{state.position.x=before.x;state.position.z=before.z;state.speed=0;avatar.root.position.copy(state.position);if(performance.now()>collisionAt){toast('카트가 지나가기엔 좁아요. 넓은 통로로 돌아가 주세요');collisionAt=performance.now()+5000;}}
      state.posture='stand';
    }
    if(level()>=0){explorer.state.posture='sit';placeSelf(cartSeatPose(c,level()));}
    store.carts.set(c.id,c);store.moveCart(c,items);view.update(c);
    if(performance.now()>=paintAt){paint();paintAt=performance.now()+150;}
  }
  function tap(ray){
    if(!ready()||!connected||anyActive())return false;
    const hit=view.hit(ray);if(!hit||ray.origin.distanceTo(hit)>18)return false;
    if(distance()<=CART_BOARD_RANGE){show();return true;}
    // Walk to an open side. Leave camera orbit control with the normal walker.
    for(const [x,z]of [[-.95,0],[.95,0],[0,CART_SIZE.tow],[0,-1.1]]){
      const target=cartPoint(c,x,0,z);if(!isBlocked(target.x,target.z,.295)&&explorer.walkTo(target)){pending=c.id;return true;}
    }
    toast('카트 옆의 넓은 통로로 다가가 주세요');return true;
  }
  function disconnect(){connected=false;goal=null;pending=null;samples.length=0;items=[];lastPacketTime=null;drawnDriver=null;close();if(member){explorer.state.posture='stand';explorer.state.position.y=0;explorer.stopWalk();}member=false;c.driver=null;c.riders=[null,null];paint();}
  view.update(c);
  return {frame,prepare,update,tap,occupantPose,grip,disconnect,hitDistance(ray){const p=view.hit(ray);return p?ray.origin.distanceTo(p):Infinity;},get active(){return active();},get riding(){return level()>=0;},get isOpen(){return open;},get state(){return {...c,open};},target(camera,width,height){const p=new THREE.Vector3(c.x,.95,c.z).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};}};
}
