import {createAvatar} from './avatar.js?v=2cab4ff9c4d9';
import {isPatternedSuit,collectionSuitColors} from './collection-catalog.js?v=2cab4ff9c4d9';

const suitNames=new Set(['hood','torso','pants','upperArm','forearm']);
function parts(avatar){
  const result=[],counts=new Map();
  avatar.root.traverse(mesh=>{
    if(!mesh.isMesh||!suitNames.has(mesh.name))return;
    const ordinal=counts.get(mesh.name)||0;counts.set(mesh.name,ordinal+1);
    result.push({mesh,key:mesh.name+':'+ordinal});
  });
  return result;
}

// One small texture per design and one set of standing-pose UVs for every body.
// The download is asynchronous: joining the room never waits for a costume.
export function createPatternedSuitPool(THREE){
  const geometries=new Map(),styles=new Map();let disposed=false;
  function prepareGeometry(){
    if(geometries.size)return;
    const reference=createAvatar(THREE),point=new THREE.Vector3();
    reference.update(0,{posture:'stand',snap:true});reference.root.updateMatrixWorld(true);
    try{for(const {mesh,key} of parts(reference)){
      const geometry=mesh.geometry.clone(),position=geometry.attributes.position,uv=[];
      for(let i=0;i<position.count;i++){
        point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        uv.push(Math.atan2(point.x,point.z)/(Math.PI*2)+.5,Math.max(0,Math.min(1,point.y/1.44)));
      }
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometries.set(key,geometry);
    }}finally{reference.dispose();}
  }
  function style(id){
    if(styles.has(id))return styles.get(id);
    const material=new THREE.MeshStandardMaterial({color:collectionSuitColors[id],roughness:id==='suit-holosilver'?.3:.64,metalness:id==='suit-holosilver'?.55:0});
    material.name='patterned-suit:'+id;
    const value={material,texture:null,ready:false};styles.set(id,value);
    value.texture=new THREE.TextureLoader().load(new URL('../assets/cosmetics/'+id+'-v1.png',import.meta.url).href,texture=>{
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;
      texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      material.color.set('#ffffff');material.map=texture;material.needsUpdate=true;value.ready=true;
    },undefined,()=>{value.ready=true;});
    return value;
  }
  return {
    apply(avatar,id){
      if(!isPatternedSuit(id)||disposed)return null;
      prepareGeometry();const selected=style(id),saved=[];
      for(const {mesh,key} of parts(avatar)){
        saved.push({mesh,geometry:mesh.geometry,material:mesh.material});
        mesh.geometry=geometries.get(key);mesh.material=selected.material;mesh.userData.patternedSuit=id;
      }
      let released=false;
      return {get pending(){return !selected.ready;},dispose(){if(released)return;released=true;
        for(const entry of saved){entry.mesh.geometry=entry.geometry;entry.mesh.material=entry.material;delete entry.mesh.userData.patternedSuit;}
      }};
    },
    dispose(){if(disposed)return;disposed=true;for(const geometry of geometries.values())geometry.dispose();
      for(const {material,texture} of styles.values()){material.dispose();texture?.dispose();}geometries.clear();styles.clear();}
  };
}
