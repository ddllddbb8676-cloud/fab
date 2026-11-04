import { isBlocked, machines, SEATED_FOUP_Y } from './layout.js';
import {entranceBounds} from './entrance-layout.js';
import {stockers,stockerById,stockerBounds,stockerSlot,stockerRecordPose,STOCKER_CAPACITY,STOCKER_TRANSFER_SECONDS,STOCKER_OUT_CUE_AT} from './stocker-layout.js';
const stockModes=new Set(['stored','stocking','retrieving','stocker-out']);
// Accept the retired units only while reading older saved worlds.
const retiredStockers=new Set(['STK03','STK04','STK05','STK06']);
export const FOUP_CLEAN_SECONDS = 3.2;
export const FOUP_CLEAN_REWARD = 2;
export const FOUP_RESTOCK_SECONDS = 12;

export function floorSpot(point, radius = .295) {
  if (!isBlocked(point.x, point.z, radius)) return { x: point.x, z: point.z };
  for (let r = .12; r <= 4; r += .12) for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, x = point.x + Math.sin(a) * r, z = point.z + Math.cos(a) * r;
    if (!isBlocked(x, z, radius)) return { x, z };
  }
  return null;
}

export function supportHeight(x, z) {
  let height = 0;
  for(const b of entranceBounds)if(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)height=Math.max(height,b.maxY);
  for(const b of stockerBounds)if(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)height=Math.max(height,b.maxY);
  for (const machine of machines) for (const b of machine.walkBounds) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) height = Math.max(height, b.part === 'cabinet' ? 3.4 : b.part === 'efem' ? 1.4625 : 2.05);
  }
  return height;
}

// A FOUP keeps the same identity across port, hands, throw and ground states.
export function createFoupStore({ ports, initialPortIds = [], hideOriginal = () => {}, showOriginal = () => {}, isDestroyed = () => false, onImpact = () => {}, onShatter = () => {}, onChange = () => {}, seedStockers=false, onStockerOut=()=>{} }) {
  const byPort = new Map(ports.map(p => [p.id, p])), records = new Map(), occupancy = new Map();
  const hands = new Map();
  let stockersSeeded=false;
  function reset() {
    records.clear();occupancy.clear();hands.clear();
    stockersSeeded=false;
    for (const id of initialPortIds) {
    const p = byPort.get(id); if (!p) continue;
    const record = { id: `port:${id}`, mode: 'port', portId: id, homePortId: id, breakSeq: 0, original: true, x: p.x, y: SEATED_FOUP_Y, z: p.z, yaw: p.sign === 1 ? Math.PI : 0 };
    records.set(record.id, record); occupancy.set(id, record.id);
    showOriginal(id);
    }
  }
  reset();
  function stockerState(id){
    const items=[...records.values()].filter(r=>r.stockerId===id&&stockModes.has(r.mode));
    return {items,count:items.filter(r=>r.mode==='stored').length,busy:items.some(r=>r.mode==='stocking'||r.mode==='retrieving'),out:items.find(r=>r.mode==='stocker-out')??null};
  }
  function stow(record,s,slot,mode){
    if(record.original){hideOriginal(record.portId);record.original=false;}
    if(record.portId)occupancy.delete(record.portId);
    if(record.owner)hands.delete(record.owner);
    record.homePortId??=record.portId;delete record.owner;
    Object.assign(record,{mode,portId:null,stockerId:s.id,stockSlot:slot,stockAge:0,stockCue:false});
    Object.assign(record,stockerRecordPose(record));
  }
  function initializeStockers(){
    if(stockersSeeded||!seedStockers)return;
    stockersSeeded=true;
    for(const s of stockers){
      // Reuse untouched world FOUPs: no new identities or player rewards.
      const available=[...records.values()].filter(r=>r.original&&r.portId&&!isDestroyed(byPort.get(r.portId)?.machineId))
        .sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)).slice(0,12);
      available.forEach((r,i)=>stow(r,s,Math.floor(i/2)*8+(i%2)*3,'stored'));
    }
  }
  function stockerPut(id,owner='player',expectedId){
    const s=stockerById.get(id),r=records.get(hands.get(owner)),state=stockerState(id);
    if(!s||!r||expectedId&&r.id!==expectedId)return {ok:false,message:'들고 있는 FOUP으로 IN을 눌러주세요'};
    if(state.busy)return {ok:false,message:'스토커가 움직이고 있어요. 잠시만 기다려주세요'};
    if(state.items.length>=STOCKER_CAPACITY)return {ok:false,message:'스토커가 가득 찼어요'};
    const occupied=new Set(state.items.map(r=>r.stockSlot));let slot=0;while(occupied.has(slot))slot++;
    stow(r,s,slot,'stocking');onChange();return {ok:true,phase:'stocking'};
  }
  function stockerGet(id,owner='player',expectedId=null){
    const s=stockerById.get(id),state=stockerState(id);
    if(!s||hands.has(owner))return {ok:false,message:'들고 있는 FOUP을 먼저 내려놓아 주세요'};
    if(expectedId){
      if(state.out?.id!==expectedId||!pickup(expectedId,owner))return {ok:false,message:'다른 사람이 FOUP을 먼저 가져갔어요'};
      return {ok:true,phase:'pickup'};
    }
    if(state.out)return {ok:false,message:'OUT에 나온 FOUP을 눌러 가져가세요'};
    if(state.busy)return {ok:false,message:'스토커가 움직이고 있어요. 잠시만 기다려주세요'};
    const r=state.items.find(r=>r.mode==='stored');
    if(!r)return {ok:false,message:'보관 중인 FOUP이 없어요. IN으로 넣을 수 있어요'};
    Object.assign(r,{mode:'retrieving',stockAge:0,stockCue:false});Object.assign(r,stockerRecordPose(r));onChange();
    return {ok:true,phase:'retrieving'};
  }
  function atPort(id) { const p = byPort.get(id); return p && !isDestroyed(p.machineId) ? records.get(occupancy.get(id)) ?? null : null; }
  function adopt(id, pose, portId = null) {
    if (records.has(id)) return records.get(id);
    const record = { id, mode: portId ? 'port' : 'ground', portId, homePortId: portId, breakSeq: 0, original: false, ...pose };
    records.set(id, record); if (portId) occupancy.set(portId, id); onChange(); return record;
  }
  function pickup(id, owner = 'player') {
    const record = records.get(id);
    if (hands.has(owner) || !record || !['port', 'ground','stocker-out'].includes(record.mode)) return false;
    if (record.portId && atPort(record.portId) !== record) return false;
    if (record.original) { hideOriginal(record.portId); record.original = false; }
    if (record.portId) occupancy.delete(record.portId);
    record.homePortId ??= record.portId;
    delete record.stockerId;delete record.stockSlot;delete record.stockAge;delete record.stockCue;
    record.portId = null; record.mode = 'carried'; record.owner = owner; hands.set(owner, id); onChange(); return true;
  }
  function place(portId, owner = 'player') {
    const record = records.get(hands.get(owner)), p = byPort.get(portId);
    if (!record || !p || occupancy.has(portId) || isDestroyed(p.machineId)) return false;
    Object.assign(record, { mode: 'port', portId, x: p.x, y: SEATED_FOUP_Y, z: p.z, yaw: p.sign === 1 ? Math.PI : 0 });
    occupancy.set(portId, record.id); hands.delete(owner); delete record.owner; onChange(); return true;
  }
  function launch(record, pose, velocity, { shatter = false } = {}) {
    if (!record || !records.has(record.id) || ['broken','cleared'].includes(record.mode)) return false;
    if (record.original) { hideOriginal(record.portId); record.original = false; }
    if (record.portId) occupancy.delete(record.portId);
    if (record.owner) hands.delete(record.owner); delete record.owner;
    Object.assign(record, pose, { mode: 'flying', portId: null, vx: velocity.x, vy: velocity.y, vz: velocity.z, bounce: 0, shatter }); onChange(); return true;
  }
  function breakFoup(record, silent = false) {
    const spot = floorSpot(record, .48) ?? floorSpot(record, .24);
    if (spot) Object.assign(record, spot);
    Object.assign(record, {mode:'broken',y:.035,damageAge:silent?2:0,breakSeq:(record.breakSeq||0)+1,shatter:false,cleaner:null,cleanProgress:0});
    delete record.goal;
    if (!silent) onShatter(record);
    onChange();
  }
  function beginCleanup(id, owner, breakSeq) {
    const r=records.get(id);
    if(!r||r.mode!=='broken'||r.damageAge<1.4||r.breakSeq!==breakSeq||r.cleaner&&r.cleaner!==owner)return false;
    r.cleaner=owner;r.cleanProgress=0;return true;
  }
  function cancelCleanup(owner) {for(const r of records.values())if(r.cleaner===owner){r.cleaner=null;r.cleanProgress=0;}}
  function finishCleanup(id, owner, breakSeq) {
    const r=records.get(id);if(!r||r.mode!=='broken'||r.cleaner!==owner||r.breakSeq!==breakSeq||r.cleanProgress<1)return false;
    Object.assign(r,{mode:'cleared',cleaner:null,cleanProgress:0,refillIn:FOUP_RESTOCK_SECONDS});onChange();return true;
  }
  function restock(r,notify=true) {
    const available=id=>{const p=byPort.get(id);return p&&initialPortIds.includes(id)&&!occupancy.has(id)&&!isDestroyed(p.machineId);};
    const id=available(r.homePortId)?r.homePortId:initialPortIds.find(available),p=byPort.get(id);
    if(!p)return;
    Object.assign(r,{mode:'port',portId:id,homePortId:id,x:p.x,y:SEATED_FOUP_Y,z:p.z,yaw:p.sign===1?Math.PI:0,damageAge:0});
    occupancy.set(id,r.id);if(notify)onChange();
  }
  function checkpoint() {
    initializeStockers();
    const rounded=n=>Math.round(n*1000)/1000;
    // Keep the original v1 rows readable by the pre-stocker release. On rollback
    // these SAME FOUPs safely return to the floor apron, not invalid new modes.
    const rows=[...records.values()].filter(r=>!r.original),entries=[];
    const result={version:1,records:rows.map(r=>{
      let mode=r.mode,p=r;
      if(stockModes.has(mode)){
        entries.push([r.id,r.stockerId,mode,r.stockSlot]);
        p={...stockerById.get(r.stockerId).ports[1].approach,y:.225,yaw:r.yaw};mode='ground';
      }
      return [r.id,mode,r.portId??null,rounded(p.x),rounded(p.y),rounded(p.z),rounded(p.yaw||0),r.breakSeq||0,Boolean(r.shatter),r.homePortId??null];
    })};
    if(stockersSeeded||entries.length)result.stockers={version:1,initialized:true,entries};
    return result;
  }
  function restore(saved) {
    if(saved?.version!==1||!Array.isArray(saved.records)||saved.records.length>1200)throw new Error('Invalid FOUP checkpoint');
    const seen=new Set(),slots=new Set();
    for(const row of saved.records){
      if(!Array.isArray(row)||typeof row[0]!=='string'||!/^(port:\d{1,3}:\d|vehicle:\d{1,2})$/.test(row[0])||seen.has(row[0])||!['port','carried','flying','ground','broken','cleared'].includes(row[1])||!row.slice(3,7).every(Number.isFinite)||Math.abs(row[3])>60||Math.abs(row[5])>90||row[4]<0||row[4]>6||!Number.isSafeInteger(row[7])||row[7]<0)throw new Error('Invalid FOUP record');
      if(row[1]==='port'&&(!byPort.has(row[2])||slots.has(row[2])))throw new Error('Invalid FOUP occupancy');
      if(row[1]==='port')slots.add(row[2]);seen.add(row[0]);
    }
    const stock=saved.stockers;
    if(stock!==undefined){
      if(stock?.version!==1||stock.initialized!==true||!Array.isArray(stock.entries)||stock.entries.length>(stockers.length+retiredStockers.size)*STOCKER_CAPACITY)throw new Error('Invalid stocker checkpoint');
      const used=new Set(),cells=new Set(),outs=new Set();
      for(const row of stock.entries){
        const [id,sid,mode,slot]=row??[];
        if(!Array.isArray(row)||!seen.has(id)||used.has(id)||!(stockerById.has(sid)||retiredStockers.has(sid))||!stockModes.has(mode)||!Number.isInteger(slot)||slot<0||slot>=STOCKER_CAPACITY||cells.has(`${sid}:${slot}`))throw new Error('Invalid stocker record');
        if(['retrieving','stocker-out'].includes(mode)){if(outs.has(sid))throw new Error('Duplicate stocker output');outs.add(sid);}
        if(saved.records.find(r=>r[0]===id)?.[1]!=='ground')throw new Error('Invalid stocker fallback');
        used.add(id);cells.add(`${sid}:${slot}`);
      }
    }
    reset();
    const incoming=saved.records.map(([id,mode,portId,x,y,z,yaw,breakSeq,shatter,homePortId])=>({id,mode,portId,x,y,z,yaw,breakSeq,shatter,homePortId,damageAge:2,cleaner:null,cleanProgress:0,refillIn:FOUP_RESTOCK_SECONDS}));
    synchronize(incoming,null,true);
    if(stock){
      stockersSeeded=true;
      // Restore existing entrance shelves/OUT first, regardless of saved order.
      for(const [id,sid,mode,slot]of stock.entries)if(stockerById.has(sid)){const r=records.get(id);stow(r,stockerById.get(sid),slot,['retrieving','stocker-out'].includes(mode)?'stocker-out':'stored');}
      const cells=new Map(stockers.map(s=>[s.id,new Set(stockerState(s.id).items.map(r=>r.stockSlot))]));
      for(const [id,sid]of stock.entries)if(retiredStockers.has(sid)){
        const r=records.get(id),preferred=sid==='STK03'||sid==='STK05'?'STK01':'STK02';
        const target=stockers.find(s=>s.id===preferred&&cells.get(s.id).size<STOCKER_CAPACITY)??stockers.find(s=>cells.get(s.id).size<STOCKER_CAPACITY);
        if(target){let slot=0;while(cells.get(target.id).has(slot))slot++;cells.get(target.id).add(slot);stow(r,target,slot,'stored');}
        // A previously full six-unit world may exceed the two-unit capacity.
        // Reuse a free equipment port, or retain the safe ground fallback.
        else restock(r,false);
      }
    }else initializeStockers();
    // A carrier already on the old empty rear strip must remain reachable
    // after the service wall moves. Keep its identity and cleanup/reward state.
    for(const r of records.values())if(['ground','broken','cleared','flying','carried'].includes(r.mode)){
      const wing=entranceBounds.find(b=>r.x>b.minX-.3&&r.x<b.maxX+.3&&r.z>b.minZ-.3&&r.z<b.maxZ+.3);
      if(wing)r.z=wing.minZ-.4;
    }
    for(const r of records.values())if(['flying','carried'].includes(r.mode)){
      // An interrupted throw cannot return a fresh, reward-eligible FOUP. Restore
      // its settled result; interrupted carries/drop actions remain intact.
      if(r.shatter)breakFoup(r,true);
      else {Object.assign(r,floorSpot(r,.24)??{x:0,z:70},{mode:'ground',y:.225});delete r.owner;}
    }
    onChange();
  }
  function step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for(const r of records.values()){
      if(r.mode==='stocking'||r.mode==='retrieving'){
        r.stockAge=Math.min(STOCKER_TRANSFER_SECONDS,(r.stockAge||0)+Math.min(dt,.1));
        Object.assign(r,stockerRecordPose(r));
        if(r.mode==='retrieving'&&!r.stockCue&&r.stockAge>=STOCKER_OUT_CUE_AT){r.stockCue=true;onStockerOut(stockerById.get(r.stockerId).ports[1]);}
        if(r.stockAge>=STOCKER_TRANSFER_SECONDS){r.mode=r.mode==='stocking'?'stored':'stocker-out';Object.assign(r,stockerRecordPose(r));onChange();}
      }
      if(r.mode==='broken')r.damageAge=Math.min(2,(r.damageAge||0)+Math.min(dt,.1));
      if(r.mode==='cleared'){r.refillIn=Math.max(0,(r.refillIn??FOUP_RESTOCK_SECONDS)-Math.min(dt,.1));if(r.refillIn===0)restock(r);}
    }
    const steps = Math.max(1, Math.ceil(Math.min(dt, .1) / .016)), h = Math.min(dt, .1) / steps;
    for (let i = 0; i < steps; i++) for (const record of records.values()) {
      if (record.mode !== 'flying') continue;
      const x = record.x + record.vx * h, z = record.z + record.vz * h;
      if (Math.abs(x) < 58.5 && Math.abs(z) < 88.2 && record.y - .22 > supportHeight(x, z)) { record.x = x; record.z = z; }
      else { record.vx *= -.25; record.vz *= -.25; }
      record.vy -= 9.8 * h; record.y += record.vy * h; record.yaw += h * 5;
      if (record.y <= .225) {
        if(record.shatter){breakFoup(record);continue;}
        if (Math.abs(record.vy) > 1) onImpact(record, Math.abs(record.vy));
        record.y = .225;
        if (Math.abs(record.vy) > 1 && record.bounce++ < 2) { record.vy = -record.vy * .25; record.vx *= .4; record.vz *= .4; }
        else { const spot = floorSpot(record, .24); if (spot) Object.assign(record, spot); record.mode = 'ground'; onChange(); }
      }
    }
  }
  function synchronize(rows, selfId, initial = false) {
    // Clear all previous slots first: two records can exchange ports in one frame.
    for(const incoming of rows){const old=records.get(incoming.id);if(old?.original)hideOriginal(old.portId);if(old?.portId)occupancy.delete(old.portId);if(old?.owner)hands.delete(old.owner);}
    for(const incoming of rows) {
      let r=records.get(incoming.id);
      const owner=incoming.owner===selfId?'player':incoming.owner;
      const next={...incoming,owner,original:false};
      if(r&&r.mode===incoming.mode&&r.stockerId===incoming.stockerId&&['stocking','retrieving'].includes(r.mode))next.stockAge=Math.max(r.stockAge||0,incoming.stockAge||0);
      if(incoming.mode==='broken'&&initial)next.damageAge=2;
      if(r?.mode===incoming.mode&&r.breakSeq===incoming.breakSeq&&incoming.mode==='broken')next.damageAge=Math.max(r.damageAge||0,next.damageAge||0);
      if(r && incoming.mode==='flying' && !initial) {const {x,y,z,yaw}=r;Object.assign(r,next,{x,y,z,yaw,goal:next});}
      else {r=Object.assign(r??{},next);delete r.goal;}
      records.set(r.id,r);
      if(r.portId)occupancy.set(r.portId,r.id);
      if(r.mode==='carried'&&owner)hands.set(owner,r.id);
    }
  }
  function interpolate(dt) {const f=1-Math.exp(-dt*16);for(const r of records.values()){if(r.goal){for(const k of ['x','y','z'])r[k]+=(r.goal[k]-r[k])*f;r.yaw=r.goal.yaw;}if(r.mode==='broken')r.damageAge=Math.min(2,(r.damageAge||0)+dt);if(['stocking','retrieving'].includes(r.mode)){r.stockAge=Math.min(STOCKER_TRANSFER_SECONDS,(r.stockAge||0)+Math.max(0,dt));Object.assign(r,stockerRecordPose(r));}}}
  return { records, atPort, adopt, pickup, place, launch, step, reset, synchronize, interpolate, checkpoint, restore, beginCleanup, cancelCleanup, finishCleanup,stockerState,stockerPut,stockerGet,initializeStockers, occupied: id => occupancy.has(id),
    getCarried: owner => records.get(hands.get(owner)) ?? null,
    get carried() { return records.get(hands.get('player')) ?? null; },
    get state() { return { carriedId: hands.get('player') ?? null, managed: records.size, moved: [...records.values()].filter(r => !r.original).map(r => ({ id: r.id, mode: r.mode, owner: r.owner, portId: r.portId, x: r.x, y: r.y, z: r.z })) }; }
  };
}

// Only moved FOUPs enter these four instanced draws; untouched ports stay static.
export function createFoupRenderer(THREE, scene, materials, capacity = 1200) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), transform = new THREE.Object3D(), part = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const pieces = [
    { material: materials.foup, shapes: [[0, 0, 0, .43, .38, .36]] },
    { material: materials.foupDoor, shapes: [[0, 0, .19, .38, .32, .025]] },
    { material: materials.dark, shapes: [[0, -.205, 0, .45, .035, .38]] },
    { material: materials.foupRib, shapes: [[0, .215, 0, .19, .045, .13], ...Array.from({ length: 10 }, (_, i) => [(i % 2 ? 1 : -1) * .222, -.13 + Math.floor(i / 2) * .065, 0, .025, .024, .31])] }
  ];
  for (const group of pieces) {
    group.mesh = new THREE.InstancedMesh(geometry, group.material, capacity * group.shapes.length);
    group.mesh.name = 'Interactive FOUPs'; group.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.mesh.count = 0; group.mesh.frustumCulled = false; scene.add(group.mesh);
    group.locals = group.shapes.map(([x,y,z,sx,sy,sz]) => { part.position.set(x,y,z); part.scale.set(sx,sy,sz); part.updateMatrix(); return part.matrix.clone(); });
  }
  return {
    update(records) {
      const visible = records.filter(r => !r.original && !r.hidden && !['broken','cleared'].includes(r.mode)).slice(0, capacity);
      for (const group of pieces) {
        group.mesh.count = visible.length * group.locals.length;
        visible.forEach((record, index) => {
          transform.position.set(record.x, record.y, record.z); transform.rotation.set(0, record.yaw ?? 0, 0); transform.scale.setScalar(1); transform.updateMatrix();
          group.locals.forEach((local, j) => { matrix.multiplyMatrices(transform.matrix, local); group.mesh.setMatrixAt(index * group.locals.length + j, matrix); });
        });
        if (visible.length) group.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const group of pieces) { group.mesh.removeFromParent(); group.mesh.dispose(); } geometry.dispose(); }
  };
}
