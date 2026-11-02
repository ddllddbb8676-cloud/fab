// Spending and repeated wallet packets must never look like another reward.
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
export function createChipRewardTracker(){
  let earned=null,revision=-1;
  return {
    reset(wallet){earned=count(wallet?.earnedChips);revision=count(wallet?.revision);},
    receive(wallet){
      const next=count(wallet?.earnedChips),nextRevision=count(wallet?.revision);
      if(earned===null){earned=next;revision=nextRevision;return 0;}
      if(nextRevision<revision)return 0;
      const gained=Math.max(0,next-earned);earned=Math.max(earned,next);revision=nextRevision;return gained;
    }
  };
}

// Project onto the avatar, keeping a readable size even with the wide camera.
export function createChipRewardView(THREE,{reducedMotion=false}={}){
  const layer=document.createElement('div');layer.className='chip-rewards';layer.setAttribute('aria-hidden','true');document.body.append(layer);
  const point=new THREE.Vector3(),entries=Array.from({length:3},()=>{
    const node=document.createElement('span');node.className='chip-reward';node.hidden=true;layer.append(node);return {node,born:-Infinity};
  });
  const duration=1400;let active=false;
  function clear(){if(!active)return;active=false;for(const e of entries){e.born=-Infinity;e.node.hidden=true;}}
  return {
    show(amount,now=performance.now()){
      if(!Number.isSafeInteger(amount)||amount<=0||document.hidden)return;
      const e=entries.reduce((a,b)=>a.born<=b.born?a:b);e.born=now;e.node.textContent=`+${amount}C`;active=true;
    },
    update(now,camera,anchor,visible=true){
      if(!active)return;
      if(!entries.some(e=>now-e.born<duration))return clear();
      point.copy(anchor).project(camera);
      const inView=visible&&!document.hidden&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<1.1&&Math.abs(point.y)<1.1;
      const x=Math.max(42,Math.min(innerWidth-42,(point.x*.5+.5)*innerWidth+30)),y=(-point.y*.5+.5)*innerHeight;
      entries.forEach((e,index)=>{
        const p=Math.max(0,(now-e.born)/duration);e.node.hidden=!inView||p>=1;if(e.node.hidden)return;
        const rise=(reducedMotion?12:18+48*(1-(1-p)**2))+index*24,scale=reducedMotion?1:Math.min(1,p/.09)*.18+.82;
        e.node.style.transform=`translate(${x}px,${Math.max(42,y-rise)}px) translate(-50%,-100%) scale(${scale})`;
        e.node.style.opacity=String(Math.min(1,p/.07,(1-p)/.3));
      });
    },
    clear,dispose(){layer.remove();}
  };
}
