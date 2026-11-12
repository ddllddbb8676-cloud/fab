import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),out=new URL('outputs/tutorial-20261112/ui-revision/native/',root);
await mkdir(out,{recursive:true});
const original=await readFile(new URL('index.html',root),'utf8');
const html=original.replace(/<script type="module" src="\/src\/startup.js"[^>]*><\/script>/,
  '<script type="module" src="/scripts/fab-tutorial/native-ui.mjs"></script>');
if(html===original)throw Error('Production startup entry changed');
await writeFile(new URL('index.html',out),html);
const files=['index.html','src/style.css','src/wardrobe.css','src/world-events.css','src/cart-controls.js','src/owner-speech-ui.js','src/emote-strip.js','src/wardrobe-ui.js','src/safety-pass.js','scripts/fab-tutorial/native-ui.mjs'];
const hashes={};for(const name of files)hashes[name]=createHash('sha256').update(await readFile(new URL(name,root))).digest('hex');
await writeFile(new URL('provenance.json',out),JSON.stringify({method:'Shipped HTML/CSS and real UI component modules, isolated fixture inputs. No hand-drawn replacement controls.',files:hashes,productionNetwork:false,states:['default','emoji2','speech','menu','google','throw','oht','oht-climb','oht-descend','emo','repair','cartidle','cartmenu','cartload','cartquick','cartdriver','cartrider','safety','bay','gold','contest','shop','shoptrial','items','photo']},null,2));
console.log('NATIVE_UI_FIXTURE_READY');
