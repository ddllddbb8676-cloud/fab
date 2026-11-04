import {DEFAULT_OUTFIT} from './cosmetics-catalog.js?v=e82a3bde291c';

// Fixed by NPC identity so every visitor sees the same modest outfit.
const residentItems=[null,['head','helmet-white'],null,['face','glasses'],null,['bag','bag-basic'],null,['head','helmet-orange'],null,['face','goggles'],null,['head','sprout']];
const safetyItems=[null,['head','helmet-white'],null,['head','helmet-orange']];
export function npcOutfit(id) {
  const match=/^(resident|safety):(\d+)$/.exec(id??'');
  if(!match)return null;
  const choices=match[1]==='safety'?safetyItems:residentItems,item=choices[Number(match[2])%choices.length];
  return {...DEFAULT_OUTFIT,...(item?{[item[0]]:item[1]}:{})};
}
