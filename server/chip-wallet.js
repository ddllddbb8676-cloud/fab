import {DEFAULT_OUTFIT,findItem} from '../src/cosmetics-catalog.js';
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function restoreWallet(profile={}) {
  if(profile.wallet!==undefined) {
    const w=profile.wallet;
    if(w?.version!==1||!Number.isSafeInteger(w.chips)||w.chips<0||!Array.isArray(w.owned)||!w.equipped)throw new Error('Invalid chip wallet checkpoint');
    return structuredClone(w);
  }
  const grant=count(profile.brokenCount)*5+count(profile.repairedCount)*3;
  return {version:1,revision:0,chips:grant,retroGrant:grant,owned:['suit-default','eyes-default'],equipped:{...DEFAULT_OUTFIT}};
}
export function grantChips(player,amount) {
  if(!Number.isSafeInteger(amount)||amount<=0)return false;
  player.wallet.chips=Math.min(Number.MAX_SAFE_INTEGER,player.wallet.chips+amount);player.wallet.revision++;
  return true;
}
export function wardrobeCommand(player,kind,data) {
  const w=player.wallet, item=findItem(data.itemId);
  if(kind==='unequip') {
    if(!Object.hasOwn(DEFAULT_OUTFIT,data.slot))return {ok:false,message:'잘못된 부위예요'};
    w.equipped[data.slot]=DEFAULT_OUTFIT[data.slot];w.revision++;return {ok:true};
  }
  if(!item)return {ok:false,message:'없는 아이템이에요'};
  if(!w.owned.includes(item.id)) {
    if(kind!=='purchase')return {ok:false,message:'구매한 아이템만 착용할 수 있어요'};
    if(!player.chipUnlimited&&w.chips<item.price)return {ok:false,message:'칩이 부족해요'};
    if(!player.chipUnlimited)w.chips-=item.price;
    w.owned.push(item.id);
  }
  w.equipped[item.slot]=item.id;w.revision++;
  return {ok:true};
}
export function walletView(player) {
  return {...structuredClone(player.wallet),unlimited:Boolean(player.chipUnlimited)};
}
