import {createAvatar} from './avatar.js?v=909760559972';
import {createAvatarAppearance} from './avatar-appearance.js?v=909760559972';
import {createAvatarNameplate} from './avatar-nameplate.js?v=909760559972';
export function createWardrobeView(THREE,canvas,name) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8f0f0');
  const camera=new THREE.PerspectiveCamera(36,1,.05,30);
  scene.add(new THREE.HemisphereLight('#f3faff','#99ada9',2.8));const light=new THREE.DirectionalLight('#fff7e9',3);light.position.set(-3,5,4);scene.add(light);
  const avatar=createAvatar(THREE);scene.add(avatar.root);
  const appearance=createAvatarAppearance(THREE,avatar),badge=createAvatarNameplate(THREE,scene,name);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(.86,48),new THREE.MeshStandardMaterial({color:'#d0e3df',roughness:.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  let angle=-.25,focus=false;const headBounds=new THREE.Box3(),itemBounds=new THREE.Box3();
  function draw(){const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;
    avatar.update(.1,{heading:angle,posture:'stand',snap:true});appearance.update();
    let target=focus?1.17:.95,distance=focus?2.4:3.9;
    if(badge.titleId){
      headBounds.setFromObject(avatar.root.getObjectByName('hood'));
      for(const item of appearance.headwear)if(item?.visible)headBounds.union(itemBounds.setFromObject(item));
      target=focus?Math.max(1.17,headBounds.max.y-.35):Math.max(.95,(headBounds.max.y+.55)/2);
      if(!focus)distance=Math.max(3.9,headBounds.max.y/.44);
    }
    camera.position.set(.1,target+(focus?.29:.83),distance);camera.lookAt(0,target,0);camera.updateProjectionMatrix();
    badge.update(avatar,'stand',{headwear:appearance.headwear,camera,viewportHeight:height});renderer.render(scene,camera);
  }
  const observer=new ResizeObserver(draw);observer.observe(canvas);draw();
  return {setOutfit(outfit){appearance.setOutfit(outfit);draw();},setTitle(id){badge.setTitle(id);draw();},setSlot(slot){focus=slot==='beauty';angle=slot==='bag'?Math.PI-.3:-.25;draw();},rotate(){angle+=Math.PI/4;draw();},
    dispose(){observer.disconnect();badge.dispose();appearance.dispose();avatar.dispose();floor.geometry.dispose();floor.material.dispose();renderer.dispose();}};
}
