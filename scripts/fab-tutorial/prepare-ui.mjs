// Prepare actual emoji/menu assets and 3D click targets without a browser.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createCanvas,GlobalFonts,loadImage} from '../../outputs/fab-promo-2026-11-02/tools/node_modules/@napi-rs/canvas/index.js';
import {EMOTE_MENU} from '../../src/emotes.js';
import {machines} from '../../src/layout.js';
import {getEmoApproach} from '../../src/emo-interaction.js';
import {stockers} from '../../src/stocker-layout.js';
const root=new URL('../../outputs/tutorial-20261112/',import.meta.url);
await mkdir(new URL('ui/',root),{recursive:true});
GlobalFonts.registerFromPath('C:/Windows/Fonts/seguiemj.ttf','Segoe UI Emoji');
for(const [i,emote] of EMOTE_MENU.entries()){
  const canvas=createCanvas(110,110),ctx=canvas.getContext('2d');
  ctx.font='86px "Segoe UI Emoji"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emote.emoji,55,57);
  await writeFile(new URL(`ui/emote-${i}.png`,root),canvas.toBuffer('image/png'));
}
const icon=createCanvas(128,128);
icon.getContext('2d').drawImage(await loadImage(fileURLToPath(new URL('../../assets/social/fab-icon.svg',import.meta.url))),0,0,128,128);
await writeFile(new URL('ui/icon.png',root),icon.toBuffer('image/png'));
const machine=machines.find(m=>m.bayId===4&&m.sign===1&&m.column===5);
await writeFile(new URL('targets.json',root),JSON.stringify({emo:getEmoApproach(machine).button,port:machine.ports[1],in:stockers[0].ports[0],out:stockers[0].ports[1]},null,2));
console.log('TUTORIAL_UI_READY',EMOTE_MENU.length);
