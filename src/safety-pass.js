export const SAFETY_PASS_PRICE = 30;
export const safetyPassCount = wallet => Number.isSafeInteger(wallet?.safetyPasses) && wallet.safetyPasses >= 0 ? wallet.safetyPasses : 0;

export function createSafetyPassControl({button,command,getWallet,getPenalty,connected,onUsed,onMessage}) {
  let pending=false;
  function refresh(){
    const count=safetyPassCount(getWallet());
    button.classList.toggle('hidden',!getPenalty());
    button.textContent=pending?'쿠폰 사용 중…':count?`해제 쿠폰 ${count}장 · 1장 사용`:`해제 쿠폰 0장 · 상점 ${SAFETY_PASS_PRICE}칩`;
    button.disabled=pending||!count||!connected();
  }
  button.addEventListener('click',async()=>{
    if(pending||!getPenalty()||!safetyPassCount(getWallet())||!connected())return;
    const useCount=getWallet().safetyPassUses||0;
    pending=true;refresh();
    try{const result=await command('safety-pass-use',{useCount});if(result?.ok)onUsed(result);else onMessage(result?.message||'다시 확인해 주세요.');}
    catch{onMessage('연결을 확인한 뒤 다시 눌러주세요.');}
    finally{pending=false;refresh();}
  });
  return {refresh};
}
