import {items,DEFAULT_OUTFIT} from './cosmetics-catalog.js?v=fc4534498d97';
import {itemIcon} from './icons.js?v=fc4534498d97';
import {createWardrobeView} from './wardrobe-view.js?v=fc4534498d97';
import {NICKNAME_TICKET_PRICE} from './nickname-policy.js?v=fc4534498d97';
import {createTitlePicker} from './title-picker.js?v=fc4534498d97';
function recordUsageEvent(kind, details) {
  try { window.__fabTelemetry?.record(kind, details); } catch {}
}
export function createWardrobe({THREE,button,command,connected,getName,onOpen,onClose,onChangeName}) {
  const dialog=document.createElement('dialog');dialog.className='wardrobe';dialog.setAttribute('aria-labelledby','wardrobe-title');
  dialog.innerHTML=`<header><h2 id="wardrobe-title">꾸미기</h2><strong class="wardrobe-balance">연결 중</strong><button class="wardrobe-close" type="button" aria-label="꾸미기 닫기">×</button></header><div class="wardrobe-preview"><canvas aria-label="내 캐릭터 시착 모습"></canvas><button class="wardrobe-rotate" type="button">돌려보기 ↻</button><span class="wardrobe-trial"></span></div><nav class="wardrobe-modes" aria-label="상점과 내 옷장"><button type="button" data-mode="shop">상점</button><button type="button" data-mode="wardrobe">내 옷장</button></nav><nav class="wardrobe-slots" aria-label="꾸미기 부위">${Object.entries({head:'머리',face:'안경',bag:'가방',suit:'방진복',beauty:'눈'}).map(([id,name])=>`<button type="button" data-slot="${id}">${name}</button>`).join('')}</nav><div class="wardrobe-items"></div><footer><p class="wardrobe-message" role="status">시착은 무료예요. 구매 후 착용할 수 있어요.</p><div><button type="button" class="wardrobe-remove">벗기</button><button type="button" class="wardrobe-buy">아이템 선택</button></div><small>파괴 5 · 수리 3 · FOUP 던지기 1 · 실제 OHT 탑승 10초마다 1칩</small></footer>`;
  const ticketRow=document.createElement('section');ticketRow.className='wardrobe-nickname';ticketRow.innerHTML='<div><b>닉네임 변경권</b><small class="wardrobe-nickname-note"></small></div><button type="button" class="wardrobe-nickname-buy"></button>';dialog.querySelector('footer').append(ticketRow);
  const titleTab=document.createElement('button');titleTab.type='button';titleTab.dataset.mode='titles';titleTab.textContent='칭호';dialog.querySelector('.wardrobe-modes').append(titleTab);
  dialog.querySelector('.wardrobe-modes').setAttribute('aria-label','상점과 내 옷장, 칭호');
  const titleRoot=document.createElement('section');titleRoot.className='wardrobe-titles';titleRoot.hidden=true;dialog.querySelector('footer').before(titleRoot);
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);
  let wallet=null,nickname=null,outfit={...DEFAULT_OUTFIT},slot='head',mode='shop',selected=null,busy=false,view=null;
  const titlePicker=createTitlePicker({root:titleRoot,command,connected,onChange:id=>view?.setTitle(id)});
  function message(text){$('.wardrobe-message').textContent=text;}
  function refresh(){
    $('.wardrobe-balance').textContent=wallet?(wallet.unlimited?'∞ 칩':`${wallet.chips.toLocaleString('ko-KR')} 칩`):'연결 중';
    button.querySelector('.menu-detail').textContent=wallet?(wallet.unlimited?'∞ 칩':`${wallet.chips.toLocaleString('ko-KR')} 칩`):'';
    if(!dialog.open)return;
    const titles=mode==='titles';titleRoot.hidden=!titles;
    $('.wardrobe-slots').hidden=titles;$('.wardrobe-items').hidden=titles;$('footer').hidden=titles;
    for(const b of dialog.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
    titlePicker.refresh();
    if(titles){$('.wardrobe-trial').textContent='현재 착용';view?.setOutfit(wallet?.equipped||DEFAULT_OUTFIT);view?.setTitle(titlePicker.titleId);return;}
    const hasTicket=(wallet?.nicknameTickets||0)>0,ticketBuy=$('.wardrobe-nickname-buy');
    ticketRow.hidden=Boolean(wallet?.unlimited)||(mode==='wardrobe'&&!hasTicket);
    $('.wardrobe-nickname-note').textContent=hasTicket?'보유 1장 · 이름을 확정할 때 사용해요.':'무료 1회 이후 · 구매하면 보관돼요.';
    ticketBuy.textContent=hasTicket?'이름 바꾸기':`${NICKNAME_TICKET_PRICE.toLocaleString('ko-KR')}칩으로 구매`;
    ticketBuy.disabled=busy||!wallet||!nickname||!connected()||(!hasTicket&&(nickname.freeChoice||wallet.chips<NICKNAME_TICKET_PRICE));
    for(const b of dialog.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
    for(const b of dialog.querySelectorAll('[data-slot]'))b.setAttribute('aria-pressed',String(b.dataset.slot===slot));
    const owned=new Set(wallet?.owned||[]),list=items.filter(i=>i.slot===slot&&(mode==='shop'||owned.has(i.id))).sort((a,b)=>a.price-b.price);
    $('.wardrobe-items').innerHTML=list.length?list.map(i=>`<button type="button" data-item="${i.id}" aria-pressed="${outfit[slot]===i.id}">${itemIcon(i.id)}<b>${i.name.replaceAll('<','&lt;').replaceAll('>','&gt;')}</b><span>${wallet?.equipped[slot]===i.id?'착용 중':owned.has(i.id)?'보유':i.price.toLocaleString('ko-KR')+'칩'}</span><small>${owned.has(i.id)?'무료로 갈아입기':'미보유 · 시착 가능'}</small></button>`).join(''):'<p class="wardrobe-empty">아직 보유한 아이템이 없어요.<br>상점에서 마음에 드는 것을 입어보세요.</p>';
    const item=items.find(i=>i.id===selected),buy=$('.wardrobe-buy');
    buy.disabled=busy||!wallet||!connected()||!item||(!owned.has(item?.id)&&!wallet.unlimited&&wallet.chips<item.price);
    buy.textContent=busy?'저장 중…':!item?'아이템 선택':owned.has(item.id)?(wallet.equipped[slot]===item.id?'착용 중':'착용하기'):`${item.price.toLocaleString('ko-KR')}칩으로 구매·착용`;
    if(item&&wallet?.equipped[slot]===item.id)buy.disabled=true;
    $('.wardrobe-remove').disabled=busy||!wallet||!connected();$('.wardrobe-remove').textContent=['suit','beauty'].includes(slot)?'기본으로':'벗기';
    $('.wardrobe-trial').textContent=wallet&&Object.keys(outfit).some(k=>outfit[k]!==wallet.equipped[k])?'시착 중':'현재 착용';
    view?.setOutfit(outfit);
  }
  async function transact(kind,data){if(busy||!wallet)return;busy=true;refresh();try{const r=await command(kind,data);if(r.wallet)wallet=r.wallet;if(r.ok){outfit={...wallet.equipped};message(kind==='purchase'?'구매·착용했어요. 내 옷장에도 저장했어요.':'착용 상태를 저장했어요.');}else message(r.message||'잠시 후 다시 시도해 주세요.');}finally{busy=false;refresh();}}
  function close(){if(!dialog.open)return;dialog.close();view?.dispose();view=null;document.body.classList.remove('wardrobe-open');onClose();button.focus({preventScroll:true});}
  button.addEventListener('click',()=>{if(onOpen()===false)return;outfit={...(wallet?.equipped||DEFAULT_OUTFIT)};selected=outfit[slot];dialog.showModal();document.body.classList.add('wardrobe-open');view=createWardrobeView(THREE,$('canvas'),getName());view.setSlot(mode==='titles'?'titles':slot);view.setTitle(titlePicker.titleId);refresh();if(mode==='shop')recordUsageEvent('shop_open');$('.wardrobe-close').focus();});
  $('.wardrobe-close').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('.wardrobe-rotate').addEventListener('click',()=>view?.rotate());
  for(const b of dialog.querySelectorAll('[data-slot]'))b.addEventListener('click',()=>{slot=b.dataset.slot;selected=outfit[slot];view?.setSlot(slot);refresh();});
  for(const b of dialog.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{const previousMode=mode;mode=b.dataset.mode;outfit={...(wallet?.equipped||DEFAULT_OUTFIT)};selected=outfit[slot];view?.setSlot(mode==='titles'?'titles':slot);message(mode==='shop'?'미구매 아이템도 자유롭게 입어보세요.':'보유한 아이템만 모았어요. 무료로 갈아입으세요.');refresh();if(mode==='shop'&&previousMode!==mode)recordUsageEvent('shop_open');});
  $('.wardrobe-items').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(!b||busy)return;const item=items.find(item=>item.id===b.dataset.item&&item.slot===slot);if(!item)return;selected=item.id;outfit[slot]=selected;message('시착 중이에요. 마음에 들면 아래 버튼을 눌러 주세요.');refresh();recordUsageEvent('try_on',{itemId:selected});});
  $('.wardrobe-buy').addEventListener('click',()=>transact(wallet?.owned.includes(selected)?'equip':'purchase',{itemId:selected}));
  $('.wardrobe-remove').addEventListener('click',()=>transact('unequip',{slot}));
  $('.wardrobe-nickname-buy').addEventListener('click',async()=>{
    if(busy||!wallet||!nickname)return;
    if(wallet.nicknameTickets>0){close();onChangeName();return;}
    if(!confirm('닉네임 변경권 1장을 1,000칩에 구매할까요? 새 이름을 확정할 때까지 변경권은 보관됩니다.'))return;
    busy=true;refresh();let purchased=false;
    try{const r=await command('nickname-ticket-buy',{purchaseCount:nickname.purchaseCount});if(r.wallet)wallet=r.wallet;if(r.nickname)nickname=r.nickname;purchased=r.ok;message(r.ok?'닉네임 변경권을 구매했어요.':'변경권 구매: '+(r.message||'잠시 후 다시 시도해 주세요.'));}finally{busy=false;refresh();}
    if(purchased&&dialog.open){close();onChangeName();}
  });
  return {setWallet(next){wallet=next;refresh();},setNickname(next){nickname=next;refresh();},setTitles:next=>titlePicker.setState(next),setTitleProgress:(count,id)=>titlePicker.setProgress(count,id),refresh,close,get isOpen(){return dialog.open;}};
}
