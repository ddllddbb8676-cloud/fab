// Appended only to the isolated local copy of main.js.
import {stockerPorts as filmPorts} from '/src/stocker-layout.js';
const filmPort=filmPorts.find(p=>p.id==='STK01:OUT');
const filmStatus=document.getElementById('film-status');
const filmButton=document.getElementById('film-record');
const filmCheckpoint=playActions.store.checkpoint();
function filmReset(){
  if(filmRecording)return;
  airShower.update(entry.skip());finishEntry();
  playActions.clearPending();playActions.store.restore(filmCheckpoint);
  // The clean local camera shot excludes foreground carts only.
  for(const child of scene.children)if(child.name.startsWith('FOUP trolley '))child.visible=false;
  explorer.setMode('walk');explorer.lock(false);explorer.state.path=[];
  explorer.state.position.set(filmPort.approach.x,0,filmPort.approach.z);
  explorer.state.heading=-Math.PI/2;explorer.state.speed=0;explorer.state.carrying=false;
  explorer.state.posture='stand';explorer.state.manualLook=true;
  appearance.setOutfit({head:'helmet-orange',face:'none',bag:'none',suit:'suit-blue',eyes:'eyes-default'},'visitor');
  renderer.setPixelRatio(1);renderer.setSize(1080,1920,false);
  filmReady=true;filmStatus.textContent='촬영 준비 · 실제 게임 렌더링 · 로컬 시연';
  filmButton.disabled=false;
}
document.getElementById('film-reset').onclick=filmReset;
document.getElementById('film-test').onclick=()=>{playActions.requestStocker(filmPort);filmStatus.textContent='OUT 출고 동작 확인 중';};
document.getElementById('film-still').onclick=()=>{captureFrame=canvas=>canvas.toBlob(async blob=>{await fetch('/film-save/still.png',{method:'POST',body:blob});filmStatus.textContent='화면 저장 완료';},'image/png');};
filmButton.onclick=async()=>{
  filmReset();filmButton.disabled=true;
  try{
    const chunks=[];
    const config={codec:'avc1.420028',width:1080,height:1920,bitrate:14000000,framerate:30,avc:{format:'annexb'}};
    if(!(await VideoEncoder.isConfigSupported(config)).supported)throw Error('H.264 capture unsupported');
    const encoder=new VideoEncoder({output:chunk=>{const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push(data);},error:e=>{throw e;}});
    encoder.configure(config);
    filmFrames=0;filmLog=[];filmCueAt=null;filmStarted=performance.now();filmRecording=true;
    let simulationNow=lastTime||performance.now();
    for(let f=0;f<450;f++){
      filmTime=f/30;
      if(f===30)playActions.requestStocker(filmPort);
      if(f===165)playActions.requestStocker(filmPort);
      if(f>=240&&playActions.store.carried){const target=Math.atan2(.8-explorer.state.position.x,78.4-explorer.state.position.z),delta=Math.atan2(Math.sin(target-explorer.state.heading),Math.cos(target-explorer.state.heading));explorer.state.heading+=delta*.10;}
      simulationNow+=1000/30;filmStepping=true;animate(simulationNow);filmStepping=false;
      const frame=new VideoFrame(renderer.domElement,{timestamp:Math.round(f*1000000/30),duration:Math.round(1000000/30)});
      encoder.encode(frame,{keyFrame:f%60===0});frame.close();
      if(encoder.encodeQueueSize>3)await encoder.flush();
      if(f%15===0){filmStatus.textContent='촬영 중 · '+f+'/450 프레임';await new Promise(r=>setTimeout(r,0));}
    }
    await encoder.flush();encoder.close();filmRecording=false;filmStepping=false;
    await fetch('/film-save/capture.h264',{method:'POST',body:new Blob(chunks,{type:'video/h264'})});
    await fetch('/film-save/capture.json',{method:'POST',body:JSON.stringify({duration:15,cueAt:filmCueAt,renderedFrames:filmFrames,phases:filmLog,width:1080,height:1920,codec:config.codec,localOnly:true,realTimeCapture:false,actualGameRenderer:true})});
    filmStatus.textContent='촬영 완료 · 450 프레임 저장 완료';filmButton.disabled=false;lastTime=0;requestAnimationFrame(animate);
  }catch(error){filmRecording=false;filmStepping=false;filmStatus.textContent='촬영 오류: '+error.message;filmButton.disabled=false;requestAnimationFrame(animate);}
};
window.addEventListener('error',event=>{filmStatus.textContent='오류: '+event.message;});
filmReset();
