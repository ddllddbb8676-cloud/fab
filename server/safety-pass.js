import {SAFETY_PASS_PRICE,safetyPassCount} from '../src/safety-pass.js';
const counter=n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function safetyPassCommand(player,kind,data,time) {
  const w=player.wallet,count=safetyPassCount(w);
  if(kind==='safety-pass-buy'){
    const purchases=counter(w.safetyPassPurchases);
    if(data.purchaseCount!==purchases)return {ok:false,message:'구매 내역이 바뀌었어요. 보유 장수를 확인하고 다시 눌러주세요.'};
    if(count>=Number.MAX_SAFE_INTEGER||purchases>=Number.MAX_SAFE_INTEGER)return {ok:false,message:'쿠폰을 더 보관할 수 없어요.'};
    if(!player.chipUnlimited&&w.chips<SAFETY_PASS_PRICE)return {ok:false,message:'칩이 부족해요. 해제 쿠폰은 30칩이에요.'};
    if(!player.chipUnlimited)w.chips-=SAFETY_PASS_PRICE;
    w.safetyPasses=count+1;w.safetyPassPurchases=purchases+1;w.revision++;
    return {ok:true};
  }
  if(kind==='safety-pass-use'){
    const uses=counter(w.safetyPassUses);
    if(data.useCount!==uses)return {ok:false,message:'사용 내역이 바뀌었어요. 남은 쿠폰을 확인해 주세요.'};
    if(!(player.penalty>0))return {ok:false,message:'지금은 해제할 패널티가 없어요.'};
    if(!count)return {ok:false,message:'해제 쿠폰이 없어요. 상점에서 30칩에 구매할 수 있어요.'};
    if(uses>=Number.MAX_SAFE_INTEGER)return {ok:false,message:'지금은 쿠폰을 사용할 수 없어요.'};
    w.safetyPasses=count-1;w.safetyPassUses=uses+1;w.revision++;
    player.penalty=0;player.caughtLeft=0;player.safeUntil=time+12;
    return {ok:true,penaltyCleared:true};
  }
  return {ok:false,message:'없는 쿠폰 조작이에요.'};
}
