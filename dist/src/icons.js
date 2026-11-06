import {suitColor} from './cosmetics-catalog.js?v=35964c9802b1';

export function itemIcon(id) {
  let drawing = '';
  if (id.startsWith('eyes')) {
    drawing = '<ellipse cx="24" cy="24" rx="21" ry="21" fill="#e8c9b5"/><path d="M8 29q16-5 32 0l-3 13H11z" fill="#f0f6f2" stroke="#bad0d3"/>';
    if (id === 'eyes-smile') drawing += '<path d="M10 23q5-9 10 0m8 0q5-9 10 0" stroke="#413531" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    else if (id === 'eyes-squeeze') drawing += '<path d="m10 15 9 6-9 6m28-12-9 6 9 6" stroke="#413531" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (id === 'eyes-flat') drawing += '<path d="M9 21h11m8 0h11" stroke="#413531" stroke-width="2.5" stroke-linecap="round"/>';
    else if (id === 'eyes-angry') drawing += '<path d="m9 16 11 5H9zm30 0-11 5h11z" fill="#faf5ed"/><path d="m9 12 12 5m18-5-12 5m-18 1 11 4m19-4-11 4" stroke="#413531" stroke-width="2.4"/><g fill="#413531"><circle cx="16" cy="22" r="2"/><circle cx="32" cy="22" r="2"/></g>';
    else if (id === 'eyes-cry') drawing += '<path d="m9 14 11-3m8 0 11 3M10 21q5 5 10 0m8 0q5 5 10 0" stroke="#584339" stroke-width="2" fill="none"/><path d="M11 23v15m26-15v15" stroke="#87ccdf" stroke-width="4"/><path d="M10 24v11m26-11v11" stroke="#e2f8fa"/>';
    else if (id === 'eyes-sideeye') drawing += '<path d="M9 19h12v6H9zm18 0h12v6H27z" fill="#fbf7ed"/><path d="M9 18h12m6 0h12m-30-6h12m6 2h12" stroke="#413531" stroke-width="2"/><path d="M18 20v4m18-4v4" stroke="#413531" stroke-width="3"/>';
    else if (id === 'eyes-wink') drawing += '<ellipse cx="15" cy="20" rx="4.5" ry="6" fill="#413531"/><circle cx="14" cy="18" r="1.4" fill="#fff9eb"/><path d="M28 23q5-9 10 0" stroke="#413531" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    else {
      const rx = id === 'eyes-default' ? 2.5 : 4.5, ry = id === 'eyes-default' ? 3.5 : 6;
      drawing += `<ellipse cx="15" cy="20" rx="${rx}" ry="${ry}" fill="#413531"/><ellipse cx="33" cy="20" rx="${rx}" ry="${ry}" fill="#413531"/><g fill="#fff9e9"><circle cx="14" cy="18" r="1.3"/><circle cx="32" cy="18" r="1.3"/></g>`;
      if (id === 'eyes-sparkle') drawing += '<path d="m8 7 1.5 3L13 11l-3.5 1L8 15l-1-3-3-1 3-1z" fill="#f6d68e"/><g fill="#fff9e9"><circle cx="16" cy="23" r="1"/><circle cx="34" cy="23" r="1"/></g>';
    }
  } else if (id.startsWith('suit')) {
    const color = id === 'suit-default' ? '#b4cbd3' : id === 'suit-black' ? '#38454f' : suitColor({suit:id});
    drawing = `<path d="m15 17-8 7 4 12 5-4v10h16V32l5 4 4-12-8-7" fill="${color}" stroke="#718790" stroke-width="1.5"/><ellipse cx="24" cy="12" rx="10" ry="10" fill="${color}" stroke="#718790"/><ellipse cx="24" cy="13" rx="6" ry="5" fill="#e8c8b4"/><path d="M24 23v18" stroke="#91a6ad"/>`;
  } else if (id.startsWith('helmet')) {
    const color = {'helmet-red':'#e65350','helmet-blue':'#4c88db'}[id] ?? (id.endsWith('white') ? '#f2f6f3' : '#ef9b45');
    drawing = `<path d="M9 30v-6a15 15 0 0 1 30 0v6z" fill="${color}" stroke="#8a9da5" stroke-width="1.5"/><path d="M21 10v19h6V10" fill="${color}" stroke="#a9b9bd"/><path d="M5 29h38v5H5z" fill="${color}" stroke="#8a9da5" stroke-width="1.5"/>`;
  } else if (id === 'cat-ears') {
    drawing='<path d="M5 37 8 5q1-3 4 0l14 23M43 37 40 5q-1-3-4 0L22 28" fill="#463e4c" stroke="#463e4c" stroke-width="4" stroke-linejoin="round"/><path d="m10 28 2-17 9 17m17 0-2-17-9 17" fill="#f995b5"/>';
  } else if (id === 'puppy-ears') {
    drawing='<path d="M16 6C3 8 0 30 7 39c5 6 15 2 12-7C15 22 13 16 16 6M32 6c13 2 16 24 9 33-5 6-15 2-12-7 4-10 6-16 3-26" fill="#c98b52"/>';
  } else if (id === 'moon-cap') {
    drawing='<path d="M6 34C4 12 18 3 30 7q15 6 13 24l-6 1Q36 18 29 23l5 11" fill="#b19be9"/><path d="M6 32h28v7H6z" fill="#fff0cf" stroke="#d2c3a4"/><circle cx="41" cy="32" r="5" fill="#f4cf66"/><path d="M20 12c-7 0-9 11-1 13q5 1 7-3c-8 1-10-6-6-10" fill="#f4cf66"/>';
  } else if (id === 'flower-glasses') {
    for(const x of [13,35]){for(let n=0;n<7;n++){const a=n/7*Math.PI*2;drawing+=`<circle cx="${x+Math.cos(a)*9}" cy="${24+Math.sin(a)*9}" r="4" fill="#ffce51"/>`;}drawing+=`<circle cx="${x}" cy="24" r="7" fill="#e5f1ec" fill-opacity=".5" stroke="#f4a04b" stroke-width="2.4"/>`;}
    drawing+='<path d="M22 23h4" stroke="#f4a04b" stroke-width="2.4"/>';
  } else if (id === 'spiral-glasses') {
    drawing='<g fill="#e5f1ec" fill-opacity=".4" stroke="#78cfa9" stroke-width="3"><circle cx="13" cy="24" r="10"/><circle cx="35" cy="24" r="10"/><path d="M23 23h2"/></g><g fill="none" stroke="#9a76d1" stroke-width="1.8" stroke-linecap="round"><path d="M13 24c-3 0-3-4 0-4 7 0 7 10 0 10-10 0-10-15 1-15M35 24c-3 0-3-4 0-4 7 0 7 10 0 10-10 0-10-15 1-15"/></g>';
  } else if (id === 'bunny-ears') {
    drawing='<ellipse cx="14" cy="25" rx="7" ry="21" fill="#f5eeee" stroke="#c4c9c6"/><ellipse cx="14" cy="24" rx="3.5" ry="15" fill="#ed9bb6"/><path d="M27 45c-2-14-1-29 5-38 6-8 14 0 12 8-1 6-6 7-8 2-3 10-2 20-2 28z" fill="#f5eeee" stroke="#c4c9c6"/><ellipse cx="31" cy="29" rx="3" ry="11" fill="#ed9bb6"/>';
  } else if (id === 'baby-chick') {
    drawing='<ellipse cx="24" cy="31" rx="16" ry="12" fill="#ffdb63"/><circle cx="24" cy="17" r="12" fill="#ffdb63"/><ellipse cx="10" cy="31" rx="5" ry="8" fill="#ffe791"/><ellipse cx="38" cy="31" rx="5" ry="8" fill="#ffe791"/><g fill="#34494e"><circle cx="20" cy="15" r="1.5"/><circle cx="28" cy="15" r="1.5"/></g><ellipse cx="24" cy="21" rx="5" ry="2.5" fill="#ef9b42"/><path d="M13 43h7m8 0h7" stroke="#ef9b42" stroke-width="4" stroke-linecap="round"/>';
  } else if (id === 'heart-glasses') {
    drawing='<g fill="#ffe8ef" fill-opacity=".35" stroke="#ff1685" stroke-width="2.6" stroke-linejoin="round"><path d="M13 20C5 9 0 25 13 34c13-9 8-25 0-14zM35 20c-8-11-13 5 0 14 13-9 8-25 0-14z"/><path d="M22 22h4M1 21l4 2m38 0 4-2" fill="none"/></g>';
  } else if (['glasses', 'goggles', 'sunglasses'].includes(id)) {
    const fill = id === 'sunglasses' ? '#253b48' : '#c4e2e9';
    if (id === 'goggles') drawing = '<path d="m4 17 8-3h24l8 3-3 18H28l-4-5-4 5H7z" fill="#b7dce6" fill-opacity=".55" stroke="#8ca6ae" stroke-width="3"/><path d="m10 18 7 13m11-13 7 13" stroke="#f3f9fa" stroke-width="2"/>';
    else drawing = `<g fill="${fill}" fill-opacity="${id === 'glasses' ? '.4' : '1'}" stroke="#3c505b" stroke-width="2.4"><rect x="5" y="17" width="16" height="14" rx="5"/><rect x="27" y="17" width="16" height="14" rx="5"/><path d="M21 22h6M1 18l4 3m38 0 4-3" fill="none"/></g>`;
  } else if (id === 'sprout') drawing = '<path d="M24 41V22" stroke="#529665" stroke-width="3"/><path d="M24 29C9 30 5 18 10 12c12 1 16 7 14 17" fill="#7bbd76"/><path d="M24 22C22 10 35 5 42 9c-1 13-9 18-18 13" fill="#4b9d70"/>';
  else if (id === 'crown') drawing = '<path d="m7 15 10 9 7-15 8 15 10-9-5 24H12z" fill="#e6bc59" stroke="#b98c31"/><path d="M13 33h23" stroke="#fff0ac" stroke-width="2"/><circle cx="24" cy="28" r="3" fill="#559fa6"/>';
  else {
    const palette={'bag-axolotl':['#f2b5d4','#e982b7'],'bag-peach':['#f5c3be','#e9a1a4'],'bag-jellyfish':['#bddfee','#91bddf'],'bag-cloud':['#e2ebf0','#92bedf'],'bag-gamepad':['#c9b8e5','#89cdb9'],'bag-whale':['#a8d3ec','#82b5d9']}[id]||['#c6e0e2','#dce9e8'];
    const pattern = `<defs><pattern id="grid-${id}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${palette[0]}" fill-opacity="${palette[0]==='#c6e0e2'?'.45':'.7'}"/><path d="M5 0H0V5" fill="none" stroke="#8ba9b1" stroke-width=".7"/></pattern></defs>`;
    let shape;
    if (id === 'bag-star') shape = '<path d="m24 4 7 13 14 2-10 11 2 14-13-6-13 6 2-14L3 19l14-2z" stroke-linejoin="round"/><g fill="#557971" stroke="none"><ellipse cx="19" cy="25" rx="1.4" ry="2"/><ellipse cx="29" cy="25" rx="1.4" ry="2"/></g><path d="M20 30q4 4 8 0" fill="none" stroke="#557971" stroke-width="1.4"/><path d="M14 29h3m14 0h3" stroke="#ed9bb6" stroke-width="2" stroke-linecap="round"/>';
    else if (id === 'bag-axolotl') shape = '<path d="M11 17 4 12m6 14H2m9 8-7 5m33-22 7-5m-6 14h8m-9 8 7 5" fill="none" stroke="#f17fab" stroke-width="5" stroke-linecap="round"/><ellipse cx="24" cy="25" rx="15" ry="18"/><g fill="#37424b" stroke="none"><circle cx="18" cy="24" r="1.5"/><circle cx="30" cy="24" r="1.5"/></g><path d="M20 30q4 4 8 0" fill="none" stroke="#37424b" stroke-width="1.4"/>';
    else if (id === 'bag-peach') shape = '<path d="M24 11C6 1 0 26 10 38q7 8 14 3 7 5 14-3C48 26 42 1 24 11z"/><path d="M24 13q5 15 0 27" fill="none"/><path d="M23 11Q23 0 37 4q-1 10-14 7" fill="#81be8f" stroke="#81be8f"/>';
    else if (id === 'bag-jellyfish') shape = '<path d="M9 28q-5 7 0 11m8-11q-5 7 0 15m7-15q-5 7 0 16m7-16q-5 7 0 15m8-15q-5 7 0 11" fill="none" stroke="#c2afea" stroke-width="3" stroke-linecap="round"/><path d="M4 28C4 0 44 0 44 28q-5 5-10 0-5 5-10 0-5 5-10 0-5 5-10 0z"/><g fill="#37424b" stroke="none"><circle cx="18" cy="20" r="1.5"/><circle cx="30" cy="20" r="1.5"/></g>';
    else if (id === 'bag-cloud') shape = '<path d="M12 39C-3 39 0 20 12 21c-2-14 17-18 20-6 10-5 15 4 11 11 8 8 1 14-7 13z"/><path d="M29 24a6 6 0 0 1 12 0" fill="none" stroke="#f38fa9" stroke-width="2"/><path d="M31 24a4 4 0 0 1 8 0" fill="none" stroke="#f6d465" stroke-width="2"/><path d="M33 24a2 2 0 0 1 4 0" fill="none" stroke="#91d3ce" stroke-width="2"/><g fill="#37424b" stroke="none"><circle cx="15" cy="29" r="1.5"/><circle cx="27" cy="29" r="1.5"/></g><path d="M18 33q3 3 6 0" fill="none" stroke="#37424b" stroke-width="1.3"/>';
    else if (id === 'bag-gamepad') shape = '<path d="M13 12C6 11 3 23 3 35q0 13 13 0h16q13 13 13 0c0-12-3-24-10-23z"/><path d="M14 18v14m-7-7h14" stroke="#447d85" stroke-width="4"/><g stroke="none"><circle cx="34" cy="19" r="3" fill="#f5cf69"/><circle cx="39" cy="25" r="3" fill="#ee94bc"/><circle cx="29" cy="25" r="3" fill="#8fcddd"/><circle cx="34" cy="31" r="3" fill="#b192da"/></g>';
    else if (id === 'bag-whale') shape = '<path d="M5 37C-4 24 7 7 21 15q10 4 13 2l1-5q-9-6-2-9l6 5q8-7 8 0l-5 6q0 28-24 29z"/><path d="M5 35q9-7 20 1l-3 6Q8 45 5 35" fill="#f5ecd8" fill-opacity=".6"/><ellipse cx="29" cy="33" rx="6" ry="3" fill="#82b5d9" transform="rotate(30 29 33)"/><g fill="#37424b" stroke="none"><circle cx="10" cy="26" r="1.5"/><circle cx="20" cy="26" r="1.5"/></g>';
    else if (id === 'bag-turtle') shape = '<ellipse cx="24" cy="25" rx="16" ry="19"/><path d="m24 12 9 6v14l-9 7-9-7V18zM8 20l7-2m18 0 7 2M8 31l7 1m18 0 7-1" fill="none" stroke="#9ab7ad" stroke-width="1.5"/>';
    else if (id === 'bag-wings') shape = '<path d="M23 37C6 36 4 20 6 8c8 2 16 12 17 19m2 10c17-1 19-17 17-29-8 2-16 12-17 19"/><path d="M12 18 21 33m15-15-9 15" fill="none"/>';
    else if (id === 'bag-bear') shape = '<circle cx="13" cy="11" r="7"/><circle cx="35" cy="11" r="7"/><rect x="9" y="13" width="30" height="29" rx="13"/><g fill="#7c9aa2" stroke="none"><circle cx="18" cy="26" r="1.6"/><circle cx="30" cy="26" r="1.6"/><ellipse cx="24" cy="32" rx="2" ry="1.5"/></g>';
    else shape = '<path d="M17 12V7h14v5" fill="none"/><rect x="9" y="12" width="30" height="32" rx="7"/><rect x="13" y="29" width="22" height="11" rx="3"/>';
    drawing = pattern + `<g fill="url(#grid-${id})" stroke="${palette[1]}" stroke-width="2">${shape}</g>`;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${drawing}</svg>`;
}
