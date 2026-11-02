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
