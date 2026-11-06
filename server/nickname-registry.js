import {createVisitorName,nicknameKey,validNickname} from '../src/visitor-name.js';
import {createSafetyName} from '../src/safety-team.js';

// Profiles are the durable source; this index includes offline and zero-score people.
// Allocation is synchronous inside the one shared room, before a profile is queued.
export function createNicknameRegistry() {
  const owners=new Map(),names=new Map();
  const ownerKey=(id,kind)=>`${id}/${kind}`;
  function reserve(id,kind,name) {
    if(!validNickname(name))return false;
    const owner=ownerKey(id,kind),key=nicknameKey(name);
    if(owners.has(key)&&owners.get(key)!==owner)return false;
    if(names.has(owner))return true;
    owners.set(key,owner);names.set(owner,name);return true;
  }
  return {
    reserve,
    visitorName(id) {return names.get(ownerKey(id,'visitor'))??null;},
    available(id,name) {const owner=owners.get(nicknameKey(name));return validNickname(name)&&(!owner||owner===ownerKey(id,'visitor'));},
    replace(id,name) {
      const owner=ownerKey(id,'visitor'),key=nicknameKey(name),current=owners.get(key);
      if(!validNickname(name)||(current&&current!==owner))return false;
      const old=names.get(owner);if(old)owners.delete(nicknameKey(old));
      owners.set(key,owner);names.set(owner,name);return true;
    },
    visitorId(name) {const owner=owners.get(nicknameKey(name));return owner?.endsWith('/visitor')?owner.slice(0,-8):null;},
    replacement(id,random=Math.random) {return createVisitorName(random,[...owners.keys()]);},
    claim(id,kind='visitor',preferred='',excluded=[],random=Math.random) {
      const owner=ownerKey(id,kind);
      if(names.has(owner))return names.get(owner);
      const create=kind==='safety'?createSafetyName:createVisitorName;
      const name=create(random,[...owners.keys(),...excluded],preferred);
      reserve(id,kind,name);return name;
    },
    forget(id) {for(const kind of ['visitor','safety']){const owner=ownerKey(id,kind),name=names.get(owner);if(name){owners.delete(nicknameKey(name));names.delete(owner);}}},
    get size(){return names.size;}
  };
}
