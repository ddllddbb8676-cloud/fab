import test from 'node:test';
import assert from 'node:assert/strict';
import { machines } from '../src/layout.js';
import { buildEquipmentCatalog } from '../src/equipment-catalog.js';
import { filterEquipment } from '../src/equipment-directory.js';

const equipment = buildEquipmentCatalog(machines);

test('bay purpose search distinguishes Cu-dedicated cleaning from general cleaning', () => {
  const copper = filterEquipment(equipment, 'Cu 전용', 'CLEAN');
  assert.equal(copper.length, 20);
  assert.ok(copper.every(item => item.bayId === 14 && item.cuDedicated));
  const general = filterEquipment(equipment, '일반 세정');
  assert.equal(general.length, 20);
  assert.ok(general.every(item => item.bayId === 7 && !item.cuDedicated));
  assert.equal(filterEquipment(equipment, '메탈').length, 40);
});

test('BAY queries select the exact bay, not matching tool numbers in other bays', () => {
  for (const query of ['BAY 01', 'BAY01', 'bay1', 'BAY 0001']) {
    const results = filterEquipment(equipment, query);
    assert.equal(results.length, 20, query);
    assert.ok(results.every(item => item.bayId === 0), query);
  }
  for (const query of ['BAY18', 'BAY 18', 'SO BAY18', 'FAB A SO BAY 18']) {
    const results = filterEquipment(equipment, query);
    assert.equal(results.length, 20, query);
    assert.ok(results.every(item => item.bayId === 17), query);
  }
  assert.equal(filterEquipment(equipment, 'BAY99').length, 0);
  assert.equal(filterEquipment(equipment, 'BAY00').length, 0);
  assert.equal(filterEquipment(equipment, 'BAY01', 'SORT').length, 0);
});

test('every complete equipment code resolves to its one physical tool', () => {
  for (const item of equipment) {
    assert.deepEqual(filterEquipment(equipment, item.code).map(match => match.id), [item.id]);
    assert.deepEqual(filterEquipment(equipment, item.code.toLowerCase()).map(match => match.id), [item.id]);
  }
  assert.equal(filterEquipment(equipment, 'FAB A').length, 360);
});
