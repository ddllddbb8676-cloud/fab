import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRankingDashboard} from '../admin/rankings.js';
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.disabled=false;this.open=false;this._text='';}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 append(...nodes){for(const n of nodes)this.children.push(...(n.tagName==='#fragment'?n.children:[n]));}replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}addEventListener(k,fn){this.events[k]=fn;}
}
const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
function fixture(fetcher){const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));const document={hidden:false,getElementById:id=>{assert.ok(nodes.has(id),id);return nodes.get(id);},createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')};return {ui:createRankingDashboard(document,{fetcher}),get:id=>nodes.get(id),document};}
const data=(page=1)=>({total:53,page,pages:2,pageSize:50,generatedAt:'2026-11-10T04:00:00Z',visitTrackingStartedAt:'2026-11-10T03:00:00Z',rows:Array.from({length:page===1?50:3},(_,i)=>({rank:(page-1)*50+i+1,name:i===0?'<img src=x onerror=alert(1)>':'유저'+i,brokenCount:100-i,repairedCount:i,joinedDate:null,visitCount:i,googleLinked:i===0?true:i===1?null:false}))});
test('lazy private ranking UI renders seven text-only columns, fifty rows and explicit unknown dates/count scope',async()=>{
 let calls=0;const f=fixture(async(url,options)=>{calls++;assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');return Response.json(data());});
 await f.ui.refresh();assert.equal(calls,0);f.get('ranking-panel').open=true;await f.ui.refresh();assert.equal(calls,1);const rows=f.get('ranking-rows').children;assert.equal(rows.length,50);assert.equal(rows[0].children.length,7);assert.equal(rows[0].children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(rows[0].children[1].children.length,0);assert.equal(rows[0].children[4].textContent,'미확인');assert.equal(rows[0].children[5].textContent,'0회');assert.equal(rows[0].children[6].textContent,'연동');assert.equal(rows[1].children[6].textContent,'확인 불가');assert.match(f.get('ranking-note').textContent,/이전 횟수는 포함하지/);assert.match(f.get('ranking-note').textContent,/30분/);assert.equal(f.get('ranking-prev').disabled,true);assert.equal(f.get('ranking-next').disabled,false);
 f.document.hidden=true;await f.ui.refresh();assert.equal(calls,1);
});
test('page navigation preserves global ranks, failed next page keeps current page and auth loss clears names',async()=>{
 let status=200;const f=fixture(async url=>status===200?Response.json(data(Number(new URL(url,'https://test').searchParams.get('page')))):new Response(null,{status}));f.get('ranking-panel').open=true;await f.ui.refresh();status=503;await f.get('ranking-next').events.click();assert.match(f.get('ranking-page').textContent,/1 \/ 2/);assert.match(f.get('ranking-status').textContent,/이전 목록/);assert.equal(f.get('ranking-rows').children.length,50);status=200;await f.get('ranking-next').events.click();assert.equal(f.get('ranking-rows').children.length,3);assert.equal(f.get('ranking-rows').children[0].children[0].textContent,'51');assert.equal(f.get('ranking-next').disabled,true);status=403;await f.ui.refresh();assert.equal(f.get('ranking-rows').children.length,0);assert.match(f.get('ranking-status').textContent,/운영자/);
});
test('an old response cannot repopulate private rows after access is cleared',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));f.get('ranking-panel').open=true;const pending=f.ui.refresh();assert.equal(f.get('ranking-refresh').disabled,true);f.ui.clear();resolve(Response.json(data()));await pending;assert.equal(f.get('ranking-rows').children.length,0);assert.equal(f.get('ranking-total').textContent,'—');
});
