// Isolated capture fixture. All controls come from shipped HTML/CSS/components.
// Commands affect only disposable local fixture state; no account or network.
import * as THREE from 'three';
import {EMOTE_MENU,HEART_PATH,HEART_COLOR} from '/src/emotes.js';
import {bindEmoteStrip} from '/src/emote-strip.js';
import {createSpeechComposer} from '/src/owner-speech-ui.js';
import {createCartControls} from '/src/cart-controls.js';
import {createWorldEventsUI} from '/src/world-events-ui.js';
import {createContestUI} from '/src/foup-contest-view.js';
import {createWardrobe} from '/src/wardrobe-ui.js';
import {DEFAULT_OUTFIT} from '/src/cosmetics-catalog.js';
import {CART_HOMES} from '/src/cart-layout.js';
import {machines} from '/src/layout.js';
import {buildEquipmentCatalog} from '/src/equipment-catalog.js';
import {createSafetyPassControl} from '/src/safety-pass.js';

const query=new URLSearchParams(location.search),state=query.get('state')||'default';
const $=id=>document.getElementById(id),show=id=>$(id).classList.remove('hidden');
const matte=query.get('matte')==='white'?'#fff':'#000';
document.documentElement.style.background=matte;document.body.style.background=matte;
$('loading').remove();$('entry-overlay').remove();
document.querySelector('.brand-sub').textContent='함께 2 / 100명';
$('leaderboard').classList.add('leaderboard-collapsed');$('leaderboard').querySelector('button')?.setAttribute('aria-expanded','false');
show('joystick-zone');$('speech-quick-open').hidden=false;$('google-account-link').hidden=false;
for(const emote of EMOTE_MENU){
  const button=document.createElement('button');button.type='button';button.textContent=emote.emoji;
  if(emote.id==='heart'){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
    icon.setAttribute('viewBox','0 0 128 128');icon.setAttribute('width','29');icon.setAttribute('height','29');icon.setAttribute('aria-hidden','true');
    path.setAttribute('d',HEART_PATH);path.setAttribute('fill',HEART_COLOR);icon.append(path);button.replaceChildren(icon);
  }
  button.setAttribute('aria-label',emote.label);button.title=emote.label;button.dataset.emote=emote.id;$('emote-controls').append(button);
}
bindEmoteStrip($('emote-controls'));
if(state==='emoji2')document.querySelector('.emote-next').click();
const composer=createSpeechComposer({button:$('speech-quick-open'),menuButton:$('owner-speech-open'),command:async()=>({ok:true}),canOpen:()=>true,onToggle(){},toast(){}});composer.setAllowed(true);
if(state==='speech'){$('speech-quick-open').click();$('speech-input').value='안녕!';$('speech-input').dispatchEvent(new Event('input'));$('speech-input').blur();}
if(['menu','google'].includes(state))show('controls-panel');
if(state==='throw')show('foup-actions');
if(state.startsWith('oht')){
  show('oht-dismount');$('posture-controls').classList.add('hidden');
  const riding=state==='oht',climbing=state==='oht-climb';
  $('oht-dismount').disabled=!riding;
  $('oht-dismount').textContent=riding?'내리기 ↓':climbing?'올라가는 중…':'내려오는 중…';
  $('view-title').textContent=riding?'OHT · 만세 산책':'OHT 타기';
  $('view-subtitle').textContent=riding?'드래그로 둘러보기 · 내리기 ↓':climbing?'장비를 딛고 점프!':'바닥으로 착지하는 중';
}
if(['emo','repair'].includes(state)){
  const item=buildEquipmentCatalog(machines).find(item=>item.id===85)||buildEquipmentCatalog(machines)[85];
  $('tool-family').textContent=`${item.processCode} · ${item.familyName}`;
  $('tool-name').textContent=item.code;$('tool-type').textContent=item.typeName;
  $('tool-location').textContent=item.location||'BAY 05';$('tool-description').textContent=item.description;
  $('tool-code-process').textContent=item.processCode;$('tool-code-fab').textContent=item.fabCode;
  $('tool-code-bay').textContent=item.code.slice(3,5);$('tool-code-number').textContent=item.code.slice(5);
  $('tool-ports').textContent='로드포트 '+item.portCodes.join(' · ');show('tool-card');
  if(state==='repair'){$('tool-emo').disabled=true;show('tool-repair');}
}
if(state.startsWith('cart')){
  const scene=new THREE.Scene(),avatar={root:new THREE.Object3D()},home=CART_HOMES[0];
  const explorer={state:{position:new THREE.Vector3(home.x+.6,0,home.z),heading:0,mode:'walk',posture:'stand'},stopWalk(){},cancelEmo(){},setMode(){},walkTo(){return true;}};
  const cargo=Array.from({length:state==='cartload'?3:4},(_,cartSlot)=>({id:`fixture-cargo-${cartSlot}`,cartSlot}));
  const store={carried:state==='cartload'?{id:'fixture-held'}:null,carts:new Map(),cartItems:()=>cargo,moveCart(){}};
  const controls=createCartControls({THREE,scene,avatar,explorer,store,network:{command:async()=>({ok:true})},getId:()=> 'fixture-viewer',ready:()=>true,toast(){}});
  const cart={...home,driver:state==='cartdriver'?'fixture-viewer':state==='cartquick'||state==='cartrider'?'fixture-friend':null,riders:state==='cartrider'?['fixture-viewer',null]:[null,null]};
  controls.frame({t:0,carts:[cart],people:[]},true);controls.update();
  if(['cartmenu','cartload'].includes(state))document.querySelector('.cart-quick:not(.hidden)').click();
}
if(state==='safety'){
  show('safety-panel');$('safety-title').textContent='안전팀 패널티 · 수리 0 / 3';
  $('safety-description').textContent='장비를 3대 더 고쳐야 다시 팹뿌를 하실 수 있습니다.';
  show('safety-repairs');
  createSafetyPassControl({button:$('safety-pass-use'),command:async()=>({ok:true}),getWallet:()=>({safetyPasses:1}),getPenalty:()=>3,connected:()=>true,onUsed(){},onMessage(){}}).refresh();
}
if(['bay','gold'].includes(state)){
  const events=createWorldEventsUI({now:()=>0,command:async()=>({ok:true}),onTravel(){},onVictory(){}});
  events.frame({serverNow:1000,bay:state==='bay'?{id:'fixture-bay',bayId:4,phase:'preparing',startsAt:61000,endsAt:121000,remaining:20,bayLimit:1}:null,golden:state==='gold'?{id:'fixture-gold',remaining:20,endsAt:601000}:null},true);
}
if(state==='contest'){
  const contest=createContestUI({now:()=>0,command:async()=>({ok:true}),ready:()=>true,getId:()=> 'fixture-viewer',onGather(){},onTeam(){},setZones(){},toast(){}});
  contest.frame({serverNow:1000,contest:{id:'fixture-contest',phase:'recruiting',startsAt:61000,endsAt:241000,joined:4,black:0,white:0}});
}
if(['shop','shoptrial','items'].includes(state)){
  const outfit={...DEFAULT_OUTFIT,head:'helmet-orange',suit:'suit-blue'};
  const wardrobe=createWardrobe({THREE,button:$('wardrobe-open'),command:async()=>({ok:true}),connected:()=>true,getName:()=> '팹뿌',onOpen:()=>true,onClose(){},onChangeName(){}});
  wardrobe.setWallet({chips:1200,owned:['helmet-orange','suit-blue','suit-default','eyes-default'],equipped:outfit,safetyPasses:1});
  $('wardrobe-open').click();
  if(state==='shoptrial'){
    document.querySelector('.wardrobe-slots [data-slot="suit"]').click();
    document.querySelector('.wardrobe-items [data-item="suit-green"]').click();
  }
  if(state==='items')document.querySelector('.wardrobe-slots [data-slot="items"]').click();
}
if(state==='photo'){
  // Same body flag used by the production photo mode; its original CSS hides HUD.
  document.body.classList.add('photo-mode');
}
document.activeElement?.blur();
await document.fonts.ready;
await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));
await Promise.all([...document.querySelectorAll('svg image')].map(el=>{
  const img=new Image();img.src=el.href.baseVal;return img.decode().catch(()=>{});
}));
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
document.body.dataset.captureReady=state;
