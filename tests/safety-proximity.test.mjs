import test from 'node:test';
import assert from 'node:assert/strict';
import {safetyProximity} from '../src/safety-proximity.js';
import {REST_AREAS} from '../src/rest-area.js';

const person={id:'me',x:0,z:0,role:'visitor',phase:'idle'};
const guard={id:'guard',x:5,z:0,role:'safety-red',phase:'idle'};
test('both human and resident safety guards trigger distance-based warning with stable edge hysteresis',()=>{
  for(const id of ['visitor:123','safety:0'])for(const role of ['safety-red','safety-orange']){
    const g={...guard,id,role};assert.equal(safetyProximity(person,[g]).near,true);
    assert.equal(safetyProximity(person,[{...g,x:9}]).near,false);
    assert.equal(safetyProximity(person,[{...g,x:9}],true).near,true);
    assert.equal(safetyProximity(person,[{...g,x:11}],true).near,false);
    assert.ok(safetyProximity(person,[{...g,x:2}]).strength>safetyProximity(person,[g]).strength);
  }
});
test('safe zones, working repairs, OHT rides, entry and completed catches silence the warning',()=>{
  for(const patch of [{phase:'repair'},{phase:'riding'},{phase:'climb'},{hidden:true},{penalty:3},{role:'safety-orange'}])assert.equal(safetyProximity({...person,...patch},[guard],true).near,false);
  for(const zone of REST_AREAS){const p={...person,x:(zone.minX+zone.maxX)/2,z:(zone.minZ+zone.maxZ)/2};assert.equal(safetyProximity(p,[{...guard,x:p.x,z:p.z}],true).near,false);}
  for(const patch of [{hidden:true},{role:'visitor'},{phase:'riding'},{id:'me'}])assert.equal(safetyProximity(person,[{...guard,...patch}],true).near,false);
});
