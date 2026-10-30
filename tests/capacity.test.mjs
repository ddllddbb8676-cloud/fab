import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCapacity, validateCapacity, renderReport, assumptions } from '../scripts/calculate-capacity.mjs';
import { capacityPlan } from '../src/capacity-plan.js';

const route=JSON.parse(await readFile(new URL('../data/dram-flow-2026-10-30.json',import.meta.url),'utf8'));
test('all 319 process steps and 54 MI checkpoints are covered exactly once',()=>{
  assert.equal(validateCapacity(capacityPlan,route),true);
  assert.equal(new Set(capacityPlan.coverage.processCoverage.map(x=>x.number)).size,319);
  assert.equal(new Set(capacityPlan.coverage.miCoverage.map(x=>x.index)).size,54);
});
test('all pools fit every scenario and increasing service times never reduces capacity requirements',()=>{
  assert.equal(assumptions.productiveHours,489.6);
  assert.ok(Math.abs(720*.85*.8-assumptions.productiveHours)<1e-10);
  for(const p of capacityPlan.pools){
    assert.ok(p.scenarios.minimum.tools<=p.scenarios.base.tools,p.id);
    assert.ok(p.scenarios.base.tools<=p.scenarios.conservative.tools,p.id);
    for(const s of ['minimum','base','conservative'])assert.ok(p.scenarios[s].tools*489.6*p.scenarios[s].wph+1e-6>=p.monthlyPasses,p.id);
  }
});
test('implicit tracks, combined Cu stack and sampled measurements do not double-count route steps',()=>{
  assert.equal(capacityPlan.coverage.implicitTrackVisits,36);
  const stack=capacityPlan.pools.find(p=>p.id==='me-cu-stack');
  assert.deepEqual(stack.steps,[292,293]);assert.equal(stack.visitsPerWafer,1);assert.equal(stack.monthlyPasses,10000);
  const cd=capacityPlan.pools.find(p=>p.id==='mi-cd');
  assert.equal(cd.checkpoints,14);assert.ok(Math.abs(cd.monthlyPasses-16800)<1e-8);
  assert.equal(capacityPlan.pools.find(p=>p.id==='mi-ebeam').monthlyPasses,400);
  assert.equal(capacityPlan.coverage.sorterVisits,6);
});
test('Cu segregation survives arithmetic and reserves remain separate from throughput minimum',()=>{
  const owner=n=>capacityPlan.coverage.processCoverage.find(x=>x.number===n).poolId;
  assert.notEqual(owner(295),owner(319));assert.notEqual(owner(297),owner(307));assert.notEqual(owner(296),owner(306));assert.notEqual(owner(298),owner(5));
  assert.equal(capacityPlan.totalWithOptionalSpares,capacityPlan.totalTools+capacityPlan.optionalSpares);
  assert.equal(capacityPlan.totalTools,capacityPlan.families.reduce((s,f)=>s+f.recommended,0));
  assert.equal(capacityPlan.currentTotal,360);
});
test('invalid missing and duplicate coverage is rejected',()=>{
  const missing=structuredClone(capacityPlan);missing.coverage.processCoverage.pop();assert.throws(()=>validateCapacity(missing,route));
  const duplicate=structuredClone(capacityPlan);duplicate.coverage.miCoverage[1]=duplicate.coverage.miCoverage[0];assert.throws(()=>validateCapacity(duplicate,route));
});
test('static export is reproducible and report contains assumptions and linked evidence',()=>{
  const computed=calculateCapacity(route,Object.fromEntries(capacityPlan.families.map(f=>[f.key,f.current])));
  assert.deepEqual(computed.families,capacityPlan.families);
  assert.deepEqual(computed.pools,capacityPlan.pools);
  const html=renderReport(capacityPlan);
  assert.ok(html.includes('lang="ko"'));assert.ok(html.includes('489.6'));assert.ok(html.includes('실제 제조사의 레시피 실측값은 아닙니다'));
  assert.ok(html.includes('https://study.semitoon.com/flow/'));assert.ok(!html.includes('undefined'));assert.ok(!html.includes('NaN'));
});
