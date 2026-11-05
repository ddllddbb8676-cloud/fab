import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedWorldView} from '../src/shared-world-view.js';
import {ports} from '../src/layout.js';
import {createRoom} from '../server/room-engine.js';

test('display counts include the local visitor and all 34 automated characters through joins and departures',()=>{
  const room=createRoom(),counts=[];let otherPeople=[];
  const view=createSharedWorldView({fleet:{vehicles:[]},store:{reset(){},synchronize(){}},
    destruction:{resetAll(){},state:{destroyedIds:[]}},onPeople:rows=>{otherPeople=rows;},onCue(){},onCount:(real,total)=>counts.push([real,total])});
  room.join('self');view.welcome('self');view.apply(room.snapshot(true),true);
  assert.deepEqual(counts.at(-1),[1,35]);assert.equal(otherPeople.length,34);
  room.join('other');view.apply(room.snapshot(true));assert.deepEqual(counts.at(-1),[2,36]);
  room.remove('other');view.apply(room.snapshot(true));assert.deepEqual(counts.at(-1),[1,35]);
});

function fixture(options) {
  const car={x:0,z:0,yaw:0},foup={x:0,y:3,z:0,yaw:0};
  const fleet={vehicles:[{id:0,state:{car,foup,gripperY:1}}]};
  const view=createSharedWorldView({fleet,store:{reset(){},synchronize(){},interpolate(){}},destruction:{resetAll(){},state:{destroyedIds:[]}},onPeople(){},onCue(){},onCount(){}});
  const frame=(t,x=2*t,yaw=0)=>({t,broken:[],people:[],count:1,events:[],totals:{},foups:[],fleet:[[0,x,0,yaw,x,3,0,yaw,1,4,false,0,ports[0].id,ports[1].id,false,true,false,'self',false,0]]});
  view.welcome('self',options);view.apply(frame(0),true);return {view,fleet,frame};
}

test('slow rendering keeps OHT on real elapsed time instead of accumulating clipped simulation lag',()=>{
  for(const hz of [10,15,30,60]){
    const {view,fleet,frame}=fixture();let next=1,previous=0;const speeds=[];
    for(let i=1;i<=hz*15;i++){
      const at=i/hz;while(next*.2<=at){view.apply(frame(next*.2));next++;}
      view.update(Math.min(1/hz,.05),1/hz);
      const x=fleet.vehicles[0].state.car.x;if(at>3)speeds.push((x-previous)*hz);previous=x;
    }
    assert.ok(speeds.every(v=>Math.abs(v-2)<.00001),`${hz} Hz: speed range ${Math.min(...speeds)}..${Math.max(...speeds)}`);
    assert.ok(Math.abs(previous-29.4)<.21,'never fall seconds behind the received stream');
  }
});

test('HTTP-sized snapshot gaps play continuously without increasing request frequency',()=>{
  const {view,fleet,frame}=fixture({transport:'https'});let next=.6,previous=0;const speeds=[];
  for(let i=1;i<=60*12;i++){
    const at=i/60;if(at>=next){view.apply(frame(next));next+=next>3.5&&next<3.7?.8:.6;}
    view.update(1/60);const x=fleet.vehicles[0].state.car.x;if(at>2)speeds.push((x-previous)*60);previous=x;
  }
  assert.ok(speeds.every(v=>Math.abs(v-2)<.00001),'no recurring stops between HTTP responses');
});
test('5 Hz OHT packets with jitter produce constant render speed at 30/60/120 Hz',()=>{
  for(const hz of [30,60,120]) {
    const {view,fleet,frame}=fixture(),velocities=[];let next=1,previous=0;
    for(let i=1;i<=hz*5;i++) {
      const now=i/hz;
      while(next*.2+[0,.04,-.025,.015][next%4]<=now){view.apply(frame(next*.2));next++;}
      view.update(1/hz);const x=fleet.vehicles[0].state.car.x;
      if(now>1)velocities.push((x-previous)*hz);previous=x;
      assert.equal(fleet.vehicles[0].state.foup.x,x,'FOUP and vehicle share one timeline');
    }
    assert.ok(velocities.every(v=>Math.abs(v-2)<1e-8),'no packet-driven acceleration/braking');
  }
});
test('OHT interpolation wraps heading and freezes safely when packets stop',()=>{
  const {view,fleet,frame}=fixture();view.apply(frame(.2,.4,Math.PI-.02));view.apply(frame(.4,.8,-Math.PI+.02));
  for(let i=0;i<35;i++)view.update(.02);
  assert.ok(Math.abs(Math.abs(fleet.vehicles[0].state.car.yaw)-Math.PI)<.021);
  for(let i=0;i<100;i++)view.update(.02);
  assert.equal(fleet.vehicles[0].state.car.x,.8,'no unbounded extrapolation through stops or junctions');
});

test('returning to a stale OHT stream discards old samples without extrapolating through a stop',()=>{
  const {view,fleet,frame}=fixture();view.apply(frame(.2));view.update(.2);
  view.apply(frame(9,18));view.update(.016);
  assert.equal(fleet.vehicles[0].state.car.x,18,'resume at the new known vehicle, not an expired sample');
  view.apply(frame(9.2,18));for(let i=0;i<60;i++)view.update(.016);
  assert.equal(fleet.vehicles[0].state.car.x,18,'a stopped OHT never drifts forward');
});
