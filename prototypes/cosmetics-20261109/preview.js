import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createAvatar} from '../../src/avatar.js';
import {equipCandidate} from './models.js';
import {candidates,slotLabels,findCandidate} from './catalog.js';

const $=id=>document.getElementById(id),price=n=>n.toLocaleString('ko-KR'),num=i=>String(i.number).padStart(2,'0');
let selected=new Set();
try{const value=JSON.parse(localStorage.getItem('fab-item-review-20261109')||'[]');if(Array.isArray(value))selected=new Set(value.filter(id=>findCandidate(id)));}catch{}
let filter='all',current=null,renderer,scene,camera,controls,avatar,equipped,frame=0,last=0,elapsed=0,posture='stand',zoomed=true,angle=0;
const dialog=$('viewer');
function syncSelection(){
  try{localStorage.setItem('fab-item-review-20261109',JSON.stringify([...selected]));}catch{}
  $('selected-count').textContent=selected.size;$('filter-count').textContent=selected.size;$('selection-bar').hidden=!selected.size;
  document.querySelectorAll('[data-pick]').forEach(button=>{const on=selected.has(button.dataset.pick);button.textContent=on?'✓':'+';button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',(on?'후보에서 빼기: ':'후보에 담기: ')+findCandidate(button.dataset.pick).name);});
  if(current){const on=selected.has(current.id);$('pick-item').textContent=on?'✓ 후보에 담았어요':'＋ 이 아이템 후보에 담기';$('pick-item').setAttribute('aria-pressed',String(on));}
}
function toggle(id){selected.has(id)?selected.delete(id):selected.add(id);syncSelection();if(filter==='selected')drawGrid();}
function drawGrid(){
  const items=candidates.filter(i=>filter==='all'||(filter==='selected'?selected.has(i.id):i.slot===filter));
  $('grid').innerHTML=items.map(i=>'<article class="card" style="--bg:'+i.background+'"><button class="card-visual" data-open="'+i.id+'" aria-label="'+num(i)+' '+i.name+' 3D 보기"><span class="number">'+num(i)+'</span><img loading="lazy" src="thumbs/'+num(i)+'.webp" width="600" height="750" alt="'+i.name+' 실제 장착 모습">'+(i.badge?'<span class="badge">'+i.badge+'</span>':'')+'</button><button class="pick" data-pick="'+i.id+'"></button><p class="category">'+slotLabels[i.slot]+'</p><h3>'+i.name+'</h3><p class="price">'+price(i.price)+'<span>칩</span></p></article>').join('');
  $('empty').hidden=!!items.length;syncSelection();
}
document.addEventListener('click',event=>{
  const open=event.target.closest('[data-open]');if(open)openItem(open.dataset.open);
  const pick=event.target.closest('[data-pick]');if(pick)toggle(pick.dataset.pick);
  const category=event.target.closest('[data-filter]');if(category){filter=category.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===category)));drawGrid();}
});
function init3d(){
  if(renderer)return true;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    $('stage').append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.03,30);
    scene.add(new THREE.HemisphereLight(0xf1f6ff,0xa6b6a0,2.1));
    for(const [color,intensity,x,y,z]of[[0xfff0da,2.3,2,4,3],[0xc6ddff,1.4,-3,2,1],[0xffffff,1,1,2,-3]]){
      const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
    }
    controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;
    controls.minDistance=.6;controls.maxDistance=6;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI*.75;controls.autoRotateSpeed=1;
    new ResizeObserver(resize).observe($('stage'));
    $('drag-hint').textContent='손가락으로 돌려보기 · 두 손가락으로 확대';return true;
  }catch(error){
    renderer?.dispose();renderer=null;$('stage').replaceChildren();$('drag-hint').textContent='이 브라우저에서는 장착 이미지를 보여드려요.';return false;
  }
}
function resize(){if(!renderer||!dialog.open)return;const w=$('stage').clientWidth,h=$('stage').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function setCamera(){
  if(!renderer)return;
  let target=.88,distance=3.25;
  if(zoomed){if(current.slot==='face'){target=1.15;distance=1.25;}else if(current.slot==='head'){target=1.27;distance=1.85;}else if(current.slot==='bag'){target=.86;distance=2.4;}}
  controls.target.set(0,target,0);camera.position.set(Math.sin(angle)*distance,target+.18*distance,Math.cos(angle)*distance);controls.update();
  $('zoom').textContent=zoomed?'전체 보기':'디테일 보기';
}
function openItem(id){
  const item=findCandidate(id);if(!item)return;current=item;posture='stand';zoomed=item.slot!=='suit';angle=item.slot==='bag'?Math.PI+.25:.18;
  $('viewer-kicker').textContent='NO. '+num(item)+' / '+slotLabels[item.slot];$('viewer-name').textContent=item.name;
  $('viewer-description').textContent=item.description;$('viewer-price').textContent=price(item.price);
  $('position').textContent=num(item)+' / 30';$('fallback').src='thumbs/'+num(item)+'.webp';$('fallback').alt=item.name+' 장착 모습';
  document.querySelector('.stage-wrap').style.setProperty('--stage-bg',item.background);
  if(!dialog.open)dialog.showModal();
  equipped?.dispose();avatar?.dispose();equipped=null;avatar=null;
  const ready=init3d();
  for(const id of ['zoom','stand','walk','sit','rotate'])$(id).disabled=!ready;
  if(ready){
    avatar=createAvatar(THREE);avatar.setSuitColor('#f6f8ef');avatar.update(0,{snap:true});
    equipped=equipCandidate(THREE,avatar,item);scene.add(avatar.root);controls.autoRotate=false;
    resize();setCamera();startLoop();
  }
  for(const mode of ['stand','walk','sit','rotate'])$(mode).setAttribute('aria-pressed',String(mode==='stand'));
  syncSelection();
}
function startLoop(){
  if(frame||!renderer||!dialog.open||document.hidden)return;
  last=performance.now();
  const animate=now=>{
    frame=0;if(!dialog.open||document.hidden)return;
    if(now-last<1000/30){frame=requestAnimationFrame(animate);return;}
    const dt=Math.min((now-last)/1000,.05);last=now;elapsed+=dt;
    avatar?.update(dt,{speed:posture==='walk'?1.5:0,posture:posture==='sit'?'sit':'stand',heading:0});
    equipped?.update(elapsed);controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);
  };frame=requestAnimationFrame(animate);
}
dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);frame=0;equipped?.dispose();avatar?.dispose();equipped=null;avatar=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else startLoop();});
$('close-viewer').onclick=()=>dialog.close();
$('pick-item').onclick=()=>current&&toggle(current.id);
$('front').onclick=()=>{angle=.15;setCamera();if(!renderer)$('fallback').src='thumbs/'+num(current)+(current.slot==='bag'?'-alt':'')+'.webp';};
$('back').onclick=()=>{angle=Math.PI+.2;setCamera();if(!renderer)$('fallback').src='thumbs/'+num(current)+(current.slot==='bag'?'':'-alt')+'.webp';};
$('zoom').onclick=()=>{zoomed=!zoomed;setCamera();};
for(const mode of ['stand','walk','sit'])$(mode).onclick=()=>{posture=mode;for(const m of ['stand','walk','sit'])$(m).setAttribute('aria-pressed',String(m===mode));if(mode==='sit'){zoomed=false;setCamera();}};
$('rotate').onclick=()=>{if(controls){controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));}};
function next(direction){openItem(candidates[(current.number-1+direction+candidates.length)%candidates.length].id);}
$('previous').onclick=()=>next(-1);$('next').onclick=()=>next(1);
$('review-selection').onclick=()=>{const items=candidates.filter(i=>selected.has(i.id));$('selection-text').value='팹뿌 아이템 후보 '+items.length+'종\n\n'+items.map(i=>num(i)+'. '+i.name+' · '+price(i.price)+'칩').join('\n');$('copy-status').textContent='';$('selection-dialog').showModal();};
$('close-selection').onclick=()=>$('selection-dialog').close();
$('copy-selection').onclick=async()=>{try{await navigator.clipboard.writeText($('selection-text').value);$('copy-status').textContent='복사했어요. 대화에 붙여넣어 주세요.';}catch{$('selection-text').focus();$('selection-text').select();$('copy-status').textContent='위 목록을 길게 눌러 복사해 주세요.';}};
drawGrid();
