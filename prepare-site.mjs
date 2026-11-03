import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {moduleRevision,versionLocalModules} from './scripts/versioned-modules.mjs';
import {build} from 'esbuild';
const root = new URL('.', import.meta.url);
const dist = new URL('./dist/', root);
for (const dir of ['src/', 'docs/', 'vendor/nipplejs/', 'vendor/three/', 'vendor/addons/controls/', 'vendor/addons/environments/', 'vendor/addons/objects/', 'vendor/addons/lights/']) await mkdir(new URL(dir, dist), { recursive: true });
let html = await readFile(new URL('index.html', root), 'utf8');
html = html.replace('/node_modules/three/build/three.module.js', '/vendor/three/three.module.js').replace('/node_modules/three/examples/jsm/', '/vendor/addons/');
html = html.replace('/node_modules/nipplejs/dist/index.mjs', '/vendor/nipplejs/index.mjs');
// The loading screen and its failure handler arrive in the HTML itself. Fonts
// load with media=print until ready, so they cannot block this first paint.
for(const name of ['style.css','equipment-directory.css','wardrobe.css','nickname.css','chip-rewards.css']){
  const css=await readFile(new URL('src/'+name,root),'utf8');
  if(/@import\b/i.test(css))throw new Error('Startup CSS must not import blocking styles: '+name);
  html=html.replace(`<link rel="stylesheet" href="/src/${name}">`,`<style data-source="${name}">${css}</style>`);
}
const bootstrap=await build({entryPoints:[fileURLToPath(new URL('src/startup.js',root))],bundle:true,format:'iife',platform:'browser',target:'safari15',write:false,minify:true,legalComments:'none'});
const sources=await Promise.all((await readdir(new URL('src/',root))).filter(name=>name.endsWith('.js')).map(async name=>[name,await readFile(new URL('src/'+name,root),'utf8')]));
const revision=moduleRevision(sources,await readFile(new URL('prepare-site.mjs',root),'utf8')+await readFile(new URL('scripts/versioned-modules.mjs',root),'utf8'));
const startupCode=bootstrap.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
html=html.replace('<script type="module" src="/src/startup.js" data-fab-entry="/src/main.js"></script>',`<script data-fab-entry="/src/main.js?v=${revision}">${startupCode}</script>`);
await writeFile(new URL('index.html', dist), html);
for(const name of ['startup.js','startup-controller.js','startup-signals.js','room-connection.js','room-channel.js','room-config.js','http-room-socket.js'])await copyFile(new URL('src/'+name,root),new URL('src/'+name,dist));
for (const name of ['main.js', 'layout.js', 'transport.js', 'rail-network.js', 'network-transport.js', 'avatar.js', 'spatial-batch.js', 'walking.js', 'posture.js', 'foup-play.js', 'play-actions.js', 'visitor-name.js', 'explorer.js', 'view-controls.js', 'tour-route.js', 'transfer-view.js', 'runtime-obstacles.js', 'ambience.js', 'equipment-visibility.js', 'emo-controls.js', 'emo-interaction.js', 'equipment-destruction.js', 'air-shower.js', 'entry-sequence.js', 'equipment-catalog.js', 'equipment-labels.js', 'equipment-directory.js', 'equipment-directory.css', 'bay-lighting.js', 'style.css']) await copyFile(new URL('src/' + name, root), new URL('src/' + name, dist));
await copyFile(new URL('src/residents.js', root), new URL('src/residents.js', dist));
await copyFile(new URL('src/scene-depth.js', root), new URL('src/scene-depth.js', dist));
await copyFile(new URL('src/playful-accessories.js', root), new URL('src/playful-accessories.js', dist));
await copyFile(new URL('src/foup-debris.js', root), new URL('src/foup-debris.js', dist));
for(const name of ['destruction-titles.js','title-picker.js'])await copyFile(new URL('src/'+name,root),new URL('src/'+name,dist));
for(const name of ['repair-ranking.js','repair-ranking-worker.js'])await copyFile(new URL('src/'+name,root),new URL('src/'+name,dist));
for (const name of ['locomotion.js', 'touch-joystick.js', 'avatar-nameplate.js','cosmetics-catalog.js','avatar-appearance.js','accessories.js','cute-accessories.js','face-styles.js','icons.js','wardrobe-ui.js','wardrobe-view.js','wardrobe.css','npc-outfits.js','wardrobe-notice.js','nickname-policy.js','nickname-ui.js','nickname.css','chip-rewards.js','chip-rewards.css']) await copyFile(new URL('src/' + name, root), new URL('src/' + name, dist));
await copyFile(new URL('node_modules/nipplejs/dist/index.mjs', root), new URL('vendor/nipplejs/index.mjs', dist));
// The npm 1.0.4 tarball omits LICENSE; preserve the notice from its release tag.
await copyFile(new URL('docs/licenses/nipplejs.txt', root), new URL('vendor/nipplejs/LICENSE.txt', dist));
for(const name of ['emotes.js','emote-view.js','safety-proximity.js','npc-navigation.js']) await copyFile(new URL('src/'+name,root),new URL('src/'+name,dist));
for(const name of ['room-population.js','safety-team.js','rest-area.js','rest-area-view.js','leaderboard.js','multiplayer.js','shared-protocol.js','shared-world-view.js','remote-people.js']) await copyFile(new URL('src/'+name,root),new URL('src/'+name,dist));
for (const name of ['three.module.js', 'three.core.js']) await copyFile(new URL('node_modules/three/build/' + name, root), new URL('vendor/three/' + name, dist));
for (const name of ['controls/OrbitControls.js', 'environments/RoomEnvironment.js', 'objects/Reflector.js', 'lights/RectAreaLightUniformsLib.js', 'lights/RectAreaLightTexturesLib.js']) await copyFile(new URL('node_modules/three/examples/jsm/' + name, root), new URL('vendor/addons/' + name, dist));
await copyFile(new URL('node_modules/three/LICENSE', root), new URL('vendor/three/LICENSE.txt', dist));
await copyFile(new URL('docs/capacity-plan.html', root), new URL('docs/capacity-plan.html', dist));
await copyFile(new URL('connection-check.html', root), new URL('connection-check.html', dist));
for(const name of (await readdir(new URL('src/',dist))).filter(name=>name.endsWith('.js'))){
  const file=new URL('src/'+name,dist);await writeFile(file,versionLocalModules(await readFile(file,'utf8'),revision));
}
console.log('Static Site ready: ' + fileURLToPath(dist));
