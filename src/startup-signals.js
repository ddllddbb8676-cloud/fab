export function startupStage(stage){document.dispatchEvent(new CustomEvent('fab-startup',{detail:stage}));}
export function startupFailure(error){document.dispatchEvent(new CustomEvent('fab-startup-error',{detail:String(error?.message||error)}));}

// Yield between large initialization steps so the loading state can paint and
// the browser can process input. The timer also resolves in a hidden tab where
// requestAnimationFrame may pause. No gameplay loop has started at these points.
export async function startupStep(stage){
  startupStage(stage);
  await new Promise(resolve=>{
    let settled=false,frame;
    function finish(){if(settled)return;settled=true;clearTimeout(timer);cancelAnimationFrame(frame);resolve();}
    const timer=setTimeout(finish,80);
    frame=requestAnimationFrame(()=>setTimeout(finish,0));
  });
}
