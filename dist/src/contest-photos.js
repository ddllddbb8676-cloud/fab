import {CONTEST_ZONES} from './foup-contest.js?v=04bae36020c1';

// Exactly two small renders per result, one per frame, with asynchronous GPU
// readback. The canvases live only in the result UI; no uploads or saved photos.
export function createContestPhotos({THREE,renderer,scene,batches,overview,doc=document,size=256}){
  const camera=new THREE.OrthographicCamera(-3.6,3.6,3.6,-3.6,.1,8);
  camera.up.set(0,0,-1);
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  let job=null,busy=false;
  function cancel(){if(job){job.resolve({});job=null;}}
  function request(id){
    cancel();
    return new Promise(resolve=>{job={id,resolve,queue:[...CONTEST_ZONES],photos:{}};});
  }
  function renderNext(){
    if(!job||busy)return;
    const current=job,zone=job.queue.shift();if(!zone)return;
    busy=true;
    let target,readback,entered=false;
    const previous=renderer.getRenderTarget();
    try{
      target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
      // Look straight down from below the overhead rails so they cannot cover
      // the FOUPs being counted. The player's camera is never touched.
      camera.position.set(zone.x,3,zone.z);camera.lookAt(zone.x,0,zone.z);camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      entered=true;overview(true);
      for(const batch of batches)batch.update(frustum,camera.position);
      renderer.setRenderTarget(target);renderer.render(scene,camera);
      const pixels=new Uint8Array(size*size*4);
      readback=renderer.readRenderTargetPixelsAsync(target,0,0,size,size,pixels).then(()=>{
        if(job!==current)return;
        const canvas=doc.createElement('canvas');canvas.width=canvas.height=size;
        const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
        for(let y=0;y<size;y++)data.data.set(pixels.subarray(y*size*4,(y+1)*size*4),(size-y-1)*size*4);
        ctx.putImageData(data,0,0);current.photos[zone.team]=canvas;
      });
    }catch{readback=Promise.resolve();}
    finally{
      renderer.setRenderTarget(previous);
      if(entered)overview(false);
    }
    Promise.resolve(readback).catch(()=>{}).finally(()=>{
      target?.dispose();busy=false;
      if(job===current&&!current.queue.length){job=null;current.resolve(current.photos);}
    });
  }
  return {request,cancel,renderNext};
}
