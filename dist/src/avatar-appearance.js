import {createAllAccessories} from './accessories.js?v=468b75afb7f9';
import {DEFAULT_OUTFIT,findItem,suitColor} from './cosmetics-catalog.js?v=468b75afb7f9';
import {isSafety,safetyColor} from './safety-team.js?v=468b75afb7f9';
const pools=new WeakMap();
export function createAvatarAppearance(THREE,avatar,{scene=null,external=false}={}) {
  let pool=pools.get(THREE);
  if(!pool){pool={references:0,templates:createAllAccessories(THREE,new THREE.Group())};pools.set(THREE,pool);}pool.references++;
  const upper=avatar.root.getObjectByName('hood').parent,root=new THREE.Group(),equipped=new Map();
  root.name='cosmetic-accessories';(external?scene:upper).add(root);if(external)root.matrixAutoUpdate=false;
  const face=external?new THREE.Mesh(avatar.root.getObjectByName('face').geometry,avatar.root.getObjectByName('face').material):null;
  if(face){face.matrixAutoUpdate=false;scene.add(face);}
  let outfit={...DEFAULT_OUTFIT},lastKey='',disposed=false;
  function setOutfit(next={},role='visitor') {
    const clean={...DEFAULT_OUTFIT};
    for(const slot of Object.keys(clean)){const item=findItem(next?.[slot]);if(item?.slot===slot)clean[slot]=item.id;}
    const key=JSON.stringify([clean,role]);if(key===lastKey)return;lastKey=key;outfit=clean;
    for(const slot of ['head','face','bag']){
      const id=outfit[slot],old=equipped.get(slot);if(old?.userData.itemId===id)continue;
      old?.removeFromParent();equipped.delete(slot);
      if(pool.templates[id]){const group=pool.templates[id].clone(true);group.visible=true;group.userData.itemId=id;root.add(group);equipped.set(slot,group);}
    }
    avatar.setEyeStyle(outfit.beauty);
    if(!external)avatar.setSuitColor(isSafety(role)?safetyColor(role):suitColor(outfit));
    if(face)face.material=avatar.root.getObjectByName('face').material;
  }
  function update(visible=true) {
    root.visible=visible;
    if(external){upper.updateWorldMatrix(true,false);root.matrix.copy(upper.matrixWorld);root.updateMatrixWorld(true);face.visible=visible;const source=avatar.root.getObjectByName('face');source.updateWorldMatrix(true,false);face.matrix.copy(source.matrixWorld);face.updateMatrixWorld(true);}
  }
  return {root,setOutfit,update,get headwear(){return [...equipped].filter(([slot])=>slot==='head').map(([,g])=>g);},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();face?.removeFromParent();if(--pool.references===0){const geometries=new Set(),materials=new Set();for(const group of Object.values(pool.templates))group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();pools.delete(THREE);}}
  };
}
