// Let the browser scroll the strip; reject only the click produced by a drag.
// Canvas and joystick pointers are outside this element and are not tracked.
export function bindEmoteStrip(element,{now=()=>performance.now()}={}) {
  const pointers=new Set(),root=element.ownerDocument||element,listeners=[];
  let gesture=null,blockedUntil=-Infinity,lastScroll=element.scrollLeft||0;
  const block=()=>{blockedUntil=now()+750;if(gesture)gesture.dragged=true;};
  function moved(event){
    if(!gesture||event.pointerId!==gesture.id)return;
    if((Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)||Math.abs((element.scrollLeft||0)-gesture.scroll)>1)block();
  }
  function down(event){
    if(event.button!==undefined&&event.button!==0)return;
    if(pointers.size&&!pointers.has(event.pointerId)){pointers.add(event.pointerId);block();return;}
    pointers.add(event.pointerId);
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,scroll:element.scrollLeft||0,dragged:false};
    blockedUntil=-Infinity;lastScroll=element.scrollLeft||0;
  }
  function move(event){if(pointers.has(event.pointerId))moved(event);}
  function up(event){
    if(!pointers.has(event.pointerId))return;
    moved(event);if(gesture?.dragged)block();pointers.delete(event.pointerId);
  }
  function cancel(event){if(pointers.has(event.pointerId)){block();pointers.delete(event.pointerId);}}
  function scroll(){
    const current=element.scrollLeft||0;
    if(Math.abs(current-lastScroll)>1)block();
    lastScroll=current;
  }
  function reset(){pointers.clear();gesture=null;blockedUntil=now()+750;lastScroll=element.scrollLeft||0;}
  function visibility(){if(root.hidden)reset();}
  function click(event){
    // Keyboard and assistive activation must work without pointer events.
    if(event.detail===0||now()>=blockedUntil)return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function wheel(event){
    if(event.ctrlKey)return; // Trackpad pinch remains a browser gesture.
    const max=Math.max(0,element.scrollWidth-element.clientWidth);
    if(!max)return;
    const units=event.deltaMode===1?16:event.deltaMode===2?element.clientWidth:1;
    const delta=(event.deltaX||event.deltaY||0)*units;
    if(!Number.isFinite(delta)||!delta)return;
    const previous=element.scrollLeft||0,next=Math.max(0,Math.min(max,previous+delta));
    if(next===previous)return;
    element.scrollLeft=next;block();lastScroll=next;event.preventDefault();
  }
  function listen(target,type,handler,options){target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));}
  listen(element,'pointerdown',down,{capture:true,passive:true});
  listen(root,'pointermove',move,{passive:true});
  listen(root,'pointerup',up,{passive:true});
  listen(root,'pointercancel',cancel,{passive:true});
  listen(element,'scroll',scroll,{passive:true});
  listen(element,'click',click,{capture:true});
  listen(element,'wheel',wheel,{passive:false});
  listen(root,'visibilitychange',visibility);
  if(root.defaultView)listen(root.defaultView,'blur',reset);
  return ()=>{for(const remove of listeners)remove();pointers.clear();gesture=null;};
}
