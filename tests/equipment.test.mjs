import test from 'node:test';
import assert from 'node:assert/strict';
import { machines } from '../src/layout.js';
import { processFamilies, processCodes, bayFamilyIndices, bayPurposes, getBayPurpose, equipmentTypes, buildEquipmentCatalog } from '../src/equipment-catalog.js';

// Use the authored bay assignment directly, and also verify layout adopts it.
const assigned = machines.map(m => ({ ...m, familyIndex: bayFamilyIndices[m.bayId] }));

test('every tool and load port has a distinct readable identity across all 11 families', () => {
  assert.deepEqual(processCodes, { PHOTO: 'PH', ETCH: 'ET', DEPO: 'CV', DIFF: 'DI', IMP: 'IM', METAL: 'ME', CMP: 'CM', CLEAN: 'CL', METRO: 'MT', INSP: 'IN', SORT: 'SO' });
  const equipment = buildEquipmentCatalog(assigned);
  assert.equal(equipment.length, 360);
  assert.equal(new Set(equipment.map(e => e.code)).size, equipment.length);
  assert.equal(new Set(equipment.map(e => e.name)).size, equipment.length);
  assert.equal(new Set(equipment.flatMap(e => e.portCodes)).size, 1080);
  assert.deepEqual(new Set(equipment.map(e => e.familyKey)), new Set(processFamilies.map(f => f.key)));
  assert.equal(new Set(equipment.map(e => `${e.familyKey}:${e.typeCode}`)).size, equipmentTypes.length);
  for (const e of equipment) {
    assert.match(e.code, /^(PH|ET|CV|DI|IM|ME|CM|CL|MT|IN|SO)A\d{4}$/);
    assert.equal(e.code.length, 7);
    assert.equal(e.code.slice(0, 2), processCodes[e.familyKey]);
    assert.equal(e.code.slice(2, 3), e.fabCode);
    assert.equal(Number(e.code.slice(3, 5)), e.bayId + 1);
    assert.equal(Number(e.code.slice(5, 7)), e.ordinal);
    assert.equal(e.ordinal, (e.rowLabel === 'A' ? 0 : 10) + e.column + 1);
    assert.equal(e.name, `${e.typeName} · ${e.code}`);
    assert.ok(e.description.length > 15);
    assert.equal(e.portCodes.length, 3);
    assert.equal(e.rowLabel, assigned[e.id].sign === 1 ? 'A' : 'B');
  }
  assert.ok(equipment.some(e => e.code === 'PHA0101'));
  assert.ok(equipment.some(e => e.code === 'SOA1801'));
  for (let bayId = 0; bayId < 18; bayId++) assert.deepEqual(equipment.filter(e => e.bayId === bayId).map(e => e.ordinal), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('reordering input preserves physical-tool names without mutating layout or transport IDs', () => {
  const before = JSON.stringify(assigned);
  const ordered = buildEquipmentCatalog(assigned);
  const shuffled = buildEquipmentCatalog([...assigned].reverse());
  const lookup = new Map(shuffled.map(e => [e.id, e]));
  for (const e of ordered) assert.deepEqual(lookup.get(e.id), e);
  assert.equal(JSON.stringify(assigned), before);
  assert.deepEqual(shuffled.map(e => e.id), [...assigned].reverse().map(e => e.id));
  assert.throws(() => buildEquipmentCatalog([assigned[0], assigned[0]]), /unique integer/);
});

test('rendered bay assignments match the catalogue and wafer sorter is distinct from electrical testing', () => {
  assert.ok(machines.every(m => m.familyIndex === bayFamilyIndices[m.bayId]));
  const sorters = buildEquipmentCatalog(assigned).filter(e => e.familyKey === 'SORT');
  assert.equal(sorters.length, 20);
  assert.ok(sorters.every(e => e.description.includes('FOUP') && e.description.includes('테스터가 아닙니다')));
});

test('Cu cleaning has a dedicated bay while numbering and other metal and cleaning uses stay distinct', () => {
  const equipment = buildEquipmentCatalog(assigned);
  assert.equal(bayPurposes.length, 18);
  assert.deepEqual(bayPurposes.flatMap((purpose, bayId) => purpose.yellowLight ? [bayId] : []), [0, 5, 9, 14]);
  assert.deepEqual(getBayPurpose(7), { name: '일반 세정', cuDedicated: false, yellowLight: false });
  assert.deepEqual(getBayPurpose(14), { name: 'Cu 전용 세정', cuDedicated: true, yellowLight: true });
  const cuCleaners = equipment.filter(e => e.cuDedicated);
  assert.equal(cuCleaners.length, 20);
  assert.equal(new Set(cuCleaners.map(e => e.typeCode)).size, 4);
  for (const e of cuCleaners) {
    assert.equal(e.bayId, 14);
    assert.equal(e.bayLabel, 'BAY 15');
    assert.equal(e.bayPurpose, 'Cu 전용 세정');
    assert.equal(e.familyKey, 'CLEAN');
    assert.match(e.typeName, /^Cu 전용 /);
    assert.match(e.description, /Cu\(구리\) 공정 웨이퍼 전용/);
    assert.match(e.code, /^CLA15\d{2}$/);
    assert.equal(e.yellowLight, true);
  }
  const generalCleaners = equipment.filter(e => e.bayId === 7);
  assert.equal(generalCleaners.length, 20);
  assert.ok(generalCleaners.every(e => !e.cuDedicated && !e.yellowLight && e.bayPurpose === '일반 세정' && !e.typeName.includes('Cu')));
  for (const bayId of [5]) {
    assert.deepEqual(getBayPurpose(bayId), { name: '메탈', cuDedicated: false, yellowLight: true });
    assert.ok(equipment.filter(e => e.bayId === bayId).every(e => e.familyKey === 'METAL' && e.bayPurpose === '메탈' && !e.cuDedicated));
  }
  assert.deepEqual([...new Set(equipment.map(e => e.bayLabel))], Array.from({ length: 18 }, (_, i) => `BAY ${String(i + 1).padStart(2, '0')}`));
  for (const machine of assigned) {
    const e = equipment.find(item => item.id === machine.id);
    const unchangedCode = `${processCodes[processFamilies[machine.familyIndex].key]}A${String(machine.bayId + 1).padStart(2, '0')}${String((machine.sign === 1 ? 0 : 10) + machine.column + 1).padStart(2, '0')}`;
    assert.equal(e.code, unchangedCode);
    assert.deepEqual(e.portCodes, machine.ports.map((_, i) => `${unchangedCode}L${i + 1}`));
  }
});

test('30k planning assignment retains 18 bays and 360 tools with sufficient process-group capacity', () => {
  const equipment = buildEquipmentCatalog(machines);
  const counts = Object.fromEntries(processFamilies.map(family => [family.key, equipment.filter(e => e.familyKey === family.key).length]));
  assert.deepEqual(counts, { PHOTO: 40, ETCH: 60, DEPO: 60, DIFF: 40, IMP: 20, METAL: 20, CMP: 20, CLEAN: 40, METRO: 20, INSP: 20, SORT: 20 });
  assert.equal(equipment.length, 360);
  assert.equal(new Set(equipment.map(e => e.bayId)).size, 18);
  for (const [bayId, familyKey, sampleCode] of [[12, 'DIFF', 'DIA1301'], [13, 'DEPO', 'CVA1401'], [15, 'ETCH', 'ETA1601']]) {
    const tools = equipment.filter(e => e.bayId === bayId);
    assert.equal(tools.length, 20);
    assert.ok(tools.every(e => e.familyKey === familyKey && !e.yellowLight && !e.cuDedicated));
    assert.equal(tools[0].code, sampleCode);
  }
});
