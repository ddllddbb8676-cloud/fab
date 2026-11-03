import {findItem} from './cosmetics-catalog.js?v=28968bf060dc';
export const WARDROBE_NOTICE='칩을 모아서 캐릭터를 꾸며보세요';
export const WARDROBE_NOTICE_DURATION=4500;
const FIRST_SECONDS=60,REPEAT_SECONDS=300,STORAGE_KEY='fab-wardrobe-notice-at-v1';
export const hasPurchasedCosmetics=wallet=>(wallet?.nicknamePurchases||0)>0||(Array.isArray(wallet?.owned)&&wallet.owned.some(id=>(findItem(id)?.price??0)>0));

export function createWardrobeNotice({storage,now=Date.now}={}) {
  let elapsed=0,next=FIRST_SECONDS,lastShown=0;
  try{
    storage??=globalThis.sessionStorage;
    const saved=Number(storage?.getItem(STORAGE_KEY));
    if(Number.isFinite(saved)&&saved>0&&saved<=now())lastShown=saved;
  }catch{}
  return {
    tick(seconds,{active=true,eligible=true,wallet=null}={}) {
      if(!active||hasPurchasedCosmetics(wallet)||!Number.isFinite(seconds)||seconds<=0)return false;
      elapsed+=Math.min(seconds,1);
      if(!eligible||elapsed+1e-8<next||lastShown&&now()-lastShown<REPEAT_SECONDS*1000)return false;
      lastShown=now();next=elapsed+REPEAT_SECONDS;
      try{storage?.setItem(STORAGE_KEY,String(lastShown));}catch{}
      return true;
    }
  };
}
