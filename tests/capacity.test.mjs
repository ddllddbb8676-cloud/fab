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
  assert.equal(assumptions.monthlyStarts,30000);
  assert.equal(capacityPlan.monthlyStarts,30000);
  assert.ok(Math.abs(720*.85*.8-assumptions.productiveHours)<1e-10);
  for(const p of capacityPlan.pools){
    assert.ok(p.scenarios.minimum.tools<=p.scenarios.base.tools,p.id);
    assert.ok(p.scenarios.base.tools<=p.scenarios.conservative.tools,p.id);
    for(const s of ['minimum','base','conservative'])assert.ok(p.scenarios[s].tools*capacityPlan.assumptions.productiveHours*p.scenarios[s].wph+1e-6>=p.monthlyPasses,p.id);
  }
});
test('implicit tracks, combined Cu stack and sampled measurements do not double-count route steps',()=>{
  assert.equal(capacityPlan.coverage.implicitTrackVisits,36);
  const stack=capacityPlan.pools.find(p=>p.id==='me-cu-stack');
  assert.deepEqual(stack.steps,[292,293]);assert.equal(stack.visitsPerWafer,1);assert.equal(stack.monthlyPasses,capacityPlan.monthlyStarts);
  const cd=capacityPlan.pools.find(p=>p.id==='mi-cd');
  assert.equal(cd.checkpoints,14);assert.ok(Math.abs(cd.monthlyPasses-capacityPlan.monthlyStarts*14*.12)<1e-8);
  assert.equal(capacityPlan.pools.find(p=>p.id==='mi-ebeam').monthlyPasses,capacityPlan.monthlyStarts*.04);
  assert.equal(capacityPlan.coverage.sorterVisits,6);
});
test('Cu segregation survives arithmetic and reserves remain separate from throughput minimum',()=>{
  const owner=n=>capacityPlan.coverage.processCoverage.find(x=>x.number===n).poolId;
  assert.notEqual(owner(295),owner(319));assert.notEqual(owner(297),owner(307));assert.notEqual(owner(296),owner(306));assert.notEqual(owner(298),owner(5));
  assert.equal(capacityPlan.totalWithOptionalSpares,capacityPlan.totalTools+capacityPlan.optionalSpares);
  assert.equal(capacityPlan.totalTools,capacityPlan.families.reduce((s,f)=>s+f.recommended,0));
  assert.equal(capacityPlan.currentTotal,360);
  assert.deepEqual(capacityPlan.scene,{width:120,length:180,height:5,bayCount:18,machineCount:360,preserved:true});
  assert.deepEqual(Object.fromEntries(capacityPlan.families.map(f=>[f.key,f.current])),{PH:40,ET:60,CV:60,DI:40,IM:20,ME:20,CM:20,CL:40,MT:20,IN:20,SO:20});
  assert.deepEqual(capacityPlan.countComparison.shortageFamilies,[]);
  for (const f of capacityPlan.families) {
    assert.equal(f.countDelta,f.current-f.recommended);
    assert.equal(f.countDeltaWithSpares,f.current-f.recommended-f.optionalSpares);
    assert.ok(f.countDeltaWithSpares>=0,`${f.key}: scene count is lower than base plus optional spare count`);
  }
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
  assert.ok(html.includes('월 3만 장'));assert.ok(!html.includes('월 1만 장'));
  assert.ok(html.includes('수량 차이'));assert.ok(html.includes('120×180m, 층고 5m, 18베이'));
});

test('monthly starts recompute pool ceilings instead of tripling the installed fleet',()=>{
  const current=Object.fromEntries(capacityPlan.families.map(f=>[f.key,f.current]));
  const small=calculateCapacity(route,current,{monthlyStarts:10000});
  const large=calculateCapacity(route,current,{monthlyStarts:30000});
  assert.equal(validateCapacity(small,route),true);assert.equal(validateCapacity(large,route),true);
  assert.equal(small.assumptions.monthlyStarts,10000);assert.equal(large.assumptions.monthlyStarts,30000);
  assert.equal(large.totalTools,capacityPlan.totalTools);
  assert.notEqual(large.totalTools,small.totalTools*3);
  assert.equal(small.optionalSpares,large.optionalSpares);
  assert.deepEqual(small.scene,large.scene);
  for(const p of large.pools){
    const before=small.pools.find(x=>x.id===p.id);
    assert.ok(Math.abs(p.monthlyPasses-before.monthlyPasses*3)<1e-6,p.id);
    for(const s of ['minimum','base','conservative'])assert.ok(p.scenarios[s].tools>=before.scenarios[s].tools,p.id);
  }
  assert.ok(renderReport(small).includes('월 1만 장'));assert.ok(!renderReport(small).includes('월 3만 장'));
});

test('monthly starts rejects invalid input and inconsistent generated plan values',()=>{
  for(const monthlyStarts of [0,-1,NaN,Infinity,3.5,'30000'])assert.throws(()=>calculateCapacity(route,{}, {monthlyStarts}),RangeError);
  const corrupted=structuredClone(capacityPlan);corrupted.monthlyStarts=10000;
  assert.throws(()=>validateCapacity(corrupted,route),/monthlyStarts/);
});
