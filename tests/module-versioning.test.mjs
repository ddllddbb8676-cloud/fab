import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleRevision,versionLocalModules} from '../scripts/versioned-modules.mjs';

test('a transitive module or build change invalidates the complete graph while line endings and file order do not',()=>{
  const sources=[['main.js',"import './protocol.js';\n"],['protocol.js','export const v=20;\n']];
  const revision=moduleRevision(sources,'build');
  assert.equal(moduleRevision(sources.toReversed().map(([name,source])=>[name,source.replaceAll('\n','\r\n')]),'build'),revision);
  assert.notEqual(moduleRevision([sources[0],['protocol.js','export const v=21;\n']],'build'),revision);
  assert.notEqual(moduleRevision(sources,'different build'),revision);
});

test('static imports, re-exports, dynamic imports and worker URLs all select the same build',()=>{
  const source=`import {a} from './a.js'; export {b} from "./b.js"; import './c.js';
const later=import('../more.js'); const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
import * as THREE from 'three'; const file='/api/config'; const asset='https://example.com/library.js';`;
  const revised=versionLocalModules(source,'abcdef123456');
  for(const file of ['./a.js','./b.js','./c.js','../more.js','./worker.js'])assert.ok(revised.includes(file+'?v=abcdef123456'));
  assert.match(revised,/from 'three'/);assert.match(revised,/'\/api\/config'/);assert.match(revised,/'https:\/\/example.com\/library.js'/);
  assert.equal(versionLocalModules(revised,'abcdef123456'),revised,'does not duplicate a version suffix');
});
