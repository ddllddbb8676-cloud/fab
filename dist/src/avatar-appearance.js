import {createAllAccessories} from './accessories.js?v=2cab4ff9c4d9';
import {DEFAULT_OUTFIT,findItem,suitColor} from './cosmetics-catalog.js?v=2cab4ff9c4d9';
import {isSafety,safetyColor} from './safety-team.js?v=2cab4ff9c4d9';
import {getCollectionItem,isPatternedSuit} from './collection-catalog.js?v=2cab4ff9c4d9';
import {createCollectionAccessory,updateCollectionAccessory} from './collection-accessories.js?v=2cab4ff9c4d9';
import {createPatternedSuitPool} from './patterned-suits.js?v=2cab4ff9c4d9';
const pools=new WeakMap();
export function createAvatarAppearance(THREE,avatar,{scene=null,external=false}={}) {
  let pool=pools.get(THREE);
  if(!pool){pool={references:0,templates:createAllAccessories(THREE,new THREE.Group()),collection:new Map(),patterns:createPatternedSuitPool(THREE)};pools.set(THREE,pool);}pool.references++;
  function template(id){
    if(pool.templates[id])return pool.templates[id];
    const item=getCollectionItem(id);if(!item||item.slot==='suit')return null;
    if(!pool.collection.has(id))pool.collection.set(id,createCollectionAccessory(THREE,item));
    return pool.collection.get(id).root;
  }
  const upper=avatar.root.getObjectByName('hood').parent,root=new THREE.Group(),equipped=new Map();
  root.name='cosmetic-accessories';(external?scene:upper).add(root);if(external)root.matrixAutoUpdate=false;
  const face=external?new THREE.Mesh(avatar.root.getObjectByName('face').geometry,avatar.root.getObjectByName('face').material):null;
  if(face){face.matrixAutoUpdate=false;scene.add(face);}
  let outfit={...DEFAULT_OUTFIT},lastKey='',disposed=false,pattern=null,patternId=null;
  function setOutfit(next={},role='visitor') {
    const clean={...DEFAULT_OUTFIT};
    for(const slot of Object.keys(clean)){const item=findItem(next?.[slot]);if(item?.slot===slot)clean[slot]=item.id;}
    const key=JSON.stringify([clean,role]);if(key===lastKey)return;lastKey=key;outfit=clean;
    for(const slot of ['head','face','bag']){
      const id=outfit[slot],old=equipped.get(slot);if(old?.userData.itemId===id)continue;
      old?.removeFromParent();equipped.delete(slot);
      const source=template(id);if(source){const group=source.clone(true);group.visible=true;group.userData.itemId=id;root.add(group);equipped.set(slot,group);}
    }
    avatar.setEyeStyle(outfit.beauty);
    const desired=!isSafety(role)&&isPatternedSuit(outfit.suit)?outfit.suit:null;
    if(desired!==patternId){pattern?.dispose();pattern=null;patternId=desired;if(desired)pattern=pool.patterns.apply(avatar,desired);}
    if(!external&&!pattern)avatar.setSuitColor(isSafety(role)?safetyColor(role):suitColor(outfit));
    if(face)face.material=avatar.root.getObjectByName('face').material;
  }
  function update(visible=true,time=performance.now()/1000) {
    root.visible=visible;
    if(visible)for(const group of equipped.values())updateCollectionAccessory(group,time);
    if(external){upper.updateWorldMatrix(true,false);root.matrix.copy(upper.matrixWorld);root.updateMatrixWorld(true);face.visible=visible;const source=avatar.root.getObjectByName('face');source.updateWorldMatrix(true,false);face.matrix.copy(source.matrixWorld);face.updateMatrixWorld(true);}
  }
  return {root,setOutfit,update,get needsAnimation(){return Boolean(pattern?.pending||['head-ufo','head-propeller'].includes(outfit.head));},get headwear(){return [...equipped].filter(([slot])=>slot==='head').map(([,g])=>g);},
    dispose(){if(disposed)return;disposed=true;pattern?.dispose();root.removeFromParent();face?.removeFromParent();if(--pool.references===0){const geometries=new Set(),materials=new Set();for(const group of Object.values(pool.templates))group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const accessory of pool.collection.values())accessory.dispose();pool.patterns.dispose();pools.delete(THREE);}}
  };
}
