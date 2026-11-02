import {createAvatar} from './avatar.js';
import {createAvatarAppearance} from './avatar-appearance.js';
import {createAvatarNameplate} from './avatar-nameplate.js';
export function createWardrobeView(THREE,canvas,name) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8f0f0');
  const camera=new THREE.PerspectiveCamera(36,1,.05,30);
  scene.add(new THREE.HemisphereLight('#f3faff','#99ada9',2.8));const light=new THREE.DirectionalLight('#fff7e9',3);light.position.set(-3,5,4);scene.add(light);
  const avatar=createAvatar(THREE);scene.add(avatar.root);
  const appearance=createAvatarAppearance(THREE,avatar),badge=createAvatarNameplate(THREE,scene,name);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(.86,48),new THREE.MeshStandardMaterial({color:'#d0e3df',roughness:.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  let angle=-.25,focus=false;
  function draw(){const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;
    camera.position.set(.1,focus?1.46:1.78,focus?2.4:3.9);camera.lookAt(0,focus?1.17:.95,0);camera.updateProjectionMatrix();
    avatar.update(.1,{heading:angle,posture:'stand',snap:true});appearance.update();badge.update(avatar,'stand',{headwear:appearance.headwear});renderer.render(scene,camera);
  }
  const observer=new ResizeObserver(draw);observer.observe(canvas);draw();
  return {setOutfit(outfit){appearance.setOutfit(outfit);draw();},setSlot(slot){focus=slot==='beauty';angle=slot==='bag'?Math.PI-.3:-.25;draw();},rotate(){angle+=Math.PI/4;draw();},
    dispose(){observer.disconnect();badge.dispose();appearance.dispose();avatar.dispose();floor.geometry.dispose();floor.material.dispose();renderer.dispose();}};
}
