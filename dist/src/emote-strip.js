// One short downward swipe advances one complete row. Existing emoji buttons
// keep their handlers; paging sends no game command and stores nothing.
export function bindEmoteStrip(element,{now=()=>performance.now()}={}) {
  const root=element.ownerDocument,buttons=[...element.querySelectorAll('button[data-emote]')];
  if(!buttons.length)return ()=>{};
  const items=root.createElement('div'),next=root.createElement('button'),number=root.createElement('span'),arrow=root.createElement('span');
  items.className='emote-items';items.id=(element.id||'emote-strip')+'-items';items.append(...buttons);
  next.className='emote-next';next.type='button';next.setAttribute('aria-controls',items.id);
  arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');number.className='emote-page-number';number.setAttribute('aria-hidden','true');
  next.append(arrow,number);element.append(items,next);
  const pointers=new Set(),listeners=[];
  const size=9;
  let page=0,gesture=null,blockedUntil=-Infinity,lastWheel=-Infinity;
  const pageCount=()=>Math.ceil(buttons.length/size);
  const block=()=>{blockedUntil=now()+750;if(gesture)gesture.dragged=true;};
  function show(){
    const focused=buttons.indexOf(root.activeElement),start=page*size;
    buttons.forEach((button,index)=>{button.hidden=index<start||index>=start+size;});
    items.style.setProperty('--emote-columns',String(size));
    number.textContent=`${page+1}/${pageCount()}`;next.hidden=pageCount()<2;
    next.setAttribute('aria-label',`다음 감정표현 줄 · 현재 ${page+1}/${pageCount()}`);
    element.setAttribute('aria-label',`감정표현 ${page+1}/${pageCount()}줄, 아래로 쓸면 다음 줄, 위로 쓸면 이전 줄`);
    if(focused>=0&&buttons[focused].hidden)buttons[Math.min(start+focused%size,buttons.length-1)].focus({preventScroll:true});
  }
  function turn(direction){if(pageCount()<2)return;page=(page+direction+pageCount())%pageCount();show();}
  function down(event){
    if(event.button!==undefined&&event.button!==0)return;
    if(pointers.size&&!pointers.has(event.pointerId)){pointers.add(event.pointerId);if(gesture)gesture.cancelled=true;block();return;}
    pointers.add(event.pointerId);blockedUntil=-Infinity;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false,cancelled:false};
  }
  function moved(event){
    if(!gesture||event.pointerId!==gesture.id)return;
    if(Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)block();
  }
  function up(event){
    if(!pointers.has(event.pointerId))return;
    moved(event);
    if(gesture?.id===event.pointerId){
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(!gesture.cancelled&&pointers.size===1&&Math.abs(dy)>=14&&Math.abs(dy)>Math.abs(dx)*1.2)turn(dy>0?1:-1);
      if(gesture.dragged)block();
    }
    pointers.delete(event.pointerId);if(!pointers.size)gesture=null;
  }
  function cancel(event){if(!pointers.has(event.pointerId))return;block();if(gesture)gesture.cancelled=true;pointers.delete(event.pointerId);if(!pointers.size)gesture=null;}
  function reset(){pointers.clear();gesture=null;blockedUntil=now()+750;}
  function visibility(){if(root.hidden)reset();}
  function click(event){
    // Keyboard/assistive activation remains available after a pointer swipe.
    if(event.detail===0||now()>=blockedUntil)return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function wheel(event){
    if(event.ctrlKey||!Number.isFinite(event.deltaY)||!event.deltaY||pageCount()<2)return;
    event.preventDefault();if(now()-lastWheel<240)return;
    lastWheel=now();turn(event.deltaY>0?1:-1);block();
  }
  function key(event){
    const direction=['ArrowDown','PageDown'].includes(event.key)?1:['ArrowUp','PageUp'].includes(event.key)?-1:0;
    if(!direction||event.altKey||event.ctrlKey||event.metaKey)return;
    event.preventDefault();event.stopPropagation();turn(direction);
  }
  function listen(target,type,handler,options){target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));}
  listen(element,'pointerdown',down,{capture:true,passive:true});
  listen(root,'pointermove',moved,{passive:true});listen(root,'pointerup',up,{passive:true});listen(root,'pointercancel',cancel,{passive:true});
  listen(element,'click',click,{capture:true});listen(element,'wheel',wheel,{passive:false});listen(element,'keydown',key);
  listen(next,'click',()=>turn(1));listen(root,'visibilitychange',visibility);
  if(root.defaultView)listen(root.defaultView,'blur',reset);
  show();
  return ()=>{for(const remove of listeners)remove();pointers.clear();gesture=null;buttons.forEach(button=>{button.hidden=false;});element.append(...buttons);items.remove();next.remove();};
}
