import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='outputs/stocker-clip-20261116';
await mkdir(root,{recursive:true});
const original=await readFile('src/main.js','utf8');
let main=original.replaceAll('\r\n','\n');
function replaceOnce(a,b){if(!main.includes(a))throw Error('Source boundary changed: '+a);main=main.replace(a,b);}
replaceOnce('const connectionConfig = await (window.__fabConnectionConfig||multiplayerConfiguration());','const connectionConfig = null; // Isolated local filming: no account or game-server connection.');
main=main.replaceAll("from './","from '/src/").replaceAll("import('./","import('/src/");
main='let filmReady=false,filmRecording=false,filmStepping=false,filmTime=0,filmStarted=0,filmCueAt=null,filmFrames=0,filmLog=[];\n'+main;
replaceOnce('function motionCue(kind, position) {',"function motionCue(kind, position) {\n  if(filmRecording && kind==='stocker-out' && filmCueAt===null) filmCueAt=filmTime;");
replaceOnce('function animate(now) {\n  requestAnimationFrame(animate);','function animate(now) {\n  if(filmRecording&&!filmStepping)return;\n  if(!filmRecording)requestAnimationFrame(animate);');
replaceOnce('  updateFrameBudget(now, frameMs);','  if(!filmReady)updateFrameBudget(now, frameMs);');
replaceOnce('  camera.updateMatrixWorld();\n  viewProjection.multiplyMatrices',`  if(filmReady){camera.position.set(.8,2.9,78.4);camera.lookAt(-4.8,2.0,83.3);camera.fov=55;camera.aspect=9/16;camera.updateProjectionMatrix();}
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices`);
replaceOnce('  renderer.render(scene, camera);',`  renderer.render(scene, camera);
  if(filmRecording){filmFrames++;const r=playActions.store.stockerState('STK01');const phase=playActions.store.carried?'carried':r.busy?'retrieving':r.out?'stocker-out':'stored';if(filmLog.at(-1)?.phase!==phase)filmLog.push({t:filmTime,phase});}`);
const tail=await readFile('scripts/stocker-clip/scene-tail.js','utf8');
main+='\n'+tail;
await writeFile(root+'/main-film.js',main);
let html=await readFile('index.html','utf8');
html=html.replace('<script type="module" src="/src/startup.js" data-fab-entry="/src/main.js"></script>',`<script type="module" src="/${root}/main-film.js"></script>`);
html=html.replace('</head>',`<style>body>*:not(#world):not(#film-tools){display:none!important}#world{position:fixed;inset:0}#world canvas{width:100%!important;height:100%!important}#film-tools{position:fixed;left:8px;bottom:8px;z-index:99999;background:#eaf5f2ed;padding:10px;border-radius:12px;color:#17434d;font:14px system-ui}#film-tools button{padding:8px;margin:2px}#film-status{max-width:340px}</style></head>`);
html=html.replace('</body>','<aside id="film-tools"><button id="film-reset">첫 화면</button><button id="film-test">OUT 시험</button><button id="film-still">화면 저장</button><button id="film-record" disabled>15초 촬영</button><p id="film-status" role="status">게임 화면 준비 중</p></aside></body>');
await writeFile(root+'/index.html',html);
await writeFile(root+'/provenance.json',JSON.stringify({sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mainSha256:createHash('sha256').update(original).digest('hex'),method:'Original game main renderer and playActions, isolated localhost, photo-mode canvas capture; fixed filming camera; same stocker sound asset',liveServer:false,productionChanges:false},null,2));
console.log('STOCKER_FILM_PREPARED',root);
